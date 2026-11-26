/**
 * Depth Anything in a dedicated worker: transformers.js, the model, its
 * pre and post processing and the normalization all run off the main
 * thread, so a three.js scene keeps its frames while depth runs. The page
 * sends RGBA pixels (ImageData, or anything with width, height and data)
 * and gets a DepthMap back, both buffers transferred.
 *
 * Weights: Depth Anything V2 small, Apache-2.0, fetched by transformers.js
 * from Hugging Face in the worker; nothing is bundled.
 */

import { spawnWorker, type Spawned, type SpawnOptions } from "@hackbuild/ai-env";
import type { DepthMap } from "./types.js";
import { withPin, type ModelRecord } from "@hackbuild/models";
import { VISION_RECORDS } from "./records.js";

/** Options for {@link depthWorker}: the transformers.js URLs, the depth model or record, the licence callback, device, dtype and worker rungs. */
export interface DepthWorkerOptions {
  /** transformers.js ESM URLs tried in order (transformersUrls() from @hackbuild/devices). */
  urls: readonly string[];
  /**
   * Default onnx-community/depth-anything-v2-small. Only models of the
   * registered depth records load, at their pinned commit, since Depth
   * Anything base and large carry CC-BY-NC-4.0 weights; pass `record` for
   * another model with its licence named.
   */
  modelId?: string;
  /** A depth record of your own: its modelId, revision and licence are used instead of the built in list. */
  record?: ModelRecord;
  /** Called once with the weight licence line before the model loads. Default console.info. */
  onLicence?: (line: string) => void;
  /** Default "webgpu". */
  device?: "webgpu" | "wasm";
  /** Default "fp16" on webgpu, "q8" on wasm. */
  dtype?: string;
  /** Worker rungs; module blob first by default. */
  spawn?: Pick<SpawnOptions, "prefer" | "Worker" | "createObjectURL" | "readyMs" | "prelude">;
}

/** RGBA pixels the page sends to the depth worker: ImageData, or anything with width, height and data. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

/** A depth model in a worker: the worker rung that started, the device, `estimate` and `dispose`. */
export interface DepthWorker {
  /** The worker rung that started (module-blob, classic-blob or inline). */
  readonly rung: Spawned["rung"];
  readonly device: "webgpu" | "wasm";
  estimate(image: Pixels): Promise<DepthMap>;
  dispose(): void;
}

/** The worker's source. It imports transformers.js at load and answers run messages. */
export const DEPTH_WORKER_SOURCE = `
let pipe = null;
let RawImage = null;
const norm = (out) => {
  const pd = out.predicted_depth;
  if (pd && pd.data && pd.dims && pd.dims.length >= 2) {
    const h = pd.dims[pd.dims.length - 2], w = pd.dims[pd.dims.length - 1];
    let mn = Infinity, mx = -Infinity;
    for (let i = 0; i < w * h; i++) { const v = pd.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }
    const inv = mx > mn ? 1 / (mx - mn) : 0;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = (pd.data[i] - mn) * inv;
    return { width: w, height: h, data, range: [mn, mx] };
  }
  const d = out.depth;
  if (!d) throw new Error("depth pipeline returned neither predicted_depth nor depth");
  const ch = d.channels || 1;
  const data = new Float32Array(d.width * d.height);
  for (let i = 0; i < data.length; i++) data[i] = d.data[i * ch] / 255;
  return { width: d.width, height: d.height, data, range: [0, 255] };
};
self.onmessage = async (ev) => {
  const m = ev.data;
  if (!m || typeof m !== "object" || !("op" in m)) return;
  try {
    if (m.op === "load") {
      let tjs = null, err = null;
      const load = self.__import || ((u) => import(u));
      for (const u of m.urls) { try { tjs = await load(u); break; } catch (e) { err = e; } }
      if (!tjs) throw err || new Error("no transformers.js url loaded");
      RawImage = tjs.RawImage;
      pipe = await tjs.pipeline("depth-estimation", m.modelId, { device: m.device, dtype: m.dtype, revision: m.revision });
      self.postMessage({ id: m.id, ok: true });
    } else if (m.op === "run") {
      if (!pipe) throw new Error("depth worker is not loaded");
      const img = new RawImage(new Uint8ClampedArray(m.data), m.width, m.height, 4);
      const d = norm(await pipe(img));
      self.postMessage({ id: m.id, ok: true, depth: d }, [d.data.buffer]);
    }
  } catch (e) {
    self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });
  }
};
`;

/** Spawns the worker and loads the model in it. */
export async function depthWorker(o: DepthWorkerOptions): Promise<DepthWorker> {
  const device = o.device ?? "webgpu";
  const { worker, rung } = await spawnWorker(DEPTH_WORKER_SOURCE, { prefer: ["module-blob", "classic-blob"], ...o.spawn });
  let next = 1;
  const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();
  worker.addEventListener("message", (ev: { data?: unknown }) => {
    const d = ev.data as { id?: number; ok?: boolean; error?: string; depth?: DepthMap } | undefined;
    if (!d || typeof d.id !== "number") return;
    const w = waiting.get(d.id);
    if (!w) return;
    waiting.delete(d.id);
    if (d.ok) w.resolve(d.depth);
    else w.reject(new Error(`depth worker: ${d.error ?? "error"}`));
  });
  // a worker that dies after startup rejects what is waiting instead of leaving estimate() pending
  worker.addEventListener("error", (ev: { message?: string }) => {
    for (const w of waiting.values()) w.reject(new Error(`depth worker crashed: ${ev.message ?? "error event"}`));
    waiting.clear();
  });
  const call = (msg: Record<string, unknown>, transfer: Transferable[] = []) =>
    new Promise<unknown>((resolve, reject) => {
      const id = next++;
      waiting.set(id, { resolve, reject });
      worker.postMessage({ ...msg, id }, transfer);
    });
  try {
    const rec = o.record ?? VISION_RECORDS.find((r) => r.provides.includes("depth") && r.source.modelId === (o.modelId ?? "onnx-community/depth-anything-v2-small"));
    if (!rec?.source.modelId) throw new Error(`depth worker: ${o.modelId} is not a registered depth record; pass record with its licence named`);
    const pinned = withPin(rec);
    (o.onLicence ?? ((l: string) => console.info(l)))(`model ${pinned.id}: weight licence ${pinned.licence}. the weights are not part of this library.`);
    await call({
      op: "load",
      urls: [...o.urls],
      modelId: pinned.source.modelId,
      revision: pinned.source.revision ?? "main",
      device,
      dtype: o.dtype ?? (device === "webgpu" ? "fp16" : "q8"),
    });
  } catch (e) {
    worker.terminate();
    throw e;
  }
  return {
    rung,
    device,
    async estimate(image) {
      const copy = new Uint8ClampedArray(image.data);
      return (await call({ op: "run", width: image.width, height: image.height, data: copy.buffer }, [copy.buffer])) as DepthMap;
    },
    dispose() {
      for (const w of waiting.values()) w.reject(new Error("depth worker disposed"));
      waiting.clear();
      worker.terminate();
    },
  };
}

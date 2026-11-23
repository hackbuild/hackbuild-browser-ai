/**
 * The vision calls. Each routes through the hub (`use`, `run`, `release`),
 * so webgpu models take the gpu lock and idle models fall out under the
 * budget. VLM calls also go through one serial chain (HACKLE vlmChain).
 * Landmarks walk a fallback chain of records: MediaPipe GPU, MediaPipe
 * CPU (both rungs of one record), then any other record for the same
 * capability, such as face-api.js.
 */

import type { OrtModel, TjsProvider } from "@hackbuild/devices";
import type { Hub, Loaded, ModelRecord, RunOptions, SizeClass, UseOptions } from "@hackbuild/models";
import { depthLoader, samLoader, vlmLoader } from "./loaders.js";
import { VISION_RECORDS } from "./records.js";
import type { DepthMap, Detection, Detector, ImageInput, LandmarkKind, Landmarker, Landmarks, Mask, Pixels, SegmentPrompt, Segmenter, Vlm } from "./types.js";
import { yoloDetector } from "./yolo.js";

/** Add the vision records and register the transformers.js loaders. MediaPipe and ort factories are provided by the app. */
export function attachVision(hub: Hub, tjs?: TjsProvider): void {
  hub.registry.add(...VISION_RECORDS);
  if (tjs) {
    tjs.loader("depth", depthLoader);
    tjs.loader("vision.caption", vlmLoader);
    tjs.loader("vision.ask", vlmLoader);
    tjs.loader("segment", samLoader);
  }
}

export interface CallOptions {
  /** A record id instead of routing by capability. */
  model?: string;
  /** Route to a smaller model: a size class, or a download cap in MB. */
  size?: SizeClass;
  maxMB?: number;
  signal?: AbortSignal;
  /** Scheduling around rendering: minimum interval, idle only, frame time budget, wait or skip (see the models hub). */
  schedule?: RunOptions;
}

async function withModel<T, R>(hub: Hub, what: string | { id: string }, fn: (v: T, l: Loaded<T>) => Promise<R>, o: CallOptions = {}): Promise<R> {
  const uo: UseOptions = {};
  if (o.signal) uo.signal = o.signal;
  if (o.size) uo.size = o.size;
  if (o.maxMB !== undefined) uo.maxMB = o.maxMB;
  const l = await hub.use<T>(what, uo);
  try {
    const ro: RunOptions = { ...(o.schedule ?? {}) };
    if (o.signal && !ro.signal) ro.signal = o.signal;
    return await hub.run(l, (v) => fn(v, l), ro);
  } finally {
    hub.release(l);
  }
}

const target = (cap: string, o: CallOptions) => (o.model ? { id: o.model } : cap);

export function depth(hub: Hub, image: ImageInput, o: CallOptions = {}): Promise<DepthMap> {
  return withModel<{ estimate(i: ImageInput): Promise<DepthMap> }, DepthMap>(hub, target("depth", o), (m) => m.estimate(image), o);
}

function asDetector(v: unknown, toPixels?: (img: unknown) => Pixels): Detector {
  if (v && typeof v === "object" && "sessions" in v) return yoloDetector(v as OrtModel, toPixels ? { toPixels } : {});
  return v as Detector;
}

export function detect(
  hub: Hub,
  image: ImageInput,
  o: CallOptions & { scoreThreshold?: number; maxResults?: number; timestamp?: number; toPixels?: (img: unknown) => Pixels } = {},
): Promise<Detection[]> {
  const opts: { scoreThreshold?: number; maxResults?: number; timestamp?: number } = {};
  if (o.scoreThreshold !== undefined) opts.scoreThreshold = o.scoreThreshold;
  if (o.maxResults !== undefined) opts.maxResults = o.maxResults;
  if (o.timestamp !== undefined) opts.timestamp = o.timestamp;
  return withModel<unknown, Detection[]>(hub, target("detect", o), (v) => asDetector(v, o.toPixels).detect(image, opts), o);
}

/** Point prompted masks (SlimSAM), or a person mask without a prompt (selfie segmenter). Best first. */
export function segment(hub: Hub, image: ImageInput, prompt?: SegmentPrompt, o: CallOptions = {}): Promise<Mask[]> {
  const cap = prompt?.points?.length ? "segment" : "segment.person";
  return withModel<Segmenter, Mask[]>(hub, target(cap, o), (m) => m.segment(image, prompt), o);
}

/** Records for a landmark kind in fallback order: the routed record first, then the rest. */
export function landmarkChain(hub: Hub, kind: LandmarkKind): ModelRecord[] {
  const cap = `landmarks.${kind}`;
  const all = hub.registry.find({ provides: cap, ...(hub.env ? { env: hub.env } : {}) });
  const first = hub.registry.route({ provides: cap, ...(hub.env ? { env: hub.env } : {}) });
  return first ? [first, ...all.filter((r) => r.id !== first.id)] : all;
}

/** Landmarks through the fallback chain. `failures` lists the records that failed before the one that answered. */
export async function landmarks(
  hub: Hub,
  kind: LandmarkKind,
  image: ImageInput,
  o: CallOptions & { timestamp?: number } = {},
): Promise<Landmarks & { failures: { id: string; error: string }[] }> {
  const failures: { id: string; error: string }[] = [];
  const chain = o.model ? [{ id: o.model }] : hub.registry.list().length ? landmarkChain(hub, kind) : [];
  const targets: (string | { id: string })[] = chain.length ? chain.map((r) => ({ id: r.id })) : [`landmarks.${kind}`];
  for (const t of targets) {
    try {
      const r = await withModel<Landmarker, Landmarks>(hub, t, (m) => m.detect(image, o.timestamp !== undefined ? { timestamp: o.timestamp } : {}), o);
      return { ...r, failures };
    } catch (e) {
      if ((e as { code?: string }).code === "skipped") throw e;
      failures.push({ id: typeof t === "string" ? t : t.id, error: e instanceof Error ? e.message : String(e) });
      if (o.signal?.aborted) break;
    }
  }
  throw Object.assign(new Error(`no ${kind} landmark model loaded: ${failures.map((f) => `${f.id} (${f.error})`).join("; ")}`), { failures });
}

/** Caption an image. VLM calls are serialized on one chain. */
export function caption(hub: Hub, image: ImageInput, o: CallOptions & { maxTokens?: number } = {}): Promise<string> {
  return hub.chain("vlm")(() => withModel<Vlm, string>(hub, target("vision.caption", o), (m) => m.ask(image, undefined, o.maxTokens ? { maxTokens: o.maxTokens } : {}), o));
}

export function ask(hub: Hub, image: ImageInput, question: string, o: CallOptions & { maxTokens?: number } = {}): Promise<string> {
  return hub.chain("vlm")(() => withModel<Vlm, string>(hub, target("vision.ask", o), (m) => m.ask(image, question, o.maxTokens ? { maxTokens: o.maxTokens } : {}), o));
}

/**
 * The vision calls. Each routes through the hub (`use`, `run`, `release`),
 * so webgpu models take the gpu lock and idle models fall out under the
 * budget. VLM calls also go through one serial chain.
 * Landmarks walk a fallback chain of records: MediaPipe GPU, MediaPipe
 * CPU (both rungs of one record), then any other record for the same
 * capability, such as face-api.js.
 */

import type { OrtModel, TjsProvider } from "@hackbuild/devices";
import type { Hub, Loaded, ModelRecord, RunOptions, SizeClass, UseOptions } from "@hackbuild/models";
import { depthLoader, samLoader, vlmLoader } from "./loaders.js";
import { fastSamSegmenter, type EverythingOptions, type EverythingSegmenter } from "./fastsam.js";
import { PICKER_RECORDS, VISION_RECORDS } from "./records.js";
import { hasPrompt } from "./segment.js";
import type { DepthMap, Detection, Instance, Detector, ImageInput, LandmarkKind, Landmarker, Landmarks, Mask, Pixels, SegmentOptions, SegmentPrompt, Segmenter, Vlm } from "./types.js";
import { DETECT_SIZES, yoloDetector, type DetectSize } from "./yolo.js";

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

/** Options for each vision call: a record id, a size class or MB cap to route to a smaller model, an abort signal and the hub's scheduling. */
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

/** A depth map of an image from the routed depth model (Depth Anything V2 small by default), loaded and released through the hub. */
export function depth(hub: Hub, image: ImageInput, o: CallOptions = {}): Promise<DepthMap> {
  return withModel<{ estimate(i: ImageInput): Promise<DepthMap> }, DepthMap>(hub, target("depth", o), (m) => m.estimate(image), o);
}

function asDetector(v: unknown, toPixels?: (img: unknown) => Pixels): Detector {
  if (v && typeof v === "object" && "sessions" in v) return yoloDetector(v as OrtModel, toPixels ? { toPixels } : {});
  return v as Detector;
}

/** Objects in an image from the routed detector (MediaPipe EfficientDet by default, or a YOLO ort model), loaded and released through the hub. */
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

/** Add a picker record to the hub's registry when it is missing, so a call that names it by id can load it. */
export function ensureRecord(hub: Hub, id: string): ModelRecord {
  const have = hub.registry.get(id);
  if (have) return have;
  const rec = PICKER_RECORDS.find((r) => r.id === id);
  if (!rec) throw new Error(`${id} is neither registered nor a picker record`);
  hub.registry.add(rec);
  return rec;
}

/**
 * Objects at a chosen detector size: YOLOv10 nano, small or medium
 * ({@link DETECT_SIZES}). Picking a size is the opt in to the AGPL-3.0
 * Ultralytics weights: the record is added to the registry on first use.
 * Boxes pass a per class NMS.
 */
export function detectAt(
  hub: Hub,
  image: ImageInput,
  size: DetectSize,
  o: Omit<CallOptions, "model" | "size"> & { scoreThreshold?: number; maxResults?: number; toPixels?: (img: unknown) => Pixels } = {},
): Promise<Detection[]> {
  const id = Object.hasOwn(DETECT_SIZES, size) ? DETECT_SIZES[size] : undefined;
  if (!id) return Promise.reject(new RangeError(`detector size ${String(size)}: pick n, s or m`));
  ensureRecord(hub, id);
  return detect(hub, image, { ...o, model: id });
}

function asEverything(v: unknown, toPixels?: (img: unknown) => Pixels): EverythingSegmenter {
  if (v && typeof v === "object" && "sessions" in v) return fastSamSegmenter(v as OrtModel, toPixels ? { toPixels } : {});
  return v as EverythingSegmenter;
}

/**
 * Every object in one pass (FastSAM-S by default): instances with a box,
 * score, area and mask, best first, after a class agnostic NMS. The
 * FastSAM record (AGPL-3.0 upstream) is added on first use unless `model`
 * names another record that provides "segment.everything".
 */
export function segmentEverything(
  hub: Hub,
  image: ImageInput,
  o: CallOptions & EverythingOptions & { toPixels?: (img: unknown) => Pixels } = {},
): Promise<Instance[]> {
  const { model, size, maxMB, signal, schedule, toPixels, ...eo } = o;
  const id = model ?? "fastsam-s";
  ensureRecord(hub, id);
  const co: CallOptions = { model: id };
  if (size) co.size = size;
  if (maxMB !== undefined) co.maxMB = maxMB;
  if (signal) co.signal = signal;
  if (schedule) co.schedule = schedule;
  return withModel<unknown, Instance[]>(hub, { id }, (v) => asEverything(v, toPixels).segmentAll(image, eo), co);
}

/**
 * Point, negative point and box prompted masks (SlimSAM), or a person mask
 * without a prompt (selfie segmenter). Best first. The image is encoded
 * once: pass `key` (an image hash) and your own `cache` to keep and drop
 * embeddings yourself.
 */
export function segment(hub: Hub, image: ImageInput, prompt?: SegmentPrompt, o: CallOptions & SegmentOptions = {}): Promise<Mask[]> {
  const cap = hasPrompt(prompt) ? "segment" : "segment.person";
  const so: SegmentOptions = {};
  if (o.key !== undefined) so.key = o.key;
  if (o.cache) so.cache = o.cache;
  return withModel<Segmenter, Mask[]>(hub, target(cap, o), (m) => m.segment(image, prompt, so), o);
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

/** Answer a question about an image with the routed vision language model. VLM calls are serialized on one chain. */
export function ask(hub: Hub, image: ImageInput, question: string, o: CallOptions & { maxTokens?: number } = {}): Promise<string> {
  return hub.chain("vlm")(() => withModel<Vlm, string>(hub, target("vision.ask", o), (m) => m.ask(image, question, o.maxTokens ? { maxTokens: o.maxTokens } : {}), o));
}

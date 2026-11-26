/**
 * A MediaPipe tasks-vision provider for the models hub. One wasm fileset
 * per page; one task per record, created with the GPU delegate on a
 * "webgl" rung and the CPU delegate on a "wasm" rung, so a failed GPU
 * delegate falls to the CPU one.
 * Results are turned into the package's Detector, Segmenter and
 * Landmarker shapes.
 */

import { importEsm } from "@hackbuild/ai-env";
import type { Factory } from "@hackbuild/models";
import type { WeightStore } from "@hackbuild/weights";
import type { Detector, Landmarker, Landmarks, Segmenter } from "./types.js";

/** The pinned @mediapipe/tasks-vision version, 1.2.3. */
export const TASKS_VISION = "1.2.3";

interface TaskClass {
  createFromOptions(fileset: unknown, opts: Record<string, unknown>): Promise<Record<string, (...a: unknown[]) => unknown>>;
}

/** The parts of @mediapipe/tasks-vision the provider touches. Tests pass a fake. */
export interface TasksVision {
  FilesetResolver: { forVisionTasks(base: string): Promise<unknown> };
  ObjectDetector?: TaskClass;
  ImageSegmenter?: TaskClass;
  FaceLandmarker?: TaskClass;
  HandLandmarker?: TaskClass;
  PoseLandmarker?: TaskClass;
  GestureRecognizer?: TaskClass;
}

/** The URL @mediapipe/tasks-vision is imported from, on jsDelivr. */
export function tasksVisionUrls(version = TASKS_VISION): string[] {
  return [`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/vision_bundle.mjs`];
}

/** The directory of the tasks-vision wasm fileset, on jsDelivr. */
export function tasksVisionWasm(version = TASKS_VISION): string {
  return `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`;
}

/** A loader that imports the pinned @mediapipe/tasks-vision at run time; pass it as `runtime` to {@link mediapipeProvider}. */
export const loadTasksVision = (version = TASKS_VISION) => () => importEsm<TasksVision>(tasksVisionUrls(version));

const CLASS: Record<string, keyof TasksVision> = {
  detect: "ObjectDetector",
  "segment.person": "ImageSegmenter",
  "landmarks.face": "FaceLandmarker",
  "landmarks.hand": "HandLandmarker",
  "landmarks.pose": "PoseLandmarker",
  "landmarks.gesture": "GestureRecognizer",
};

/** Options for {@link mediapipeProvider}: the runtime loader, the wasm fileset directory, and a weight store to read model files through. */
export interface MediapipeProviderOptions {
  runtime: () => Promise<TasksVision>;
  wasmBase?: string;
  /** Read model files through the weight store (resume, sha-256, licence line) and pass them as buffers. */
  store?: WeightStore;
}

type Task = Record<string, (...a: unknown[]) => unknown>;
const call = <T>(t: Task, name: string, ...a: unknown[]) => t[name]!(...a) as T;

interface MpCategory {
  categoryName?: string;
  displayName?: string;
  score: number;
}

function detector(t: Task, video: boolean): Detector {
  return {
    async detect(image, o = {}) {
      const r = (video ? call(t, "detectForVideo", image, o.timestamp ?? 0) : call(t, "detect", image)) as {
        detections: { categories: MpCategory[]; boundingBox?: { originX: number; originY: number; width: number; height: number } }[];
      };
      return r.detections
        .map((d) => {
          const c = d.categories[0] ?? { score: 0 };
          const b = d.boundingBox ?? { originX: 0, originY: 0, width: 0, height: 0 };
          return { label: c.categoryName ?? c.displayName ?? "", score: c.score, box: { x: b.originX, y: b.originY, w: b.width, h: b.height } };
        })
        .filter((d) => d.score >= (o.scoreThreshold ?? 0))
        .slice(0, o.maxResults ?? Infinity);
    },
    dispose: () => call(t, "close"),
  };
}

function segmenter(t: Task): Segmenter {
  return {
    async segment(image) {
      const r = call<{ confidenceMasks?: { width: number; height: number; getAsFloat32Array(): Float32Array }[]; categoryMask?: { width: number; height: number; getAsUint8Array(): Uint8Array } }>(t, "segment", image);
      const conf = r.confidenceMasks?.[r.confidenceMasks.length - 1];
      if (conf) {
        const f = conf.getAsFloat32Array();
        return [{ width: conf.width, height: conf.height, data: Uint8Array.from(f, (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)) }];
      }
      const m = r.categoryMask;
      return m ? [{ width: m.width, height: m.height, data: Uint8Array.from(m.getAsUint8Array(), (v) => (v ? 255 : 0)) }] : [];
    },
    dispose: () => call(t, "close"),
  };
}

function landmarker(t: Task, kind: string, video: boolean, source: string): Landmarker {
  return {
    async detect(image, o = {}) {
      const g = kind === "landmarks.gesture";
      const r = (video ? call(t, g ? "recognizeForVideo" : "detectForVideo", image, o.timestamp ?? 0) : call(t, g ? "recognize" : "detect", image)) as {
        gestures?: MpCategory[][];
        faceLandmarks?: { x: number; y: number; z: number }[][];
        landmarks?: { x: number; y: number; z: number }[][];
        faceBlendshapes?: { categories: MpCategory[] }[];
        handedness?: MpCategory[][];
        handednesses?: MpCategory[][];
      };
      const lists = (kind === "landmarks.face" ? r.faceLandmarks : r.landmarks) ?? [];
      const out: Landmarks = {
        points: lists.map((l) => l.map((p): [number, number, number] => [p.x, p.y, p.z])),
        source,
      };
      if (r.faceBlendshapes) out.blendshapes = r.faceBlendshapes.map((b) => Object.fromEntries(b.categories.map((c) => [c.categoryName ?? "", c.score])));
      const hd = r.handedness ?? r.handednesses;
      if (hd) out.handedness = hd.map((h) => h[0]?.categoryName ?? "");
      if (g) out.gestures = lists.map((_, i) => {
        const top = r.gestures?.[i]?.[0];
        return top && top.categoryName && top.categoryName !== "None" ? { name: top.categoryName, score: top.score } : null;
      });
      return out;
    },
    dispose: () => call(t, "close"),
  };
}

/** The MediaPipe tasks-vision provider for the models hub: one task per record, the GPU delegate on a webgl rung and the CPU delegate on a wasm rung. */
export function mediapipeProvider(opts: MediapipeProviderOptions): Factory {
  let fileset: Promise<unknown> | null = null;
  return async ({ record, rung, signal }) => {
    const tv = await opts.runtime();
    fileset ??= tv.FilesetResolver.forVisionTasks(opts.wasmBase ?? tasksVisionWasm());
    const fs = await fileset;
    const cap = record.provides[0]!;
    const cls = tv[CLASS[cap] ?? ("" as keyof TasksVision)] as TaskClass | undefined;
    if (!cls) throw new Error(`${record.id}: no mediapipe task for ${cap}`);
    const url = record.source.url;
    if (!url) throw new Error(`${record.id}: a mediapipe record needs source.url`);
    const base: Record<string, unknown> = { delegate: rung.device === "webgl" ? "GPU" : "CPU" };
    if (opts.store) {
      const ref = { url, licence: record.licence, ...(record.source.sha256 ? { sha256: record.source.sha256 } : {}) };
      base.modelAssetBuffer = new Uint8Array(await (await opts.store.get(ref, signal ? { signal } : {})).arrayBuffer());
    } else base.modelAssetPath = url;
    const video = rung.options?.runningMode === "VIDEO";
    const extra: Record<string, unknown> = { runningMode: video ? "VIDEO" : "IMAGE", ...(rung.options ?? {}) };
    if (cap === "landmarks.face") extra.outputFaceBlendshapes ??= true;
    if (cap === "segment.person") extra.outputConfidenceMasks ??= true;
    const task = await cls.createFromOptions(fs, { baseOptions: base, ...extra });
    if (cap === "detect") return detector(task, video);
    if (cap === "segment.person") return segmenter(task);
    return landmarker(task, cap, video, record.id);
  };
}

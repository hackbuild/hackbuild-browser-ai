/**
 * Stub models for `?stub` pages and tests: no weights, fixed shapes. Depth
 * is a left to right ramp, detection one centred box, segmentation a
 * centred disc, landmarks a fixed set, captions a fixed line.
 */

import type { ModelRecord } from "@hackbuild/models";
import { promptSegmenter, type EmbeddingCache } from "./segment.js";
import type { DepthModel, Detector, Landmarker, Segmenter, Vlm } from "./types.js";

const dims = (img: unknown): { width: number; height: number } => {
  const o = img as { width?: number; height?: number } | null;
  return { width: o?.width ?? 64, height: o?.height ?? 48 };
};

export function rampDepth(): DepthModel {
  return {
    async estimate(img) {
      const { width, height } = dims(img);
      const data = new Float32Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = width > 1 ? x / (width - 1) : 0;
      return { width, height, data, range: [0, 1] };
    },
  };
}

export function centreDetector(label = "person"): Detector {
  return {
    async detect(img) {
      const { width, height } = dims(img);
      return [{ label, score: 0.9, box: { x: width / 4, y: height / 4, w: width / 2, h: height / 2 } }];
    },
  };
}

/**
 * A disc at the first positive point, or in the middle of the box, with a
 * hole at each negative point. The stub encoder counts its runs on
 * `encodes`, so tests can see the embedding cache work.
 */
export function discSegmenter(): Segmenter & { cache: EmbeddingCache<{ width: number; height: number }>; encodes: number } {
  const seg = Object.assign(
    promptSegmenter<{ width: number; height: number }>({
      encode: async (img) => {
        seg.encodes++;
        return dims(img);
      },
      async decode({ width, height }, prompt) {
        const b = prompt.box;
        const pos = prompt.points?.find((p) => (p.label ?? 1) === 1);
        const c = pos ?? (b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: width / 2, y: height / 2 });
        const r = b ? Math.min(b.w, b.h) / 2 : Math.min(width, height) / 4;
        const neg = (prompt.points ?? []).filter((p) => p.label === 0);
        const data = new Uint8Array(width * height);
        for (let y = 0; y < height; y++)
          for (let x = 0; x < width; x++) {
            const inside = (x - c.x) ** 2 + (y - c.y) ** 2 <= r * r;
            const cut = neg.some((p) => (x - p.x) ** 2 + (y - p.y) ** 2 <= (r * r) / 4);
            data[y * width + x] = inside && !cut ? 255 : 0;
          }
        return [{ width, height, data, score: 1 }];
      },
    }),
    { encodes: 0 },
  );
  const person = seg.segment;
  // the person capability takes no prompt: a centred disc
  seg.segment = (img, prompt, o) => person(img, prompt && (prompt.points?.length || prompt.box) ? prompt : { box: centreBox(img) }, o);
  return seg;
}

const centreBox = (img: unknown) => {
  const { width, height } = dims(img);
  const r = Math.min(width, height) / 4;
  return { x: width / 2 - r, y: height / 2 - r, w: 2 * r, h: 2 * r };
};

export function fixedLandmarker(count: number, source = "stub"): Landmarker {
  return {
    async detect() {
      return { points: [Array.from({ length: count }, (_, i): [number, number, number] => [i / count, 0.5, 0])], source };
    },
  };
}

export function fixedVlm(text = "a stub caption."): Vlm {
  return { ask: async (_img, q) => (q ? `stub answer to: ${q}` : text) };
}

/** Stub builders to merge into `stubFactory({...})`. */
export function visionStubs(): Record<string, (r: ModelRecord) => unknown> {
  return {
    depth: () => rampDepth(),
    detect: () => centreDetector(),
    segment: () => discSegmenter(),
    "segment.person": () => discSegmenter(),
    "landmarks.face": () => fixedLandmarker(478),
    "landmarks.hand": () => fixedLandmarker(21),
    "landmarks.pose": () => fixedLandmarker(33),
    "vision.caption": () => fixedVlm(),
    "vision.ask": () => fixedVlm(),
  };
}

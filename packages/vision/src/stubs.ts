/**
 * Stub models for `?stub` pages and tests: no weights, fixed shapes. Depth
 * is a left to right ramp, detection one centred box, segmentation a
 * centred disc, landmarks a fixed set, captions a fixed line.
 */

import type { ModelRecord } from "@hackbuild/models";
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

export function discSegmenter(): Segmenter {
  return {
    async segment(img, prompt) {
      const { width, height } = dims(img);
      const c = prompt?.points?.[0] ?? { x: width / 2, y: height / 2 };
      const r = Math.min(width, height) / 4;
      const data = new Uint8Array(width * height);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) data[y * width + x] = (x - c.x) ** 2 + (y - c.y) ** 2 <= r * r ? 255 : 0;
      return [{ width, height, data, score: 1 }];
    },
  };
}

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

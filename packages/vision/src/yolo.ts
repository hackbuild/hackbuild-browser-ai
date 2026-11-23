/**
 * A detector over a YOLOv8 style ONNX export: a square letterbox (640 by
 * default, grey 114 padding), one [1, 4 + classes, anchors] output read as
 * centre x, centre y, width, height and class scores, then non maximum
 * suppression per class. Written from the published output layout; the
 * weights are external and AGPL-3.0.
 */

import type { OrtModel } from "@hackbuild/devices";
import type { Box, Detection, Detector, Pixels } from "./types.js";

export const COCO_LABELS = (
  "person,bicycle,car,motorcycle,airplane,bus,train,truck,boat,traffic light,fire hydrant,stop sign,parking meter,bench,bird,cat,dog,horse,sheep,cow," +
  "elephant,bear,zebra,giraffe,backpack,umbrella,handbag,tie,suitcase,frisbee,skis,snowboard,sports ball,kite,baseball bat,baseball glove,skateboard," +
  "surfboard,tennis racket,bottle,wine glass,cup,fork,knife,spoon,bowl,banana,apple,sandwich,orange,broccoli,carrot,hot dog,pizza,donut,cake,chair,couch," +
  "potted plant,bed,dining table,toilet,tv,laptop,mouse,remote,keyboard,cell phone,microwave,oven,toaster,sink,refrigerator,book,clock,vase,scissors," +
  "teddy bear,hair drier,toothbrush"
).split(",");

export interface Letterbox {
  scale: number;
  padX: number;
  padY: number;
  size: number;
}

export function letterboxParams(w: number, h: number, size = 640): Letterbox {
  const scale = Math.min(size / w, size / h);
  return { scale, padX: Math.floor((size - Math.round(w * scale)) / 2), padY: Math.floor((size - Math.round(h * scale)) / 2), size };
}

/** RGBA pixels to a planar float tensor [1, 3, size, size] in 0 to 1, nearest neighbour, grey padding. */
export function letterboxTensor(px: Pixels, size = 640): { data: Float32Array; lb: Letterbox } {
  const lb = letterboxParams(px.width, px.height, size);
  const plane = size * size;
  const data = new Float32Array(3 * plane).fill(114 / 255);
  const w = Math.round(px.width * lb.scale);
  const h = Math.round(px.height * lb.scale);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(px.height - 1, Math.floor(y / lb.scale));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(px.width - 1, Math.floor(x / lb.scale));
      const s = (sy * px.width + sx) * 4;
      const d = (y + lb.padY) * size + x + lb.padX;
      data[d] = px.data[s]! / 255;
      data[plane + d] = px.data[s + 1]! / 255;
      data[2 * plane + d] = px.data[s + 2]! / 255;
    }
  }
  return { data, lb };
}

export function iou(a: Box, b: Box): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

/** Greedy NMS within each label, best first, then the top `max` overall. */
export function nms(dets: Detection[], iouThreshold = 0.45, max = 13): Detection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const keep: Detection[] = [];
  for (const d of sorted) {
    if (keep.some((k) => k.label === d.label && iou(k.box, d.box) > iouThreshold)) continue;
    keep.push(d);
    if (keep.length >= max) break;
  }
  return keep;
}

/** Decode a [4 + classes, anchors] output (batch 1) into boxes in source pixels. */
export function decodeYolo(
  out: ArrayLike<number>,
  dims: readonly number[],
  lb: Letterbox,
  src: { width: number; height: number },
  o: { scoreThreshold?: number; iou?: number; max?: number; labels?: readonly string[] } = {},
): Detection[] {
  const rows = dims[dims.length - 2]!;
  const n = dims[dims.length - 1]!;
  const classes = rows - 4;
  const thr = o.scoreThreshold ?? 0.25;
  const labels = o.labels ?? COCO_LABELS;
  const dets: Detection[] = [];
  for (let a = 0; a < n; a++) {
    let best = -1;
    let score = thr;
    for (let c = 0; c < classes; c++) {
      const s = out[(4 + c) * n + a]!;
      if (s > score) {
        score = s;
        best = c;
      }
    }
    if (best < 0) continue;
    const cx = out[a]!;
    const cy = out[n + a]!;
    const w = out[2 * n + a]!;
    const h = out[3 * n + a]!;
    const x0 = Math.max(0, (cx - w / 2 - lb.padX) / lb.scale);
    const y0 = Math.max(0, (cy - h / 2 - lb.padY) / lb.scale);
    const x1 = Math.min(src.width, (cx + w / 2 - lb.padX) / lb.scale);
    const y1 = Math.min(src.height, (cy + h / 2 - lb.padY) / lb.scale);
    dets.push({ label: labels[best] ?? String(best), score, box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } });
  }
  return nms(dets, o.iou ?? 0.45, o.max ?? 13);
}

/** Wrap an ort model as a Detector. Images must be Pixels, or `toPixels` must turn them into Pixels. */
export function yoloDetector(m: OrtModel, o: { size?: number; labels?: readonly string[]; toPixels?: (img: unknown) => Pixels } = {}): Detector {
  const size = o.size ?? 640;
  return {
    async detect(image, opts = {}) {
      const px = o.toPixels ? o.toPixels(image) : (image as Pixels);
      const { data, lb } = letterboxTensor(px, size);
      const feeds = { [m.session.inputNames[0]!]: new m.ort.Tensor("float32", data, [1, 3, size, size]) };
      const res = await m.session.run(feeds);
      const t = res[m.session.outputNames[0]!]!;
      return decodeYolo(t.data as ArrayLike<number>, t.dims, lb, px, {
        ...(opts.scoreThreshold !== undefined ? { scoreThreshold: opts.scoreThreshold } : {}),
        ...(opts.maxResults !== undefined ? { max: opts.maxResults } : {}),
        ...(o.labels ? { labels: o.labels } : {}),
      });
    },
    dispose: () => m.dispose(),
  };
}

/** The HACKLE cadence: wait max(0.45 s, 4 times the last latency) between runs. */
export function detectCadenceMs(lastLatencyMs: number): number {
  return Math.max(450, 4 * lastLatencyMs);
}

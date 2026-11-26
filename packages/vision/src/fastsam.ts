/**
 * Segment everything over a FastSAM ONNX export, written from the
 * published YOLOv8 segmentation layout: one output [1, 4 + classes + k,
 * anchors] holding centre x, centre y, width, height, class scores and k
 * mask coefficients per anchor, and one prototype output [1, k, ph, pw].
 * Boxes above the confidence pass a class agnostic NMS; each kept box's
 * mask is the sigmoid of its coefficients times the prototypes, cropped to
 * the box and mapped back through the letterbox to source pixels. The
 * weights are AGPL-3.0 upstream (Ultralytics FastSAM).
 */

import type { OrtModel } from "@hackbuild/devices";
import type { Box, Instance, Pixels } from "./types.js";
import { iou, letterboxTensor, type Letterbox } from "./yolo.js";

/** Options for {@link decodeFastSam} and {@link EverythingSegmenter.segmentAll}. */
export interface EverythingOptions {
  /** Box confidence to keep, 0 to 1. Default 0.4, the FastSAM default. */
  confidence?: number;
  /** Class agnostic NMS IoU. Default 0.9, the FastSAM default, so nested parts survive. */
  iou?: number;
  /** Smallest mask kept, in source pixels. Default 64. */
  minArea?: number;
  /** Most instances kept, best first. Default 100. */
  max?: number;
  /** Apply a sigmoid to coefficient times prototype; off for exports that bake it in. Default true. */
  sigmoid?: boolean;
  /** Mask probability cut, 0 to 1. Default 0.5. */
  maskThreshold?: number;
}

function agnosticNms<T extends { box: Box; score: number }>(items: T[], thr: number, max: number): T[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const keep: T[] = [];
  for (const d of sorted) {
    if (keep.some((k) => iou(k.box, d.box) > thr)) continue;
    keep.push(d);
    if (keep.length >= max) break;
  }
  return keep;
}

/**
 * Decode the two FastSAM outputs into instances in source pixels, best
 * first: boxes, scores, areas and one mask each (255 inside, `score` on
 * the mask too).
 */
export function decodeFastSam(
  out: ArrayLike<number>,
  dims: readonly number[],
  protos: ArrayLike<number>,
  protoDims: readonly number[],
  lb: Letterbox,
  src: { width: number; height: number },
  o: EverythingOptions = {},
): Instance[] {
  const rows = dims[dims.length - 2]!;
  const n = dims[dims.length - 1]!;
  const k = protoDims[protoDims.length - 3]!;
  const ph = protoDims[protoDims.length - 2]!;
  const pw = protoDims[protoDims.length - 1]!;
  const classes = rows - 4 - k;
  if (classes < 1) throw new RangeError(`decodeFastSam: ${rows} rows leave no class score beside ${k} mask coefficients`);
  const conf = o.confidence ?? 0.4;
  const cands: { box: Box; score: number; a: number; lx: number; ly: number; lw: number; lh: number }[] = [];
  for (let a = 0; a < n; a++) {
    let score = 0;
    for (let c = 0; c < classes; c++) score = Math.max(score, out[(4 + c) * n + a]!);
    if (!(score > conf)) continue;
    const cx = out[a]!;
    const cy = out[n + a]!;
    const w = out[2 * n + a]!;
    const h = out[3 * n + a]!;
    const x0 = Math.max(0, (cx - w / 2 - lb.padX) / lb.scale);
    const y0 = Math.max(0, (cy - h / 2 - lb.padY) / lb.scale);
    const x1 = Math.min(src.width, (cx + w / 2 - lb.padX) / lb.scale);
    const y1 = Math.min(src.height, (cy + h / 2 - lb.padY) / lb.scale);
    if (x1 <= x0 || y1 <= y0) continue;
    cands.push({ box: { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }, score, a, lx: cx, ly: cy, lw: w, lh: h });
  }
  const kept = agnosticNms(cands, o.iou ?? 0.9, o.max ?? 100);
  const sig = o.sigmoid ?? true;
  const cut = o.maskThreshold ?? 0.5;
  const minArea = o.minArea ?? 64;
  const plane = ph * pw;
  const toProto = pw / lb.size;
  const out_: Instance[] = [];
  const coef = new Float32Array(k);
  const low = new Float32Array(plane);
  for (const d of kept) {
    for (let j = 0; j < k; j++) coef[j] = out[(4 + classes + j) * n + d.a]!;
    // the low resolution mask over the box only, in proto cells
    const px0 = Math.max(0, Math.floor((d.lx - d.lw / 2) * toProto) - 1);
    const py0 = Math.max(0, Math.floor((d.ly - d.lh / 2) * toProto) - 1);
    const px1 = Math.min(pw - 1, Math.ceil((d.lx + d.lw / 2) * toProto) + 1);
    const py1 = Math.min(ph - 1, Math.ceil((d.ly + d.lh / 2) * toProto) + 1);
    for (let y = py0; y <= py1; y++)
      for (let x = px0; x <= px1; x++) {
        let v = 0;
        const i = y * pw + x;
        for (let j = 0; j < k; j++) v += coef[j]! * protos[j * plane + i]!;
        low[i] = sig ? 1 / (1 + Math.exp(-v)) : v;
      }
    const data = new Uint8Array(src.width * src.height);
    const bx0 = Math.floor(d.box.x);
    const by0 = Math.floor(d.box.y);
    const bx1 = Math.min(src.width, Math.ceil(d.box.x + d.box.w));
    const by1 = Math.min(src.height, Math.ceil(d.box.y + d.box.h));
    let area = 0;
    for (let y = by0; y < by1; y++) {
      const fy = Math.min(py1, Math.max(py0, ((y + 0.5) * lb.scale + lb.padY) * toProto - 0.5));
      const y0 = Math.floor(fy);
      const y1 = Math.min(py1, y0 + 1);
      const ty = fy - y0;
      for (let x = bx0; x < bx1; x++) {
        const fx = Math.min(px1, Math.max(px0, ((x + 0.5) * lb.scale + lb.padX) * toProto - 0.5));
        const x0 = Math.floor(fx);
        const x1 = Math.min(px1, x0 + 1);
        const tx = fx - x0;
        const top = low[y0 * pw + x0]! * (1 - tx) + low[y0 * pw + x1]! * tx;
        const bot = low[y1 * pw + x0]! * (1 - tx) + low[y1 * pw + x1]! * tx;
        if (top * (1 - ty) + bot * ty > cut) {
          data[y * src.width + x] = 255;
          area++;
        }
      }
    }
    if (area < minArea) continue;
    out_.push({ box: d.box, score: d.score, area, mask: { width: src.width, height: src.height, data, score: d.score } });
  }
  return out_;
}

/** A loaded segment everything model: `segmentAll` returns every instance in an image, best first. */
export interface EverythingSegmenter {
  segmentAll(image: unknown, o?: EverythingOptions): Promise<Instance[]>;
  dispose?(): unknown;
}

/** Wrap a FastSAM ort model as an {@link EverythingSegmenter}. Outputs are told apart by rank: the 4D one holds the prototypes. Images must be Pixels, or `toPixels` must turn them into Pixels. */
export function fastSamSegmenter(m: OrtModel, o: { size?: number; toPixels?: (img: unknown) => Pixels } = {}): EverythingSegmenter {
  const size = o.size ?? 640;
  return {
    async segmentAll(image, opts = {}) {
      const px = o.toPixels ? o.toPixels(image) : (image as Pixels);
      const { data, lb } = letterboxTensor(px, size);
      const res = await m.session.run({ [m.session.inputNames[0]!]: new m.ort.Tensor("float32", data, [1, 3, size, size]) });
      const outs = m.session.outputNames.map((nm) => res[nm]!);
      const proto = outs.find((t) => t.dims.length === 4);
      const det = outs.find((t) => t.dims.length === 3);
      if (!proto || !det) throw new Error(`fastsam: expected a 3D box output and a 4D prototype output, got ${outs.map((t) => `[${t.dims.join(", ")}]`).join(" and ")}`);
      return decodeFastSam(det.data as ArrayLike<number>, det.dims, proto.data as ArrayLike<number>, proto.dims, lb, px, opts);
    },
    dispose: () => m.dispose(),
  };
}

/** The smallest instance whose mask holds the pixel at x, y, for hover and click picks; undefined off every mask. */
export function instanceAt(instances: readonly Instance[], x: number, y: number): Instance | undefined {
  let best: Instance | undefined;
  for (const inst of instances) {
    const m = inst.mask;
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    if (xi < 0 || yi < 0 || xi >= m.width || yi >= m.height || m.data[yi * m.width + xi]! < 128) continue;
    if (!best || inst.area < best.area) best = inst;
  }
  return best;
}

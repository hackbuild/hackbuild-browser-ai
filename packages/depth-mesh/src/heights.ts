/**
 * Height sources and the photo to relief path (as the earlier relief
 * bench did): a photo becomes a closed relief solid from one of three
 * named sources, Depth Anything depth, brightness, or an inflated
 * silhouette, with the bench's width, base, height, gamma, background
 * cut, smoothing and invert, a relief mask, and the erase and restore
 * brush masks. Depth comes from the caller (`@hackbuild/vision` `depth`
 * or a stored map); with no depth map the path falls back to brightness
 * and says so in `notes`, as the bench did.
 */

import type { DepthMesh, Mesh } from "./core.js";

/** RGBA pixels, as ImageData has them. */
export interface RgbaImage {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** 0 to 1 per pixel, larger is nearer. */
export interface DepthGrid {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

/** Any size; resampled to the relief grid, nonzero (128 and up for 8 bit masks) is set. */
export interface MaskGrid {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

export type HeightSourceName = "depth" | "brightness" | "inflate";

export interface HeightSource {
  name: HeightSourceName;
  /** The bench's label in the height from select. */
  label: string;
  /** Needs a depth model or a stored depth map. */
  needsModel: boolean;
  /** Options that apply to this source. */
  params: readonly (keyof ReliefParams)[];
}

/** The height from select, in the bench's order and words. */
export const HEIGHT_SOURCES: readonly HeightSource[] = [
  { name: "depth", label: "Depth Anything", needsModel: true, params: ["width", "base", "height", "gamma", "bgcut", "smooth", "invert"] },
  { name: "brightness", label: "brightness", needsModel: false, params: ["width", "base", "height", "gamma", "bgcut", "smooth", "invert"] },
  { name: "inflate", label: "inflate silhouette", needsModel: false, params: ["width", "base", "height", "gamma", "smooth", "invert", "threshold"] },
];

export interface ReliefParams {
  /** Relief width on the print, mm. Default 30 (the bench's default layer). */
  width: number;
  /** Lowest relief height, mm. Default 0.24. */
  base: number;
  /** Highest relief height, mm. Default 2.4. */
  height: number;
  /** Default 1. */
  gamma: number;
  /** Background cut 0 to 0.9, depth and brightness only. Default 0.25. */
  bgcut: number;
  /** Smoothing radius, mm. Default 0.3. */
  smooth: number;
  /** Depth and brightness: far or dark is high. Inflate: light art on dark is the silhouette. */
  invert: boolean;
  /** Inflate: brightness below this is inside when the art has no alpha. Default 0.5. */
  threshold: number;
}

export const RELIEF_DEFAULTS: Readonly<ReliefParams> = { width: 30, base: 0.24, height: 2.4, gamma: 1, bgcut: 0.25, smooth: 0.3, invert: false, threshold: 0.5 };

export interface PhotoReliefOptions extends Partial<ReliefParams> {
  source: HeightSourceName;
  /** A depth map for the photo (stored with the design), or a call that makes one. */
  depth?: DepthGrid | ((image: RgbaImage) => Promise<DepthGrid>);
  /** Relief only inside this mask, such as a segmentation mask. */
  mask?: MaskGrid;
  /** Erase brush: cells set here are cut. */
  erase?: MaskGrid;
  /** Restore brush: cells set here come back even where erased. */
  restore?: MaskGrid;
  /** Keep only the largest piece. */
  keepLargest?: boolean;
  /** Grid cells across. Default the photo width, at most 256. */
  cells?: number;
  /** Fill corner to corner pinches so the solid closes. Default true. */
  heal?: boolean;
}

export interface PhotoRelief {
  /** The closed solid in mm, centred on x and y, sitting on z = 0, image up is +y. */
  mesh: Mesh;
  /** Heights in mm per cell, row 0 at the top of the image; 0 is no relief. */
  heights: Float32Array;
  cols: number;
  rows: number;
  /** Cell size, mm. */
  px: number;
  /** The source used, after any fallback. */
  source: HeightSourceName;
  /** The depth map used, to store with the design so the model never reruns. */
  depth?: DepthGrid;
  /** Status lines: [level, text]. */
  notes: [level: "ok" | "warn", text: string][];
}

/** Bilinear sample of channel `c` of `n` channels at (u, v) in 0 to 1. */
function sample(g: { width: number; height: number; data: ArrayLike<number> }, n: number, c: number, u: number, v: number): number {
  const x = Math.min(g.width - 1, Math.max(0, u * g.width - 0.5));
  const y = Math.min(g.height - 1, Math.max(0, v * g.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(g.width - 1, x0 + 1);
  const y1 = Math.min(g.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const at = (i: number, j: number) => g.data[(j * g.width + i) * n + c]!;
  return (at(x0, y0) * (1 - fx) + at(x1, y0) * fx) * (1 - fy) + (at(x0, y1) * (1 - fx) + at(x1, y1) * fx) * fy;
}

function resampleMask(m: MaskGrid, cols: number, rows: number): Uint8Array {
  let max = 0;
  for (let i = 0; i < m.data.length; i++) if (m.data[i]! > max) max = m.data[i]!;
  const on = max > 1 ? 128 : 1;
  const out = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const x = Math.min(m.width - 1, Math.floor(((i + 0.5) / cols) * m.width));
      const y = Math.min(m.height - 1, Math.floor(((j + 0.5) / rows) * m.height));
      out[j * cols + i] = m.data[y * m.width + x]! >= on ? 1 : 0;
    }
  return out;
}

/** Gaussian blur in place, sigma in cells, edges clamped (a canvas blur filter is a gaussian of that sigma). */
function blur(v: Float32Array, w: number, h: number, sigma: number): void {
  if (sigma < 0.3) return;
  const R = Math.ceil(sigma * 3);
  const k = new Float32Array(2 * R + 1);
  let s = 0;
  for (let i = -R; i <= R; i++) s += k[i + R] = Math.exp(-(i * i) / (2 * sigma * sigma));
  for (let i = 0; i < k.length; i++) k[i]! /= s;
  const t = new Float32Array(v.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -R; i <= R; i++) a += v[y * w + Math.min(w - 1, Math.max(0, x + i))]! * k[i + R]!;
      t[y * w + x] = a;
    }
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let a = 0;
      for (let i = -R; i <= R; i++) a += t[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + R]!;
      v[y * w + x] = a;
    }
}

/** Distance in cells from each inside cell to the nearest outside cell (exact, Felzenszwalb and Huttenlocher). */
function insideDistance(inside: Uint8Array, w: number, h: number): Float32Array {
  const INF = 1e20;
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = inside[i] ? INF : 0;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const o = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number, at: (q: number) => number) => {
    for (let q = 0; q < len; q++) f[q] = d[at(q)]!;
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      const sx = (r: number) => (f[q]! + q * q - (f[r]! + r * r)) / (2 * q - 2 * r);
      let s = sx(v[k]!);
      while (s <= z[k]!) s = sx(v[--k]!);
      v[++k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      o[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
    }
    for (let q = 0; q < len; q++) d[at(q)] = o[q]!;
  };
  for (let x = 0; x < w; x++) pass(h, (q) => q * w + x);
  for (let y = 0; y < h; y++) pass(w, (q) => y * w + q);
  // the image edge counts as outside, so a silhouette touching it still domes
  return Float32Array.from(d, (x, i) => {
    if (!inside[i]) return 0;
    const cx = i % w;
    const cy = (i - cx) / w;
    return Math.min(Math.sqrt(x), cx + 1, cy + 1, w - cx, h - cy);
  });
}

function largestPiece(reg: Uint8Array, w: number, h: number): void {
  const lab = new Int32Array(w * h);
  const st = new Int32Array(w * h);
  let best = 0;
  let size = 0;
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (!reg[s] || lab[s]) continue;
    lab[s] = ++next;
    let top = 0;
    let n = 0;
    st[top++] = s;
    while (top) {
      const p = st[--top]!;
      n++;
      const x = p % w;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w])
        if (q >= 0 && q < w * h && reg[q] && !lab[q]) {
          lab[q] = next;
          st[top++] = q;
        }
    }
    if (n > size) {
      size = n;
      best = next;
    }
  }
  for (let p = 0; p < w * h; p++) if (lab[p] !== best) reg[p] = 0;
}

const luma = (img: RgbaImage, u: number, v: number) => (0.299 * sample(img, 4, 0, u, v) + 0.587 * sample(img, 4, 1, u, v) + 0.114 * sample(img, 4, 2, u, v)) / 255;

/** Brightness per cell, 0 to 1, and coverage (alpha over 127). */
export function brightnessHeight(img: RgbaImage, cols: number, rows: number): { values: Float32Array; cover: Uint8Array } {
  const values = new Float32Array(cols * rows);
  const cover = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols;
      const v = (j + 0.5) / rows;
      values[j * cols + i] = luma(img, u, v);
      cover[j * cols + i] = sample(img, 4, 3, u, v) > 127 ? 1 : 0;
    }
  return { values, cover };
}

/**
 * Inflated silhouette per cell, 0 to 1: a dome sqrt(1 - (1 - t)^2) over
 * t, the distance to the outline over the largest distance (as the bench
 * did). Art with transparency carries its shape in alpha; opaque art is
 * inside where darker than `threshold` (lighter with `invert`).
 */
export function inflateHeight(img: RgbaImage, cols: number, rows: number, o: { threshold?: number; invert?: boolean; blur?: number } = {}): { values: Float32Array; cover: Uint8Array } {
  const thr = o.threshold ?? 0.5;
  let anyAlpha = false;
  for (let i = 3; i < img.data.length; i += 4)
    if (img.data[i]! < 245) {
      anyAlpha = true;
      break;
    }
  const lum = new Float32Array(cols * rows);
  const al = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      const u = (i + 0.5) / cols;
      const v = (j + 0.5) / rows;
      lum[j * cols + i] = luma(img, u, v);
      al[j * cols + i] = sample(img, 4, 3, u, v);
    }
  if (o.blur) {
    blur(lum, cols, rows, o.blur);
    blur(al, cols, rows, o.blur);
  }
  const sil = new Uint8Array(cols * rows);
  for (let p = 0; p < sil.length; p++) {
    let on = al[p]! > 127 && (anyAlpha ? true : o.invert ? lum[p]! > thr : lum[p]! < thr);
    if (anyAlpha && o.invert) on = !on && al[p]! > 0;
    sil[p] = on ? 1 : 0;
  }
  const d = insideDistance(sil, cols, rows);
  let mx = 0;
  for (const x of d) if (x > mx) mx = x;
  const values = new Float32Array(cols * rows);
  for (let p = 0; p < sil.length; p++)
    if (sil[p]) {
      const t = Math.min(1, d[p]! / Math.max(1, mx));
      values[p] = Math.sqrt(1 - (1 - t) * (1 - t));
    }
  return { values, cover: sil };
}

/** Depth per cell, resampled bilinear from the map's own size. */
export function depthHeight(d: DepthGrid, cols: number, rows: number): Float32Array {
  const values = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) values[j * cols + i] = sample(d, 1, 0, (i + 0.5) / cols, (j + 0.5) / rows);
  return values;
}

/**
 * Photo to relief in one call: a height source, the bench's parameters,
 * the relief mask and the erase and restore brushes, then the closed
 * solid. Export it with `toStl`.
 */
export async function photoRelief(dm: DepthMesh, image: RgbaImage, o: PhotoReliefOptions): Promise<PhotoRelief> {
  const p: ReliefParams = { ...RELIEF_DEFAULTS };
  for (const k of Object.keys(RELIEF_DEFAULTS) as (keyof ReliefParams)[]) if (o[k] !== undefined) (p as unknown as Record<string, unknown>)[k] = o[k];
  if (!(image.width > 0 && image.height > 0) || image.data.length < image.width * image.height * 4) throw new RangeError(`photoRelief: ${image.data.length} bytes for a ${image.width} x ${image.height} RGBA image`);
  const cols = Math.max(2, Math.round(o.cells ?? Math.min(image.width, 256)));
  const rows = Math.max(2, Math.round((cols * image.height) / image.width));
  const px = p.width / cols;
  const sigma = p.smooth / px;
  const notes: PhotoRelief["notes"] = [];
  let source = o.source;
  let depth: DepthGrid | undefined;
  if (source === "depth") {
    try {
      depth = typeof o.depth === "function" ? await o.depth(image) : o.depth;
      if (!depth) throw new Error("no depth map yet");
    } catch (e) {
      source = "brightness";
      notes.push(["warn", `depth failed: ${e instanceof Error ? e.message : String(e)}. using brightness; inflate also works with no model`]);
    }
  }
  const n = cols * rows;
  let values: Float32Array;
  let cover: Uint8Array;
  if (source === "inflate") ({ values, cover } = inflateHeight(image, cols, rows, { threshold: p.threshold, invert: p.invert, blur: sigma * 0.5 }));
  else {
    const b = brightnessHeight(image, cols, rows);
    cover = b.cover;
    values = source === "depth" ? depthHeight(depth!, cols, rows) : b.values;
    blur(values, cols, rows, sigma);
  }
  const reg = cover.slice();
  const mask = o.mask ? resampleMask(o.mask, cols, rows) : null;
  const er = o.erase ? resampleMask(o.erase, cols, rows) : null;
  const rs = o.restore ? resampleMask(o.restore, cols, rows) : null;
  for (let i = 0; i < n; i++) if ((mask && !mask[i]) || (er && er[i] && !(rs && rs[i]))) reg[i] = 0;
  let heights: Float32Array;
  if (source === "inflate") {
    heights = new Float32Array(n);
    for (let i = 0; i < n; i++) if (reg[i] && values[i]! > 0) heights[i] = Math.max(0.12, p.base + Math.max(0, p.height - p.base) * Math.pow(Math.min(1, values[i]!), p.gamma));
  } else heights = dm.relief(values, { base: p.base, height: p.height, gamma: p.gamma, bgcut: p.bgcut, invert: p.invert, mask: reg });
  if (o.keepLargest) {
    const on = Uint8Array.from(heights, (h) => (h > 0 ? 1 : 0));
    largestPiece(on, cols, rows);
    for (let i = 0; i < n; i++) if (!on[i]) heights[i] = 0;
  }
  const filled = o.heal === false ? 0 : dm.healPinches(heights, cols, rows);
  // row 0 is the top of the photo; the solid has image up on +y
  const flipped = new Float32Array(n);
  for (let j = 0; j < rows; j++) flipped.set(heights.subarray(j * cols, (j + 1) * cols), (rows - 1 - j) * cols);
  const mesh = dm.heightfieldMesh(flipped, cols, rows, px, (-cols * px) / 2, (-rows * px) / 2, 0);
  let cells = 0;
  let top = 0;
  for (const h of heights)
    if (h > 0) {
      cells++;
      if (h > top) top = h;
    }
  if (!cells) notes.push(["warn", "no relief: every cell was cut. lower the background cut or clear the erase brush"]);
  else notes.push(["ok", `relief from ${source}: up to ${top.toFixed(2)} mm over ${(cells * px * px).toFixed(0)} mm2, ${cols} x ${rows} cells${filled ? `, ${filled} pinches filled` : ""}`]);
  const out: PhotoRelief = { mesh, heights, cols, rows, px, source, notes };
  if (depth) out.depth = depth;
  return out;
}

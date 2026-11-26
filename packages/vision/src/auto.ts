/**
 * Masks with no model, ported from the mask studio's auto row: a Sobel
 * edge map, a brightness threshold, Otsu's automatic threshold, and
 * k-means colour clusters. Brightness is Rec. 601 luma (0.299, 0.587,
 * 0.114) on 0 to 255, as the original. K-means seeds from an injected
 * `rng`, so the same seed gives the same clusters.
 */

import type { Mask, Pixels } from "./types.js";

/** Rec. 601 luma per pixel, 0 to 255. */
export function luma(px: Pixels): Float32Array {
  const n = px.width * px.height;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = 0.299 * px.data[i * 4]! + 0.587 * px.data[i * 4 + 1]! + 0.114 * px.data[i * 4 + 2]!;
  return out;
}

/** Edge pixels: the 3 by 3 Sobel gradient magnitude of luma above `threshold` (default 50). The one pixel border stays out. */
export function edgeMask(px: Pixels, threshold = 50): Mask {
  const { width: w, height: h } = px;
  const g = luma(px);
  const data = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = g[i - w - 1]!, b = g[i - w]!, c = g[i - w + 1]!, d = g[i - 1]!, f = g[i + 1]!, p = g[i + w - 1]!, q = g[i + w]!, r = g[i + w + 1]!;
      const gx = c + 2 * f + r - a - 2 * d - p;
      const gy = p + 2 * q + r - a - 2 * b - c;
      if (Math.sqrt(gx * gx + gy * gy) > threshold) data[i] = 255;
    }
  return { width: w, height: h, data };
}

/** Pixels brighter than `threshold` (0 to 255, default 128); `invert` keeps the darker ones. */
export function thresholdMask(px: Pixels, threshold = 128, invert = false): Mask {
  const g = luma(px);
  return { width: px.width, height: px.height, data: Uint8Array.from(g, (v) => ((v > threshold) !== invert ? 255 : 0)) };
}

/** Otsu's threshold over the luma histogram: the cut that maximizes the between class variance, 0 to 255. */
export function otsuThreshold(px: Pixels): number {
  const hist = new Float64Array(256);
  for (const v of luma(px)) hist[Math.round(v)]!++;
  const total = px.width * px.height;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i]!;
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let th = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]!;
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t]!;
    const d = sumB / wB - (sum - sumB) / wF;
    const v = wB * wF * d * d;
    if (v > best) {
      best = v;
      th = t;
    }
  }
  return th;
}

/** The threshold mask at Otsu's cut, with the cut it chose. */
export function autoThresholdMask(px: Pixels, invert = false): { mask: Mask; threshold: number } {
  const threshold = otsuThreshold(px);
  return { mask: thresholdMask(px, threshold, invert), threshold };
}

/** What {@link colourClusters} returns: a cluster index per pixel, the centres, the pixel count per cluster and the background cluster. */
export interface Clusters {
  width: number;
  height: number;
  labels: Uint8Array;
  centres: [number, number, number][];
  counts: number[];
  /** The largest cluster, read as background. */
  background: number;
}

/** K-means on RGB: `k` clusters (2 to 16, default 4), `iterations` passes (default 8), centres seeded from pixels picked by `rng`. */
export function colourClusters(px: Pixels, o: { k?: number; iterations?: number; rng?: () => number } = {}): Clusters {
  const k = Math.max(2, Math.min(16, Math.round(o.k ?? 4)));
  const rng = o.rng ?? seeded(1);
  const n = px.width * px.height;
  const d = px.data;
  const centres: [number, number, number][] = [];
  for (let c = 0; c < k; c++) {
    const i = Math.min(n - 1, Math.floor(rng() * n)) * 4;
    centres.push([d[i]!, d[i + 1]!, d[i + 2]!]);
  }
  const labels = new Uint8Array(n);
  const assign = () => {
    for (let i = 0; i < n; i++) {
      let best = Infinity;
      let l = 0;
      for (let c = 0; c < k; c++) {
        const e = centres[c]!;
        const dd = (d[i * 4]! - e[0]) ** 2 + (d[i * 4 + 1]! - e[1]) ** 2 + (d[i * 4 + 2]! - e[2]) ** 2;
        if (dd < best) {
          best = dd;
          l = c;
        }
      }
      labels[i] = l;
    }
  };
  for (let it = 0; it < (o.iterations ?? 8); it++) {
    assign();
    const s = Array.from({ length: k }, () => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) {
      const t = s[labels[i]!]!;
      t[0]! += d[i * 4]!;
      t[1]! += d[i * 4 + 1]!;
      t[2]! += d[i * 4 + 2]!;
      t[3]!++;
    }
    s.forEach((t, c) => {
      if (t[3]) centres[c] = [t[0]! / t[3], t[1]! / t[3], t[2]! / t[3]];
    });
  }
  assign();
  const counts = new Array<number>(k).fill(0);
  for (const l of labels) counts[l]!++;
  return { width: px.width, height: px.height, labels, centres, counts, background: counts.indexOf(Math.max(...counts)) };
}

/** Everything but the largest colour cluster, as the mask studio's cluster button: `colourClusters` then a mask. */
export function clusterMask(px: Pixels, o: { k?: number; iterations?: number; rng?: () => number } = {}): Mask {
  const c = colourClusters(px, o);
  return { width: c.width, height: c.height, data: Uint8Array.from(c.labels, (l) => (l !== c.background ? 255 : 0)) };
}

/** One mask per cluster, largest first. */
export function clusterMasks(c: Clusters): Mask[] {
  return c.counts
    .map((count, i) => ({ count, i }))
    .filter((e) => e.count > 0)
    .sort((a, b) => b.count - a.count)
    .map(({ i }) => ({ width: c.width, height: c.height, data: Uint8Array.from(c.labels, (l) => (l === i ? 255 : 0)) }));
}

function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

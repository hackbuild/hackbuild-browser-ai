/**
 * Mask operations and mask export, as plain functions on `Mask` (0 to 255
 * per pixel, 128 and up counts as inside). The operations are the earlier
 * mask studio's set (union, subtract, invert, smooth, expand, shrink,
 * keep the largest piece); dilate and erode use an exact distance
 * transform, so a radius costs the same at any size and the image border
 * is not eaten. Exports: grey PNG, PNG with the mask as alpha, an SVG
 * outline, and COCO style run length JSON.
 */

import type { Mask, Pixels } from "./types.js";

const ON = 128;

function same(what: string, a: Mask, b: Mask): void {
  if (a.width !== b.width || a.height !== b.height) throw new RangeError(`${what}: masks are ${a.width} x ${a.height} and ${b.width} x ${b.height}`);
}

const make = (m: { width: number; height: number }, data: Uint8Array): Mask => ({ width: m.width, height: m.height, data });

/** An empty mask. */
export function emptyMask(width: number, height: number): Mask {
  return { width, height, data: new Uint8Array(width * height) };
}

/** Inside pixels (128 and up). */
export function maskArea(m: Mask): number {
  let n = 0;
  for (const v of m.data) if (v >= ON) n++;
  return n;
}

/** Every value to 0 or 255 at `t`. */
export function maskThreshold(m: Mask, t = ON): Mask {
  return make(m, m.data.map((v) => (v >= t ? 255 : 0)));
}

/** Pixels inside either mask, the larger value of each. Throws when the sizes differ. */
export function maskUnion(a: Mask, b: Mask): Mask {
  same("maskUnion", a, b);
  return make(a, a.data.map((v, i) => Math.max(v, b.data[i]!)));
}

/** Pixels inside both masks, the smaller value of each. Throws when the sizes differ. */
export function maskIntersect(a: Mask, b: Mask): Mask {
  same("maskIntersect", a, b);
  return make(a, a.data.map((v, i) => Math.min(v, b.data[i]!)));
}

/** `a` with `b` taken out (shift with a selection tool in the earlier mask studio). */
export function maskSubtract(a: Mask, b: Mask): Mask {
  same("maskSubtract", a, b);
  return make(a, a.data.map((v, i) => Math.min(v, 255 - b.data[i]!)));
}

/** The mask with inside and outside swapped, 255 minus each value. */
export function maskInvert(m: Mask): Mask {
  return make(m, m.data.map((v) => 255 - v));
}

const INF = 1e20;

/** Squared distance to the nearest source cell, exact (Felzenszwalb and Huttenlocher, 2012). */
function distance2(src: (i: number) => boolean, w: number, h: number): Float64Array {
  const d = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) d[i] = src(i) ? 0 : INF;
  const n = Math.max(w, h);
  const f = new Float64Array(n);
  const out = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const pass = (len: number, get: (k: number) => number, put: (k: number, x: number) => void) => {
    for (let q = 0; q < len; q++) f[q] = get(q);
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < len; q++) {
      let s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      while (s <= z[k]!) {
        k--;
        s = (f[q]! + q * q - (f[v[k]!]! + v[k]! * v[k]!)) / (2 * q - 2 * v[k]!);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < len; q++) {
      while (z[k + 1]! < q) k++;
      out[q] = (q - v[k]!) ** 2 + f[v[k]!]!;
    }
    for (let q = 0; q < len; q++) put(q, out[q]!);
  };
  for (let x = 0; x < w; x++)
    pass(
      h,
      (y) => d[y * w + x]!,
      (y, val) => (d[y * w + x] = val),
    );
  for (let y = 0; y < h; y++)
    pass(
      w,
      (x) => d[y * w + x]!,
      (x, val) => (d[y * w + x] = val),
    );
  return d;
}

/** Grow by a disc of radius `r` pixels (expand). */
export function maskDilate(m: Mask, r: number): Mask {
  if (r <= 0) return maskThreshold(m);
  const d = distance2((i) => m.data[i]! >= ON, m.width, m.height);
  return make(m, Uint8Array.from(d, (v) => (v <= r * r ? 255 : 0)));
}

/** Shrink by a disc of radius `r` pixels; the image border does not count as outside. */
export function maskErode(m: Mask, r: number): Mask {
  if (r <= 0) return maskThreshold(m);
  const d = distance2((i) => m.data[i]! < ON, m.width, m.height);
  return make(m, Uint8Array.from(d, (v) => (v > r * r ? 255 : 0)));
}

/** Soft edges: a gaussian of radius `r` with sigma r / 2 (the earlier mask studio's smooth, before its rethreshold), edges clamped. */
export function maskFeather(m: Mask, r: number): Mask {
  if (r <= 0) return make(m, m.data.slice());
  const { width: w, height: h } = m;
  const R = Math.ceil(r);
  const sig = r / 2;
  const k = new Float64Array(2 * R + 1);
  let sum = 0;
  for (let i = -R; i <= R; i++) sum += k[i + R] = Math.exp(-(i * i) / (2 * sig * sig));
  for (let i = 0; i < k.length; i++) k[i]! /= sum;
  const tmp = new Float64Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -R; i <= R; i++) v += m.data[y * w + Math.min(w - 1, Math.max(0, x + i))]! * k[i + R]!;
      tmp[y * w + x] = v;
    }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let v = 0;
      for (let i = -R; i <= R; i++) v += tmp[Math.min(h - 1, Math.max(0, y + i)) * w + x]! * k[i + R]!;
      out[y * w + x] = Math.round(v);
    }
  return make(m, out);
}

/** Keep only the largest connected piece (8 connected by default). */
export function maskLargestComponent(m: Mask, connectivity: 4 | 8 = 8): Mask {
  const { width: w, height: h } = m;
  const label = new Int32Array(w * h);
  const stack = new Int32Array(w * h);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let s = 0; s < w * h; s++) {
    if (label[s] || m.data[s]! < ON) continue;
    next++;
    let top = 0;
    let size = 0;
    stack[top++] = s;
    label[s] = next;
    while (top) {
      const i = stack[--top]!;
      size++;
      const x = i % w;
      const y = (i - x) / w;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if ((!dx && !dy) || (connectivity === 4 && dx && dy)) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (label[j] || m.data[j]! < ON) continue;
          label[j] = next;
          stack[top++] = j;
        }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  return make(m, Uint8Array.from(label, (l) => (best && l === best ? 255 : 0)));
}

/** Grey RGBA, opaque, for a canvas or a PNG. */
export function maskToRgba(m: Mask): Uint8ClampedArray {
  const out = new Uint8ClampedArray(m.width * m.height * 4);
  for (let i = 0; i < m.data.length; i++) {
    const v = m.data[i]!;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** The image's RGBA with the mask as alpha (the cutout). */
export function cutoutRgba(image: Pixels, m: Mask): Uint8ClampedArray {
  if (image.width !== m.width || image.height !== m.height) throw new RangeError(`cutoutRgba: image is ${image.width} x ${image.height}, mask ${m.width} x ${m.height}`);
  const out = new Uint8ClampedArray(image.data);
  for (let i = 0; i < m.data.length; i++) out[i * 4 + 3] = Math.min(out[i * 4 + 3]!, m.data[i]!);
  return out;
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (const v of b) c = CRC[(c ^ v) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** zlib with stored blocks, for runtimes without CompressionStream. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const blocks = Math.max(1, Math.ceil(raw.length / 65535));
  const out = new Uint8Array(2 + raw.length + blocks * 5 + 4);
  out[0] = 0x78;
  out[1] = 0x01;
  let o = 2;
  for (let b = 0; b < blocks; b++) {
    const s = b * 65535;
    const n = Math.min(65535, raw.length - s);
    out[o++] = b === blocks - 1 ? 1 : 0;
    out[o++] = n & 0xff;
    out[o++] = n >>> 8;
    out[o++] = ~n & 0xff;
    out[o++] = (~n >>> 8) & 0xff;
    out.set(raw.subarray(s, s + n), o);
    o += n;
  }
  let a = 1;
  let c = 0;
  for (const v of raw) {
    a = (a + v) % 65521;
    c = (c + a) % 65521;
  }
  new DataView(out.buffer).setUint32(o, ((c << 16) | a) >>> 0);
  return out;
}

async function zlib(raw: Uint8Array, compress: boolean): Promise<Uint8Array> {
  const CS = (globalThis as { CompressionStream?: new (f: string) => { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> } }).CompressionStream;
  if (!compress || !CS) return zlibStored(raw);
  const cs = new CS("deflate");
  const w = cs.writable.getWriter();
  void w.write(raw);
  void w.close();
  return new Uint8Array(await new Response(cs.readable).arrayBuffer());
}

/**
 * A PNG file from RGBA (4 channels) or grey (1 channel) bytes. Deflates
 * through CompressionStream where the runtime has one, stored blocks
 * otherwise or with `compress: false`.
 */
export async function encodePng(width: number, height: number, data: ArrayLike<number>, o: { channels?: 1 | 4; compress?: boolean } = {}): Promise<Uint8Array> {
  const ch = o.channels ?? 4;
  if (data.length < width * height * ch) throw new RangeError(`encodePng: ${data.length} bytes for ${width} x ${height} x ${ch}`);
  const row = width * ch;
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) for (let i = 0; i < row; i++) raw[y * (row + 1) + 1 + i] = data[y * row + i]!;
  const idat = await zlib(raw, o.compress ?? true);
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = ch === 4 ? 6 : 0;
  const chunks: [string, Uint8Array][] = [
    ["IHDR", ihdr],
    ["IDAT", idat],
    ["IEND", new Uint8Array(0)],
  ];
  const size = 8 + chunks.reduce((s, [, d]) => s + 12 + d.length, 0);
  const out = new Uint8Array(size);
  out.set([137, 80, 78, 71, 13, 10, 26, 10]);
  const ov = new DataView(out.buffer);
  let p = 8;
  for (const [t, d] of chunks) {
    ov.setUint32(p, d.length);
    const td = new Uint8Array(4 + d.length);
    for (let i = 0; i < 4; i++) td[i] = t.charCodeAt(i);
    td.set(d, 4);
    out.set(td, p + 4);
    ov.setUint32(p + 8 + d.length, crc32(td));
    p += 12 + d.length;
  }
  return out;
}

/** The mask as a grey PNG. */
export function maskToPng(m: Mask, o: { compress?: boolean } = {}): Promise<Uint8Array> {
  return encodePng(m.width, m.height, m.data, { ...o, channels: 1 });
}

/** The image with the mask as alpha, as a PNG (the cutout). */
export function cutoutPng(image: Pixels, m: Mask, o: { compress?: boolean } = {}): Promise<Uint8Array> {
  return encodePng(m.width, m.height, cutoutRgba(image, m), { ...o, channels: 4 });
}

/**
 * Outline loops along pixel edges, inside on the right going clockwise
 * in image space (y down); holes run the other way. Points are pixel
 * corners, collinear runs merged.
 */
export function maskOutline(m: Mask): [number, number][][] {
  const { width: w, height: h } = m;
  const W = w + 1;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && m.data[y * w + x]! >= ON;
  const out = new Map<number, number[]>();
  const edge = (ax: number, ay: number, bx: number, by: number) => {
    const k = ay * W + ax;
    const l = out.get(k);
    if (l) l.push(by * W + bx);
    else out.set(k, [by * W + bx]);
  };
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) edge(x, y, x + 1, y);
      if (!inside(x + 1, y)) edge(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) edge(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) edge(x, y + 1, x, y);
    }
  const loops: [number, number][][] = [];
  for (const start of [...out.keys()]) {
    while (out.get(start)?.length) {
      const pts: number[] = [start];
      let cur = start;
      for (;;) {
        const l = out.get(cur)!;
        const nx = l.pop()!;
        if (!l.length) out.delete(cur);
        if (nx === start) break;
        pts.push(nx);
        cur = nx;
      }
      const xy = pts.map((k): [number, number] => [k % W, Math.floor(k / W)]);
      const keep = xy.filter((p, i) => {
        const a = xy[(i - 1 + xy.length) % xy.length]!;
        const b = xy[(i + 1) % xy.length]!;
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0;
      });
      loops.push(keep);
    }
  }
  return loops;
}

/** The outline as an SVG file, one even odd path in image pixels. */
export function maskToSvg(m: Mask, o: { fill?: string } = {}): string {
  const d = maskOutline(m)
    .map((l) => `M${l.map((p) => `${p[0]} ${p[1]}`).join("L")}Z`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.width} ${m.height}" width="${m.width}" height="${m.height}"><path d="${d}" fill="${o.fill ?? "#000"}" fill-rule="evenodd"/></svg>`;
}

/** COCO style uncompressed run length: column major, the first run counts outside pixels. */
export interface MaskRle {
  size: [height: number, width: number];
  counts: number[];
}

/** The mask as COCO style uncompressed run length, column major, 128 and up inside. */
export function maskToRle(m: Mask): MaskRle {
  const { width: w, height: h } = m;
  const counts: number[] = [];
  let cur = false;
  let run = 0;
  for (let x = 0; x < w; x++)
    for (let y = 0; y < h; y++) {
      const v = m.data[y * w + x]! >= ON;
      if (v !== cur) {
        counts.push(run);
        run = 0;
        cur = v;
      }
      run++;
    }
  counts.push(run);
  return { size: [h, w], counts };
}

/** A mask from COCO style run length, inside 255. Throws when the counts do not cover the image. */
export function maskFromRle(r: MaskRle): Mask {
  const [h, w] = r.size;
  const data = new Uint8Array(w * h);
  let i = 0;
  r.counts.forEach((n, k) => {
    if (k % 2) for (let j = i; j < i + n; j++) data[(j % h) * w + Math.floor(j / h)] = 255;
    i += n;
  });
  if (i !== w * h) throw new RangeError(`maskFromRle: counts cover ${i} pixels of ${w * h}`);
  return { width: w, height: h, data };
}

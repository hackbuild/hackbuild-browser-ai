/**
 * Per instance export, as the mask studio's export row: for each
 * instance a cutout PNG (the image with the mask as alpha), a grey mask
 * PNG, and one JSON with every box, score, area and file name. Files come
 * back as name and bytes; zip or download them as the page likes.
 */

import { cutoutPng, maskBox, maskToPng } from "./masks.js";
import type { Box, Instance, Mask, Pixels } from "./types.js";

/** One exported file: its name, bytes and media type. */
export interface ExportFile {
  name: string;
  data: Uint8Array;
  type: "image/png" | "application/json";
}

/** One row of `instances.json`. */
export interface InstanceRow {
  index: number;
  label?: string;
  score: number;
  area: number;
  /** The instance box in source pixels, rounded to 0.01. */
  box: Box;
  /** The crop the PNGs cover, whole pixels; the full image when `crop` is false. */
  crop: Box;
  cutout: string;
  mask: string;
}

/** Options for {@link exportInstances}: crop the PNGs to each mask (default true), a file name prefix (default "instance"), PNG compression. */
export interface ExportInstancesOptions {
  crop?: boolean;
  prefix?: string;
  compress?: boolean;
}

function cropPixels(px: Pixels, b: Box): Pixels {
  const data = new Uint8ClampedArray(b.w * b.h * 4);
  for (let y = 0; y < b.h; y++) data.set(px.data.subarray(((b.y + y) * px.width + b.x) * 4, ((b.y + y) * px.width + b.x + b.w) * 4), y * b.w * 4);
  return { width: b.w, height: b.h, data };
}

function cropMask(m: Mask, b: Box): Mask {
  const data = new Uint8Array(b.w * b.h);
  for (let y = 0; y < b.h; y++) data.set(m.data.subarray((b.y + y) * m.width + b.x, (b.y + y) * m.width + b.x + b.w), y * b.w);
  return { width: b.w, height: b.h, data };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** The files for a set of instances: `<prefix>_<n>_cutout.png` and `<prefix>_<n>_mask.png` per non empty instance, then `instances.json`. */
export async function exportInstances(image: Pixels, instances: readonly Instance[], o: ExportInstancesOptions = {}): Promise<ExportFile[]> {
  const prefix = o.prefix ?? "instance";
  const crop = o.crop ?? true;
  const files: ExportFile[] = [];
  const rows: InstanceRow[] = [];
  const po = o.compress === undefined ? {} : { compress: o.compress };
  for (let i = 0; i < instances.length; i++) {
    const inst = instances[i]!;
    if (inst.mask.width !== image.width || inst.mask.height !== image.height) {
      throw new RangeError(`exportInstances: instance ${i + 1} mask is ${inst.mask.width} x ${inst.mask.height}, image ${image.width} x ${image.height}`);
    }
    const full = { x: 0, y: 0, w: image.width, h: image.height };
    const b = crop ? maskBox(inst.mask) : full;
    if (!b) continue;
    const n = i + 1;
    const cut = `${prefix}_${n}_cutout.png`;
    const mk = `${prefix}_${n}_mask.png`;
    const m = crop ? cropMask(inst.mask, b) : inst.mask;
    files.push({ name: cut, data: await cutoutPng(crop ? cropPixels(image, b) : image, m, po), type: "image/png" });
    files.push({ name: mk, data: await maskToPng(m, po), type: "image/png" });
    const row: InstanceRow = { index: n, score: r2(inst.score), area: inst.area, box: { x: r2(inst.box.x), y: r2(inst.box.y), w: r2(inst.box.w), h: r2(inst.box.h) }, crop: b, cutout: cut, mask: mk };
    if (inst.label !== undefined) row.label = inst.label;
    rows.push(row);
  }
  const json = JSON.stringify({ width: image.width, height: image.height, instances: rows }, null, 2);
  files.push({ name: `${prefix}s.json`, data: new TextEncoder().encode(json), type: "application/json" });
  return files;
}

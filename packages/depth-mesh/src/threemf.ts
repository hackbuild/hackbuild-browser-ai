/**
 * Multi colour 3MF in the Orca and Bambu dialect, ported from the
 * hackbuild-3mf writer: one object per print piece made of parts, each
 * part a mesh with its own extruder in Metadata/model_settings.config,
 * the object extruder beside them, one filament colour, type and preset
 * per slot in Metadata/project_settings.config, plus slice_info, the
 * filament sequence, content types and relationships. OrcaSlicer, Bambu
 * Studio and Flash Studio open such a file as one object with coloured
 * parts. The zip is store only with sorted names and one fixed time, so
 * equal input gives equal bytes.
 *
 * `reliefParts` cuts a relief into stacked closed bodies: one per height
 * band, or one per mask label, each a part with its own filament.
 */

import type { DepthMesh, Mesh } from "./core.js";

/** One part of an object: a closed mesh in mm (bed at z = 0) and its 1 based filament slot. */
export interface ThreeMfPart {
  name: string;
  mesh: Mesh;
  /** 1 based filament slot; filaments[filament - 1] colours it. */
  filament: number;
}

/** One object: its parts and where it sits on the bed, mm. */
export interface ThreeMfObject {
  name: string;
  parts: readonly ThreeMfPart[];
  /** Bed position of the object origin, mm. Default [128, 128, 0], the middle of a 256 mm bed (inferred). */
  at?: readonly [number, number, number];
}

/** One loaded filament slot. */
export interface ThreeMfFilament {
  /** "#RRGGBB". */
  color: string;
  /** Slicer filament type. Default "PLA". */
  type?: string;
  /** filament_settings_id; default "Generic <type>". */
  preset?: string;
}

/** Options for {@link toThreeMf}: title, application string, printer and process preset names, designer, licence and the zip date. */
export interface ThreeMfOptions {
  title?: string;
  /** Application string the slicer reads the dialect version from. Default "BambuStudio-01.10.01.50", the hackbuild-3mf gold. */
  app?: string;
  /** printer_settings_id, such as "Flashforge Creator 5 Pro 0.4 nozzle"; left out when absent so the slicer keeps its own. */
  printer?: string;
  /** print_settings_id, such as `0.20mm Standard @Flashforge Creator 5 Pro`; left out when absent. */
  process?: string;
  designer?: string;
  licence?: string;
  /** Zip time and the model dates. Default 2026-01-01, for equal bytes. */
  date?: Date;
}

const SUF = { object: "-61cb-4c03-9d28-80fed5dfa1dc", sub: "-81cb-4c03-9d28-80fed5dfa1dc", comp: "-b206-40ff-9872-83e8017abed1", item: "-b1ec-4553-aec9-835e5b724bb4" };
const BUILD_UUID = "2c7c17d8-22b5-4d84-8835-1976022ea369";
const FIRST_IDENTIFY_ID = 401;
const uuid = (n: number, s: string) => (n >>> 0).toString(16).padStart(8, "0") + s;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
/** Up to six decimals, no trailing zeros, no -0. */
const fmt = (v: number) => {
  const r = Math.round(v * 1e6) / 1e6;
  return Object.is(r, -0) ? "0" : String(r);
};
const HEX = /^#[0-9a-fA-F]{6}$/;

interface Planned {
  obj: ThreeMfObject;
  meshIds: number[];
  objId: number;
  at: readonly [number, number, number];
}

function plan(objects: readonly ThreeMfObject[]): Planned[] {
  let next = 1;
  return objects.map((obj) => {
    const meshIds = obj.parts.map(() => next++);
    return { obj, meshIds, objId: next++, at: obj.at ?? [128, 128, 0] };
  });
}

function meshXml(m: Mesh): string {
  const out: string[] = ["   <mesh>\n    <vertices>\n"];
  const p = m.positions;
  for (let k = 0; k < p.length; k += 3) out.push(`     <vertex x="${fmt(p[k]!)}" y="${fmt(p[k + 1]!)}" z="${fmt(p[k + 2]!)}"/>\n`);
  out.push("    </vertices>\n    <triangles>\n");
  const ix = m.indices;
  for (let k = 0; k < ix.length; k += 3) out.push(`     <triangle v1="${ix[k]!}" v2="${ix[k + 1]!}" v3="${ix[k + 2]!}"/>\n`);
  out.push("    </triangles>\n   </mesh>\n");
  return out.join("");
}

const transform = (at: readonly number[]) => `1 0 0 0 1 0 0 0 1 ${fmt(at[0]!)} ${fmt(at[1]!)} ${fmt(at[2]!)}`;

function modelXml(app: string, title: string, day: string, P: Planned[], designer: string, licence: string): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n',
    '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" ' +
      'xmlns:BambuStudio="http://schemas.bambulab.com/package/2021" ' +
      'xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p">\n',
  ];
  const meta: [string, string][] = [
    ["Application", app], ["BambuStudio:3mfVersion", "1"], ["Copyright", ""], ["CreationDate", day], ["Description", ""], ["Designer", designer],
    ["DesignerCover", ""], ["DesignerUserId", ""], ["License", licence], ["ModificationDate", day], ["Origin", ""], ["Title", title],
  ];
  for (const [k, v] of meta) out.push(` <metadata name="${k}">${esc(v)}</metadata>\n`);
  out.push(" <resources>\n");
  for (const p of P) {
    p.obj.parts.forEach((part, i) => {
      const mid = p.meshIds[i]!;
      out.push(`  <object id="${mid}" p:UUID="${uuid(mid, SUF.sub)}" type="model">\n`, meshXml(part.mesh), "  </object>\n");
    });
    out.push(`  <object id="${p.objId}" p:UUID="${uuid(p.objId, SUF.object)}" type="model">\n   <components>\n`);
    for (const mid of p.meshIds) out.push(`    <component objectid="${mid}" p:UUID="${uuid(mid, SUF.comp)}" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>\n`);
    out.push("   </components>\n  </object>\n");
  }
  out.push(` </resources>\n <build p:UUID="${BUILD_UUID}">\n`);
  P.forEach((p, n) => out.push(`  <item objectid="${p.objId}" p:UUID="${uuid(n + 1, SUF.item)}" transform="${transform(p.at)}" printable="1" auto_drop="1"/>\n`));
  out.push(" </build>\n</model>\n");
  return out.join("");
}

function modelSettingsXml(filaments: number, P: Planned[]): string {
  const out: string[] = ['<?xml version="1.0" encoding="UTF-8"?>\n<config>\n'];
  for (const p of P) {
    out.push(`  <object id="${p.objId}">\n    <metadata key="name" value="${esc(p.obj.name)}"/>\n    <metadata key="extruder" value="${p.obj.parts[0]!.filament}"/>\n`);
    p.obj.parts.forEach((part, i) => {
      out.push(
        `    <part id="${p.meshIds[i]!}" subtype="normal_part">\n` +
          `      <metadata key="name" value="${esc(part.name)}"/>\n` +
          '      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n' +
          `      <metadata key="source_file" value="${esc(p.obj.name)}.3mf"/>\n` +
          '      <metadata key="source_object_id" value="0"/>\n' +
          `      <metadata key="source_volume_id" value="${i}"/>\n` +
          '      <metadata key="source_offset_x" value="0"/>\n      <metadata key="source_offset_y" value="0"/>\n      <metadata key="source_offset_z" value="0"/>\n' +
          `      <metadata key="extruder" value="${part.filament}"/>\n` +
          `      <mesh_stat face_count="${part.mesh.indices.length / 3}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>\n` +
          "    </part>\n",
      );
    });
    out.push("  </object>\n");
  }
  out.push(
    '  <plate>\n    <metadata key="plater_id" value="1"/>\n    <metadata key="plater_name" value=""/>\n' +
      '    <metadata key="locked" value="false"/>\n    <metadata key="filament_map_mode" value="Auto For Flush"/>\n' +
      `    <metadata key="filament_maps" value="${Array.from({ length: filaments }, () => "1").join(" ")}"/>\n`,
  );
  P.forEach((p, i) => {
    out.push(`    <model_instance>\n      <metadata key="object_id" value="${p.objId}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${FIRST_IDENTIFY_ID + i}"/>\n    </model_instance>\n`);
  });
  out.push("  </plate>\n  <assemble>\n");
  for (const p of P) out.push(`   <assemble_item object_id="${p.objId}" instance_id="0" transform="${transform(p.at)}" offset="0 0 0" />\n`);
  out.push("  </assemble>\n</config>\n");
  return out.join("");
}

function sliceInfoXml(version: string, P: Planned[], F: Required<ThreeMfFilament>[]): string {
  const out: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <header>\n    <header_item key="X-BBL-Client-Type" value="slicer"/>\n' +
      `    <header_item key="X-BBL-Client-Version" value="${esc(version)}"/>\n  </header>\n  <plate>\n`,
  ];
  const meta: [string, string][] = [["index", "1"], ["printer_model_id", ""], ["nozzle_diameters", "0.4"], ["timelapse_type", "0"], ["prediction", "0"], ["weight", "0"], ["outside", "false"], ["support_used", "false"], ["label_object_enabled", "false"]];
  for (const [k, v] of meta) out.push(`    <metadata key="${k}" value="${esc(v)}"/>\n`);
  P.forEach((p, i) => out.push(`    <object identify_id="${FIRST_IDENTIFY_ID + i}" name="${esc(p.obj.name)}" skipped="false" />\n`));
  F.forEach((f, i) => out.push(`    <filament id="${i + 1}" tray_info_idx="" type="${esc(f.type)}" color="${esc(f.color)}" used_m="0" used_g="0" />\n`));
  out.push("  </plate>\n</config>\n");
  return out.join("");
}

const CONTENT_TYPES =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">\n' +
  ' <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>\n' +
  ' <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>\n' +
  ' <Default Extension="png" ContentType="image/png"/>\n</Types>\n';
const RELS =
  '<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  ' <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>\n</Relationships>\n';
const FILAMENT_SEQUENCE = '{"plate_1":{"nozzle_sequence":[],"optimal_assignment":[],"sequence":[]}}';

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
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A store only zip, names in sorted byte order, every entry at `date` (UTC fields). */
export function zipStore(entries: Record<string, string | Uint8Array>, date: Date): Uint8Array {
  const enc = new TextEncoder();
  const names = Object.keys(entries).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const dosTime = (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1);
  const dosDate = ((Math.max(1980, date.getUTCFullYear()) - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const name of names) {
    const v = entries[name]!;
    const data = typeof v === "string" ? enc.encode(v) : v;
    const nb = enc.encode(name);
    const crc = crc32(data);
    const l = new Uint8Array(30 + nb.length);
    const lv = new DataView(l.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(10, dosTime, true);
    lv.setUint16(12, dosDate, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nb.length, true);
    l.set(nb, 30);
    const c = new Uint8Array(46 + nb.length);
    const cv = new DataView(c.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, dosTime, true);
    cv.setUint16(14, dosDate, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nb.length, true);
    cv.setUint32(42, offset, true);
    c.set(nb, 46);
    locals.push(l, data);
    centrals.push(c);
    offset += l.length + data.length;
  }
  const csize = centrals.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, names.length, true);
  ev.setUint16(10, names.length, true);
  ev.setUint32(12, csize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + csize + 22);
  let p = 0;
  for (const b of [...locals, ...centrals, end]) {
    out.set(b, p);
    p += b.length;
  }
  return out;
}

/** The entries of a 3MF package by name, before zipping; {@link toThreeMf} zips them. Throws on a bad colour, a slot with no filament or an empty object. */
export function threeMfEntries(objects: readonly ThreeMfObject[], filaments: readonly ThreeMfFilament[], o: ThreeMfOptions = {}): Record<string, string> {
  if (!objects.length) throw new RangeError("toThreeMf: no objects");
  if (!filaments.length) throw new RangeError("toThreeMf: no filaments");
  const F = filaments.map((f, i) => {
    if (!HEX.test(f.color)) throw new RangeError(`toThreeMf: filament ${i + 1} colour ${JSON.stringify(f.color)} is not #RRGGBB`);
    const type = f.type ?? "PLA";
    return { color: f.color.toUpperCase(), type, preset: f.preset ?? `Generic ${type}` };
  });
  for (const ob of objects) {
    if (!ob.parts.length) throw new RangeError(`toThreeMf: object ${ob.name} has no parts`);
    for (const pt of ob.parts) {
      if (!Number.isInteger(pt.filament) || pt.filament < 1 || pt.filament > F.length) throw new RangeError(`toThreeMf: part ${pt.name} uses filament ${pt.filament}; there are ${F.length}`);
      if (!pt.mesh.indices.length) throw new RangeError(`toThreeMf: part ${pt.name} has no triangles`);
    }
  }
  const app = o.app ?? "BambuStudio-01.10.01.50";
  const version = app.replace(/^[^-]*-/, "");
  const date = o.date ?? new Date(Date.UTC(2026, 0, 1));
  const day = date.toISOString().slice(0, 10);
  const P = plan(objects);
  const ps: Record<string, unknown> = { from: "project", name: "project_settings", version };
  if (o.printer) {
    ps["printer_settings_id"] = o.printer;
    ps["printer_technology"] = "FFF";
    const m = /^(.+) (\d+(?:\.\d+)?) nozzle$/.exec(o.printer);
    if (m) {
      ps["printer_model"] = m[1];
      ps["printer_variant"] = m[2];
    }
  }
  if (o.process) ps["print_settings_id"] = o.process;
  ps["filament_colour"] = F.map((f) => f.color);
  ps["filament_settings_id"] = F.map((f) => f.preset);
  ps["filament_type"] = F.map((f) => f.type);
  const sorted: Record<string, unknown> = {};
  for (const k of Object.keys(ps).sort()) sorted[k] = ps[k];
  return {
    "3D/3dmodel.model": modelXml(app, o.title ?? objects[0]!.name, day, P, o.designer ?? "", o.licence ?? ""),
    "Metadata/filament_sequence.json": FILAMENT_SEQUENCE,
    "Metadata/model_settings.config": modelSettingsXml(F.length, P),
    "Metadata/project_settings.config": JSON.stringify(sorted, null, 4),
    "Metadata/slice_info.config": sliceInfoXml(version, P, F),
    "[Content_Types].xml": CONTENT_TYPES,
    "_rels/.rels": RELS,
  };
}

/** A multi colour 3MF file: objects of coloured parts, a filament per slot, the Orca and Bambu dialect, store only zip. */
export function toThreeMf(objects: readonly ThreeMfObject[], filaments: readonly ThreeMfFilament[], o: ThreeMfOptions = {}): Uint8Array {
  return zipStore(threeMfEntries(objects, filaments, o), o.date ?? new Date(Date.UTC(2026, 0, 1)));
}

/** A relief grid: heights in mm per cell, row 0 at the top of the image, and the cell size; `photoRelief` returns one. */
export interface ReliefGrid {
  heights: Float32Array;
  cols: number;
  rows: number;
  /** Cell size, mm. */
  px: number;
}

/** How {@link reliefParts} cuts a relief: by height bands, or by a label per cell. */
export type ReliefSplit =
  | {
      by: "height";
      /** Band tops in mm, ascending; n breaks make n + 1 bands, the last up to the top. */
      breaks: readonly number[];
    }
  | {
      by: "mask";
      /** One label per cell (0 to n - 1), row 0 at the top, the relief's cols by rows; or one mask per colour at any size, resampled (128 and up, or 1 in a 0 and 1 mask, is set), a later mask painting over an earlier one. */
      labels: Uint8Array | readonly { width: number; height: number; data: ArrayLike<number> }[];
    };

function labelGrid(labels: Uint8Array | readonly { width: number; height: number; data: ArrayLike<number> }[], cols: number, rows: number): { grid: Uint8Array; count: number } {
  if (labels instanceof Uint8Array) {
    if (labels.length !== cols * rows) throw new RangeError(`reliefParts: ${labels.length} labels for a ${cols} x ${rows} relief`);
    let max = 0;
    for (const l of labels) if (l > max) max = l;
    return { grid: labels, count: max + 1 };
  }
  // cells no mask holds stay with the first colour; later masks paint over earlier ones
  const grid = new Uint8Array(cols * rows);
  for (let j = 0; j < rows; j++)
    for (let i = 0; i < cols; i++) {
      for (let k = 0; k < labels.length; k++) {
        const m = labels[k]!;
        const x = Math.min(m.width - 1, Math.floor(((i + 0.5) / cols) * m.width));
        const y = Math.min(m.height - 1, Math.floor(((j + 0.5) / rows) * m.height));
        const v = m.data[y * m.width + x]!;
        if (v >= 128 || (v > 0 && v < 2)) grid[j * cols + i] = k;
      }
    }
  return { grid, count: labels.length };
}

/**
 * Cut a relief into closed bodies for a multi colour print: by height,
 * band i holds the cells above its floor, from the floor up to the lower
 * of the cell and the band top, so the bands stack; by mask, body k holds
 * the cells labelled k at full height. Each body is a part on filament
 * k + 1 (or `filaments[k]`). Empty bodies are left out. Centred on x and
 * y like `photoRelief`, image up is +y.
 */
export function reliefParts(dm: DepthMesh, r: ReliefGrid, split: ReliefSplit, o: { filaments?: readonly number[]; names?: readonly string[] } = {}): ThreeMfPart[] {
  const { heights, cols, rows, px } = r;
  if (heights.length !== cols * rows) throw new RangeError(`reliefParts: ${heights.length} heights for a ${cols} x ${rows} relief`);
  const n = cols * rows;
  const bodies: { h: Float32Array; z0: number }[] = [];
  if (split.by === "height") {
    const b = [...split.breaks];
    for (let i = 1; i < b.length; i++) if (!(b[i]! > b[i - 1]!)) throw new RangeError("reliefParts: breaks must rise");
    const floors = [0, ...b];
    floors.forEach((lo, i) => {
      const hi = i < b.length ? b[i]! : Infinity;
      const h = new Float32Array(n);
      for (let c = 0; c < n; c++) if (heights[c]! > lo) h[c] = Math.min(heights[c]!, hi) - lo;
      bodies.push({ h, z0: lo });
    });
  } else {
    const { grid, count } = labelGrid(split.labels, cols, rows);
    for (let k = 0; k < count; k++) {
      const h = new Float32Array(n);
      for (let c = 0; c < n; c++) if (grid[c] === k) h[c] = heights[c]!;
      bodies.push({ h, z0: 0 });
    }
  }
  const parts: ThreeMfPart[] = [];
  bodies.forEach(({ h, z0 }, k) => {
    if (!h.some((v) => v > 0)) return;
    const flipped = new Float32Array(n);
    for (let j = 0; j < rows; j++) flipped.set(h.subarray(j * cols, (j + 1) * cols), (rows - 1 - j) * cols);
    const mesh = dm.heightfieldMesh(flipped, cols, rows, px, (-cols * px) / 2, (-rows * px) / 2, z0);
    if (!mesh.indices.length) return;
    parts.push({ name: o.names?.[k] ?? (split.by === "height" ? `band ${k + 1}` : `colour ${k + 1}`), mesh, filament: o.filaments?.[k] ?? k + 1 });
  });
  return parts;
}

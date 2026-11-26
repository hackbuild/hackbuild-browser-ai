import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { glbMesh, loadDepthMesh, modelDepth, openEdges, posePositions, reliefParts, threeMfEntries, toThreeMf, type Mesh } from "@hackbuild/depth-mesh";

const root = join(import.meta.dirname, "..", "..", "..");
const dm = await loadDepthMesh({ bytes: new Uint8Array(readFileSync(join(root, "packages/depth-mesh/wasm/depth-mesh.wasm"))) });

/** Read a store only zip back by its central directory. */
function unzip(z: Uint8Array): Record<string, string> {
  const dv = new DataView(z.buffer, z.byteOffset, z.byteLength);
  const end = z.length - 22;
  expect(dv.getUint32(end, true)).toBe(0x06054b50);
  const count = dv.getUint16(end + 10, true);
  let p = dv.getUint32(end + 16, true);
  const out: Record<string, string> = {};
  for (let i = 0; i < count; i++) {
    expect(dv.getUint16(p + 10, true)).toBe(0);
    const size = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(z.subarray(p + 46, p + 46 + nl));
    const lo = dv.getUint32(p + 42, true);
    const lnl = dv.getUint16(lo + 26, true);
    out[name] = new TextDecoder().decode(z.subarray(lo + 30 + lnl, lo + 30 + lnl + size));
    p += 46 + nl;
  }
  return out;
}

/** A cube from 0 to s, twelve triangles facing out. */
function cube(s = 1, dz = 0): Mesh {
  const v = [0, 0, 0, s, 0, 0, s, s, 0, 0, s, 0, 0, 0, s, s, 0, s, s, s, s, 0, s, s].map((x, i) => (i % 3 === 2 ? x + dz : x));
  const f = [0, 2, 1, 0, 3, 2, 4, 5, 6, 4, 6, 7, 0, 1, 5, 0, 5, 4, 1, 2, 6, 1, 6, 5, 2, 3, 7, 2, 7, 6, 3, 0, 4, 3, 4, 7];
  return { positions: Float32Array.from(v), indices: Uint32Array.from(f) };
}

describe("multi colour 3mf", () => {
  it("writes the orca and bambu dialect with an extruder per part and a colour per slot", () => {
    const parts = [
      { name: "base", mesh: cube(10), filament: 1 },
      { name: "top", mesh: cube(10, 10), filament: 2 },
    ];
    const z = toThreeMf([{ name: "relief", parts }], [{ color: "#ffffff" }, { color: "#FE0386", type: "PETG" }], { printer: "Flashforge Creator 5 Pro 0.4 nozzle" });
    const e = unzip(z);
    expect(Object.keys(e)).toEqual(["3D/3dmodel.model", "Metadata/filament_sequence.json", "Metadata/model_settings.config", "Metadata/project_settings.config", "Metadata/slice_info.config", "[Content_Types].xml", "_rels/.rels"]);
    const model = e["3D/3dmodel.model"]!;
    expect(model).toContain('xmlns:BambuStudio="http://schemas.bambulab.com/package/2021"');
    expect(model.match(/<object id=/g)!.length).toBe(3);
    expect(model).toContain('<item objectid="3"');
    expect(model).toContain('transform="1 0 0 0 1 0 0 0 1 128 128 0"');
    const ms = e["Metadata/model_settings.config"]!;
    expect(ms).toMatch(/<object id="3">\s*<metadata key="name" value="relief"\/>\s*<metadata key="extruder" value="1"\/>/);
    expect(ms.match(/<metadata key="extruder" value="2"\/>/g)!.length).toBe(1);
    expect(ms).toContain('face_count="12"');
    const ps = JSON.parse(e["Metadata/project_settings.config"]!);
    expect(ps).toMatchObject({ filament_colour: ["#FFFFFF", "#FE0386"], filament_type: ["PLA", "PETG"], filament_settings_id: ["Generic PLA", "Generic PETG"], printer_model: "Flashforge Creator 5 Pro", printer_variant: "0.4" });
    expect(ps.layer_height).toBeUndefined();
    expect(e["Metadata/slice_info.config"]).toContain('<filament id="2" tray_info_idx="" type="PETG" color="#FE0386"');
    expect(toThreeMf([{ name: "relief", parts }], [{ color: "#ffffff" }, { color: "#FE0386", type: "PETG" }], { printer: "Flashforge Creator 5 Pro 0.4 nozzle" })).toEqual(z);
  });

  it("refuses a bad colour, a missing slot and an empty part", () => {
    const part = { name: "a", mesh: cube(), filament: 2 };
    expect(() => threeMfEntries([{ name: "x", parts: [part] }], [{ color: "#fff" }])).toThrow(/#RRGGBB/);
    expect(() => threeMfEntries([{ name: "x", parts: [part] }], [{ color: "#ffffff" }])).toThrow(/filament 2; there are 1/);
    expect(() => threeMfEntries([{ name: "x", parts: [{ ...part, filament: 1, mesh: { positions: new Float32Array(), indices: new Uint32Array() } }] }], [{ color: "#ffffff" }])).toThrow(/no triangles/);
  });

  it("cuts a relief into stacked closed height bands", () => {
    const cols = 6;
    const rows = 4;
    const heights = Float32Array.from({ length: cols * rows }, (_, i) => (i % cols < 3 ? 1 : 3));
    const parts = reliefParts(dm, { heights, cols, rows, px: 1 }, { by: "height", breaks: [2] });
    expect(parts.map((p) => [p.name, p.filament])).toEqual([["band 1", 1], ["band 2", 2]]);
    for (const p of parts) expect(openEdges(p.mesh.indices)).toBe(0);
    const zs = (m: Mesh) => Array.from(m.positions).filter((_, i) => i % 3 === 2);
    expect(Math.max(...zs(parts[0]!.mesh))).toBeCloseTo(2, 5);
    expect(Math.min(...zs(parts[1]!.mesh))).toBeCloseTo(2, 5);
    expect(Math.max(...zs(parts[1]!.mesh))).toBeCloseTo(3, 5);
    expect(reliefParts(dm, { heights, cols, rows, px: 1 }, { by: "height", breaks: [5] }).length).toBe(1);
    expect(() => reliefParts(dm, { heights, cols, rows, px: 1 }, { by: "height", breaks: [2, 1] })).toThrow(/rise/);
  });

  it("cuts a relief by mask labels, or by masks at another size", () => {
    const cols = 6;
    const rows = 4;
    const heights = new Float32Array(cols * rows).fill(1);
    const labels = Uint8Array.from({ length: cols * rows }, (_, i) => (i % cols < 2 ? 0 : 1));
    const a = reliefParts(dm, { heights, cols, rows, px: 1 }, { by: "mask", labels }, { filaments: [3, 1], names: ["rim", "face"] });
    expect(a.map((p) => [p.name, p.filament])).toEqual([["rim", 3], ["face", 1]]);
    const right = { width: 12, height: 8, data: Uint8Array.from({ length: 96 }, (_, i) => (i % 12 >= 6 ? 255 : 0)) };
    const b = reliefParts(dm, { heights, cols, rows, px: 1 }, { by: "mask", labels: [{ width: 1, height: 1, data: [255] }, right] });
    expect(b.length).toBe(2);
    const xs = (m: Mesh) => Array.from(m.positions).filter((_, i) => i % 3 === 0);
    expect(Math.min(...xs(b[1]!.mesh))).toBeCloseTo(0, 5);
  });
});

/** A one triangle GLB with a node translation, built by hand. */
function triangleGlb(): Uint8Array {
  const pos = Float32Array.from([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const ind = Uint16Array.from([0, 1, 2, 0]);
  const bin = new Uint8Array(44);
  bin.set(new Uint8Array(pos.buffer), 0);
  bin.set(new Uint8Array(ind.buffer), 36);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, translation: [2, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
    buffers: [{ byteLength: 44 }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 6 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }],
  };
  let js = new TextEncoder().encode(JSON.stringify(json));
  const pad = (4 - (js.length % 4)) % 4;
  js = Uint8Array.from([...js, ...new Array(pad).fill(0x20)]);
  const out = new Uint8Array(12 + 8 + js.length + 8 + bin.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, out.length, true);
  dv.setUint32(12, js.length, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(js, 20);
  dv.setUint32(20 + js.length, bin.length, true);
  dv.setUint32(24 + js.length, 0x004e4942, true);
  out.set(bin, 28 + js.length);
  return out;
}

describe("depth from a posed model", () => {
  it("reads a glb with its node transform and refuses compression", () => {
    const m = glbMesh(triangleGlb());
    expect([...m.positions]).toEqual([2, 0, 0, 3, 0, 0, 2, 1, 0]);
    expect([...m.indices]).toEqual([0, 1, 2]);
    expect(() => glbMesh(new Uint8Array(24))).toThrow(/magic/);
  });

  it("poses the up axis, yaw and pitch", () => {
    const p = posePositions(Float32Array.from([0, 0, 1]), { up: "z" });
    expect([...p].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([0, 1, 0]);
    const q = posePositions(Float32Array.from([1, 0, 0]), { yaw: 90 });
    expect(Math.round(q[2]!)).toBe(-1);
  });

  it("rasterises the nearest surface into the photo path's depth map shape", () => {
    // two cubes side by side; the right one is 1 nearer
    const a = cube(1);
    const b = cube(1, 1);
    const pb = b.positions.map((v, i) => (i % 3 === 0 ? v + 2 : v));
    const mesh = { positions: Float32Array.from([...a.positions, ...pb]), indices: Uint32Array.from([...a.indices, ...Array.from(b.indices, (i) => i + 8)]) };
    const d = modelDepth(mesh, { width: 30, margin: 0 });
    expect(d.width).toBe(30);
    expect(d.height).toBe(10);
    expect(d.range).toEqual([1, 2]);
    const row = 5 * 30;
    expect(d.data[row + 4]).toBeCloseTo(0.1, 5);
    expect(d.data[row + 25]).toBeCloseTo(1, 5);
    expect(d.cover[row + 15]).toBe(0);
    expect(d.data[row + 15]).toBe(0);
    expect(() => modelDepth({ positions: new Float32Array(), indices: new Uint32Array() }, { width: 4 })).toThrow(/no triangles/);
  });
});

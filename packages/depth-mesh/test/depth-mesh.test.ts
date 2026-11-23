import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { IDENTITY, bounds, cloudToPly, fitToPrint, loadDepthMesh, openEdges, toObj, toStl, trackGood, volume } from "@hackbuild/depth-mesh";
import { DEPTH_MESH_WASM_BASE64 } from "@hackbuild/depth-mesh/inline";

const root = join(import.meta.dirname, "..", "..", "..");
const fx = JSON.parse(readFileSync(join(root, "crates/depth-mesh/tests/parity.json"), "utf8")) as {
  depth: string;
  cloud: [number, string, string];
  relief: [string, number, number, string, string];
  nets: [number, string, string];
  icp: number[];
  modelLen: number;
  masks: string;
  carve: [number, string, string];
  rodrigues: number[];
};

function fnv(a: ArrayBufferView): string {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let h = 0xcbf29ce484222325n;
  for (const v of b) {
    h ^= BigInt(v);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

const dm = await loadDepthMesh({ bytes: new Uint8Array(readFileSync(join(root, "packages/depth-mesh/wasm/depth-mesh.wasm"))) });
const TT = { width: 80, height: 60, focal: 90, dist: 2.5, half: 0.6 };

describe("native and wasm parity", () => {
  test("every step gives the native bits", () => {
    expect(dm.simd).toBe(true);
    const depth = dm.synthDepth(96, 72);
    expect(fnv(depth)).toBe(fx.depth);
    const c = dm.cloud(depth, 96, 72, { near: 0.3, far: 1.2, focal: 80, stride: 2 });
    expect([c.count, fnv(c.positions), fnv(c.normals)]).toEqual(fx.cloud);
    const h = dm.relief(depth, { base: 0.4, height: 2.4, gamma: 1.2, bgcut: 0.1 });
    const healed = dm.healPinches(h, 96, 72);
    const m = dm.heightfieldMesh(h, 96, 72, 0.25, -12, -9, 1);
    expect([fnv(h), healed, m.indices.length / 3, fnv(m.positions), fnv(m.indices)]).toEqual(fx.relief);
    const d = 16;
    const field = Float32Array.from({ length: d * d * d }, (_, i) => {
      const x = (i % d) - 7.5;
      const y = (Math.floor(i / d) % d) - 7.5;
      const z = Math.floor(i / (d * d)) - 7.5;
      return Math.fround(5 - Math.sqrt(Math.fround(Math.fround(Math.fround(x * x) + Math.fround(Math.fround(y * y) * 1.5)) + Math.fround(z * z))));
    });
    const n = dm.surfaceNets(field, d, d, d, 1);
    expect([n.indices.length / 3, fnv(n.positions), fnv(n.indices)]).toEqual(fx.nets);
    const model = dm.model(0.01, 200_000);
    model.integrate(c);
    expect(model.size).toBe(fx.modelLen);
    const r = model.icp(c, { r: dm.rodrigues([0, 0.03, 0]), t: [0.01, 0, 0] }, { step: 1, iters: 12, maxDist: 0.03, normalDot: 0.5 });
    expect([...r.pose.r, ...r.pose.t, r.inliers, r.error]).toEqual(fx.icp);
    model.dispose();
    const angles = Array.from({ length: 12 }, (_, k) => (k * Math.PI) / 6);
    const masks = angles.map((a) => dm.synthBox(a, [0.3, 0.45, 0.2], TT));
    const all = new Uint8Array(masks.length * 80 * 60);
    masks.forEach((mk, i) => all.set(mk, i * 4800));
    expect(fnv(all)).toBe(fx.masks);
    const cv = dm.carve(masks, angles, TT, 24, 1);
    expect([cv.indices.length / 3, fnv(cv.positions), fnv(cv.indices)]).toEqual(fx.carve);
    expect(dm.rodrigues([0.1, -0.2, 0.3])).toEqual(fx.rodrigues);
  });
});

describe("geometry", () => {
  it("carves a closed box hull and exports it", () => {
    const angles = Array.from({ length: 16 }, (_, k) => (k * Math.PI) / 8);
    const masks = angles.map((a) => dm.morphOpen(dm.synthBox(a, [0.3, 0.45, 0.2], TT), 80, 60));
    const m = dm.carve(masks, angles, TT, 40, 1);
    expect(openEdges(m.indices)).toBe(0);
    const b = bounds(m.positions);
    expect(b.max[1]).toBeGreaterThan(0.38);
    expect(b.max[1]).toBeLessThan(0.52);
    const v = Math.abs(volume(m));
    expect(v).toBeGreaterThan(0.6 * 0.9 * 0.4 * 0.6);
    expect(v).toBeLessThan(0.6 * 0.9 * 0.4 * 1.3);
    const p = fitToPrint(m, 40);
    const pb = bounds(p.positions);
    expect(Math.max(...[0, 1, 2].map((k) => pb.max[k]! - pb.min[k]!))).toBeCloseTo(40, 3);
    const stl = toStl(p);
    expect(stl.length).toBe(84 + 50 * (m.indices.length / 3));
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(m.indices.length / 3);
    expect(toObj(m).split("\n")[1]).toMatch(/^v /);
  });

  it("builds a closed relief solid with outward faces", () => {
    const depth = dm.synthDepth(48, 36);
    const h = dm.relief(depth, { base: 0.4, height: 2.4, bgcut: 0.2 });
    expect(h.filter((v) => v > 0).length).toBeLessThan(48 * 36);
    expect(Math.max(...h)).toBeCloseTo(2.4, 5);
    const m = dm.heightfieldMesh(h, 48, 36, 0.5);
    expect(openEdges(m.indices)).toBe(0);
    expect(volume(m)).toBeGreaterThan(0);
    const masked = dm.relief(depth, { base: 0.4, height: 2.4, mask: Uint8Array.from(depth, (_, i) => (i % 48 < 24 ? 1 : 0)) });
    expect(masked[47]).toBe(0);
  });

  it("tracks the cloud back to identity and writes a point cloud ply", () => {
    const c = dm.cloud(dm.synthDepth(96, 72), 96, 72, { near: 0.3, far: 1.2, focal: 80, stride: 2 });
    const model = dm.model(0.01);
    model.integrate(c);
    const r = model.icp(c, { r: dm.rodrigues([0, 0.03, 0]), t: [0.01, 0, 0] }, { step: 1 });
    expect(trackGood(r, IDENTITY, c.count)).toBe(true);
    expect(trackGood({ ...r, pose: { r: dm.rodrigues([0, 0.5, 0]), t: [0, 0, 0] } }, IDENTITY, c.count)).toBe(false);
    const pts = model.points();
    expect(pts.count).toBe(model.size);
    model.dispose();
    const ply = cloudToPly(c);
    const head = new TextDecoder().decode(ply.subarray(0, 200));
    expect(head).toContain(`element vertex ${c.count}`);
    expect(ply.length).toBe(head.indexOf("end_header\n") + 11 + c.count * 24);
  });
});

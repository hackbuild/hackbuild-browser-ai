/**
 * Mesh export: binary STL (an earlier scan bench layout, scaled so the longest side is
 * the print size in mm and centred), OBJ, binary PLY for point clouds and
 * meshes, and checks a slicer cares about (bounds, open edges).
 */

import type { Cloud, Mesh } from "./core.js";

/** The smallest and largest x, y and z of a set of positions. */
export interface Bounds {
  min: [number, number, number];
  max: [number, number, number];
}

/** The axis aligned bounds of xyz positions. */
export function bounds(pos: Float32Array): Bounds {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const v = pos[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  return { min, max };
}

/** Centre the mesh and scale it so its longest side is `sizeMM` (as earlier builds did). */
export function fitToPrint(m: Mesh, sizeMM: number): Mesh {
  const b = bounds(m.positions);
  const dim = [0, 1, 2].map((k) => b.max[k]! - b.min[k]!);
  const sc = sizeMM / (Math.max(...dim) || 1);
  const ctr = [0, 1, 2].map((k) => (b.min[k]! + b.max[k]!) / 2);
  const p = new Float32Array(m.positions.length);
  for (let i = 0; i < p.length; i++) p[i] = (m.positions[i]! - ctr[i % 3]!) * sc;
  return { positions: p, indices: m.indices };
}

/** A binary STL of the mesh, with a face normal per triangle, in the mesh's own units. */
export function toStl(m: Mesh): Uint8Array {
  const nT = m.indices.length / 3;
  const buf = new ArrayBuffer(84 + nT * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, nT, true);
  let o = 84;
  const P = m.positions;
  for (let f = 0; f < nT; f++) {
    const [a, b, c] = [m.indices[f * 3]! * 3, m.indices[f * 3 + 1]! * 3, m.indices[f * 3 + 2]! * 3];
    const ux = P[b]! - P[a]!;
    const uy = P[b + 1]! - P[a + 1]!;
    const uz = P[b + 2]! - P[a + 2]!;
    const vx = P[c]! - P[a]!;
    const vy = P[c + 1]! - P[a + 1]!;
    const vz = P[c + 2]! - P[a + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const L = Math.hypot(nx, ny, nz) || 1;
    nx /= L;
    ny /= L;
    nz /= L;
    for (const v of [nx, ny, nz, P[a]!, P[a + 1]!, P[a + 2]!, P[b]!, P[b + 1]!, P[b + 2]!, P[c]!, P[c + 1]!, P[c + 2]!]) {
      dv.setFloat32(o, v, true);
      o += 4;
    }
    o += 2;
  }
  return new Uint8Array(buf);
}

/** A Wavefront OBJ text of the mesh: one object named `name`, vertices and faces. */
export function toObj(m: Mesh, name = "mesh"): string {
  const lines = [`o ${name}`];
  for (let i = 0; i < m.positions.length; i += 3) lines.push(`v ${m.positions[i]} ${m.positions[i + 1]} ${m.positions[i + 2]}`);
  for (let i = 0; i < m.indices.length; i += 3) lines.push(`f ${m.indices[i]! + 1} ${m.indices[i + 1]! + 1} ${m.indices[i + 2]! + 1}`);
  return lines.join("\n") + "\n";
}

/** Binary little endian PLY: vertices with optional normals and 0 to 1 colours, and faces when given. */
export function toPly(p: { positions: Float32Array; normals?: Float32Array; colors?: Float32Array; indices?: Uint32Array }): Uint8Array {
  const n = p.positions.length / 3;
  const f = p.indices ? p.indices.length / 3 : 0;
  let head = `ply\nformat binary_little_endian 1.0\nelement vertex ${n}\nproperty float x\nproperty float y\nproperty float z\n`;
  if (p.normals) head += "property float nx\nproperty float ny\nproperty float nz\n";
  if (p.colors) head += "property uchar red\nproperty uchar green\nproperty uchar blue\n";
  if (f) head += `element face ${f}\nproperty list uchar uint vertex_indices\n`;
  head += "end_header\n";
  const h = new TextEncoder().encode(head);
  const vb = 12 + (p.normals ? 12 : 0) + (p.colors ? 3 : 0);
  const out = new Uint8Array(h.length + n * vb + f * 13);
  out.set(h);
  const dv = new DataView(out.buffer);
  let o = h.length;
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < 3; k++, o += 4) dv.setFloat32(o, p.positions[i * 3 + k]!, true);
    if (p.normals) for (let k = 0; k < 3; k++, o += 4) dv.setFloat32(o, p.normals[i * 3 + k]!, true);
    if (p.colors) for (let k = 0; k < 3; k++, o++) dv.setUint8(o, Math.round(Math.max(0, Math.min(1, p.colors[i * 3 + k]!)) * 255));
  }
  for (let i = 0; i < f; i++) {
    dv.setUint8(o++, 3);
    for (let k = 0; k < 3; k++, o += 4) dv.setUint32(o, p.indices![i * 3 + k]!, true);
  }
  return out;
}

/** A binary PLY of a point cloud with its normals and, when given, 0 to 1 colours. */
export function cloudToPly(c: Cloud, colors?: Float32Array): Uint8Array {
  return toPly({ positions: c.positions, normals: c.normals, ...(colors ? { colors } : {}) });
}

/** Edges used by other than exactly two triangles; 0 for a closed manifold surface. */
export function openEdges(indices: Uint32Array): number {
  const m = new Map<string, number>();
  for (let i = 0; i < indices.length; i += 3)
    for (let k = 0; k < 3; k++) {
      const a = indices[i + k]!;
      const b = indices[i + ((k + 1) % 3)]!;
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
  let bad = 0;
  for (const v of m.values()) if (v !== 2) bad++;
  return bad;
}

/** Signed volume of a closed mesh (positive when faces wind outward). */
export function volume(m: Mesh): number {
  let v = 0;
  const P = m.positions;
  for (let i = 0; i < m.indices.length; i += 3) {
    const [a, b, c] = [m.indices[i]! * 3, m.indices[i + 1]! * 3, m.indices[i + 2]! * 3];
    v += P[a]! * (P[b + 1]! * P[c + 2]! - P[b + 2]! * P[c + 1]!) - P[a + 1]! * (P[b]! * P[c + 2]! - P[b + 2]! * P[c]!) + P[a + 2]! * (P[b]! * P[c + 1]! - P[b + 1]! * P[c]!);
  }
  return v / 6;
}

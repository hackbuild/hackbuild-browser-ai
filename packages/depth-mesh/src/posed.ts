/**
 * Depth from a posed 3D model, for the relief path: read the triangles of
 * a binary glTF (GLB), turn the model to a chosen pose (up axis, yaw,
 * pitch, roll), and rasterise its depth buffer through an orthographic
 * camera looking down -z into the same depth map shape the photo path
 * uses (0 to 1, larger is nearer, 0 off the model). It runs on the CPU
 * in TS, so it needs no WebGL and gives the same numbers everywhere.
 */

import type { Mesh } from "./core.js";

/** A pose for {@link modelDepth}: which model axis is up, then yaw about up, pitch about x, roll about the view axis, in degrees. */
export interface ModelPose {
  /** The model's up axis. Default "y" (glTF); "z" for CAD and STL exports. */
  up?: "y" | "z";
  yaw?: number;
  pitch?: number;
  roll?: number;
}

/** Options for {@link modelDepth}: the map width, the height (default from the posed aspect), the pose, the margin and the nearest and farthest values. */
export interface ModelDepthOptions {
  /** Map width, pixels. */
  width: number;
  /** Map height, pixels; default keeps the posed model's aspect. */
  height?: number;
  pose?: ModelPose;
  /** Empty border on each side, a share of the map. Default 0.04. */
  margin?: number;
  /** Depth of the farthest visible point, so it stays apart from the background at 0. Default 0.1. */
  floor?: number;
}

/** A depth map from a posed model: the photo path's shape, plus the covered pixels and the raw z range. */
export interface ModelDepth {
  width: number;
  height: number;
  /** 0 to 1 per pixel, larger nearer, 0 off the model. */
  data: Float32Array;
  /** 1 where the model covers the pixel. */
  cover: Uint8Array;
  /** Posed z of the farthest and nearest visible points, model units. */
  range: [far: number, near: number];
}

const rad = Math.PI / 180;

/** The positions turned to a pose: up axis to +y, then yaw, pitch and roll. */
export function posePositions(positions: Float32Array, pose: ModelPose = {}): Float32Array {
  const cy = Math.cos((pose.yaw ?? 0) * rad), sy = Math.sin((pose.yaw ?? 0) * rad);
  const cp = Math.cos((pose.pitch ?? 0) * rad), sp = Math.sin((pose.pitch ?? 0) * rad);
  const cr = Math.cos((pose.roll ?? 0) * rad), sr = Math.sin((pose.roll ?? 0) * rad);
  const zUp = pose.up === "z";
  const out = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    let x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (zUp) [y, z] = [z, -y];
    // yaw about y
    [x, z] = [cy * x + sy * z, -sy * x + cy * z];
    // pitch about x, positive tips the top toward the viewer
    [y, z] = [cp * y - sp * z, sp * y + cp * z];
    // roll about the view axis
    [x, y] = [cr * x - sr * y, sr * x + cr * y];
    out[i] = x;
    out[i + 1] = y;
    out[i + 2] = z;
  }
  return out;
}

/** Rasterise a mesh's depth at a pose into a depth map: orthographic, the model fitted inside the margin, nearest surface wins. */
export function modelDepth(mesh: Mesh, o: ModelDepthOptions): ModelDepth {
  const p = posePositions(mesh.positions, o.pose);
  if (!p.length || !mesh.indices.length) throw new RangeError("modelDepth: the mesh has no triangles");
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    x0 = Math.min(x0, p[i]!);
    x1 = Math.max(x1, p[i]!);
    y0 = Math.min(y0, p[i + 1]!);
    y1 = Math.max(y1, p[i + 1]!);
  }
  const W = Math.max(1, Math.round(o.width));
  const margin = o.margin ?? 0.04;
  const sw = Math.max(1e-9, x1 - x0);
  const sh = Math.max(1e-9, y1 - y0);
  const H = Math.max(1, Math.round(o.height ?? (W * sh) / sw));
  const scale = Math.min((W * (1 - 2 * margin)) / sw, (H * (1 - 2 * margin)) / sh);
  const ox = (W - sw * scale) / 2;
  const oy = (H - sh * scale) / 2;
  // image row 0 is the top, so y flips
  const sx = (x: number) => ox + (x - x0) * scale;
  const syf = (y: number) => H - (oy + (y - y0) * scale);
  const zbuf = new Float32Array(W * H).fill(-Infinity);
  const ix = mesh.indices;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
    const ax = sx(p[a]!), ay = syf(p[a + 1]!), az = p[a + 2]!;
    const bx = sx(p[b]!), by = syf(p[b + 1]!), bz = p[b + 2]!;
    const cx = sx(p[c]!), cy = syf(p[c + 1]!), cz = p[c + 2]!;
    const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(area) < 1e-12) continue;
    const minX = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
    const maxX = Math.min(W - 1, Math.ceil(Math.max(ax, bx, cx)));
    const minY = Math.max(0, Math.floor(Math.min(ay, by, cy)));
    const maxY = Math.min(H - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const px = x + 0.5, py = y + 0.5;
        const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
        const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const z = w0 * az + w1 * bz + w2 * cz;
        const i = y * W + x;
        if (z > zbuf[i]!) zbuf[i] = z;
      }
  }
  let far = Infinity, near = -Infinity;
  for (const z of zbuf)
    if (z > -Infinity) {
      if (z < far) far = z;
      if (z > near) near = z;
    }
  const floor = o.floor ?? 0.1;
  const span = near - far || 1;
  const data = new Float32Array(W * H);
  const cover = new Uint8Array(W * H);
  for (let i = 0; i < zbuf.length; i++) {
    const z = zbuf[i]!;
    if (z === -Infinity) continue;
    cover[i] = 1;
    data[i] = floor + (1 - floor) * ((z - far) / span);
  }
  return { width: W, height: H, data, cover, range: [far === Infinity ? 0 : far, near === -Infinity ? 0 : near] };
}

type Json = {
  scene?: number;
  scenes?: { nodes?: number[] }[];
  nodes?: { mesh?: number; children?: number[]; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[];
  meshes?: { primitives: { attributes: { POSITION?: number }; indices?: number; mode?: number; extensions?: Record<string, unknown> }[] }[];
  accessors?: { bufferView?: number; byteOffset?: number; componentType: number; count: number; type: string }[];
  bufferViews?: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[];
  extensionsRequired?: string[];
};

type M4 = number[];
const I4: M4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul(a: M4, b: M4): M4 {
  const o = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r]! += a[k * 4 + r]! * b[c * 4 + k]!;
  return o;
}
function trs(n: NonNullable<Json["nodes"]>[number]): M4 {
  if (n.matrix) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  // column major, as glTF stores matrices
  return [
    (1 - 2 * (qy! * qy! + qz! * qz!)) * sx!, 2 * (qx! * qy! + qz! * qw!) * sx!, 2 * (qx! * qz! - qy! * qw!) * sx!, 0,
    2 * (qx! * qy! - qz! * qw!) * sy!, (1 - 2 * (qx! * qx! + qz! * qz!)) * sy!, 2 * (qy! * qz! + qx! * qw!) * sy!, 0,
    2 * (qx! * qz! + qy! * qw!) * sz!, 2 * (qy! * qz! - qx! * qw!) * sz!, (1 - 2 * (qx! * qx! + qy! * qy!)) * sz!, 0,
    tx!, ty!, tz!, 1,
  ];
}

/**
 * The triangles of a GLB in one mesh, every node's world transform
 * applied: float POSITION and 8, 16 or 32 bit indices, triangle lists
 * only. Throws on Draco or meshopt compression, which this reader does
 * not decode; export the GLB without it.
 */
export function glbMesh(bytes: ArrayBuffer | Uint8Array): Mesh {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (u8.length < 20 || dv.getUint32(0, true) !== 0x46546c67) throw new Error("glbMesh: not a binary glTF (no glTF magic)");
  let off = 12;
  let json: Json | null = null;
  let bin: Uint8Array | null = null;
  while (off + 8 <= u8.length) {
    const len = dv.getUint32(off, true);
    const type = dv.getUint32(off + 4, true);
    const body = u8.subarray(off + 8, off + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(body)) as Json;
    else if (type === 0x004e4942) bin = body;
    off += 8 + len;
  }
  if (!json) throw new Error("glbMesh: no JSON chunk");
  const blocked = (json.extensionsRequired ?? []).filter((e) => /draco|meshopt/i.test(e));
  if (blocked.length) throw new Error(`glbMesh: ${blocked.join(", ")} compression is not decoded here; export the glb without it`);
  const J = json;
  const view = (ai: number) => {
    const a = J.accessors?.[ai];
    if (!a || a.bufferView === undefined || !bin) throw new Error(`glbMesh: accessor ${ai} has no data in the glb`);
    const bv = J.bufferViews![a.bufferView]!;
    return { a, base: bin.byteOffset + (bv.byteOffset ?? 0) + (a.byteOffset ?? 0), stride: bv.byteStride };
  };
  const pos: number[] = [];
  const idx: number[] = [];
  const bdv = bin ? new DataView(bin.buffer) : null;
  const addMesh = (mi: number, m: M4) => {
    for (const prim of J.meshes?.[mi]?.primitives ?? []) {
      if ((prim.mode ?? 4) !== 4 || prim.attributes.POSITION === undefined) continue;
      if (prim.extensions && Object.keys(prim.extensions).some((e) => /draco|meshopt/i.test(e))) throw new Error("glbMesh: a primitive is draco or meshopt compressed; export the glb without it");
      const { a, base, stride } = view(prim.attributes.POSITION);
      if (a.componentType !== 5126 || a.type !== "VEC3") throw new Error("glbMesh: POSITION must be float VEC3");
      const step = stride ?? 12;
      const first = pos.length / 3;
      for (let i = 0; i < a.count; i++) {
        const x = bdv!.getFloat32(base + i * step, true), y = bdv!.getFloat32(base + i * step + 4, true), z = bdv!.getFloat32(base + i * step + 8, true);
        pos.push(m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!);
      }
      if (prim.indices === undefined) for (let i = 0; i < a.count; i++) idx.push(first + i);
      else {
        const v = view(prim.indices);
        const size = v.a.componentType === 5125 ? 4 : v.a.componentType === 5123 ? 2 : 1;
        for (let i = 0; i < v.a.count; i++) {
          const at = v.base + i * size;
          idx.push(first + (size === 4 ? bdv!.getUint32(at, true) : size === 2 ? bdv!.getUint16(at, true) : bdv!.getUint8(at)));
        }
      }
    }
  };
  const walk = (ni: number, parent: M4) => {
    const n = J.nodes?.[ni];
    if (!n) return;
    const m = mul(parent, trs(n));
    if (n.mesh !== undefined) addMesh(n.mesh, m);
    for (const c of n.children ?? []) walk(c, m);
  };
  const roots = J.scenes?.[J.scene ?? 0]?.nodes;
  if (roots) for (const r of roots) walk(r, I4);
  else (J.meshes ?? []).forEach((_, i) => addMesh(i, I4));
  if (!idx.length) throw new Error("glbMesh: no triangles in the glb");
  return { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
}

/** The model's silhouette as an RGBA image (grey, opaque on the model, clear off it), the image `photoRelief` takes beside a {@link ModelDepth}. */
export function depthImage(d: ModelDepth): { width: number; height: number; data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(d.width * d.height * 4);
  for (let i = 0; i < d.cover.length; i++) {
    const v = Math.round(d.data[i]! * 255);
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v;
    data[i * 4 + 3] = d.cover[i] ? 255 : 0;
  }
  return { width: d.width, height: d.height, data };
}

// Loads the hackbuild-depth-mesh wasm core and wraps its extern "C"
// surface. Inputs are copied into wasm memory, results copied out.

/** Where {@link loadDepthMesh} gets the wasm core: a URL, the bytes, or base64 text such as `DEPTH_MESH_WASM_BASE64`. */
export type CoreSource = { url: string | URL } | { bytes: ArrayBuffer | Uint8Array } | { base64: string };

type Ptr = number;
interface Exports {
  memory: WebAssembly.Memory;
  dm_alloc(n: number): Ptr;
  dm_free(p: Ptr, n: number): void;
  dm_out_f32(): Ptr;
  dm_out_f32b(): Ptr;
  dm_out_u32(): Ptr;
  dm_out_f64(): Ptr;
  dm_out_len_f32(): number;
  dm_out_len_u32(): number;
  dm_simd(): number;
  dm_cloud(d: Ptr, w: number, h: number, near: number, far: number, focal: number, stride: number, dmin: number, dmax: number): number;
  dm_relief(v: Ptr, n: number, mask: Ptr, base: number, height: number, gamma: number, bgcut: number, invert: number): number;
  dm_heal(h: Ptr, w: number, ht: number): number;
  dm_heightfield(h: Ptr, w: number, ht: number, px: number, x0: number, y0: number, z0: number): number;
  dm_surface_nets(f: Ptr, dx: number, dy: number, dz: number, smooth: number): number;
  dm_carve(m: Ptr, a: Ptr, nv: number, w: number, h: number, focal: number, dist: number, half: number, n: number, smooth: number): number;
  dm_morph_open(m: Ptr, w: number, h: number): void;
  dm_model_new(voxel: number, cap: number): number;
  dm_model_drop(h: number): void;
  dm_model_len(h: number): number;
  dm_model_integrate(h: number, p: Ptr, n: Ptr, count: number, pose: Ptr): void;
  dm_model_icp(h: number, p: Ptr, n: Ptr, count: number, pose: Ptr, step: number, iters: number, maxD: number, normT: number): number;
  dm_model_points(h: number): number;
  dm_rodrigues(x: number, y: number, z: number): void;
  dm_synth_depth(w: number, h: number): void;
  dm_synth_box(theta: number, ex: number, ey: number, ez: number, w: number, h: number, focal: number, dist: number): void;
}

/** A triangle mesh: xyz positions and three indices per triangle. */
export interface Mesh {
  positions: Float32Array;
  indices: Uint32Array;
}

/** A point cloud: `count` xyz positions with a normal each. */
export interface Cloud {
  positions: Float32Array;
  normals: Float32Array;
  count: number;
}

/** Row major rotation (9) and translation (3). */
export interface Pose {
  r: number[];
  t: number[];
}

/** The pose with no rotation and no translation. */
export const IDENTITY: Pose = { r: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: [0, 0, 0] };

/** How {@link DepthMesh.cloud} maps depth to distance: near and far, focal length, and the pixel stride and depth range kept. */
export interface CloudOptions {
  /** Distance of depth 1, scene units. */
  near: number;
  /** Distance of depth 0. */
  far: number;
  /** Focal length in pixels at this depth map's width. */
  focal: number;
  stride?: number;
  dmin?: number;
  dmax?: number;
}

/** How {@link DepthMesh.relief} turns 0 to 1 values into heights in mm: range, gamma, background cut, invert and mask. */
export interface ReliefOptions {
  /** Lowest relief height, mm. */
  base: number;
  /** Highest relief height, mm. */
  height: number;
  gamma?: number;
  /** Background cut 0 to 0.98. */
  bgcut?: number;
  invert?: boolean;
  /** Nonzero cells are inside. */
  mask?: Uint8Array;
}

/** The turntable camera for {@link DepthMesh.carve}: image size, focal length, distance to the axis and the carved cube's half size. */
export interface Turntable {
  width: number;
  height: number;
  /** Focal length, pixels. */
  focal: number;
  /** Camera to axis distance, object units. */
  dist: number;
  /** Half size of the carved cube, object units. */
  half: number;
}

function b64(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(s, "base64"));
}

type Arr = Float32Array | Float64Array | Uint8Array;

/**
 * The core reads w * h (or dx * dy * dz) values from the pointer it is
 * given; a shorter array would make it read unrelated wasm memory.
 */
function grid(what: string, have: number, ...dims: number[]): void {
  for (const d of dims) if (!Number.isInteger(d) || d <= 0) throw new RangeError(`${what}: grid size ${dims.join(" x ")} must be positive integers`);
  const need = dims.reduce((a, b) => a * b, 1);
  if (have < need) throw new RangeError(`${what}: ${have} values for a ${dims.join(" x ")} grid, which needs ${need}`);
}

/** The loaded wasm core: depth to cloud, relief heights and solids, surface nets, silhouette carving and voxel models for ICP. Make one with {@link loadDepthMesh}. */
export class DepthMesh {
  readonly simd: boolean;
  constructor(private readonly x: Exports) {
    this.simd = x.dm_simd() === 1;
  }
  private put(a: Arr): Ptr {
    const p = this.x.dm_alloc(Math.max(1, a.byteLength));
    new Uint8Array(this.x.memory.buffer, p, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
    return p;
  }
  private with<R>(arrs: Arr[], fn: (...p: Ptr[]) => R): R {
    const ps = arrs.map((a) => this.put(a));
    try {
      return fn(...ps);
    } finally {
      arrs.forEach((a, i) => this.x.dm_free(ps[i]!, Math.max(1, a.byteLength)));
    }
  }
  private f32(n: number, b = false): Float32Array {
    return new Float32Array(this.x.memory.buffer, b ? this.x.dm_out_f32b() : this.x.dm_out_f32(), n).slice();
  }
  private u32(n: number): Uint32Array {
    return new Uint32Array(this.x.memory.buffer, this.x.dm_out_u32(), n).slice();
  }
  private f64(n: number): Float64Array {
    return new Float64Array(this.x.memory.buffer, this.x.dm_out_f64(), n).slice();
  }
  private mesh(): Mesh {
    return { positions: this.f32(this.x.dm_out_len_f32()), indices: this.u32(this.x.dm_out_len_u32()) };
  }

  /** Depth (0 to 1, larger nearer) to a camera space cloud with normals facing the camera. */
  cloud(depth: Float32Array, w: number, h: number, o: CloudOptions): Cloud {
    grid("cloud", depth.length, w, h);
    // the core clamps depth, and a clamp keeps NaN; a NaN depth is treated as background
    if (depth.some(Number.isNaN)) depth = depth.map((v) => (Number.isNaN(v) ? 0 : v));
    const n = this.with([depth], (p) => this.x.dm_cloud(p, w, h, o.near, o.far, o.focal, o.stride ?? 1, o.dmin ?? 0, o.dmax ?? 1));
    return { positions: this.f32(n * 3), normals: this.f32(n * 3, true), count: n };
  }
  /** Heights in mm, 0 where there is no relief. */
  relief(values: Float32Array, o: ReliefOptions): Float32Array {
    if (o.mask && o.mask.length !== values.length) throw new RangeError(`relief: mask has ${o.mask.length} cells, values have ${values.length}`);
    const args = [o.base, o.height, o.gamma ?? 1, o.bgcut ?? 0, o.invert ? 1 : 0] as const;
    const n = o.mask
      ? this.with([values, o.mask], (p, m) => this.x.dm_relief(p, values.length, m, ...args))
      : this.with([values], (p) => this.x.dm_relief(p, values.length, 0, ...args));
    return this.f32(n);
  }
  /** Fill corner to corner pinches in place; returns how many cells were filled. */
  healPinches(h: Float32Array, w: number, ht: number): number {
    grid("healPinches", h.length, w, ht);
    return this.with([h], (p) => {
      const n = this.x.dm_heal(p, w, ht);
      h.set(new Float32Array(this.x.memory.buffer, p, h.length));
      return n;
    });
  }
  /** Closed heightfield solid: cell size px, origin (x0, y0), on the plane z0. */
  heightfieldMesh(h: Float32Array, w: number, ht: number, px: number, x0 = 0, y0 = 0, z0 = 0): Mesh {
    grid("heightfieldMesh", h.length, w, ht);
    this.with([h], (p) => this.x.dm_heightfield(p, w, ht, px, x0, y0, z0));
    return this.mesh();
  }
  /** Surface nets over a field (inside above zero), after `smooth` box blurs. Vertices in grid units. */
  surfaceNets(field: Float32Array, dx: number, dy: number, dz: number, smooth = 0): Mesh {
    grid("surfaceNets", field.length, dx, dy, dz);
    this.with([field], (p) => this.x.dm_surface_nets(p, dx, dy, dz, smooth));
    return this.mesh();
  }
  /** Space carving from turntable silhouettes (one mask per angle, nonzero inside). Vertices in object units. */
  carve(masks: readonly Uint8Array[], angles: readonly number[], t: Turntable, resolution = 64, smooth = 1): Mesh {
    if (angles.length !== masks.length) throw new RangeError(`carve: ${masks.length} masks but ${angles.length} angles`);
    for (const m of masks) grid("carve", m.length, t.width, t.height);
    const all = new Uint8Array(masks.length * t.width * t.height);
    masks.forEach((m, i) => all.set(m, i * t.width * t.height));
    this.with([all, Float64Array.from(angles)], (m, a) => this.x.dm_carve(m, a, masks.length, t.width, t.height, t.focal, t.dist, t.half, resolution, smooth));
    return this.mesh();
  }
  /** Erode then dilate with a 3 by 3 square. */
  morphOpen(mask: Uint8Array, w: number, h: number): Uint8Array {
    grid("morphOpen", mask.length, w, h);
    this.with([mask], (p) => this.x.dm_morph_open(p, w, h));
    return Uint8Array.from(this.u32(w * h));
  }
  /** A voxel model for ICP tracking. Call `dispose` when done. */
  model(voxel: number, cap = 400_000): VoxelModel {
    return new VoxelModel(this.x, this.x.dm_model_new(voxel, cap), this);
  }
  rodrigues(w: [number, number, number]): number[] {
    this.x.dm_rodrigues(...w);
    return [...this.f64(9)];
  }
  /** Fixtures for tests and demos: a sphere depth map, and a box silhouette on a turntable. */
  synthDepth(w: number, h: number): Float32Array {
    this.x.dm_synth_depth(w, h);
    return this.f32(w * h);
  }
  synthBox(theta: number, extents: [number, number, number], t: Omit<Turntable, "half">): Uint8Array {
    this.x.dm_synth_box(theta, ...extents, t.width, t.height, t.focal, t.dist);
    return Uint8Array.from(this.u32(t.width * t.height));
  }
  /** @internal */
  _with<R>(arrs: Arr[], fn: (...p: Ptr[]) => R): R {
    return this.with(arrs, fn);
  }
  /** @internal */
  _f64(n: number): Float64Array {
    return this.f64(n);
  }
  /** @internal */
  _f32(n: number, b = false): Float32Array {
    return this.f32(n, b);
  }
}

const poseArr = (p: Pose) => Float64Array.from([...p.r, ...p.t]);

/** A voxel model a scan builds up: refine a frame's pose with `icp`, fold the frame in with `integrate`, read the points back, and `dispose` when done. */
export class VoxelModel {
  constructor(
    private readonly x: Exports,
    private readonly h: number,
    private readonly dm: DepthMesh,
  ) {}
  get size(): number {
    return this.x.dm_model_len(this.h);
  }
  integrate(c: Cloud, pose: Pose = IDENTITY): void {
    this.dm._with([c.positions, c.normals, poseArr(pose)], (p, n, q) => this.x.dm_model_integrate(this.h, p, n, c.count, q));
  }
  /** Refine a pose for a cloud: two stages, coarse at 2 maxDist then fine. */
  icp(c: Cloud, start: Pose = IDENTITY, o: { step?: number; iters?: number; maxDist?: number; normalDot?: number } = {}): { pose: Pose; inliers: number; error: number } {
    const step = o.step ?? Math.max(1, Math.floor(c.count / 3000));
    this.dm._with([c.positions, c.normals, poseArr(start)], (p, n, q) => this.x.dm_model_icp(this.h, p, n, c.count, q, step, o.iters ?? 12, o.maxDist ?? 0.03, o.normalDot ?? 0.5));
    const v = this.dm._f64(14);
    return { pose: { r: [...v.subarray(0, 9)], t: [...v.subarray(9, 12)] }, inliers: v[12]!, error: v[13]! };
  }
  points(): Cloud {
    const n = this.x.dm_model_points(this.h);
    return { positions: this.dm._f32(n * 3), normals: this.dm._f32(n * 3, true), count: n };
  }
  dispose(): void {
    this.x.dm_model_drop(this.h);
  }
}

/** The accept test for a tracked frame: enough inliers, low error, and no jump. */
export function trackGood(r: { inliers: number; error: number; pose: Pose }, prev: Pose, sampled: number, maxDist = 0.03): boolean {
  const tr = r.pose.r.reduce((a, v, i) => a + v * prev.r[i]!, 0);
  const ang = Math.acos(Math.max(-1, Math.min(1, (tr - 1) / 2)));
  const dt = Math.hypot(r.pose.t[0]! - prev.t[0]!, r.pose.t[1]! - prev.t[1]!, r.pose.t[2]! - prev.t[2]!);
  return r.inliers / Math.max(1, sampled) > 0.3 && r.error < maxDist * 0.8 && ang < 0.35 && dt < maxDist * 3;
}

/** Instantiate the depth-mesh wasm core from a URL, bytes or base64 and return a {@link DepthMesh}. Throws on an HTTP error when fetching. */
export async function loadDepthMesh(src: CoreSource): Promise<DepthMesh> {
  let bytes: Uint8Array;
  if ("bytes" in src) bytes = src.bytes instanceof Uint8Array ? src.bytes : new Uint8Array(src.bytes);
  else if ("base64" in src) bytes = b64(src.base64);
  else {
    const r = await fetch(src.url);
    if (!r.ok) throw new Error(`depth-mesh wasm: http ${r.status} for ${String(src.url)}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
  return new DepthMesh(instance.exports as unknown as Exports);
}

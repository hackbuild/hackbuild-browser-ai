// Loads the hackbuild-memory wasm core and wraps its extern "C" surface.
// Times cross the boundary in hours; this file converts nothing, the
// caller passes hours.

/** Item kinds, in the order of the Rust constants. */
export const KINDS = ["episode", "gist", "lesson", "fact", "rule", "lore", "doc", "note"] as const;
/** An item kind: episode, gist, lesson, fact, rule, lore, doc or note. */
export type Kind = (typeof KINDS)[number];
/** The core's number for a kind, its index in `KINDS`. */
export const kindCode = (k: Kind): number => KINDS.indexOf(k);

/** Where `loadCore` gets the wasm: a URL, the bytes, or inlined base64. */
export type CoreSource = { url: string | URL } | { bytes: ArrayBuffer | Uint8Array } | { base64: string };

interface Exports {
  memory: WebAssembly.Memory;
  hm_alloc(len: number): number;
  hm_free(ptr: number, len: number): void;
  hm_out_ptr(): number;
  hm_index_new(dim: number): number;
  hm_index_drop(h: number): void;
  hm_index_len(h: number): number;
  hm_upsert(...a: number[]): number;
  hm_remove(h: number, id: number): number;
  hm_recall(...a: number[]): number;
  hm_touch(h: number, id: number, now: number): number;
  hm_item(h: number, id: number): number;
  hm_find_dup(...a: number[]): number;
  hm_merge(h: number, keep: number, drop: number): number;
  hm_merge_near(h: number, threshold: number): number;
  hm_decay(h: number, now: number, floor: number): number;
  hm_retention(kind: number, ageH: number, uses: number): number;
  hm_exp(x: number): number;
  hm_ln(x: number): number;
  hm_simd(): number;
}

/** Numbers of one item as the core keeps them. Times in hours. */
export interface CoreItem {
  id: number;
  scope: number;
  kind: number;
  created: number;
  lastUsed: number;
  importance: number;
  arousal: number;
  valence: number;
  novelty: number;
  uses: number;
  weight: number;
  place?: [number, number, number] | undefined;
  text: string;
  vector?: Float32Array | undefined;
}

/** Recall parameters. Defaults are the values earlier builds used. */
export interface CoreParams {
  k1?: number;
  b?: number;
  rrfK?: number;
  cand?: number;
  k?: number;
  now: number;
  scorer?: "linear" | "organic";
  wRel?: number;
  wRec?: number;
  wImp?: number;
  tauH?: number;
  vecFloor?: number;
  valence?: number;
  place?: [number, number, number] | undefined;
  kinds?: number[] | undefined;
  scopes?: number[] | undefined;
}

/** One fused candidate and every term its score came from. */
export interface CoreHit {
  id: number;
  bm25Rank: number;
  vecRank: number;
  bm25: number;
  cos: number;
  rrf: number;
  rel: number;
  rec: number;
  imp: number;
  ret: number;
  score: number;
}

/** The number of float64 values per hit row the core writes, one per field of `CoreHit`. */
export const HIT_STRIDE = 11;

/** The parameter block layout read by params_from in crates/memory/src/lib.rs. */
export function paramBlock(p: CoreParams): Float64Array {
  const kinds = p.kinds ? p.kinds.reduce((m, k) => m | (1 << k), 0) >>> 0 : 0xffffffff;
  return Float64Array.from([
    p.k1 ?? 1.4,
    p.b ?? 0.75,
    p.rrfK ?? 60,
    p.cand ?? 18,
    p.k ?? 6,
    p.now,
    p.scorer === "organic" ? 1 : 0,
    p.wRel ?? 0.55,
    p.wRec ?? 0.2,
    p.wImp ?? 0.25,
    p.tauH ?? 72,
    p.vecFloor ?? 0.12,
    p.valence ?? 0,
    p.place ? 1 : 0,
    p.place?.[0] ?? 0,
    p.place?.[1] ?? 0,
    p.place?.[2] ?? 0,
    kinds,
  ]);
}

function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const enc = new TextEncoder();

/** The loaded core. One instance holds any number of indexes. */
export class Core {
  readonly simd: boolean;
  constructor(private readonly x: Exports) {
    this.simd = x.hm_simd() === 1;
  }

  private put(bytes: Uint8Array): [number, number] {
    if (bytes.byteLength === 0) return [0, 0];
    const p = this.x.hm_alloc(bytes.byteLength);
    new Uint8Array(this.x.memory.buffer, p, bytes.byteLength).set(bytes);
    return [p, bytes.byteLength];
  }

  /** Runs fn with each buffer copied into wasm memory, then frees them. */
  call<R>(bufs: (Uint8Array | null)[], fn: (flat: number[]) => R): R {
    const spans = bufs.map((b) => (b ? this.put(b) : ([0, 0] as [number, number])));
    try {
      return fn(spans.flat());
    } finally {
      for (const [p, n] of spans) if (n) this.x.hm_free(p, n);
    }
  }

  out(n: number): Float64Array {
    return new Float64Array(this.x.memory.buffer, this.x.hm_out_ptr(), n).slice();
  }

  get exports(): Exports {
    return this.x;
  }

  index(dim: number): CoreIndex {
    return new CoreIndex(this, this.x.hm_index_new(dim), dim);
  }

  retention(kind: number, ageH: number, uses: number): number {
    return this.x.hm_retention(kind, ageH, uses);
  }
  exp(x: number): number {
    return this.x.hm_exp(x);
  }
  ln(x: number): number {
    return this.x.hm_ln(x);
  }
}

const f32Bytes = (v: Float32Array | undefined | null): Uint8Array | null =>
  v && v.length ? new Uint8Array(v.buffer, v.byteOffset, v.byteLength) : null;
const txt = (s: string): Uint8Array | null => (s ? enc.encode(s) : null);

/** One index inside the core: a flat list of items with BM25 tokens and vectors. */
export class CoreIndex {
  constructor(
    private readonly core: Core,
    readonly handle: number,
    readonly dim: number,
  ) {}

  get size(): number {
    return this.core.exports.hm_index_len(this.handle);
  }

  upsert(it: CoreItem): void {
    const x = this.core.exports;
    const vec = it.vector && it.vector.length === this.dim ? it.vector : undefined;
    this.core.call([txt(it.text), f32Bytes(vec)], ([tp, tl, vp, vl]) => {
      x.hm_upsert(
        this.handle,
        it.id,
        it.scope,
        it.kind,
        it.created,
        it.lastUsed,
        it.importance,
        it.arousal,
        it.valence,
        it.novelty,
        it.uses,
        it.weight,
        it.place ? 1 : 0,
        it.place?.[0] ?? 0,
        it.place?.[1] ?? 0,
        it.place?.[2] ?? 0,
        tp!,
        tl!,
        vp!,
        vl! / 4,
      );
    });
  }

  remove(id: number): boolean {
    return this.core.exports.hm_remove(this.handle, id) === 1;
  }

  recall(query: string, vec: Float32Array | null, p: CoreParams): CoreHit[] {
    const x = this.core.exports;
    const block = paramBlock(p);
    const scopes = Uint32Array.from(p.scopes ?? []);
    const n = this.core.call(
      [txt(query), f32Bytes(vec), new Uint8Array(block.buffer), scopes.length ? new Uint8Array(scopes.buffer) : null],
      ([qp, ql, vp, vl, pp, pl, sp, sl]) =>
        x.hm_recall(this.handle, qp!, ql!, vp!, vl! / 4, pp!, pl! / 8, sp!, sl! / 4),
    );
    const o = this.core.out(n * HIT_STRIDE);
    const hits: CoreHit[] = [];
    for (let i = 0; i < n; i++) {
      const r = o.subarray(i * HIT_STRIDE, (i + 1) * HIT_STRIDE);
      hits.push({
        id: r[0]!,
        bm25Rank: r[1]!,
        vecRank: r[2]!,
        bm25: r[3]!,
        cos: r[4]!,
        rrf: r[5]!,
        rel: r[6]!,
        rec: r[7]!,
        imp: r[8]!,
        ret: r[9]!,
        score: r[10]!,
      });
    }
    return hits;
  }

  /** Raw hits as the out buffer holds them, for the parity test. */
  recallRaw(query: string, vec: Float32Array | null, block: Float64Array, scopes: Uint32Array): Float64Array {
    const x = this.core.exports;
    const n = this.core.call(
      [txt(query), f32Bytes(vec), new Uint8Array(block.buffer), scopes.length ? new Uint8Array(scopes.buffer) : null],
      ([qp, ql, vp, vl, pp, pl, sp, sl]) =>
        x.hm_recall(this.handle, qp!, ql!, vp!, vl! / 4, pp!, pl! / 8, sp!, sl! / 4),
    );
    return this.core.out(n * HIT_STRIDE);
  }

  touch(id: number, nowH: number): boolean {
    return this.core.exports.hm_touch(this.handle, id, nowH) === 1;
  }

  /** created, lastUsed, importance, arousal, valence, novelty, uses, weight. */
  numbers(id: number): Float64Array | null {
    return this.core.exports.hm_item(this.handle, id) === 1 ? this.core.out(8) : null;
  }

  findDup(text: string, vec: Float32Array | null, kind: number, scope: number, nowH: number, windowH: number, threshold: number): number | null {
    const x = this.core.exports;
    const v = vec && vec.length === this.dim ? vec : null;
    const r = this.core.call([txt(text), f32Bytes(v)], ([tp, tl, vp, vl]) =>
      x.hm_find_dup(this.handle, tp!, tl!, vp!, vl! / 4, kind, scope, nowH, windowH, threshold),
    );
    return r < 0 ? null : r;
  }

  merge(keep: number, drop: number): boolean {
    return this.core.exports.hm_merge(this.handle, keep, drop) === 1;
  }

  /** Merges near duplicates; returns [kept, dropped] pairs. */
  mergeNear(threshold: number): [number, number][] {
    const n = this.core.exports.hm_merge_near(this.handle, threshold);
    const o = this.core.out(n * 2);
    const pairs: [number, number][] = [];
    for (let i = 0; i < n; i++) pairs.push([o[2 * i]!, o[2 * i + 1]!]);
    return pairs;
  }

  /** Drops items under the retention floor; returns their ids. */
  decay(nowH: number, floor: number): number[] {
    const n = this.core.exports.hm_decay(this.handle, nowH, floor);
    return Array.from(this.core.out(n));
  }

  dispose(): void {
    this.core.exports.hm_index_drop(this.handle);
  }
}

/**
 * Instantiates the core from a URL, bytes, or inlined base64. A URL is
 * fetched as an ArrayBuffer and instantiated from bytes, which also works
 * from file:// pages that refuse instantiateStreaming.
 */
export async function loadCore(src: CoreSource, opts: { fetch?: typeof fetch } = {}): Promise<Core> {
  let bytes: Uint8Array | ArrayBuffer;
  if ("url" in src) {
    const f = opts.fetch ?? fetch;
    const res = await f(String(src.url));
    if (!res.ok) throw new Error(`memory core: fetch ${String(src.url)} returned ${res.status}`);
    bytes = await res.arrayBuffer();
  } else if ("bytes" in src) {
    bytes = src.bytes;
  } else {
    bytes = base64Bytes(src.base64);
  }
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
  return new Core(instance.exports as unknown as Exports);
}

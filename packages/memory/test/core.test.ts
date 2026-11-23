import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { kindCode, loadCore, paramBlock } from "@hackbuild/memory";

const wasm = readFileSync(join(import.meta.dirname, "..", "wasm", "memory.wasm"));
const base = { scope: 0, created: 0, lastUsed: 0, importance: 0.4, arousal: 0, valence: 0, novelty: 0, uses: 0, weight: 1 };

describe("core wrapper", async () => {
  const core = await loadCore({ bytes: new Uint8Array(wasm) });

  test("loads from a url through an injected fetch", async () => {
    const c = await loadCore({ url: "file:///memory.wasm" }, { fetch: (async () => new Response(wasm)) as unknown as typeof fetch });
    expect(c.simd).toBe(true);
    await expect(loadCore({ url: "x" }, { fetch: (async () => new Response("", { status: 404 })) as unknown as typeof fetch })).rejects.toThrow(/404/);
  });

  test("fuses keyword and vector hits by reciprocal rank", () => {
    const ix = core.index(4);
    ix.upsert({ ...base, id: 1, kind: 3, text: "the mug lives on the shelf", vector: Float32Array.of(1, 0, 0, 0) });
    ix.upsert({ ...base, id: 2, kind: 3, text: "a cup in the cupboard", vector: Float32Array.of(0.9, 0.1, 0, 0) });
    ix.upsert({ ...base, id: 3, kind: 3, text: "dog by the door", vector: Float32Array.of(0, 0, 1, 0) });
    expect(ix.size).toBe(3);
    const hits = ix.recall("mug", Float32Array.of(1, 0, 0, 0), { now: 1 });
    expect(hits.map((h) => h.id)).toEqual([1, 2]);
    expect(hits[0]!.bm25Rank).toBe(0);
    expect(hits[0]!.vecRank).toBe(0);
    expect(hits[0]!.rrf).toBeCloseTo(2 / 61, 15);
    expect(hits[1]!.bm25Rank).toBe(-1);
    expect(ix.recall("mug", null, { now: 1 }).map((h) => h.id)).toEqual([1]);
    ix.dispose();
  });

  test("filters by scope and kind", () => {
    const ix = core.index(0);
    ix.upsert({ ...base, id: 1, scope: 2, kind: 0, text: "red ball" });
    ix.upsert({ ...base, id: 2, scope: 0, kind: 3, text: "red ball" });
    expect(ix.recall("ball", null, { now: 0, scopes: [2] }).map((h) => h.id)).toEqual([1]);
    expect(ix.recall("ball", null, { now: 0, kinds: [kindCode("fact")] }).map((h) => h.id)).toEqual([2]);
  });

  test("touch strengthens, decay drops old episodes, rules stay", () => {
    const ix = core.index(0);
    ix.upsert({ ...base, id: 1, kind: kindCode("episode"), text: "old" });
    ix.upsert({ ...base, id: 2, kind: kindCode("rule"), text: "rule" });
    ix.touch(2, 3);
    const n = ix.numbers(2)!;
    expect([n[1], n[6], n[7]]).toEqual([3, 1, 1.02]);
    expect(ix.decay(60, 0.05)).toEqual([1]);
    expect(ix.numbers(1)).toBeNull();
  });

  test("finds and merges near duplicates", () => {
    const ix = core.index(2);
    ix.upsert({ ...base, id: 5, kind: 3, created: 3, text: "a", vector: Float32Array.of(1, 0) });
    ix.upsert({ ...base, id: 6, kind: 3, created: 1, text: "b", vector: Float32Array.of(1, 0.01) });
    expect(ix.findDup("a", Float32Array.of(1, 0.001), 3, 0, 3, 0, 0.93)).toBe(5);
    expect(ix.findDup("zzz", null, 3, 0, 3, 0, 0.93)).toBeNull();
    expect(ix.mergeNear(0.95)).toEqual([[6, 5]]);
    expect(ix.size).toBe(1);
  });

  test("retention halves at the kind half-life", () => {
    expect(core.retention(kindCode("episode"), 6, 0)).toBeCloseTo(0.5, 12);
    expect(core.retention(kindCode("gist"), 96, 0)).toBeCloseTo(0.5, 12);
    expect(core.retention(kindCode("lore"), 1e6, 0)).toBe(1);
  });

  test("parameter block defaults", () => {
    const b = paramBlock({ now: 5 });
    expect(Array.from(b.slice(0, 6))).toEqual([1.4, 0.75, 60, 18, 6, 5]);
    expect(b[17]).toBe(0xffffffff);
    expect(paramBlock({ now: 0, kinds: [0, 3] })[17]).toBe(9);
  });
});

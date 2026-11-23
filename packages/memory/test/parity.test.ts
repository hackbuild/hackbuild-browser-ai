// The wasm half of the native and wasm parity check: crates/memory/tests/parity.rs
// writes inputs and native results to parity.json; the wasm build must give the same bits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadCore } from "@hackbuild/memory";
import { MEMORY_WASM_BASE64 } from "@hackbuild/memory/inline";

const root = join(import.meta.dirname, "..", "..", "..");
const fixture = JSON.parse(readFileSync(join(root, "crates/memory/tests/parity.json"), "utf8")) as {
  dim: number;
  items: { id: number; scope: number; kind: number; text: string; num: number[]; vec: number[] }[];
  queries: { q: string; vec: number[]; params: number[]; scopes: number[]; hits: number[] }[];
  math: number[][];
};
const wasm = readFileSync(join(root, "packages/memory/wasm/memory.wasm"));

describe("native and wasm parity", async () => {
  const core = await loadCore({ bytes: new Uint8Array(wasm) });
  const ix = core.index(fixture.dim);
  for (const it of fixture.items) {
    const n = it.num;
    ix.upsert({
      id: it.id,
      scope: it.scope,
      kind: it.kind,
      text: it.text,
      created: n[0]!,
      lastUsed: n[1]!,
      importance: n[2]!,
      arousal: n[3]!,
      valence: n[4]!,
      novelty: n[5]!,
      uses: n[6]!,
      weight: n[7]!,
      place: n[8] === 1 ? [n[9]!, n[10]!, n[11]!] : undefined,
      vector: it.vec.length ? Float32Array.from(it.vec) : undefined,
    });
  }

  test("the wasm build runs the simd128 dot product", () => {
    expect(core.simd).toBe(true);
  });

  test("the inlined base64 holds the same bytes as wasm/memory.wasm", () => {
    expect(Buffer.from(MEMORY_WASM_BASE64, "base64").equals(wasm)).toBe(true);
  });

  test.each(fixture.queries.map((q, i) => [i, q] as const))("query %i gives the native bits", (_i, q) => {
    const got = ix.recallRaw(q.q, q.vec.length ? Float32Array.from(q.vec) : null, Float64Array.from(q.params), Uint32Array.from(q.scopes));
    expect(Array.from(got)).toEqual(q.hits);
    for (let j = 0; j < got.length; j++) expect(Object.is(got[j], q.hits[j])).toBe(true);
  });

  test("the fixture holds hits for most queries", () => {
    expect(fixture.queries.filter((q) => q.hits.length > 0).length).toBeGreaterThanOrEqual(8);
  });

  test("exp and ln agree with the native build", () => {
    for (const [x, e, l] of fixture.math) {
      expect(Object.is(core.exp(x!), e)).toBe(true);
      expect(Object.is(core.ln(Math.abs(x!) + 0.5), l)).toBe(true);
    }
  });

  test("the base64 copy loads", async () => {
    const c2 = await loadCore({ base64: MEMORY_WASM_BASE64 });
    expect(c2.retention(0, 6, 0)).toBeCloseTo(0.5, 12);
  });
});

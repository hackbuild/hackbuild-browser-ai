// The wasm half of the native and wasm parity check: crates/character/tests/parity.rs
// writes inputs and native outputs to parity.json; the wasm build must give the same bytes.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadCharacterCore, type RawOp } from "@hackbuild/character";

const root = join(import.meta.dirname, "..", "..", "..");
const fixture = JSON.parse(readFileSync(join(root, "crates/character/tests/parity.json"), "utf8")) as {
  cases: { op: RawOp; n: number; code: number; a: string; b: string; out: string }[];
};
const wasm = readFileSync(join(root, "packages/character/wasm/character.wasm"));
const from = (s: string) => new Uint8Array(Buffer.from(s, "base64"));

describe("native and wasm parity", async () => {
  const core = await loadCharacterCore({ bytes: new Uint8Array(wasm) });
  test("the fixture has cases of every operation", () => {
    expect(new Set(fixture.cases.map((c) => c.op)).size).toBe(9);
    expect(fixture.cases.some((c) => c.code === 1)).toBe(true);
  });
  fixture.cases.forEach((c, i) => {
    test(`case ${i}: ${c.op}`, () => {
      const r = core.raw(c.op, from(c.a), from(c.b), c.n);
      expect(r.code).toBe(c.code);
      expect(Buffer.from(r.out).toString("base64")).toBe(c.out);
    });
  });
});

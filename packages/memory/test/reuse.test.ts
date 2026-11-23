import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, describe, expect, test } from "vitest";
import { type Core, hashedEmbedder, indexedDbSink, loadCore, memorySink, open, type MemorySink } from "@hackbuild/memory";

let core: Core;
beforeAll(async () => {
  core = await loadCore({ bytes: new Uint8Array(readFileSync(join(import.meta.dirname, "..", "wasm", "memory.wasm"))) });
});

const rockets = {
  format: "hackbuild-memory" as const,
  version: 1 as const,
  id: "x",
  core: [],
  items: [{ id: 99, text: "rockets launch into orbit", kind: "fact" as const, scope: "self", created: 1e12, lastUsed: 1e12, importance: 0.4, arousal: 0, valence: 0, novelty: 0, uses: 0, weight: 1 }],
};

async function scenario(sink: () => Promise<MemorySink>) {
  const embed = hashedEmbedder(64);
  const m1 = await open("a", { core, sink: await sink(), embed, now: () => 1e12 });
  const a = await m1.add("cats purr softly on the mat");
  await m1.remove([a.id]);
  const m2 = await open("a", { core, sink: await sink(), embed, now: () => 1e12 });
  await m2.import(rockets);
  const [it] = m2.all();
  expect(it!.id).not.toBe(a.id);
  const r = await m2.recall("cats purr softly on the mat", { strengthen: false });
  for (const t of r.trace) expect(t.cos ?? 0).toBeLessThan(0.99);
}

describe("delete, reopen and recall", () => {
  test("memory sink: a removed item's vector is gone and its id is not reused", async () => {
    const s = memorySink();
    await scenario(async () => s);
  });
  test("indexeddb sink: the same", async () => {
    const f = new IDBFactory();
    await scenario(() => indexedDbSink("reuse", { indexedDB: f }));
  });
  test("import refuses an unknown kind", async () => {
    const m = await open("k", { core, sink: memorySink(), now: () => 1e12 });
    const bad = { ...rockets, items: [{ ...rockets.items[0]!, kind: "bogus" as never }] };
    await expect(m.import(bad)).rejects.toThrow(/unknown kind/);
  });
});

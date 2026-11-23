import { readFileSync } from "node:fs";
import { join } from "node:path";
import { IDBFactory } from "fake-indexeddb";
import { beforeAll, describe, expect, test } from "vitest";
import { type Core, type Embedder, hashedEmbedder, indexedDbSink, loadCore, memorySink, open } from "@hackbuild/memory";

const HOUR = 3_600_000;
let core: Core;
beforeAll(async () => {
  core = await loadCore({ bytes: new Uint8Array(readFileSync(join(import.meta.dirname, "..", "wasm", "memory.wasm"))) });
});

function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

/** Counts embed calls; a throw switch simulates a broken model. */
function countingEmbedder(id = "fake-a", dim = 64): Embedder & { calls: number; texts: number; broken: boolean } {
  const inner = hashedEmbedder(dim);
  const e = {
    id,
    dim,
    calls: 0,
    texts: 0,
    broken: false,
    async embed(texts: string[]) {
      if (e.broken) throw new Error("model failed to load");
      e.calls++;
      e.texts += texts.length;
      return inner.embed(texts);
    },
  };
  return e;
}

describe("memory", () => {
  test("adds, recalls with a trace, and strengthens hits", async () => {
    const c = clock();
    const m = await open("t1", { core, embed: hashedEmbedder(128), sink: memorySink(), now: c.now });
    await m.add("they work the early shift at a bakery", { kind: "fact", importance: 0.8 });
    await m.add("the dog chewed the red ball", { kind: "episode" });
    await m.add("rain all morning by the window", { kind: "episode" });
    c.advance(HOUR);
    const r = await m.recall("where do they work? the bakery");
    expect(r.mode).toBe("hybrid");
    expect(r.hits[0]!.item.text).toMatch(/bakery/);
    expect(r.trace.length).toBeGreaterThanOrEqual(r.hits.length);
    expect(r.trace[0]).toMatchObject({ bm25Rank: 0, text: expect.stringMatching(/bakery/) });
    expect(m.get(r.hits[0]!.item.id)!.uses).toBe(1);
    expect(m.get(r.hits[0]!.item.id)!.weight).toBeCloseTo(1.02, 12);
    expect(m.status.simd).toBe(true);
  });

  test("merges a repeated write instead of adding a copy", async () => {
    const c = clock();
    const m = await open("t2", { core, embed: hashedEmbedder(), sink: memorySink(), now: c.now });
    const a = await m.add("saw the red ball under the couch");
    c.advance(10_000);
    const b = await m.add("Saw the red ball under the couch.", { importance: 0.9 });
    expect(b).toEqual({ id: a.id, merged: true });
    expect(m.size).toBe(1);
    expect(m.get(a.id)).toMatchObject({ uses: 1, importance: 0.9 });
    const c2 = await m.add("saw the red ball under the couch", { kind: "fact" });
    expect(c2.merged).toBe(false);
  });

  test("keyword only without an embedder, and says so", async () => {
    const m = await open("t3", { core, sink: memorySink() });
    await m.add("the mug lives on the shelf", { kind: "rule" });
    const r = await m.recall("mug");
    expect(r.mode).toBe("keyword");
    expect(r.hits.length).toBe(1);
    expect(m.status.notes.join(" ")).toMatch(/keyword only/);
  });

  test("falls back to keyword recall when the embedder throws", async () => {
    const e = countingEmbedder();
    const m = await open("t4", { core, embed: e, sink: memorySink() });
    await m.add("the mug lives on the shelf");
    e.broken = true;
    const r = await m.recall("mug");
    expect(r.mode).toBe("keyword");
    expect(r.hits[0]!.item.text).toMatch(/mug/);
    expect(m.status.notes.join(" ")).toMatch(/embedder failed \(model failed to load\)/);
  });

  test("scopes keep one agent's memories out of another's recall", async () => {
    const m = await open("t5", { core, embed: hashedEmbedder(), sink: memorySink(), scopes: ["self", "shared"] });
    await m.add("the blue door is locked", { scope: "self" });
    await m.add("the blue door opens at noon", { scope: "shared" });
    await m.add("the blue door is mine", { scope: "other-agent" });
    const texts = (await m.recall("blue door", { strengthen: false })).hits.map((h) => h.item.scope).sort();
    expect(texts).toEqual(["self", "shared"]);
    expect((await m.recall("blue door", { scopes: ["other-agent"] })).hits.map((h) => h.item.scope)).toEqual(["other-agent"]);
  });

  test("decay drops stale episodes and keeps rules", async () => {
    const c = clock();
    const m = await open("t6", { core, sink: memorySink(), now: c.now });
    await m.add("passing moment", { kind: "episode" });
    await m.add("never touch the stove", { kind: "rule" });
    c.advance(60 * HOUR);
    const gone = await m.decay(0.05);
    expect(gone.length).toBe(1);
    expect(m.all().map((i) => i.kind)).toEqual(["rule"]);
  });

  test("consolidate folds old episodes into one gist", async () => {
    const c = clock();
    const m = await open("t7", { core, sink: memorySink(), now: c.now });
    for (let i = 0; i < 25; i++) {
      await m.add(`picked up mug number ${i} from the kitchen`, { dedup: false });
      c.advance(1000);
    }
    expect(await m.consolidate({ keep: 14, min: 22 })).toMatchObject({ folded: 11 });
    const kinds = m.all().map((i) => i.kind);
    expect(kinds.filter((k) => k === "episode").length).toBe(14);
    const gist = m.all().find((i) => i.kind === "gist")!;
    expect(gist.text).toMatch(/^11 earlier moments\. often about/);
    const viaModel = await open("t7b", { core, sink: memorySink(), now: c.now });
    for (let i = 0; i < 4; i++) await viaModel.add(`episode ${i}`, { dedup: false });
    expect(await viaModel.consolidate({ keep: 1, min: 2, summarize: async (t) => `folded ${t.length}` })).toMatchObject({ folded: 3 });
    expect(viaModel.all().find((i) => i.kind === "gist")!.text).toBe("folded 3");
  });

  test("assemble budgets core, recall and recent turns", async () => {
    const m = await open("t8", { core, embed: hashedEmbedder(), sink: memorySink() });
    await m.remember("their name is Sam");
    await m.add("Sam works at a bakery", { kind: "fact" });
    const a = await m.assemble({ budgetTokens: 60, query: "bakery", recent: ["user: hi"] });
    expect(a.kept).toEqual(["core", "recall", "recent"]);
    expect(a.text).toMatch(/WHAT YOU KNOW FOR SURE\ntheir name is Sam/);
    expect(a.recalled).toEqual(["Sam works at a bakery"]);
    const tight = await m.assemble({ budgetTokens: 12, query: "bakery", recent: ["user: hi there, long line of recent talk"] });
    expect(tight.kept).toEqual(["core"]);
  });

  test("persists in indexeddb and re-embeds only for a new embedder id", async () => {
    const idb = new IDBFactory();
    const e1 = countingEmbedder("fake-a");
    const m1 = await open("persist", { core, embed: e1, indexedDB: idb });
    expect(m1.status.sink).toBe("indexeddb");
    await m1.add("the kettle is in the left cupboard", { kind: "fact" });
    await m1.add("they take tea with honey", { kind: "fact" });
    await m1.remember("their name is Sam");
    m1.close();

    const e2 = countingEmbedder("fake-a");
    const m2 = await open("persist", { core, embed: e2, indexedDB: idb });
    expect(m2.size).toBe(2);
    expect(e2.texts).toBe(0);
    expect(m2.core.lines).toEqual(["their name is Sam"]);
    expect((await m2.recall("kettle")).hits[0]!.item.text).toMatch(/kettle/);
    m2.close();

    const e3 = countingEmbedder("fake-b");
    const m3 = await open("persist", { core, embed: e3, indexedDB: idb });
    expect(e3.texts).toBe(2);
    m3.close();
    const sink = await indexedDbSink("persist", { indexedDB: idb });
    expect((await sink.getVectors("fake-b", [1, 2])).size).toBe(2);
    sink.close();
  });

  test("falls back to a map when indexeddb is missing", async () => {
    const m = await open("nodb", { core, indexedDB: undefined as unknown as IDBFactory });
    expect(m.status.sink).toBe(globalThis.indexedDB ? "indexeddb" : "memory");
  });

  test("export drops vectors and import re-embeds", async () => {
    const e = countingEmbedder();
    const m = await open("t9", { core, embed: e, sink: memorySink() });
    await m.add("the lamp needs a new bulb", { kind: "fact", section: "house" });
    await m.remember("they dislike loud music");
    const data = m.export();
    expect(JSON.stringify(data)).not.toMatch(/vector/);
    const e2 = countingEmbedder();
    const m2 = await open("t9b", { core, embed: e2, sink: memorySink() });
    expect(await m2.import(JSON.parse(JSON.stringify(data)))).toBe(1);
    expect(e2.texts).toBe(1);
    expect(m2.core.lines).toEqual(["they dislike loud music"]);
    expect((await m2.recall("lamp bulb")).hits[0]!.item.section).toBe("house");
    await expect(m2.import({ format: "other" } as never)).rejects.toThrow(/version 1/);
  });

  test("organic scoring favours the emotional memory", async () => {
    const m = await open("t10", { core, embed: hashedEmbedder(), sink: memorySink() });
    await m.add("the ball game in the garden", { arousal: 0.9, valence: 0.8, importance: 0.7 });
    await m.add("the ball game in the yard", { arousal: 0, valence: 0 });
    const r = await m.recall("ball game", { score: "organic", valence: 0.8, strengthen: false });
    expect(r.hits[0]!.item.text).toMatch(/garden/);
  });

  test("mergeNear folds stored duplicates", async () => {
    const c = clock();
    const m = await open("t11", { core, embed: hashedEmbedder(), sink: memorySink(), now: c.now });
    await m.add("red ball under the couch", { dedup: false, kind: "fact" });
    c.advance(1000);
    await m.add("red ball under the couch", { dedup: false, kind: "fact" });
    expect((await m.mergeNear(0.95)).length).toBe(1);
    expect(m.size).toBe(1);
    expect(m.all()[0]!.uses).toBe(1);
  });
});

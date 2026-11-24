import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { type Core, exchangeNote, hashedEmbedder, loadCore, memorySink, open, tokenize } from "@hackbuild/memory";

const HOUR = 3_600_000;
let core: Core;
beforeAll(async () => {
  core = await loadCore({ bytes: new Uint8Array(readFileSync(join(import.meta.dirname, "..", "wasm", "memory.wasm"))) });
});

function clock(start = 1_800_000_000_000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

async function seeded(embed = true) {
  const c = clock();
  const m = await open("lib", { core, embed: embed ? hashedEmbedder(128) : null, sink: memorySink(), now: c.now });
  await m.add("they work the early shift at a bakery downtown", { kind: "fact", importance: 0.8 });
  await m.add("the bakery sells rye bread on fridays", { kind: "fact", importance: 0.3 });
  await m.add("the dog chewed the red ball", { kind: "episode", arousal: 0.6, valence: -0.4 });
  await m.add("rain all morning by the window", { kind: "episode", place: [1, 0, 2] });
  c.advance(5 * HOUR);
  return { m, c };
}

describe("tokenizer", () => {
  test("matches the core's tokenizer", () => {
    expect(tokenize("The cats were Walking to the boxes, I picked mugs.")).toEqual(["cat", "walk", "box", "pick", "mug"]);
    expect(tokenize("glass pass")).toEqual(["glass", "pass"]);
    expect(tokenize("a I , .")).toEqual([]);
  });
});

describe("recall trace", () => {
  test("score parts times strength give the core's score, for both scorers", async () => {
    const { m } = await seeded();
    for (const score of ["linear", "organic"] as const) {
      const r = await m.recall("where is the bakery shift", { score, place: [1, 0, 2], strengthen: false });
      expect(r.trace.length).toBeGreaterThan(1);
      for (const row of r.trace) {
        const sum = Object.values(row.parts).reduce((a, b) => a + b, 0);
        expect(sum * row.weight).toBeCloseTo(row.score, 9);
      }
    }
  });

  test("per term weights add up to the core's bm25 and the rows say which were used", async () => {
    const { m } = await seeded();
    await m.recall("bakery", { k: 1 });
    const t = await m.explain("which bakery shift", { k: 1 });
    expect(t.terms.map((x) => x.term)).toEqual(["bakery", "shift"]);
    expect(t.terms.find((x) => x.term === "bakery")!.df).toBe(2);
    expect(t.terms[0]!.idf).toBeLessThan(t.terms[1]!.idf);
    const kw = t.rows.filter((r) => r.bm25Rank >= 0);
    expect(kw.length).toBe(2);
    for (const r of kw) expect(r.terms.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(r.bm25, 9);
    expect(t.rows[0]).toMatchObject({ rank: 1, used: true, text: expect.stringMatching(/early shift/) });
    expect(t.rows.filter((r) => r.used).length).toBe(1);
    expect(t.how).toBe(`${t.rows.length} candidates found by keyword and meaning, fused by rank, then scored 0.55 relevance, 0.2 recency and 0.25 importance, times each memory's strength. 1 used.`);
    expect(t.params).toMatchObject({ scorer: "linear", k: 1, cand: 18 });
  });

  test("explain leaves the memories as they were", async () => {
    const { m } = await seeded();
    const before = m.all();
    await m.explain("bakery");
    expect(m.all()).toEqual(before);
  });

  test("keyword only mode says so", async () => {
    const { m } = await seeded(false);
    const t = await m.explain("bakery");
    expect(t.mode).toBe("keyword");
    expect(t.how).toMatch(/keyword only, no embedder loaded/);
  });
});

describe("edit one", () => {
  test("changes the text, re-embeds, and recall follows the new text", async () => {
    const { m, c } = await seeded();
    const id = (await m.recall("red ball", { k: 1, strengthen: false })).hits[0]!.item.id;
    c.advance(1000);
    const e = await m.edit(id, { text: "the dog chewed the blue frisbee", importance: 2, entities: ["dog"] });
    expect(e).toMatchObject({ id, text: "the dog chewed the blue frisbee", importance: 1, entities: ["dog"], edited: c.now() });
    expect((await m.recall("blue frisbee", { k: 1, strengthen: false })).hits[0]!.item.id).toBe(id);
    expect((await m.sink.getVectors(hashedEmbedder(128).id, [id])).size).toBe(1);
    expect(await m.edit(999, { text: "x" })).toBeNull();
    await expect(m.edit(id, { text: "  " })).rejects.toThrow(/cannot empty/);
    await expect(m.edit(id, { kind: "bogus" as never })).rejects.toThrow(/unknown kind/);
    const k = await m.edit(id, { kind: "rule" });
    expect(k!.kind).toBe("rule");
    expect((await m.recall("frisbee", { kinds: ["rule"], strengthen: false })).hits[0]!.item.id).toBe(id);
  });
});

describe("exchange notes", () => {
  test("a two word message gives no note and a long reply is cut on a word boundary", () => {
    expect(exchangeNote("hi there", "hello")).toBeNull();
    const long = "word ".repeat(60).trim();
    const n = exchangeNote("my sister lives in lisbon", long)!;
    expect(n.meta.said).toBe("my sister lives in lisbon");
    const reply = n.text.match(/I answered: "(.*)"$/)![1]!;
    expect(reply.endsWith("word...")).toBe(true);
    expect(reply.length).toBeLessThanOrEqual(163);
    expect(exchangeNote("my sister lives in lisbon", "")!.text).toBe('They said: "my sister lives in lisbon"');
  });

  test("a note whose turn is still in view is skipped and the next one takes its place", async () => {
    const c = clock();
    const m = await open("ex", { core, embed: hashedEmbedder(128), sink: memorySink(), now: c.now });
    const a = await m.addExchange("my sister lives in lisbon now", "lisbon sounds lovely in spring");
    const b = await m.addExchange("my sister visited lisbon last year", "did she like the trams");
    expect(await m.addExchange("ok thanks", "sure")).toBeNull();
    expect(m.get(a!.id)).toMatchObject({ kind: "episode", meta: { said: "my sister lives in lisbon now" } });
    const all = await m.recall("sister lisbon", { k: 1, strengthen: false });
    const first = all.hits[0]!.item.id;
    const said = m.get(first)!.meta!.said as string;
    const r = await m.recall("sister lisbon", { k: 1, strengthen: false, skipSaid: [said] });
    expect(r.hits[0]!.item.id).toBe(first === a!.id ? b!.id : a!.id);
    expect(r.trace.find((t) => t.id === first)!.skipped).toBe(true);
    expect(m.trace(r).rows.find((t) => t.id === first)!.used).toBe(false);
  });
});

describe("compaction and usage", () => {
  test("compact decays, merges and folds in one call", async () => {
    const c = clock();
    const m = await open("cp", { core, embed: hashedEmbedder(128), sink: memorySink(), now: c.now });
    for (let i = 0; i < 25; i++) await m.add(`walked to the park number ${i} with a ${i % 2 ? "red" : "blue"} kite`, { kind: "episode", dedup: false });
    await m.add("the kettle is in the left cupboard", { kind: "rule" });
    const r = await m.compact({ decay: false });
    expect(r.before).toBe(26);
    expect(r.gist).toMatchObject({ folded: 11 });
    expect(r.after).toBe(r.before - r.merged.length - r.gist!.folded + 1);
    expect(m.get(r.gist!.id)!.kind).toBe("gist");
    const none = await m.compact({ decay: false, merge: false, consolidate: false });
    expect(none).toEqual({ before: r.after, after: r.after, decayed: [], merged: [], gist: null });
  });

  test("usage counts kinds, estimates bytes and reads the browser estimate", async () => {
    const { m } = await seeded();
    await m.remember("the user's name is ana");
    const u = await m.usage({ storage: { estimate: async () => ({ usage: 12_800, quota: 10_700_000_000 }), persisted: async () => false } });
    expect(u).toMatchObject({ items: 4, coreLines: 1, byKind: { fact: 2, episode: 2, rule: 0 }, browser: { usage: 12_800, quota: 10_700_000_000, persisted: false } });
    expect(u.bytes).toBeGreaterThan(4 * 128 * 4);
    expect((await m.usage({ storage: null })).browser).toBeNull();
    expect(await m.persist({ storage: { persist: async () => true } })).toBe(true);
    expect(await m.persist({ storage: { persist: async () => Promise.reject(new Error("no")) } })).toBe(false);
    expect(await m.persist({ storage: null })).toBe(false);
  });
});

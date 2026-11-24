import { describe, expect, test } from "vitest";
import { buildVocabulary, createDirector, createInferrer, createResolver, grammar, promptBlock, replay, stem, type FiredCue } from "@hackbuild/act";
import type { Embedder } from "@hackbuild/memory";

const avatar = { expressions: ["happy", "sad", "angry", "surprised", "relaxed"], gestures: ["wave", "nod", "shrug", "cross"], postures: ["sit", "stand"] };
const v = buildVocabulary(avatar);

function clock(start = 0) {
  let t = start;
  return { now: () => t, add: (ms: number) => (t += ms) };
}

describe("vocabulary", () => {
  test("keeps only names the avatar has and aliases whose target exists", () => {
    expect(v.moods).toEqual(avatar.expressions);
    expect(v.aliases.grin).toBe("happy");
    expect(v.aliases.love).toBe("happy");
    expect(v.aliases.fear).toBe("surprised");
    expect(v.aliases.bows).toBeUndefined();
    expect(v.aliases.sits).toBe("sit");
  });
  test("a real name is never shadowed by an alias", () => {
    const w = buildVocabulary({ expressions: ["happy", "love"] });
    expect(w.aliases.love).toBeUndefined();
  });
});

describe("resolver", () => {
  const r = createResolver(v);
  test("exact, alias and whole words", () => {
    expect(r.resolve("Happy")).toMatchObject({ kind: "mood", name: "happy", via: "exact" });
    expect(r.resolve("grins")).toMatchObject({ name: "happy", via: "alias" });
    expect(r.resolve("waves")).toMatchObject({ kind: "gesture", name: "wave", via: "words" });
    expect(r.resolve("waves hello")).toMatchObject({ name: "wave" });
  });
  test("no substring traps", () => {
    expect(r.resolve("walks across the room")).toBeNull();
    expect(r.resolve("I won't lie")).toBeNull();
    expect(r.resolve("standing ovation")).toMatchObject({ name: "stand" });
  });
  test("a move with no realization does nothing", () => {
    expect(r.resolve("bow")).toBeNull();
  });
  test("a kind is honoured, crossing only on exact or alias", () => {
    expect(r.resolve("smile", "gesture")).toMatchObject({ kind: "mood", name: "happy" });
    expect(r.resolve("nodding slowly", "mood")).toBeNull();
  });
  test("stemmer", () => {
    expect(stem("nodding")).toBe("nod");
    expect(stem("waved")).toBe("wav");
    expect(stem("wave")).toBe("wav");
    expect(stem("waves")).toBe("wav");
  });
  test("embedding step above the floor", async () => {
    const emb: Embedder = {
      id: "fake",
      dim: 2,
      embed: async (t) => t.map((s) => (/(joy|happy)/.test(s) ? Float32Array.of(1, 0) : /radiant/.test(s) ? Float32Array.of(0.9, 0.1) : Float32Array.of(0, 1))),
    };
    const re = createResolver(v, { embedder: emb });
    expect(await re.resolveAsync("radiant")).toMatchObject({ name: "happy", via: "embed" });
  });
});

describe("director", () => {
  test("cues fire when the voice reaches them", () => {
    const fired: FiredCue[] = [];
    const c = clock();
    const d = createDirector({ vocab: v, fire: (x) => fired.push(x), now: c.now });
    let text = "";
    for (const ch of ["[hap", "py] Hello there. ", "Nice to *wa", "ves* meet you."]) text += d.feed(ch).text;
    text += d.finish().text;
    expect(text).toBe("Hello there. Nice to meet you.");
    expect(d.pending().map((x) => x.name)).toEqual(["happy", "wave"]);
    d.reached(0);
    expect(fired.map((x) => x.name)).toEqual(["happy"]);
    d.reached(text.indexOf("meet"));
    expect(fired.map((x) => x.name)).toEqual(["happy", "wave"]);
    expect(fired[1]!.at).toBe(text.indexOf("meet"));
  });
  test("[happy, wave] fires both", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, fire: (x) => fired.push(x.name), now: () => 0 });
    d.feed("[happy, wave] hi");
    d.finish();
    d.reached(100);
    expect(fired).toEqual(["happy", "wave"]);
  });
  test("prototype key names from a model are plain unknown words", () => {
    const d = createDirector({ vocab: v, fire: () => {}, now: () => 0 });
    expect(() => {
      d.feed("[mood: constructor] a [gesture: __proto__] b [toString] c");
      d.finish();
    }).not.toThrow();
    expect(() => d.json({ mood: "constructor", gesture: "hasOwnProperty", say: "x" })).not.toThrow();
  });
  test("keyed tags and stage directions", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, fire: (x) => fired.push(`${x.kind}:${x.name}`), now: () => 0 });
    const t = d.feed("[mood: sad] oh no *walks across the room* (see above) [posture: sit] okay").text + d.finish().text;
    d.reached(1000);
    expect(fired).toEqual(["mood:sad", "posture:sit"]);
    expect(t).toContain("(see above)");
    expect(t).not.toContain("walks");
  });
  test("repeated mood suppressed until it decays, gesture cooldown, posture persists", () => {
    const c = clock();
    const fired: string[] = [];
    const sup: string[] = [];
    const d = createDirector({ vocab: v, fire: (x) => fired.push(x.name), onSuppressed: (x) => sup.push(`${x.name}:${x.reason}`), now: c.now, gestureCooldownMs: 2000, moodDecayMs: 1000 });
    d.feed("[happy] a [wave] b [nod] c [sit] d [sit] e");
    d.finish();
    d.reached(1000);
    expect(fired).toEqual(["happy", "wave", "sit"]);
    expect(sup).toEqual(["nod:cooldown", "sit:repeat"]);
    d.begin();
    d.feed("[happy] again");
    d.finish();
    d.reached(10);
    expect(sup).toContain("happy:repeat");
    c.add(5000);
    expect(d.mood()).toBeNull();
    d.begin();
    d.feed("[happy] later");
    d.finish();
    d.reached(10);
    expect(fired.filter((x) => x === "happy").length).toBe(2);
    expect(d.posture()).toBe("sit");
  });
  test("a cue placed behind the voice fires at once", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, fire: (x) => fired.push(x.name), now: () => 0 });
    d.reached(50);
    d.feed("hello [wave] there");
    expect(fired).toEqual(["wave"]);
  });
  test("hybrid infers untagged sentences, never postures", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, mode: "hybrid", fire: (x) => fired.push(`${x.name}@${x.at}`), now: () => 0, gestureCooldownMs: 0 });
    const t = d.feed("Hello there. [sad] I am sorry. I think it is fine. Please sit down. Wow, really?").text + d.finish().text;
    d.reached(t.length);
    expect(fired).toContain("wave@0");
    expect(fired).toContain(`surprised@${t.indexOf("Wow")}`);
    expect(fired.filter((x) => x.startsWith("sad")).length).toBe(1);
    expect(fired.some((x) => x.startsWith("sit"))).toBe(false);
    expect(fired.some((x) => x.startsWith("happy"))).toBe(false);
  });
  test("off mode strips tags and fires nothing", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, mode: "off", fire: (x) => fired.push(x.name) });
    expect(d.feed("[happy] hi").text + d.finish().text).toBe("hi");
    d.reached(10);
    expect(fired).toEqual([]);
  });
  test("json style and replay", () => {
    const fired: string[] = [];
    const d = createDirector({ vocab: v, fire: (x) => fired.push(x.name), now: () => 0 });
    const r = d.json({ say: "hi", mood: "grin", gesture: "bow" });
    expect(r.say).toBe("hi");
    expect(r.cues.map((x) => x.name)).toEqual(["happy"]);
    d.reached(0);
    const again: string[] = [];
    const p = replay(d.record(), (x) => again.push(x.name), () => 0);
    p.reached(0);
    expect(again).toEqual(["happy"]);
  });
  test("embedder resolves a keyed tag and infers a sentence", async () => {
    const emb: Embedder = {
      id: "fake",
      dim: 2,
      embed: async (t) => t.map((s) => (/^happy|beaming|marvellous/.test(s) ? Float32Array.of(1, 0) : Float32Array.of(0, 1))),
    };
    const fired: string[] = [];
    const d = createDirector({ vocab: buildVocabulary({ expressions: ["happy"] }), mode: "hybrid", embedder: emb, fire: (x) => fired.push(`${x.name}:${x.source}`), now: () => 0 });
    d.feed("[mood: beaming] ok. marvellous stuff.");
    d.finish();
    await d.settle();
    d.reached(100);
    expect(fired).toContain("happy:tag");
  });
});

describe("inferrer", () => {
  test("weak phrases do not count", () => {
    const i = createInferrer(v);
    expect(i.keyword("No worries, you're welcome.")).toBeNull();
    expect(i.keyword("I am so glad you came")).toMatchObject({ name: "happy", via: "keyword" });
  });
  test("embedding needs the floor and the margin", async () => {
    const mk = (q: number[]): Embedder => ({ id: "f", dim: 2, embed: async (t) => t.map((s) => (s.startsWith("happy") ? Float32Array.of(1, 0) : s.startsWith("sad") ? Float32Array.of(0, 1) : s.startsWith("q") ? Float32Array.from(q) : Float32Array.of(-1, -1))) });
    const w = buildVocabulary({ expressions: ["happy", "sad"] });
    expect(await createInferrer(w, { embedder: mk([1, 0.1]) }).infer("q one")).toMatchObject({ name: "happy", via: "embed" });
    expect(await createInferrer(w, { embedder: mk([1, 1]) }).infer("q two")).toBeNull();
  });
});

describe("prompt and grammar", () => {
  test("prompt block is short and names only the vocabulary", () => {
    const p = promptBlock(v);
    expect(p).toContain("moods: happy, sad, angry, surprised, relaxed");
    expect(p).toContain("postures, only when asked: sit, stand");
    expect(Math.ceil(p.length / 3.6)).toBeLessThan(90);
    expect(promptBlock(v, { style: "json" })).toContain('"say"');
  });
  test("gbnf lists the names and requires words", () => {
    const g = grammar(v, "gbnf");
    expect(g).toContain('name ::= "happy" | "sad"');
    expect(g).toMatch(/^root ::= \(tag sp\)\* words/);
  });
  test("json schema enums", () => {
    const s = JSON.parse(grammar(v, "json-schema"));
    expect(s.required).toEqual(["say"]);
    expect(s.properties.gesture.enum).toEqual(avatar.gestures);
    expect(s.properties.say.minLength).toBe(1);
  });
});

import { describe, expect, test } from "vitest";
import { bindActs, buildVocabulary, classifyClip, createInferrer, createResolver, idleLoop, pickClip, talkingLoop, OPTIONAL_BUCKETS, DEFAULT_ALIASES, type ClipInfo } from "@hackbuild/act";

const clip = (name: string, o: Partial<ClipInfo> = {}): ClipInfo => ({ id: name, name, ...o });

describe("clip classes", () => {
  test("rules apply in order and a user tag wins", () => {
    expect(classifyClip(clip("idle talking"))).toBe("talk");
    expect(classifyClip(clip("sit down"))).toBe("posture");
    expect(classifyClip(clip("chop wood"))).toBe("action");
    expect(classifyClip(clip("drunk walk"))).toBe("odd");
    expect(classifyClip(clip("Take_007", { tags: ["walk"] }))).toBe("locomotion");
    expect(classifyClip(clip("chop wood", { userTags: ["gesture"] }))).toBe("gesture");
    expect(classifyClip(clip("IdleBreathing"))).toBe("idle");
  });
});

describe("binder", () => {
  const lib = [
    clip("sits down", { tags: ["nod"] }),
    clip("Waving 2"),
    clip("Take_013", { tags: ["nod"] }),
    clip("idle talking"),
    clip("idle neutral"),
    clip("sitting idle"),
    clip("chop wood"),
    clip("drunk walk"),
    clip("Samba Dancing"),
  ];
  const b = bindActs({ expressions: ["happy", "sad", "angry"], clips: lib });

  test("a named clip binds by its name, an opaque one by its tags", () => {
    expect(b.acts.postures).toContain("sit");
    expect(b.clips.sit!.map((c) => c.id)).toContain("sits down");
    expect(b.clips.nod!.map((c) => c.id)).toEqual(["Take_013"]);
    expect(b.acts.gestures).toEqual(expect.arrayContaining(["wave", "nod", "dance"]));
  });

  test("loops never enter the vocabulary; travel and prop work stay manual", () => {
    const names = [...b.acts.gestures, ...b.acts.postures];
    expect(names).not.toContain("idle talking");
    expect(b.manual.map((c) => c.id).sort()).toEqual(["chop wood", "drunk walk"]);
    expect(talkingLoop(b.all)!.id).toBe("idle talking");
    expect(idleLoop(b.all)!.id).toBe("idle neutral");
  });

  test("a posture never appears in the inferrer's labels", async () => {
    const v = buildVocabulary(b.acts);
    const inf = createInferrer(v);
    expect(inf.keyword("let us sit on the couch and sleep")).toBeNull();
    expect(inf.keyword("hello there friend")).toMatchObject({ kind: "gesture", name: "wave" });
  });

  test("with 40 clips and a 14 name cap the kinds of movement come first", () => {
    const kinds = Array.from({ length: 20 }, (_, i) => clip(`${["wave", "nod", "bow", "clap"][i % 4]} ${i}`));
    const opaque = Array.from({ length: 20 }, (_, i) => clip(`routine ${String.fromCharCode(97 + i)}`));
    const many = [...opaque, ...kinds];
    const big = bindActs({ clips: many }, { max: 14 });
    expect(big.acts.gestures.length).toBe(14);
    expect(big.acts.gestures.slice(0, 4).sort()).toEqual(["bow", "clap", "nod", "wave"]);
  });

  test("whole words only: across is not angry, understand is not stand", () => {
    const v = buildVocabulary({ expressions: ["angry"], postures: ["stand"] });
    const r = createResolver(v);
    expect(r.resolve("across")).toBeNull();
    expect(r.resolve("understand")).toBeNull();
    expect(r.resolve("cross")).toMatchObject({ name: "angry" });
  });

  test("a known name with no clip resolves to nothing", async () => {
    expect(await pickClip(b, "bow", "thank you so much", { rng: () => 0 })).toBeNull();
    expect((await pickClip(b, "wave", "hi", { rng: () => 0 }))!.id).toBe("Waving 2");
  });

  test("the named bonus: without an embedder the draw keeps to named clips", async () => {
    const lib2 = bindActs({ clips: [clip("Take_1", { tags: ["sit"] }), clip("Sitting 1"), clip("Take_2", { tags: ["sit"] })] });
    for (const r of [0, 0.5, 0.99]) expect((await pickClip(lib2, "sit", "have a seat", { rng: () => r }))!.id).toBe("Sitting 1");
    const flat = { embed: async (t: string[]) => t.map(() => Float32Array.from([1, 0])) };
    expect((await pickClip(lib2, "sit", "have a seat", { rng: () => 0, embedder: flat }))!.id).toBe("Sitting 1");
  });

  test("hug, kiss and flirt stay out of the defaults", () => {
    expect(Object.hasOwn(DEFAULT_ALIASES, "cuddle")).toBe(false);
    const o = bindActs({ clips: [clip("Hugging")] }, { buckets: OPTIONAL_BUCKETS });
    expect(o.acts.gestures).toEqual(["hug"]);
  });
});

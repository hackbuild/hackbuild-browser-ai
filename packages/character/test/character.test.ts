import { readFileSync } from "node:fs";
import { join } from "node:path";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import { describe, expect, test } from "vitest";
import { activeLore, CharacterError, fillMacros, loadCharacterCore, profileOf, type CardV3, type CharacterBook } from "@hackbuild/character";
import { CHARACTER_WASM_BASE64 } from "@hackbuild/character/inline";

const fix = (n: string) => readFileSync(join(import.meta.dirname, "..", "..", "..", "crates/character/tests/fixtures", n), "utf8");
const wren = JSON.parse(fix("wren.v2.json")) as Record<string, unknown>;
const pell = JSON.parse(fix("pell.v3.json")) as CardV3;

describe("character core", async () => {
  const core = await loadCharacterCore({ base64: CHARACTER_WASM_BASE64 });

  test("profile version", () => expect(core.profileVersion).toBe(1));

  test("png round trip writes both chunks and reads ccv3 first", () => {
    const png = core.writePng(wren);
    expect([...png.slice(1, 4)].map((c) => String.fromCharCode(c)).join("")).toBe("PNG");
    const r = core.read(png);
    expect(r.format).toBe("png");
    expect(r.source).toBe("ccv3");
    expect(r.spec).toBe("chara_card_v3");
    expect((r.card as unknown as CardV3).data.name).toBe("Wren");
    const v2only = core.writePng(r.card, { image: png, mode: "v2" });
    expect(core.read(v2only).source).toBe("chara");
    expect(core.read(v2only).spec).toBe("chara_card_v2");
  });

  test("png on a given image keeps its pixels chunk", () => {
    const base = core.blankPng(5, 3, 0x102030);
    const out = core.writePng(pell, { image: base });
    expect(out.length).toBeGreaterThan(base.length);
    expect(Buffer.from(out).includes(Buffer.from(base.subarray(8, 33)))).toBe(true);
  });

  test("charx with assets, refs and entry reads", () => {
    const body = new Uint8Array([1, 2, 3, 4, 5]);
    const ref = new Uint8Array(64).fill(7);
    const z = core.writeCharx(pell, [
      { path: "assets/avatar/pell.glb", bytes: body },
      { path: "assets/voice/ref.wav", bytes: ref },
    ]);
    const r = core.read(z);
    expect(r.format).toBe("charx");
    expect(r.assets).toEqual([
      { name: "assets/avatar/pell.glb", size: 5 },
      { name: "assets/voice/ref.wav", size: 64 },
    ]);
    const card = r.card as unknown as CardV3;
    expect(card.data.assets?.map((a) => a.uri)).toEqual(["ccdefault:", "embeded://assets/avatar/pell.glb", "embeded://assets/voice/ref.wav"]);
    expect(card.data.assets?.[1]).toEqual({ type: "avatar", uri: "embeded://assets/avatar/pell.glb", name: "pell", ext: "glb" });
    expect([...core.entry(z, "assets/avatar/pell.glb")]).toEqual([...body]);
    expect(() => core.entry(z, "missing")).toThrow(CharacterError);
    const noRefs = core.read(core.writeCharx(pell, [{ path: "assets/avatar/pell.glb", bytes: body }], { refs: false }));
    expect((noRefs.card as unknown as CardV3).data.assets).toHaveLength(1);
    expect(() => core.writeCharx(pell, [{ path: "../escape", bytes: body }])).toThrow(/unsafe/);
  });

  test("the deflate reader agrees with node zlib", () => {
    const text = new TextEncoder().encode("lamp ".repeat(300) + "brass wick, brass wick, brass wick");
    const zip = makeDeflatedZip(pell, text);
    expect(Buffer.from(core.entry(zip, "notes.txt")).toString()).toBe(Buffer.from(text).toString());
  });

  test("upgrade, downgrade and validate", () => {
    const v3 = core.upgrade(wren);
    expect(v3.spec).toBe("chara_card_v3");
    expect(core.validate(v3)).toEqual([]);
    const v2 = core.downgrade(pell);
    expect(v2.spec).toBe("chara_card_v2");
    expect("group_only_greetings" in v2.data).toBe(false);
    expect(v2.data.character_book?.entries[0] && "use_regex" in v2.data.character_book.entries[0]).toBe(false);
    expect(core.validate(JSON.parse(fix("odd.v1.json")))).toEqual(["spec: missing, read as a v1 card; upgrade it"]);
    expect(core.upgrade(JSON.parse(fix("odd.v1.json"))).data.description).toBe('a stone that "likes" rain.');
    expect(() => core.upgrade({ spec: "nope" })).toThrow(/unknown spec/);
    const bad = { ...pell, data: { ...pell.data, extensions: { hackbuild: { version: 1, voice: { rate: "fast" } } } } };
    expect(core.validate(bad)).toContain("data.extensions.hackbuild.voice.rate: string where a number belongs, default used");
  });

  test("migrate a loose profile with notes", () => {
    const { profile, notes } = core.migrateProfile(JSON.parse(fix("loose.profile.json")));
    expect(profile.version).toBe(1);
    expect(profile.avatar).toEqual({ uri: "https://example.invalid/body.glb", asset: "", kind: "glb", expressions: {}, wardrobe: {} });
    expect(profile.voice).toEqual({ engine: "system", voiceId: "bm_george", rate: 0.25, pitch: 1, cloneRef: "embeded://assets/voice/ref.wav" });
    expect(profile.actions.gestures).toEqual(["bow"]);
    expect(profile.behavior.ambientGestures).toBe(false);
    expect(profile.behavior.blink).toBe(true);
    expect(notes).toContain("actions: carried over from motion");
    expect(notes).toContain("unknown: unknown key dropped");
    expect(notes).toContain("avatar.wardrobe.hat: string where a boolean belongs, dropped");
    const again = core.migrateProfile(profile);
    expect(again.notes).toEqual([]);
    expect(again.profile).toEqual(profile);
  });

  test("migrate inside a card, with and without create", () => {
    const a = core.migrate(pell);
    expect(profileOf(a.card)).toBeNull();
    const b = core.migrate(pell, { create: true });
    expect(profileOf(b.card)?.voice.engine).toBe("system");
    expect(b.notes).toEqual(["profile: added with defaults"]);
    expect(profileOf(core.migrate(wren).card)?.voice.voiceId).toBe("af_heart");
  });
});

describe("macros and lore", () => {
  test("fillMacros", () => {
    expect(fillMacros("{{char}} waves at {{ User }}. <BOT> and <USER>.", { char: "Wren", user: "Sam" })).toBe("Wren waves at Sam. Wren and Sam.");
  });

  test("activeLore matches keys, regex, selective and constant", () => {
    const book: CharacterBook = {
      extensions: {},
      entries: [
        { keys: ["ferry"], content: "a", extensions: {}, enabled: true, insertion_order: 10 },
        { keys: ["/ice\\s+floe/"], content: "bb", extensions: {}, enabled: true, insertion_order: 5, use_regex: true },
        { keys: ["lamp"], content: "c", extensions: {}, enabled: true, insertion_order: 1, selective: true, secondary_keys: ["night"] },
        { keys: [], content: "always", extensions: {}, enabled: true, insertion_order: 20, constant: true },
        { keys: ["ferry"], content: "off", extensions: {}, enabled: false, insertion_order: 0 },
        { keys: ["FERRY"], content: "cs", extensions: {}, enabled: true, insertion_order: 30, case_sensitive: true },
      ],
    };
    const t = "the Ferry stops when an ICE   floe drifts past the lamp";
    expect(activeLore(book, t).map((e) => e.content)).toEqual(["bb", "a", "always"]);
    expect(activeLore(book, t + " at night").map((e) => e.content)).toEqual(["c", "bb", "a", "always"]);
    expect(activeLore(book, t, { budgetChars: 3 }).map((e) => e.content)).toEqual(["bb", "a"]);
    expect(activeLore(undefined, t)).toEqual([]);
  });
});

/** A zip whose one asset node zlib deflated, as other zip tools write them. */
function makeDeflatedZip(card: unknown, text: Uint8Array): Uint8Array {
  const files = [
    { name: "card.json", method: 0, plain: new TextEncoder().encode(JSON.stringify(card)) },
    { name: "notes.txt", method: 8, plain: text },
  ].map((f) => ({ ...f, data: f.method === 8 ? new Uint8Array(deflateRawSync(f.plain, { level: 9 })) : f.plain }));
  expect(Buffer.from(inflateRawSync(files[1]!.data)).equals(Buffer.from(text))).toBe(true);
  const crc = (b: Uint8Array) => {
    let c = ~0;
    for (const x of b) {
      c ^= x;
      for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
    return ~c >>> 0;
  };
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let off = 0;
  for (const f of files) {
    const name = new TextEncoder().encode(f.name);
    const head = (cd: boolean) => {
      const h = new DataView(new ArrayBuffer(cd ? 46 : 30));
      h.setUint32(0, cd ? 0x02014b50 : 0x04034b50, true);
      const o = cd ? 2 : 0;
      h.setUint16(4 + o, 20, true);
      h.setUint16(8 + o, f.method, true);
      h.setUint16(12 + o, 0x21, true);
      h.setUint32(14 + o, crc(f.plain), true);
      h.setUint32(18 + o, f.data.length, true);
      h.setUint32(22 + o, f.plain.length, true);
      h.setUint16(26 + o, name.length, true);
      if (cd) h.setUint32(42, off, true);
      return new Uint8Array(h.buffer);
    };
    central.push(head(true), name);
    parts.push(head(false), name, f.data);
    off += 30 + name.length + f.data.length;
  }
  const cdLen = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, files.length, true);
  end.setUint16(10, files.length, true);
  end.setUint32(12, cdLen, true);
  end.setUint32(16, off, true);
  return new Uint8Array(Buffer.concat([...parts, ...central, new Uint8Array(end.buffer)]));
}

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { type Core, hashedEmbedder, loadCore, memorySink, open as openMemory } from "@hackbuild/memory";
import { cachedKey, deriveKey, sealedSink, forgetKey, makeLock, open, openBytes, seal, sealBytes, SEAL_OVERHEAD, SealError, type SealKey, type SealLock, verifyLock } from "@hackbuild/memory/seal";

let core: Core;
let lock: SealLock;
let key: SealKey;
beforeAll(async () => {
  core = await loadCore({ bytes: new Uint8Array(readFileSync(join(import.meta.dirname, "..", "wasm", "memory.wasm"))) });
  ({ lock, key } = await makeLock("brass lamp"));
});

describe("seal helpers", () => {
  test("lock record holds no password", () => {
    expect(lock.algo).toBe("pbkdf2-sha256");
    expect(lock.iterations).toBe(210_000);
    expect(JSON.stringify(lock)).not.toContain("brass");
  });

  test("verifyLock is true for the password and false otherwise", async () => {
    expect(await verifyLock("brass lamp", lock)).toBe(true);
    expect(await verifyLock("brass lamp ", lock)).toBe(false);
    expect(await verifyLock("", lock)).toBe(false);
  });

  test("round trip of a value and of bytes", async () => {
    const v = { text: "the mug goes on the shelf", n: [1, 2, 3] };
    expect(await open(key, await seal(key, v))).toEqual(v);
    const b = new Uint8Array([0, 1, 2, 250, 255]);
    const s = await sealBytes(key, b, "doc:a.md");
    expect(s.length).toBe(b.length + SEAL_OVERHEAD);
    expect([...(await openBytes(key, s, "doc:a.md"))]).toEqual([...b]);
  });

  test("two writes of one value differ in bytes", async () => {
    const a = await seal(key, "same");
    const b = await seal(key, "same");
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(false);
  });

  test("a wrong password rejects", async () => {
    await expect(deriveKey("brass lamb", lock)).rejects.toMatchObject({ code: "wrong-password" });
    const other = (await makeLock("brass lamb")).key;
    await expect(open(other, await seal(key, 1))).rejects.toBeInstanceOf(SealError);
  });

  test("a tampered blob or another context rejects", async () => {
    const s = await seal(key, { a: 1 }, "item:1");
    for (const at of [10, 25, s.length - 1, 40]) {
      const t = s.slice();
      t[at]! ^= 1;
      await expect(open(key, t, "item:1")).rejects.toBeInstanceOf(SealError);
    }
    await expect(open(key, s, "item:2")).rejects.toBeInstanceOf(SealError);
    await expect(open(key, s.slice(0, 20), "item:1")).rejects.toMatchObject({ code: "bad-envelope" });
  });

  test("the key is derived once and cached for the session", async () => {
    forgetKey(lock);
    expect(cachedKey(lock)).toBeUndefined();
    const k = await deriveKey("brass lamp", lock);
    expect(cachedKey(lock)).toBe(k);
    expect(await open(k, await seal(key, "x"))).toBe("x");
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) await seal(k, { i });
    expect(performance.now() - t0).toBeLessThan(2000);
  });

  test("a bad lock record rejects", async () => {
    await expect(verifyLock("p", { ...lock, algo: "md5" as "pbkdf2-sha256" })).rejects.toMatchObject({ code: "bad-lock" });
    await expect(verifyLock("p", { ...lock, iterations: 1e9 })).rejects.toMatchObject({ code: "bad-lock" });
  });
});

describe("sealedSink", () => {
  test("items, vectors and kv are sealed at rest and recall works", async () => {
    const inner = memorySink();
    const m = await openMemory("sealed", { core, embed: hashedEmbedder(64), sink: sealedSink(inner, key) });
    await m.add("the mug goes on the shelf", { kind: "rule", meta: { room: "kitchen" } });
    await m.add("they asked for the red ball", { kind: "episode" });
    const rows = await inner.loadItems();
    expect(rows).toHaveLength(2);
    const raw = JSON.stringify(rows, (_k, v: unknown) => (v instanceof Uint8Array ? Buffer.from(v).toString("latin1") : v));
    for (const w of ["mug", "shelf", "kitchen", "rule", "episode"]) expect(raw).not.toContain(w);
    const vecs = await inner.getVectors("hash-ngram-64-v1", rows.map((r) => r.id));
    expect(vecs.size).toBe(2);
    for (const v of vecs.values()) expect(v.length).toBe(64 + SEAL_OVERHEAD / 4);
    expect(await inner.getKv("nextId")).toBeInstanceOf(Uint8Array);
    const r = await m.recall("where does the mug go", { k: 1 });
    expect(r.hits[0]?.item.text).toBe("the mug goes on the shelf");
  });

  test("a reopened sealed store rebuilds its index in memory", async () => {
    const inner = memorySink();
    const a = await openMemory("re", { core, embed: hashedEmbedder(64), sink: sealedSink(inner, key) });
    await a.add("the lamp is brass", { kind: "fact" });
    const b = await openMemory("re", { core, embed: hashedEmbedder(64), sink: sealedSink(inner, key) });
    expect((await b.recall("brass lamp", { k: 1 })).hits[0]?.item.text).toBe("the lamp is brass");
    const other = (await makeLock("brass lamb")).key;
    await expect(openMemory("re", { core, sink: sealedSink(inner, other) })).rejects.toBeInstanceOf(SealError);
  });

  test("a plain row in a sealed store rejects", async () => {
    const inner = memorySink();
    const plain = await openMemory("p", { core, sink: inner });
    await plain.add("plain text", { kind: "note" });
    await expect(openMemory("p", { core, sink: sealedSink(inner, key) })).rejects.toBeInstanceOf(SealError);
  });
});

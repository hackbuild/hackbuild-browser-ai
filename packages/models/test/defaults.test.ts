import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import { CATALOG, createHub, suggestDefaults, pickModel, type LoadEvent, type ModelRecord, type StorageEstimate } from "@hackbuild/models";

const env = (o: Partial<Env> = {}): Env => ({
  webgpu: true,
  f16: true,
  adapter: null,
  maxBufferBytes: null,
  isolated: false,
  protocol: "https",
  opfs: true,
  cacheStorage: true,
  indexedDB: true,
  threads: 1,
  deviceMemoryGB: 8,
  promptApi: false,
  notes: [],
  ...o,
});

const rec = (id: string, sizeMB: number | null, o: Partial<ModelRecord> = {}): ModelRecord => ({
  id,
  provides: ["chat"],
  provider: "tjs",
  source: {},
  sizeMB,
  sizeSource: "inferred",
  ladder: [{ device: "wasm" }],
  licence: "MIT",
  commercial: true,
  ...o,
});

// budget on 4 gb: 1843 mb (computed, 45 percent)
const four = env({ deviceMemoryGB: 4 });
const cat = [rec("s", 100), rec("m", 500), rec("l", 1500), rec("xl", 3000)];

describe("suggestDefaults", () => {
  it("no probe gives the fallback budget and says so", () => {
    const d = suggestDefaults(undefined, { catalogue: cat });
    expect(d.budget.why).toBe("machine memory unknown");
    expect(d.reasons.find((r) => r.label === "memory budget")!.why).toMatch(/machine memory unknown\. proposed, not measured\./);
    expect(d.patch.device).toBe("wasm");
  });

  it("caps a cpu only machine", () => {
    const d = suggestDefaults(env({ webgpu: false, deviceMemoryGB: 32 }), { catalogue: [...cat, rec("big", 7000)] });
    expect(d.budget.mb).toBe(6144);
    expect(d.download!.id).toBe("xl");
  });

  it("chooses the largest stored model that fits", () => {
    const p = pickModel(four, { catalogue: cat, stored: ["s", "m", "xl"] });
    expect(p.model).toBe("m");
    expect(p.why).toBe("largest stored model that fits (4 gb memory, webgpu).");
  });

  it("offers a catalogue row only above 1.5 times the stored pick", () => {
    expect(pickModel(four, { catalogue: cat, stored: ["m"] }).download!.id).toBe("l");
    const near = [rec("m", 500), rec("n", 700)];
    expect(pickModel(four, { catalogue: near, stored: ["m"] }).download).toBe(null);
  });

  it("with none that fit, chooses the smallest stored and warns it is slow", () => {
    const p = pickModel(four, { catalogue: cat, stored: ["xl"] });
    expect(p.model).toBe("xl");
    expect(p.why).toMatch(/large for this machine.*replies may be slow\./);
    expect(p.download!.id).toBe("l");
  });

  it("nothing stored gives an empty pick plus an offer that fits storage", () => {
    const tight: StorageEstimate = { used: 0, quota: 1000 * 1024 * 1024, fits: (b) => 1000 * 1024 * 1024 >= 1.2 * b };
    const d = suggestDefaults(four, { catalogue: cat, estimate: tight });
    expect(d.patch.model).toBe(null);
    expect(d.download!.id).toBe("m");
    expect(d.reasons[0]).toEqual({ label: "model", value: "none yet", why: "nothing stored. m fits, 500 mb (inferred), 4 gb memory, webgpu." });
    expect(d.reasons.at(-1)!.label).toBe("download");
  });

  it("leaves out rows this device cannot run", () => {
    const gpu = rec("gpu", 200, { ladder: [{ device: "webgpu", dtype: "q4f16_1" }] });
    expect(pickModel(env({ f16: false }), { catalogue: [gpu, rec("s", 100)] }).download!.id).toBe("s");
  });

  it("the same inputs give the same output", () => {
    const a = suggestDefaults(env(), { catalogue: CATALOG, stored: ["smollm2-360m-instruct"] });
    expect(a).toEqual(suggestDefaults(env(), { catalogue: CATALOG, stored: ["smollm2-360m-instruct"] }));
    expect(a.patch.model).toBe("smollm2-360m-instruct");
    expect(a.download!.id).toBe("hermes-3-llama-3.2-3b-mlc");
  });
});

describe("hub.onLoad", () => {
  const ok = rec("ok", 1, { provider: "p" });
  it("every listener gets every phase and an unsubscribed one gets none", async () => {
    const hub = createHub({ onLicence: () => {} });
    hub.registry.add(ok);
    hub.provide("p", async (ctx) => {
      ctx.report("fetch", 0.5, "a.bin");
      ctx.report("compile", null);
      ctx.report("warm", null);
      return {};
    });
    const a: LoadEvent[] = [];
    const b: LoadEvent[] = [];
    const c: LoadEvent[] = [];
    hub.onLoad((e) => a.push(e));
    hub.onLoad((e) => b.push(e));
    const off = hub.onLoad((e) => c.push(e));
    off();
    await hub.use({ id: "ok" });
    expect(a.map((e) => e.phase)).toEqual(["fetch", "fetch", "compile", "warm", "ready"]);
    expect(a[1]).toEqual({ id: "ok", phase: "fetch", fraction: 0.5, file: "a.bin", rung: 0 });
    expect(b).toEqual(a);
    expect(c).toEqual([]);
  });

  it("a ladder fallback reports the second rung under the same id, and a failure says so", async () => {
    const hub = createHub({ onLicence: () => {} });
    hub.registry.add(rec("two", 1, { provider: "p", ladder: [{ device: "wasm", dtype: "a" }, { device: "wasm", dtype: "b" }] }));
    hub.registry.add(rec("bad", 1, { provider: "p", ladder: [{ device: "wasm", dtype: "x" }] }));
    hub.provide("p", async (ctx) => {
      ctx.report("fetch", 1);
      if (ctx.rung.dtype !== "b") throw new Error("unsupported operator Foo");
      return {};
    });
    const seen: LoadEvent[] = [];
    hub.onLoad((e) => seen.push(e));
    await hub.use({ id: "two" });
    expect(seen.map((e) => `${e.id}:${e.rung}:${e.phase}`)).toEqual(["two:0:fetch", "two:0:fetch", "two:1:fetch", "two:1:fetch", "two:1:ready"]);
    seen.length = 0;
    await expect(hub.use({ id: "bad" })).rejects.toThrow();
    expect(seen.at(-1)).toMatchObject({ id: "bad", phase: "failed", rung: 0 });
  });

  it("a listener that throws does not break the load", async () => {
    const hub = createHub({ onLicence: () => {} });
    hub.registry.add(ok);
    hub.provide("p", async () => ({}));
    hub.onLoad(() => {
      throw new Error("listener");
    });
    await expect(hub.use({ id: "ok" })).resolves.toMatchObject({ id: "ok" });
  });
});

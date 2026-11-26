import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import {
  CATALOG,
  CPU_CAP_MB,
  FALLBACK_BUDGET_MB,
  PRESETS,
  SLOTS,
  budgetFor,
  createRegistry,
  fitOf,
  ggufFacts,
  pinnedSha,
  presetTotal,
  RegistryError,
  validateRecord,
  type ModelRecord,
  type StorageEstimate,
} from "@hackbuild/models";

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

const rec = (o: Partial<ModelRecord> = {}): ModelRecord => ({
  id: "m",
  provides: ["chat"],
  provider: "webllm",
  source: {},
  sizeMB: 1000,
  sizeSource: "vendor",
  ladder: [{ device: "webgpu", dtype: "q4f16_1" }],
  licence: "Apache-2.0",
  commercial: true,
  ...o,
});

const est = (freeMB: number | null): StorageEstimate => ({
  used: 0,
  quota: freeMB === null ? null : freeMB * 1024 * 1024,
  fits: (bytes) => freeMB === null || freeMB * 1024 * 1024 >= 1.2 * bytes,
});

describe("catalogue facts", () => {
  it("every CATALOG row stays valid and chat rows carry censorship", () => {
    for (const r of CATALOG) {
      expect(() => validateRecord(r)).not.toThrow();
      if (r.provides.includes("chat")) expect(r.censorship).toBeDefined();
      if (r.vramMB != null) expect(["vendor", "computed"]).toContain(r.vramSource);
    }
    expect(CATALOG.find((r) => r.id === "hermes-3-llama-3.2-3b-mlc")).toMatchObject({ params: "3B", vramMB: 2200, censorship: "uncensored", tier: "medium" });
  });

  it("holds the chat rows of design 3.1 with a measured size, a group and the owner's label", () => {
    const want = [
      "hermes-3-llama-3.2-3b-mlc", "qwen2.5-1.5b-instruct-mlc", "llama-3.2-1b-instruct-mlc", "smollm2-360m-instruct",
      "llama-3.2-3b-instruct-q4f32-mlc", "gemma-2-2b-it-mlc", "qwen2.5-3b-instruct-mlc", "qwen2.5-7b-instruct-mlc", "llama-3.1-8b-instruct-q4f32-mlc",
      "gemma-4-e4b-abliterated-gguf", "gemma-4-e2b-abliterated-gguf", "qwen3.5-4b-abliterated-gguf", "hermes-3-llama-3.2-3b-abliterated-gguf",
      "hermes-3-llama-3.2-3b-abliterated-iq3-gguf", "llama-3.2-3b-instruct-uncensored-gguf", "qwen3.5-2b-abliterated-gguf", "qwen3.5-0.8b-abliterated-gguf",
      "hermes-3-llama-3.1-8b-mlc", "qwen3-0.6b", "deepseek-r1-distill-qwen-1.5b", "deepseek-r1-distill-qwen-7b-mlc",
      "smollm2-135m-instruct", "gemma-3-270m-it", "qwen2.5-0.5b-instruct-gguf", "gemini-nano",
    ];
    const byId = new Map(CATALOG.map((r) => [r.id, r]));
    expect(new Set(CATALOG.map((r) => r.id)).size).toBe(CATALOG.length);
    for (const id of want) {
      const r = byId.get(id);
      expect(r, id).toBeDefined();
      expect(r!.group, id).toBeTruthy();
      expect(r!.badge, id).toBeTruthy();
      if (r!.provider !== "prompt-api") expect([id, r!.sizeSource]).toEqual([id, "measured"]);
    }
    expect(byId.get("gemma-4-e4b-abliterated-gguf")).toMatchObject({ badge: "best", group: "uncensored", censorship: "abliterated", params: "E4B" });
    expect(byId.get("llama-3.2-3b-instruct-uncensored-gguf")!.censorship).toBe("uncensored");
    expect(byId.get("hermes-3-llama-3.1-8b-mlc")!.censorship).toBe("uncensored");
  });

  it("names censorship from the repo words and pins every gguf file with its SHA-256", () => {
    for (const r of CATALOG) {
      const words = `${r.source.repo ?? ""} ${r.source.file ?? ""}`.toLowerCase();
      if (words.includes("abliterated")) expect([r.id, r.censorship]).toEqual([r.id, "abliterated"]);
      else if (words.includes("uncensored")) expect([r.id, r.censorship]).toEqual([r.id, "uncensored"]);
      if (r.provider !== "wllama") continue;
      const rec = createRegistry([r]).get(r.id)!;
      expect(rec.source.revision, r.id).toMatch(/^[0-9a-f]{40}$/);
      const url = `https://huggingface.co/${rec.source.repo}/resolve/${rec.source.revision}/${rec.source.file}`;
      expect(pinnedSha(url), r.id).toMatch(/^[0-9a-f]{64}$/);
      // sharded repos name the quant in the repo, not the shard file
      expect(ggufFacts(r.source.file!).quant ?? ggufFacts(r.source.repo!).quant).toBe(r.quant);
    }
  });

  it("rejects a VRAM figure with no source word and an unknown censorship value", () => {
    expect(() => validateRecord(rec({ vramMB: 900 }))).toThrow(RegistryError);
    expect(() => validateRecord(rec({ censorship: "spicy" as never }))).toThrow(/censorship/);
    expect(() => validateRecord(rec({ vramMB: 900, vramSource: "vendor", censorship: "abliterated" }))).not.toThrow();
  });
});

describe("budgetFor", () => {
  it("no probe or no device memory gives the fallback and says so", () => {
    expect(budgetFor(undefined)).toEqual({ mb: FALLBACK_BUDGET_MB, why: "machine memory unknown", source: "proposed" });
    expect(budgetFor(env({ deviceMemoryGB: null })).why).toBe("machine memory unknown");
  });

  it("takes 45 percent of device memory", () => {
    const b = budgetFor(env({ deviceMemoryGB: 4 }));
    expect(b.mb).toBe(Math.round(4 * 1024 * 0.45));
    expect(b.why).toBe("4 gb memory, webgpu");
    expect(budgetFor(env()).why).toBe("8 gb memory or more, webgpu");
  });

  it("caps a cpu only machine", () => {
    const b = budgetFor(env({ webgpu: false, deviceMemoryGB: 32 }));
    expect(b.mb).toBe(CPU_CAP_MB);
    expect(b.why).toMatch(/running on cpu/);
    expect(budgetFor(env({ webgpu: true, deviceMemoryGB: 32 })).mb).toBeGreaterThan(CPU_CAP_MB);
  });

  it("is pure", () => {
    expect(budgetFor(env({ deviceMemoryGB: 2 }))).toEqual(budgetFor(env({ deviceMemoryGB: 2 })));
  });
});

describe("fitOf", () => {
  it("fits with the device and the share of the budget", () => {
    const f = fitOf(rec(), env());
    expect(f).toMatchObject({ fit: "fits", ok: true });
    expect(f.reason).toMatch(/runs on webgpu/);
  });

  it("names a missing shader-f16 and a missing adapter", () => {
    expect(fitOf(rec(), env({ f16: false }))).toMatchObject({ fit: "needs f16", ok: false });
    expect(fitOf(rec(), env({ webgpu: false, f16: false }))).toMatchObject({ fit: "needs webgpu", ok: false });
  });

  it("falls to cpu with a slow note when the gpu rungs are skipped", () => {
    const r = rec({ provider: "tjs", ladder: [{ device: "webgpu", dtype: "q4" }, { device: "wasm", dtype: "q4" }] });
    expect(fitOf(r, env({ webgpu: false }))).toMatchObject({ fit: "fits on cpu, slow", ok: true });
    const cpuOnly = rec({ provider: "tjs", ladder: [{ device: "wasm", dtype: "q8" }] });
    expect(fitOf(cpuOnly, env({ webgpu: false })).fit).toBe("fits");
  });

  it("checks VRAM before the download size against the budget", () => {
    const r = rec({ sizeMB: 1000, vramMB: 5000, vramSource: "vendor" });
    const f = fitOf(r, env({ deviceMemoryGB: 8 }));
    expect(f.fit).toBe("over memory");
    expect(f.reason).toMatch(/needs 4\.9 gb \(vendor\)/);
  });

  it("checks the storage estimate against the download", () => {
    const f = fitOf(rec({ sizeMB: 290 }), env(), est(310));
    expect(f.fit).toBe("over storage");
    expect(f.reason).toBe("310 mb free. this model needs 290 mb (vendor). remove a stored model or pick a smaller one.");
    expect(fitOf(rec({ sizeMB: 290 }), env(), est(null)).fit).toBe("fits");
  });

  it("says why the prompt api and remote rows fit or not", () => {
    const nano = CATALOG.find((r) => r.id === "gemini-nano")!;
    expect(fitOf(nano, env())).toMatchObject({ fit: "cannot run here", reason: "this browser has no prompt api." });
    expect(fitOf(nano, env({ promptApi: true })).fit).toBe("fits");
    expect(fitOf(rec({ provider: "remote", ladder: [{ device: "remote" }] }), env()).ok).toBe(true);
  });
});

describe("presets", () => {
  it("every pick is a CATALOG id in a known slot", () => {
    const ids = new Set(CATALOG.map((r) => r.id));
    const slots = new Set(SLOTS.map((s) => s.slot));
    for (const p of PRESETS) for (const [slot, id] of Object.entries(p.picks)) {
      expect(slots.has(slot as never)).toBe(true);
      expect(ids.has(id!)).toBe(true);
    }
    expect(PRESETS.map((p) => p.label)).toEqual(["phone", "laptop", "desktop"]);
  });

  it("states a computed total with the weakest source word", () => {
    const t = presetTotal(PRESETS[0]!, CATALOG);
    expect(t.mb).toBe(174 + 23);
    expect(t.source).toBe("inferred");
    expect(t.parts.map((p) => p.slot)).toEqual(["brain", "embedder"]);
    const totals = PRESETS.map((p) => presetTotal(p, createRegistry(CATALOG)).mb);
    expect(totals[0]! < totals[1]! && totals[1]! < totals[2]!).toBe(true);
  });

  it("counts a record once and lists picks with no size", () => {
    const recs = [rec({ id: "a", sizeMB: 100, sizeSource: "measured" }), rec({ id: "b", sizeMB: null, sizeSource: "unknown" })];
    const t = presetTotal({ id: "x", label: "x", picks: { brain: "a", smallBrain: "a", ears: "b", voice: "gone" } }, recs);
    expect(t.mb).toBe(100);
    expect(t.unknown).toEqual(["b", "gone"]);
    expect(t.source).toBe("unknown");
    expect(presetTotal({ id: "y", label: "y", picks: { brain: "a" } }, recs).source).toBe("measured");
  });
});

describe("ggufFacts", () => {
  it("reads params, quant and part from file names", () => {
    expect(ggufFacts("Hermes-3-Llama-3.2-3B-abliterated.i1-Q4_K_M.gguf")).toEqual({ params: "3B", quant: "Q4_K_M", part: null });
    expect(ggufFacts("Hermes-3-Llama-3.2-3B-abliterated.i1-IQ3_XS.gguf").quant).toBe("IQ3_XS");
    expect(ggufFacts("model-7b-f16.gguf")).toEqual({ params: "7B", quant: "F16", part: null });
    expect(ggufFacts("gemma-4-E4B-it-abliterated-Q4_K_M.gguf").params).toBe("E4B");
    expect(ggufFacts("Qwen3-Coder-26B-A4B-Q4_K_M.gguf").params).toBe("26B-A4B");
    expect(ggufFacts("repo/Big-70B-Q4_K_M-00002-of-00003.gguf")).toEqual({ params: "70B", quant: "Q4_K_M", part: { index: 2, count: 3 } });
    expect(ggufFacts("weights.gguf")).toEqual({ params: null, quant: null, part: null });
  });
});

describe("unrunnable records", () => {
  it("never fit, and say why", () => {
    const r = { ...CATALOG[0]!, unrunnable: "not run yet. needs two text encoders." };
    expect(fitOf(r, undefined)).toEqual({ fit: "cannot run here", ok: false, reason: "not run yet. needs two text encoders." });
  });
});

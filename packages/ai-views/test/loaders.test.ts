import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import { memoryBackend, openWeightStore } from "@hackbuild/weights";
import { jobLoader, jobRecords, type LoadContext } from "../src/index.js";
import { chipWords, shortName } from "../src/mount-model.js";

// a machine with a webgpu adapter, as a probe reports one (fixture)
const ENV = {
  webgpu: true, f16: true, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https",
  opfs: false, cacheStorage: false, indexedDB: false, threads: 1, deviceMemoryGB: 8, promptApi: false,
} as unknown as Env;

const ctx = (signal = new AbortController().signal, seen: (number | null)[] = []): LoadContext => ({ signal, onProgress: (f) => seen.push(f), options: {} });
const rec = (job: Parameters<typeof jobRecords>[0], provider: string) => {
  const r = jobRecords(job).find((x) => x.provider === provider);
  if (!r) throw new Error(`no ${provider} record for ${job}`);
  return r;
};
const store = () => openWeightStore({ backends: [memoryBackend()], locks: false });

// no test may reach the network: fetch throws, and the runtime imports are fakes
let fetched: string[] = [];
beforeEach(() => {
  fetched = [];
  vi.stubGlobal("fetch", (u: unknown) => {
    fetched.push(String(u));
    throw new Error("no network in tests");
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("jobLoader", () => {
  it("loads a transformers.js chat model through the runtime it is given and hands back a chat engine", async () => {
    const calls: string[] = [];
    const tjs = {
      env: { backends: { onnx: { wasm: {} } } },
      pipeline: async (task: string, model: string, o: { progress_callback?: (e: object) => void }) => {
        calls.push(`${task} ${model}`);
        o.progress_callback?.({ status: "progress", file: "model.onnx", loaded: 50, total: 100 });
        return Object.assign(async () => [{ generated_text: "hi" }], { tokenizer: {} });
      },
    };
    const seen: (number | null)[] = [];
    const r = rec("chat", "tjs");
    const engine = (await jobLoader("chat", { env: ENV, store: store(), modules: { transformers: async () => tjs } })(r, ctx(undefined, seen))) as { stream?: unknown };
    expect(typeof engine.stream).toBe("function");
    expect(calls[0]).toMatch(/^text-generation /);
    expect(seen.length).toBeGreaterThan(0);
    expect(fetched).toEqual([]);
  });

  it("turns a depth pipeline into a depth function, larger nearer", async () => {
    const tjs = {
      env: {},
      pipeline: async () => async () => ({ predicted_depth: { data: Float32Array.from([1, 3, 2, 4]), dims: [2, 2] } }),
    };
    const r = rec("depth", "tjs");
    const fn = (await jobLoader("depth", { env: ENV, store: store(), modules: { transformers: async () => tjs } })(r, ctx())) as (i: unknown) => Promise<{ width: number; height: number; data: Float32Array }>;
    const d = await fn({});
    expect([d.width, d.height]).toEqual([2, 2]);
    expect(Math.max(...d.data)).toBeCloseTo(1);
    expect(Math.min(...d.data)).toBeCloseTo(0);
  });

  it("loads a webllm model from the module it is given", async () => {
    const made: string[] = [];
    const webllm = {
      prebuiltAppConfig: { model_list: [] },
      CreateMLCEngine: async (id: string, cfg: { initProgressCallback?: (p: object) => void }) => {
        made.push(id);
        cfg.initProgressCallback?.({ progress: 0.5, text: "Fetching param cache[1/2]: 10MB fetched" });
        return { chat: { completions: { create: async () => ({}) } }, interruptGenerate() {}, unload: async () => {} };
      },
    };
    const r = rec("chat", "webllm");
    const engine = (await jobLoader("chat", { env: ENV, store: store(), modules: { webllm: async () => webllm } })(r, ctx())) as { stream?: unknown };
    expect(made).toEqual([r.source.modelId ?? r.id]);
    expect(typeof engine.stream).toBe("function");
  });

  it("names the gpl phonemizer and fetches nothing when kokoro is not allowed", async () => {
    const r = jobRecords("voice").find((x) => x.provider === "kokoro-js")!;
    await expect(jobLoader("voice", { env: ENV, store: store() })(r, ctx())).rejects.toThrow(/gpl/);
    expect(fetched).toEqual([]);
  });

  it("says plainly that fastsam has no decoder yet", async () => {
    const r = jobRecords("masks").find((x) => x.id === "fastsam-s")!;
    await expect(jobLoader("masks", { env: ENV, store: store() })(r, ctx())).rejects.toThrow(/slimsam/);
  });

  it("stops when the signal aborts", async () => {
    const tjs = { env: {}, pipeline: () => new Promise(() => {}) };
    const ac = new AbortController();
    const p = jobLoader("depth", { env: ENV, store: store(), modules: { transformers: async () => tjs } })(rec("depth", "tjs"), ctx(ac.signal));
    setTimeout(() => ac.abort(), 20);
    await expect(p).rejects.toBeTruthy();
  });

  it("imports no runtime until a load is asked for", async () => {
    let imported = 0;
    jobLoader("chat", { env: ENV, store: store(), modules: { transformers: async () => (imported++, {}) } });
    expect(imported).toBe(0);
  });
});

describe("chip words", () => {
  it("cuts a model name to a short one", () => {
    expect(shortName("hermes 3 llama 3.2 3b")).toBe("hermes 3 3b");
    expect(shortName("smollm2 360m instruct")).toBe("smollm2 360m");
    expect(shortName("slimsam 77 uniform (point prompts)")).toBe("slimsam 77");
    expect(shortName("whisper base.en")).toBe("whisper base.en");
  });
  it("shows the short name and the size, then the state once it moves", () => {
    const s = { job: "chat", title: "", empty: "no model", rows: [], chosen: "a", loaded: undefined } as const;
    expect(chipWords({ ...s, row: { id: "a", name: "smollm2 360m instruct", group: "start", size: "388 mb", state: "none" } } as never)).toBe("smollm2 360m, 388 mb");
    expect(chipWords({ ...s, row: { id: "a", name: "smollm2 360m instruct", group: "start", size: "388 mb", state: "loaded" } } as never)).toMatch(/^smollm2 360m, /);
    expect(chipWords({ ...s, row: undefined } as never)).toBe("no model");
  });
});

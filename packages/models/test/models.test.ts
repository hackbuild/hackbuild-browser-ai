import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import {
  CATALOG,
  PINS,
  pinnedSha,
  classifyError,
  createHub,
  createRegistry,
  HubError,
  LadderError,
  ladderFor,
  ortLadder,
  RegistryError,
  sizeClass,
  stubFactory,
  walkLadder,
  type ModelRecord,
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

const rec = (id: string, o: Partial<ModelRecord> = {}): ModelRecord => ({
  id,
  provides: ["chat"],
  provider: "fake",
  source: {},
  sizeMB: 100,
  sizeSource: "inferred",
  ladder: [{ device: "wasm", dtype: "q4" }],
  licence: "MIT",
  commercial: true,
  ...o,
});

describe("records and ladders", () => {
  it("every catalog record names a licence and has a ladder", () => {
    const reg = createRegistry(CATALOG);
    expect(reg.list().length).toBe(CATALOG.length);
    for (const r of CATALOG) {
      expect(r.licence.length).toBeGreaterThan(2);
      expect(r.ladder.length).toBeGreaterThan(0);
    }
  });

  it("refuses a record with no licence", () => {
    expect(() => createRegistry([rec("x", { licence: " " })])).toThrow(RegistryError);
  });

  it("drops f16 rungs without shader-f16 and webgpu rungs without an adapter", () => {
    const depth = CATALOG.find((r) => r.id === "depth-anything-v2-small")!;
    expect(ladderFor(depth, env()).rungs.map((r) => `${r.device}:${r.dtype}`)).toEqual(["webgpu:fp16", "webgpu:fp32", "wasm:q8", "wasm:fp32"]);
    const noF16 = ladderFor(depth, env({ f16: false }));
    expect(noF16.rungs.map((r) => `${r.device}:${r.dtype}`)).toEqual(["webgpu:fp32", "wasm:q8", "wasm:fp32"]);
    expect(noF16.skipped[0]!.missing).toEqual(["webgpu", "shader-f16"].filter((n) => n === "shader-f16"));
    expect(ladderFor(depth, env({ webgpu: false, f16: false })).rungs.every((r) => r.device === "wasm")).toBe(true);
    const nano = CATALOG.find((r) => r.id === "gemini-nano")!;
    expect(ladderFor(nano, env()).rungs).toEqual([]);
    expect(ladderFor(nano, env({ promptApi: true })).rungs.length).toBe(1);
  });

  it("reads per sub graph dtypes for the f16 need", () => {
    const r = rec("w", { ladder: [{ device: "webgpu", dtype: { encoder_model: "fp16", decoder_model_merged: "q4" } }] });
    expect(ladderFor(r, env({ f16: false })).rungs).toEqual([]);
  });

  it("gives the onnxruntime ladder in the transcription build's order", () => {
    expect(ortLadder().map((r) => `${r.ort!.executionProviders.join("+")}/${r.ort!.graphOptimizationLevel}`)).toEqual([
      "webgpu+wasm/basic",
      "webgpu+wasm/all",
      "webgpu+wasm/disabled",
      "wasm/all",
    ]);
  });

  it("classifies the failures the builds logged", () => {
    expect(classifyError(new Error("LinkError: WebAssembly.instantiate(): TVMFFI"))).toBe("runtime-mismatch");
    expect(classifyError(new RangeError("RangeError: Array buffer allocation failed"))).toBe("out-of-memory");
    expect(classifyError(new Error("RuntimeError: memory access out of bounds"))).toBe("out-of-memory");
    expect(classifyError(new Error("transformer_memcpy failed"))).toBe("unsupported-op");
    expect(classifyError(new Error("adapter lacks shader-f16"))).toBe("f16");
    expect(classifyError(new Error("GPUDevice was lost"))).toBe("device-lost");
    expect(classifyError(new Error("http 404"))).toBe("network");
    expect(classifyError(new DOMException("x", "AbortError"))).toBe("abort");
    expect(classifyError("odd")).toBe("unknown");
  });

  it("walks a ladder and stops on a network error", async () => {
    const tried: string[] = [];
    const ok = await walkLadder("m", [{ device: "webgpu", dtype: "fp16" }, { device: "wasm", dtype: "q8" }], async (r) => {
      tried.push(`${r.device}`);
      if (r.device === "webgpu") throw new Error("memory access out of bounds");
      return 7;
    });
    expect(ok.value).toBe(7);
    expect(ok.failures[0]!.kind).toBe("out-of-memory");
    const err = await walkLadder("m", [{ device: "wasm" }, { device: "cpu" }], async () => {
      throw new Error("fetch failed");
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LadderError);
    expect((err as LadderError).failures.length).toBe(1);
  });

  it("routes by capability, env, size and budget", () => {
    const reg = createRegistry(CATALOG);
    // the largest tiny chat model: qwen2.5 0.5b mlc at 290 MB (vendor) over gemma 3 270m at 280 MB (inferred)
    expect(reg.route({ provides: "chat", env: env(), size: "tiny" })!.id).toBe("qwen2.5-0.5b-instruct-mlc");
    expect(reg.route({ provides: "chat", env: env(), maxMB: 1000 })!.provider).not.toBe("prompt-api");
    expect(reg.route({ provides: "chat", env: env({ webgpu: false, f16: false }) })!.provider).toMatch(/tjs|wllama/);
    expect(reg.route({ provides: "stems", env: env() })!.id).toBe("htdemucs-fast");
    expect(reg.route({ provides: "imagegen", env: env() })).toBeUndefined();
    expect(reg.find({ provides: "chat", commercial: true }).some((r) => r.id === "gemini-nano")).toBe(false);
    expect([sizeClass(100), sizeClass(1000), sizeClass(2000), sizeClass(9000), sizeClass(null)]).toEqual(["tiny", "small", "medium", "large", null]);
  });
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("hub", () => {
  it("loads through the provider factory, falls down the ladder, and reuses the load", async () => {
    const reg = createRegistry([rec("a", { ladder: [{ device: "webgpu", dtype: "fp16" }, { device: "wasm", dtype: "q8" }] })]);
    const hub = createHub({ registry: reg, env: env() });
    let calls = 0;
    hub.provide("fake", async ({ rung }) => {
      calls++;
      if (rung.device === "webgpu") throw new Error("memory access out of bounds");
      return { name: `on ${rung.device}` };
    });
    const [l1, l2] = await Promise.all([hub.use<{ name: string }>("chat"), hub.use<{ name: string }>("chat")]);
    expect(l1).toBe(l2);
    expect(l1.value.name).toBe("on wasm");
    expect(l1.failures.map((f) => f.kind)).toEqual(["out-of-memory"]);
    expect(calls).toBe(2);
    expect(hub.status()[0]).toMatchObject({ id: "a", refs: 2, device: "wasm" });
  });

  it("disposes idle models oldest first to stay under the budget", async () => {
    let t = 0;
    const disposed: string[] = [];
    const reg = createRegistry([
      rec("x", { provides: ["depth"], sizeMB: 300 }),
      rec("y", { provides: ["detect"], sizeMB: 300 }),
      rec("z", { provides: ["segment"], sizeMB: 300 }),
    ]);
    const hub = createHub({ registry: reg, budgetMB: 700, now: () => ++t });
    hub.provide("fake", async ({ record }) => ({ dispose: () => disposed.push(record.id) }));
    const x = await hub.use("depth");
    const y = await hub.use("detect");
    hub.release(x);
    hub.release(y);
    await hub.use("segment");
    expect(disposed).toEqual(["x"]);
    expect(hub.residentMB()).toBe(600);
    // y is idle, so x fits again once y goes
    await hub.use({ id: "x" });
    expect(disposed).toEqual(["x", "y"]);
  });

  it("refuses when busy models fill the budget", async () => {
    const reg = createRegistry([rec("x", { provides: ["depth"], sizeMB: 600 }), rec("y", { provides: ["detect"], sizeMB: 600 })]);
    const hub = createHub({ registry: reg, budgetMB: 1000 });
    hub.provide("fake", async () => ({}));
    await hub.use("depth");
    const err = await hub.use({ id: "y" }).catch((e: unknown) => e);
    expect((err as HubError).code).toBe("budget");
    expect(((await hub.use("detect").catch((e: unknown) => e)) as HubError).code).toBe("no-route");
  });

  it("runs gpu jobs one at a time by priority, fifo within a priority", async () => {
    const hub = createHub();
    const order: string[] = [];
    let running = 0;
    let maxRunning = 0;
    const job = (name: string) => async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await tick();
      order.push(name);
      running--;
    };
    const all = [
      hub.exclusive("gpu", job("first")),
      hub.exclusive("gpu", job("murmur"), { priority: 0 }),
      hub.exclusive("gpu", job("glance"), { priority: 1 }),
      hub.exclusive("gpu", job("speech"), { priority: 3 }),
      hub.exclusive("gpu", job("deliberation"), { priority: 2 }),
      hub.exclusive("gpu", job("speech2"), { priority: 3 }),
    ];
    await Promise.all(all);
    expect(order).toEqual(["first", "speech", "speech2", "deliberation", "glance", "murmur"]);
    expect(maxRunning).toBe(1);
  });

  it("states a record's weight licence once, before its first load", async () => {
    const lines: string[] = [];
    const rec = { ...CATALOG[0]!, id: "s", provider: "stub", ladder: [{ device: "cpu" as const }] };
    const hub = createHub({ registry: createRegistry([rec]), onLicence: (l) => lines.push(l) });
    hub.provide("stub", stubFactory({ chat: () => ({}) }));
    const a = await hub.use({ id: "s" });
    hub.release(a);
    await hub.use({ id: "s" });
    expect(lines.length).toBe(1);
    expect(lines[0]).toMatch(/weight licence Apache-2.0/);
  });

  it("classifies a lost device before f16, and a failed graph load as no network failure", () => {
    expect(classifyError(new Error("GPUDevice was lost while running a shader-f16 kernel"))).toBe("device-lost");
    expect(classifyError(new Error("Failed to load model because protobuf parsing failed"))).toBe("unknown");
    expect(classifyError(new TypeError("Failed to fetch"))).toBe("network");
    expect(classifyError(new Error("http 404 for https://h.test/x"))).toBe("network");
  });

  it("keeps the queue moving after a job throws synchronously", async () => {
    const hub = createHub();
    const a = hub.exclusive("gpu", (() => {
      throw new Error("sync");
    }) as unknown as () => Promise<void>);
    await expect(a).rejects.toThrow("sync");
    expect(await hub.exclusive("gpu", async () => "ran")).toBe("ran");
  });

  it("drops an aborted waiter and keeps the queue moving after a failure", async () => {
    const hub = createHub();
    const ac = new AbortController();
    const a = hub.exclusive("gpu", async () => {
      await tick();
      throw new Error("shader compile failed");
    });
    const b = hub.exclusive("gpu", async () => "b", { signal: ac.signal }).catch((e: Error) => e.message);
    const c = hub.exclusive("gpu", async () => "c");
    ac.abort();
    await expect(a).rejects.toThrow(/shader/);
    expect(await b).toMatch(/aborted while waiting/);
    await expect(c).resolves.toBe("c");
  });

  it("chains calls on one capability in order", async () => {
    const hub = createHub();
    const vlm = hub.chain("vlm");
    const out: number[] = [];
    await Promise.all([3, 1, 2].map((n) => vlm(async () => {
      await new Promise((r) => setTimeout(r, n));
      out.push(n);
    })));
    expect(out).toEqual([3, 1, 2]);
    await expect(vlm(async () => { throw new Error("x"); })).rejects.toThrow("x");
    await expect(vlm(async () => 5)).resolves.toBe(5);
  });

  it("runs webgpu models under the gpu lock and wasm models outside it", async () => {
    const reg = createRegistry([rec("g", { provides: ["depth"], ladder: [{ device: "webgpu", dtype: "fp32" }] }), rec("c", { provides: ["embed"] })]);
    const hub = createHub({ registry: reg, env: env() });
    hub.provide("fake", async () => ({}));
    const g = await hub.use("depth");
    const c = await hub.use("embed");
    let release!: () => void;
    const held = hub.exclusive("gpu", () => new Promise<void>((r) => (release = r)));
    const order: string[] = [];
    const pg = hub.run(g, async () => void order.push("gpu model"));
    const pc = hub.run(c, async () => void order.push("cpu model"));
    await pc;
    expect(order).toEqual(["cpu model"]);
    release();
    await Promise.all([held, pg]);
    expect(order).toEqual(["cpu model", "gpu model"]);
  });

  it("routes every capability to stubs in stub mode", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory({ chat: () => ({ reply: "stub reply" }), depth: () => ({ map: new Float32Array(4) }) }));
    const chat = await hub.use<{ reply: string }>("chat");
    expect(chat.value.reply).toBe("stub reply");
    expect(chat.record.licence).toMatch(/no weights/);
    expect((await hub.use<{ map: Float32Array }>("depth")).value.map.length).toBe(4);
    const err = (await hub.use("stems").catch((e: unknown) => e)) as LadderError;
    expect(err.failures[0]!.error).toBe("no stub for stems");
  });

  it("names the missing provider", async () => {
    const hub = createHub({ registry: createRegistry([rec("a")]) });
    expect(((await hub.use("chat").catch((e: unknown) => e)) as HubError).code).toBe("no-provider");
  });
});

describe("run scheduling", () => {
  const rec = (id: string): ModelRecord => ({
    id,
    provides: ["depth"],
    provider: "fake",
    source: {},
    sizeMB: 10,
    sizeSource: "measured",
    ladder: [{ device: "wasm" }],
    licence: "MIT",
    commercial: true,
  });
  function setup() {
    let t = 0;
    const slept: number[] = [];
    let idles = 0;
    const hub = createHub({
      registry: createRegistry([rec("m")]),
      now: () => t,
      timers: {
        sleep: async (ms) => {
          slept.push(ms);
          t += ms;
        },
        idle: async () => {
          idles++;
        },
      },
    });
    hub.provide("fake", async () => ({ run: async () => "ok" }));
    return { hub, slept, idles: () => idles, advance: (ms: number) => (t += ms), now: () => t };
  }

  it("waits out the minimum interval, or skips when asked", async () => {
    const s = setup();
    const l = await s.hub.use("depth");
    await s.hub.run(l, async () => 1, { minIntervalMs: 500 });
    s.advance(200);
    await s.hub.run(l, async () => 2, { minIntervalMs: 500 });
    expect(s.slept).toEqual([300]);
    s.advance(100);
    await expect(s.hub.run(l, async () => 3, { minIntervalMs: 500, when: "skip" })).rejects.toMatchObject({ code: "skipped" });
  });

  it("waits for idle and for frames under budget, then runs anyway after the defer limit", async () => {
    const s = setup();
    const l = await s.hub.use("depth");
    await s.hub.run(l, async () => 1, { idleOnly: true });
    expect(s.idles()).toBe(1);
    for (let i = 0; i < 30; i++) s.hub.reportFrame(25);
    expect(s.hub.frameMs()).toBe(25);
    await expect(s.hub.run(l, async () => 1, { frameBudgetMs: 20, when: "skip" })).rejects.toMatchObject({ code: "skipped" });
    const t0 = s.now();
    await s.hub.run(l, async () => 1, { frameBudgetMs: 20, maxDeferMs: 100 });
    expect(s.now() - t0).toBeGreaterThanOrEqual(100);
    for (let i = 0; i < 30; i++) s.hub.reportFrame(10);
    s.slept.length = 0;
    await s.hub.run(l, async () => 1, { frameBudgetMs: 20 });
    expect(s.slept).toEqual([]);
  });

  it("reports busy counts per model and to listeners, and skips re-entry", async () => {
    const s = setup();
    const l = await s.hub.use("depth");
    const seen: number[] = [];
    const off = s.hub.onBusy((n) => seen.push(n));
    let release!: () => void;
    const p = s.hub.run(l, () => new Promise<void>((r) => (release = r)));
    await Promise.resolve();
    expect(s.hub.busy("m")).toBe(1);
    expect(s.hub.status()[0]!.busy).toBe(1);
    await expect(s.hub.run(l, async () => 1, { minIntervalMs: 1, when: "skip" })).rejects.toMatchObject({ code: "skipped" });
    release();
    await p;
    expect(s.hub.busy()).toBe(0);
    expect(seen).toEqual([1, 0]);
    off();
  });
});

describe("pinned commits", () => {
  it("gives catalog records of pinned repos their commit, and a SHA-256 for files at it", () => {
    const repo = "Xenova/all-MiniLM-L6-v2";
    const pin = PINS[repo]!;
    expect(pin.revision).toMatch(/^[0-9a-f]{40}$/);
    const rec = createRegistry([...CATALOG]).get("all-minilm-l6-v2")!;
    expect(rec.source.revision).toBe(pin.revision);
    const [path, [sha]] = Object.entries(pin.files).find(([p]) => p.endsWith(".onnx"))!;
    expect(pinnedSha(`https://huggingface.co/${repo}/resolve/${pin.revision}/${path}`)).toBe(sha);
    expect(pinnedSha(`https://huggingface.co/${repo}/resolve/main/${path}`)).toBeUndefined();
    // every catalog record on a hugging face repo is pinned
    for (const r of createRegistry([...CATALOG]).list()) {
      const id = r.source.repo ?? r.source.modelId;
      if (id && id.includes("/")) expect(r.source.revision, r.id).toMatch(/^[0-9a-f]{40}$/);
    }
  });
});


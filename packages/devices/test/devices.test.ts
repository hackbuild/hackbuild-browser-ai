import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import { createHub, createRegistry, type ModelRecord } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";
import {
  LADDERS,
  configureTjs,
  graphFiles,
  ortProvider,
  pipelineOptions,
  progressMerger,
  runtimeLoader,
  sessionOptions,
  tjsLadder,
  tjsProvider,
  type MergedProgress,
  type OrtModule,
  type OrtSession,
  type TjsModule,
} from "@hackbuild/devices";

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

function host(files: Record<string, string>) {
  const calls: string[] = [];
  const f = async (url: string) => {
    calls.push(url);
    const body = files[url];
    return body === undefined ? new Response("missing", { status: 404 }) : new Response(body, { headers: { "content-length": String(body.length) } });
  };
  return { fetch: f as unknown as typeof fetch, calls };
}

describe("ladders", () => {
  it("builds the BAIL depth ladder", () => {
    expect(LADDERS.depth().map((r) => `${r.device} ${String(r.dtype)}`)).toEqual(["webgpu fp16", "webgpu fp32", "wasm q8", "wasm fp32"]);
  });
  it("puts wasm first for cpu perception and adds a fresh heap retry", () => {
    expect(LADDERS.perceptionCpu()[0]!.device).toBe("wasm");
    const s = LADDERS.smolvlm();
    expect(s[s.length - 1]).toMatchObject({ device: "wasm", freshHeap: true });
    expect(s[0]).toMatchObject({ device: "webgpu", dtype: { embed_tokens: "fp32", vision_encoder: "fp32" } });
    expect(tjsLadder({ webgpu: ["q4"], options: { task: "x" } })[0]!.options).toEqual({ task: "x" });
  });
  it("keeps per sub graph dtypes for whisper", () => {
    expect(LADDERS.whisperTurbo()[0]!.dtype).toEqual({ encoder_model: "fp16", decoder_model_merged: "q4" });
    expect(LADDERS.ort({ webgpu: false }).every((r) => r.device === "wasm")).toBe(true);
  });
});

describe("progress", () => {
  it("merges files and reports an mb count without totals", () => {
    const seen: MergedProgress[] = [];
    const m = progressMerger((p) => seen.push(p));
    m({ status: "progress", file: "a", loaded: 1048576 * 5 });
    expect(seen[0]!.line).toBe("downloading 5 MB");
    m({ status: "progress", file: "a", loaded: 50, total: 100 });
    m({ status: "progress", file: "b", loaded: 0, total: 100 });
    m({ status: "done", file: "b" });
    expect(seen[seen.length - 1]!.fraction).toBe(0.75);
    m({ status: "initiate", file: "c" });
    expect(seen.length).toBe(4);
  });
});

describe("transformers.js provider", () => {
  function fakeTjs(failDtypes: string[]) {
    const calls: { task: string; model: string; opts: Record<string, unknown> }[] = [];
    const mod: TjsModule = {
      env: { allowLocalModels: true, useWasmCache: true, backends: { onnx: { wasm: { numThreads: 8, proxy: true } } } },
      pipeline: async (task, model, opts) => {
        calls.push({ task, model, opts });
        if (failDtypes.includes(String(opts.dtype))) throw new Error("Unsupported data type: float16");
        return Object.assign(async () => ({ ok: true }), { dispose: async () => {} });
      },
    };
    return { mod, calls };
  }
  const rec: ModelRecord = {
    id: "depth-anything-v2-small",
    provides: ["depth"],
    provider: "tjs",
    source: { modelId: "onnx-community/depth-anything-v2-small" },
    sizeMB: 100,
    sizeSource: "inferred",
    ladder: LADDERS.depth(),
    licence: "Apache-2.0",
    commercial: true,
  };

  it("configures the runtime once and walks fp16 to fp32 on the same device", async () => {
    const { mod, calls } = fakeTjs(["fp16"]);
    const tjs = tjsProvider({ runtime: async () => mod });
    const hub = createHub({ registry: createRegistry([rec]), env: env() });
    hub.provide("tjs", tjs.factory);
    const l = await hub.use("depth");
    expect(l.rung).toMatchObject({ device: "webgpu", dtype: "fp32" });
    expect(l.failures[0]!.kind).toBe("f16");
    expect(calls.map((c) => c.task)).toEqual(["depth-estimation", "depth-estimation"]);
    expect(mod.env).toMatchObject({ allowLocalModels: false, useWasmCache: false, useBrowserCache: true });
    expect(mod.env!.backends!.onnx!.wasm).toEqual({ numThreads: 1, proxy: false });
  });

  it("routes a capability to a registered loader", async () => {
    const { mod } = fakeTjs([]);
    const tjs = tjsProvider({ runtime: async () => mod });
    tjs.loader("depth", async (ctx) => ({ custom: ctx.options.device }));
    const hub = createHub({ registry: createRegistry([rec]), env: env({ webgpu: false, f16: false }) });
    hub.provide("tjs", tjs.factory);
    expect((await hub.use<{ custom: string }>("depth")).value.custom).toBe("wasm");
  });

  it("turns the browser cache off on file:// and uses a custom cache when given", () => {
    const m: TjsModule = { env: {} };
    configureTjs(m, env({ protocol: "file" }));
    expect(m.env!.useBrowserCache).toBe(false);
    configureTjs(m, env(), { match: async () => undefined });
    expect(m.env).toMatchObject({ useCustomCache: true, useBrowserCache: false });
    expect(pipelineOptions({ device: "wasm", dtype: "q8", options: { task: "t", revision: "r" } })).toEqual({ device: "wasm", dtype: "q8", revision: "r" });
  });
});

describe("onnxruntime-web provider", () => {
  const rec: ModelRecord = {
    id: "toy",
    provides: ["stems"],
    provider: "ort",
    source: { repo: "x/toy", files: [{ path: "onnx/model.onnx" }, { path: "onnx/model.onnx_data" }] },
    sizeMB: 1,
    sizeSource: "measured",
    ladder: LADDERS.ort(),
    licence: "MIT",
    commercial: true,
  };

  it("fetches the graph once and walks session options until one builds", async () => {
    const base = "https://huggingface.co/x/toy/resolve/main/onnx/";
    const h = host({ [base + "model.onnx"]: "graph", [base + "model.onnx_data"]: "data" });
    const store = await openWeightStore({ backends: ["memory"], fetch: h.fetch, onNotice: () => {} });
    const seen: Record<string, unknown>[] = [];
    const session: OrtSession = { inputNames: ["mix"], outputNames: ["out"], run: async () => ({}) };
    const ort: OrtModule = {
      env: { wasm: {} },
      Tensor: class {
        constructor(
          readonly type: string,
          readonly data: ArrayLike<number>,
          readonly dims: readonly number[],
        ) {}
      } as unknown as OrtModule["Tensor"],
      InferenceSession: {
        create: async (bytes, o) => {
          seen.push(o ?? {});
          expect(new TextDecoder().decode(bytes)).toBe("graph");
          if (o?.graphOptimizationLevel === "basic") throw new Error("transformer_memcpy is not implemented");
          return session;
        },
      },
    };
    const prov = ortProvider({ runtime: async () => ort, store, wasmPaths: "https://cdn.test/" });
    const hub = createHub({ registry: createRegistry([rec]), env: env() });
    hub.provide("ort", prov.factory);
    const l = await hub.use<{ sessions: Record<string, OrtSession> }>("stems");
    expect(Object.keys(l.value.sessions)).toEqual(["model"]);
    expect(l.failures[0]!.kind).toBe("unsupported-op");
    expect(seen.map((o) => o.graphOptimizationLevel)).toEqual(["basic", "all"]);
    expect((seen[1]!.externalData as { path: string }[])[0]!.path).toBe("model.onnx_data");
    expect(h.calls.length).toBe(2);
    expect(ort.env!.wasm).toEqual({ numThreads: 1, proxy: false, wasmPaths: "https://cdn.test/" });
  });

  it("names graph files from a url, a file or a file list", () => {
    expect(graphFiles({ ...rec, source: { url: "https://h.test/yolov8n.onnx" } })[0]).toMatchObject({ name: "yolov8n", external: false });
    expect(graphFiles({ ...rec, source: { url: "https://h.test/m/", file: "a.onnx" } })[0]!.ref.url).toBe("https://h.test/m/a.onnx");
    expect(() => graphFiles({ ...rec, source: {} })).toThrow(/needs source/);
    expect(sessionOptions({ device: "wasm" }, [])).toEqual({ executionProviders: ["wasm"] });
  });
});

describe("runtime loader", () => {
  it("memoizes and retries after a failure", async () => {
    let n = 0;
    const load = runtimeLoader<{ v: number }>(["https://a.test/m.js"], {
      importer: async () => {
        n++;
        if (n === 1) throw new Error("boom");
        return { v: n };
      },
      protocol: "https:",
    });
    await expect(load()).rejects.toThrow();
    const a = await load();
    const b = await load();
    expect(a).toBe(b);
  });
});

describe("ort provider cleanup", () => {
  it("releases sessions built before a later graph fails, and frees bytes when the ladder is exhausted", async () => {
    let created = 0;
    let released = 0;
    const ort = {
      InferenceSession: {
        create: async () => {
          created++;
          if (created % 2 === 0) throw new Error("unsupported op foo");
          return { inputNames: [], outputNames: [], run: async () => ({}), release: async () => void released++ };
        },
      },
      Tensor: class {},
    };
    let fetches = 0;
    const fetch2 = (async () => {
      fetches++;
      return new Response(new Uint8Array([1, 2, 3]));
    }) as unknown as typeof fetch;
    const store = await openWeightStore({ backends: ["memory"], fetch: fetch2, onNotice: () => {} });
    const freed: string[] = [];
    const rel = store.release.bind(store);
    store.release = (k) => {
      freed.push(k);
      rel(k);
    };
    const p = ortProvider({ runtime: async () => ort as never, store });
    const rec: ModelRecord = {
      id: "two",
      provides: ["x"],
      provider: "ort",
      source: { url: "https://h.test/", files: [{ path: "a.onnx" }, { path: "b.onnx" }] },
      sizeMB: 1,
      sizeSource: "inferred",
      ladder: [{ device: "wasm" }, { device: "wasm" }],
      licence: "MIT",
      commercial: true,
    };
    const hub = createHub({ registry: createRegistry([rec]) });
    hub.provide("ort", p.factory);
    await expect(hub.use({ id: "two" })).rejects.toThrow();
    expect(created).toBe(4);
    expect(released).toBe(2);
    // the once() bytes are freed after the last rung fails
    expect(freed).toEqual(["https://h.test/a.onnx", "https://h.test/b.onnx"]);
    expect(fetches).toBe(2);
  });
});

/**
 * wllama (llama.cpp in wasm, GGUF) engine. Pinned to @wllama/wllama 4.0.0,
 * whose published types keep the 3.8.1 calls this file uses
 * (`createChatCompletion({ stream: true })`, `loadModel(blobs, params)`,
 * `getLoadedContextInfo()`, `isSupportWebGPU()`); 3.8.1 is the version the
 * earlier builds ran and stays the fallback. The module is passed
 * in, so the runtime is an optional peer. On file:// import it through
 * `@hackbuild/ai-env` importEsm, which swaps its module worker for a
 * classic one. GGUF weights keep each model's licence; pass it with the
 * reference.
 */

import { createEngine, type EngineOptions } from "./engine.js";
import { ChatError, type ChatEngine, type Driver, type DriverEvent, type DriverRequest, type Finish } from "./types.js";

/** The @wllama/wllama version this file is pinned to. */
export const WLLAMA_VERSION = "4.0.0";
/** The older @wllama/wllama version that stays the fallback. */
export const WLLAMA_FALLBACK_VERSION = "3.8.1";

/** jsdelivr URLs of the ESM entry and the wasm for a wllama version. */
export function wllamaUrls(version: string = WLLAMA_VERSION): { esm: string; wasm: string } {
  const base = `https://cdn.jsdelivr.net/npm/@wllama/wllama@${version}/esm/`;
  return { esm: `${base}index.js`, wasm: `${base}wasm/wllama.wasm` };
}

/** The parts of a Wllama instance this driver uses. */
export interface WllamaLike {
  createChatCompletion(opts: Record<string, unknown>): Promise<AsyncIterable<{ choices: { delta?: { content?: string | null }; finish_reason?: string | null }[] }>>;
  loadModel(blobs: Blob[], params?: Record<string, unknown>): Promise<void>;
  getLoadedContextInfo(): unknown;
  isSupportWebGPU?(): boolean;
  exit?(): Promise<void>;
}

/** The parts of the @wllama/wllama module the loader uses. */
export interface WllamaModule {
  Wllama: new (paths: { default: string }, cfg?: Record<string, unknown>) => WllamaLike;
}

const FINISH: Record<string, Finish> = { stop: "stop", length: "length", content_filter: "refusal", tool_calls: "tool" };

/** Options for `wllamaDriver`: a loaded Wllama, an id and whether to keep the KV prefix between calls. */
export interface WllamaDriverOptions {
  wllama: WllamaLike;
  id?: string;
  /** Keep the KV prefix between calls (as earlier builds did). Default true. */
  cachePrompt?: boolean;
}

/** A driver over a loaded Wllama that streams chat completions and prewarms its prefix cache. */
export function wllamaDriver(o: WllamaDriverOptions): Driver {
  const d: Driver = {
    id: `wllama:${o.id ?? "model"}`,
    provider: "wllama",
    caps: { schema: true, tools: false, systemRole: true, stop: true },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      const opts: Record<string, unknown> = {
        messages: req.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })),
        stream: true,
        max_tokens: req.maxTokens,
        cache_prompt: o.cachePrompt ?? true,
        // an earlier chat build defaults
        top_p: req.topP ?? 0.95,
        top_k: req.topK ?? 40,
        min_p: req.minP ?? 0.05,
        penalty_repeat: req.repetitionPenalty ?? 1.08,
      };
      if (req.temperature !== undefined) opts.temperature = req.temperature;
      if (req.stop?.length) opts.stop = req.stop;
      if (req.schema) opts.response_format = { type: "json_schema", json_schema: { name: "reply", schema: req.schema } };
      if (req.signal) opts.abortSignal = req.signal;
      let finish: Finish = "stop";
      try {
        const it = await o.wllama.createChatCompletion(opts);
        for await (const ch of it) {
          const c = ch.choices[0];
          if (!c) continue;
          if (c.delta?.content) yield { type: "text", text: c.delta.content };
          if (c.finish_reason) finish = FINISH[c.finish_reason] ?? "stop";
        }
      } catch (e) {
        if (req.signal?.aborted || (e instanceof Error && /abort/i.test(e.name + e.message))) {
          yield { type: "done", finish: "abort" };
          return;
        }
        throw e;
      }
      yield { type: "done", finish };
    },
    async dispose() {
      await o.wllama.exit?.();
    },
  };
  // with the prompt cache on, a zero token completion leaves the prompt in the KV prefix
  if ((o.cachePrompt ?? true) === true) {
    d.prewarm = async (req) => {
      const opts: Record<string, unknown> = {
        messages: req.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })),
        stream: true,
        max_tokens: 0,
        cache_prompt: true,
      };
      if (req.signal) opts.abortSignal = req.signal;
      const it = await o.wllama.createChatCompletion(opts);
      for await (const _ of it) {
        /* drain: no output is wanted */
      }
    };
  }
  return d;
}

/** Options for `loadWllama`: the module, wasm URL, GGUF blobs, context size, GPU layers and the reasoning switch. */
export interface LoadWllamaOptions extends EngineOptions {
  module: WllamaModule;
  /** wasm URL; default the jsdelivr URL for WLLAMA_VERSION. */
  wasmUrl?: string;
  /** GGUF file(s) as Blobs, e.g. from `@hackbuild/weights` store.get(). Split GGUF files go in order. */
  blobs: Blob[];
  id?: string;
  /** Context size. Default 6144 (as earlier builds did). */
  nCtx?: number;
  /** Default: all layers on webgpu when wllama reports support, else 0. */
  nGpuLayers?: number;
  /** Turn template reasoning off. Default true (reasoning: false, as the builds ran). */
  reasoningOff?: boolean;
}

/**
 * Construct wllama, load the GGUF blobs, and confirm the load with
 * getLoadedContextInfo(): wllama can resolve loadModel and still have no
 * model, so a load only counts when that call returns. The last native
 * error line is kept and named in the failure.
 */
export async function loadWllama(o: LoadWllamaOptions): Promise<ChatEngine & { wllama: WllamaLike }> {
  let lastError = "";
  const logger = {
    debug: () => {},
    log: () => {},
    info: () => {},
    warn: () => {},
    error: (...a: unknown[]) => {
      lastError = a.map(String).join(" ");
    },
  };
  const wl = new o.module.Wllama({ default: o.wasmUrl ?? wllamaUrls().wasm }, { allowOffline: true, logger });
  const gpu = wl.isSupportWebGPU?.() === true;
  const params: Record<string, unknown> = { n_ctx: o.nCtx ?? 6144, n_gpu_layers: o.nGpuLayers ?? (gpu ? 999 : 0) };
  if (o.reasoningOff !== false) params.reasoning = false;
  try {
    await wl.loadModel(o.blobs, params);
    wl.getLoadedContextInfo();
  } catch (e) {
    await wl.exit?.().catch(() => undefined);
    const why = lastError || (e instanceof Error ? e.message : String(e));
    throw new ChatError("load", `the model did not load: ${why}`);
  }
  const d: WllamaDriverOptions = { wllama: wl };
  if (o.id) d.id = o.id;
  return Object.assign(createEngine(wllamaDriver(d), o), { wllama: wl });
}

/**
 * WebLLM (MLC) engine. WebGPU only. The caller passes the imported module
 * or an engine it built; this file imports nothing from WebLLM, so the
 * runtime stays an optional peer. Pinned against @mlc-ai/web-llm 0.2.84
 * (the version three builds ran; an earlier chat build warned that a newer
 * release broke it, so recheck 0.2.89 before moving the pin). Model weights
 * come from the MLC catalog and keep each model's own licence; name it in
 * the model record.
 */

import { createEngine, type EngineOptions } from "./engine.js";
import { ChatError, type ChatEngine, type Driver, type DriverEvent, type DriverRequest, type Finish, type ToolCall } from "./types.js";

/** The @mlc-ai/web-llm version this file is pinned to. */
export const WEBLLM_VERSION = "0.2.84";

/** The parts of an MLCEngine this driver uses. */
export interface MLCEngineLike {
  chat: {
    completions: {
      create(req: Record<string, unknown>): Promise<AsyncIterable<{
        choices: { delta?: { content?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      }>>;
    };
  };
  interruptGenerate?(): void;
  unload?(): Promise<void>;
}

/** The parts of the @mlc-ai/web-llm module the loader uses. */
export interface WebLLMModule {
  CreateMLCEngine(model: string, cfg?: Record<string, unknown>, chatOpts?: Record<string, unknown>): Promise<MLCEngineLike>;
  prebuiltAppConfig?: { model_list: unknown[] };
}

const FINISH: Record<string, Finish> = { stop: "stop", length: "length", tool_calls: "tool", abort: "abort" };

/** Options for `webllmDriver`: a built MLCEngine, its model id and whether to send native tools. */
export interface WebLLMDriverOptions {
  engine: MLCEngineLike;
  modelId: string;
  /** Native tools: only the Hermes 2 Pro and Hermes 3 builds (as earlier builds did). tool_choice "required" is not sent. */
  nativeTools?: boolean;
}

/** A driver over a WebLLM MLCEngine that streams chat completions and names a runtime and model library mismatch. */
export function webllmDriver(o: WebLLMDriverOptions): Driver {
  return {
    id: `webllm:${o.modelId}`,
    provider: "webllm",
    caps: { schema: true, tools: o.nativeTools === true, systemRole: true, stop: true },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      const body: Record<string, unknown> = {
        messages: req.messages.map((m) => ({ role: m.role, content: m.content })),
        stream: true,
        stream_options: { include_usage: true },
        max_tokens: req.maxTokens,
      };
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.topP !== undefined) body.top_p = req.topP;
      if (req.repetitionPenalty !== undefined) body.repetition_penalty = req.repetitionPenalty;
      if (req.stop?.length) body.stop = req.stop;
      // never json_object without a schema: XGrammar gets the schema as a string
      if (req.schema) body.response_format = { type: "json_object", schema: JSON.stringify(req.schema) };
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.parameters } }));
        body.tool_choice = "auto";
      }
      const onAbort = () => o.engine.interruptGenerate?.();
      req.signal?.addEventListener("abort", onAbort);
      try {
        const chunks = await o.engine.chat.completions.create(body);
        const tools = new Map<number, ToolCall>();
        let finish: Finish = "stop";
        let usage: { input?: number; output?: number } | undefined;
        for await (const ch of chunks) {
          if (ch.usage) usage = { input: ch.usage.prompt_tokens ?? 0, output: ch.usage.completion_tokens ?? 0 };
          const c = ch.choices[0];
          if (!c) continue;
          if (c.delta?.content) yield { type: "text", text: c.delta.content };
          for (const tc of c.delta?.tool_calls ?? []) {
            const t = tools.get(tc.index) ?? { name: "", arguments: "" };
            if (tc.id) t.id = tc.id;
            if (tc.function?.name) t.name += tc.function.name;
            if (tc.function?.arguments) t.arguments += tc.function.arguments;
            tools.set(tc.index, t);
          }
          if (c.finish_reason) finish = FINISH[c.finish_reason] ?? "stop";
        }
        if (tools.size) yield { type: "tool", calls: [...tools.values()] };
        yield usage ? { type: "done", finish, usage } : { type: "done", finish };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/LinkError|TVMFFI|instantiate/.test(msg)) throw new ChatError("runtime", `webllm runtime and model library do not match (${msg}). pin @mlc-ai/web-llm to the version the model was built for.`);
        throw e;
      } finally {
        req.signal?.removeEventListener("abort", onAbort);
      }
    },
    async dispose() {
      await o.engine.unload?.();
    },
  };
}

/** Options for `loadWebLLM`: the module, model id, wanted context window, custom catalog entries, a progress callback and native tools. */
export interface LoadWebLLMOptions extends EngineOptions {
  module: WebLLMModule;
  modelId: string;
  /** Wanted context window; the loader walks [want, 8192, 4096, 2048] filtered to at most want (as earlier builds did). */
  contextWindow?: number;
  /** Custom catalog entries ({ model, model_id, model_lib }) added before the prebuilt list. */
  customModels?: unknown[];
  onProgress?: (p: { progress: number; text: string }) => void;
  nativeTools?: boolean;
}

/** Create an MLCEngine with the context ladder, IndexedDB cache on, and wrap it. */
export async function loadWebLLM(o: LoadWebLLMOptions): Promise<ChatEngine & { contextWindow: number }> {
  const want = o.contextWindow ?? 4096;
  const ladder = [...new Set([want, 8192, 4096, 2048])].filter((n) => n <= want);
  const appConfig = { useIndexedDBCache: true, model_list: [...(o.customModels ?? []), ...(o.module.prebuiltAppConfig?.model_list ?? [])] };
  const errors: string[] = [];
  for (const ctx of ladder) {
    try {
      const cfg: Record<string, unknown> = { appConfig };
      if (o.onProgress) cfg.initProgressCallback = o.onProgress;
      const engine = await o.module.CreateMLCEngine(o.modelId, cfg, { context_window_size: ctx });
      const d: WebLLMDriverOptions = { engine, modelId: o.modelId };
      if (o.nativeTools !== undefined) d.nativeTools = o.nativeTools;
      return Object.assign(createEngine(webllmDriver(d), o), { contextWindow: ctx });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`${ctx}: ${msg}`);
      if (/LinkError|TVMFFI|instantiate/.test(msg)) break;
    }
  }
  throw new ChatError("load", `webllm could not load ${o.modelId}: ${errors.join("; ")}`);
}

/** A load step read from WebLLM's progress text, for a row with phase words. */
export interface WebLLMPhase {
  phase: "fetch" | "compile" | "ready";
  /** 0 to 1 from the runtime's own figure. */
  fraction: number;
  /** "3 of 24" when the text names a file count. */
  file?: string;
}

/**
 * Map WebLLM 0.2.84 progress text to a phase: "Fetching param cache" and
 * "Loading model from cache" are fetch, "Loading GPU shader modules" is
 * compile, "Finish loading" is ready. Unknown text keeps the last phase a
 * caller saw; this returns fetch for it.
 */
export function webllmPhase(p: { progress: number; text: string }): WebLLMPhase {
  const t = p.text;
  const phase = /finish loading/i.test(t) ? "ready" : /shader|compil/i.test(t) ? "compile" : "fetch";
  const m = /\[(\d+)\/(\d+)\]/.exec(t);
  const out: WebLLMPhase = { phase, fraction: phase === "ready" ? 1 : Math.max(0, Math.min(1, p.progress)) };
  if (m) out.file = `${m[1]} of ${m[2]}`;
  return out;
}

/** One model's share of WebLLM's own IndexedDB cache. */
export interface WebLLMCacheEntry {
  modelId: string;
  /** Bytes of weights, tokenizer, config and wasm stored for the model (measured by reading the entries). */
  bytes: number;
  files: number;
}

/** The fields of a WebLLM model_list entry the cache adapter reads. */
export interface WebLLMModelEntry {
  model: string;
  model_id: string;
  model_lib?: string;
}

/** Lists, measures and evicts the models in WebLLM's own IndexedDB cache. */
export interface WebLLMCache {
  /** Models with at least one stored entry, largest first. */
  list(): Promise<WebLLMCacheEntry[]>;
  has(modelId: string): Promise<boolean>;
  /** Remove a model's weights, tokenizer, config and wasm. A wasm another stored model shares stays. */
  evict(modelId: string): Promise<void>;
  /** Bytes of every entry in the three databases, model or not. */
  bytes(): Promise<number>;
}

/** WebLLM 0.2.84's IndexedDB databases, each with one store "urls" keyed by "url". */
export const WEBLLM_DBS = ["webllm/model", "webllm/config", "webllm/wasm"] as const;

/** WebLLM adds "resolve/main/" to a Hugging Face model URL that lacks it; entries are keyed under that base. */
function modelBase(url: string): string {
  let u = url.endsWith("/") ? url : `${url}/`;
  if (!/\/resolve\//.test(u)) u = `${u}resolve/main/`;
  return u;
}

const sizeOf = (data: unknown): number =>
  data instanceof ArrayBuffer ? data.byteLength : ArrayBuffer.isView(data) ? data.byteLength : data instanceof Blob ? data.size : data == null ? 0 : JSON.stringify(data).length;

/** Open an existing WebLLM database; null when it does not exist (the open creates nothing). */
function openExisting(idb: IDBFactory, name: string): Promise<IDBDatabase | null> {
  return new Promise((res) => {
    const r = idb.open(name);
    r.onupgradeneeded = () => r.transaction?.abort();
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("urls")) {
        db.close();
        res(null);
      } else res(db);
    };
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
  });
}

/**
 * List and evict the WebLLM cache per model, so the weights manager shows
 * it as a second group ("kept by webllm") beside the one weight store.
 * Reads the IndexedDB layout WebLLM 0.2.84 writes with
 * `useIndexedDBCache: true`; nothing is imported from WebLLM. Pass the
 * same model_list the engine was built with (prebuilt plus custom).
 */
export function webllmCache(o: { modelList: readonly WebLLMModelEntry[]; indexedDB?: IDBFactory }): WebLLMCache {
  const idb = o.indexedDB ?? (globalThis as { indexedDB?: IDBFactory }).indexedDB;
  const entryOf = (id: string) => o.modelList.find((m) => m.model_id === id);
  /** Every stored url with its size, per database. */
  async function scan(): Promise<{ db: string; url: string; bytes: number }[]> {
    if (!idb) return [];
    const out: { db: string; url: string; bytes: number }[] = [];
    for (const name of WEBLLM_DBS) {
      const db = await openExisting(idb, name);
      if (!db) continue;
      try {
        // one entry at a time: a shard can be tens of MB, so the store is never read whole
        await new Promise<void>((res, rej) => {
          const c = db.transaction(["urls"], "readonly").objectStore("urls").openCursor();
          c.onsuccess = () => {
            const cur = c.result;
            if (!cur) return res();
            const v = cur.value as { url: string; data: unknown };
            out.push({ db: name, url: v.url, bytes: sizeOf(v.data) });
            cur.continue();
          };
          c.onerror = () => rej(c.error);
        });
      } finally {
        db.close();
      }
    }
    return out;
  }
  const owns = (m: WebLLMModelEntry, e: { db: string; url: string }) => (e.db === "webllm/wasm" ? e.url === m.model_lib : e.url.startsWith(modelBase(m.model)));
  const cache: WebLLMCache = {
    async list() {
      const all = await scan();
      const out: WebLLMCacheEntry[] = [];
      for (const m of o.modelList) {
        const mine = all.filter((e) => e.db !== "webllm/wasm" && owns(m, e));
        if (!mine.length) continue;
        const wasm = all.filter((e) => e.db === "webllm/wasm" && owns(m, e));
        const files = [...mine, ...wasm];
        out.push({ modelId: m.model_id, bytes: files.reduce((a, e) => a + e.bytes, 0), files: files.length });
      }
      return out.sort((a, b) => b.bytes - a.bytes);
    },
    async has(modelId) {
      const m = entryOf(modelId);
      if (!m) return false;
      return (await scan()).some((e) => e.db === "webllm/model" && owns(m, e));
    },
    async evict(modelId) {
      const m = entryOf(modelId);
      if (!m || !idb) return;
      const all = await scan();
      // a wasm library shared with another stored model stays
      const others = o.modelList.filter((x) => x.model_id !== modelId && x.model_lib === m.model_lib && all.some((e) => e.db === "webllm/model" && owns(x, e)));
      for (const name of WEBLLM_DBS) {
        const urls = all.filter((e) => e.db === name && owns(m, e) && !(name === "webllm/wasm" && others.length)).map((e) => e.url);
        if (!urls.length) continue;
        const db = await openExisting(idb, name);
        if (!db) continue;
        try {
          const tx = db.transaction(["urls"], "readwrite");
          for (const u of urls) tx.objectStore("urls").delete(u);
          await new Promise<void>((res, rej) => {
            tx.oncomplete = () => res();
            tx.onerror = () => rej(tx.error);
          });
        } finally {
          db.close();
        }
      }
    },
    async bytes() {
      return (await scan()).reduce((a, e) => a + e.bytes, 0);
    },
  };
  return cache;
}

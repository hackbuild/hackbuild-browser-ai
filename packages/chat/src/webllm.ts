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

export interface WebLLMDriverOptions {
  engine: MLCEngineLike;
  modelId: string;
  /** Native tools: only the Hermes 2 Pro and Hermes 3 builds (as earlier builds did). tool_choice "required" is not sent. */
  nativeTools?: boolean;
}

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

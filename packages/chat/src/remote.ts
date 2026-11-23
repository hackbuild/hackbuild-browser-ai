/**
 * Remote engines: any OpenAI compatible chat completions endpoint (Ollama,
 * llama.cpp server, LM Studio, vLLM, a hosted API) and the Anthropic
 * Messages API. Both stream over server sent events through fetch, with no
 * SDK. A key typed into a page stays in that page; this module never logs
 * it. Weight licences for remote models are the provider's terms; pass
 * `licence` so the app can show it.
 */

import { createEngine, type EngineOptions } from "./engine.js";
import { ChatError, type ChatEngine, type ChatMessage, type Driver, type DriverEvent, type DriverRequest, type Finish, type ToolCall } from "./types.js";
import { sse } from "./util.js";

export interface RemoteOptions extends EngineOptions {
  model: string;
  apiKey?: string;
  fetch?: typeof fetch;
  headers?: Record<string, string>;
  /** Licence or terms of the remote model, shown by apps. */
  licence?: string;
}

async function post(f: typeof fetch, url: string, headers: Record<string, string>, body: unknown, signal?: AbortSignal): Promise<Response> {
  const init: RequestInit = { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) };
  if (signal) init.signal = signal;
  let res: Response;
  try {
    res = await f(url, init);
  } catch (e) {
    if (signal?.aborted) throw new ChatError("abort", "request aborted");
    throw new ChatError("http", `could not reach ${new URL(url).host}: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!res.ok) {
    let detail = "";
    try {
      detail = (await res.text()).slice(0, 300);
    } catch {
      /* no body */
    }
    throw new ChatError("http", `http ${res.status} from ${new URL(url).host}: ${detail}`, res.status);
  }
  if (!res.body) throw new ChatError("http", "response has no body to stream");
  return res;
}

const OAI_FINISH: Record<string, Finish> = { stop: "stop", length: "length", tool_calls: "tool", content_filter: "refusal", function_call: "tool" };

export interface OpenAIOptions extends RemoteOptions {
  /** Base URL up to and including /v1, e.g. http://localhost:11434/v1 (Ollama). */
  base: string;
  /** "json_schema" (default) or "json_object" for servers that only take the older form. */
  schemaMode?: "json_schema" | "json_object";
}

export function openaiDriver(o: OpenAIOptions): Driver {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const url = o.base.replace(/\/+$/, "") + "/chat/completions";
  return {
    id: `openai:${o.model}`,
    provider: "remote",
    caps: { schema: true, tools: true, systemRole: true, stop: true },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      const body: Record<string, unknown> = {
        model: o.model,
        stream: true,
        max_tokens: req.maxTokens,
        messages: req.messages.map((m) => (m.role === "tool" ? { role: "tool", content: m.content, name: m.name } : { role: m.role, content: m.content })),
      };
      if (req.temperature !== undefined) body.temperature = req.temperature;
      if (req.topP !== undefined) body.top_p = req.topP;
      if (req.stop?.length) body.stop = req.stop;
      if (req.repetitionPenalty !== undefined) body.repeat_penalty = req.repetitionPenalty;
      if (req.schema) {
        body.response_format =
          o.schemaMode === "json_object" ? { type: "json_object" } : { type: "json_schema", json_schema: { name: "reply", schema: req.schema, strict: false } };
      }
      if (req.tools?.length) {
        body.tools = req.tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.parameters } }));
        body.tool_choice = "auto";
      }
      const headers: Record<string, string> = { ...o.headers };
      if (o.apiKey) headers.authorization = `Bearer ${o.apiKey}`;
      const res = await post(f, url, headers, body, req.signal);
      const tools = new Map<number, ToolCall>();
      let finish: Finish = "stop";
      let usage: { input?: number; output?: number } | undefined;
      for await (const m of sse(res.body!, req.signal)) {
        if (m.data === "[DONE]") break;
        let j: {
          choices?: { delta?: { content?: string | null; reasoning_content?: string | null; reasoning?: string | null; tool_calls?: { index: number; id?: string; function?: { name?: string; arguments?: string } }[] }; finish_reason?: string | null }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
          error?: { message?: string };
        };
        try {
          j = JSON.parse(m.data);
        } catch {
          continue;
        }
        if (j.error) throw new ChatError("runtime", j.error.message ?? "stream error");
        if (j.usage) usage = { input: j.usage.prompt_tokens ?? 0, output: j.usage.completion_tokens ?? 0 };
        const c = j.choices?.[0];
        if (!c) continue;
        const d = c.delta ?? {};
        const r = d.reasoning_content ?? d.reasoning;
        if (r) yield { type: "think", text: r };
        if (d.content) yield { type: "text", text: d.content };
        for (const tc of d.tool_calls ?? []) {
          const t = tools.get(tc.index) ?? { name: "", arguments: "" };
          if (tc.id) t.id = tc.id;
          if (tc.function?.name) t.name += tc.function.name;
          if (tc.function?.arguments) t.arguments += tc.function.arguments;
          tools.set(tc.index, t);
        }
        if (c.finish_reason) finish = OAI_FINISH[c.finish_reason] ?? "stop";
      }
      if (tools.size) yield { type: "tool", calls: [...tools.values()] };
      yield usage ? { type: "done", finish, usage } : { type: "done", finish };
    },
  };
}

/** An engine over an OpenAI compatible endpoint. */
export function openaiCompatible(o: OpenAIOptions): ChatEngine {
  return createEngine(openaiDriver(o), o);
}

export interface AnthropicOptions extends RemoteOptions {
  /** Default https://api.anthropic.com */
  base?: string;
  /** anthropic-version header. Default 2023-06-01. */
  version?: string;
  /** Send the header that lets a browser page call the API directly. Default true. */
  browser?: boolean;
}

const ANTHROPIC_FINISH: Record<string, Finish> = { end_turn: "stop", stop_sequence: "stop", max_tokens: "length", tool_use: "tool", refusal: "refusal", pause_turn: "stop" };

/**
 * Anthropic Messages API driver. System turns go in `system`; a schema goes
 * in `output_config.format` as a json_schema. Sampling options are not sent,
 * since current models refuse temperature, top_p and top_k.
 */
export function anthropicDriver(o: AnthropicOptions): Driver {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const url = (o.base ?? "https://api.anthropic.com").replace(/\/+$/, "") + "/v1/messages";
  return {
    id: `anthropic:${o.model}`,
    provider: "remote",
    caps: { schema: true, tools: true, systemRole: true, stop: true },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      const system = req.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
      const msgs: { role: "user" | "assistant"; content: string }[] = [];
      for (const m of req.messages) {
        if (m.role === "system") continue;
        const role = m.role === "assistant" ? "assistant" : "user";
        const content = m.role === "tool" ? `[${m.name ?? "tool"} result]\n${m.content}` : m.content;
        const last = msgs[msgs.length - 1];
        if (last && last.role === role) last.content += `\n\n${content}`;
        else msgs.push({ role, content });
      }
      while (msgs.length && msgs[0]!.role === "assistant") msgs.shift();
      const body: Record<string, unknown> = { model: o.model, max_tokens: req.maxTokens, stream: true, messages: msgs };
      if (system) body.system = system;
      if (req.stop?.length) body.stop_sequences = req.stop;
      if (req.schema) body.output_config = { format: { type: "json_schema", schema: req.schema } };
      if (req.tools?.length) body.tools = req.tools.map((t) => ({ name: t.name, description: t.description ?? "", input_schema: t.parameters }));
      const headers: Record<string, string> = { "anthropic-version": o.version ?? "2023-06-01", ...o.headers };
      if (o.apiKey) headers["x-api-key"] = o.apiKey;
      if (o.browser !== false) headers["anthropic-dangerous-direct-browser-access"] = "true";
      const res = await post(f, url, headers, body, req.signal);
      let finish: Finish = "stop";
      const usage: { input?: number; output?: number } = {};
      const blocks = new Map<number, { type: string; name?: string; id?: string; json: string }>();
      for await (const m of sse(res.body!, req.signal)) {
        let j: {
          type?: string;
          index?: number;
          delta?: { type?: string; text?: string; thinking?: string; partial_json?: string; stop_reason?: string };
          content_block?: { type: string; name?: string; id?: string };
          message?: { usage?: { input_tokens?: number } };
          usage?: { output_tokens?: number };
          error?: { message?: string };
        };
        try {
          j = JSON.parse(m.data);
        } catch {
          continue;
        }
        switch (j.type) {
          case "message_start":
            if (j.message?.usage?.input_tokens !== undefined) usage.input = j.message.usage.input_tokens;
            break;
          case "content_block_start":
            if (j.content_block) {
              const b: { type: string; name?: string; id?: string; json: string } = { type: j.content_block.type, json: "" };
              if (j.content_block.name) b.name = j.content_block.name;
              if (j.content_block.id) b.id = j.content_block.id;
              blocks.set(j.index ?? 0, b);
            }
            break;
          case "content_block_delta": {
            const d = j.delta ?? {};
            if (d.type === "text_delta" && d.text) yield { type: "text", text: d.text };
            else if (d.type === "thinking_delta" && d.thinking) yield { type: "think", text: d.thinking };
            else if (d.type === "input_json_delta" && d.partial_json) {
              const b = blocks.get(j.index ?? 0);
              if (b) b.json += d.partial_json;
            }
            break;
          }
          case "message_delta":
            if (j.delta?.stop_reason) finish = ANTHROPIC_FINISH[j.delta.stop_reason] ?? "stop";
            if (j.usage?.output_tokens !== undefined) usage.output = j.usage.output_tokens;
            break;
          case "error":
            throw new ChatError("runtime", j.error?.message ?? "stream error");
        }
      }
      const calls: ToolCall[] = [...blocks.values()]
        .filter((b) => b.type === "tool_use")
        .map((b) => {
          const c: ToolCall = { name: b.name ?? "", arguments: b.json || "{}" };
          if (b.id) c.id = b.id;
          return c;
        });
      if (calls.length) yield { type: "tool", calls };
      yield { type: "done", finish, usage };
    },
  };
}

/** An engine over the Anthropic Messages API. `model` is required; there is no default. */
export function anthropicMessages(o: AnthropicOptions): ChatEngine {
  return createEngine(anthropicDriver(o), o);
}

export type { ChatMessage };

import { describe, expect, it } from "vitest";
import { ChatError } from "@hackbuild/chat";
import { anthropicMessages, openaiCompatible } from "@hackbuild/chat/remote";
import { loadWebLLM, webllmDriver, type MLCEngineLike } from "@hackbuild/chat/webllm";
import { loadWllama, wllamaUrls, WLLAMA_VERSION, type WllamaLike } from "@hackbuild/chat/wllama";
import { loadTransformers } from "@hackbuild/chat/transformers";
import { promptApi, type LanguageModelStatic } from "@hackbuild/chat/prompt-api";
import { createEngine } from "@hackbuild/chat";

function sseBody(events: (string | Record<string, unknown>)[], named = false): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  const text = events
    .map((e) => {
      if (typeof e === "string") return `data: ${e}\n\n`;
      return named ? `event: ${String(e.type)}\ndata: ${JSON.stringify(e)}\n\n` : `data: ${JSON.stringify(e)}\n\n`;
    })
    .join("");
  // split in odd places to exercise the line buffer
  const parts = text.match(/[\s\S]{1,7}/g) ?? [];
  return new ReadableStream({
    start(c) {
      for (const p of parts) c.enqueue(enc.encode(p));
      c.close();
    },
  });
}

type Seen = { url: string; headers: Record<string, string>; body: Record<string, unknown> };
function fakeFetch(respond: (seen: Seen, n: number) => Response) {
  const seen: Seen[] = [];
  const f = async (url: string, init: RequestInit) => {
    const s: Seen = { url, headers: Object.fromEntries(new Headers(init.headers).entries()), body: JSON.parse(String(init.body)) };
    seen.push(s);
    return respond(s, seen.length);
  };
  return { fetch: f as unknown as typeof fetch, seen };
}

describe("openai compatible", () => {
  it("streams content, reasoning, tool calls and usage", async () => {
    const { fetch, seen } = fakeFetch(() =>
      new Response(
        sseBody([
          { choices: [{ delta: { reasoning_content: "hmm" } }] },
          { choices: [{ delta: { content: "Hel" } }] },
          { choices: [{ delta: { content: "lo" } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, id: "c1", function: { name: "look", arguments: '{"at"' } }] } }] },
          { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: ':"mug"}' } }] }, finish_reason: "tool_calls" }] },
          { choices: [], usage: { prompt_tokens: 9, completion_tokens: 4 } },
          "[DONE]",
        ]),
      ),
    );
    const chat = openaiCompatible({ base: "http://localhost:11434/v1/", model: "gemma4:e4b", apiKey: "sk-test-1234567890", fetch });
    const r = await chat.complete([{ role: "user", content: "hi" }], { tools: [{ name: "look", parameters: { type: "object" } }] });
    expect(r).toMatchObject({ text: "Hello", think: "hmm", finish: "tool", usage: { input: 9, output: 4 } });
    expect(r.toolCalls).toEqual([{ id: "c1", name: "look", arguments: '{"at":"mug"}' }]);
    expect(seen[0]!.url).toBe("http://localhost:11434/v1/chat/completions");
    expect(seen[0]!.headers.authorization).toBe("Bearer sk-test-1234567890");
    expect(seen[0]!.body).toMatchObject({ model: "gemma4:e4b", stream: true, tool_choice: "auto" });
  });

  it("retries without the schema after a 400", async () => {
    const { fetch, seen } = fakeFetch((s) =>
      s.body.response_format
        ? new Response("response_format not supported", { status: 400 })
        : new Response(sseBody([{ choices: [{ delta: { content: '{"a":1}' }, finish_reason: "stop" }] }, "[DONE]"])),
    );
    const chat = openaiCompatible({ base: "http://x/v1", model: "m", fetch });
    const r = await chat.complete([{ role: "user", content: "hi" }], { schema: { type: "object" } });
    expect(r.schemaFallback).toBe(true);
    expect(seen[0]!.body.response_format).toEqual({ type: "json_schema", json_schema: { name: "reply", schema: { type: "object" }, strict: false } });
    expect(seen[1]!.body.response_format).toBeUndefined();
  });

  it("does not turn schemas off for a 400 that is not about the schema", async () => {
    let n = 0;
    const { fetch, seen } = fakeFetch(() =>
      n++ === 0
        ? new Response("context length exceeded", { status: 400 })
        : new Response(sseBody([{ choices: [{ delta: { content: '{"a":1}' }, finish_reason: "stop" }] }, "[DONE]"])),
    );
    const chat = openaiCompatible({ base: "http://x/v1", model: "m", fetch });
    await expect(chat.complete([{ role: "user", content: "hi" }], { schema: { type: "object" } })).rejects.toThrow(/context length/);
    const r = await chat.complete([{ role: "user", content: "hi" }], { schema: { type: "object" } });
    expect(r.schemaFallback).toBe(false);
    expect(seen[1]!.body.response_format).toBeDefined();
  });

  it("echoes tool calls with ids and leaves out llama fields unless asked", async () => {
    const ok = () => new Response(sseBody([{ choices: [{ delta: { content: "done" }, finish_reason: "stop" }] }, "[DONE]"]));
    const { fetch, seen } = fakeFetch(ok);
    const msgs = [
      { role: "user" as const, content: "look at the mug" },
      { role: "assistant" as const, content: "", toolCalls: [{ id: "c1", name: "look", arguments: '{"at":"mug"}' }] },
      { role: "tool" as const, name: "look", toolCallId: "c1", content: "a red mug" },
      { role: "tool" as const, name: "look", content: "an orphan result" },
    ];
    await openaiCompatible({ base: "http://x/v1", model: "m", fetch }).complete(msgs, { repetitionPenalty: 1.1, tools: [{ name: "look", parameters: { type: "object" } }] });
    const sent = seen[0]!.body.messages as Record<string, unknown>[];
    expect(sent[1]).toEqual({ role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "look", arguments: '{"at":"mug"}' } }] });
    expect(sent[2]).toEqual({ role: "tool", tool_call_id: "c1", content: "a red mug" });
    expect(sent[3]).toEqual({ role: "user", content: "[look result]\nan orphan result" });
    expect(seen[0]!.body.repeat_penalty).toBeUndefined();
    await openaiCompatible({ base: "http://x/v1", model: "m", fetch, llamaParams: true }).complete(msgs, { repetitionPenalty: 1.1 });
    expect(seen[1]!.body.repeat_penalty).toBe(1.1);
  });

  it("names an unreachable server and a 500", async () => {
    const down = openaiCompatible({ base: "http://down.test/v1", model: "m", fetch: (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch });
    await expect(down.complete([{ role: "user", content: "x" }])).rejects.toThrow(/could not reach down.test/);
    const { fetch } = fakeFetch(() => new Response("boom", { status: 500 }));
    const err = await openaiCompatible({ base: "http://x/v1", model: "m", fetch }).complete([{ role: "user", content: "x" }]).catch((e: unknown) => e);
    expect((err as ChatError).status).toBe(500);
  });
});

describe("anthropic messages", () => {
  it("sends system apart, the schema in output_config, and parses the event stream", async () => {
    const { fetch, seen } = fakeFetch(() =>
      new Response(
        sseBody(
          [
            { type: "message_start", message: { usage: { input_tokens: 12 } } },
            { type: "content_block_start", index: 0, content_block: { type: "thinking" } },
            { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "plan" } },
            { type: "content_block_start", index: 1, content_block: { type: "text" } },
            { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "Hi " } },
            { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: "there" } },
            { type: "message_delta", delta: { stop_reason: "max_tokens" }, usage: { output_tokens: 5 } },
            { type: "message_stop" },
          ],
          true,
        ),
      ),
    );
    const chat = anthropicMessages({ model: "claude-opus-5-5", apiKey: "sk-ant-xyz-0000", fetch });
    const r = await chat.complete(
      [
        { role: "system", content: "be brief" },
        { role: "assistant", content: "dropped" },
        { role: "user", content: "a" },
        { role: "user", content: "b" },
      ],
      { schema: { type: "object" }, maxTokens: 64, temperature: 0.7 },
    );
    expect(r).toMatchObject({ text: "Hi there", think: "plan", finish: "length", usage: { input: 12, output: 5 } });
    const s = seen[0]!;
    expect(s.url).toBe("https://api.anthropic.com/v1/messages");
    expect(s.headers["x-api-key"]).toBe("sk-ant-xyz-0000");
    expect(s.headers["anthropic-version"]).toBe("2023-06-01");
    expect(s.headers["anthropic-dangerous-direct-browser-access"]).toBe("true");
    expect(s.body).toMatchObject({ model: "claude-opus-5-5", max_tokens: 64, system: "be brief", output_config: { format: { type: "json_schema", schema: { type: "object" } } } });
    expect(s.body.messages).toEqual([{ role: "user", content: "a\n\nb" }]);
    expect(s.body.temperature).toBeUndefined();
  });

  it("collects tool use input from json deltas", async () => {
    const { fetch } = fakeFetch(() =>
      new Response(
        sseBody([
          { type: "content_block_start", index: 0, content_block: { type: "tool_use", name: "look", id: "t1" } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '{"at":' } },
          { type: "content_block_delta", index: 0, delta: { type: "input_json_delta", partial_json: '"mug"}' } },
          { type: "message_delta", delta: { stop_reason: "tool_use" } },
        ]),
      ),
    );
    const r = await anthropicMessages({ model: "m", fetch }).complete([{ role: "user", content: "x" }], { tools: [{ name: "look", parameters: { type: "object" } }] });
    expect(r.finish).toBe("tool");
    expect(r.toolCalls).toEqual([{ id: "t1", name: "look", arguments: '{"at":"mug"}' }]);
  });
});

function mlc(opts: { fail?: string } = {}) {
  const reqs: Record<string, unknown>[] = [];
  let interrupted = false;
  const engine: MLCEngineLike = {
    chat: {
      completions: {
        async create(req) {
          reqs.push(req);
          if (opts.fail) throw new Error(opts.fail);
          return (async function* () {
            yield { choices: [{ delta: { content: "ok " } }] };
            yield { choices: [{ delta: { content: "done" }, finish_reason: "stop" }] };
            yield { choices: [], usage: { prompt_tokens: 3, completion_tokens: 2 } };
          })();
        },
      },
    },
    interruptGenerate: () => void (interrupted = true),
  };
  return { engine, reqs, interrupted: () => interrupted };
}

describe("webllm", () => {
  it("sends the schema as a string inside json_object", async () => {
    const m = mlc();
    const chat = createEngine(webllmDriver({ engine: m.engine, modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC" }));
    const r = await chat.complete([{ role: "user", content: "x" }], { schema: { type: "object", properties: {} } });
    expect(r.text).toBe("ok done");
    expect(m.reqs[0]!.response_format).toEqual({ type: "json_object", schema: '{"type":"object","properties":{}}' });
  });

  it("names a runtime and model library mismatch", async () => {
    const chat = createEngine(webllmDriver({ engine: mlc({ fail: "LinkError: WebAssembly.instantiate(): TVMFFI" }).engine, modelId: "m" }));
    await expect(chat.complete([{ role: "user", content: "x" }])).rejects.toThrow(/do not match/);
  });

  it("walks the context ladder down from the wanted size", async () => {
    const tried: number[] = [];
    const m = mlc();
    const chat = await loadWebLLM({
      modelId: "Hermes-3-Llama-3.2-3B-q4f16_1-MLC",
      contextWindow: 16384,
      module: {
        prebuiltAppConfig: { model_list: [] },
        async CreateMLCEngine(_id, _cfg, chatOpts) {
          const ctx = chatOpts!.context_window_size as number;
          tried.push(ctx);
          if (ctx > 4096) throw new Error("out of memory allocating kv cache");
          return m.engine;
        },
      },
    });
    expect(tried).toEqual([16384, 8192, 4096]);
    expect(chat.contextWindow).toBe(4096);
  });
});

describe("wllama", () => {
  it("pins 4.0.0 with 3.8.1 urls on request", () => {
    expect(WLLAMA_VERSION).toBe("4.0.0");
    expect(wllamaUrls("3.8.1").wasm).toBe("https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/wasm/wllama.wasm");
  });

  function fakeWllama(o: { gpu: boolean; loadOk: boolean }) {
    const made: { cfg: Record<string, unknown>; params?: Record<string, unknown>; calls: Record<string, unknown>[] }[] = [];
    class W implements WllamaLike {
      rec: (typeof made)[number];
      constructor(_p: { default: string }, cfg: Record<string, unknown> = {}) {
        this.rec = { cfg, calls: [] };
        made.push(this.rec);
      }
      isSupportWebGPU() {
        return o.gpu;
      }
      async loadModel(_b: Blob[], params: Record<string, unknown>) {
        this.rec.params = params;
        if (!o.loadOk) (this.rec.cfg.logger as { error(s: string): void }).error("llama_model_load: tensor data is not within file bounds");
      }
      getLoadedContextInfo() {
        if (!o.loadOk) throw new Error("model not loaded");
        return { n_ctx: 6144 };
      }
      async createChatCompletion(opts: Record<string, unknown>) {
        this.rec.calls.push(opts);
        return (async function* () {
          yield { choices: [{ delta: { content: "<think>x</think>hey" } }] };
          yield { choices: [{ delta: {}, finish_reason: "length" }] };
        })();
      }
      async exit() {}
    }
    return { module: { Wllama: W }, made };
  }

  it("loads with gpu layers when webgpu works and streams", async () => {
    const f = fakeWllama({ gpu: true, loadOk: true });
    const chat = await loadWllama({ module: f.module, blobs: [new Blob(["gguf"])] });
    expect(f.made[0]!.params).toEqual({ n_ctx: 6144, n_gpu_layers: 999, reasoning: false });
    expect(f.made[0]!.cfg.allowOffline).toBe(true);
    const r = await chat.complete([{ role: "user", content: "x" }], { schema: { type: "object" } });
    expect(r).toMatchObject({ text: "hey", think: "x", finish: "length" });
    expect(f.made[0]!.calls[0]).toMatchObject({ cache_prompt: true, top_p: 0.95, top_k: 40, min_p: 0.05, penalty_repeat: 1.08, response_format: { type: "json_schema" } });
  });

  it("refuses a load that getLoadedContextInfo does not confirm and names the native error", async () => {
    const f = fakeWllama({ gpu: false, loadOk: false });
    await expect(loadWllama({ module: f.module, blobs: [] })).rejects.toThrow("the model did not load: llama_model_load: tensor data is not within file bounds");
    expect(f.made[0]!.params!.n_gpu_layers).toBe(0);
  });
});

describe("transformers.js", () => {
  it("streams through TextStreamer and interrupts the generator at the end", async () => {
    let interrupted = 0;
    const seenOpts: Record<string, unknown>[] = [];
    const module = {
      TextStreamer: class {
        constructor(public tok: unknown, public o: { callback_function?: (t: string) => void }) {}
      },
      InterruptableStoppingCriteria: class {
        interrupt() {
          interrupted++;
        }
      },
      async pipeline() {
        const gen = Object.assign(
          async (_m: unknown, opts: Record<string, unknown>) => {
            seenOpts.push(opts);
            const cb = (opts.streamer as { o: { callback_function: (t: string) => void } }).o.callback_function;
            for (const t of ["Hel", "lo ", "you"]) {
              await Promise.resolve();
              cb(t);
            }
          },
          { tokenizer: {} },
        );
        return gen;
      },
    };
    const chat = await loadTransformers({ module, modelId: "HuggingFaceTB/SmolLM2-360M-Instruct", quirks: { repetitionPenalty: 1.1 } });
    const r = await chat.complete([{ role: "user", content: "x" }], { maxTokens: 20 });
    expect(r.text).toBe("Hello you");
    expect(seenOpts[0]).toMatchObject({ max_new_tokens: 20, repetition_penalty: 1.1, do_sample: false });
    expect(interrupted).toBeGreaterThan(0);
  });
});

describe("prompt api", () => {
  function lm(chunks: string[], state: "available" | "unavailable" = "available") {
    const created: Record<string, unknown>[] = [];
    const prompts: { input: string; opts: Record<string, unknown> }[] = [];
    const L: LanguageModelStatic = {
      availability: async () => state,
      async create(o) {
        created.push(o ?? {});
        return {
          promptStreaming(input: string, opts: Record<string, unknown> = {}) {
            prompts.push({ input, opts });
            return (async function* () {
              yield* chunks;
            })();
          },
          destroy() {},
        };
      },
    };
    return { L, created, prompts };
  }

  it("builds the session from history and passes the schema as responseConstraint", async () => {
    const f = lm(["Hi", " there"]);
    const chat = promptApi({ LanguageModel: f.L });
    const r = await chat.complete(
      [
        { role: "system", content: "s" },
        { role: "user", content: "a" },
        { role: "assistant", content: "b" },
        { role: "user", content: "c" },
      ],
      { schema: { type: "object" } },
    );
    expect(r.text).toBe("Hi there");
    expect(f.prompts[0]!.input).toBe("c");
    expect(f.prompts[0]!.opts.responseConstraint).toEqual({ type: "object" });
    expect(f.created[0]!.initialPrompts).toEqual([
      { role: "system", content: "s" },
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
  });

  it("handles builds that stream the whole text so far", async () => {
    const r = await promptApi({ LanguageModel: lm(["Hi", "Hi there", "Hi there."]).L }).complete([{ role: "user", content: "x" }]);
    expect(r.text).toBe("Hi there.");
  });

  it("says when the model is unavailable", async () => {
    await expect(promptApi({ LanguageModel: lm([], "unavailable").L }).complete([{ role: "user", content: "x" }])).rejects.toThrow(/unavailable on this device/);
  });
});

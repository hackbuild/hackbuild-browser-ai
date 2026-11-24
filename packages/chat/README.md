# @hackbuild/chat

One streaming chat interface over WebLLM, wllama, transformers.js, the
Chrome Prompt API, OpenAI compatible endpoints and the Anthropic Messages
API. Role normalization, think block stripping and a schema to free text
fallback are applied the same way for every runtime. Code MIT; this README
CC-BY-4.0 with the code samples also MIT. No weights ship here; each model
keeps its own licence.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/chat

Each runtime is an optional peer behind its own subpath, and no file
imports a runtime: you pass the module in, so a page that uses only the
remote engine never loads WebLLM.

| subpath | runtime | pin |
|---|---|---|
| `@hackbuild/chat/webllm` | `@mlc-ai/web-llm` | 0.2.84 |
| `@hackbuild/chat/wllama` | `@wllama/wllama` | 4.0.0, fallback 3.8.1 |
| `@hackbuild/chat/transformers` | `@huggingface/transformers` | 4.3.2 |
| `@hackbuild/chat/prompt-api` | Chrome `LanguageModel` | Chrome 148 |
| `@hackbuild/chat/remote` | fetch only | none |

## Use

    import { loadWllama, wllamaUrls } from "@hackbuild/chat/wllama";
    import { importEsm } from "@hackbuild/ai-env";
    import { openWeightStore } from "@hackbuild/weights";

    const store = await openWeightStore();
    const gguf = await store.get({ url, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" });
    const chat = await loadWllama({ module: await importEsm(wllamaUrls().esm), blobs: [gguf] });

    for await (const ev of chat.stream(messages, { maxTokens: 220, stop: ["\nUSER:"] })) {
      if (ev.type === "text") show(ev.text);       // never holds think blocks or control markers
      if (ev.type === "think") trace(ev.text);
    }
    const { text, schemaFallback } = await chat.complete(messages, { schema });

- Roles: `quirks.systemRole: false` merges the system prompt into the first
  user turn and joins same role turns (Gemma 3); `strictAlternation` also
  drops leading assistant turns.
- Think blocks (`think`, `thinking`, `thought`, `reason`, `reasoning`,
  closed or unclosed) come out as `think` events; leaked ChatML, Llama 3,
  Gemma and channel markers are removed. A tag split across chunks is held
  back until it can be read.
- Stop strings are cut on the client for every runtime, also across chunk
  edges.
- Schema: WebLLM gets `{ type: "json_object", schema: "<string>" }` (never
  json_object without a schema), wllama and OpenAI compatible servers get
  `json_schema`, Anthropic gets `output_config.format`, the Prompt API gets
  `responseConstraint`. The first refusal (an error, HTTP 400 included,
  whose text names grammar, schema or response_format) turns schemas off
  for that engine, and the schema moves into the system prompt as text;
  `result.schemaFallback` says so. Any other 400 is thrown as it is.
- OpenAI compatible tool turns: an assistant message's `toolCalls` are
  echoed as `tool_calls`, and a `tool` message with a matching
  `toolCallId` goes out as a native tool result; one without an id goes as
  user text. `repeat_penalty` is sent only with `llamaParams: true`
  (llama.cpp, Ollama), since OpenAI rejects it.
- `loadWebLLM` walks the context ladder `[want, 8192, 4096, 2048]` (as earlier builds did)
  and names a LinkError or TVMFFI failure as a runtime and model library
  mismatch. `loadWllama` uses the earlier chat build parameters (n_ctx 6144, top_p
  .95, top_k 40, min_p .05, penalty_repeat 1.08, cache_prompt) and only
  counts a load once `getLoadedContextInfo()` returns, naming the last
  native error otherwise.
- `scripted()` streams fixed replies with no model, for `?stub` pages and
  tests in other packages.
- Keys: `maskKey` shows the first 4 and last 4 characters. Keys passed to
  the remote engines are sent only in request headers and never logged.
  The Anthropic engine sends `anthropic-dangerous-direct-browser-access`
  so a page can call the API directly; the key then lives in that page.

## With the hub

    hub.provide("wllama", async ({ record }) => loadWllama({ module, blobs: [await store.get(refFor(record))] }));
    const chat = await hub.use("chat", { size: "small" });

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/chat` passes 30 tests under Node
  22.18.0 with fakes for every runtime: role normalization, think
  splitting one character at a time with no half tag shown, marker
  stripping, key masking, stop strings across chunks, the loose schema then free text fallback
  and its memory, abort, OpenAI compatible SSE with reasoning, tool call
  deltas and usage, retry after a 400, Anthropic SSE with thinking, text,
  tool input deltas and stop reasons, the WebLLM request shape and context
  ladder, wllama load parameters and the load check, transformers.js
  streaming, the Prompt API session shape with both delta and whole text
  streams.
- 2026-11-22: the wllama 4.0.0 type files (read from the npm tarball, not
  run) declare the same `createChatCompletion`, `loadModel`,
  `getLoadedContextInfo` and `isSupportWebGPU` calls as 3.8.1, and its ESM
  build still constructs `new Worker(workerURL, { type: "module" })`, the
  string the file:// patch in `@hackbuild/ai-env` rewrites.

### Not verified by anything

- Any real runtime or model. Not run: WebLLM 0.2.84 or 0.2.89 in Chrome,
  wllama 4.0.0 or 3.8.1 loading a GGUF from file:// or http, transformers.js
  4.3.2 text generation, the Prompt API in Chrome 148, a real Ollama or
  llama.cpp server, the Anthropic API with a real key (including whether
  `output_config.format` is accepted by the model you name).
- Whether the WebLLM json_object plus schema request still compiles in
  XGrammar on 0.2.89.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 4,942 bytes | 5,189 bytes |
| `dist/single/index.iife.js` (single file build) | 4,897 bytes | 5,141 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

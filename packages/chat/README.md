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

## Stats, prewarm and sessions

Every `ChatResult` carries `stats`: `tokens` (from the runtime's usage,
"measured", or one per streamed chunk, "inferred"), `firstTokenMs`,
`tokensPerSecond` after the first token and `totalMs`, on the clock
passed as `now` (default `performance.now`).

`engine.prewarm(messages)` evaluates the system text and history into
the runtime's prefix cache before the first send. The wllama driver runs
a zero token completion with `cache_prompt` on; drivers with no prefix
cache return false and call nothing. `PREWARM_DELAY_MS` (1,200 ms,
vendor) is the wait after a prompt or model change before prewarming
again.

The session schema is one versioned JSON shape for save, export and
import (`.hbchat.json`): `createSession`, `exportSession`,
`importSession` (reads older and unversioned `{ messages }` exports,
drops unknown fields, refuses a bad file with a lowercase reason),
`sessionMessages` (raw replies back into history, failed and empty ones
left out) and `sessionToMarkdown`.

`@hackbuild/chat/webllm` adds `webllmPhase(progress)`, which maps
WebLLM's progress text to fetch, compile and ready, and
`webllmCache({ modelList })`, which lists, measures and evicts WebLLM's
own IndexedDB cache per model (the 0.2.84 layout), for the "kept by
webllm" group beside the weight store.

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

- 2026-11-24: reply stats on a fake clock with and without usage, null
  first token for an empty reply, prewarm on wllama with the send's
  normalization and no call on a driver without a cache, session round
  trip, history hygiene, unversioned import and refusals, markdown,
  WebLLM phase words, and the WebLLM cache adapter over fake-indexeddb
  (`test/session.test.ts`).

### Not verified by anything

- Prewarm against a real wllama build: whether `max_tokens: 0` leaves
  the prompt in the KV prefix and how much it saves (the 0.24 s against
  5.9 s first token figures are vendor, from a native runtime).
- `webllmCache` against a real WebLLM 0.2.84 cache; it was checked
  against an entry written in the same layout (row 59).

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
| `dist/index.js` (main entry, imports external) | 7,290 bytes | 7,654 bytes |
| `dist/single/index.iife.js` (single file build) | 7,128 bytes | 7,484 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

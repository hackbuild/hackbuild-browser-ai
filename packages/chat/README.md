# @hackbuild/chat

Stream chat replies from WebLLM, wllama, transformers.js, the Chrome Prompt API or a remote endpoint through one interface.

[![npm](https://img.shields.io/npm/v/@hackbuild/chat)](https://www.npmjs.com/package/@hackbuild/chat) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 5.8 kB measured](https://img.shields.io/badge/gzip-5.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: WebLLM 0.2.84 and 0.2.89 with Qwen2.5 0.5B, and transformers.js 4.3.2 with SmolLM2 360M, ran in one automated pass in Chrome 150 on an Apple M1 that nobody has looked at. wllama, the Prompt API and the remote engines have not run in a browser.

## What it does

- Gives every runtime the same `stream`, `complete`, `prewarm` and `dispose` calls, with the runtime module passed in.
- Normalizes roles for templates with no system role, and splits think blocks and leaked control markers out of visible text as the stream arrives.
- Cuts stop strings on the client for every runtime, also across chunk edges.
- Asks for JSON by schema in each runtime's own form, and falls back to the schema as prompt text when the runtime refuses it.
- Reports time to first token and tokens per second for every reply.

## Install

```sh
npm install @hackbuild/chat @hackbuild/ai-env @hackbuild/models @hackbuild/weights
```

It depends on `@hackbuild/converse`. The quick start also uses `@hackbuild/ai-env`, `@hackbuild/models` and `@hackbuild/weights`. Each runtime is an optional peer behind its own subpath, and no file imports a runtime: you pass the module in, so a page that uses only the remote engine never loads WebLLM. Install only the peer for the subpath you use.

| subpath | runtime | pin |
|---|---|---|
| `@hackbuild/chat/webllm` | `@mlc-ai/web-llm` (optional peer) | 0.2.84 |
| `@hackbuild/chat/wllama` | `@wllama/wllama` (optional peer) | 4.0.0, fallback 3.8.1 |
| `@hackbuild/chat/transformers` | `@huggingface/transformers` (optional peer) | 4.3.2 |
| `@hackbuild/chat/prompt-api` | Chrome `LanguageModel` | Chrome 148 |
| `@hackbuild/chat/remote` | fetch only | none |

## Quick start

```ts
import { importEsm } from "@hackbuild/ai-env";
import type { ChatMessage } from "@hackbuild/chat";
import { loadWllama, wllamaUrls, type WllamaModule } from "@hackbuild/chat/wllama";
import { CATALOG, pinnedBase } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// Qwen2.5 0.5B Instruct q4_k_m GGUF; the record names the weight licence, the store caches the file
const rec = CATALOG.find((r) => r.id === "qwen2.5-0.5b-instruct-gguf")!;
const url = pinnedBase(rec.source.repo!) + rec.source.file!;
const gguf = await (await openWeightStore()).get({ url, licence: rec.licence });

// the runtime is passed in, never bundled
const chat = await loadWllama({ module: await importEsm<WllamaModule>(wllamaUrls().esm), blobs: [gguf] });

// stream a reply; visible text never holds think blocks or control markers
const messages: ChatMessage[] = [{ role: "system", content: "answer in one line." }, { role: "user", content: "what should I pack for rain?" }];
for await (const ev of chat.stream(messages, { maxTokens: 120 })) {
  if (ev.type === "text") console.log(ev.text);
  if (ev.type === "done") console.log(ev.result.stats.tokensPerSecond, "tokens per second");
}
```

## Live example

The suite's chat screen runs on this package: [hackbuild-suite chat](https://hackbuild.github.io/hackbuild-suite/#/chat/chat). The demo page, with every engine, time to first token and tokens per second, is at [hackbuild-browser-ai/chat](https://hackbuild.github.io/hackbuild-browser-ai/chat/).

## Concepts

### engines and drivers

A driver adapts one runtime and yields raw text, think, tool and done events. `createEngine(driver)` wraps it with the rules every runtime needs. Each subpath has a loader that builds the runtime and the engine in one call (`loadWebLLM`, `loadWllama`, `loadTransformers`, `promptApi`, `openaiCompatible`, `anthropicMessages`) and a driver for when you built the runtime yourself. With the model hub from `@hackbuild/models`:

```ts
hub.provide("wllama", async ({ record }) => loadWllama({ module, blobs: [await store.get(refFor(record))] }));
const chat = await hub.use("chat", { size: "small" });
```

### roles

`quirks.systemRole: false` merges the system prompt into the first user turn and joins same role turns (Gemma 3); `strictAlternation` also drops leading assistant turns. A runtime with no tool role gets tool results as user turns prefixed with the tool name.

### think blocks and markers

Think blocks (`think`, `thinking`, `thought`, `reason`, `reasoning`, closed or unclosed) come out as `think` events, or are dropped with `think: "drop"`; leaked ChatML, Llama 3, Gemma and channel markers are removed. A tag split across chunks is held back until it can be read. `ThinkSplitter`, `splitThink`, `stripThink` and `stripMarkers` do the same on your own text.

### stop strings

Stop strings are cut on the client for every runtime, also across chunk edges, whether or not the runtime handles them itself.

### schema fallback

WebLLM gets `{ type: "json_object", schema: "<string>" }` (never json_object without a schema), wllama and OpenAI compatible servers get `json_schema`, Anthropic gets `output_config.format`, the Prompt API gets `responseConstraint`. `fallbackSchemas` are tried in order when the runtime refuses `schema`. The first refusal past them (an error, HTTP 400 included, whose text names grammar, schema or response_format) turns schemas off for that engine, and the schema moves into the system prompt as text; `result.schemaFallback` says so and `result.schemaIndex` names the schema taken. Any other 400 is thrown as it is.

### remote endpoints

`openaiCompatible` takes any chat completions endpoint (Ollama, llama.cpp server, LM Studio, vLLM, a hosted API) by its base URL up to `/v1`. An assistant message's `toolCalls` are echoed as `tool_calls`, and a `tool` message with a matching `toolCallId` goes out as a native tool result; one without an id goes as user text. `repeat_penalty` is sent only with `llamaParams: true` (llama.cpp, Ollama), since OpenAI rejects it. `anthropicMessages` sends system turns in `system` and no sampling options, since current models refuse temperature, top_p and top_k; `model` is required. Both stream server sent events through fetch with no SDK.

### keys

`maskKey` shows the first 4 and last 4 characters, and masks a key under 16 characters entirely. Keys passed to the remote engines are sent only in request headers and never logged. The Anthropic engine sends `anthropic-dangerous-direct-browser-access` so a page can call the API directly; the key then lives in that page.

### loading webllm and wllama

`loadWebLLM` walks the context ladder `[want, 8192, 4096, 2048]`, with WebLLM's IndexedDB cache on, and names a LinkError or TVMFFI failure as a runtime and model library mismatch. `loadWllama` uses these defaults (n_ctx 6144, top_p .95, top_k 40, min_p .05, penalty_repeat 1.08, cache_prompt) and only counts a load once `getLoadedContextInfo()` returns, naming the last native error otherwise. On file:// import wllama through `importEsm` from `@hackbuild/ai-env`, which swaps its module worker for a classic one.

### webllm progress and cache

`webllmPhase(progress)` maps WebLLM's progress text to fetch, compile and ready. `webllmCache({ modelList })` lists, measures and evicts WebLLM's own IndexedDB cache per model (the 0.2.84 layout), for the "kept by webllm" group beside the weight store.

### stats

Every `ChatResult` carries `stats`: `tokens` (from the runtime's usage, "measured", or one per streamed chunk, "inferred"), `firstTokenMs`, `tokensPerSecond` after the first token and `totalMs`, on the clock passed as `now` (default `performance.now`).

### prewarm

`engine.prewarm(messages)` evaluates the system text and history into the runtime's prefix cache before the first send. The wllama driver runs a zero token completion with `cache_prompt` on; drivers with no prefix cache return false and call nothing. `PREWARM_DELAY_MS` is the wait after a prompt or model change before prewarming again.

### sessions moved to converse

The session schema moved to `@hackbuild/converse`; `createSession`, `exportSession`, `importSession`, `migrateSession`, `sessionMessages`, `sessionToMarkdown`, `SessionError`, `SESSION_KIND` and `SESSION_VERSION` are re-exported here for one version. Import them from `@hackbuild/converse`.

### scripted replies

`scripted()` streams fixed replies with no model, for `?stub` pages and tests in other packages. `refuseSchema` makes it reject a schema request, to exercise the fallback.

## API overview

| export | what it does |
|---|---|
| [`createEngine`](../../docs/api/chat/index.md#createengine) | wrap a driver in an engine with roles, think splitting, stop strings and schema fallback |
| [`ChatEngine`](../../docs/api/chat/index.md#chatengine) | the stream, complete, prewarm and dispose calls every engine has |
| [`ChatResult`](../../docs/api/chat/index.md#chatresult) | a finished reply with text, think, finish, tool calls and stats |
| [`ChatError`](../../docs/api/chat/index.md#chaterror) | the error engines throw, with a code and HTTP status |
| [`normalizeMessages`](../../docs/api/chat/index.md#normalizemessages) | rewrite messages for a template's role rules |
| [`ThinkSplitter`](../../docs/api/chat/index.md#thinksplitter) | split think blocks from text as a stream arrives |
| [`maskKey`](../../docs/api/chat/index.md#maskkey) | show the first 4 and last 4 characters of a key |
| [`scripted`](../../docs/api/chat/index.md#scripted) | an engine with fixed replies and no model |
| [`loadWebLLM`](../../docs/api/chat/webllm.md#loadwebllm) | build a WebLLM engine with the context ladder |
| [`webllmCache`](../../docs/api/chat/webllm.md#webllmcache) | list, measure and evict WebLLM's own cache |
| [`loadWllama`](../../docs/api/chat/wllama.md#loadwllama) | load GGUF blobs into wllama and confirm the load |
| [`wllamaUrls`](../../docs/api/chat/wllama.md#wllamaurls) | jsdelivr URLs of a wllama version's ESM entry and wasm |
| [`loadTransformers`](../../docs/api/chat/transformers.md#loadtransformers) | build a transformers.js text generation engine |
| [`promptApi`](../../docs/api/chat/prompt-api.md#promptapi) | an engine over Chrome's built in model |
| [`openaiCompatible`](../../docs/api/chat/remote.md#openaicompatible) | an engine over an OpenAI compatible endpoint |
| [`anthropicMessages`](../../docs/api/chat/remote.md#anthropicmessages) | an engine over the Anthropic Messages API |

The full reference is in [docs/api/chat](../../docs/api/chat/README.md).

## Models and weights

No weights ship here; each model keeps its own licence, and you pass it with the reference. GGUF files come from the URL you give through `@hackbuild/weights`, which caches them; WebLLM and transformers.js fetch from their own hosts into their own caches.

| model | id | size | licence | loads from |
|---|---|---|---|---|
| Qwen2.5 0.5B Instruct q4_k_m (wllama) | `Qwen/Qwen2.5-0.5B-Instruct-GGUF` | 491 MB (vendor) | Apache-2.0 | Hugging Face, cached by `@hackbuild/weights` |
| Qwen2.5 0.5B Instruct q4f16 (WebLLM) | `Qwen2.5-0.5B-Instruct-q4f16_1-MLC` | 290 MB (vendor, repo file sizes) | Apache-2.0 | MLC catalog, WebLLM's IndexedDB cache |
| SmolLM2 360M Instruct q4f16 (transformers.js) | `HuggingFaceTB/SmolLM2-360M-Instruct` | about 260 MB (inferred) | Apache-2.0 | Hugging Face, the transformers.js cache |
| Gemma 3 270M (transformers.js) | any Gemma 3 270M ONNX build | unknown | Gemma Terms of Use | Hugging Face, the transformers.js cache |
| Chrome built in model (Prompt API) | none | unknown | Chrome's terms and the Google Generative AI Prohibited Use Policy | Chrome, on first use |
| remote models | the `model` you name | unknown | the provider's terms, passed as `licence` | the endpoint you give |

## Browser support

| engine | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| WebLLM | WebGPU | yes, Chrome 150 on an Apple M1 (one automated pass) | unknown | unknown | unknown |
| wllama | WASM; WebGPU when wllama reports it | yes (inferred) | unknown | unknown | unknown |
| transformers.js | WASM or WebGPU, by `device` | yes on WebGPU, Chrome 150 on an Apple M1 (one automated pass); WASM inferred | unknown | unknown | unknown |
| Prompt API | `LanguageModel` | 148 and later | no | no | unknown |
| remote | fetch, CORS on the server | yes | yes (inferred) | yes (inferred) | yes (inferred) |

WebLLM is WebGPU only and has no fallback. wllama puts all layers on WebGPU when `isSupportWebGPU()` is true and runs on the CPU otherwise. Whether wllama uses wasm threads is unknown here; it loads from file:// through `importEsm`. WebLLM and transformers.js have run in one automated Chrome pass; the other engines have not run in a browser.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `webllm runtime and model library do not match (...). pin @mlc-ai/web-llm to the version the model was built for.` | a LinkError, TVMFFI or instantiate failure | pin `@mlc-ai/web-llm` to 0.2.84 or the version the model library was built for |
| `webllm could not load <model>: ...` | every rung of the context ladder failed | read the per context errors in the message; try a smaller `contextWindow` or another model |
| `the model did not load: ...` | wllama loaded no model; the last native error is named | check the GGUF blobs are whole and in order, and lower `nCtx` |
| `no LanguageModel in this browser. the built in model needs chrome 148 or later.` | no Prompt API | use Chrome 148 or later, or another engine |
| `the built in model is unavailable on this device.` | `availability()` said unavailable | use another engine |
| `could not reach <host>: ...` | fetch failed: network, CORS or a stopped server | start the server, allow the page's origin, check the base URL |
| `http <status> from <host>: ...` | the endpoint answered with an error; `ChatError.status` holds the code | read the body text in the message; a schema 400 falls back on its own |
| `response has no body to stream` | the endpoint sent no stream body | check the endpoint streams chat completions |
| `request aborted` | the signal aborted the request | none; the reply ends with finish `abort` |
| `stream error` | the stream carried an error event with no message | retry; check the server log |
| `schema fallback did not settle` | the runtime kept refusing after the free text fallback | report it; send without `schema` |

## Works with

- [@hackbuild/converse](../converse/README.md) holds the session schema and runs a conversation over an engine.
- [@hackbuild/structured](../structured/README.md) asks an engine for JSON or tool decisions and guards the reply.
- [@hackbuild/weights](../weights/README.md) downloads and caches GGUF files for `loadWllama`.
- [@hackbuild/ai-env](../ai-env/README.md) imports runtime modules with `importEsm`, file:// included.
- [@hackbuild/models](../models/README.md) picks a chat engine by size through its hub.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights ship here; each model keeps its own licence: Qwen2.5 and SmolLM2 Apache-2.0, Gemma 3 under the Gemma Terms of Use, the Chrome built in model under Chrome's terms and the Google Generative AI Prohibited Use Policy, and remote models under the provider's terms.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/chat` under Node 22.18.0 with fakes for every runtime: role normalization, think splitting one character at a time with no half tag shown, marker stripping, key masking, stop strings across chunks, the loose schema then free text fallback and its memory, abort, OpenAI compatible SSE with reasoning, tool call deltas and usage, retry after a 400, Anthropic SSE with thinking, text, tool input deltas and stop reasons, the WebLLM request shape and context ladder, wllama load parameters and the load check, transformers.js streaming, the Prompt API session shape with both delta and whole text streams | passes 30 tests |
| 2026-11-22 | the wllama 4.0.0 type files, read from the npm tarball, not run | declare the same `createChatCompletion`, `loadModel`, `getLoadedContextInfo` and `isSupportWebGPU` calls as 3.8.1, and its ESM build still constructs `new Worker(workerURL, { type: "module" })`, the string the file:// patch in `@hackbuild/ai-env` rewrites |
| 2026-11-23 | WebLLM 0.2.84 and 0.2.89 with Qwen2.5 0.5B Instruct q4f16 in Chrome 150 on an Apple M1, one automated pass nobody looked at | stream, json_object plus schema parsed, ladder settled at 4096; 0.2.84 load 9,355 ms, first token 1,427 ms, 48.2 tokens per s (measured); 0.2.89 from cache load 2,978 ms, first token 1,805 ms, 30 tokens per s (measured) |
| 2026-11-23 | transformers.js 4.3.2 SmolLM2 360M Instruct q4f16 on webgpu, same pass | stream, and an abort ended the stream 8 ms after the stop (measured); load 9,349 ms, first token 1,163 ms, 37 tokens per s (measured) |
| 2026-11-24 | `test/session.test.ts`: reply stats on a fake clock with and without usage, null first token for an empty reply, prewarm on wllama with the send's normalization and no call on a driver without a cache, session round trip, history hygiene, unversioned import and refusals, markdown, WebLLM phase words, and the WebLLM cache adapter over fake-indexeddb | passes |

### Not verified by anything

- Prewarm against a real wllama build: whether `max_tokens: 0` leaves
  the prompt in the KV prefix and how much it saves; the only figures
  are the vendor's, from a native runtime.
- `webllmCache` against a real WebLLM 0.2.84 cache; it was checked
  against an entry written in the same layout.
- The real runtimes not named in the table. Not run: wllama 4.0.0 or 3.8.1
  loading a GGUF from file:// or http, the Prompt API in Chrome 148, a real
  Ollama or llama.cpp server, the Anthropic API with a real key (including
  whether `output_config.format` is accepted by the model you name).
- WebLLM and transformers.js in Safari, Firefox or on a phone.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,823 bytes | 6,114 bytes |
| `dist/single/index.iife.js` (single file build) | 7,641 bytes | 8,023 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

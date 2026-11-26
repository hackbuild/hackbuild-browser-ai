# @hackbuild/models

Describe each model once, with its runtime, device ladder, size and weight licence, and let a hub load the one that fits this machine.

[![npm](https://img.shields.io/npm/v/@hackbuild/models)](https://www.npmjs.com/package/@hackbuild/models) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 42.8 kB measured](https://img.shields.io/badge/gzip-42.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Holds model records: what a model provides, which runtime runs it, the device and dtype ladder to walk, quirks app code needs, its size with a source word, and its weight licence.
- Ships a catalogue of 45 records (computed) with pinned commits and file hashes for the Hugging Face repos they load.
- Says whether a record fits this machine (memory budget, WebGPU, shader-f16, storage) and why not, before any download.
- Runs a hub that routes a capability to a record, walks its ladder through a provider factory, keeps loaded models under a memory budget, and runs GPU work one job at a time.
- Suggests first visit defaults with one reason per field.

## Install

```sh
npm install @hackbuild/models
```

Depends on @hackbuild/ai-env for the `Env` type. No peers. No weights ship here; runtimes come in through the factories you register.

## Quick start

```ts
import { probe } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { CATALOG, createHub, createRegistry, fitOf, pinnedSha } from "@hackbuild/models";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// what fits this machine, before any download
const env = await probe();
for (const r of CATALOG) console.log(r.id, fitOf(r, env).reason);

// a hub over the catalogue; transformers.js is imported at run time, its files go through the weight store
const cache = transformersCache(await openWeightStore(), { licenceFor: (u) => (u.includes("/depth-anything-v2-small/") ? "Apache-2.0" : null), sha256For: pinnedSha });
const hub = createHub({ registry: createRegistry(CATALOG), env, budgetMB: 4000 });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache }).factory);

// depth-anything-v2-small, weights Apache-2.0: routed by capability, ladder walked, loaded once
hub.onLoad((e) => console.log(e.id, e.phase, e.fraction));
const depth = await hub.use<(image: string) => Promise<unknown>>("depth");
console.log("runs on", depth.rung.device, "after", depth.failures.length, "failed rungs");
console.log(await hub.run(depth, (pipe) => pipe("https://example.com/room.jpg")));
hub.release(depth);
```

## Live example

The package page is at [hackbuild-browser-ai/models](https://hackbuild.github.io/hackbuild-browser-ai/models/).

## Concepts

### records

A record names what it `provides`, its `provider` (webllm, wllama, tjs, ort, prompt-api, remote, mediapipe, tfjs, system, stub), its `source`, `sizeMB` with `sizeSource`, a `ladder` of rungs and a `licence`. `licence` is required; `createRegistry` refuses a record without one. `validateRecord` also refuses a record with no capability or ladder, a `vramMB` without `vramSource`, a speed other than instant, fast, steady or slow, a `verdict` longer than four words, and an unknown `censorship`. `noDownload` marks a record with nothing to fetch; `unrunnable` lists a record and never offers it to load.

### ladders

`ladderFor(record, env)` drops rungs the device cannot run: a webgpu rung without an adapter, an f16 dtype (also inside per sub graph dtypes) without `shader-f16`, a Prompt API rung without `LanguageModel`. `ortLadder()` is the onnxruntime-web walk from the transcription build: webgpu plus wasm at optimization basic, all, disabled, then wasm alone. Pair it with `store.once(ref)` from @hackbuild/weights so every attempt reads one download. `walkLadder` tries rungs in order, names each failure with `classifyError` (runtime mismatch, out of memory, f16, device lost, unsupported op, network, abort) and stops on network and abort.

### quirks

`quirks` carries what app code used to hard code: no system role and strict alternation (Gemma 3), think tags, repetition penalty, native tools (WebLLM Hermes), `<tool_call>` tags (Hermes, Qwen), image order for vision processors, and warnings such as Kokoro's q8 on webgpu.

### pinned commits

`PINS` (written by `tools/pin-weights.mjs`) holds a commit per Hugging Face repo the records load and a SHA-256 per weight and config file at it: the LFS oid (vendor), or a download and hash (measured) for files kept in git and for LFS files up to 30 MB. A registry gives a record of a pinned repo its `source.revision`, so transformers.js and the ort provider fetch `resolve/<commit>/`, not `main`; `pinnedSha(url)` gives the hash for such a URL, which the ort provider, the static embedder and `transformersCache({ sha256For })` check. WebLLM loads its own config at `resolve/main` and is not pinned.

### the catalogue

`CATALOG` holds 45 records (computed): 40 chat rows, which cover the suite design's chat catalogue and every chat model the earlier tools named, and 5 starter records for embed, depth, transcribe, speak and stems. Chat sizes are measured: the Content-Length of a HEAD request on every file the runtime loads, summed in MiB, at the repo head of 2026-11-24 (WebLLM rows leave out the model library wasm). The other sizes are inferred from the builds or from parameter count. Licences on the starter rows are the model cards' as of 2026-11-22; on the chat rows added 2026-11-24 they are the model card licence field the Hugging Face API returns, or the design harvest's string marked "inferred, unverified", and `commercial` is "unknown". The abliterated and uncensored GGUF builds are kept and carry `censorship`. The 14 chat rows added 2026-11-25 (Qwen3 1.7B, Phi-4 mini, SmolLM2 1.7B and the WebLLM models an earlier tool listed) take their size from the Hugging Face file listing (vendor, no download), in MiB.

Records carry the facts a picker row shows before any download: `params`, `quant`, `vramMB` with `vramSource`, `censorship` (stock, uncensored, abliterated, unknown; a field on the record, never a substring rule), `tags`, `tier`, `family`, a one line `note`, the catalogue `group`, the owner's label as `badge` ("best", "default", "fast, capable"), a `speed` word and a `verdict` of one to four words, the words a person picks by. Licences are shown as recorded.

### fit and budget

`budgetFor(env)` gives a model 45 percent of `deviceMemoryGB`, capped at 6 GB on cpu, and 5.5 GB when the browser does not say; the three constants are vendor figures for a native runtime and proposed here until a browser run measures them. `fitOf` combines the ladder against the probe, the budget against VRAM (or the download when no VRAM is recorded) and the storage estimate against the download, and returns one of "fits", "fits on cpu, slow", "needs f16", "needs webgpu", "over memory", "over storage" or "cannot run here" with a lowercase reason. `PRESETS` fill the slot rack by weight class, and `presetTotal` sums their download (computed) with the weakest source word among the parts. `ggufFacts(fileName)` reads params, quant and split part from a GGUF name for a custom row.

### the hub

`use` routes by capability, device, size class and the budget left by busy models, then walks the ladder through the provider's factory. Loads on webgpu rungs take the `gpu` lock. Idle models (released to zero refs) are disposed oldest first when a new load would pass `budgetMB`; `dispose()` or `unload()` on the value is called. The hub states each record's weight licence once, before its first load (`onLicence`, default console.info). `exclusive(resource, fn, { priority })` runs one job per resource, higher priority first, FIFO within a priority, and waiters can abort. `chain(name)` is a serial queue for one capability.

### scheduling around rendering

A webgpu model shares the GPU with the scene and stutters it, and JS profiling does not show it (earlier builds). `run(l, fn, { minIntervalMs, idleOnly, frameBudgetMs, maxDeferMs, when })` waits for the gap since the model's last start, an idle callback, and frames under budget (fed by `hub.reportFrame(ms)` from the render loop, mean of the last 30); `when: "skip"` rejects with code `skipped` instead of waiting, and also when a run of that model is in flight. `busy(id?)`, `onBusy(fn)` and `status()[i].busy` drive a busy indicator; `use(cap, { size, maxMB })` picks a smaller model.

### load steps

`hub.onLoad(fn)` tells every listener how each load moves: `{ id, phase, fraction, file, rung }` with phases fetch, compile, warm, then ready or failed. Factories report through `ctx.report(phase, fraction, file)`; the transformers.js provider of @hackbuild/devices reports file progress. A ladder fallback keeps the model's id and moves `rung`.

### defaults

`suggestDefaults(env, { catalogue, stored, estimate })` returns `{ patch, reasons, download, budget }`: the largest stored model that fits the budget, the device and thread count, and one `{ label, value, why }` row per field. A catalogue row is offered for download only when it is 1.5 times the stored pick (vendor rule, proposed here) or nothing stored fits; with nothing that fits, the smallest stored model is picked and the reason says replies may be slow. When the catalogue has a `START_GROUP` ("start here") group, downloads are offered from it only; the largest row that fits is otherwise a 5 GB abliterated GGUF.

### stubs

`createHub({ stub: new URLSearchParams(location.search).has("stub") })` routes every `use(capability)` to `stubRecord(capability)`, with no weights. Register `hub.provide("stub", stubFactory({ chat: () => echoChat, depth: () => rampDepth }))`; each capability package ships its own stub builder, so an app runs headless with `?stub` and tests need no download.

### how later packages attach

A capability package (vision, transcribe, stems, notes, imagegen, speak, listen, embed, biosignal) adds records with `registry.add`, registers a factory per provider with `hub.provide`, exports a stub builder, and calls `hub.run` for inference. Nothing in this package changes for that.

## API overview

| export | what it does |
|---|---|
| [`createHub`](../../docs/api/models/README.md#createhub) | a hub that routes, loads under a budget and queues GPU work |
| [`createRegistry`](../../docs/api/models/README.md#createregistry) | a validated set of records with `find` and `route` |
| [`CATALOG`](../../docs/api/models/README.md#catalog) | the starter records |
| [`ModelRecord`](../../docs/api/models/README.md#modelrecord) | the shape of a record |
| [`ladderFor`](../../docs/api/models/README.md#ladderfor) | the rungs this env can attempt |
| [`walkLadder`](../../docs/api/models/README.md#walkladder) | try rungs until one loads |
| [`classifyError`](../../docs/api/models/README.md#classifyerror) | name a load failure |
| [`fitOf`](../../docs/api/models/README.md#fitof) | whether a record fits this machine, and why not |
| [`budgetFor`](../../docs/api/models/README.md#budgetfor) | the memory budget for one model |
| [`suggestDefaults`](../../docs/api/models/README.md#suggestdefaults) | first visit defaults with reasons |
| [`pinnedSha`](../../docs/api/models/README.md#pinnedsha) | the pinned SHA-256 of a resolve URL |
| [`stubFactory`](../../docs/api/models/README.md#stubfactory) | a stub provider from per capability builders |

The full reference is in [docs/api/models](../../docs/api/models/README.md).

## Models and weights

Weights are never bundled. Each record loads from the host in the table through the runtime its provider names; @hackbuild/weights caches the files when you pass it to the provider (`transformersCache`, `store.once`). Sizes are MiB of download; the source word is in each cell. Licences are as recorded on the record, unverified where it says so; recheck before shipping a product on them.

| model | id | size, MiB (source word in the cell) | licence | loads from |
|---|---|---|---|---|
| smollm2-135m-instruct | `smollm2-135m-instruct` | 174 (measured) | Apache-2.0 | Hugging Face `HuggingFaceTB/SmolLM2-135M-Instruct`, transformers.js |
| smollm2-360m-instruct | `smollm2-360m-instruct` | 370 (measured) | Apache-2.0 | Hugging Face `HuggingFaceTB/SmolLM2-360M-Instruct`, transformers.js |
| gemma-3-270m-it | `gemma-3-270m-it` | 328 (measured) | Gemma Terms of Use | Hugging Face `onnx-community/gemma-3-270m-it-ONNX`, transformers.js |
| qwen2.5-0.5b-instruct-mlc | `qwen2.5-0.5b-instruct-mlc` | 269 (measured) | Apache-2.0 | WebLLM catalogue id `Qwen2.5-0.5B-Instruct-q4f16_1-MLC`, WebLLM |
| hermes-3-llama-3.2-3b-mlc | `hermes-3-llama-3.2-3b-mlc` | 1733 (measured) | Llama 3.2 Community License | WebLLM catalogue id `Hermes-3-Llama-3.2-3B-q4f16_1-MLC`, WebLLM |
| qwen2.5-0.5b-instruct-gguf | `qwen2.5-0.5b-instruct-gguf` | 469 (measured) | Apache-2.0 | Hugging Face `Qwen/Qwen2.5-0.5B-Instruct-GGUF`, `qwen2.5-0.5b-instruct-q4_k_m.gguf`, wllama |
| chrome built in model | `gemini-nano` | unknown | Chrome built in AI terms and the Google Generative AI Prohibited Use Policy | built into Chrome, nothing to download, Prompt API |
| Qwen2.5 1.5B Instruct | `qwen2.5-1.5b-instruct-mlc` | 828 (measured) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `Qwen2.5-1.5B-Instruct-q4f16_1-MLC`, WebLLM |
| Llama 3.2 1B Instruct | `llama-3.2-1b-instruct-mlc` | 663 (measured) | Llama 3.2 Community License (inferred, unverified) | WebLLM catalogue id `Llama-3.2-1B-Instruct-q4f16_1-MLC`, WebLLM |
| Llama 3.2 3B Instruct | `llama-3.2-3b-instruct-q4f32-mlc` | 1724 (measured) | Llama 3.2 Community License (inferred, unverified) | WebLLM catalogue id `Llama-3.2-3B-Instruct-q4f32_1-MLC`, WebLLM |
| Gemma 2 2B | `gemma-2-2b-it-mlc` | 1424 (measured) | Gemma Terms of Use (inferred, unverified) | WebLLM catalogue id `gemma-2-2b-it-q4f16_1-MLC`, WebLLM |
| Qwen2.5 3B Instruct | `qwen2.5-3b-instruct-mlc` | 1667 (measured) | Qwen Research License, non-commercial (the base model card) | WebLLM catalogue id `Qwen2.5-3B-Instruct-q4f16_1-MLC`, WebLLM |
| Qwen2.5 7B Instruct | `qwen2.5-7b-instruct-mlc` | 4090 (measured) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `Qwen2.5-7B-Instruct-q4f16_1-MLC`, WebLLM |
| Llama 3.1 8B Instruct | `llama-3.1-8b-instruct-q4f32-mlc` | 4308 (measured) | Llama 3.1 Community License (inferred, unverified) | WebLLM catalogue id `Llama-3.1-8B-Instruct-q4f32_1-MLC`, WebLLM |
| Hermes 3 Llama 3.1 8B | `hermes-3-llama-3.1-8b-mlc` | 4317 (measured) | Llama 3.1 Community License (inferred, unverified) | WebLLM catalogue id `Hermes-3-Llama-3.1-8B-q4f16_1-MLC`, WebLLM |
| DeepSeek R1 Distill Qwen 7B | `deepseek-r1-distill-qwen-7b-mlc` | 4093 (measured) | MIT (inferred, unverified) | WebLLM catalogue id `DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC`, WebLLM |
| Gemma 4 E4B abliterated | `gemma-4-e4b-abliterated-gguf` | 5057 (measured) | apache-2.0 (model card field, unverified) | Hugging Face `mradermacher/Gemma-4-E4B-IT-ABLITERATED-UNCENSORED-PHILADELPHIA-CLASS-i1-GGUF`, `Gemma-4-E4B-IT-ABLITERATED-UNCENSORED-PHILADELPHIA-CLASS.i1-Q4_K_M.gguf`, wllama |
| Gemma 4 E2B abliterated | `gemma-4-e2b-abliterated-gguf` | 3269 (measured) | apache-2.0 (model card field, unverified) | Hugging Face `mradermacher/Huihui-gemma-4-E2B-it-abliterated-GGUF`, `Huihui-gemma-4-E2B-it-abliterated.Q4_K_M.gguf`, wllama |
| Qwen3.5 4B abliterated | `qwen3.5-4b-abliterated-gguf` | 2582 (measured) | apache-2.0 (model card field, unverified) | Hugging Face `mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF`, `Huihui-Qwen3.5-4B-abliterated.Q4_K_M.gguf`, wllama |
| Hermes 3 Llama 3.2 3B abliterated | `hermes-3-llama-3.2-3b-abliterated-gguf` | 1926 (measured) | llama3 (model card field, unverified) | Hugging Face `mradermacher/Hermes-3-Llama-3.2-3B-abliterated-i1-GGUF`, `Hermes-3-Llama-3.2-3B-abliterated.i1-Q4_K_M.gguf`, wllama |
| Hermes 3 3B abliterated, IQ3 | `hermes-3-llama-3.2-3b-abliterated-iq3-gguf` | 1526 (measured) | llama3 (model card field, unverified) | Hugging Face `mradermacher/Hermes-3-Llama-3.2-3B-abliterated-i1-GGUF`, `Hermes-3-Llama-3.2-3B-abliterated.i1-IQ3_M.gguf`, wllama |
| Llama 3.2 3B uncensored | `llama-3.2-3b-instruct-uncensored-gguf` | 2137 (measured) | Llama 3.2 Community License (inferred, unverified) | Hugging Face `mradermacher/Llama-3.2-3B-Instruct-uncensored-GGUF`, `Llama-3.2-3B-Instruct-uncensored.Q4_K_M.gguf`, wllama |
| Qwen3.5 2B abliterated | `qwen3.5-2b-abliterated-gguf` | 1212 (measured) | apache-2.0 (model card field, unverified) | Hugging Face `mradermacher/Huihui-Qwen3.5-2B-abliterated-GGUF`, `Huihui-Qwen3.5-2B-abliterated.Q4_K_M.gguf`, wllama |
| Qwen3.5 0.8B abliterated | `qwen3.5-0.8b-abliterated-gguf` | 503 (measured) | apache-2.0 (model card field, unverified) | Hugging Face `mradermacher/Huihui-Qwen3.5-0.8B-abliterated-GGUF`, `Huihui-Qwen3.5-0.8B-abliterated.Q4_K_M.gguf`, wllama |
| Qwen3 0.6B | `qwen3-0.6b` | 552 (measured) | Apache-2.0 (inferred, unverified) | Hugging Face `onnx-community/Qwen3-0.6B-ONNX`, transformers.js |
| DeepSeek R1 Distill Qwen 1.5B | `deepseek-r1-distill-qwen-1.5b` | 1315 (measured) | MIT (inferred, unverified) | Hugging Face `onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX`, transformers.js |
| Qwen3 1.7B | `qwen3-1.7b-mlc` | 934 (vendor) | Apache-2.0 (the base model card; the mlc repo card has no licence field) | WebLLM catalogue id `Qwen3-1.7B-q4f16_1-MLC`, WebLLM |
| Phi-4 mini | `phi-4-mini-instruct-mlc` | 2073 (vendor) | MIT (the base model card; the mlc repo has no card) | WebLLM catalogue id `Phi-4-mini-instruct-q4f16_1-MLC`, WebLLM |
| SmolLM2 1.7B | `smollm2-1.7b-instruct-mlc` | 920 (vendor) | Apache-2.0 (the base model card; the mlc repo card has no licence field) | WebLLM catalogue id `SmolLM2-1.7B-Instruct-q4f16_1-MLC`, WebLLM |
| Qwen2.5 Coder 3B | `qwen2.5-coder-3b-instruct-mlc` | 1667 (vendor) | Qwen Research License, non-commercial (the base model card) | WebLLM catalogue id `Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC`, WebLLM |
| Phi-3.5 mini | `phi-3.5-mini-instruct-mlc` | 2053 (vendor) | MIT (inferred, unverified) | WebLLM catalogue id `Phi-3.5-mini-instruct-q4f16_1-MLC`, WebLLM |
| Mistral 7B v0.3 | `mistral-7b-instruct-v0.3-mlc` | 3892 (vendor) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `Mistral-7B-Instruct-v0.3-q4f16_1-MLC`, WebLLM |
| Qwen2.5 Coder 7B | `qwen2.5-coder-7b-instruct-mlc` | 4097 (vendor) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC`, WebLLM |
| Gemma 2 9B | `gemma-2-9b-it-mlc` | 4980 (vendor) | Gemma Terms of Use (inferred, unverified) | WebLLM catalogue id `gemma-2-9b-it-q4f16_1-MLC`, WebLLM |
| Hermes 2 Pro Llama 3 8B | `hermes-2-pro-llama-3-8b-mlc` | 4317 (vendor) | Llama 3 Community License (inferred, unverified) | WebLLM catalogue id `Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC`, WebLLM |
| Hermes 2 Theta Llama 3 8B | `hermes-2-theta-llama-3-8b-mlc` | 4317 (vendor) | Llama 3 Community License (inferred, unverified) | WebLLM catalogue id `Hermes-2-Theta-Llama-3-8B-q4f16_1-MLC`, WebLLM |
| Hermes 2 Pro Mistral 7B | `hermes-2-pro-mistral-7b-mlc` | 3888 (vendor) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `Hermes-2-Pro-Mistral-7B-q4f16_1-MLC`, WebLLM |
| OpenHermes 2.5 Mistral 7B | `openhermes-2.5-mistral-7b-mlc` | 3888 (vendor) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `OpenHermes-2.5-Mistral-7B-q4f16_1-MLC`, WebLLM |
| NeuralHermes 2.5 Mistral 7B | `neuralhermes-2.5-mistral-7b-mlc` | 3888 (vendor) | Apache-2.0 (inferred, unverified) | WebLLM catalogue id `NeuralHermes-2.5-Mistral-7B-q4f16_1-MLC`, WebLLM |
| DeepSeek R1 Distill Llama 8B | `deepseek-r1-distill-llama-8b-mlc` | 4317 (vendor) | MIT, on Llama 3.1 (inferred, unverified) | WebLLM catalogue id `DeepSeek-R1-Distill-Llama-8B-q4f16_1-MLC`, WebLLM |
| all-minilm-l6-v2 | `all-minilm-l6-v2` | 23 (inferred) | Apache-2.0 | Hugging Face `Xenova/all-MiniLM-L6-v2`, transformers.js |
| depth-anything-v2-small | `depth-anything-v2-small` | 100 (inferred) | Apache-2.0 | Hugging Face `onnx-community/depth-anything-v2-small`, transformers.js |
| whisper-base | `whisper-base` | 200 (inferred) | MIT | Hugging Face `onnx-community/whisper-base`, transformers.js |
| kokoro-82m | `kokoro-82m` | 330 (inferred) | Apache-2.0 (weights); the kokoro-js runtime phonemizes with eSpeak NG, GPL-3.0-or-later, loaded at run time and opt in | Hugging Face `onnx-community/Kokoro-82M-v1.0-ONNX`, transformers.js |
| htdemucs-fast | `htdemucs-fast` | 166 (inferred) | MIT | Hugging Face `StemSplitio/htdemucs-onnx`, `htdemucs_fp16weights.onnx`, onnxruntime-web |

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| records, registry, fit, defaults | nothing; plain TypeScript | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| hub scheduling | `requestIdleCallback` when present, else a timer | yes (inferred) | yes (inferred), timer when idle callbacks are missing | yes (inferred) | yes (inferred) |
| webgpu rungs | WebGPU adapter; f16 dtypes need shader-f16 | yes (inferred) | unknown | unknown | unknown |
| Prompt API rung | `LanguageModel` | 148 and later | no | no | unknown |

The package itself needs no WebGPU or wasm; `ladderFor` skips the rungs a device cannot run, so a record without an adapter falls to its wasm rungs. No record has been loaded against its real runtime in a browser yet (see below).

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `no model for <capability> fits this device and budget` (HubError `no-route`) | no record provides it, or every one is over budget or has no rung for this env | add a record, raise `budgetMB`, or pass a smaller `size` |
| `no factory for provider <p>; call hub.provide("<p>", ...)` (HubError `no-provider`) | no factory registered for the record's provider | register one, e.g. `tjsProvider(...).factory` from @hackbuild/devices |
| `needs <mb> MB, <n> MB resident in use, budget <b> MB. release a model first.` (HubError `budget`) | busy models fill the budget | `hub.release` a model you are done with |
| `<id>: run aborted while waiting for the frame budget`, `<id>: run aborted before it started` (HubError `abort`) | the signal aborted | none |
| HubError `skipped` (`next start in <ms> ms`, `frames at <ms> ms over the <budget> ms budget`, `a run of this model is in flight`) | `when: "skip"` and the run was not due | drop the frame, or use `when: "wait"` |
| `<id>: every rung failed: <device> <dtype> (<kind>), ...` (LadderError) | each rung threw; `failures` has the kinds | read the kinds: `runtime-mismatch` pins the runtime, `out-of-memory` picks a smaller model, `f16` needs an f32 rung |
| `<id>: no rung fits this device` (LadderError) | `ladderFor` dropped every rung | use a record with a wasm rung, or a machine with WebGPU |
| `<id>: every model reference names its weight licence` (RegistryError) | a record with no `licence` | add the licence |
| `<id>: provides is empty`, `<id>: ladder is empty`, `<id>: vramMB needs its source word in vramSource`, `<id>: speed is one of ...`, `<id>: a verdict is one to four words, got "..."`, `<id>: censorship is one of ...` (RegistryError) | a malformed record | fix the field named |
| `no stub for <capability>` | stub mode with no builder for that capability | add a builder to `stubFactory` |

## Works with

- [@hackbuild/ai-env](../ai-env/README.md) gives the `Env` that ladders, fit and defaults read.
- [@hackbuild/devices](../devices/README.md) supplies the transformers.js and onnxruntime-web factories for `hub.provide`.
- [@hackbuild/weights](../weights/README.md) caches the files; `pinnedSha` feeds its `transformersCache`.
- [@hackbuild/ai-views](../ai-views/README.md) draws the catalogue as picker rows with fit words.
- [@hackbuild/chat](../chat/README.md), [@hackbuild/vision](../vision/README.md), [@hackbuild/transcribe](../transcribe/README.md) and the other capability packages add records and factories.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/models` passes 20 tests under Node
  22.18.0: catalog licences and ladders, licence refusal, rung filtering
  for webgpu, shader-f16 and Prompt API, the ORT ladder order, error
  classification on the strings the builds logged, ladder walk and stop,
  routing by capability, device, size and budget, load reuse across
  concurrent `use`, budget eviction oldest idle first, refusal when busy
  models fill the budget, priority order with one job at a time, abort of
  a waiter, the serial chain, gpu lock for webgpu models only, stub mode,
  and run scheduling with a fake clock: minimum interval wait and skip,
  idle wait, frame budget skip and defer limit, busy counts, listeners
  and re-entry skip.

- 2026-11-24: `test/fit.test.ts`: catalogue facts valid on every row,
  budget fallback, share and cpu cap, each fit word, preset picks and
  computed totals with the weakest source word, GGUF name facts; every
  design chat row present with a measured size, group and label;
  censorship matching the repo words; every GGUF file pinned with its
  SHA-256 (the hub's LFS oid, vendor).

- 2026-11-24: `test/defaults.test.ts`: fallback and cpu budgets in the
  reasons, largest stored fit, the 1.5 times offer rule, smallest stored
  with the slow warning, the empty pick with an offer that fits storage,
  determinism, offers from the start group only, and `onLoad` phases for two listeners, a ladder fallback,
  a failure and a throwing listener.

### Not verified by anything

- The budget constants in a browser, and whether a "fits" row loads.

- Any record against its real runtime and weights. Not run: whether each
  catalog ladder loads in Chrome, Safari or Firefox; the sizes of the
  embed, depth, transcribe, speak and stems rows (inferred); whether the
  added GGUF and ONNX chat rows load in wllama 3.8.1 and transformers.js
  4.3.2; the error patterns against current
  WebLLM 0.2.89, onnxruntime-web 1.31 and transformers.js 4.3.2 messages.


## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 42,772 bytes | 44,910 bytes |
| `dist/single/index.iife.js` (single file build) | 42,279 bytes | 44,392 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights ship here. Each record carries its own weight licence, listed in the table above: Apache-2.0, MIT, the Gemma Terms of Use, the Llama 3, 3.1 and 3.2 Community Licenses, the Qwen Research License (non-commercial) and Chrome's built in AI terms among them. The kokoro-js runtime phonemizes with eSpeak NG, GPL-3.0-or-later, loaded at run time and opt in. The quick start loads depth-anything-v2-small, weights Apache-2.0.

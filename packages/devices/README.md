# @hackbuild/devices

Plug onnxruntime-web and transformers.js into the models hub, with device ladders, pinned runtime imports and failure lines your users can read.

[![npm](https://img.shields.io/npm/v/@hackbuild/devices)](https://www.npmjs.com/package/@hackbuild/devices) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 7.1 kB measured](https://img.shields.io/badge/gzip-7.1%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no model run of this package has been verified in a real browser yet. The runtime imports of transformers.js and onnxruntime-web passed one automated pass in Chrome 150 on an Apple M1 that nobody has looked at; the ort ladder on a real graph and Safari have not run.

## What it does

- Gives the two providers every model package plugs into the `@hackbuild/models` hub, one per runtime.
- Imports transformers.js and onnxruntime-web at run time from pinned CDN URLs with fallbacks, once per page.
- Builds the ladders of device and dtype a load walks, in a fixed order per model family.
- Merges per file download progress into one fraction and one status line.
- Turns a load, run, storage, mic or camera failure into one lowercase line that names it and the working alternative.

## Install

```sh
npm install @hackbuild/devices
```

It depends on [@hackbuild/ai-env](../ai-env/README.md), [@hackbuild/models](../models/README.md) and [@hackbuild/weights](../weights/README.md). No runtime ships in the package; both load at run time from pinned CDN URLs:

| subpath | runtime | pin |
|---|---|---|
| `.` (`loadTransformers`, `tjsProvider`) | @huggingface/transformers, Apache-2.0 | 4.3.2 |
| `.` (`loadOrt`, `ortProvider`) | onnxruntime-web, Apache-2.0 | 1.27.0 |

Each runtime is optional: load only the one your models use.

## Quick start

```ts
import { probe } from "@hackbuild/ai-env";
import { humanError, LADDERS, loadOrt, loadTransformers, ortProvider, ortWasmPaths, tjsProvider } from "@hackbuild/devices";
import { CATALOG, createHub } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// one hub per page; one provider per runtime, each runtime imported at run time from a pinned url
const hub = createHub({ env: await probe() });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() }).factory);

// a catalog record on the depth ladder: webgpu fp16, webgpu fp32, wasm q8, wasm fp32
const rec = { ...CATALOG.find((r) => r.id === "depth-anything-v2-small")!, ladder: LADDERS.depth() };
hub.registry.add(rec);
console.log("weight licence", rec.licence); // from the record

// load it; a failure becomes one lowercase line naming it and what still works
const line = await hub.use("depth").then((l) => `loaded on ${l.rung.device}`, (e) => humanError(e));
console.log(line);
```

## Live example

The package page probes what the browser can do, imports the pinned runtimes, runs a resumable weight download and times SHA-256: [hackbuild-browser-ai/devices](https://hackbuild.github.io/hackbuild-browser-ai/devices/).

## Concepts

### one provider per runtime

Register each provider once per page; every model package plugs into the same two.

```ts
const tjs = tjsProvider({ runtime: loadTransformers() });
const ort = ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() });
hub.provide("tjs", tjs.factory);
hub.provide("ort", ort.factory);
```

`tjsProvider` configures the runtime once: no local models, the browser cache on (off on file://, or a `transformersCache` from `@hackbuild/weights` as the custom cache), wasm threads from the probe, the proxy worker off, the wasm cache off. The default loader is `pipeline(task, modelId, { device, dtype, progress_callback })`, with the task from `TJS_TASKS` or `rung.options.task`. A package registers its own loader for a capability with `tjs.loader("vision.caption", fn)`. A record's pinned `source.revision` goes to transformers.js, so fetches resolve that commit and not main. transformers.js file progress also reaches `hub.onLoad` listeners as fetch steps.

`ortProvider` reads graph bytes once through `store.once`, then builds a session per rung from the same bytes, since onnxruntime aborts on a WebGPU partition failure instead of falling back on its own. Files that do not end in `.onnx` are passed as `externalData`. When two graphs share a file name, each is keyed by its folder (`text_encoder/model.onnx` is `text_encoder`). The value is `{ ort, sessions, session, rung, dispose }`.

### pinned runtimes

`loadTransformers()` and `loadOrt()` return memoized loaders, so every package shares one runtime instance per page; a failed import is retried on the next call. They go through the file:// safe `importEsm` of @hackbuild/ai-env, trying jsDelivr first and esm.sh after. `RUNTIME_SHA256` holds the SHA-256 of the pinned jsDelivr files; two fetches of each gave identical bytes. It is opt in: pass `{ integrity: RUNTIME_SHA256 }`, and the text is fetched, checked and imported from a Blob URL, which moves `import.meta.url`; set ort's `wasmPaths` (`ortWasmPaths`) when you do. The esm.sh fallbacks carry no hash, so with integrity on they run only if their text matches, which it will not.

### ladders

A ladder is the list of rungs (device and dtype) a load tries in order. The walk and error names (`walkLadder`, `classifyError`) are the models package's and are re-exported here.

```ts
LADDERS.depth()          // webgpu fp16, webgpu fp32, wasm q8, wasm fp32
LADDERS.perceptionCpu()  // wasm q8, wasm fp32, then webgpu
LADDERS.whisperTurbo()   // fp16 encoder plus q4 decoder, fp32 encoder, q8 on wasm
LADDERS.smolvlm()        // per sub graph dtypes, q4 retry in a fresh heap
LADDERS.ort()            // webgpu at basic, all, disabled, then wasm
tjsLadder({ webgpu: ["q4f16"], wasm: ["q8"] })
```

`LADDERS.smolvlm()` tries the fp32 embed and vision encoder first: with fp16, Chrome 150 on an Apple M1 gave captions unrelated to the image in a run on 2026-11-23. A `freshHeap` rung only retries; transformers.js offers no fresh heap.

### failure copy

`humanError(e)` turns a load or run failure into one lowercase line that names it and the working alternative ("the model ran out of memory. unload another model, or pick the next row down."), through `classifyError` and the weight store's error codes. `humanError("mic", e)` and `humanError("camera", e)` read a device failure by its DOMException name: denied, not found, in use. An unknown failure keeps its message.

### progress

`progressMerger(onUpdate)` takes transformers.js per file events and gives one fraction across files, or an MB count while no file has reported a total: "downloading 42% of 96 MB" or "downloading 12 MB".

## API overview

| export | what it does |
|---|---|
| [`tjsProvider`](../../docs/api/devices/README.md#tjsprovider) | the transformers.js provider for the models hub |
| [`ortProvider`](../../docs/api/devices/README.md#ortprovider) | the onnxruntime-web provider for the models hub |
| [`loadTransformers`](../../docs/api/devices/README.md#loadtransformers) | a memoized import of the pinned transformers.js |
| [`loadOrt`](../../docs/api/devices/README.md#loadort) | a memoized import of the pinned onnxruntime-web |
| [`ortWasmPaths`](../../docs/api/devices/README.md#ortwasmpaths) | the wasm file directory for an ort pin |
| [`PINS`](../../docs/api/devices/README.md#pins) | the pinned runtime versions |
| [`RUNTIME_SHA256`](../../docs/api/devices/README.md#runtime_sha256) | SHA-256 of the pinned runtime files, opt in |
| [`LADDERS`](../../docs/api/devices/README.md#ladders) | named ladders from the builds |
| [`tjsLadder`](../../docs/api/devices/README.md#tjsladder) | transformers.js rungs from a spec |
| [`ortRungs`](../../docs/api/devices/README.md#ortrungs) | onnxruntime-web rungs, or wasm only |
| [`humanError`](../../docs/api/devices/README.md#humanerror) | one lowercase line for a failure and what still works |
| [`progressMerger`](../../docs/api/devices/README.md#progressmerger) | per file progress merged into one fraction and line |
| [`configureTjs`](../../docs/api/devices/README.md#configuretjs) | the transformers.js setup the provider applies |
| [`configureOrt`](../../docs/api/devices/README.md#configureort) | the onnxruntime-web setup the provider applies |
| [`pickDevice`](../../docs/api/devices/README.md#pickdevice) | webgpu when the probe found an adapter, else wasm |
| [`wasmThreads`](../../docs/api/devices/README.md#wasmthreads) | the wasm thread count from the probe |
| [`walkLadder`](../../docs/api/devices/README.md#walkladder) | the ladder walk, re-exported from @hackbuild/models |
| [`classifyError`](../../docs/api/devices/README.md#classifyerror) | the failure kind, re-exported from @hackbuild/models |

The full reference is in [docs/api/devices](../../docs/api/devices/README.md).

## Models and weights

This package loads no model of its own and names none by default. It loads the records you register, from the source each record names, and `ortProvider` reads graph bytes through @hackbuild/weights, which caches them. Weights are never bundled. Each record carries its own weight licence; the `LADDERS` comments name the families they were set for (Whisper, MIT; SmolVLM, Apache-2.0).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| WebGPU rungs | a WebGPU adapter | yes (inferred) | unknown | unknown | unknown |
| WASM rungs | WebAssembly | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| wasm threads | the probe's safe count | from the probe | from the probe | from the probe | from the probe |
| file:// | `importEsm` | browser cache off | browser cache off | browser cache off | unknown |

`pickDevice` picks WebGPU when the probe found an adapter, else wasm; a ladder falls back rung by rung. `wasmThreads` uses the probe's safe thread count, 1 without a probe. The proxy worker stays off because it cannot start on file://.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `ID: an ort record needs source.url, source.file or source.files` | the record names no graph | give the record a `source.url`, `file` or `files` |
| `ID: no .onnx graph among the files` | every file was external data | list the `.onnx` graph in `source.files` |
| `ID: a transformers.js record needs source.modelId` | no model id or repo | set `source.modelId` |
| `ID: no transformers.js task for CAPABILITY; register a loader` | the capability is not in `TJS_TASKS` | set `rung.options.task`, or call `tjs.loader(capability, fn)` |
| `the transformers.js module has no pipeline export` | the runtime import gave another module | load it with `loadTransformers()`, or pass a module with `pipeline` |

`humanError` turns any of these, and runtime failures, into a line to show: out of memory, no shader-f16, device lost, runtime mismatch, unsupported operation, network, abort, quota, checksum and range.

## Works with

- [@hackbuild/models](../models/README.md) is the hub the providers plug into; it walks the ladders.
- [@hackbuild/weights](../weights/README.md) is the store `ortProvider` reads graphs through, and gives `transformersCache` for `tjsProvider`.
- [@hackbuild/ai-env](../ai-env/README.md) probes WebGPU and threads, and gives `importEsm`.
- [@hackbuild/vision](../vision/README.md) and [@hackbuild/imagegen](../imagegen/README.md) load their models through these providers.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. transformers.js and onnxruntime-web are Apache-2.0, loaded at run time and never bundled. The quick start's Depth Anything V2 small weights are Apache-2.0.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/devices` under Node 22.18.0 with fake runtimes: ladder orders, per sub graph dtypes, progress merging with and without totals, the transformers.js provider walking fp16 to fp32 through the hub with the f16 failure named, runtime configuration (threads, proxy, caches, file://), loader routing, the ort provider fetching a graph once while the ladder moves from basic to all after a `transformer_memcpy` failure, external data, graph file naming, and the memoized runtime loader retrying after a failed import | passes 10 tests |
| 2026-11-23 | `RUNTIME_SHA256` against the pinned jsDelivr files, two fetches each | byte identical (measured) |
| 2026-11-24 | `test/human.test.ts`: each mic and camera error name, each runtime kind, the storage codes, an unknown message, and transformers.js progress reaching `hub.onLoad` | passes |

### Not verified by anything

- The error names each browser really throws for a denied or busy mic
  and camera.

- The pinned CDN URLs against the real transformers.js 4.3.2 and
  onnxruntime-web 1.27.0 packages in any browser but Chrome 150, where
  one automated pass imported both.
- `externalData` and `wasmPaths` against a real onnxruntime-web session.
- `freshHeap` rungs: transformers.js offers no fresh heap, so the rung
  only retries; a true fresh heap needs a new worker (not built).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 7,127 bytes | 7,483 bytes |
| `dist/single/index.iife.js` (single file build) | 37,283 bytes | 39,147 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

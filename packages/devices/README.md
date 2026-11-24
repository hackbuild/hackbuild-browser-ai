# @hackbuild/devices

Provider ladders for onnxruntime-web and transformers.js, and the two
factories every model package plugs into the `@hackbuild/models` hub.
Code MIT; this README CC-BY-4.0 with the code samples also MIT. No
weights and no runtime ship here: both runtimes load at run time from
pinned CDN URLs (transformers.js 4.3.2 and onnxruntime-web 1.27.0, both
Apache-2.0).

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/devices

## One provider per runtime

    import { createHub, createRegistry } from "@hackbuild/models";
    import { openWeightStore } from "@hackbuild/weights";
    import { tjsProvider, ortProvider, loadTransformers, loadOrt, ortWasmPaths } from "@hackbuild/devices";

    const tjs = tjsProvider({ runtime: loadTransformers() });
    const ort = ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() });
    hub.provide("tjs", tjs.factory);
    hub.provide("ort", ort.factory);

- `tjsProvider` configures the runtime once: no local models, the browser
  cache on (off on file://, or a `transformersCache` from
  `@hackbuild/weights` as the custom cache), wasm threads from the probe,
  the proxy worker off, the wasm cache off. The default loader is
  `pipeline(task, modelId, { device, dtype, progress_callback })`, with the
  task from `TJS_TASKS` or `rung.options.task`. A package registers its own
  loader for a capability with `tjs.loader("vision.caption", fn)`.
- `ortProvider` reads graph bytes once through `store.once`, then builds a
  session per rung from the same bytes. Files that do not end in `.onnx`
  are passed as `externalData`. The value is `{ ort, sessions, session,
  rung, dispose }`.

## Ladders

    LADDERS.depth()          // webgpu fp16, webgpu fp32, wasm q8, wasm fp32 (as earlier builds did)
    LADDERS.perceptionCpu()  // wasm q8, wasm fp32, then webgpu (as earlier builds did)
    LADDERS.whisperTurbo()   // fp16 encoder plus q4 decoder, fp32 encoder, q8 on wasm (as earlier builds did)
    LADDERS.smolvlm()        // per sub graph dtypes, q4 retry in a fresh heap (an earlier vision build)
    LADDERS.ort()            // webgpu at basic, all, disabled, then wasm (as earlier builds did)
    tjsLadder({ webgpu: ["q4f16"], wasm: ["q8"] })

The walk and error names (`walkLadder`, `classifyError`) are the models
package's and are re-exported here.

## Failure copy

`humanError(e)` turns a load or run failure into one lowercase line that
names it and the working alternative ("the model ran out of memory.
unload another model, or pick the next row down."), through
`classifyError` and the weight store's error codes. `humanError("mic",
e)` and `humanError("camera", e)` read a device failure by its
DOMException name: denied, not found, in use. An unknown failure keeps
its message. transformers.js file progress now also reaches
`hub.onLoad` listeners as fetch steps.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/devices` passes 10 tests under
  Node 22.18.0 with fake runtimes: ladder orders, per sub graph dtypes,
  progress merging with and without totals, the transformers.js provider
  walking fp16 to fp32 through the hub with the f16 failure named,
  runtime configuration (threads, proxy, caches, file://), loader
  routing, the ort provider fetching a graph once while the ladder moves
  from basic to all after a `transformer_memcpy` failure, external data,
  graph file naming, and the memoized runtime loader retrying after a
  failed import.

- 2026-11-24: each mic and camera error name, each runtime kind, the
  storage codes, an unknown message, and transformers.js progress
  reaching `hub.onLoad` (`test/human.test.ts`).

### Not verified by anything

- The error names each browser really throws for a denied or busy mic
  and camera.

- The pinned CDN URLs against the real transformers.js 4.3.2 and
  onnxruntime-web 1.27.0 packages, in any browser.
- `externalData` and `wasmPaths` against a real onnxruntime-web session.
- `freshHeap` rungs: transformers.js offers no fresh heap, so the rung
  only retries; a true fresh heap needs a new worker (not built).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 6,810 bytes | 7,150 bytes |
| `dist/single/index.iife.js` (single file build) | 36,301 bytes | 38,116 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

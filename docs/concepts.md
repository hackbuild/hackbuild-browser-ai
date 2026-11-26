# concepts

The ideas every package in this repository shares. Read them once; each package README then only covers what is its own.

## you pass the runtime in

A model runtime (WebLLM, wllama, transformers.js, onnxruntime-web, kokoro-js, MediaPipe) is an optional peer, and no file in a package imports one. You load the runtime and hand the module to the package. `importEsm` from @hackbuild/ai-env loads a pinned URL, works from file://, and can check a SHA-256 before the code runs; `runtimeLoader` from @hackbuild/devices wraps the same call so a package loads the runtime only when it first needs it. A page that uses only a remote endpoint therefore never downloads a local runtime.

Runtimes sit behind subpath exports, such as `@hackbuild/chat/webllm`. Each README has a table of the subpaths, the runtime each one drives, and the version it is pinned to.

## weights load through the weight store

No package bundles weights, and none are hosted with these pages. A model loads from its upstream host, usually Hugging Face, when you ask for it. `openWeightStore()` from @hackbuild/weights keeps the files in OPFS, Cache Storage or IndexedDB parts, resumes a broken download with range requests, checks a SHA-256 when one is known, and keeps the weight licence with the file. Every model reference in code, docs and examples names its weight licence, and a page states it before the download starts.

## records and ladders

@hackbuild/models describes each model as a record: what it provides, where it loads from, its size with a label, its licence, and a ladder of device and dtype rungs from best to safest, such as webgpu fp16, then webgpu fp32, then wasm q8. `ladderFor(record, env)` drops the rungs a device cannot run, and the hub tries the rest in order under a memory budget. The capability probe in @hackbuild/ai-env says what the device has: a WebGPU adapter, `shader-f16`, OPFS, the Prompt API.

## builds that run from file://

Every package has a single file build in `dist/single/`: an ES module for pages served over http, and a classic script (`index.iife.js`) that sets a `Hackbuild<Pkg>` global. Chrome refuses module scripts, module workers and dynamic imports of file URLs on a page opened from disk, so a page saved to disk uses the classic script. Workers start as classic scripts from a Blob. The Rust wasm cores in this repository use SIMD128 and no threads, so they need no cross origin isolation. A runtime's own wasm (onnxruntime-web, transformers.js) gets its thread count from the probe through @hackbuild/devices: more than one thread only on a cross origin isolated page, one thread otherwise.

## errors name the failure

A thrown message says what failed in lowercase plain words and what to do, such as `no webgpu adapter. models run on wasm.` `humanError` from @hackbuild/devices turns a runtime's raw error into a line you can show. A control a device cannot run is disabled with the reason beside it, never offered and then failed.

## numbers carry a label

Every number in these docs says where it came from: measured on a named machine, computed from other numbers, vendor (stated by the model's publisher), inferred, or unknown. Sizes in a model record carry `sizeSource` for the same reason.

## randomness is injected

Anything random takes an `Rng = () => number` option, so the same seed gives the same output in tests, in Node and in the browser. Library code never calls `Math.random`.

# @hackbuild/models

Model registry records with device and dtype ladders, quirks and weight
licences, and a hub that routes a capability request to a record, loads it
under a memory budget, and runs GPU work one job at a time. Code MIT; this
README CC-BY-4.0 with the code samples also MIT. No weights ship here.

    npm install @hackbuild/models

## Records

    {
      id: "depth-anything-v2-small",
      provides: ["depth"],
      provider: "tjs",                       // webllm | wllama | tjs | ort | prompt-api | remote | mediapipe | tfjs | stub
      source: { modelId: "onnx-community/depth-anything-v2-small" },
      sizeMB: 100, sizeSource: "inferred",
      ladder: [{ device: "webgpu", dtype: "fp16" }, { device: "webgpu", dtype: "fp32" },
               { device: "wasm", dtype: "q8" }, { device: "wasm", dtype: "fp32" }],
      licence: "Apache-2.0", commercial: true, place: "cpu-worker",
    }

- `licence` is required; `createRegistry` refuses a record without one.
- `ladderFor(record, env)` drops rungs the device cannot run: a webgpu rung
  without an adapter, an f16 dtype (also inside per sub graph dtypes)
  without `shader-f16`, a Prompt API rung without `LanguageModel`.
- `ortLadder()` is the onnxruntime-web walk from the transcription build:
  webgpu plus wasm at optimization basic, all, disabled, then wasm alone.
  Pair it with `store.once(ref)` from `@hackbuild/weights` so every attempt
  reads one download.
- `walkLadder` tries rungs in order, names each failure with
  `classifyError` (runtime mismatch, out of memory, f16, device lost,
  unsupported op, network, abort) and stops on network and abort.
- `quirks` carries what app code used to hard code: no system role and
  strict alternation (Gemma 3), think tags, repetition penalty, native
  tools (WebLLM Hermes), `<tool_call>` tags (Hermes, Qwen), warnings such
  as Kokoro's q8 on webgpu.
- `CATALOG` holds 12 starter records for chat, embed, depth, transcribe,
  speak and stems. Every size there is inferred from the builds or from
  parameter count; licences are the model cards' as of 2026-11-22
  (Apache-2.0, MIT, Gemma Terms of Use, Llama 3.2 Community License, and
  the Chrome built in AI terms for the Prompt API model).

## Hub

    import { createHub, createRegistry, CATALOG } from "@hackbuild/models";

    const hub = createHub({ registry: createRegistry(CATALOG), env: await probe(), budgetMB: 4000 });
    hub.provide("tjs", async ({ record, rung }) => pipeline(task, record.source.modelId, { device: rung.device, dtype: rung.dtype }));
    const depth = await hub.use("depth");                 // routed, ladder walked, cached
    const map = await hub.run(depth, (pipe) => pipe(image)); // webgpu models take the gpu lock
    hub.release(depth);

- `use` routes by capability, device, size class and the budget left by
  busy models, then walks the ladder through the provider's factory. Loads
  on webgpu rungs take the `gpu` lock.
- Idle models (released to zero refs) are disposed oldest first when a new
  load would pass `budgetMB`; `dispose()` or `unload()` on the value is
  called.
- `exclusive(resource, fn, { priority })`: one job per resource, higher
  priority first, FIFO within a priority, waiters can abort.
- `chain(name)`: a serial queue for one capability.
- Scheduling around rendering (HACKLE: a webgpu model shares the GPU with
  the scene and stutters it, and JS profiling does not show it):
  `run(l, fn, { minIntervalMs, idleOnly, frameBudgetMs, maxDeferMs, when })`
  waits for the gap since the model's last start, an idle callback, and
  frames under budget (fed by `hub.reportFrame(ms)` from the render loop,
  mean of the last 30); `when: "skip"` rejects with code `skipped`
  instead of waiting, and also when a run of that model is in flight.
  `busy(id?)`, `onBusy(fn)` and `status()[i].busy` drive a busy
  indicator; `use(cap, { size, maxMB })` picks a smaller model.

## Stubs

    const hub = createHub({ stub: new URLSearchParams(location.search).has("stub") });
    hub.provide("stub", stubFactory({ chat: () => echoChat, depth: () => rampDepth }));

In stub mode every `use(capability)` resolves to `stubRecord(capability)`
with no weights. Each capability package ships its own stub builder, so an
app runs headless with `?stub` and tests need no download.

## How later packages attach

A capability package (vision, transcribe, stems, notes, imagegen, speak,
listen, embed, biosignal) adds records with `registry.add`, registers a
factory per provider with `hub.provide`, exports a stub builder, and calls
`hub.run` for inference. Nothing in this package changes for that.

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

### Not verified by anything

- Any record against its real runtime and weights. Not run: whether each
  catalog ladder loads in Chrome, Safari or Firefox; the catalog sizes
  (inferred, not measured downloads); the error patterns against current
  WebLLM 0.2.89, onnxruntime-web 1.31 and transformers.js 4.3.2 messages.

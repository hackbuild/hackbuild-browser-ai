# @hackbuild/stems

Split a song into drums, bass, other and vocals with htdemucs, in the tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/stems)](https://www.npmjs.com/package/@hackbuild/stems) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 2.4 kB measured](https://img.shields.io/badge/gzip-2.4%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no model run of this package has been verified in a real browser yet.

## What it does

- Registers two htdemucs tiers with the models hub; onnxruntime-web runs them through `@hackbuild/devices`.
- Cuts a 44.1 kHz stereo mix into segments and joins the model output by its own overlap add with linear crossfades.
- Reports progress per segment and the realtime factor.
- Ships a stub separator for tests and pages without weights.

## Install

```sh
npm install @hackbuild/stems @hackbuild/media @hackbuild/weights
```

It depends on `@hackbuild/models`, `@hackbuild/devices` and `@hackbuild/audio-dsp`. It has no peer dependencies: onnxruntime-web 1.27.0 loads at runtime through `loadOrt` in `@hackbuild/devices`, and you open the weight store with `@hackbuild/weights`.

## Quick start

```ts
import { loadOrt, ortProvider } from "@hackbuild/devices";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { attachStems, separate } from "@hackbuild/stems";
import { openWeightStore } from "@hackbuild/weights";

// a hub with the htdemucs records (weights MIT, stated from the record); onnxruntime-web loads at runtime, weights go through the store
const hub = createHub();
attachStems(hub);
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore() }).factory);

// a picked song at 44.1 kHz stereo, separated on the fast tier with progress per segment
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const { channels } = await decodeAudio(input.files![0]!, 44100);
  const left = channels[0]!;
  const { stems, rtf } = await separate(hub, left, channels[1] ?? left, { model: "htdemucs-fast", onProgress: (p) => console.log(`segment ${p.done} of ${p.total}`) });
  console.log(`vocals ${stems.vocals.left.length} samples, ${rtf.toFixed(2)}x realtime`);
};
```

## Live example

The package page is at [hackbuild-browser-ai/stems](https://hackbuild.github.io/hackbuild-browser-ai/stems/).

## Concepts

### overlap is the speed control

Every tier is the same network. The fast tier is the fp16 weights export at 10 percent overlap, the slow tier the fp32 export at 40 percent. Pass `overlap` (0 to 0.6) to override the record's; `overlapOf` reads it from the record.

### segments and overlap add

Segments are 343980 samples (7.8 s at 44.1 kHz). Crossfades are linear over min(S minus stride, S / 4), with weights floored at 1e-4. Resample to 44.1 kHz first when the source rate differs. `rtf` is audio seconds per wall second.

### the ort ladder

The graph is fetched once and the ort ladder walks webgpu basic, all, disabled, then wasm (`@hackbuild/devices`). Pass `schedule` to keep a rendering page smooth (see the models hub).

### waveform only exports

`ortSeparator` reads the time domain output and refuses exports that also want a spectrogram input (two inputs): this package does not compute the htdemucs STFT branch.

## API overview

| export | what it does |
|---|---|
| [`attachStems`](../../docs/api/stems/README.md#attachstems) | add the htdemucs records to a models hub |
| [`separate`](../../docs/api/stems/README.md#separate) | separate a 44.1 kHz stereo mix into four stems |
| [`STEMS_RECORDS`](../../docs/api/stems/README.md#stems_records) | the fast and slow htdemucs records |
| [`TRACKS`](../../docs/api/stems/README.md#tracks) | drums, bass, other, vocals |
| [`ortSeparator`](../../docs/api/stems/README.md#ortseparator) | wrap an ort model as a separator |
| [`overlapOf`](../../docs/api/stems/README.md#overlapof) | the overlap a record was tuned for |
| [`stemsStubs`](../../docs/api/stems/README.md#stemsstubs) | a stub separator for tests |
| [`SEGMENT`](../../docs/api/stems/README.md#segment) | samples per model segment |

The full reference is in [docs/api/stems](../../docs/api/stems/README.md).

## Models and weights

| model | id | size (vendor) | licence | loads from |
|---|---|---|---|---|
| htdemucs, StemSplitio `htdemucs_fp16weights.onnx`, overlap 0.10 | `htdemucs-fast` | 166 MB | MIT (htdemucs); the export's own terms not checked | Hugging Face `StemSplitio/htdemucs-onnx` at a pinned revision |
| htdemucs, StemSplitio `htdemucs.onnx`, overlap 0.40 | `htdemucs-slow` | 316 MB | MIT (htdemucs); the export's own terms not checked | Hugging Face `StemSplitio/htdemucs-onnx` at a pinned revision |

No weights ship in this package. The ort provider fetches them into the `@hackbuild/weights` store, which caches them for the next visit, and the models hub prints the weight licence on first load.

## Browser support

| feature | WebGPU | WASM | threads | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|---|---|
| htdemucs on onnxruntime-web | first rungs | last rung | unknown | yes (inferred) | unknown | unknown | unknown (166 MB and up) |
| overlap add, stub | not used | not used | no | yes | yes | yes | yes |

Without WebGPU the ladder falls to wasm. A worker path for wasm is not built; run the call inside a worker with the single file build.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `this htdemucs export needs a spectrogram input; use a waveform only export (StemSplitio htdemucs-onnx)` | the graph has two inputs | use the StemSplitio waveform only export |
| `this model has no time domain output tensor` | no output of shape [1, tracks, 2, samples] | use the StemSplitio export |
| `this model returns N stems, the pipeline expects 4` | the graph is not a four stem model | use a four stem htdemucs export |
| `separation stopped` (AbortError) | the `signal` you passed aborted | expected; start again when you want stems |
| `no factory for provider ort; call hub.provide("ort", ...)` | the hub has no ort factory | call `hub.provide("ort", ortProvider(...).factory)` |

## Works with

- [@hackbuild/media](../media/README.md) decodes a file to the 44.1 kHz stereo `separate` takes.
- [@hackbuild/audio-dsp](../audio-dsp/README.md) plans the segments, runs the overlap add and resamples other rates.
- [@hackbuild/devices](../devices/README.md) provides the ort factory and ladder.
- [@hackbuild/notes](../notes/README.md) and [@hackbuild/transcribe](../transcribe/README.md) take a stem after separation.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. The htdemucs weights are MIT; the StemSplitio export's own terms are not checked. They are not part of this package.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/stems` under Node 22.18.0 with fakes: tiers and licences, stub separation whose stems sum back to the mix across segment seams, an ort record through a fake session picking the time domain output, and the refusal of two input exports | passes 3 tests |

### Not verified by anything

- htdemucs in a browser on webgpu or wasm; separation quality; realtime
  factors.
- A medium tier on the demucs-web embedded graph with a spectrogram
  input: not built, since its STFT branch is not written here.
- A worker path for wasm: not built; run the call inside a worker with
  the single file build.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 2,369 bytes | 2,487 bytes |
| `dist/single/index.iife.js` (single file build) | 30,452 bytes | 31,974 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

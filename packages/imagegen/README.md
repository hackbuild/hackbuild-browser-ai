# @hackbuild/imagegen

Generate an image from a prompt in your tab with SD-Turbo, SD 1.5 or SDXL-Turbo on onnxruntime-web WebGPU, seeded so the same seed gives the same start.

[![npm](https://img.shields.io/npm/v/@hackbuild/imagegen)](https://www.npmjs.com/package/@hackbuild/imagegen) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 8.3 kB measured](https://img.shields.io/badge/gzip-8.3%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no model run of this package has been verified in a real browser yet.

## What it does

- Runs the CLIP text encoder, a seeded Euler loop over the UNet and the VAE decoder, and returns RGBA ready for ImageData.
- Runs SDXL-Turbo's two text encoders with pooled embeddings and time ids behind the same interface.
- Loads SD-Turbo, SD 1.5 or SDXL-Turbo through the models hub, with the three graphs cached in the weight store.
- Gives each model a form (steps, guidance, negative prompt, sizes) and clamps requests to it.
- Runs every graph call under the hub's gpu lock and frame budget, so it shares the GPU with chat or vision models.

## Install

```sh
npm install @hackbuild/imagegen @hackbuild/ai-env @hackbuild/devices @hackbuild/weights
```

It depends on [@hackbuild/models](../models/README.md). The hub path in the quick start also needs [@hackbuild/ai-env](../ai-env/README.md) for `probe`, [@hackbuild/devices](../devices/README.md) for the ort provider and [@hackbuild/weights](../weights/README.md) for the store; the line above installs them. No package is bundled from these runtimes; they load at run time:

| subpath | runtime | pin |
|---|---|---|
| `.` (graphs) | onnxruntime-web, through `loadOrt` from @hackbuild/devices | 1.27.0 |
| `.` (tokenizer) | @huggingface/transformers, through `loadTransformers` from @hackbuild/devices | 4.3.2 |

## Quick start

```ts
import { probe } from "@hackbuild/ai-env";
import { loadOrt, loadTransformers, ortProvider } from "@hackbuild/devices";
import { attachImagegen, loadImagegen, type ClipTokenize } from "@hackbuild/imagegen";
import { createHub } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// a hub with the ort provider: onnxruntime-web loads from a pinned url, the weight store caches the graphs
const hub = createHub({ env: await probe() });
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore() }).factory);
attachImagegen(hub);

// sd-turbo; gen.record.licence names its weight licence (Stability AI, no commercial use)
const gen = await loadImagegen(hub, { id: "sd-turbo" });

// the CLIP tokenizer (weights MIT) through transformers.js, 77 ids
type Tok = { from_pretrained(id: string): Promise<(p: string, o: object) => Promise<{ input_ids: { data: ArrayLike<number> } }>> };
const clip = await ((await loadTransformers()()).AutoTokenizer as Tok).from_pretrained(gen.form.tokenizer);
const tokenize: ClipTokenize = async (p) => (await clip(p, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data;
const img = await gen.generate(tokenize, { prompt: "a ceramic mug on a wooden shelf", seed: 42 }); // seeded, on webgpu
document.querySelector("canvas")!.getContext("2d")!.putImageData(new ImageData(img.rgba as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
```

## Live example

The generate tool in the suite runs this package: [hackbuild-suite generate](https://hackbuild.github.io/hackbuild-suite/#/image/generate). The demo page runs SD-Turbo on onnxruntime-web WebGPU with a seeded Euler loop, with the download on request: [hackbuild-browser-ai/imagegen](https://hackbuild.github.io/hackbuild-browser-ai/imagegen/).

## Concepts

### you bring the runtime, the sessions and a tokenizer

`generate(ort, sessions, tokenize, options)` takes the onnxruntime-web module, the three sessions and a CLIP tokenizer. Build the sessions yourself from your own bytes, or load them through the hub. The tokenizer that fits is transformers.js `AutoTokenizer` for `Xenova/clip-vit-base-patch16` (CLIP weights MIT), padded to 77 ids.

```ts
import { generate } from "@hackbuild/imagegen";

// sessions from your own bytes (the weights store), webgpu execution provider
const sessions = {
  textEncoder: await ort.InferenceSession.create(te, { executionProviders: ["webgpu"] }),
  unet: await ort.InferenceSession.create(unet, { executionProviders: ["webgpu"] }),
  vaeDecoder: await ort.InferenceSession.create(vae, { executionProviders: ["webgpu"] }),
};
const img = await generate(ort, sessions, tokenize, {
  prompt: "a ceramic mug on a wooden shelf",
  steps: 1,
  seed: 42,
  run: (fn) => hub.exclusive("gpu", fn), // share the gpu with a chat or vision model
});
ctx2d.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);
```

### through the models hub

Register an ort provider once per page (`ortProvider` from @hackbuild/devices), call `attachImagegen`, then `loadImagegen` with a record id or the `imagegen` capability. The three graphs come through the shared weight store, once, and are keyed by their folder (`text_encoder`, `unet`, `vae_decoder`), since all three files are named `model.onnx`. Every graph call runs under `hub.run`, so the gpu lock and frame budget apply. A record without a form (the stub) gets SD-Turbo's. In stub mode, register `stubFactory({ imagegen: () => stubImagegenModel() })` for a grey image with no weights.

```ts
const rec = IMAGEGEN_RECORDS[1];        // sd-1.5
button.textContent = loadLabel(rec);    // "load stable diffusion 1.5, about 2.0 gb (vendor)"
const gen = await loadImagegen(hub, { id: rec.id });
const img = await gen.generate(tokenize, { prompt, negative, seed, signal });
```

### each model has a form

Each record carries a `form`, the fields a model select reshapes the form to. `applyForm` fills the defaults, clamps steps and guidance, drops fields the model does not take, and refuses a size its graphs do not accept with a `FormError` whose message is the copy. `loadLabel(record)` names the size and its source for the load button.

| record | steps (min, max, default) | guidance | negative prompt | sizes | spacing |
|---|---|---|---|---|---|
| `sd-turbo` | 1, 4, 2 | none | no | 512 | trailing |
| `sd-1.5` | 5, 40, 22 | 1 to 12, 7.5 | yes | 512 | leading, offset 1 |
| `sdxl-turbo`, in `IMAGEGEN_PICKER_RECORDS` | 1, 4, 1 | none | no | 512 | trailing |

SDXL-Turbo has two text encoders and the pipeline here runs one, so it is listed for pickers and not registered.

### the scheduler

Written from the published diffusers description: 1000 scaled linear betas from 0.00085 to 0.012, sigma = sqrt((1 - alphaBar) / alphaBar), trailing spacing (1 step is 999; 4 steps are 999, 749, 499, 249), UNet input divided by sqrt(sigma^2 + 1), and an Euler step on the predicted noise. Leading spacing (SD 1.5) is 1000 // steps apart plus 1, and its first noise is scaled by sqrt(sigma^2 + 1), as diffusers does. The scheduler is a few thousand multiply adds per step, so it stays in TypeScript and no Rust crate was written.

### guidance

Above 1 the UNet runs twice a step, on the prompt and on the negative (the empty prompt when absent), one sample per call so exports fixed at batch 1 still run. The noise is uncond + scale * (cond - uncond).

### seeds and noise

Noise is mulberry32 seeded, through Box-Muller to a normal; pass `rng` to replace it. The same seed gives the same initial latent bit for bit, and the same image on the same runtime.

### graph names and sizes

The text encoder maps `input_ids` to `last_hidden_state`; the UNet maps `sample`, `timestep` (int64) and `encoder_hidden_states` to `out_sample`; the VAE decoder maps `latent_sample` to `sample`. The latent is divided by `VAE_SCALE` (0.18215) before decoding. Output sides are multiples of 8; the default is 512.

### sdxl-turbo

`generateXl(ort, sessions, tokenize, options)` runs SDXL-Turbo from the published SDXL description: both CLIP encoders on the same ids (the second padded with 0 after the end token), their penultimate hidden states joined to 2048 channels, the second encoder's pooled `text_embeds`, six `time_ids` (original size, crop top left, target size), the Euler loop on trailing timesteps, and the latent divided by 0.13025 before the VAE. `XL_IO` holds the default graph names (`hidden_states.11`, `hidden_states.31`, `text_embeds`) and dtypes; pass `xl: { io: "float16" }` for an export with fp16 inputs and outputs, and `toHalf` and `fromHalf` convert at the graph edge. The `sdxl-turbo` record's form sets `pipeline: "sdxl"`, so `loadImagegen(hub, { id: "sdxl-turbo" })` adds the picker record, loads its four graphs and returns the same `ImageGenerator` as SD-Turbo.

```ts
const gen = await loadImagegen(hub, { id: "sdxl-turbo" }); // four graphs, same interface
const img = await gen.generate(tokenize, { prompt, seed });
```

## API overview

| export | what it does |
|---|---|
| [`generate`](../../docs/api/imagegen/README.md#generate) | text to image with sessions you built: encode, Euler loop, decode |
| [`loadImagegen`](../../docs/api/imagegen/README.md#loadimagegen) | load an image model through the models hub |
| [`attachImagegen`](../../docs/api/imagegen/README.md#attachimagegen) | register the image records on a hub |
| [`ImageGenerator`](../../docs/api/imagegen/README.md#imagegenerator) | a loaded model: `generate` with its form applied, `release` |
| [`IMAGEGEN_RECORDS`](../../docs/api/imagegen/README.md#imagegen_records) | SD-Turbo and SD 1.5 records with licence, size and form |
| [`IMAGEGEN_PICKER_RECORDS`](../../docs/api/imagegen/README.md#imagegen_picker_records) | SDXL-Turbo, listed for pickers and not registered |
| [`generateXl`](../../docs/api/imagegen/README.md#generatexl) | SDXL-Turbo text to image: two encoders, pooled embeddings, time ids |
| [`XL_IO`](../../docs/api/imagegen/README.md#xl_io) | the SDXL graph names and dtypes `generateXl` assumes |
| [`applyForm`](../../docs/api/imagegen/README.md#applyform) | fill a request's defaults and clamp it to the model's form |
| [`loadLabel`](../../docs/api/imagegen/README.md#loadlabel) | the load button text with the size and its source |
| [`formOf`](../../docs/api/imagegen/README.md#formof) | the form of a record |
| [`FormError`](../../docs/api/imagegen/README.md#formerror) | a request the form refuses; the message is the copy |
| [`stubImagegenModel`](../../docs/api/imagegen/README.md#stubimagegenmodel) | a weightless model that returns a grey image |
| [`eulerPlan`](../../docs/api/imagegen/README.md#eulerplan) | timesteps and sigmas for a step count and spacing |
| [`euler`](../../docs/api/imagegen/README.md#euler) | the Euler loop over a UNet call |
| [`sigmas`](../../docs/api/imagegen/README.md#sigmas) | sigma for each of the 1000 training timesteps |
| [`mulberry32`](../../docs/api/imagegen/README.md#mulberry32) | the seeded uniform generator |
| [`gaussian`](../../docs/api/imagegen/README.md#gaussian) | normal samples by Box-Muller |

The full reference is in [docs/api/imagegen](../../docs/api/imagegen/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| SD-Turbo | `schmuell/sd-turbo-ort-web` | 2397 MiB (vendor) | Stability AI Non-Commercial Research Community License, no commercial use | Hugging Face hub |
| Stable Diffusion 1.5 | `microsoft/stable-diffusion-v1.5-webnn` | 1969 MiB (vendor) | CreativeML OpenRAIL-M, use restrictions in its attachment A | Hugging Face hub |
| SDXL-Turbo (picker only, `generateXl`) | `webnn/sdxl-turbo`, the four `onnx/*_q4f16.onnx` graphs | 2548 MiB (vendor) | Stability AI Community License (named in the card text) | Hugging Face hub |
| CLIP tokenizer | `Xenova/clip-vit-base-patch16` | unknown | MIT | Hugging Face hub, through transformers.js |

Sizes sum the Hugging Face file listing (no download). No weights ship in the package; they download when you ask, and @hackbuild/weights caches them. The default ONNX export, `schmuell/sd-turbo-ort-web`, carries the Stability AI Non-Commercial Research Community License, so it allows no commercial use. Upstream `stabilityai/sd-turbo` moved to the Stability AI Community License in July 2024; to use that licence, point the record at an export made from the current upstream weights and check its licence before use.

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| SD-Turbo, SD 1.5 | WebGPU | yes (inferred) | unknown | unknown | usually cannot hold the weights (inferred) |
| WASM | none | no wasm path | no wasm path | no wasm path | no wasm path |
| threads | none | not used | not used | not used | not used |

The records list only a WebGPU rung; with no WebGPU adapter there is no fallback, and the demo page disables the load button and says so. Phones usually cannot hold the weights.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `size must be a multiple of 8` | `size` is not divisible by 8 | pass 512, or another multiple of 8 the graphs accept |
| `this model makes 512 pixel images, not N.` (`FormError`) | the size is not in the model's form | use a size from `gen.form.sizes`; show the message as is |
| `the loaded model has no unet graph; it has ...` | the record's files did not load as three graphs | check the record's `source.files` paths |
| `image generation stopped` (`AbortError`) | the signal was aborted | expected on cancel; catch it by name |

## Works with

- [@hackbuild/models](../models/README.md) is the hub that loads the graphs and holds the gpu lock.
- [@hackbuild/devices](../devices/README.md) gives `ortProvider`, `loadOrt` and `loadTransformers`, the runtimes this package uses.
- [@hackbuild/weights](../weights/README.md) downloads and caches the three graphs.
- [@hackbuild/depth-mesh](../depth-mesh/README.md) can turn a generated image into a relief solid.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weight licences: SD-Turbo export, Stability AI Non-Commercial Research Community License; SD 1.5, CreativeML OpenRAIL-M; SDXL-Turbo, Stability AI Community License; CLIP tokenizer, MIT.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/imagegen` in Node 22.18.0: sigmas, trailing timesteps, seeded noise statistics, an Euler step that removes exactly predicted noise, id padding, RGBA conversion, the graph call order and shapes against fake sessions, seed reproducibility and abort | passes 10 tests; sigma at timestep 999 is 14.6146 (computed) |
| 2026-11-24 | `test/hub.test.ts`: both forms, the load label, applyForm clamps and refusals, leading timesteps, the guidance mix against a hand computed latent, a load of sd-1.5 through the devices ort provider and a memory weight store with fake sessions, the stub mode, and a refusal when the graphs are missing | passes 8 tests; three fetches, graphs keyed by folder, 13 hub runs for 5 steps |

| 2026-11-25 | `test/xl.test.ts`: half float round trip, the second tokenizer's zero padding, the joined 2048 style hidden state, pooled embeds and time ids on every UNet call, the 0.13025 VAE scale, fp16 edges and fp16 timestep, guidance on the negative, a missing output named, and `sdxl-turbo` loaded by id through the hub on fake sessions | passes 5 tests |

### Not verified by anything

- SDXL-Turbo on the real `webnn/sdxl-turbo` export: the graph names
  (`hidden_states.11`, `hidden_states.31`, `text_embeds`), the fp16
  timestep and int32 ids are inferred from its README and the SDXL
  description, not read from the graphs. The picker row says not run yet
  until a browser run checks them.

- SD-Turbo on real onnxruntime-web webgpu: graph names, image quality,
  speed and memory.
- The repo file paths in both records, which are inferred, and whether
  `microsoft/stable-diffusion-v1.5-webnn` exists with those paths, takes
  float32 inputs and runs on onnxruntime-web webgpu. SD 1.5 image quality
  with this sampler.
- A wasm path: none is written.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 8,273 bytes | 8,686 bytes |
| `dist/single/index.iife.js` (single file build) | 7,985 bytes | 8,384 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

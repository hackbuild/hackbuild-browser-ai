# @hackbuild/imagegen

Text to image in a tab with SD-Turbo on onnxruntime-web: CLIP ids into the
text encoder, a seeded Euler loop over the UNet on trailing timesteps, and
the VAE decoder to RGBA. Code MIT; this README CC-BY-4.0 with the code
samples also MIT. No weights ship here. The default ONNX export,
`schmuell/sd-turbo-ort-web`, carries the Stability AI Non-Commercial
Research Community License, so it allows no commercial use. Upstream
`stabilityai/sd-turbo` moved to the Stability AI Community License in July
2024; to use that licence, point the record at an export made from the
current upstream weights and check its licence before use.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/imagegen

## Use

    import { generate, IMAGEGEN_RECORDS } from "@hackbuild/imagegen";

    // sessions from your own bytes (the weights store), webgpu execution provider
    const sessions = {
      textEncoder: await ort.InferenceSession.create(te, { executionProviders: ["webgpu"] }),
      unet: await ort.InferenceSession.create(unet, { executionProviders: ["webgpu"] }),
      vaeDecoder: await ort.InferenceSession.create(vae, { executionProviders: ["webgpu"] }),
    };
    const clip = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch16"); // CLIP tokenizer, MIT
    const tokenize = async (p) => (await clip(p, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data;

    const img = await generate(ort, sessions, tokenize, {
      prompt: "a ceramic mug on a wooden shelf",
      steps: 1,
      seed: 42,
      run: (fn) => hub.exclusive("gpu", fn), // share the gpu with a chat or vision model
    });
    ctx2d.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);

## Through the models hub

    import { ortProvider, loadOrt } from "@hackbuild/devices";
    import { attachImagegen, loadImagegen, loadLabel, IMAGEGEN_RECORDS } from "@hackbuild/imagegen";

    hub.provide("ort", ortProvider({ runtime: () => loadOrt(), store }).factory); // once per page
    attachImagegen(hub);
    const rec = IMAGEGEN_RECORDS[1];        // sd-1.5
    button.textContent = loadLabel(rec);    // "load stable diffusion 1.5, about 2.0 gb (inferred)"
    const gen = await loadImagegen(hub, { id: rec.id });
    const img = await gen.generate(tokenize, { prompt, negative, seed, signal });

The three graphs come through the shared weight store, once, and are
keyed by their folder (`text_encoder`, `unet`, `vae_decoder`), since all
three files are named `model.onnx`. Every graph call runs under
`hub.run`, so the gpu lock and frame budget apply. In stub mode, register
`stubFactory({ imagegen: () => stubImagegenModel() })` for a grey image
with no weights.

Each record carries a `form`, the fields a model select reshapes the
form to, after an earlier image generation bench's model table:

| record | steps (min, max, default) | guidance | negative prompt | sizes | spacing | size |
|---|---|---|---|---|---|---|
| `sd-turbo` | 1, 4, 2 | none | no | 512 | trailing | 2.6 GB (inferred) |
| `sd-1.5` | 5, 40, 22 | 1 to 12, 7.5 | yes | 512 | leading, offset 1 | 2.0 GB (inferred) |

`applyForm` fills the defaults, clamps steps and guidance, drops fields
the model does not take, and refuses a size its graphs do not accept with
a `FormError` whose message is the copy. `loadLabel(record)` names the
size and its source for the load button. SD 1.5 weights carry CreativeML
OpenRAIL-M, with use restrictions in its attachment A.

## Behaviour

- Scheduler, written from the published diffusers description: 1000
  scaled linear betas from 0.00085 to 0.012, sigma = sqrt((1 - alphaBar)
  / alphaBar), trailing spacing (1 step is 999; 4 steps are 999, 749,
  499, 249), UNet input divided by sqrt(sigma^2 + 1), Euler step on the
  predicted noise. sigma at 999 is 14.6146 (computed).
- Guidance: above 1 the UNet runs twice a step, on the prompt and on the
  negative (the empty prompt when absent), one sample per call so exports
  fixed at batch 1 still run, and the noise is uncond + scale * (cond -
  uncond). Leading spacing (SD 1.5) is 1000 // steps apart plus 1, and
  its first noise is scaled by sqrt(sigma^2 + 1), as diffusers does.
- Noise: mulberry32 seeded, Box-Muller to a normal; pass `rng` to
  replace it. The same seed gives the same initial latent bit for bit.
- Graph names: `input_ids` to `last_hidden_state`; `sample`, `timestep`
  (int64) and `encoder_hidden_states` to `out_sample`; `latent_sample` to
  `sample`, as in an earlier build. Output sides are multiples of 8;
  the default is 512.
- Every graph call goes through `run`, so the models hub's gpu lock and
  frame budget apply.

The family plan lists a Rust half for this package; the scheduler is a
few thousand multiply adds per step, so it stays in TypeScript and no
crate was written.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/imagegen` passes, 10 tests, in
  Node 22.18.0: sigmas, trailing timesteps, seeded noise statistics, an
  Euler step that removes exactly predicted noise, id padding, RGBA
  conversion, the graph call order and shapes against fake sessions,
  seed reproducibility and abort.

- 2026-11-24: `test/hub.test.ts`, 8 tests: both forms, the load label,
  applyForm clamps and refusals, leading timesteps, the guidance mix
  against a hand computed latent, a load of sd-1.5 through the devices
  ort provider and a memory weight store with fake sessions (three
  fetches, graphs keyed by folder, 13 hub runs for 5 steps), the stub
  mode, and a refusal when the graphs are missing.

### Not verified by anything

- SD-Turbo on real onnxruntime-web webgpu: graph names, image quality,
  speed and memory.
- The repo file paths in both records (inferred), and whether
  `microsoft/stable-diffusion-v1.5-webnn` exists with those paths, takes
  float32 inputs and runs on onnxruntime-web webgpu. SD 1.5 image quality
  with this sampler.
- A wasm path; an earlier build had none.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,631 bytes | 5,912 bytes |
| `dist/single/index.iife.js` (single file build) | 5,276 bytes | 5,539 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

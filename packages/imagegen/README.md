# @hackbuild/imagegen

Text to image in a tab with SD-Turbo on onnxruntime-web: CLIP ids into the
text encoder, a seeded Euler loop over the UNet on trailing timesteps, and
the VAE decoder to RGBA. Code MIT; this README CC-BY-4.0 with the code
samples also MIT. No weights ship here; SD-Turbo weights are under the
Stability AI Community License per its model card, which you check before
use.

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

## Behaviour

- Scheduler, written from the published diffusers description: 1000
  scaled linear betas from 0.00085 to 0.012, sigma = sqrt((1 - alphaBar)
  / alphaBar), trailing spacing (1 step is 999; 4 steps are 999, 749,
  499, 249), UNet input divided by sqrt(sigma^2 + 1), Euler step on the
  predicted noise. sigma at 999 is 14.6146 (computed).
- Noise: mulberry32 seeded, Box-Muller to a normal; pass `rng` to
  replace it. The same seed gives the same initial latent bit for bit.
- Graph names: `input_ids` to `last_hidden_state`; `sample`, `timestep`
  (int64) and `encoder_hidden_states` to `out_sample`; `latent_sample` to
  `sample`, as in the source build. Output sides are multiples of 8;
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

### Not verified by anything

- SD-Turbo on real onnxruntime-web webgpu: graph names, image quality,
  speed and memory.
- The repo file paths in the record (inferred from the source build).
- A wasm path; the source build had none.

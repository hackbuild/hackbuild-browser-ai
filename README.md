# hackbuild-browser-ai

Run language, vision and speech models in a browser tab: one chat interface over local runtimes, a resumable weights cache, structured output for small models, memory, voice in and out, character cards and an agent loop.

Status, 2026-11-23: 23 packages and 5 Rust cores, all in `packages/` and `crates/`.
Nothing is published to npm.

| package | what | tests (counted 2026-11-23 on this machine; audio-dsp and transcribe include local fixture suites CI skips) |
|---|---|---|
| [@hackbuild/ai-env](packages/ai-env) | capability probe, file:// safe ESM import and worker ladder | 19 vitest |
| [@hackbuild/weights](packages/weights) | weight store over opfs, cache storage, indexeddb parts; resumable range downloads, sha-256, multi file repos | 23 vitest |
| [@hackbuild/models](packages/models) | registry records with device and dtype ladders, quirks and licences; hub with budget, gpu queue, run scheduling around rendering, busy state and stubs | 23 vitest |
| [@hackbuild/memory](packages/memory) | bm25 plus flat cosine with rrf in a rust wasm core (simd128), linear and organic scorers, decay, merge, indexeddb, budgeted context | 47 vitest, 15 cargo |
| [@hackbuild/chat](packages/chat) | one streaming interface over webllm, wllama, transformers.js, prompt api, openai compatible and anthropic endpoints | 33 vitest |
| [@hackbuild/structured](packages/structured) | constrained, prompt, native, tags and lines modes; schema sanitizer, loose fallback, json repair, guards, streaming tag parser | 27 vitest |
| [@hackbuild/devices](packages/devices) | rung builders and hub factories for onnxruntime-web and transformers.js, pinned runtime loading, progress merging | 11 vitest |
| [@hackbuild/audio-dsp](packages/audio-dsp) | rust wasm dsp core (simd128): biquads, noise floor, spectral subtraction, limiter, resampling, stft, onsets, tempo; gate, overlap add, txt, srt, vtt, lrc, wav, midi and zip writers | 19 vitest, 14 cargo |
| [@hackbuild/transcribe](packages/transcribe) | the quiet speech front end, silence reels with a source map, whisper and moonshine records, phantom filter, live segmenter, web speech adapter | 18 vitest |
| [@hackbuild/vision](packages/vision) | depth anything v2, mediapipe detection, segmentation and landmarks with fallback, optional external yolo, slimsam, smolvlm and lfm2-vl captions, loop, readback loop and cache | 19 vitest |
| [@hackbuild/depth-mesh](packages/depth-mesh) | rust wasm core (simd128): depth to point cloud, relief heightfield solids, surface nets, point to plane icp, silhouette carving; stl, obj and ply export | 6 vitest, 8 cargo |
| [@hackbuild/stems](packages/stems) | htdemucs tiers on onnxruntime-web, own overlap add, realtime factor | 3 vitest |
| [@hackbuild/notes](packages/notes) | basic pitch runner, note decoding and refinement, drum onsets, tempo and grid fit, midi out | 7 vitest |
| [@hackbuild/biosignal](packages/biosignal) | rust wasm core (simd128): eeg filters, shrunk covariances, riemannian tangent space classifier, cross validation folded by trial, model json | 4 vitest, 4 cargo |
| [@hackbuild/media](packages/media) | decode audio to a target rate, keyframes by scene change, canvas and stream recording | 3 vitest |
| [@hackbuild/embed](packages/embed) | model2vec static embedder in plain ts (wordpiece, safetensors) and a transformers.js minilm adapter, both with a fingerprint id; hub records | 16 vitest |
| [@hackbuild/speak](packages/speak) | engine chain over the bellows voice, pocket tts, kokoro (opt in, gpl phonemizer) and web speech; first clause streaming, gapless playback, one analyser, watchdog, offsets for cues and lip sync | 28 vitest |
| [@hackbuild/listen](packages/listen) | vad state machine with silero and energy sources, transcribe adapter with the phantom filter, barge in by threshold swap, mic helpers | 11 vitest |
| [@hackbuild/character](packages/character) | rust wasm core: character card v2 and v3 as json, png text chunks and charx, upgrade, downgrade, validate; a versioned profile extension for avatar, voice and actions with migration; native cli; macros and lorebook matching | 46 vitest, 27 cargo |
| [@hackbuild/act](packages/act) | speech timeline action grammar: mood, gesture and posture tags fire when the voice reaches them; per avatar vocabulary, strict resolver, gbnf and json schema, hybrid inference, replay | 23 vitest |
| [@hackbuild/agent](packages/agent) | perceive, recall, decide, act, reflect; forced json tool loop with fallbacks, guards, escalation, reflex brain, persistent goals, budgeted context, plan cache | 25 vitest |
| [@hackbuild/imagegen](packages/imagegen) | sd-turbo text encoder, unet and vae on onnxruntime-web with a seeded euler scheduler on trailing timesteps | 10 vitest |
| [@hackbuild/ai-elements](packages/ai-elements) | web components: model picker with disable reasons, download bar, status pills, chat panel, memory inspector; themed, registered by define() | 12 vitest |

Rust cores live in `crates/` (`crates/memory`: BM25 plus flat cosine
with reciprocal rank fusion; `crates/audio-dsp`: the speech and music
DSP kernels; `crates/depth-mesh`: depth and silhouettes to meshes;
`crates/biosignal`: the riemannian eeg classifier;
`crates/character`: character cards, png chunks, charx and the profile extension, with a native cli), each built natively and for wasm32 with SIMD128.
Every package entry also builds to self contained files with
`npm run bundle` (`packages/<pkg>/dist/single/`): `<entry>.js` (ESM, for
pages served over http) and `<entry>.iife.js` (a classic script setting
`Hackbuild<Pkg>`, for pages opened from file://, where Chrome 150 refuses
module scripts and dynamic imports of file URLs, measured 2026-11-23).

The checks that need a real browser or model, with the first pass results (2026-11-23), are
listed in [docs/browser-checks.md](docs/browser-checks.md).

## Examples

Ten pages over the 23 packages, one per thing to see or hear, published at
<https://hackbuild.github.io/hackbuild-browser-ai/>. Models download from
their upstream host (Hugging Face) when you press a button; each page
states the weight licence first, and no weights are hosted there. Build
them locally with `npm run build && npm run examples`, then
`npm run examples:check` opens each page in the system Chrome on the real
GPU and writes results and screenshots to `.local/` (results:
[docs/browser-checks.md](docs/browser-checks.md)).

## Develop

    source ~/.nvm/nvm.sh && nvm use
    npm ci
    npm test

`npm ci` sets `core.hooksPath` to `.githooks`. Rules for every change are
in RULES.md and CONTRIBUTING.md.

## What is verified, and what is not

Each package README carries its own dated list. In short:

### Verified on this machine

- Unit tests under Node 22.18.0 with fakes for every browser API and model
  runtime; no network, no model weights.

- 2026-11-23: the first real browser pass, Chrome 150 on an Apple M1 with
  WebGPU, through the example pages: 16 of the 56 browser checks pass, 1
  fails, 39 not run (counted). Numbers and reasons are in
  [docs/browser-checks.md](docs/browser-checks.md). The owner has not
  looked at the pages yet.

### Not verified by anything

- Safari and Firefox, file:// pages other than the iife single builds,
  microphone and camera paths, and most models over about 300 MB (Kokoro
  on webgpu fp32, about 326 MB inferred, is the one that ran).

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |

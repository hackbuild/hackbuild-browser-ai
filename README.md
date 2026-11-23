# hackbuild-browser-ai

Run language, vision and speech models in a browser tab: one chat interface over local runtimes, a resumable weights cache, structured output for small models, memory, voice in and out, character cards and an agent loop.

Status: phase A and phase P (perception and audio) in progress, 2026-11-22. Packages land in `packages/` as they pass
their tests; the table below grows with them. Nothing is published to npm.

| package | what | tests |
|---|---|---|
| [@hackbuild/ai-env](packages/ai-env) | capability probe, file:// safe ESM import and worker ladder | 16 vitest |
| [@hackbuild/weights](packages/weights) | weight store over opfs, cache storage, indexeddb parts; resumable range downloads, sha-256, multi file repos | 20 vitest |
| [@hackbuild/models](packages/models) | registry records with device and dtype ladders, quirks and licences; hub with budget, gpu queue and stubs | 17 vitest |
| [@hackbuild/memory](packages/memory) | bm25 plus flat cosine with rrf in a rust wasm core (simd128), linear and organic scorers, decay, merge, indexeddb, budgeted context | 44 vitest, 15 cargo |
| [@hackbuild/chat](packages/chat) | one streaming interface over webllm, wllama, transformers.js, prompt api, openai compatible and anthropic endpoints | 30 vitest |
| [@hackbuild/structured](packages/structured) | constrained, prompt, native, tags and lines modes; schema sanitizer, loose fallback, json repair, guards, streaming tag parser | 24 vitest |
| [@hackbuild/devices](packages/devices) | rung builders and hub factories for onnxruntime-web and transformers.js, pinned runtime loading, progress merging | 10 vitest |
| [@hackbuild/audio-dsp](packages/audio-dsp) | rust wasm dsp core (simd128): biquads, noise floor, spectral subtraction, limiter, resampling, stft, onsets, tempo; gate, overlap add, txt, srt, vtt, lrc, wav, midi and zip writers | 16 vitest, 11 cargo |
| [@hackbuild/transcribe](packages/transcribe) | scribe front end, silence reels with a source map, whisper and moonshine records, phantom filter, live segmenter, web speech adapter | 10 vitest |
| [@hackbuild/vision](packages/vision) | depth anything v2, mediapipe detection, segmentation and landmarks with fallback, optional external yolo, slimsam, smolvlm and lfm2-vl captions, loop and cache | 13 vitest |
| [@hackbuild/depth-mesh](packages/depth-mesh) | rust wasm core (simd128): depth to point cloud, relief heightfield solids, surface nets, point to plane icp, silhouette carving; stl, obj and ply export | 4 vitest, 8 cargo |

Rust cores live in `crates/` (`crates/memory`: BM25 plus flat cosine
with reciprocal rank fusion; `crates/audio-dsp`: the speech and music
DSP kernels; `crates/depth-mesh`: depth and silhouettes to meshes), each built natively and for wasm32 with SIMD128.
Every package entry also builds to one self contained ESM file with
`npm run bundle` (`packages/<pkg>/dist/single/`), for pages opened from
file://.

The checks that need a real browser or model, all not run so far, are
listed in [docs/browser-checks.md](docs/browser-checks.md).

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

### Not verified by anything

- Every package in a real browser with a real model. The list of what needs
  one is in each package README.

## Licence

| path | licence |
|---|---|
| code | MIT (LICENSE) |
| README, CHANGELOG, docs | CC-BY-4.0 (LICENSES/CC-BY-4.0.txt), code samples also MIT |

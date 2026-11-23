# Changelog

Versions follow semver per package. Nothing is published to npm yet.

## 0.1.0 (unreleased)

- repository scaffold: rules, hooks, voice and commit linters, CI.
- ai-env: capability probe, file:// safe ESM import, worker ladder.
- weights: one store over opfs, cache storage and indexeddb parts with resume, sha-256 and multi file repos.
- models: registry records with ladders, quirks and licences, a hub with a memory budget, gpu queue and stub mode.
- memory: rust wasm core for bm25, cosine and rrf with linear and organic scorers; indexeddb persistence, token budgeted assembly, prefix stable injection, recall trace, export.
- chat: one streaming engine over webllm, wllama, transformers.js, the prompt api and remote endpoints; role normalization, think stripping, schema fallback.
- structured: constrained, prompt, native, tags and lines modes with schema sanitizer, loose fallback, json repair, guards and a streaming tag parser.
- devices: rung builders and one hub factory each for onnxruntime-web and transformers.js, pinned runtime loading, progress merging.
- audio-dsp: rust wasm dsp core with native and wasm parity, the scribe gate, overlap add, and txt, srt, vtt, json, lrc, wav, midi and zip writers that reproduce scribe exports byte for byte.
- transcribe: scribe front end, reels and source map, whisper and moonshine records, phantom filter matching scribe's drops, kerf live segmenter, web speech adapter.
- vision: depth, detection, segmentation, landmarks with a fallback chain, captions and questions through the hub; mediapipe and face-api providers, an external yolo decoder, a perception loop and result cache.
- depth-mesh: rust wasm core for point clouds, relief solids, surface nets, icp and silhouette carving with native and wasm parity; stl, obj and ply export.
- models: run scheduling (minimum interval, idle only, frame time budget, wait or skip) and a busy state, for models that share the gpu with a scene; vision and transcribe pass it through, vision adds a rate capped readback loop.
- stems: htdemucs fast and slow tiers through the hub with an own overlap add runner.
- notes: basic pitch runner on tfjs with a webgl to cpu ladder, note decoding and refinement, drums, tempo and grid fit.
- biosignal: rust wasm riemannian tangent space classifier with zero phase filters, leak free cross validation and json export, with native and wasm parity.
- media: audio decode at a target rate, keyframes by scene change, recording with a mime ladder.
- single file ESM builds per package entry (`npm run bundle`) and the list of browser and model checks not run.
- embed: model2vec static embedder in plain typescript and a transformers.js minilm adapter, both with a fingerprint id, and hub records.
- speak: engine chain over kokoro, pocket tts and web speech with first clause streaming, gapless playback, a watchdog and text offsets for cues and lip sync.

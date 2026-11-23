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
- single file ESM builds per package entry (`npm run bundle`) and the list of browser and model checks not run.

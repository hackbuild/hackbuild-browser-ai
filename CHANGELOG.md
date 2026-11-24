# Changelog

Versions follow semver per package. Nothing is published to npm yet.

## 0.1.0 (unreleased)

### Weights rows, failure copy, stats and sessions, 2026-11-24

- weights: `downloads()` and `onDownloads(fn)` for one row per
  download, `cancel(key)` for every waiter with parts kept, `persist()`
  and `persisted()`. Each download runs under a Web Lock per key, so two
  pages of one origin fetch a key once (row 60 of
  docs/browser-checks.md, now pass).
- models: `hub.onLoad(fn)` with fetch, compile, warm, ready and failed
  steps per model, `ctx.report` for factories; `suggestDefaults(env,
  input)` and `pickModel` with one reason per field.
- devices: `humanError(e)`, `humanError("mic", e)` and
  `humanError("camera", e)`; transformers.js progress reaches
  `hub.onLoad`.
- chat: `ChatResult.stats` (tokens with their source word, first token,
  tokens per second, total); `engine.prewarm(messages)` with a wllama
  zero token completion; the versioned session schema with import,
  export, history and markdown; `webllmPhase` and `webllmCache` in
  `@hackbuild/chat/webllm`.
- listen: the `CONVERSATION` machine preset (900 ms, vendor) and
  `dropWhileTalking`.

### Catalogue facts, 2026-11-24

- models: `ModelRecord` gains `params`, `quant`, `vramMB` with
  `vramSource`, `censorship`, `tags`, `tier`, `family` and `note`; the
  chat rows of `CATALOG` carry them, VRAM as the WebLLM catalogue states
  it (vendor). `budgetFor(env)`, `fitOf(record, env, estimate)`,
  `PRESETS` with `presetTotal` (phone, laptop, desktop; totals computed
  from the records) and `ggufFacts(fileName)`.

### Shared origin check, 2026-11-24

- tools: `check-origin.mjs` (`npm run check:origin`) serves two paths
  from one local host in headless Chrome. Measured: a store entry on
  opfs, idb and cache, a WebLLM `webllm/model` entry and a
  `transformersCache` put are each read from the other path; two pages
  asking for one key at once fetch it twice. Rows 58 to 60 of
  docs/browser-checks.md.

### hackbuild-ui pin, 2026-11-23

- examples: hackbuild-ui 0.4.3 to 0.5.0 at commit 5211c3a, pinned by
  hackbuild-ui `tools/pin-ui.mjs`; `tools/vendor/hackbuild-ui.pin` records
  version, commit and sha-256, and `npm run ui:check` (run in CI before
  `npm ci`) checks the tarball, SHA256SUMS, package.json and the lockfile
  against it.
- ai-elements: the shadow sheet regenerated from the 0.5.0 class layer:
  hover styles only on a fine pointer, 44 px segment buttons, fold
  summaries and check rows on phones and touch screens. The sheet carries
  the whole layer, minds classes included, so `dist/index.js` grows from
  21,471 to 23,538 bytes gzip (measured); the size budget is rewritten.

### Release readiness, 2026-11-23

- ci: `packages` job packs every package and runs the files allowlist,
  manifest, peer, publint, attw and gzip size budget checks
  (`tools/lint-packages.mjs`, `tools/size-budget.json`); README size
  tables are generated from the budget. `npm run build` now also writes
  the single file builds, so every tarball carries `dist/single/`, and
  unpkg and jsdelivr point at `dist/single/index.iife.js`. `browser` job
  loads all 33 single file builds from file:// in headless Chrome. The
  `unit` job summary names every skipped test, the two local fixture
  suites included. lint-authors requires authors in every Cargo.toml.
- Changesets for versions and package changelogs; `release.yml` runs on
  manual dispatch only, packs and uploads the tarballs, and publishes
  nothing.
- Verified on macOS 12: publint and attw clean on all 23 tarballs, 33 of
  33 single file builds load in headless Chrome. Not verified until the
  push: the Linux runner.

- repository scaffold: rules, hooks, voice and commit linters, CI.
- ai-env: capability probe, file:// safe ESM import, worker ladder.
- weights: one store over opfs, cache storage and indexeddb parts with resume, sha-256 and multi file repos.
- models: registry records with ladders, quirks and licences, a hub with a memory budget, gpu queue and stub mode.
- memory: rust wasm core for bm25, cosine and rrf with linear and organic scorers; indexeddb persistence, token budgeted assembly, prefix stable injection, recall trace, export.
- chat: one streaming engine over webllm, wllama, transformers.js, the prompt api and remote endpoints; role normalization, think stripping, schema fallback.
- structured: constrained, prompt, native, tags and lines modes with schema sanitizer, loose fallback, json repair, guards and a streaming tag parser.
- devices: rung builders and one hub factory each for onnxruntime-web and transformers.js, pinned runtime loading, progress merging.
- audio-dsp: rust wasm dsp core with native and wasm parity, a hysteresis gate, overlap add, and txt, srt, vtt, json, lrc, wav, midi and zip writers. Verified: the writers reproduce an earlier transcription tool's exports byte for byte on the owner's local fixtures only; CI has no fixtures and skips that suite.
- transcribe: the quiet speech front end, reels and source map, whisper and moonshine records, phantom filter matching the earlier tool's drops, live segmenter, web speech adapter.
- vision: depth, detection, segmentation, landmarks with a fallback chain, captions and questions through the hub; mediapipe and face-api providers, an external yolo decoder, a perception loop and result cache.
- depth-mesh: rust wasm core for point clouds, relief solids, surface nets, icp and silhouette carving with native and wasm parity; stl, obj and ply export.
- models: run scheduling (minimum interval, idle only, frame time budget, wait or skip) and a busy state, for models that share the gpu with a scene; vision and transcribe pass it through, vision adds a rate capped readback loop.
- stems: htdemucs fast and slow tiers through the hub with an own overlap add runner.
- notes: basic pitch runner on tfjs with a webgl to cpu ladder, note decoding and refinement, drums, tempo and grid fit.
- biosignal: rust wasm riemannian tangent space classifier with zero phase filters, leak free cross validation and json export, with native and wasm parity.
- media: audio decode at a target rate, keyframes by scene change, recording with a mime ladder.
- character: rust wasm core and native cli for character card v2 and v3 in json, png text chunks and charx, with upgrade, downgrade, validation and a versioned profile extension for avatar, voice and actions; native and wasm parity.
- single file builds per package entry (`npm run bundle`): an ESM file for http pages and an IIFE file for file:// pages, and the list of browser and model checks. Verified: 33 of 33 IIFE files load from file:// in Chrome 150 (measured).
- examples: ten pages published to GitHub Pages, each stating the weight licence before a model loads, with `npm run examples:check` driving them in Chrome. Verified: Chrome 150 on an Apple M1 only; Safari and Firefox not run.
- speak: the bellows voice (bellows-voice 0.8.0 on bellowsjs 0.5.x, MIT, no weights). Verified: same samples for one seed through the npm package (test); not listened to by a person.
- vision: Depth Anything in a worker for scenes, limited to registered depth records. Verified: a fake runtime in unit tests and one Chrome run; not looked at by a person.
- fixes after the 2026-11-23 audit: 44.1 kHz input resampled to 16 kHz, memory vector reuse, resume validator and shared aborts, pinned model commits with SHA-256, Kokoro's GPL phonemizer opt in, the Pocket build pinned and hashed, the inline worker rung opt in, the wasm toolchain pinned and built in CI, and the rest listed in the audit's fixed section. Verified: unit tests and CI; browser rows as docs/browser-checks.md says.
- embed: model2vec static embedder in plain typescript and a transformers.js minilm adapter, both with a fingerprint id, and hub records.
- speak: engine chain over kokoro, pocket tts and web speech with first clause streaming, gapless playback, a watchdog and text offsets for cues and lip sync.
- listen: vad state machine with silero and energy sources, a transcribe adapter and barge in by a threshold swap while speaking.
- act: speech timeline cues with names constrained per avatar, a strict resolver, a gbnf and json schema grammar, hybrid sentence inference and replay.
- agent: perceive, recall, decide, act, reflect turn with a forced json tool loop, escalation, a reflex brain, persistent goals, budgeted context and a plan cache.
- imagegen: sd-turbo on onnxruntime-web with a seeded euler scheduler on trailing timesteps.
- ai-elements: model picker, download bar, status pills, chat panel and memory inspector as web components registered by define().
- examples and ai-elements on the hack.build design system: the example pages load the hackbuild-ui 0.4.3 class layer and its inlined fonts from the vendored tarball (`tools/vendor`, sha-256 checked in CI) in place of their own theme, mobile first from a 360 px phone. The ai-elements shadow roots adopt the same layer as one constructable stylesheet with every token falling back to its hackbuild-ui value; `--hb-ok` and `--hb-warn` no longer shadow the design system's tokens, the 0.1.0 theme tokens and the dark theme are gone (the ai-elements README maps them).

# @hackbuild/speak

You give it a reply as it streams and it speaks it through the first voice engine that works, telling you which character of your text the voice has reached.

[![npm](https://img.shields.io/npm/v/@hackbuild/speak)](https://www.npmjs.com/package/@hackbuild/speak) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 16.4 kB measured](https://img.shields.io/badge/gzip-16.4%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Cuts a streaming reply into segments, with a short first clause so speech starts early, and synthesizes the next segment while the current one plays.
- Runs each segment through a chain of engines (the bellows voice, Pocket TTS, Kokoro, the system voice) and moves to the next one on a load error, a synth error or a watchdog trip.
- Plays PCM back to back on one AudioContext through one analyser, the single output for a level or lip sync driver.
- Reports progress, words and phonemes as offsets in your text, the same offsets the action tag parser in @hackbuild/structured uses.
- Renders a whole text offline to one buffer, a wav Blob and word timing json.

## Install

```sh
npm install @hackbuild/speak
```

It depends on @hackbuild/ai-env, @hackbuild/models and @hackbuild/audio-dsp. No runtime is bundled: each engine loads its runtime from a loader you pass. bellows-voice and bellowsjs are optional peers; install them only for the bellows voice. kokoro-js and the Pocket build are fetched from a URL at run time and are not peers.

| subpath | runtime | pin |
|---|---|---|
| `.` (`bellowsEngine`) | bellows-voice, which imports bellowsjs (optional peers) | bellows-voice 0.8.0, bellowsjs 0.5.0 |
| `.` (`kokoroEngine`) | kokoro-js, from your URL | 1.2.1 |
| `.` (`pocketEngine`) | the Pocket TTS community browser build, from its Space | commit `d0c0c79` |
| `.` (`webSpeechEngine`) | the browser's speechSynthesis | none |

## Quick start

```ts
import { importEsm } from "@hackbuild/ai-env";
import { bellowsEngine, createSpeaker, renderedWav, webSpeechEngine, type BellowsVoiceModule } from "@hackbuild/speak";

// one AudioContext, made after a click so the browser lets it play
const ctx = new AudioContext();

// the bellows voice first (a vocal tract model, no weights, code MIT), the system voice as fallback
const bellows = bellowsEngine({ runtime: () => importEsm<BellowsVoiceModule>("https://cdn.jsdelivr.net/npm/bellows-voice@0.8.0/dist/engine.js/+esm"), rng: Math.random });
const speaker = createSpeaker({ ctx, engines: [bellows, webSpeechEngine()], onProgress: (p) => console.log("reached", p.offset, p.kind) });

// feed a reply as it streams; the last call says it is complete
speaker.feed("Hello there, this is the first clause.");
speaker.feed("Hello there, this is the first clause. And here is the rest.", true);
await speaker.done();

// render a line offline and keep it as a wav
const wav = renderedWav(await speaker.render("Saved to a file."));
console.log("wav", wav.size, "bytes");
```

## Live example

The speak screen of the suite runs a speaker with time to first audio and word offsets: [hackbuild-suite speak](https://hackbuild.github.io/hackbuild-suite/#/voice/speak). The package page runs Kokoro 82M on wasm or webgpu and the system voice through one speaker: [hackbuild-browser-ai/speak](https://hackbuild.github.io/hackbuild-browser-ai/speak/).

## Concepts

### offsets are in your text

`feed(text)` takes the visible reply so far, with action tags already removed by @hackbuild/structured's tag parser, and `feed(text, true)` marks it complete; the next feed starts a new utterance. Every `Progress` and `TimedEvent` offset is in that text. `speakable()` strips think blocks (also unclosed ones), code fences, markdown marks, link targets, emoji and variation selectors, reads bare URLs as "link", applies your lexicon, collapses whitespace, and keeps a map from each spoken character back to the input.

### segments

The first segment ends at a clause (`,` `;` `:`) once it is 24 characters long, so speech starts early; later ones end at a sentence, or at the last clause or space before 160 characters. Abbreviations (Dr., e.g.) and decimals do not end a sentence, and an open word at the stream's edge waits.

### pipelining and playback

One loop synthesizes segment N+1 while N plays. `GaplessPlayer` schedules chunks at max(now + 40 ms, end of the last chunk) with a 96 sample fade at the start and end of each segment, all through one gain and one analyser (`speaker.analyser`).

### the engine chain

Engines load on first use. A load error, a synth error or the watchdog (no audio for 45 s by default) marks the engine failed and the same segment goes to the next one. `resetEngines()` clears the marks. A native engine waits for queued PCM to finish. `stop()` cuts speech for barge in, and `onSpeaking` tells a listener when to swap its threshold.

### timing

Engine word or phoneme times are placed on the audio clock. Kokoro through kokoro-js reports none, so word times are estimated from word length over the segment's duration and marked `estimated`. Web Speech reports word boundaries as they happen; its level is a pulse per boundary (estimated). A native engine counts as speaking from the platform's start event, or its first word boundary when there is none; with neither, `onSpeaking` never fires and time to first audio is unknown rather than 0. `tick()` fires due cues; it runs every 25 ms while speaking, or pass `tickMs: 0` and call it per frame.

### cache

Recent clips are kept by engine, voice, rate and text, bounded at 3 minutes of 24 kHz samples, so a replay does no synthesis. `cacheSamples: 0` turns it off.

### offline render and save wav

`renderSpeech(engines, text, opts)` renders a whole text on the first engine that can, to one mono buffer, with word and phoneme times kept as offsets in the input text and seconds from the buffer start. Segments are cut as the speaker cuts them and joined with 80 ms of silence by default. `speaker.render(text)` does the same on the speaker's chain and voice settings. `renderedWav(r)` gives a 16 bit wav Blob, `renderedBuffer(ctx, r)` an AudioBuffer, `renderedTiming(r, text)` the word timing json for lipsync. Every PCM engine renders (stub, bellows, pocket, kokoro behind its opt in); `canRender(engine)` reads the `offline` flag, which the system voice sets false, since it plays through the platform and hands back no samples. Native engines are skipped, and an engine with no word times gets estimated ones, marked `estimated`.

### kokoro and the GPL phonemizer

kokoro-js turns text into phonemes with the `phonemizer` package, whose npm metadata says Apache-2.0 but whose code is eSpeak NG compiled to wasm, which is GPL-3.0-or-later. This package stays MIT because it never bundles kokoro-js: you pass a loader for it. Kokoro is opt in: `kokoroEngine` refuses to load unless `allowGplPhonemizer: true` is passed, and `KOKORO_GPL_NOTICE` holds the text to show. No non-GPL phonemizer for kokoro-js was found on 2026-11-23, so there is no non-GPL Kokoro path; the MIT defaults are the bellows voice and the system voice. An app that ships kokoro-js takes on the GPL terms. `device: "webgpu"` runs fp32 and `"wasm"` (the default) runs q8; webgpu with q8 gave garbled audio in an earlier build.

### pocket tts

The browser build is a community Space pinned to commit `d0c0c79` (`POCKET_SPACE_COMMIT`); its weights load from that commit too. `inference-worker.js` and `sentencepiece.js` are checked against SHA-256 values measured at that commit (`POCKET_SHA256`) before they run, since they run with the page's origin. Another `base` takes its own `sha256`; without one its scripts run unchecked and the load says so. A load that times out (420 s by default) or errors terminates its worker. The Space card names cc-by-4.0 for the build.

The worker is fetched as text and four rewrites run through @hackbuild/ai-env: sentencepiece loaded from a Blob URL with a data: URL fallback, `CHUNK_GAP_SEC` 0.25 to 0.1, one wasm thread with the proxy off before `wasmPaths`, and relative paths made absolute against the base. A rewrite that matches nothing is reported as `patch-missed` and, unless `strictPatches: false`, fails the load so the chain moves on. The worker spawns classic from a Blob first (file:// refuses module workers).

### voice clone

`cloneVoice(samples, rate)` on the Pocket engine takes a reference you supply, makes it mono 24 kHz, 15 s at most, peak 0.9 (`prepareClone`), and encodes it as voice "custom". It waits for a running generate. Nothing is stored or bundled.

### bellows voice

`bellowsEngine({ runtime, rng })` speaks through bellows-voice, the owner's articulatory voice for the bellowsjs engine (MIT): a physical model of a vocal tract, so it has no weights and no weight licence; its code is MIT and is loaded by you, never bundled. `runtime` returns `bellows-voice/engine` from bellows-voice 0.8.0, which imports bellowsjs 0.5.x. Each segment goes through its offline `renderSpeech`, and the chunk carries the exact phoneme spans the engine sang (no word times; the speaker estimates those). `renderSpeechFrom({ bellows, voice, engine })` is legacy glue for bellows-voice 0.7.3, which has no `renderSpeech`: the same call built from its public API as bellows' own `speak()` lays a line out.

- Seed: one draw from the injected `rng` when the engine is made, plus the segment count, so the same Rng gives the same audio.
- The render runs on the calling thread; pass `render(text, opts, signal)` to call `renderSpeech` in a worker instead.
- Voices are the 14 bellows-voice starter voices (`BELLOWS_VOICES`); its naturalness is below the neural engines (inferred), so it fits a robot, creature or singing voice, or a fallback that needs no download.

## API overview

| export | what it does |
|---|---|
| [`createSpeaker`](../../docs/api/speak/README.md#createspeaker) | make a speaker from an engine chain and callbacks |
| [`Speaker`](../../docs/api/speak/README.md#speaker) | `feed`, `say`, `done`, `stop`, `render`, `resetEngines`, `tick` and the one `analyser` |
| [`bellowsEngine`](../../docs/api/speak/README.md#bellowsengine) | the bellows voice, no weights, exact phoneme times |
| [`pocketEngine`](../../docs/api/speak/README.md#pocketengine) | Pocket TTS in a patched worker, with voice clone |
| [`kokoroEngine`](../../docs/api/speak/README.md#kokoroengine) | Kokoro 82M through kokoro-js, opt in for its GPL phonemizer |
| [`KOKORO_GPL_NOTICE`](../../docs/api/speak/README.md#kokoro_gpl_notice) | the text to show before Kokoro loads |
| [`webSpeechEngine`](../../docs/api/speak/README.md#webspeechengine) | the system voice, with word boundaries from the browser |
| [`stubEngine`](../../docs/api/speak/README.md#stubengine) | a tone engine with exact word times, for tests and stub pages |
| [`renderSpeech`](../../docs/api/speak/README.md#renderspeech) | render a whole text offline to one buffer |
| [`renderedWav`](../../docs/api/speak/README.md#renderedwav) | a 16 bit wav Blob of a render |
| [`renderedTiming`](../../docs/api/speak/README.md#renderedtiming) | word and phoneme timing json for lipsync |
| [`canRender`](../../docs/api/speak/README.md#canrender) | whether an engine can render offline |
| [`OfflineRenderError`](../../docs/api/speak/README.md#offlinerendererror) | thrown when no engine in the chain can render |
| [`speakable`](../../docs/api/speak/README.md#speakable) | text to read aloud and its offset map |
| [`SegmentCutter`](../../docs/api/speak/README.md#segmentcutter) | cut a growing reply into segments |
| [`GaplessPlayer`](../../docs/api/speak/README.md#gaplessplayer) | back to back playback through one analyser |
| [`prepareClone`](../../docs/api/speak/README.md#prepareclone) | a voice reference at 24 kHz, 15 s, peak 0.9 |
| [`SPEAK_RECORDS`](../../docs/api/speak/README.md#speak_records) | model records for pickers and the models registry |

The full reference is in [docs/api/speak](../../docs/api/speak/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| Kokoro 82M | `onnx-community/Kokoro-82M-v1.0-ONNX` | fp32 325.5 MB, q8 92.4 MB (vendor) | weights Apache-2.0; the kokoro-js phonemizer (eSpeak NG) is GPL-3.0-or-later, opt in | Hugging Face, through kokoro-js from your URL |
| Pocket TTS | `kyutai/pocket-tts`, browser build `KevinAHM/pocket-tts-web` at `d0c0c79` | 189 MB (inferred) | weights CC-BY-4.0, code MIT; the build's Space card says cc-by-4.0 | the pinned Space commit |
| bellows voice | `virgilvox/bellows-voice` | no weights; code about 65 KB gzipped (vendor) | none, no weights (code MIT) | your loader for bellows-voice 0.8.0 |
| system voice | none | none | the platform's terms | the browser |

No weights and no voice references ship in this package. Kokoro's weights come through kokoro-js and Pocket's through its worker, each with its own fetch; @hackbuild/weights is not in either path, and Kokoro's fp32 weights do not cache on file://, so webgpu needs http. Each engine states its weight licence on first load through `onStatus`.

## Browser support

| feature | WebGPU | WASM | threads | Safari | Firefox | phone |
|---|---|---|---|---|---|---|
| Kokoro | fp32, needs http | q8, the default | unknown | unknown | unknown | unknown |
| Pocket TTS | no | yes | one wasm thread | unknown | unknown | unknown |
| bellows voice | no | no wasm needed | calling thread, or your worker | yes (inferred) | yes (inferred) | yes (inferred) |
| system voice | no | no | no | unknown | unknown | unknown |
| speaker and player | no | no | no | yes (inferred, Web Audio) | yes (inferred, Web Audio) | yes (inferred) |

When an engine fails to load or goes quiet, the chain falls back to the next one; put the system voice last. Some browsers send text to a server for system voices. The Pocket worker spawns classic from a Blob so it runs from file://.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `kokoro-js phonemizes with the phonemizer package, ... pass allowGplPhonemizer: true to load it.` | Kokoro without the GPL opt in | show `KOKORO_GPL_NOTICE` and pass `allowGplPhonemizer: true`, or use the bellows voice or the system voice |
| `no speechSynthesis in this browser` | no Web Speech synthesis | put another engine in the chain |
| `speech synthesis: <error>` | the platform voice failed | the chain moves on; check the system voice settings |
| `pocket worker changed upstream; patches did not match` | a rewrite matched nothing in the worker | keep the pinned base, or pass `strictPatches: false` at your own risk |
| `sentencepiece.js sha256 <got>, expected <want>` | the fetched script differs from the pinned hash | use the default base, or pass the hashes for your base |
| `sentencepiece.js http <status>` | the script did not download | check the network or the base URL |
| `pocket did not load in <n> s` | the worker sent no `loaded` in time | raise `loadTimeoutMs`, or let the chain move on |
| `pocket is not loaded`, `kokoro is not loaded`, `bellows is not loaded` | synth or clone before load | let the speaker load the engine, or call `load` first |
| `bellows-voice has no renderSpeech; pass bellows-voice 0.8.0 /engine, or renderSpeechFrom(parts) for 0.7.3` | the loader returned the wrong module | load `bellows-voice/engine` from 0.8.0, or wrap 0.7.3 with `renderSpeechFrom` |
| `bellows-voice: no starter voice "<id>"` | the voice id is not in `BELLOWS_VOICES` | pick one of `BELLOWS_VOICES` |
| `the system voice plays live and gives no audio to save. pick bellows or pocket to save a wav.` | `OfflineRenderError` code `native`: only native engines were left | show the message as is (`humanError` in @hackbuild/devices returns it unchanged) and offer a PCM engine |
| `no voice could render this text. <reasons>.` | `OfflineRenderError` code `failed`: every PCM engine failed | read the reasons; `onSkip` reports each engine skipped |
| `the engine returned no audio` | a render produced no samples | try another engine |
| `render stopped` (AbortError) | your signal aborted the render | none needed |

## Works with

- [@hackbuild/structured](../structured/README.md) strips action tags from the reply; its offsets match the ones the speaker reports.
- [@hackbuild/listen](../listen/README.md) swaps its barge in threshold from `onSpeaking` and calls `stop()` when you talk over the voice.
- [@hackbuild/devices](../devices/README.md) has `runtimeLoader` for pinned runtime imports and `humanError` for the refusal copy.
- [@hackbuild/audio-dsp](../audio-dsp/README.md) writes the wav that `renderedWav` returns.
- [@hackbuild/models](../models/README.md) lists the voices from `SPEAK_RECORDS`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/speak` passes, 17 tests (28 on 2026-11-23, bellows included), in Node
  22.18.0 with a fake AudioContext, a fake Web Speech API, a fake
  kokoro-js module and a fake Pocket worker: speakable text and its
  offset map, segment cuts, gapless scheduling and fades, progress order
  against the audio clock, the engine chain with a load failure and a
  watchdog trip, the cache, stop, Pocket patching, missed patch refusal,
  chunk streaming and clone preparation.

- 2026-11-23: `test/bellows.test.ts`, 5 tests on a fake module: one
  draw from the rng for the seed, the seed per segment, phoneme times from
  the spans, a refusal without `renderSpeech`, a caller render. Then in
  Node 22.18.0 against a local build of bellows-voice at ac30dc2: a 2.30 s
  line rendered in 873 ms cold and 516 ms warm, byte identical for the
  same rng seed and different for another, 25 phonemes (measured). The
  0.7.3 path through `renderSpeechFrom` gave the same 2.30 s line in 916
  ms cold and 489 ms warm, byte identical for one seed (measured), and a
  unit test checks the score it posts.
- 2026-11-23, later: a test renders "hello there." through the npm
  bellows-voice 0.8.0 `/engine` (a dev dependency at the root): byte
  identical for one rng seed, different for another.

- 2026-11-24: `test/render.test.ts`, 6 tests on the stub engine and fakes:
  word offsets through markdown, estimated times, the skip order, the
  refusal copy through `humanError`, wav bytes decoded back, and
  `speaker.render` with the chain's rate.

### Not verified by anything

- Any real engine: Kokoro 82M on webgpu fp32 or wasm q8, the Pocket
  worker (its message names are taken from earlier builds, not from
  upstream documentation), system voices in Chrome, Safari and Firefox.
- Audible gaps or clicks at chunk joins; looked at by nobody.
- Time to first audio (no measurement).
- Offline render on a real engine; only the stub has rendered.
- Pocket's patches against the current upstream worker source.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 16,374 bytes | 17,192 bytes |
| `dist/single/index.iife.js` (single file build) | 20,158 bytes | 21,165 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weight licences: Kokoro 82M Apache-2.0, with its kokoro-js phonemizer (eSpeak NG) GPL-3.0-or-later and opt in; Pocket TTS CC-BY-4.0; the bellows voice has no weights (code MIT); system voices are under the platform's terms.

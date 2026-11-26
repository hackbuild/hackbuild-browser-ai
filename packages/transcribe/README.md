# @hackbuild/transcribe

Turn a recording into timed text in the tab, with Whisper or Moonshine behind a front end that finds quiet speech and drops the lines a model writes over silence.

[![npm](https://img.shields.io/npm/v/@hackbuild/transcribe)](https://www.npmjs.com/package/@hackbuild/transcribe) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 16.6 kB measured](https://img.shields.io/badge/gzip-16.6%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: one model of this package has run in a real browser: whisper-base.en on wasm q8 and webgpu fp32 over one sentence spoken by Kokoro, in one automated pass in Chrome 150 on an Apple M1 that nobody has looked at. whisper-large-v3-turbo, the other Whisper models, Moonshine, the live segmenter on a microphone and the Web Speech adapter have not run.

## What it does

- Cleans and levels 16 kHz audio, gates out the silence and packs the speech into reels of at most 26 s, with a source map back to file time.
- Runs one Whisper or Moonshine call per reel through the models hub, then drops watermark, outro, loop and repeat lines the model wrote over silence.
- Cuts live microphone blocks into segments and wraps the browser's own speech recognizer.
- Queues dropped files, offers the languages a model takes, and draws a level rail you can regate without a model run.
- Writes txt, srt, vtt and json, a zip of them with a manifest, and reads json, srt and vtt back for editing.

## Install

```sh
npm install @hackbuild/transcribe @hackbuild/media @hackbuild/weights
```

It depends on @hackbuild/ai-env, @hackbuild/models, @hackbuild/devices and @hackbuild/audio-dsp, and has no peers. transformers.js is not a dependency: `loadTransformers()` from @hackbuild/devices imports the pinned build (`@huggingface/transformers@4.3.2`) at run time. Use @hackbuild/media to decode files and @hackbuild/weights to cache weights.

## Quick start

```ts
import { probe } from "@hackbuild/ai-env";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { asSrt, attachTranscribe, defaultTranscribeId, toMono, transcribe, TRANSCRIBE_RECORDS } from "@hackbuild/transcribe";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// a hub with the whisper and moonshine records; transformers.js comes in through the devices loader, weights through the store with each record's licence
const hub = createHub({ env: await probe() });
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache: transformersCache(await openWeightStore(), { licenceFor: (url) => TRANSCRIBE_RECORDS.find((r) => r.source.modelId && url.includes(r.source.modelId))?.licence ?? null }) }).factory);
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => { // 16 kHz mono from the picked file, then whisper: large-v3-turbo with webgpu, base.en without
  const { channels } = await decodeAudio(input.files![0]!, 16000);
  const out = await transcribe(hub, dsp, toMono(channels), { model: defaultTranscribeId(hub.env?.webgpu ?? false), language: "en" });
  console.log(asSrt(out.segments), out.dropped.length, "lines dropped");
};
```

## Live example

The transcribe page in the suite drops a file or speaks a sentence with Kokoro and reads it back: [hackbuild-suite transcribe](https://hackbuild.github.io/hackbuild-suite/#/voice/transcribe). The package page is at [hackbuild-browser-ai/transcribe](https://hackbuild.github.io/hackbuild-browser-ai/transcribe/).

## Concepts

### the front end

`analyze` takes these steps at 16 kHz: dc block, an 80 Hz high pass run twice, a 250 to 3800 Hz copy for speech decisions, a minimum statistics noise floor, the gate at floor plus 6 dB, the speech level and a gain toward -20 dBFS capped at +60 dB. `finishReel` then denoises each reel from the noise print, levels it again (plus or minus 9 dB), gains and limits it at 0.891. `frontEndOptions` fills the defaults: high pass, gate margin, silence skip, target level, gain cap, denoise strength 0 to 3, per reel levelling.

### reels and the source map

`packReels` cuts speech regions into reels of at most 26 s; a cut inside a region lands on the quietest frame of the last 2 s, never before half a reel. `materialize` joins runs with 0.12 s of silence and a 0.1 s lead, and `mapTime` takes model timestamps back to file seconds. A reel over 29 s is sent with 30 s chunks and a 5 s stride.

### one model call per reel

`transcribe(hub, dsp, pcm16k, options)` runs the front end, one ASR call per reel under `hub.run` (so a webgpu model takes the gpu lock), the source map and the phantom filter. Pass `schedule` to keep a rendering page smooth, `signal` to stop, and `onProgress` for reels done and the realtime factor. The result carries `segments`, `dropped` with the reason, `stats` (levels in dB), `rail`, `model` and `language`. `toMono` picks one channel when it is 6 dB louder, else mixes the channels within 20 dB of the loudest. `attachTranscribe(hub)` adds the records; `transcribeStubs()` and `stubAsr()` give a `?stub` path with no weights.

### english only models

transformers.js rejects `task` and `language` for an english only model, which fails on the Xenova tiny.en, base.en and small.en rows; `transcribe` passes neither to them. Their repos list the fp32 and q8 (`_quantized`) encoder and merged decoder files the ladder asks for (checked against the hub file listing on 2026-11-24). `englishOnly` also catches a custom repo id ending in `.en`, and `languagesFor(record, wanted)` gives auto detect plus 19 languages, or english only and locked with the reason.

### the phantom filter

Whisper writes training set watermarks and stock outros over silence. `cleanup` always drops watermarks (`HARD`); outros (`SOFT`) and weak one word lines (`WEAK`) go only when the gate says the audio under them was mostly silence, so a real outro survives. Loops (8 or more words, under 28 percent unique) and the third identical line in a row are dropped too.

### live audio

`LiveSegmenter` takes blocks at any input rate and brings them to 16 kHz (the FIR decimator for an integer multiple, else the fractional resampler). Squelch mode cuts after 500 ms of closed gate; fixed mode every 8 s; any segment at 24 s, since Whisper pads to 30 s. Segments under 0.7 s are dropped, and at most 4 wait; later ones are counted as dropped. Call `done()` when a segment is handled. `webSpeech({ onSegment })` wraps the browser's recognizer with times from the clock; Chrome sends the audio to its own service, so tell the user.

### queue, rail and exports

`createQueue` takes a `decode` and a `run`, so a page passes `decodeAudio` and `transcribe` and a test passes stubs. It accepts audio and video by type or extension, warns on a file over 1.5 GB, and moves each job through queued, running (decoding, then working), done or failed; stop puts the running job back to queued, and a failure keeps its line of copy. Pass `humanError` from @hackbuild/devices as `explain` for the shared failure copy. A transcript's `rail` holds frame levels, the floor and gate threshold and the kept frames; `regate(rail, { vadMargin })` moves the gate without a model run and `railBins(rail, width)` folds it for drawing. Segments take an optional `speaker` (by hand; no diarization runs), `confidence`, `words` and `edited`. `asTxt`, `asSrt`, `asVtt` and `asJson` write one file; `bundle(docs)` writes a store only zip with four files per source and `manifest.json` holding each file's own model, language and levels.

### importing a transcript

`importTranscript(name, text)` reads a dropped json, srt or vtt back into a document, picking the format by extension or by its first characters. Each parser reads what the matching exporter writes, so times survive to the millisecond with text and speakers; the json also keeps confidence, words, the edited mark, dropped lines, model and language. srt has no speaker field, so `{ speakers: true }` reads the leading "name: " that `asSrt` writes; it is off by default. vtt voice tags come back as speakers; cue ids, settings, notes, styles, mm:ss stamps and styling tags from other tools are read or skipped.

## API overview

| export | what it does |
|---|---|
| [`transcribe`](../../docs/api/transcribe/README.md#transcribe) | transcribe 16 kHz mono through the hub, times in file seconds |
| [`attachTranscribe`](../../docs/api/transcribe/README.md#attachtranscribe) | add the speech to text records to a hub |
| [`TRANSCRIBE_RECORDS`](../../docs/api/transcribe/README.md#transcribe_records) | the Whisper and Moonshine records |
| [`defaultTranscribeId`](../../docs/api/transcribe/README.md#defaulttranscribeid) | turbo with webgpu, base.en without |
| [`toMono`](../../docs/api/transcribe/README.md#tomono) | one channel from a decoded buffer |
| [`analyze`](../../docs/api/transcribe/README.md#analyze) | the front end over a whole file |
| [`packReels`](../../docs/api/transcribe/README.md#packreels) | speech regions packed into reels |
| [`cleanup`](../../docs/api/transcribe/README.md#cleanup) | the phantom text filter |
| [`languagesFor`](../../docs/api/transcribe/README.md#languagesfor) | the language select for a model |
| [`createQueue`](../../docs/api/transcribe/README.md#createqueue) | a file queue that decodes and runs each file |
| [`regate`](../../docs/api/transcribe/README.md#regate) | move the gate on a level rail |
| [`asSrt`](../../docs/api/transcribe/README.md#assrt) | srt text, with `asTxt`, `asVtt` and `asJson` beside it |
| [`bundle`](../../docs/api/transcribe/README.md#bundle) | a zip of every export and a manifest |
| [`importTranscript`](../../docs/api/transcribe/README.md#importtranscript) | read a json, srt or vtt back |
| [`LiveSegmenter`](../../docs/api/transcribe/README.md#livesegmenter) | cut live blocks into speech segments |
| [`webSpeech`](../../docs/api/transcribe/README.md#webspeech) | the browser's speech recognizer as segments |
| [`stubAsr`](../../docs/api/transcribe/README.md#stubasr) | a stub ASR with no weights |

The full reference is in [docs/api/transcribe](../../docs/api/transcribe/README.md).

## Models and weights

| model | id | size (MiB, vendor or inferred) | licence | loads from |
|---|---|---|---|---|
| whisper large-v3-turbo | `whisper-large-v3-turbo` | 1534 fp16 encoder and q4 decoder, 2749 fp32 encoder, 1034 q8 on wasm (vendor) | MIT | onnx-community/whisper-large-v3-turbo |
| whisper base | `whisper-base` | 77 (vendor) | MIT | onnx-community/whisper-base |
| whisper small.en | `whisper-small.en` | 238 (vendor) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Xenova/whisper-small.en |
| whisper base.en | `whisper-base.en` | 90 (inferred) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Xenova/whisper-base.en |
| whisper tiny.en | `whisper-tiny.en` | 39 (vendor) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Xenova/whisper-tiny.en |
| moonshine base | `moonshine-base` | 60 (vendor) | MIT for the english models per the model card, not checked further; commercial use unknown | onnx-community/moonshine-base-ONNX |

Ladders and dtypes come from one per model table: turbo runs an fp16 encoder with a q4 decoder, then an fp32 encoder, then q8 on wasm; the others run fp32 (base also q4) on webgpu and q8 on wasm. Moonshine gives no timestamps, so each reel is one chunk. Weights are never bundled: transformers.js fetches them from the Hugging Face hub, and passing `transformersCache(store)` from @hackbuild/weights as the provider's `cache` keeps them in the weight store. The hub states each record's licence before its first load.

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| Whisper, Moonshine | WebGPU, or WASM | webgpu or wasm | unknown | wasm (inferred) | wasm, slow (inferred) |
| front end, reels, exports | the audio-dsp wasm core (simd128) | yes | yes (inferred) | yes (inferred) | yes (inferred) |
| `webSpeech` | SpeechRecognition | yes, audio goes to its service | webkitSpeechRecognition (inferred) | no (inferred) | unknown |
| WASM threads | cross origin isolation | used when the probe reports threads | unknown | unknown | unknown |

Without a WebGPU adapter `defaultTranscribeId` picks whisper base.en and the ladder falls to q8 on wasm. No model has been run in a browser yet; see below.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `<name> is not a transcript this tool reads. drop a json, srt or vtt file.` | `importTranscript` got another kind of file | drop a json, srt or vtt |
| `this is not a vtt file. it must start with WEBVTT.` | a vtt without its header | add the WEBVTT line or export again |
| `no cues in this srt file. each cue needs a line like 00:00:01,000 --> 00:00:02,000.` | srt with no cue times | fix the cue time lines |
| `this json file does not parse. it may be cut short.` | broken json | export the json again |
| `this json file has no segments list. import a transcript json exported from this tool.` | json from elsewhere | use json from `asJson` or `toJson` |
| `"<s>" is not a time stamp.` | `parseStamp` got a bad stamp | use hh:mm:ss,mmm, hh:mm:ss.mmm or mm:ss.mmm |
| `no web speech recognition in this browser. use a whisper model.` | no SpeechRecognition | check `webSpeechAvailable()` first and offer Whisper |
| `transcription stopped` (AbortError) | the signal aborted | nothing; the model is released |
| `could not decode <name>. convert it to wav or mp3 and drop it again.` | the queue's decoder failed | convert the file |
| `the run failed: <message>. press run to try again.` | the queue's run threw | read the message, then retry the job |
| `bad input rate <n>` / `sample rates must be positive` (RangeError) | `toSixteenK` or `StreamResampler` got a rate of 0 or less | pass the AudioContext rate |

Every `TranscriptImportError` message is the copy to show the user. A file over 1.5 GB is queued with a warning line, since decoding loads the whole file into memory.

## Works with

- [@hackbuild/audio-dsp](../audio-dsp/README.md) is the wasm core the front end runs on, and its writers back the exports.
- [@hackbuild/models](../models/README.md) is the hub that routes, loads and locks the ASR model.
- [@hackbuild/devices](../devices/README.md) gives `tjsProvider`, `loadTransformers` and `humanError`.
- [@hackbuild/media](../media/README.md) decodes a dropped file to 16 kHz.
- [@hackbuild/weights](../weights/README.md) caches the weights.
- [@hackbuild/listen](../listen/README.md) puts this behind a microphone and a VAD.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weights: Whisper is MIT (the OpenAI release; the Xenova ONNX cards say apache-2.0); Moonshine's english models are MIT per the model card, not checked further.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/transcribe` under Node 22.18.0 with the real audio-dsp wasm core and fake runtimes: reel cuts and the source map, the phantom filter rules, the front end on a seeded signal, channel picking, the stub path, a whisper record loaded through the transformers.js provider with language passing and the english only rule, the live segmenter (tail, blips, queue cap, fixed windows, 48 to 16 kHz streaming decimation, and 44.1, 32, 24, 22.05 and 8 kHz to 16 kHz through the fractional resampler at the right speed, measured on a 440 Hz tone), and the Web Speech adapter | passes 10 tests (18 on 2026-11-23, local fixture suites included) |
| 2026-11-22 | parity with real exports of another transcription tool: re-running the phantom filter over each transcript's kept plus dropped lines. The files hold personal speech and stay in the gitignored `.local/transcripts`; the test is skipped without them. Dropped lines carry no end time in the export, so the test gives them 2 s, and coverage is set to full | the same split and reasons for all 19 transcripts of one batch zip |
| 2026-11-24 | `npx vitest run packages/transcribe`: the language list and the english only lock, the four exports with speaker, confidence and words, the zip read back with crc checks and the manifest, the rail against the analysis and `regate`, and the queue states, failure copy, cancel and stop with stub decoders and runs | passes 29 tests |
| 2026-11-24 | `test/import.test.ts`: json, srt and vtt exported by asJson, asSrt and asVtt (speakers, escapes, a two line cue, a stamp past an hour) parse back equal and export again byte for byte; the audio-dsp toSrt, toVtt and toJson layouts read back; vtt and srt written by hand in other tools' styles; the refusal copy | passes 8 tests |

### Not verified by anything

- Any Whisper model beyond base.en, and Moonshine, in a browser; word error rates on real speech.
- The queue over real files and `decodeAudio` in a browser.
- The front end sample for sample against another tool on the same audio file;
  no input audio from that tool was available, only its text outputs.
- Moonshine's licence beyond the model card line.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 16,590 bytes | 17,419 bytes |
| `dist/single/index.iife.js` (single file build) | 18,516 bytes | 19,441 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

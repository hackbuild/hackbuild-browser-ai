# @hackbuild/listen

You feed it microphone blocks and it hands back each thing the person said as text, and tells you when they talk over your character.

[![npm](https://img.shields.io/npm/v/@hackbuild/listen)](https://www.npmjs.com/package/@hackbuild/listen) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 7.3 kB measured](https://img.shields.io/badge/gzip-7.3%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Finds utterances in microphone audio with a VAD state machine fed by Silero VAD v5 or an energy gate with no weights.
- Sends each utterance to a transcriber and through the phantom text filter of @hackbuild/transcribe.
- Swaps to stricter thresholds while your character talks, so its own voice does not count and speech that clears the bar is a barge in.
- Shows interim words while the person speaks, from a growing Whisper window or the browser's system recognizer, and writes them into a text field with `dictate`.
- Opens the microphone with echo cancellation and streams blocks from a capture AudioWorklet that runs from file://.

## Install

```sh
npm install @hackbuild/listen
```

It depends on @hackbuild/models and @hackbuild/transcribe and has no peers. onnxruntime-web for Silero and the transcriber's runtime are passed in by you, for example through the loaders in @hackbuild/devices.

| subpath | runtime | pin |
|---|---|---|
| `.` (`sileroVad`) | onnxruntime-web, passed in | your choice; `loadOrt` in @hackbuild/devices pins 1.27.0 |
| `.` (`hubTranscriber`) | the models hub with @hackbuild/transcribe's records | what you register on the hub |
| `.` (`speechEngine`) | the browser's SpeechRecognition | none |

## Quick start

```ts
import { loadOrt, loadTransformers, tjsProvider } from "@hackbuild/devices";
import { createListener, hubTranscriber, micBlocks, openMic, sileroVad, VAD_RECORDS, type OrtLike } from "@hackbuild/listen";
import { createHub } from "@hackbuild/models";
import { attachTranscribe } from "@hackbuild/transcribe";
import { openWeightStore } from "@hackbuild/weights";

// ask for the microphone first, so the prompt shows before any download
const stream = await openMic();
const ctx = new AudioContext();
// Silero VAD v5 (weights MIT) on onnxruntime-web, its bytes cached by the weight store
const silero = VAD_RECORDS[0]!.source;
const bytes = await (await openWeightStore()).once({ url: silero.url!, sha256: silero.sha256!, licence: "MIT" });
const vad = await sileroVad((await loadOrt()()) as unknown as OrtLike, bytes);
// Whisper (weights MIT) through the models hub turns each utterance into text; mic blocks feed the listener
const hub = createHub();
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
const listener = createListener({ vad, inputRate: ctx.sampleRate, transcribe: hubTranscriber(hub, { model: "whisper-base.en" }), onUtterance: (u) => console.log(u.bargeIn ? "barge in:" : "heard:", u.text) });
listener.start();
await micBlocks(ctx, stream, (b) => listener.push(b));
```

## Live example

The package page is at [hackbuild-browser-ai/listen](https://hackbuild.github.io/hackbuild-browser-ai/listen/).

## Concepts

### frames

Input is brought to 16 kHz (the transcribe package's FIR decimator for 32 and 48 kHz, its windowed sinc resampler for 44.1, 24 and 22.05 kHz) and cut into 512 sample frames (32 ms, computed).

### the vad machine

An utterance starts on a frame at or over the positive threshold, keeps 300 ms of audio from before the start, is confirmed after 250 ms of speech frames and ends after 600 ms under the negative threshold; too little speech is a misfire. Utterances are cut at 24 s. `flush()` ends one in progress, for push to talk release.

### barge in

While `setTalking(true)`, thresholds swap to positive 0.85 and 450 ms of speech (from 0.5 and 250 ms), so the character's own voice from the speakers does not count. The confirmed event in that state calls `onBargeIn`; the utterance is still transcribed and carries `bargeIn: true`. Wire `setTalking` to @hackbuild/speak's `onSpeaking` and `onBargeIn` to the speaker's `stop()`.

### sources

`sileroVad(ort, bytes)` runs Silero VAD v5 on onnxruntime-web, 512 new samples with 64 of context and a [2, 1, 128] state carried across frames, single threaded wasm by default, since threaded wasm hung inside workers in an earlier build. The model bytes are yours (URL, ArrayBuffer or File through @hackbuild/weights). `energyVad()` maps dB over a tracked noise floor to a probability; it cannot tell speech from music.

### the phantom filter

Each transcript goes through @hackbuild/transcribe's phantom filter with the utterance's speech frames as coverage; a dropped text comes back empty with `dropped` naming the reason. `filter: false` turns it off.

### the microphone

`openMic` requests echo cancellation, noise suppression and gain control, since barge in depends on the character's voice being cancelled out of the input. Ask for it before any model download so the prompt shows at once. `micBlocks` runs a capture AudioWorklet loaded from a Blob URL with a data: URL fallback, and returns a stop function.

### interim text

An `Interim` is `{ text, stable, t }`: the whole hypothesis so far, the leading words unchanged since the previous one, and seconds since the utterance began. Each one replaces the last.

- Window path: pass `onInterim` and the listener decodes the growing window every 0.8 s of new audio (computed, `interim.everySec`) once it holds 0.5 s, at most one decode in flight; a result that lands after the utterance ended is dropped. `interim.transcribe` can name a smaller model than the final one. The phantom filter runs on the final only.
- System recognizer: `speechEngine` has interim results on, restarts 150 ms after it ends on its own, reports "denied" when the microphone is refused and "unsupported" with no recognizer. Chrome sends the audio to its own service; say so.
- Gate: `selfGate` drops results that arrive while the character speaks or within `tailMs` (default 400 ms, inferred) after.
- `dictate(field)` writes interim words after what the person typed, fires an input event on each write, commits on the final, restores on an empty final or `cancel()`, and calls `onCommit` after a non empty final, for a hands free send.

### conversation settings

`CONVERSATION` is a machine preset for spoken turns: 900 ms of quiet ends an utterance (vendor) in place of the default 600 ms, so a breath does not cut a sentence. `dropWhileTalking: true` on the listener leaves out an utterance that began while the character talked, for when barge in is off; `gateMs` also drops one that began that many ms after the voice stopped.

## API overview

| export | what it does |
|---|---|
| [`createListener`](../../docs/api/listen/README.md#createlistener) | make a listener from a VAD source, a transcriber and callbacks |
| [`Listener`](../../docs/api/listen/README.md#listener) | `start`, `push`, `setTalking`, `flush`, `idle`, `stop` |
| [`sileroVad`](../../docs/api/listen/README.md#silerovad) | Silero VAD v5 on onnxruntime-web as a VAD source |
| [`energyVad`](../../docs/api/listen/README.md#energyvad) | a VAD source from level over a noise floor, no weights |
| [`VadMachine`](../../docs/api/listen/README.md#vadmachine) | the utterance state machine with the threshold swap |
| [`CONVERSATION`](../../docs/api/listen/README.md#conversation) | machine options with a 900 ms end of turn |
| [`hubTranscriber`](../../docs/api/listen/README.md#hubtranscriber) | a transcriber over the models hub |
| [`openMic`](../../docs/api/listen/README.md#openmic) | ask for the microphone with echo cancellation on |
| [`micBlocks`](../../docs/api/listen/README.md#micblocks) | stream microphone blocks from a capture worklet |
| [`speechEngine`](../../docs/api/listen/README.md#speechengine) | the system recognizer with interim results |
| [`selfGate`](../../docs/api/listen/README.md#selfgate) | drop results while the character speaks |
| [`dictate`](../../docs/api/listen/README.md#dictate) | write interim text into a field and commit it |
| [`stablePrefix`](../../docs/api/listen/README.md#stableprefix) | the leading words two hypotheses share |
| [`VAD_RECORDS`](../../docs/api/listen/README.md#vad_records) | the Silero record for pickers and the models registry |

The full reference is in [docs/api/listen](../../docs/api/listen/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| Silero VAD v5 | `silero-vad-v5` (snakers4/silero-vad at `63d4a2a`) | 2.2 MB (measured) | MIT | raw.githubusercontent.com at the pinned commit, SHA-256 in `VAD_RECORDS` |
| Whisper and Moonshine | the records in @hackbuild/transcribe | see that package | Whisper MIT; Moonshine per its record | the models hub |
| energy gate | none | none | none, no weights | nothing |

No weights ship in this package. You fetch the Silero bytes yourself; through @hackbuild/weights they are checked against the SHA-256 and cached. The transcriber's weights load through the hub's provider and its cache.

## Browser support

| feature | WebGPU | WASM | threads | Safari | Firefox | phone |
|---|---|---|---|---|---|---|
| Silero VAD | no | yes, single threaded | off by default | unknown | unknown | unknown |
| energy VAD | no | no | no | yes (inferred) | yes (inferred) | yes (inferred) |
| `openMic`, `micBlocks` | no | no | AudioWorklet | unknown | unknown | unknown |
| `speechEngine` | no | no | no | unknown | no recognizer (inferred), reports "unsupported" | unknown |
| transcriber | per the hub record | per the hub record | per the hub record | unknown | unknown | unknown |

With no recognizer, `speechEngine` reports "unsupported"; use the window path. Without Silero, `energyVad` needs no download but hears music as speech.

## Errors and troubleshooting

This package throws no errors of its own. A failed transcription or VAD run goes to `onError` and the state returns to "listening".

| message | cause | what to do |
|---|---|---|
| `onError` with the transcriber's error | the transcriber threw | read the error from @hackbuild/models or @hackbuild/transcribe; the listener keeps listening |
| `speechEngine` state `unsupported` | no SpeechRecognition in this browser | use the window path with `onInterim` |
| `speechEngine` state `denied`, `onError` with `not-allowed`, `service-not-allowed` or `audio-capture` | the microphone or the recognizer service was refused | ask again from a click, or use the window path |
| `Utterance.dropped` set and `text` empty | the phantom filter dropped the text; `dropped` names the reason | nothing, or pass `filter: false` |
| barge in fires on the character's own voice | echo cancellation is off or the speakers are loud | use `openMic`, headphones, or raise the `talking` thresholds |

## Works with

- [@hackbuild/transcribe](../transcribe/README.md) provides the Whisper and Moonshine records, the 16 kHz resampling and the phantom filter.
- [@hackbuild/speak](../speak/README.md) calls `setTalking` through `onSpeaking`, and `stop()` ends its speech on a barge in.
- [@hackbuild/models](../models/README.md) runs the transcriber under its hub, with the gpu lock for a webgpu model.
- [@hackbuild/weights](../weights/README.md) fetches, checks and caches the Silero bytes.
- [@hackbuild/devices](../devices/README.md) has `loadOrt` and `loadTransformers` for the runtimes.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/listen` passes, 11 tests, in Node
  22.18.0: the machine's start, confirm, end, misfire and length cut, the
  threshold swap and barge in, decimated 48 kHz blocks to one utterance,
  the phantom filter, the hub transcriber with a stub model, and the
  Silero feed shapes against a fake onnxruntime.

- 2026-11-24: the conversation preset's 900 ms end, and
  `dropWhileTalking` dropping speech that began over the voice and
  keeping it after (`test/listen.test.ts`).

- 2026-11-25: interim text on both paths against stub engines
  (`test/interim.test.ts`, 9 tests): the window decode throttle, the
  stable prefix, a late decode dropped, the gate after the voice stops,
  the system recognizer's joined interim results, gate, 150 ms restart,
  denied and unsupported states, and `dictate` writes, commits and
  restores.

### Not verified by anything

- Interim text from a real Whisper model or a real browser recognizer,
  and whether 0.8 s between decodes keeps up on a phone.

- The 900 ms preset in a real conversation.

- Silero VAD v5 on real onnxruntime-web, and whether its output and
  state names match this code (taken from the model's published python
  wrapper, not run here).
- Barge in with real speakers and echo cancellation; an earlier build
  did not verify it either.
- The capture worklet and `openMic` in a browser, including from file://.
- Latency from end of speech to text (no measurement).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 7,274 bytes | 7,637 bytes |
| `dist/single/index.iife.js` (single file build) | 9,278 bytes | 9,741 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weight licences: Silero VAD v5 MIT; Whisper MIT; Moonshine per its record in @hackbuild/transcribe.

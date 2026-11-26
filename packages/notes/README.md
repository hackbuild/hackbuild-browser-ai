# @hackbuild/notes

Turn a recording into notes, drum hits, a tempo and a MIDI file, in the tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/notes)](https://www.npmjs.com/package/@hackbuild/notes) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 5.6 kB measured](https://img.shields.io/badge/gzip-5.6%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Runs Spotify's Basic Pitch graph on tfjs through the models hub, framing the windows by hand.
- Decodes frame and onset posteriors into notes, then merges splits and drops harmonic ghosts.
- Finds kick, snare, hat and optional tom hits on the `@hackbuild/audio-dsp` wasm core.
- Estimates tempo and fits a beat grid to notes.
- Writes a General MIDI file with pitched and drum tracks.

## Install

```sh
npm install @hackbuild/notes
```

It depends on `@hackbuild/models` and `@hackbuild/audio-dsp`. It has no peer dependencies: you pass tfjs 3.21.0 in at runtime through `tfjsPitchProvider`, so nothing of tfjs is bundled.

## Quick start

```ts
import { importEsm } from "@hackbuild/ai-env";
import { createHub } from "@hackbuild/models";
import { attachNotes, decodeNotes, DETAILS, refineNotes, runPitch, tfjsPitchProvider, writeMidi, type PitchModel, type Tfjs } from "@hackbuild/notes";

// a hub with the Basic Pitch record (weights Apache-2.0), tfjs 3.21.0 passed in at runtime
const hub = createHub();
attachNotes(hub);
hub.provide("tfjs", tfjsPitchProvider({ runtime: () => importEsm<Tfjs>("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/+esm") }));

// ten seconds of 22050 Hz mono audio, for example from decodeAudio in @hackbuild/media
const mono = new Float32Array(22050 * 10);

// frame and onset posteriors from Basic Pitch, then notes
const m = await hub.use<PitchModel>("notes");
const post = await hub.run(m, (pitch) => runPitch(pitch, mono, { onProgress: (f) => console.log(`${Math.round(f * 100)} percent`) }));
hub.release(m);
const notes = refineNotes(decodeNotes(post.frames, post.onsets, DETAILS.normal), DETAILS.normal);
// a MIDI file with one bass track at 120 bpm
const mid = writeMidi([{ name: "bass", notes, program: 33 }], 120);
console.log(`${notes.length} notes, ${mid.length} bytes`);
```

## Live example

The package page is at [hackbuild-browser-ai/notes](https://hackbuild.github.io/hackbuild-browser-ai/notes/).

## Concepts

### basic pitch runs by hand

`runPitch` takes 22050 Hz mono and cuts it into windows of 43844 samples on a 36164 sample hop, with a 3840 sample lead pad. Each window gives 172 frames by 88 bins; 15 frames are trimmed off each end and only the frames and onsets outputs are read, no contours. Frames step by 256 samples inside a window, so the mean rate is 86.58 frames per second (computed); `bpFrameTime` and `bpFrameCount` do that arithmetic.

### the tfjs runtime is passed in

`tfjsPitchProvider` takes a `runtime` function that returns tfjs. Share one tfjs instance across the page. It tries the webgl backend in batches of 4 with `WEBGL_SIZE_UPLOAD_UNIFORM` set to 0, which works around the getT1 concat shader bug, else the cpu backend in batches of 1. `isShaderFailure` names the errors that mean "use the cpu backend".

### the note decoder is written here

`decodeNotes` is written from the model's published output description (onset peaks, frame posteriors over a threshold, gaps up to 2 frames bridged); it is a separate decoder from the basic-pitch library's. Velocity is the mean frame posterior and bin 0 is MIDI 21 (A0). `DETAILS` holds the tight, normal and loose presets.

### refinement

`refineNotes` merges same pitch splits within `mergeGap` and drops +12, +19 and +24 semitone ghosts of a louder, longer note; `keepMonophonic` keeps one line, the higher or the lower.

### drums and tempo

`drumNotes` resamples to 22050 Hz with a windowed sinc, filters kick, snare and hat bands (tom optional), finds onsets per band, groups them on one 25 ms event grid with cross band rules, and emits General MIDI 36, 38, 42 and 45. `estimateTempo` uses onset autocorrelation at 11025 Hz. `fitGridToNotes` fits a grid to note times by vector strength and returns null when R is under 0.25.

## API overview

| export | what it does |
|---|---|
| [`attachNotes`](../../docs/api/notes/README.md#attachnotes) | add the Basic Pitch record to a models hub |
| [`tfjsPitchProvider`](../../docs/api/notes/README.md#tfjspitchprovider) | the tfjs factory that loads Basic Pitch |
| [`runPitch`](../../docs/api/notes/README.md#runpitch) | frames and onsets for a 22050 Hz mono signal |
| [`decodeNotes`](../../docs/api/notes/README.md#decodenotes) | notes from frame and onset posteriors |
| [`refineNotes`](../../docs/api/notes/README.md#refinenotes) | merge splits, drop ghosts and dust |
| [`keepMonophonic`](../../docs/api/notes/README.md#keepmonophonic) | one note at a time |
| [`DETAILS`](../../docs/api/notes/README.md#details) | tight, normal and loose presets |
| [`drumNotes`](../../docs/api/notes/README.md#drumnotes) | drum hits as General MIDI notes |
| [`estimateTempo`](../../docs/api/notes/README.md#estimatetempo) | bpm and grid offset from audio |
| [`fitGridToNotes`](../../docs/api/notes/README.md#fitgridtonotes) | bpm and offset from note times, or null |
| [`writeMidi`](../../docs/api/notes/README.md#writemidi) | a format 1 MIDI file |
| [`notesStubs`](../../docs/api/notes/README.md#notesstubs) | a stub pitch model for tests |

The full reference is in [docs/api/notes](../../docs/api/notes/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| Basic Pitch (Spotify), `@spotify/basic-pitch@1.0.1` | `basic-pitch` | 1 MB (inferred) | Apache-2.0 | `https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json` |

No weights ship in this package. tfjs `loadGraphModel` fetches the graph from the record's URL, so it goes through the browser's HTTP cache; this package does not route it through `@hackbuild/weights` (from the code). The models hub prints the weight licence on first load.

## Browser support

| feature | needs | WebGPU | WASM | threads | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|---|---|---|
| Basic Pitch | tfjs webgl, else cpu | not used | not used | no | yes (inferred) | unknown | unknown | unknown |
| drums, tempo, grid | audio-dsp wasm (simd128) | not used | yes | no | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| decoding, refinement, MIDI | nothing | not used | not used | no | yes | yes | yes | yes |

When the webgl backend fails to start or a shader fails to compile, the ladder falls to the cpu backend in batches of 1.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `tfjs webgl backend did not start` | tfjs refused the webgl backend | the hub falls to the cpu rung; check that the tfjs you pass in has webgl |
| `tfjs cpu backend did not start` | the tfjs you passed in has no cpu backend | pass the full tfjs 3.21.0 build |
| `notes stopped` (AbortError) | the `signal` you passed aborted | expected; start again when you want notes |
| `no factory for provider tfjs; call hub.provide("tfjs", ...)` | the hub has no tfjs factory | call `hub.provide("tfjs", tfjsPitchProvider(...))` before `hub.use("notes")` |

## Works with

- [@hackbuild/audio-dsp](../audio-dsp/README.md) runs the drum filters, onsets, tempo and grid, and writes the MIDI file.
- [@hackbuild/media](../media/README.md) decodes a file to the 22050 Hz mono `runPitch` takes.
- [@hackbuild/stems](../stems/README.md) separates a mix first, so you can hand the bass stem to `runPitch` and the drum stem to `drumNotes`.
- [@hackbuild/models](../models/README.md) is the hub that loads and schedules the model.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/notes` passes 6 tests under Node
  22.18.0 with the real audio-dsp wasm core and fake tfjs: window framing
  and the kept frame count, the provider falling from webgl to cpu after
  a shader compile error, note decoding with gap bridging and onset
  splits, refinement and the monophonic line, the stub path into a MIDI
  file, and a synthetic 120 bpm kit giving kicks, snares, tempo and grid.

### Not verified by anything

- Basic Pitch in a browser and the decoder against the basic-pitch
  library's notes on the same audio; note accuracy.
- Drums and tempo on real recordings.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,572 bytes | 5,850 bytes |
| `dist/single/index.iife.js` (single file build) | 6,362 bytes | 6,680 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. The Basic Pitch weights are Apache-2.0 (Spotify) and are not part of this package.

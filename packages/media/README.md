# @hackbuild/media

Decode a file's audio at the rate a model wants, pick keyframes from a video, and record a canvas, all in the tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/media)](https://www.npmjs.com/package/@hackbuild/media) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 2.1 kB measured](https://img.shields.io/badge/gzip-2.1%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Decodes the audio track of a file or Blob with the browser's own decoder and resamples it to the rate you ask for.
- Picks keyframes from frames you sampled, by how far each frame's brightness histogram moved.
- Records a canvas or any MediaStream with the first webm or mp4 type the browser supports.
- Takes every browser object as an optional argument, so tests and workers pass their own.

## Install

```sh
npm install @hackbuild/media
```

No dependencies and no peers. It runs no model and fetches nothing.

## Quick start

```ts
import { decodeAudio, lumaHistogram, pickKeyframes, sampleTimes } from "@hackbuild/media";

const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const file = input.files![0]!;
  const { channels, duration } = await decodeAudio(file, 16000); // the audio at 16 kHz for speech to text
  console.log(`${channels.length} channels, ${duration.toFixed(1)} s`);
  // one small frame a second off a video element, then keyframes by scene change
  const video = Object.assign(document.createElement("video"), { src: URL.createObjectURL(file), muted: true });
  await new Promise((r) => (video.onloadeddata = r));
  const g = new OffscreenCanvas(64, 36).getContext("2d")!;
  const frames: { t: number; hist: Float32Array }[] = [];
  for (const t of sampleTimes(video.duration, 1)) {
    video.currentTime = t;
    await new Promise((r) => (video.onseeked = r));
    g.drawImage(video, 0, 0, 64, 36);
    frames.push({ t, hist: lumaHistogram(g.getImageData(0, 0, 64, 36).data) });
  }
  console.log("keyframes at", pickKeyframes(frames, { threshold: 0.3, maxGap: 10, max: 12 }).map((i) => frames[i]!.t));
};
```

## Live example

The transcribe example decodes a dropped file through this package: [hackbuild-suite transcribe](https://hackbuild.github.io/hackbuild-suite/#/voice/transcribe). The package page is at [hackbuild-browser-ai/media](https://hackbuild.github.io/hackbuild-browser-ai/media/).

## Concepts

### decoding goes through the browser

`decodeAudio` hands the bytes to an OfflineAudioContext and, when the rate differs, renders the buffer again at the rate you asked for. Whatever plays in a video tag in that browser decodes; mkv and avi usually do not. It copies an ArrayBuffer before decoding, so yours stays usable. Use 16000 for speech models and 44100 for stem separation.

### keyframes are picked from histograms

`lumaHistogram` turns RGBA pixels into a 32 bin brightness histogram that sums to 1, and `histDistance` gives half the L1 distance of two of them, 0 for the same and 1 for disjoint. `pickKeyframes` keeps the first frame, each frame that moved more than `threshold` from the last keyframe, one at least every `maxGap` seconds, and, past `max`, the biggest changes. `sampleTimes` gives the times to seek to.

### recording picks a type

`record` tries `RECORDER_TYPES` in order (vp9, vp8, plain webm, then mp4) and returns `stop()`, which resolves the Blob, and the `mimeType` it chose. An empty type means the browser default.

## API overview

| export | what it does |
|---|---|
| [`decodeAudio`](../../docs/api/media/README.md#decodeaudio) | decode a file's audio and resample it to a target rate |
| [`lumaHistogram`](../../docs/api/media/README.md#lumahistogram) | a 32 bin brightness histogram of RGBA pixels |
| [`histDistance`](../../docs/api/media/README.md#histdistance) | the distance of two histograms, 0 to 1 |
| [`pickKeyframes`](../../docs/api/media/README.md#pickkeyframes) | indices of the frames to keep |
| [`sampleTimes`](../../docs/api/media/README.md#sampletimes) | seek times every step seconds inside a clip |
| [`record`](../../docs/api/media/README.md#record) | record a MediaStream until `stop()` |
| [`pickMime`](../../docs/api/media/README.md#pickmime) | the first recorder type the browser supports |
| [`RECORDER_TYPES`](../../docs/api/media/README.md#recorder_types) | the types `pickMime` tries, in order |

The full reference is in [docs/api/media](../../docs/api/media/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| `decodeAudio` | OfflineAudioContext | yes | yes | yes | yes (inferred) |
| `record` | MediaRecorder | webm | mp4 | webm | yes (inferred) |
| keyframes | nothing | yes | yes | yes | yes |

No WebGPU and no wasm. `decodeAudio` needs a page; a worker has no OfflineAudioContext, so decode on the page and post the channels across. The containers each browser decodes are its own; this package adds no demuxer.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `no OfflineAudioContext here. decode on the page, not in a worker.` | called in a worker or in Node | decode on the page, or pass a constructor as the third argument |
| `this browser will not decode the audio track (...)` | the browser refused the container or codec | convert to mp4, webm, mp3 or wav; mkv and avi usually fail |
| `no MediaRecorder in this browser. recording is off.` | no MediaRecorder | pass `Recorder`, or hide the record control and say why |

A page cannot fetch YouTube audio: the request is blocked by CORS. That needs an extension or a proxy you run.

## Works with

- [@hackbuild/transcribe](../transcribe/README.md) takes the 16 kHz mono channel from `decodeAudio`.
- [@hackbuild/stems](../stems/README.md) takes 44.1 kHz stereo from `decodeAudio`.
- [@hackbuild/vision](../vision/README.md) can caption the keyframes `pickKeyframes` chose.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/media` under Node 22.18.0 with fake browser objects: decode and resample flow and the refused container message, histogram distance and keyframe picking with gap and cap, MIME picking and chunk collection | passes 3 tests |

### Not verified by anything

- Real decoding of mp4, mov, webm and mkv files in Chrome, Safari and
  Firefox; real recording; ffmpeg.wasm or WebCodecs paths (not built).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 2,073 bytes | 2,176 bytes |
| `dist/single/index.iife.js` (single file build) | 2,059 bytes | 2,161 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

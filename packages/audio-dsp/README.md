# @hackbuild/audio-dsp

Filter, clean, measure and time speech and music in the tab on a Rust wasm core, and write the WAV, MIDI, subtitle and zip files the results go into.

[![npm](https://img.shields.io/npm/v/@hackbuild/audio-dsp)](https://www.npmjs.com/package/@hackbuild/audio-dsp) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 9.4 kB measured](https://img.shields.io/badge/gzip-9.4%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Runs DSP kernels in a Rust core built for wasm32 with simd128: dc block, biquads, frame levels, noise floor, spectral subtraction, limiter, resampling, STFT, onsets, tempo, grid fit and LPC formants.
- Gives the same bits in the wasm and native builds, since its math functions are written out in the crate.
- Gates speech from frame levels and plans overlap add segments for models that take fixed length input.
- Writes txt, srt, vtt, json and lrc transcripts, WAV, standard MIDI files and store only zips, and reads WAV, lrc and those zips back.

## Install

```sh
npm install @hackbuild/audio-dsp
```

No dependencies and no peers. The wasm core ships as `@hackbuild/audio-dsp/audio-dsp.wasm` and, as base64, in the `@hackbuild/audio-dsp/inline` subpath. It runs no model and fetches nothing unless you pass `{ url }`.

## Quick start

```ts
import { encodeWav, gate, gateThreshold, loadDsp, toSrt } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

// the wasm core, inlined; { url } or { bytes } load it from elsewhere
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const pcm = new Float32Array(16000 * 10); // 10 s of 16 kHz mono

// clean the wire: dc block, 80 Hz high pass, denoise from a noise print, limit
const clean = dsp.biquad(dsp.dcBlock(pcm), "highpass", 80, 16000);
const db = dsp.frameDb(clean); // 25 ms frames on a 10 ms hop
const floor = dsp.noiseFloor(db);
const noise = dsp.noiseSpectrum(clean, db, floor);
const safe = dsp.limit(noise ? dsp.denoise(clean, noise, 1.8, 0.08) : clean, 0.891, 16000);

// speech regions 6 dB over the floor, then a WAV and an srt of them
const regions = gate(db, gateThreshold(floor, dsp.percentile(db, 0.95)), safe.length);
const wav = encodeWav([safe], 16000);
console.log(wav.length, "bytes", toSrt(regions.map(([a, b]) => ({ start: a / 16000, end: b / 16000, text: "speech" }))));
```

## Live example

The suite's transcribe page runs its front end on this core: [hackbuild-suite transcribe](https://hackbuild.github.io/hackbuild-suite/#/voice/transcribe). The package page, with a click track and a 10 minute timing run, is at [hackbuild-browser-ai/audio-dsp](https://hackbuild.github.io/hackbuild-browser-ai/audio-dsp/).

## Concepts

### loading the core

`loadDsp` takes `{ url }`, `{ bytes }` or `{ base64 }` (the inlined `AUDIO_DSP_WASM_BASE64`) and returns a `Dsp`. Every method copies its input into wasm memory, runs one kernel and returns a new `Float32Array`, so you keep plain arrays. `simd` says whether the build runs its sums on simd128 lanes. Rebuild the wasm and the inlined base64 with `npm run build:wasm -w @hackbuild/audio-dsp`.

### the kernels

All from the earlier transcription tool's July and August builds unless noted: dc blocker (pole 0.9975), RBJ biquads, frame levels (25 ms frames on a 10 ms hop at 16 kHz), percentiles, minimum statistics noise floor (median of 1.5 s minima), spectral subtraction from a noise print (512 point sqrt Hann, median of up to 320 quiet frames, temporal and cross bin gain smoothing), lookahead limiter (4 ms blocks, 120 ms release), resampling (windowed sinc, linear, and the earlier live captioner style FIR decimator), Hann STFT magnitudes, RMS and peak envelopes, onset picking (novelty over a local mean), tempo by autocorrelation with a phase search, a vector strength grid fit, and LPC formants.

### the sinc resampler

The sinc takes a polyphase table of normalized kernels when both rates are whole numbers and the reduced ratio has at most 4096 output phases, and evaluates the kernel per tap otherwise.

### formants

`dsp.formants(x, sr, center, winSec, decim, order)` is ported from bellowsjs `estimateFormants` (`packages/bellows/src/analysis/formants.ts`, MIT, by the same owner): decimate through a windowed sinc low pass, pre-emphasis, a Hamming window, autocorrelation and Levinson-Durbin, then the predictor roots by Durand-Kerner, giving `{ f, bw }` in Hz ascending, poles wider than 700 Hz dropped. The crate reuses its buffers between calls. `dsp.vowel(n, sr, f0, f1, f2, f3)` makes a test vowel.

### same bits everywhere

sin, cos, exp, ln and atan2 are written out in the crate, so the native and wasm builds give the same bits. `dsp.math()` exposes them and `dsp.synth(seed, n, sr)` makes the seeded parity signal.

### the gate

`gate(db, threshold, n)` is the earlier transcription tool's hysteresis gate: on after 3 frames, off after 25, 0.25 s pad, merge under 0.30 s, drop under 0.20 s. Regions come back in samples, end exclusive. `gateThreshold(floor, p95, margin)` places the threshold and `coverage(regions, a, b)` gives the share of a span the gate kept.

### overlap add

`planSegments`, `fadeWeight` and `OverlapAdd` are the htdemucs overlap add from an earlier August build: segments of S samples on a stride of S (1 - overlap), overlap capped at 0.6, a linear crossfade over min(S - stride, S / 4) at each end, weights floored at 1e-4, and a division by the summed weights.

### writers

`toTxt`, `toSrt`, `toVtt` and `toJson` write the earlier transcription tool's layouts byte for byte; `toLrc`, `parseLrc` and `spreadWords` follow earlier builds. `encodeWav` writes 16 bit PCM or 32 bit float and `decodeWav` reads them back. `writeMidi` writes format 1, 480 ticks per quarter, drums on channel 10, note times in seconds. `zipStore` writes a store only zip, reproducible with a fixed date, and `unzipStore` reads such a zip back and checks each entry's crc32.

## API overview

| export | what it does |
|---|---|
| [`loadDsp`](../../docs/api/audio-dsp/README.md#loaddsp) | instantiate the wasm core |
| [`Dsp`](../../docs/api/audio-dsp/README.md#dsp) | the kernels: filters, levels, denoise, limiter, resampling, STFT, onsets, tempo, formants |
| [`gate`](../../docs/api/audio-dsp/README.md#gate) | speech regions from frame levels |
| [`gateThreshold`](../../docs/api/audio-dsp/README.md#gatethreshold) | a gate threshold from the floor and loud levels |
| [`coverage`](../../docs/api/audio-dsp/README.md#coverage) | the share of a span the gate kept |
| [`planSegments`](../../docs/api/audio-dsp/README.md#plansegments) | overlap add segments for a fixed length model |
| [`OverlapAdd`](../../docs/api/audio-dsp/README.md#overlapadd) | accumulate and crossfade segment outputs |
| [`toSrt`](../../docs/api/audio-dsp/README.md#tosrt) | srt text, with `toTxt`, `toVtt`, `toJson` and `toLrc` beside it |
| [`parseLrc`](../../docs/api/audio-dsp/README.md#parselrc) | lines of an lrc file |
| [`encodeWav`](../../docs/api/audio-dsp/README.md#encodewav) | WAV bytes from channels |
| [`decodeWav`](../../docs/api/audio-dsp/README.md#decodewav) | channels from WAV bytes |
| [`writeMidi`](../../docs/api/audio-dsp/README.md#writemidi) | a format 1 MIDI file |
| [`zipStore`](../../docs/api/audio-dsp/README.md#zipstore) | a store only zip |
| [`unzipStore`](../../docs/api/audio-dsp/README.md#unzipstore) | read a store only zip with crc checks |

The full reference is in [docs/api/audio-dsp](../../docs/api/audio-dsp/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| `loadDsp` and the kernels | WebAssembly with simd128 | yes | yes (inferred) | yes (inferred) | yes (inferred) |
| gate, overlap add, writers | nothing | yes | yes | yes | yes |

No WebGPU and no wasm threads. A browser without wasm SIMD cannot instantiate the core, and there is no scalar fallback build (inferred from the build script). Loading from file:// is meant to work through the inlined base64 but has not been tried in a real page. Node runs it too; the tests do.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `audio-dsp wasm: http <status> for <url>` | `loadDsp({ url })` got a failed response | check the URL, or load `{ base64 }` from the inline subpath |
| `frameDb: hop <h> and frame <f> must be integers of at least 1` (RangeError) | bad frame settings | pass whole numbers of 1 or more |
| `stftMag: window <w> must be a power of two` (RangeError) | window not a power of two | use 512, 1024 or 2048 |
| `stftMag: hop <h> must be an integer of at least 1` (RangeError) | bad hop | pass a whole number of 1 or more |
| `not a wav file: no RIFF WAVE header` | `decodeWav` got another format | decode it with @hackbuild/media instead |
| `wav data before fmt chunk` / `wav: no data chunk` | a damaged WAV | write it again |
| `wav: <bits> bit format <fmt> is not supported` | a WAV layout `decodeWav` does not read | convert to 16 bit PCM or 32 bit float |
| `not a zip file: no end of central directory` | `unzipStore` got another file | pass a zip from `zipStore` |
| `zip directory entry <i> is damaged` / `zip entry <name> fails its crc32 check` | a damaged zip | write it again |
| `zip entry <name> is compressed; only store only zips are read` | a deflated zip | read it with a zip library |

## Works with

- [@hackbuild/transcribe](../transcribe/README.md) runs its front end on this core and its exports on these writers.
- [@hackbuild/notes](../notes/README.md) uses onsets, tempo, grid fit and `writeMidi`.
- [@hackbuild/stems](../stems/README.md) runs htdemucs through the overlap add planner.
- [@hackbuild/speak](../speak/README.md) writes rendered speech with `encodeWav`.
- [@hackbuild/media](../media/README.md) decodes the files whose channels you pass in.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-audio-dsp` passes 11 tests (10
  unit, 1 parity fixture) under rustc 1.95; `cargo clippy -D warnings`
  passes natively; `cargo fmt --check` passes. Clippy for wasm32 first
  ran on 2026-11-23 under the rustup 1.95.0 toolchain and passes; the
  wasm32 claim made on 2026-11-22 could not have run, since the Homebrew
  rustc has no wasm32 standard library.
- 2026-11-22: `npx vitest run packages/audio-dsp` passes 16 tests (19 on 2026-11-23, local fixture suite included) under
  Node 22.18.0, including native and wasm parity: the wasm build (simd128
  on) gives the same bits as the native build for 14 kernel outputs over
  a seeded 3 s signal (hashed), the onset list, tempo, grid fit, noise
  floor and percentile, and 35 math samples.
- 2026-11-22: parity with real exports from an earlier transcription tool: `toTxt`, `toSrt`, `toVtt`
  and `toJson` reproduce byte for byte the 76 txt, srt, vtt and json files
  of one batch zip from that tool (19 transcripts) from their segments. Those
  files hold personal speech, so they stay out of git; the test reads
  `.local/transcripts` (gitignored) or `TRANSCRIPT_FIXTURES` and is skipped
  without them.

- 2026-11-23: `cargo test -p hackbuild-audio-dsp` passes 14 tests (13
  unit, 1 parity fixture); the parity fixture adds a test vowel and its
  three formants, and the wasm build gives the same bits (vitest, 17
  tests). Against bellowsjs 0.5.0's `estimateFormants` on 15 frames of
  five test vowels, the port agrees within 7.1e-9 Hz on all 45 formants;
  1,000 frames of a 10 s vowel took 214 ms in wasm against 283 ms in the
  JS, Node 22.18.0 (measured).

- 2026-11-23: the sinc resampler from 16 to 48 kHz over 10 minutes took
  3,751 ms in wasm in Node 22.18.0 (measured), where the per tap kernel
  took 4,825 ms for 30 s, about 96.5 s for 10 minutes (computed; the
  browser pass measured 94,421 ms). The table output stays within 1e-5 of
  the per tap kernel on four rate pairs (crate test) and the parity
  fixture's sinc hash did not move.

### Not verified by anything

- The kernels against the earlier transcription tool JS functions sample for sample. The
  crate keeps their arithmetic order but sums frames in two lanes, so
  the numbers differ from the JS builds in the last bits (inferred, not
  measured).
- Speed in a browser: no timing was taken.
- Loading the wasm from file:// in a real page.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 9,440 bytes | 9,912 bytes |
| `wasm/audio-dsp.wasm` | 27,444 bytes | 28,816 bytes |
| `dist/single/index.iife.js` (single file build) | 9,303 bytes | 9,768 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)), the Rust crate included; this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights.

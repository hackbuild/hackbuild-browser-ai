# @hackbuild/audio-dsp

Speech and music DSP for the browser: a Rust core built for wasm32 with
SIMD128 (`crates/audio-dsp`) and TS around it for the gate, overlap add
and file writers. Code MIT; this README CC-BY-4.0 with the code samples
also MIT. No model and no weights here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/audio-dsp

## Core

    import { loadDsp } from "@hackbuild/audio-dsp";
    import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

    const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 }); // or { url } or { bytes }
    const clean = dsp.biquad(dsp.biquad(dsp.dcBlock(pcm), "highpass", 80, 16000), "highpass", 80, 16000);
    const db = dsp.frameDb(clean);                    // 25 ms frames, 10 ms hop at 16 kHz
    const floor = dsp.noiseFloor(db);                 // median of 1.5 s minima
    const noise = dsp.noiseSpectrum(clean, db, floor);
    const quiet = noise ? dsp.denoise(clean, noise, 1.8, 0.08) : clean;
    const safe = dsp.limit(quiet, 0.891, 16000);

Kernels, all from the earlier transcription tool's July and August builds unless noted:
dc blocker (pole 0.9975), RBJ biquads, frame levels, percentiles, minimum
statistics noise floor, spectral subtraction from a noise print (512
point sqrt Hann, median of up to 320 quiet frames, temporal and cross bin
gain smoothing), lookahead limiter (4 ms blocks, 120 ms release),
resampling (windowed sinc, linear, and the earlier live captioner style FIR decimator; the
sinc takes a polyphase table of normalized kernels when both rates are
whole numbers and the reduced ratio has at most 4096 output phases, and
evaluates the kernel per tap otherwise),
Hann STFT magnitudes, RMS and peak envelopes, onset picking (novelty over
a local mean), tempo by autocorrelation with a phase search, a vector
strength grid fit, and LPC formants.

`dsp.formants(x, sr, center, winSec, decim, order)` is ported from
bellowsjs `estimateFormants` (`packages/bellows/src/analysis/formants.ts`,
MIT, by the same owner): decimate through a windowed sinc low pass,
pre-emphasis, a Hamming window, autocorrelation and Levinson-Durbin, then
the predictor roots by Durand-Kerner, giving `{ f, bw }` in Hz ascending,
poles wider than 700 Hz dropped. The crate reuses its buffers between
calls. `dsp.vowel(n, sr, f0, f1, f2, f3)` makes a test vowel.

Every kernel copies its input into wasm memory and returns a new
`Float32Array`. sin, cos, exp, ln and atan2 are written out in the crate,
so the native and wasm builds give the same bits.

## TS

- `gate(db, threshold, n)`: the earlier transcription tool hysteresis gate (on after 3 frames,
  off after 25, 0.25 s pad, merge under 0.30 s, drop under 0.20 s),
  `gateThreshold(floor, p95, margin)` and `coverage(regions, a, b)`.
- `planSegments`, `fadeWeight`, `OverlapAdd`: the htdemucs overlap add
  from an earlier August build.
- Writers: `toTxt`, `toSrt`, `toVtt`, `toJson` (as earlier builds did),
  `toLrc`, `parseLrc`, `spreadWords` (as earlier builds did), `encodeWav` and `decodeWav`,
  `writeMidi` (format 1, 480 ticks per quarter, drums on channel 10,
  note times in seconds), `zipStore` (store only, reproducible with a
  fixed date) and `unzipStore`, which reads such a zip back and checks
  each entry's crc32.

Rebuild the wasm and the inlined base64 with `npm run build:wasm -w
@hackbuild/audio-dsp`.

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
| `dist/index.js` (main entry, imports external) | 9,218 bytes | 9,678 bytes |
| `wasm/audio-dsp.wasm` | 27,444 bytes | 28,816 bytes |
| `dist/single/index.iife.js` (single file build) | 9,049 bytes | 9,501 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

# @hackbuild/audio-dsp

Speech and music DSP for the browser: a Rust core built for wasm32 with
SIMD128 (`crates/audio-dsp`) and TS around it for the gate, overlap add
and file writers. Code MIT; this README CC-BY-4.0 with the code samples
also MIT. No model and no weights here.

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

Kernels, all from the SCRIBE July and August builds unless noted:
dc blocker (pole 0.9975), RBJ biquads, frame levels, percentiles, minimum
statistics noise floor, spectral subtraction from a noise print (512
point sqrt Hann, median of up to 320 quiet frames, temporal and cross bin
gain smoothing), lookahead limiter (4 ms blocks, 120 ms release),
resampling (windowed sinc, linear, and the KERF style FIR decimator),
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

- `gate(db, threshold, n)`: the SCRIBE hysteresis gate (on after 3 frames,
  off after 25, 0.25 s pad, merge under 0.30 s, drop under 0.20 s),
  `gateThreshold(floor, p95, margin)` and `coverage(regions, a, b)`.
- `planSegments`, `fadeWeight`, `OverlapAdd`: the htdemucs overlap add
  from SHEAR and SCRIBE August.
- Writers: `toTxt`, `toSrt`, `toVtt`, `toJson` (SCRIBE layouts),
  `toLrc`, `parseLrc`, `spreadWords` (JIG), `encodeWav` and `decodeWav`,
  `writeMidi` (format 1, 480 ticks per quarter, drums on channel 10,
  note times in seconds), `zipStore` (store only, reproducible with a
  fixed date).

Rebuild the wasm and the inlined base64 with `npm run build:wasm -w
@hackbuild/audio-dsp`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-audio-dsp` passes 11 tests (10
  unit, 1 parity fixture) under rustc 1.95; `cargo clippy -D warnings`
  passes natively and for wasm32, `cargo fmt --check` passes.
- 2026-11-22: `npx vitest run packages/audio-dsp` passes 16 tests under
  Node 22.18.0, including native and wasm parity: the wasm build (simd128
  on) gives the same bits as the native build for 14 kernel outputs over
  a seeded 3 s signal (hashed), the onset list, tempo, grid fit, noise
  floor and percentile, and 35 math samples.
- 2026-11-22: parity with real SCRIBE exports: `toTxt`, `toSrt`, `toVtt`
  and `toJson` reproduce byte for byte the 76 txt, srt, vtt and json files
  of one SCRIBE batch zip (19 transcripts) from their segments. Those
  files hold personal speech, so they stay out of git; the test reads
  `.local/scribe` (gitignored) or `SCRIBE_FIXTURES` and is skipped
  without them.

- 2026-11-23: `cargo test -p hackbuild-audio-dsp` passes 13 tests (12
  unit, 1 parity fixture); the parity fixture adds a test vowel and its
  three formants, and the wasm build gives the same bits (vitest, 17
  tests). Against bellowsjs 0.5.0's `estimateFormants` on 15 frames of
  five test vowels, the port agrees within 7.1e-9 Hz on all 45 formants;
  1,000 frames of a 10 s vowel took 214 ms in wasm against 283 ms in the
  JS, Node 22.18.0 (measured).

### Not verified by anything

- The kernels against the SCRIBE JS functions sample for sample. The
  crate keeps their arithmetic order but sums frames in two lanes, so
  the numbers differ from the JS builds in the last bits (inferred, not
  measured).
- Speed in a browser: no timing was taken.
- Loading the wasm from file:// in a real page.

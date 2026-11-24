# @hackbuild/stems

Stem separation in a tab: htdemucs on onnxruntime-web through the models
hub, an own overlap add runner, and a realtime factor readout. From an earlier August build. Code MIT; this README CC-BY-4.0 with the code samples
also MIT. No weights ship here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/stems

    import { attachStems, separate, stemsStubs } from "@hackbuild/stems";
    attachStems(hub);                       // records; the ort provider comes from @hackbuild/devices
    const { stems, rtf } = await separate(hub, left44k, right44k, { model: "htdemucs-fast", onProgress });
    // stems.drums, stems.bass, stems.other, stems.vocals: { left, right }

| record | file | size (vendor) | overlap | weight licence |
|---|---|---|---|---|
| htdemucs-fast | StemSplitio htdemucs_fp16weights.onnx | 166 MB | 0.10 | MIT (htdemucs); the export's own terms not checked |
| htdemucs-slow | StemSplitio htdemucs.onnx | 316 MB | 0.40 | MIT (htdemucs); the export's own terms not checked |

Segments are 343980 samples at 44.1 kHz; crossfades are linear over
min(S minus stride, S / 4), weights floored at 1e-4. Pass `schedule` to
keep a rendering page smooth (see the models hub). Separate first, then
hand a stem to transcribe or notes (an earlier lyrics tool).

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/stems` passes 3 tests under Node
  22.18.0 with fakes: tiers and licences, stub separation whose stems sum
  back to the mix across segment seams, an ort record through a fake
  session picking the time domain output, and the refusal of two input
  exports.

### Not verified by anything

- htdemucs in a browser on webgpu or wasm; separation quality; realtime
  factors.
- The earlier stem splitter medium tier (the demucs-web embedded graph with a spectrogram
  input): not built, since its STFT branch is not written here.
- A worker path for wasm (an earlier stem splitter ran wasm in a blob module worker): not
  built; run the call inside a worker with the single file build.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 2,199 bytes | 2,308 bytes |
| `dist/single/index.iife.js` (single file build) | 28,349 bytes | 29,766 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

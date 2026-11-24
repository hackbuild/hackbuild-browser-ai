# @hackbuild/transcribe

Speech to text in a tab: the quiet speech front end, silence
reel packing with a source map back to file time, Whisper and Moonshine
records for the models hub, the phantom text filter, the earlier live captioner live
segmenter and a Web Speech adapter. Code MIT; this README CC-BY-4.0 with
the code samples also MIT. No weights ship here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/transcribe

## Files

    import { createHub, stubFactory } from "@hackbuild/models";
    import { tjsProvider, loadTransformers } from "@hackbuild/devices";
    import { loadDsp } from "@hackbuild/audio-dsp";
    import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
    import { attachTranscribe, transcribe, transcribeStubs, defaultTranscribeId } from "@hackbuild/transcribe";

    const hub = createHub({ env, stub: new URLSearchParams(location.search).has("stub") });
    attachTranscribe(hub);
    hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
    hub.provide("stub", stubFactory(transcribeStubs()));
    const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
    const out = await transcribe(hub, dsp, pcm16k, { model: defaultTranscribeId(env.webgpu), language: "en" });
    // out.segments, out.dropped (with the reason), out.stats (levels in dB, computed)

Steps, with the earlier transcription tool's numbers: dc block, 80 Hz high pass twice, a 250 to
3800 Hz copy for speech decisions, minimum statistics floor, gate at
floor + 6 dB, speech level and a gain toward -20 dBFS capped at +60 dB;
reels of at most 26 s cut on the quietest frame of the last 2 s, runs
joined by 0.12 s of silence; each reel denoised, levelled again (plus or
minus 9 dB), gained and limited at 0.891; one ASR call per reel through
`hub.run` (pass `schedule` to keep a rendering page smooth, see the
models hub); times mapped back; the phantom filter.

## Models

| record | weights | licence | ladder |
|---|---|---|---|
| whisper-large-v3-turbo | onnx-community, about 900 MB (inferred) | MIT | fp16 encoder plus q4 decoder, fp32 encoder, q8 on wasm |
| whisper-base | onnx-community, about 90 MB (inferred) | MIT | fp32 plus q4 on webgpu, q8 on wasm |
| whisper-small.en, base.en, tiny.en | Xenova, 250, 90, 40 MB (inferred) | MIT | fp32 on webgpu, q8 on wasm |
| moonshine-base | onnx-community, about 250 MB (inferred) | MIT for the english models per the model card, not checked further | fp32 plus q4, q8 on wasm |

## Live

    const seg = new LiveSegmenter({ mode: "squelch", inputRate: 48000, onSegment: async (s) => { /* transcribe s.pcm */ seg.done(); } });
    seg.push(block, blockDb(block) > -45);

Squelch mode cuts after 500 ms of closed gate; fixed mode every 8 s; any
segment at 24 s; segments under 0.7 s are dropped; at most 4 wait.
`webSpeech({ onSegment })` wraps the browser's recognizer (Chrome sends
the audio to its service; tell the user).

## Queue, languages, rail and exports

    import { createQueue, languagesFor, regate, railBins, bundle, asSrt } from "@hackbuild/transcribe";

    const q = createQueue({
      decode: (file) => decodeAudio(file),                       // @hackbuild/media
      run: (a, { signal, progress }) => transcribe(hub, dsp, toMono(a.channels), { signal, onProgress: (p) => progress(p.done / p.total) }),
      onChange: (jobs) => render(jobs),                          // queued, running (decoding, working), done, failed
    });
    const { skipped, warnings } = q.add(droppedFiles);           // ui lines, lowercase
    await q.start();                                             // q.stop(), q.cancel(id), q.retry(id)

`languagesFor(record, wanted)` gives auto detect plus 19 languages, or
english only and locked with the reason; `englishOnly` also catches a
custom repo id ending in `.en`. A transcript carries `rail` (frame levels,
the floor and gate threshold per frame, kept frames), `model` and
`language`; `regate(rail, { vadMargin })` moves the gate without a model
run and `railBins(rail, width)` folds it for drawing. Segments take an
optional `speaker` (by hand), `confidence`, `words` and `edited`.
`asTxt`, `asSrt`, `asVtt` and `asJson` write one file; `bundle(docs)`
writes a store only zip with four files per source and `manifest.json`
holding each file's own model, language and levels.

The english only Whisper rows (Xenova tiny.en, base.en, small.en) stay:
their repos list the fp32 and q8 (`_quantized`) encoder and merged
decoder files the ladder asks for (measured from the hub file listing,
2026-11-24). The earlier transcription tool failed on them because it
passed `task` and `language`, which transformers.js rejects for an
english only model; `transcribe` passes neither to them.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/transcribe` passes 10 tests (18 on 2026-11-23, local fixture suites included) under
  Node 22.18.0 with the real audio-dsp wasm core and fake runtimes: reel
  cuts and the source map, the phantom filter rules, the front end on a
  seeded signal, channel picking, the stub path, a whisper record loaded
  through the transformers.js provider with language passing and the
  english only rule, the live segmenter (tail, blips, queue cap, fixed
  windows, 48 to 16 kHz streaming decimation, and 44.1, 32, 24, 22.05 and 8 kHz to 16 kHz
  through the fractional resampler at the right speed, measured on a 440 Hz tone), and the Web Speech adapter.
- 2026-11-22: parity with real exports from an earlier transcription tool: re-running the phantom
  filter over each transcript's kept plus dropped lines gives the earlier transcription tool's
  split and reasons for all 19 transcripts of one batch zip. The files
  hold personal speech and stay in the gitignored `.local/transcripts`; the
  test is skipped without them. Dropped lines carry no end time in the
  export, so the test gives them 2 s, and coverage is set to full.

- 2026-11-24: `npx vitest run packages/transcribe` passes 29 tests: the
  language list and the english only lock, the four exports with speaker,
  confidence and words, the zip read back with crc checks and the
  manifest, the rail against the analysis and `regate`, and the queue
  states, failure copy, cancel and stop with stub decoders and runs.

### Not verified by anything

- Any Whisper or Moonshine model in a browser; word error rates.
- The queue over real files and `decodeAudio` in a browser.
- The front end against the earlier transcription tool on the same audio file sample for sample;
  no input audio from that tool was available, only its text outputs.
- Moonshine's licence beyond the model card line.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 13,524 bytes | 14,200 bytes |
| `dist/single/index.iife.js` (single file build) | 15,495 bytes | 16,269 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

# @hackbuild/transcribe

Speech to text in a tab: the SCRIBE July quiet speech front end, silence
reel packing with a source map back to file time, Whisper and Moonshine
records for the models hub, the phantom text filter, the KERF live
segmenter and a Web Speech adapter. Code MIT; this README CC-BY-4.0 with
the code samples also MIT. No weights ship here.

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

Steps, with SCRIBE's numbers: dc block, 80 Hz high pass twice, a 250 to
3800 Hz copy for speech decisions, minimum statistics floor, gate at
floor + 6 dB, speech level and a gain toward -20 dBFS capped at +60 dB;
reels of at most 26 s cut on the quietest frame of the last 2 s, runs
joined by 0.12 s of silence; each reel denoised, levelled again (plus or
minus 9 dB), gained and limited at 0.891; one ASR call per reel through
`hub.run`; times mapped back; the phantom filter.

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

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/transcribe` passes 10 tests under
  Node 22.18.0 with the real audio-dsp wasm core and fake runtimes: reel
  cuts and the source map, the phantom filter rules, the front end on a
  seeded signal, channel picking, the stub path, a whisper record loaded
  through the transformers.js provider with language passing and the
  english only rule, the live segmenter (tail, blips, queue cap, fixed
  windows, 48 to 16 kHz streaming decimation), and the Web Speech adapter.
- 2026-11-22: parity with real SCRIBE exports: re-running the phantom
  filter over each transcript's kept plus dropped lines gives SCRIBE's
  split and reasons for all 19 transcripts of one batch zip. The files
  hold personal speech and stay in the gitignored `.local/scribe`; the
  test is skipped without them. Dropped lines carry no end time in the
  export, so the test gives them 2 s, and coverage is set to full.

### Not verified by anything

- Any Whisper or Moonshine model in a browser; word error rates.
- The front end against SCRIBE on the same audio file sample for sample;
  no SCRIBE input audio was available, only its text outputs.
- Moonshine's licence beyond the model card line.

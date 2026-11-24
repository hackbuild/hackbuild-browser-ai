# @hackbuild/listen

Speech in for a talking character: microphone blocks become utterances
through a VAD state machine, each utterance goes to a transcriber and the
phantom text filter, and speech that clears a stricter bar while the
character talks is a barge in. Code MIT; this README CC-BY-4.0 with the
code samples also MIT. No weights ship here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/listen

## Use

    import { openMic, micBlocks, createListener, sileroVad, energyVad, hubTranscriber } from "@hackbuild/listen";

    const stream = await openMic();              // ask first, so the prompt shows before any download
    const ctx = new AudioContext();
    const vad = await sileroVad(ort, sileroBytes); // Silero VAD v5, weights MIT; or energyVad() with no weights
    const listener = createListener({
      vad,
      inputRate: ctx.sampleRate,
      transcribe: hubTranscriber(hub, { model: "whisper-base.en" }), // Whisper, weights MIT
      onUtterance: (u) => u.text && agent.heard(u.text),
      onBargeIn: () => speaker.stop(),
    });
    listener.start();
    await micBlocks(ctx, stream, (b) => listener.push(b));
    speaker = createSpeaker({ ..., onSpeaking: (b) => listener.setTalking(b) });

## Behaviour

- Frames: input is brought to 16 kHz (the transcribe package's FIR
  decimator for 32 and 48 kHz, its windowed sinc resampler for 44.1, 24 and
  22.05 kHz) and cut into 512 sample frames (32 ms, computed).
- Machine: an utterance starts on a frame at or over the positive
  threshold, keeps 300 ms of audio from before the start, is confirmed
  after 250 ms of speech frames and ends after 600 ms under the negative
  threshold; too little speech is a misfire. Utterances are cut at 24 s.
- Barge in: while `setTalking(true)`, thresholds swap to positive 0.85
  and 450 ms of speech (from 0.5 and 250 ms), so the character's own
  voice from the speakers does not count. The confirmed event in that
  state calls `onBargeIn`; the utterance is still transcribed and
  carries `bargeIn: true`.
- Sources: `sileroVad(ort, bytes)` runs Silero VAD v5 on
  onnxruntime-web, 512 new samples with 64 of context and a [2, 1, 128]
  state carried across frames, single threaded wasm by default.
  `energyVad()` maps dB over a tracked noise floor to a probability; it
  cannot tell speech from music.
- Filter: each transcript goes through @hackbuild/transcribe's phantom
  filter with the utterance's speech frames as coverage; a dropped text
  comes back empty with `dropped` naming the reason.
- `openMic` requests echo cancellation, noise suppression and gain
  control. `micBlocks` runs a capture AudioWorklet loaded from a Blob URL
  with a data: URL fallback.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/listen` passes, 11 tests, in Node
  22.18.0: the machine's start, confirm, end, misfire and length cut, the
  threshold swap and barge in, decimated 48 kHz blocks to one utterance,
  the phantom filter, the hub transcriber with a stub model, and the
  Silero feed shapes against a fake onnxruntime.

### Not verified by anything

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
| `dist/index.js` (main entry, imports external) | 4,950 bytes | 5,197 bytes |
| `dist/single/index.iife.js` (single file build) | 6,929 bytes | 7,275 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

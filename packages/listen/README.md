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

## Interim text and dictation

    import { createListener, speechEngine, selfGate, dictate } from "@hackbuild/listen";

    const d = dictate(textarea, { onCommit: (v) => handsFree && send(v) });
    // whisper path: the growing window is decoded again while the person speaks
    const listener = createListener({ vad, transcribe, dropWhileTalking: true, gateMs: 400,
      onInterim: (i) => d.interim(i), onUtterance: (u) => d.final(u.text) });
    // system recognizer path, same event
    const gate = selfGate({ tailMs: 400 });
    const engine = speechEngine({ gate, onInterim: (i) => d.interim(i), onFinal: (t) => d.final(t),
      onState: (s) => mic.state = s }); // off, listening, unsupported, denied
    speaker = createSpeaker({ ..., onSpeaking: (b) => (listener.setTalking(b), gate.setSpeaking(b)) });

- An `Interim` is `{ text, stable, t }`: the whole hypothesis so far, the
  leading words unchanged since the previous one, and seconds since the
  utterance began. Each one replaces the last.
- Window path: every 0.8 s of new audio (computed, `interim.everySec`)
  once the window holds 0.5 s, at most one decode in flight; a result
  that lands after the utterance ended is dropped. `interim.transcribe`
  can name a smaller model than the final one. The phantom filter runs
  on the final only.
- System recognizer: interim results on, restart 150 ms after it ends on
  its own, "denied" when the microphone is refused, "unsupported" with
  no recognizer. Chrome sends the audio to its own service; say so.
- Gate: results that arrive while the character speaks or within
  `tailMs` (default 400 ms, inferred) after are dropped.

## Conversation settings

`CONVERSATION` is a machine preset for spoken turns: 900 ms of quiet ends
an utterance (vendor) in place of the default 600 ms, so a breath does
not cut a sentence. `dropWhileTalking: true` on the listener leaves out
an utterance that began while the character talked, for when barge in
is off.

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
| `dist/index.js` (main entry, imports external) | 7,076 bytes | 7,429 bytes |
| `dist/single/index.iife.js` (single file build) | 8,938 bytes | 9,384 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

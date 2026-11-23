# @hackbuild/speak

Speech out for a character in a tab. A speaker takes the reply while it
streams, cuts it into segments, runs them through the first engine in a
chain that works (Kokoro, Pocket TTS, the system voice), plays PCM back to
back on one AudioContext through one analyser, and reports progress as
offsets in the caller's text when the voice reaches them. Code MIT; this
README CC-BY-4.0 with the code samples also MIT. No weights and no voice
references ship here.

    npm install @hackbuild/speak

## Use

    import { createSpeaker, kokoroEngine, pocketEngine, webSpeechEngine } from "@hackbuild/speak";
    import { runtimeLoader } from "@hackbuild/devices";

    const ctx = new AudioContext();
    const speaker = createSpeaker({
      ctx,
      engines: [
        pocketEngine(),                                                       // Pocket TTS, weights CC-BY-4.0, pinned build
        // Kokoro 82M, weights Apache-2.0; opt in, its phonemizer is GPL (below)
        kokoroEngine({ runtime: runtimeLoader(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]), allowGplPhonemizer: true }),
        webSpeechEngine(),                                                    // system voice
      ],
      onProgress: (p) => director.reached(p.offset),   // action cues, same offsets as the tag parser
      onTimed: (t) => lips.push(t),                     // words or phonemes on the audio clock
      onSpeaking: (b) => listener.setTalking(b),        // barge in threshold swap
      onStatus: (s) => show(s),
    });

    for await (const ev of chat.stream(messages)) if (ev.type === "text") speaker.feed(visible += tags.feed(ev.text).text);
    speaker.feed(visible, true);
    speaker.analyser;   // the one output node for a level or viseme driver
    speaker.stop();     // barge in

## Behaviour

- Offsets: `feed(text)` takes the visible reply (action tags already
  removed by @hackbuild/structured's tag parser). Every `Progress` and
  `TimedEvent` offset is in that text. `speakable()` strips think blocks
  (also unclosed ones), code fences, markdown marks, link targets, emoji
  and variation selectors, reads bare URLs as "link", applies a caller
  lexicon, collapses whitespace, and keeps a map from each spoken
  character back to the input.
- Segments: the first ends at a clause (`,` `;` `:`) once 24 characters
  long, so speech starts early; later ones end at a sentence, or at the
  last clause or space before 160 characters. Abbreviations (Dr., e.g.)
  and decimals do not end a sentence; an open word at the stream's edge
  waits.
- Pipelining: one loop synthesizes segment N+1 while N plays. Chunks are
  scheduled at max(now + 40 ms, end of the last chunk) with a 96 sample
  fade at the start and end of each segment.
- Chain: engines load on first use; a load error, a synth error or the
  watchdog (no audio for 45 s by default) marks the engine failed and the
  same segment goes to the next one. `resetEngines()` clears the marks. A
  native engine waits for queued PCM to finish.
- Timing: engine word or phoneme times are placed on the audio clock.
  Kokoro through kokoro-js reports none, so word times are estimated from
  word length over the segment's duration and marked `estimated`. Web
  Speech reports word boundaries as they happen; its level is a pulse per
  boundary (estimated). A native engine counts as speaking from the
  platform's start event, or its first word boundary when there is none;
  with neither, `onSpeaking` never fires and time to first audio is
  unknown rather than 0.
- Cache: recent clips by engine, voice, rate and text, bounded at 3
  minutes of 24 kHz samples (computed), so a replay does no synthesis.
- `tick()` fires due cues; it runs every 25 ms while speaking, or pass
  `tickMs: 0` and call it per frame.

## Kokoro and the GPL phonemizer

kokoro-js turns text into phonemes with the `phonemizer` package, whose
npm metadata says Apache-2.0 but whose code is eSpeak NG compiled to
wasm, which is GPL-3.0-or-later. This package stays MIT because it never
bundles kokoro-js: the caller passes a loader for it. Kokoro is opt in:
`kokoroEngine` refuses to load unless `allowGplPhonemizer: true` is
passed, and `KOKORO_GPL_NOTICE` holds the text to show. No non-GPL
phonemizer for kokoro-js was found on 2026-11-23, so there is no non-GPL
Kokoro path; the MIT defaults are the bellows voice and the system voice.
An app that ships kokoro-js takes on the GPL terms.

## Pocket TTS

The browser build is a community Space pinned to commit `d0c0c79`
(`POCKET_SPACE_COMMIT`); its weights load from that commit too.
`inference-worker.js` and `sentencepiece.js` are checked against SHA-256
values measured at that commit (`POCKET_SHA256`) before they run, since
they run with the page's origin. Another `base` takes its own `sha256`;
without one its scripts run unchecked and the load says so. A load that
times out or errors terminates its worker. `cloneVoice` waits for a
running generate. The Space card names cc-by-4.0 for the build.

The community browser build's `inference-worker.js` is fetched as text and
four rewrites run through @hackbuild/ai-env: sentencepiece loaded from a
Blob URL with a data: URL fallback, `CHUNK_GAP_SEC` 0.25 to 0.1, one wasm
thread with the proxy off before `wasmPaths`, and relative paths made
absolute against the base. A rewrite that matches nothing is reported as
`patch-missed` and, unless `strictPatches: false`, fails the load so the
chain moves on. The worker spawns classic from a Blob first (file://
refuses module workers). `cloneVoice(samples, rate)` takes a reference
the caller supplies, makes it mono 24 kHz, 15 s at most, peak 0.9, and
encodes it as voice "custom"; nothing is stored or bundled.

## Bellows voice

`bellowsEngine({ runtime, rng })` speaks through bellows-voice, the
owner's articulatory voice for the bellowsjs engine (MIT): a physical
model of a vocal tract, so it has no weights and no weight licence; its
code is MIT and is loaded by the caller, never bundled. `runtime` returns
`bellows-voice/engine` from bellows-voice 0.8.0 on npm (the optional
peer), which imports bellowsjs 0.5.x. `renderSpeechFrom({ bellows,
voice, engine })` is legacy glue for bellows-voice 0.7.3, which has no
`renderSpeech`: the same call built from its public API as bellows' own
`speak()` lays a line out. Each segment goes through its
offline `renderSpeech`, and the chunk carries the exact phoneme spans the
engine sang (no word times; the speaker estimates those).

- Seed: one draw from the injected `rng` when the engine is made, plus the
  segment count, so the same Rng gives the same audio.
- The render runs on the calling thread; pass `render(text, opts, signal)`
  to call `renderSpeech` in a worker instead.
- Voices are the 14 bellows-voice starter voices (`BELLOWS_VOICES`); its
  naturalness is below the neural engines (inferred), so it fits a robot,
  creature or singing voice, or a fallback that needs no download.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/speak` passes, 17 tests, in Node
  22.18.0 with a fake AudioContext, a fake Web Speech API, a fake
  kokoro-js module and a fake Pocket worker: speakable text and its
  offset map, segment cuts, gapless scheduling and fades, progress order
  against the audio clock, the engine chain with a load failure and a
  watchdog trip, the cache, stop, Pocket patching, missed patch refusal,
  chunk streaming and clone preparation.

- 2026-11-23: `test/bellows.test.ts`, 5 tests on a fake module: one
  draw from the rng for the seed, the seed per segment, phoneme times from
  the spans, a refusal without `renderSpeech`, a caller render. Then in
  Node 22.18.0 against a local build of bellows-voice at ac30dc2: a 2.30 s
  line rendered in 873 ms cold and 516 ms warm, byte identical for the
  same rng seed and different for another, 25 phonemes (measured). The
  0.7.3 path through `renderSpeechFrom` gave the same 2.30 s line in 916
  ms cold and 489 ms warm, byte identical for one seed (measured), and a
  unit test checks the score it posts.
- 2026-11-23, later: a test renders "hello there." through the npm
  bellows-voice 0.8.0 `/engine` (a dev dependency at the root): byte
  identical for one rng seed, different for another.

### Not verified by anything

- Any real engine: Kokoro 82M on webgpu fp32 or wasm q8, the Pocket
  worker (its message names are taken from the source builds, not from
  upstream documentation), system voices in Chrome, Safari and Firefox.
- Audible gaps or clicks at chunk joins; looked at by nobody.
- Time to first audio (no measurement).
- Pocket's patches against the current upstream worker source.

# @hackbuild/notes

Audio to notes, from earlier builds: a Basic Pitch runner that frames
windows by hand, a note decoder and refinement, a drum onset detector,
tempo and grid fit on the `@hackbuild/audio-dsp` wasm core, and MIDI out.
Code MIT; this README CC-BY-4.0 with the code samples also MIT. No
weights ship here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/notes

    import { attachNotes, tfjsPitchProvider, runPitch, decodeNotes, refineNotes, DETAILS, drumNotes, estimateTempo, writeMidi } from "@hackbuild/notes";
    attachNotes(hub);
    hub.provide("tfjs", tfjsPitchProvider({ runtime: async () => tf }));   // one shared tfjs 3.21.0
    const m = await hub.use("notes");
    const post = await hub.run(m, (pitch) => runPitch(pitch, mono22050, { onProgress }));
    const notes = refineNotes(decodeNotes(post.frames, post.onsets, DETAILS.normal), DETAILS.normal);
    const drums = drumNotes(dsp, drumStem, 44100);
    const { bpm } = estimateTempo(dsp, mix, 44100);
    const mid = writeMidi([{ name: "bass", notes, program: 33 }, { name: "kit", notes: drums, drums: true }], bpm);

- Model: `basic-pitch`, Spotify's Basic Pitch graph from
  `@spotify/basic-pitch@1.0.1` (Apache-2.0), on the tfjs webgl backend in
  batches of 4 with `WEBGL_SIZE_UPLOAD_UNIFORM` set to 0, else the cpu
  backend in batches of 1.
- Windows of 43844 samples on a 36164 hop, 15 frames trimmed each end,
  only the frames and onsets outputs read.
- `decodeNotes` is written here from the published output description
  (onset peaks, frame posteriors over a threshold, short gaps bridged);
  it is not the basic-pitch library's decoder.
- `refineNotes` merges same pitch splits and drops +12, +19 and +24
  semitone ghosts; `keepMonophonic` keeps one line.
- Drums: kick, snare and hat bands (tom optional), onsets per band, one
  25 ms event grid with cross band rules; General MIDI 36, 38, 42, 45.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/notes` passes 6 tests under Node
  22.18.0 with the real audio-dsp wasm core and fake tfjs: window framing
  and the kept frame count, the provider falling from webgl to cpu after
  a shader compile error, note decoding with gap bridging and onset
  splits, refinement and the monophonic line, the stub path into a MIDI
  file, and a synthetic 120 bpm kit giving kicks, snares, tempo and grid.

### Not verified by anything

- Basic Pitch in a browser and the decoder against the basic-pitch
  library's notes on the same audio; note accuracy.
- Drums and tempo on real recordings.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,063 bytes | 5,316 bytes |
| `dist/single/index.iife.js` (single file build) | 5,780 bytes | 6,069 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

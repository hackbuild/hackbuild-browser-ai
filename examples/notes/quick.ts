import { importEsm } from "@hackbuild/ai-env";
import { createHub } from "@hackbuild/models";
import { attachNotes, decodeNotes, DETAILS, refineNotes, runPitch, tfjsPitchProvider, writeMidi, type PitchModel, type Tfjs } from "@hackbuild/notes";

// a hub with the Basic Pitch record (weights Apache-2.0), tfjs 3.21.0 passed in at runtime
const hub = createHub();
attachNotes(hub);
hub.provide("tfjs", tfjsPitchProvider({ runtime: () => importEsm<Tfjs>("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/+esm") }));

// ten seconds of 22050 Hz mono audio, for example from decodeAudio in @hackbuild/media
const mono = new Float32Array(22050 * 10);

// frame and onset posteriors from Basic Pitch, then notes
const m = await hub.use<PitchModel>("notes");
const post = await hub.run(m, (pitch) => runPitch(pitch, mono, { onProgress: (f) => console.log(`${Math.round(f * 100)} percent`) }));
hub.release(m);
const notes = refineNotes(decodeNotes(post.frames, post.onsets, DETAILS.normal), DETAILS.normal);
// a MIDI file with one bass track at 120 bpm
const mid = writeMidi([{ name: "bass", notes, program: 33 }], 120);
console.log(`${notes.length} notes, ${mid.length} bytes`);

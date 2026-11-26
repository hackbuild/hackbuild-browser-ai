import { importEsm } from "@hackbuild/ai-env";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { attachNotes, decodeNotes, DETAILS, refineNotes, runPitch, tfjsPitchProvider, writeMidi, type PitchModel, type Tfjs } from "@hackbuild/notes";

// a hub with the Basic Pitch record (weights Apache-2.0, stated by the hub from the record), tfjs 3.21.0 passed in at runtime
const hub = createHub();
attachNotes(hub);
hub.provide("tfjs", tfjsPitchProvider({ runtime: () => importEsm<Tfjs>("https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@3.21.0/+esm") }));
// a picked file at 22050 Hz, frame and onset posteriors from Basic Pitch, then notes and a MIDI file
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const { channels } = await decodeAudio(input.files![0]!, 22050);
  const m = await hub.use<PitchModel>("notes");
  const post = await hub.run(m, (pitch) => runPitch(pitch, channels[0]!, { onProgress: (f) => console.log(`${Math.round(f * 100)} percent`) }));
  hub.release(m);
  const notes = refineNotes(decodeNotes(post.frames, post.onsets, DETAILS.normal), DETAILS.normal);
  const mid = writeMidi([{ name: "bass", notes, program: 33 }], 120); // one bass track at 120 bpm
  console.log(`${notes.length} notes, ${mid.length} bytes`);
};

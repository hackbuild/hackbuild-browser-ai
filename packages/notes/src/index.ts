import type { Hub, ModelRecord } from "@hackbuild/models";
import { BASIC_PITCH, BP_BINS, BP_ROWS, type PitchModel } from "./pitch.js";

export * from "./pitch.js";
export { drumNotes, estimateTempo, fitGridToNotes, DRUM_BANDS, GM_DRUMS } from "./drums.js";
export { writeMidi, type MidiTrack } from "@hackbuild/audio-dsp";

export function attachNotes(hub: Hub): void {
  hub.registry.add(BASIC_PITCH);
}

/** A stub pitch model: A4 (bin 48) held through every window, onset on each window's first kept frame. */
export function stubPitch(): PitchModel {
  return {
    batch: 1,
    async run(_w, b) {
      const frames = new Float32Array(b * BP_ROWS * BP_BINS);
      const onsets = new Float32Array(b * BP_ROWS * BP_BINS);
      for (let k = 0; k < b; k++)
        for (let r = 0; r < BP_ROWS; r++) {
          frames[(k * BP_ROWS + r) * BP_BINS + 48] = 0.9;
          if (r === 15) onsets[(k * BP_ROWS + r) * BP_BINS + 48] = 0.9;
        }
      return { frames, onsets };
    },
  };
}

export function notesStubs(): Record<string, (r: ModelRecord) => unknown> {
  return { notes: () => stubPitch() };
}

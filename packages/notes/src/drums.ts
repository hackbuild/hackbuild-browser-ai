/**
 * Drums, tempo and grid on the audio-dsp wasm core: kick,
 * snare and hat bands (tom optional), onsets per band, one shared 25 ms
 * event grid with cross band rules on absolute envelopes, General MIDI
 * drum notes; tempo by onset autocorrelation at 11025 Hz.
 */

import type { Dsp, FilterKind } from "@hackbuild/audio-dsp";
import type { Note } from "./pitch.js";

type Band = { name: "kick" | "snare" | "hat" | "tom"; filters: [FilterKind, number, number][]; gap: number; sens: number; gate: number };

/** The kick, snare, hat and tom bands: filters, minimum gap in seconds, onset sensitivity and gate. */
export const DRUM_BANDS: Band[] = [
  { name: "kick", filters: [["lowpass", 110, 0.9], ["lowpass", 130, 0.9]], gap: 0.09, sens: 1.0, gate: 0.1 },
  { name: "snare", filters: [["highpass", 250, 0.8], ["lowpass", 1800, 0.8]], gap: 0.08, sens: 1.1, gate: 0.16 },
  { name: "hat", filters: [["highpass", 7000, 0.8]], gap: 0.04, sens: 1.25, gate: 0.12 },
  { name: "tom", filters: [["highpass", 120, 0.8], ["lowpass", 350, 0.8]], gap: 0.09, sens: 1.1, gate: 0.14 },
];

/** General MIDI notes for each drum: kick 36, snare 38, hat 42, tom 45. */
export const GM_DRUMS = { kick: 36, snare: 38, hat: 42, tom: 45 } as const;
const DUR = { kick: 0.18, snare: 0.14, hat: 0.06, tom: 0.2 } as const;

/**
 * Drum hits from a mono signal at any rate: resamples to 22050 Hz, finds
 * onsets per band, groups them on one 25 ms grid with cross band rules,
 * and returns General MIDI notes. Toms only when `toms` is set.
 */
export function drumNotes(dsp: Dsp, mono: Float32Array, sampleRate: number, o: { toms?: boolean } = {}): Note[] {
  const sr = 22050;
  // windowed sinc, so content above 11 kHz does not alias into the 7 kHz hat band
  const x = dsp.resample(mono, sampleRate, sr, "sinc");
  const hop = 128;
  const fps = sr / hop;
  const bands = new Map<string, { env: Float32Array; peak: number; hits: { frame: number }[] }>();
  for (const b of DRUM_BANDS) {
    if (b.name === "tom" && !o.toms) continue;
    let s = x;
    for (const [k, f, q] of b.filters) s = dsp.biquad(s, k, f, sr, q);
    const env = dsp.envelopeRms(s, hop);
    const peak = env.reduce((m, v) => Math.max(m, v), 0);
    bands.set(b.name, { env, peak, hits: peak > 1e-6 ? dsp.pickOnsets(env, fps, b.gap, b.sens, b.gate) : [] });
  }
  const near = Math.max(1, Math.round(0.025 * fps));
  const abs = (name: string, f: number) => {
    const b = bands.get(name);
    if (!b) return 0;
    let m = 0;
    for (let j = Math.max(0, f - near); j < Math.min(b.env.length, f + near * 2); j++) m = Math.max(m, b.env[j]!);
    return m;
  };
  const norm = (name: string, f: number) => {
    const b = bands.get(name);
    return b && b.peak > 1e-6 ? abs(name, f) / b.peak : 0;
  };
  const all = [...bands].flatMap(([band, b]) => b.hits.map((h) => ({ band, frame: h.frame }))).sort((a, b) => a.frame - b.frame);
  const notes: Note[] = [];
  let i = 0;
  while (i < all.length) {
    const group = [all[i]!];
    let lastF = all[i]!.frame;
    let j = i + 1;
    while (j < all.length && all[j]!.frame - lastF <= near) {
      group.push(all[j]!);
      lastF = all[j]!.frame;
      j++;
    }
    i = j;
    const f0 = group[0]!.frame;
    const has = new Set(group.map((g) => g.band));
    const [kA, sA, tA] = [abs("kick", f0), abs("snare", f0), o.toms ? abs("tom", f0) : 0];
    const tomOn = !!o.toms && has.has("tom") && tA > kA * 1.2 && tA > sA * 0.9;
    const kickOn = has.has("kick") && (!tomOn || kA >= tA * 0.8);
    const snareOn = has.has("snare") && (!has.has("kick") || norm("snare", f0) >= norm("kick", f0) * 0.5) && !(tomOn && sA < tA * 0.7);
    const emit = (name: keyof typeof GM_DRUMS) => notes.push({ t: f0 / fps, dur: DUR[name], m: GM_DRUMS[name], v: Math.max(0.25, Math.min(1, 0.35 + norm(name, f0) * 0.9)), drum: name });
    if (kickOn) emit("kick");
    if (snareOn) emit("snare");
    if (tomOn) emit("tom");
    if (has.has("hat")) emit("hat");
  }
  return notes.sort((a, b) => a.t - b.t);
}

/** bpm (2 decimals) and grid offset in seconds (3 decimals). */
export function estimateTempo(dsp: Dsp, mono: Float32Array, sampleRate: number): { bpm: number; offset: number } {
  const x = dsp.resample(mono, sampleRate, 11025, "linear");
  const r = dsp.estimateTempo(dsp.envelopeRms(x, 128), 11025 / 128);
  return { bpm: Math.round(r.bpm * 100) / 100, offset: Math.round(r.offset * 1000) / 1000 };
}

/** Grid from transcribed notes by vector strength; null when R is under 0.25. */
export function fitGridToNotes(dsp: Dsp, notes: readonly Note[]): { bpm: number; offset: number; r: number } | null {
  const g = dsp.fitGrid(
    notes.map((n) => n.t),
    notes.map((n) => n.v),
  );
  if (!g || g.r < 0.25) return null;
  return { bpm: Math.round(g.bpm * 100) / 100, offset: Math.round(g.offset * 1000) / 1000, r: g.r };
}

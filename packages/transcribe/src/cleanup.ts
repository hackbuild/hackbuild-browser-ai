/**
 * The phantom text filter (as earlier builds did). Whisper writes training set
 * watermarks and stock outros over silence. Watermarks are always
 * dropped; outros and weak one word lines only when the gate says the
 * audio under them was mostly silence, so a real outro survives. Loops
 * (8 or more words, under 28 percent unique) and the third identical line
 * in a row are dropped too.
 */

import { coverage, type Region } from "@hackbuild/audio-dsp";

export interface Seg {
  start: number;
  end: number;
  text: string;
}

export type DropReason = "empty" | "watermark" | "outro" | "phantom" | "loop" | "repeat";

export interface Dropped extends Seg {
  why: DropReason;
}

export const HARD = ["amara.org", "subtitles by", "subtitled by", "subtitles are", "transcription by", "transcribed by", "captions by"];
export const SOFT = ["thanks for watching", "thank you for watching", "please subscribe", "subscribe to my channel", "like and subscribe", "see you next time"];
export const WEAK = new Set(["you", "bye", "thank you", "thanks", "okay", "ok", "oh", "yeah", "hmm", "uh", "um", "music", "the end", "so", "and", "bye bye", "applause"]);

const low = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export function cleanup<T extends Seg>(segs: readonly T[], vad: readonly Region[], on = true, sampleRate = 16000): { kept: T[]; dropped: Dropped[] } {
  const kept: T[] = [];
  const dropped: Dropped[] = [];
  let prev = "";
  let run = 0;
  for (const g of segs) {
    const t = g.text.trim();
    if (!t) continue;
    const n = norm(t);
    const l = low(t);
    let kill: DropReason | null = null;
    if (on) {
      const cov = coverage(vad, g.start, g.end, sampleRate);
      if (!n) kill = "empty";
      if (!kill && HARD.some((w) => l.includes(w))) kill = "watermark";
      if (!kill && SOFT.some((w) => l.includes(w)) && t.length < 60 && cov < 0.45) kill = "outro";
      if (!kill && WEAK.has(n) && cov < 0.4) kill = "phantom";
      if (!kill) {
        const words = n.split(" ").filter(Boolean);
        if (words.length >= 8 && new Set(words).size / words.length < 0.28) kill = "loop";
      }
      if (!kill && n === prev) {
        run++;
        if (run >= 2) kill = "repeat";
      } else if (n !== prev) run = 0;
      prev = n;
    }
    if (kill) dropped.push({ start: g.start, end: g.end, text: g.text, why: kill });
    else kept.push(g);
  }
  return { kept, dropped };
}

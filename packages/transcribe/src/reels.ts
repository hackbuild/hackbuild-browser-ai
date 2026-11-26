/**
 * Silence reel packing: speech regions are cut into reels of
 * at most 26 s; a cut inside a region lands on the quietest frame of the
 * last 2 s (never before half a reel). Runs are joined with 0.12 s of
 * silence and a 0.1 s lead, and a source map takes model timestamps back
 * to the original file.
 */

import type { Region } from "@hackbuild/audio-dsp";

/** One speech run in a reel: source sample range and the silence before it. */
export interface Run {
  s0: number;
  s1: number;
  /** Silence before this run in the reel, samples. */
  pad: number;
}

/** Speech runs packed into one model call, and the total samples. */
export interface Reel {
  runs: Run[];
  total: number;
}

/** A run's place in the reel audio and in the source, in samples. */
export interface MappedRun {
  o0: number;
  o1: number;
  s0: number;
  s1: number;
}

/** A reel's audio, its source map and its length in seconds. */
export interface Materialized {
  audio: Float32Array;
  runs: MappedRun[];
  /** Seconds. */
  dur: number;
}

/** Pack speech regions into reels of at most `maxLen` samples, cutting long regions on a quiet frame. */
export function packReels(regions: readonly Region[], db: ArrayLike<number>, maxLen: number, gapPad: number, sr = 16000, hop = 160): Reel[] {
  const reels: Reel[] = [];
  let cur: Reel | null = null;
  const push = () => {
    if (cur && cur.runs.length) reels.push(cur);
    cur = null;
  };
  for (const [ra, rb] of regions) {
    let a = ra;
    while (a < rb) {
      let b = Math.min(rb, a + maxLen);
      if (b < rb) {
        const lo = Math.max(a + Math.round(maxLen * 0.5), b - 2 * sr);
        let best = b;
        let bestDb = Infinity;
        for (let s = lo; s < b; s += hop) {
          const f = Math.floor(s / hop);
          if (f < db.length && db[f]! < bestDb) {
            bestDb = db[f]!;
            best = s;
          }
        }
        b = best;
      }
      if (!cur) cur = { runs: [], total: 0 };
      const c: Reel = cur;
      const pad = c.runs.length ? gapPad : 0;
      if (c.total + (b - a) + pad > maxLen && c.runs.length) {
        push();
        cur = { runs: [], total: 0 };
      }
      const r: Reel = cur!;
      const p2 = r.runs.length ? gapPad : 0;
      r.runs.push({ s0: a, s1: b, pad: p2 });
      r.total += b - a + p2;
      a = b;
    }
  }
  push();
  return reels;
}

/** Build a reel's audio from the source with silence between runs, and the map back to source time. */
export function materialize(reel: Reel, src: Float32Array, lead: number, sr = 16000): Materialized {
  let total = lead * 2;
  for (const r of reel.runs) total += r.s1 - r.s0 + r.pad;
  const audio = new Float32Array(total);
  const runs: MappedRun[] = [];
  let o = lead;
  for (const r of reel.runs) {
    o += r.pad;
    audio.set(src.subarray(r.s0, r.s1), o);
    runs.push({ o0: o, o1: o + (r.s1 - r.s0), s0: r.s0, s1: r.s1 });
    o += r.s1 - r.s0;
  }
  return { audio, runs, dur: total / sr };
}

/** Reel seconds to source seconds. Times in a gap map to the end of the run before it. */
export function mapTime(runs: readonly MappedRun[], t: number, sr = 16000): number {
  const s = t * sr;
  if (s <= runs[0]!.o0) return runs[0]!.s0 / sr;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i]!;
    if (s <= r.o1) return (r.s0 + Math.max(0, s - r.o0)) / sr;
    const nx = runs[i + 1];
    if (nx && s < nx.o0) return r.s1 / sr;
  }
  return runs[runs.length - 1]!.s1 / sr;
}

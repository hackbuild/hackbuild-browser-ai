/**
 * The data behind the level rail (as the earlier transcription tool drew
 * it): the speech band level per 10 ms frame, the noise floor and gate
 * threshold lines, and per frame whether the gate kept the audio. `regate`
 * moves the threshold for a new margin without running the model again, so
 * a capture slider redraws the rail at once. `railBins` folds the frames to
 * a pixel width for drawing.
 */

import { gate, gateThreshold, type Region } from "@hackbuild/audio-dsp";
import { FRAME, HOP, SR, type Analysis } from "./frontend.js";

/** Frame levels of a file with the floor, the gate threshold and which frames the gate kept, for drawing and regating. */
export interface LevelRail {
  sampleRate: number;
  /** Samples per frame step. */
  hop: number;
  /** Seconds per frame step. */
  frameSec: number;
  /** Seconds. */
  duration: number;
  /** Speech band level per frame, dBFS (computed). */
  db: Float32Array;
  /** Gate threshold per frame, dBFS (computed). One value today; per frame so a moving gate fits the same shape. */
  thr: Float32Array;
  /** 1 where the gate kept the frame, 0 where silence was cut. */
  open: Uint8Array;
  /** Noise floor, dBFS (computed). */
  noiseDb: number;
  /** Gate threshold, dBFS (computed). */
  thrDb: number;
  /** 95th percentile level, the threshold's upper bound, dBFS (computed). */
  loudDb: number;
  marginDb: number;
  /** Kept regions in samples, end exclusive. */
  regions: Region[];
  /** Under 2 percent passed the gate, so the whole file was kept. */
  forced: boolean;
}

function openFrames(regions: readonly Region[], frames: number, hop: number): Uint8Array {
  const open = new Uint8Array(frames);
  for (const [x, y] of regions) for (let i = Math.floor(x / hop), b = Math.min(frames, Math.ceil(y / hop)); i < b; i++) open[i] = 1;
  return open;
}

/** The rail for an analysis from `analyze`. */
export function levelRail(a: Pick<Analysis, "vdb" | "vad" | "stats">, marginDb = 6): LevelRail {
  const frames = a.vdb.length;
  return {
    sampleRate: SR,
    hop: HOP,
    frameSec: HOP / SR,
    duration: a.stats.dur,
    db: a.vdb,
    thr: new Float32Array(frames).fill(a.stats.thrDb),
    open: openFrames(a.vad, frames, HOP),
    noiseDb: a.stats.noiseDb,
    thrDb: a.stats.thrDb,
    loudDb: a.stats.loudDb,
    marginDb,
    regions: a.vad.map((r): Region => [r[0], r[1]]),
    forced: a.stats.forced,
  };
}

/** The rail with the gate run again at a new margin; the floor and levels stay. */
export function regate(rail: LevelRail, o: { vadMargin?: number; skipSilence?: boolean } = {}): LevelRail {
  const margin = o.vadMargin ?? rail.marginDb;
  const n = Math.round(rail.duration * rail.sampleRate);
  const thrDb = gateThreshold(rail.noiseDb, rail.loudDb, margin);
  let regions: Region[] = (o.skipSilence ?? true) ? gate(rail.db, thrDb, n, { hop: rail.hop, frame: FRAME, sampleRate: rail.sampleRate }) : [[0, n]];
  const speech = regions.reduce((s, [x, y]) => s + (y - x), 0);
  let forced = false;
  if ((o.skipSilence ?? true) && speech < n * 0.02) {
    regions = [[0, n]];
    forced = true;
  }
  return { ...rail, thr: new Float32Array(rail.db.length).fill(thrDb), thrDb, marginDb: margin, regions, open: openFrames(regions, rail.db.length, rail.hop), forced };
}

/** A rail folded to bins: the loudest level and the kept share per bin. */
export interface RailBins {
  /** Loudest frame per bin, dBFS. */
  db: Float32Array;
  /** Share of the bin's frames the gate kept, 0 to 1. */
  kept: Float32Array;
  /** Seconds per bin. */
  binSec: number;
}

/** Frames folded to `n` bins, for a rail `n` pixels or bars wide. */
export function railBins(rail: LevelRail, n: number): RailBins {
  const bins = Math.max(1, Math.floor(n));
  const db = new Float32Array(bins).fill(-90);
  const kept = new Float32Array(bins);
  const count = new Uint32Array(bins);
  const F = rail.db.length;
  for (let i = 0; i < F; i++) {
    const b = Math.min(bins - 1, Math.floor((i * bins) / Math.max(1, F)));
    if (rail.db[i]! > db[b]!) db[b] = rail.db[i]!;
    kept[b]! += rail.open[i]!;
    count[b]!++;
  }
  for (let b = 0; b < bins; b++) kept[b] = count[b] ? kept[b]! / count[b]! : 0;
  return { db, kept, binSec: rail.duration / bins };
}

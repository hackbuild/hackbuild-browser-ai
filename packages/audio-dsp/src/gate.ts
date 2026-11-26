/**
 * The hysteresis gate from the earlier transcription tool, over frame levels in dB: speech
 * turns on after 3 frames above the threshold and off after 25 below,
 * regions are padded, merged across short gaps and dropped when short.
 * Regions come back in samples, end exclusive.
 */

export interface GateOptions {
  /** Samples per frame hop. Default 160 (10 ms at 16 kHz). */
  hop?: number;
  /** Samples per frame. Default 400 (25 ms at 16 kHz). */
  frame?: number;
  sampleRate?: number;
  /** Frames above the threshold to open. Default 3. */
  on?: number;
  /** Frames below the threshold to close. Default 25. */
  off?: number;
  /** Seconds of padding each side. Default 0.25. */
  pad?: number;
  /** Merge regions closer than this many seconds. Default 0.30. */
  mergeGap?: number;
  /** Drop regions shorter than this many seconds. Default 0.20. */
  minDur?: number;
}

/** A speech region in samples, end exclusive. */
export type Region = [start: number, end: number];

const round = Math.round;

/** Speech regions from frame levels in dB: open after `on` frames above `threshold`, close after `off` below, then pad, merge and drop short ones. */
export function gate(db: ArrayLike<number>, threshold: number, nSamples: number, o: GateOptions = {}): Region[] {
  const hop = o.hop ?? 160;
  const frame = o.frame ?? 400;
  const sr = o.sampleRate ?? 16000;
  const ON = o.on ?? 3;
  const OFF = o.off ?? 25;
  const raw: [number, number][] = [];
  let inSp = false;
  let cnt = 0;
  let st = 0;
  for (let i = 0; i < db.length; i++) {
    const v = db[i]!;
    if (!inSp) {
      if (v > threshold) {
        cnt++;
        if (cnt >= ON) {
          inSp = true;
          st = i - cnt + 1;
          cnt = 0;
        }
      } else cnt = 0;
    } else if (v < threshold) {
      cnt++;
      if (cnt >= OFF) {
        inSp = false;
        raw.push([st, i - cnt + 1]);
        cnt = 0;
      }
    } else cnt = 0;
  }
  if (inSp) raw.push([st, db.length]);
  const padF = round(((o.pad ?? 0.25) * sr) / hop);
  const gapF = round(((o.mergeGap ?? 0.3) * sr) / hop);
  const minF = round(((o.minDur ?? 0.2) * sr) / hop);
  const merged: [number, number][] = [];
  for (const [a, b] of raw) {
    const s: [number, number] = [Math.max(0, a - padF), Math.min(db.length, b + padF)];
    const last = merged[merged.length - 1];
    if (last && s[0] <= last[1] + gapF) last[1] = Math.max(last[1], s[1]);
    else merged.push(s);
  }
  return merged.filter((s) => s[1] - s[0] >= minF).map((s): Region => [s[0] * hop, Math.min(nSamples, s[1] * hop + frame)]);
}

/** Threshold from the floor: floor + margin, at least floor + 2, at most the 95th percentile minus 8 (as earlier builds did). */
export function gateThreshold(noiseDb: number, loudDb: number, marginDb = 6): number {
  let thr = noiseDb + marginDb;
  thr = Math.max(thr, noiseDb + 2);
  return Math.min(thr, Math.max(noiseDb + 2, loudDb - 8));
}

/** Fraction of [a, b) seconds covered by regions given in samples. */
export function coverage(regions: readonly Region[], a: number, b: number, sampleRate = 16000): number {
  if (b <= a) return 0;
  let hit = 0;
  for (const [x, y] of regions) {
    const s = Math.max(a, x / sampleRate);
    const e = Math.min(b, y / sampleRate);
    if (e > s) hit += e - s;
  }
  return hit / (b - a);
}

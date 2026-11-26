/**
 * The quiet speech front end at 16 kHz: clean the wire (dc
 * block, 80 Hz high pass run twice), decide speech on a 250 to 3800 Hz
 * copy, find the floor and gate, measure the speech found, and pick a gain
 * toward -20 dBFS capped at +60 dB. Each reel is then denoised from the noise print, levelled once more
 * (per reel AGC, plus or minus 9 dB), gained and limited.
 */

import { gate, gateThreshold, type Dsp, type Region } from "@hackbuild/audio-dsp";

/** The front end sample rate, 16000 Hz. */
export const SR = 16000;
/** The frame hop in samples, 160 (10 ms at 16 kHz). */
export const HOP = 160;
/** The frame length in samples, 400 (25 ms at 16 kHz). */
export const FRAME = 400;

/** Front end settings: high pass corner, gate margin, silence skip, target level, gain cap, denoise strength and per reel levelling. */
export interface FrontEndOptions {
  /** High pass corner in Hz; 0 turns it off. Default 80. */
  hp?: number;
  /** Gate margin over the floor in dB. Default 6. */
  vadMargin?: number;
  /** Gate the silence out. Default true. */
  skipSilence?: boolean;
  /** Target speech level, dBFS. Default -20. */
  targetDb?: number;
  /** Largest lift in dB. Default 60. */
  maxGainDb?: number;
  /** Spectral gate strength 0 to 3. Default 2. */
  denoise?: 0 | 1 | 2 | 3;
  /** Level each reel again. Default true. */
  perReelAgc?: boolean;
}

/** What `analyze` finds: the cleaned signal, frame levels, speech regions, the noise print, levels and the gain. */
export interface Analysis {
  sig: Float32Array;
  vdb: Float32Array;
  vad: Region[];
  noise: Float32Array | null;
  /** All levels in dB, computed. */
  stats: { dur: number; noiseDb: number; speechDb: number; snrDb: number; gainDb: number; density: number; thrDb: number; loudDb: number; forced: boolean };
  gain: number;
}

const DEF: Required<FrontEndOptions> = { hp: 80, vadMargin: 6, skipSilence: true, targetDb: -20, maxGainDb: 60, denoise: 2, perReelAgc: true };

/** The front end settings with every default filled in. */
export function options(o: FrontEndOptions = {}): Required<FrontEndOptions> {
  return { ...DEF, ...o };
}

/** Run the front end on 16 kHz audio: clean it, gate it, take a noise print and pick a gain. */
export function analyze(dsp: Dsp, raw: Float32Array, opts: FrontEndOptions = {}): Analysis {
  const o = options(opts);
  const n = raw.length;
  const dur = n / SR;
  let sig = dsp.dcBlock(raw);
  if (o.hp > 0) sig = dsp.biquad(dsp.biquad(sig, "highpass", o.hp, SR), "highpass", o.hp, SR);
  const band = dsp.biquad(dsp.biquad(sig, "highpass", 250, SR), "lowpass", 3800, SR);
  const vdb = dsp.frameDb(band, HOP, FRAME);
  const bdb = dsp.frameDb(sig, HOP, FRAME);
  const nF = vdb.length;
  const noiseDb = dsp.noiseFloor(vdb);
  const loudDb = dsp.percentile(vdb, 0.95);
  const thr = gateThreshold(noiseDb, loudDb, o.vadMargin);
  let vad: Region[] = o.skipSilence ? gate(vdb, thr, n) : [[0, n]];
  let speech = vad.reduce((a, [x, y]) => a + (y - x), 0);
  let forced = false;
  if (o.skipSilence && speech < n * 0.02) {
    vad = [[0, n]];
    speech = n;
    forced = true;
  }
  const active = new Uint8Array(nF);
  for (const [x, y] of vad) for (let i = Math.floor(x / HOP), b = Math.min(nF, Math.ceil(y / HOP)); i < b; i++) active[i] = 1;
  let e = 0;
  let c = 0;
  for (let i = 0; i < nF; i++)
    if (active[i]) {
      e += Math.pow(10, bdb[i]! / 10);
      c++;
    }
  const speechDb = c ? 10 * Math.log10(e / c) : -90;
  const target = Math.pow(10, o.targetDb / 20);
  const cur = Math.pow(10, speechDb / 20);
  let gain = cur > 1e-8 ? target / cur : 1;
  gain = Math.min(Math.pow(10, o.maxGainDb / 20), Math.max(Math.pow(10, -12 / 20), gain));
  const noise = o.denoise > 0 ? dsp.noiseSpectrum(sig, vdb, noiseDb, 512, HOP) : null;
  return {
    sig,
    vdb,
    vad,
    noise,
    gain,
    stats: { dur, noiseDb, speechDb, snrDb: speechDb - noiseDb, gainDb: 20 * Math.log10(gain), density: speech / n, thrDb: thr, loudDb, forced },
  };
}

const ALPHA = [0, 1.2, 1.8, 2.6];
const GFLOOR = [1, 0.15, 0.08, 0.04];

/** Denoise, per reel AGC, gain and limit one materialized reel. Returns a new array. */
export function finishReel(dsp: Dsp, audio: Float32Array, a: Pick<Analysis, "noise" | "gain">, opts: FrontEndOptions = {}): Float32Array {
  const o = options(opts);
  let x = a.noise ? dsp.denoise(audio, a.noise, ALPHA[o.denoise]!, GFLOOR[o.denoise]!) : audio.slice();
  let g = a.gain;
  if (o.perReelAgc) {
    const adb = dsp.frameDb(x, HOP, FRAME);
    const at = dsp.percentile(adb, 0.6);
    let se = 0;
    let sc = 0;
    for (const v of adb)
      if (v > at) {
        se += Math.pow(10, v / 10);
        sc++;
      }
    if (sc) {
      // the reel's speech level once the global gain is on it; the trim is relative to that
      const after = 10 * Math.log10(se / sc) + 20 * Math.log10(a.gain);
      let rg = Math.pow(10, (o.targetDb - after) / 20);
      rg = Math.min(Math.pow(10, 9 / 20), Math.max(Math.pow(10, -9 / 20), rg));
      g = Math.min(Math.pow(10, o.maxGainDb / 20), a.gain * rg);
    }
  }
  for (let k = 0; k < x.length; k++) x[k]! *= g;
  x = dsp.limit(x, 0.891, SR);
  return x;
}

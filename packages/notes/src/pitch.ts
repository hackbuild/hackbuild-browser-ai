/**
 * Basic Pitch (Spotify, Apache-2.0 weights) run by hand (as earlier builds did):
 * 22050 Hz mono, windows of 43844 samples on a 36164 sample hop with a
 * 3840 sample lead pad, 172 frames by 88 bins per window, 15 frames
 * trimmed off each end, only the frames and onsets outputs read (no
 * contours). Batches of 4 on the GPU, 1 on the CPU. The note decoder here
 * is written from the model's published output description.
 */

import type { Factory, ModelRecord } from "@hackbuild/models";

export const BP_RATE = 22050;
export const BP_FFT_HOP = 256;
export const BP_FPS = Math.floor(BP_RATE / BP_FFT_HOP);
export const BP_WINDOW = BP_RATE * 2 - BP_FFT_HOP;
export const BP_OVERLAP = 30 * BP_FFT_HOP;
export const BP_OVERLAP_HALF = Math.floor(BP_OVERLAP / 2);
export const BP_HOP = BP_WINDOW - BP_OVERLAP;
export const BP_TRIM = 15;
export const BP_ROWS = 172;
export const BP_BINS = 88;
/** Frames kept per window after the trim. */
export const BP_KEPT = BP_ROWS - 2 * BP_TRIM;

/**
 * Time in seconds of stitched frame i. Inside a window frames step by the
 * 256 sample FFT hop; windows step by BP_HOP (36164 samples) for 142 kept
 * frames, so the mean rate is 86.58 fps (computed), not 86.
 */
export function bpFrameTime(i: number): number {
  const w = Math.floor(i / BP_KEPT);
  return (w * BP_HOP + (i - w * BP_KEPT) * BP_FFT_HOP) / BP_RATE;
}

/** Frames whose time falls inside `samples` at 22.05 kHz. */
export function bpFrameCount(samples: number): number {
  const w = Math.floor(samples / BP_HOP);
  return w * BP_KEPT + Math.min(BP_KEPT, Math.ceil((samples - w * BP_HOP) / BP_FFT_HOP));
}

/** Runs B windows (B * BP_WINDOW samples) and returns frames and onsets, B * BP_ROWS * BP_BINS each. */
export interface PitchModel {
  readonly batch: number;
  run(windows: Float32Array, batch: number): Promise<{ frames: Float32Array; onsets: Float32Array }>;
  dispose?(): unknown;
}

export const BASIC_PITCH: ModelRecord = {
  id: "basic-pitch",
  label: "basic pitch (spotify)",
  provides: ["notes"],
  provider: "tfjs",
  source: { url: "https://cdn.jsdelivr.net/npm/@spotify/basic-pitch@1.0.1/model/model.json" },
  sizeMB: 1,
  sizeSource: "inferred",
  ladder: [
    { device: "webgl", options: { batch: 4 } },
    { device: "cpu", options: { batch: 1 } },
  ],
  licence: "Apache-2.0",
  commercial: true,
  place: "main",
  runtime: "@tensorflow/tfjs@3.21.0",
  notes: ["share one tfjs instance; WEBGL_SIZE_UPLOAD_UNIFORM=0 works around the getT1 concat shader bug"],
};

/** The parts of tfjs the provider touches. Tests pass a fake. */
export interface Tfjs {
  setBackend(name: string): Promise<boolean>;
  ready(): Promise<void>;
  env(): { set(flag: string, v: unknown): void };
  tensor(data: Float32Array, shape: number[], dtype?: string): { dispose(): void };
  loadGraphModel(url: string): Promise<{ execute(x: unknown, outs: string[]): { data(): Promise<Float32Array>; dispose(): void }[]; dispose?(): void }>;
}

/** Shader failures that mean "use the cpu backend" (as earlier builds did). */
export function isShaderFailure(e: unknown): boolean {
  const m = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return ["shader", "gett1", "overloaded", "webgl", "compile"].some((k) => m.includes(k));
}

export function tfjsPitchProvider(opts: { runtime: () => Promise<Tfjs> }): Factory<PitchModel> {
  return async ({ record, rung }) => {
    const tf = await opts.runtime();
    const backend = rung.device === "webgl" ? "webgl" : "cpu";
    if (backend === "webgl") tf.env().set("WEBGL_SIZE_UPLOAD_UNIFORM", 0);
    if (!(await tf.setBackend(backend))) throw new Error(`tfjs ${backend} backend did not start`);
    await tf.ready();
    const model = await tf.loadGraphModel(record.source.url!);
    const batch = Number(rung.options?.batch ?? 1);
    return {
      batch,
      async run(windows, b) {
        const x = tf.tensor(windows, [b, BP_WINDOW, 1], "float32");
        const outs = model.execute(x, ["Identity_1", "Identity_2"]);
        try {
          return { frames: await outs[0]!.data(), onsets: await outs[1]!.data() };
        } finally {
          x.dispose();
          for (const t of outs) t.dispose();
        }
      },
      dispose: () => model.dispose?.(),
    };
  };
}

/** Frames and onsets (rows of 88) for a 22050 Hz mono signal. */
export async function runPitch(
  m: PitchModel,
  mono: Float32Array,
  o: { onProgress?: (f: number) => void; yieldEvery?: () => Promise<void>; signal?: AbortSignal } = {},
): Promise<{ frames: Float32Array[]; onsets: Float32Array[] }> {
  const B = Math.max(1, m.batch);
  const nWindows = Math.max(1, Math.ceil((BP_OVERLAP_HALF + mono.length) / BP_HOP));
  const wanted = bpFrameCount(mono.length);
  const frames: Float32Array[] = [];
  const onsets: Float32Array[] = [];
  const buf = new Float32Array(B * BP_WINDOW);
  for (let w0 = 0; w0 < nWindows && frames.length < wanted; w0 += B) {
    if (o.signal?.aborted) throw new DOMException("notes stopped", "AbortError");
    const nb = Math.min(B, nWindows - w0);
    buf.fill(0);
    for (let b = 0; b < nb; b++) {
      const start = (w0 + b) * BP_HOP - BP_OVERLAP_HALF;
      for (let j = 0; j < BP_WINDOW; j++) {
        const s = start + j;
        if (s >= 0 && s < mono.length) buf[b * BP_WINDOW + j] = mono[s]!;
      }
    }
    const out = await m.run(buf, B);
    for (let b = 0; b < nb && frames.length < wanted; b++)
      for (let r = BP_TRIM; r < BP_ROWS - BP_TRIM && frames.length < wanted; r++) {
        const at = (b * BP_ROWS + r) * BP_BINS;
        frames.push(out.frames.slice(at, at + BP_BINS));
        onsets.push(out.onsets.slice(at, at + BP_BINS));
      }
    o.onProgress?.(Math.min(1, frames.length / Math.max(1, wanted)));
    await o.yieldEvery?.();
  }
  return { frames, onsets };
}

export interface Note {
  /** Seconds. */
  t: number;
  dur: number;
  /** MIDI note. */
  m: number;
  /** 0 to 1. */
  v: number;
  drum?: string;
}

/**
 * Notes from posteriors: a note starts at an onset peak over onsetThresh
 * (or a frame rise over the frame threshold when no onset fired), lasts
 * while the frame posterior stays over frameThresh (gaps up to 2 frames
 * bridged), and needs minFrames frames. Velocity is the mean frame
 * posterior. Bin 0 is MIDI 21 (A0).
 */
export function decodeNotes(frames: Float32Array[], onsets: Float32Array[], o: { onsetThresh?: number; frameThresh?: number; minFrames?: number } = {}): Note[] {
  const on = o.onsetThresh ?? 0.5;
  const fr = o.frameThresh ?? 0.3;
  const minF = o.minFrames ?? 5;
  const n = frames.length;
  const notes: Note[] = [];
  for (let p = 0; p < BP_BINS; p++) {
    let i = 0;
    while (i < n) {
      const o0 = onsets[i]![p]!;
      const peak = o0 >= on && (i === 0 || o0 >= onsets[i - 1]![p]!) && (i === n - 1 || o0 >= onsets[i + 1]![p]!);
      if (!peak) {
        i++;
        continue;
      }
      let j = i;
      let gap = 0;
      let sum = 0;
      let cnt = 0;
      while (j < n && gap <= 2) {
        const f = frames[j]![p]!;
        if (f >= fr) {
          gap = 0;
          sum += f;
          cnt++;
        } else gap++;
        if (j > i && onsets[j]![p]! >= on && onsets[j]![p]! > onsets[j - 1]![p]!) break;
        j++;
      }
      const end = j - gap;
      if (end - i >= minF) notes.push({ t: bpFrameTime(i), dur: Math.max(0.03, bpFrameTime(end) - bpFrameTime(i)), m: p + 21, v: Math.max(0.15, Math.min(1, cnt ? sum / cnt : 0)) });
      i = Math.max(i + 1, end);
    }
  }
  return notes.sort((a, b) => a.t - b.t || a.m - b.m);
}

/** Merge same pitch splits, drop octave, twelfth and double octave ghosts, drop dust (as earlier builds did). */
export function refineNotes(notes: readonly Note[], o: { mergeGap?: number; harmonics?: boolean; minDur?: number; minVel?: number } = {}): Note[] {
  let out = [...notes].sort((a, b) => a.t - b.t || a.m - b.m);
  if (o.mergeGap && o.mergeGap > 0) {
    const last = new Map<number, Note>();
    const merged: Note[] = [];
    for (const n of out) {
      const l = last.get(n.m);
      if (l && n.t - (l.t + l.dur) <= o.mergeGap) {
        l.dur = Math.max(l.dur, n.t + n.dur - l.t);
        l.v = Math.max(l.v, n.v);
      } else {
        const c = { ...n };
        merged.push(c);
        last.set(n.m, c);
      }
    }
    out = merged.sort((a, b) => a.t - b.t || a.m - b.m);
  }
  if (o.harmonics ?? true) {
    const ghostOf = (n: Note, x: Note) => [12, 19, 24].includes(n.m - x.m) && x.v >= n.v * 1.15 && x.dur >= n.dur * 0.6;
    out = out.filter((n, i) => {
      for (let j = i - 1; j >= 0 && n.t - out[j]!.t <= 0.04; j--) if (ghostOf(n, out[j]!)) return false;
      for (let j = i + 1; j < out.length && out[j]!.t - n.t <= 0.04; j++) if (ghostOf(n, out[j]!)) return false;
      return true;
    });
  }
  if (o.minDur) out = out.filter((n) => n.dur >= o.minDur!);
  if (o.minVel) out = out.filter((n) => n.v >= o.minVel!);
  return out;
}

/** One note at a time, keeping the higher (or lower) line (as earlier builds did). */
export function keepMonophonic(notes: readonly Note[], pick: "high" | "low" = "high"): Note[] {
  const out: Note[] = [];
  for (const n of notes) {
    const last = out[out.length - 1];
    if (!last || n.t >= last.t + last.dur - 0.01) {
      out.push({ ...n });
      continue;
    }
    const better = pick === "low" ? n.m < last.m : n.m > last.m;
    if (n.t - last.t < 0.05) {
      if (better) out[out.length - 1] = { ...n };
    } else if (better) {
      last.dur = Math.max(0.03, n.t - last.t);
      out.push({ ...n });
    }
  }
  return out;
}

/** Note extraction presets (as earlier builds did). */
export const DETAILS = {
  tight: { onsetThresh: 0.6, frameThresh: 0.35, minFrames: 8, mergeGap: 0.03, minDur: 0.06 },
  normal: { onsetThresh: 0.5, frameThresh: 0.3, minFrames: 5, mergeGap: 0.05, minDur: 0.05 },
  loose: { onsetThresh: 0.35, frameThresh: 0.22, minFrames: 3, mergeGap: 0.08, minDur: 0.03 },
} as const;

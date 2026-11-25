/**
 * htdemucs stem separation (an earlier stem splitter). Every tier is the same
 * network, so overlap is the speed control: fast is the fp16 weights
 * export at 10 percent overlap, slow the fp32 export at 40 percent. The
 * graph is fetched once and the ort ladder walks webgpu basic, all,
 * disabled, then wasm (devices). Segments of 343980 samples (7.8 s at
 * 44.1 kHz) go through our own overlap add with linear crossfades.
 * Exports that also want a spectrogram input (two inputs) are refused:
 * this package does not compute the htdemucs STFT branch.
 */

import { OverlapAdd, planSegments } from "@hackbuild/audio-dsp";
import { LADDERS, type OrtModel } from "@hackbuild/devices";
import { pinnedBase, type Hub, type ModelRecord, type RunOptions } from "@hackbuild/models";

export const SAMPLE_RATE = 44100;
export const SEGMENT = 343980;
export const TRACKS = ["drums", "bass", "other", "vocals"] as const;
export type Track = (typeof TRACKS)[number];

const base = pinnedBase("StemSplitio/htdemucs-onnx");
const rec = (id: string, file: string, mb: number, overlap: number, label: string): ModelRecord => ({
  id,
  label,
  speed: "slow",
  verdict: "four stems",
  provides: ["stems"],
  provider: "ort",
  source: { url: base + file },
  sizeMB: mb,
  sizeSource: "vendor",
  ladder: LADDERS.ort(),
  licence: "MIT",
  commercial: true,
  place: "gpu",
  runtime: "onnxruntime-web@1.27.0",
  notes: [`overlap ${overlap}`, "export by StemSplitio of the htdemucs weights (MIT); the export's own terms not checked"],
});

export const STEMS_RECORDS: ModelRecord[] = [
  rec("htdemucs-fast", "htdemucs_fp16weights.onnx", 166, 0.1, "htdemucs fp16 weights, fast"),
  rec("htdemucs-slow", "htdemucs.onnx", 316, 0.4, "htdemucs fp32, slow"),
];

/** The overlap a record was tuned for (notes "overlap x"), else 0.25. */
export function overlapOf(r: ModelRecord): number {
  const n = r.notes?.find((s) => /^overlap /.test(s));
  return n ? Number(n.slice(8)) : 0.25;
}

export function attachStems(hub: Hub): void {
  hub.registry.add(...STEMS_RECORDS);
}

/** A separator takes one stereo segment of SEGMENT samples, returns [tracks][2][SEGMENT] flat. */
export interface Separator {
  separate(left: Float32Array, right: Float32Array): Promise<{ data: ArrayLike<number>; tracks: number; samples: number }>;
}

/** Wrap an ort model as a Separator; refuses two input exports. */
export function ortSeparator(m: OrtModel): Separator {
  if (m.session.inputNames.length > 1) throw new Error("this htdemucs export needs a spectrogram input; use a waveform only export (StemSplitio htdemucs-onnx)");
  return {
    async separate(left, right) {
      const wf = new Float32Array(2 * left.length);
      wf.set(left, 0);
      wf.set(right, left.length);
      const res = await m.session.run({ [m.session.inputNames[0]!]: new m.ort.Tensor("float32", wf, [1, 2, left.length]) });
      for (const name of m.session.outputNames) {
        const t = res[name];
        if (t && t.dims.length === 4 && t.dims[2] === 2) return { data: t.data as ArrayLike<number>, tracks: t.dims[1]!, samples: t.dims[3]! };
      }
      throw new Error("this model has no time domain output tensor");
    },
  };
}

/** Stub separator: every stem is a quarter of the mix. */
export function stubSeparator(): Separator {
  return {
    async separate(l, r) {
      const out = new Float32Array(4 * 2 * l.length);
      for (let t = 0; t < 4; t++) {
        for (let i = 0; i < l.length; i++) {
          out[(t * 2) * l.length + i] = l[i]! / 4;
          out[(t * 2 + 1) * l.length + i] = r[i]! / 4;
        }
      }
      return { data: out, tracks: 4, samples: l.length };
    },
  };
}

export function stemsStubs(): Record<string, (r: ModelRecord) => unknown> {
  return { stems: () => stubSeparator() };
}

export interface SeparateOptions {
  model?: string;
  /** Override the record's overlap, 0 to 0.6. */
  overlap?: number;
  /** Segment length; default SEGMENT. Tests use short ones. */
  segment?: number;
  signal?: AbortSignal;
  schedule?: RunOptions;
  onProgress?: (p: { done: number; total: number; rtf: number }) => void;
  now?: () => number;
}

export interface Stems {
  stems: Record<Track, { left: Float32Array; right: Float32Array }>;
  /** Audio seconds per wall second (computed). */
  rtf: number;
  model: string;
}

/** Separate a 44.1 kHz stereo mix. Resample first (audio-dsp) when the source rate differs. */
export async function separate(hub: Hub, left: Float32Array, right: Float32Array, o: SeparateOptions = {}): Promise<Stems> {
  const now = o.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
  const t0 = now();
  const l = await hub.use<unknown>(o.model ? { id: o.model } : "stems", o.signal ? { signal: o.signal } : {});
  try {
    const sep: Separator = l.value && typeof l.value === "object" && "sessions" in l.value ? ortSeparator(l.value as OrtModel) : (l.value as Separator);
    const S = o.segment ?? SEGMENT;
    const { segments, fade } = planSegments(left.length, S, o.overlap ?? overlapOf(l.record));
    const acc = new OverlapAdd(left.length, 4, 2, fade);
    for (let k = 0; k < segments.length; k++) {
      if (o.signal?.aborted) throw new DOMException("separation stopped", "AbortError");
      const s = segments[k]!;
      const sl = new Float32Array(S);
      const sr = new Float32Array(S);
      sl.set(left.subarray(s.start, s.start + s.len));
      sr.set(right.subarray(s.start, s.start + s.len));
      const out = await hub.run(l, () => sep.separate(sl, sr), { ...(o.schedule ?? {}), ...(o.signal ? { signal: o.signal } : {}) });
      if (out.tracks !== 4) throw new Error(`this model returns ${out.tracks} stems, the pipeline expects 4`);
      acc.add(s, out.data, out.samples);
      const wall = (now() - t0) / 1000;
      o.onProgress?.({ done: k + 1, total: segments.length, rtf: (s.start + s.len) / SAMPLE_RATE / Math.max(0.001, wall) });
    }
    const res = acc.finish();
    const stems = Object.fromEntries(TRACKS.map((n, i) => [n, { left: res[i]![0]!, right: res[i]![1]! }])) as Stems["stems"];
    return { stems, rtf: left.length / SAMPLE_RATE / Math.max(0.001, (now() - t0) / 1000), model: l.id };
  } finally {
    hub.release(l);
  }
}

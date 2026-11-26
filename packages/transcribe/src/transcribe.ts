/**
 * File transcription through the models hub: front end, reels, one ASR
 * call per reel under hub.run (so a webgpu model takes the gpu lock), the
 * source map back to file time, and the phantom filter.
 */

import type { Dsp } from "@hackbuild/audio-dsp";
import type { Hub, Loaded, RunOptions } from "@hackbuild/models";
import { cleanup, type Dropped, type Seg } from "./cleanup.js";
import { analyze, finishReel, SR, type FrontEndOptions } from "./frontend.js";
import { englishOnly } from "./languages.js";
import { levelRail, type LevelRail } from "./rail.js";
import { mapTime, materialize, packReels } from "./reels.js";

/** The transformers.js ASR pipeline call shape. */
export interface AsrOutput {
  text?: string;
  chunks?: { timestamp?: [number | null, number | null]; text?: string }[];
}
/** An ASR function: 16 kHz audio and call options in, text and timed chunks out. */
export type Asr = (audio: Float32Array, opts: Record<string, unknown>) => Promise<AsrOutput>;

/** Transcribe settings: the front end ones plus model, language, phantom filter, signal, progress and scheduling. */
export interface TranscribeOptions extends FrontEndOptions {
  /** Language code, or "auto". Ignored by english only models. */
  language?: string;
  /** Run the phantom filter. Default true. */
  halluc?: boolean;
  /** Use this record id instead of routing by capability. */
  model?: string;
  signal?: AbortSignal;
  /** Scheduling for each reel's run (minimum interval, idle only, frame time budget), for pages that also render. */
  schedule?: RunOptions;
  onProgress?: (p: { done: number; total: number; rtf: number }) => void;
  /** Clock for realtime factor, in ms. */
  now?: () => number;
}

/** A transcript: kept and dropped lines, stats, the level rail, model and language. */
export interface Transcript {
  segments: Seg[];
  dropped: Dropped[];
  stats: { dur: number; noiseDb: number; speechDb: number; snrDb: number; gainDb: number; density: number; thrDb: number; loudDb: number; reels: number; wall: number; rtf: number; forced: boolean };
  /** The level rail: frame levels, floor and gate lines, kept frames. */
  rail: LevelRail;
  /** Record id of the run, "" when no reel reached a model. */
  model: string;
  /** Language passed to the model: a code, "auto", or "en" for an english only model. */
  language: string;
}

/** Transcribe 16 kHz mono audio through the models hub, one ASR call per reel, with times in file seconds. */
export async function transcribe(hub: Hub, dsp: Dsp, pcm16k: Float32Array, o: TranscribeOptions = {}): Promise<Transcript> {
  const now = o.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
  const t0 = now();
  const a = analyze(dsp, pcm16k, o);
  const reels = packReels(a.vad, a.vdb, Math.round(26 * SR), Math.round(0.12 * SR));
  const base = { ...a.stats, reels: reels.length, wall: 0, rtf: 0 };
  const rail = levelRail(a, o.vadMargin ?? 6);
  if (!reels.length) return { segments: [], dropped: [], stats: base, rail, model: o.model ?? "", language: o.language ?? "auto" };
  const model: Loaded<Asr> = await hub.use<Asr>(o.model ? { id: o.model } : "transcribe", o.signal ? { signal: o.signal } : {});
  const english = englishOnly(model.record);
  // transformers.js refuses task and language for an english only model, so both go only to multilingual ones
  const call: Record<string, unknown> = english ? { return_timestamps: true } : { return_timestamps: true, task: "transcribe" };
  if (o.language && o.language !== "auto" && !english) call.language = o.language;
  const segs: Seg[] = [];
  let processed = 0;
  try {
    for (let i = 0; i < reels.length; i++) {
      if (o.signal?.aborted) throw new DOMException("transcription stopped", "AbortError");
      const m = materialize(reels[i]!, a.sig, Math.round(0.1 * SR));
      const audio = finishReel(dsp, m.audio, a, o);
      const opt = m.dur > 29 ? { ...call, chunk_length_s: 30, stride_length_s: 5 } : call;
      const out = await hub.run(model, (asr) => asr(audio, opt), { ...(o.schedule ?? {}), ...(o.signal ? { signal: o.signal } : {}) });
      const chunks = out?.chunks?.length ? out.chunks : [{ timestamp: [0, m.dur] as [number, number], text: out?.text ?? "" }];
      for (const ch of chunks) {
        const ts = ch.timestamp ?? [0, null];
        const s0 = Number.isFinite(ts[0]) ? (ts[0] as number) : 0;
        const s1 = Number.isFinite(ts[1]) ? (ts[1] as number) : Math.min(m.dur, s0 + 3);
        const st = mapTime(m.runs, s0);
        const en = Math.max(st + 0.15, mapTime(m.runs, s1));
        const tx = (ch.text ?? "").trim();
        if (tx) segs.push({ start: st, end: en, text: tx });
      }
      processed += m.dur;
      o.onProgress?.({ done: i + 1, total: reels.length, rtf: processed / Math.max(0.001, (now() - t0) / 1000) });
    }
  } finally {
    hub.release(model);
  }
  segs.sort((x, y) => x.start - y.start);
  const { kept, dropped } = cleanup(segs, a.vad, o.halluc ?? true);
  const wall = (now() - t0) / 1000;
  const language = english ? "en" : (o.language ?? "auto");
  return { segments: kept, dropped, stats: { ...base, wall, rtf: a.stats.dur / Math.max(0.001, wall) }, rail, model: model.record.id, language };
}

/** Mono from a decoded buffer, as earlier builds chose it: one channel when it is 6 dB louder, else the channels within 20 dB of the loudest. */
export function toMono(channels: readonly Float32Array[], mode: "auto" | "mix" | "L" | "R" = "auto"): Float32Array {
  const C = channels.length;
  if (C === 1 || mode === "L") return channels[0]!.slice();
  if (mode === "R") return channels[Math.min(1, C - 1)]!.slice();
  const N = channels[0]!.length;
  const rms = channels.map((a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, N)));
  let use = channels.map((_, i) => i);
  if (mode === "auto") {
    const sorted = [...rms].sort((a, b) => b - a);
    if (sorted[0]! > sorted[1]! * Math.pow(10, 6 / 20)) return channels[rms.indexOf(sorted[0]!)]!.slice();
    use = rms.flatMap((r, i) => (r > sorted[0]! * 0.1 ? [i] : []));
    if (!use.length) use = channels.map((_, i) => i);
  }
  const out = new Float32Array(N);
  for (const i of use) for (let k = 0; k < N; k++) out[k]! += channels[i]![k]!;
  for (let k = 0; k < N; k++) out[k]! /= use.length;
  return out;
}

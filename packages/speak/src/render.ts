/**
 * Offline render: a whole text to one buffer of samples, with word and
 * phoneme times kept as offsets in the caller's text, so "save wav" and
 * the lipsync export do not depend on capturing live playback. Every PCM
 * engine can do this, since its synth yields samples. A native engine
 * (the system voice) plays itself and hands back no audio, so it cannot:
 * `canRender` says so, and asking for it throws an OfflineRenderError
 * whose message is the copy to show.
 */

import { encodeWav } from "@hackbuild/audio-dsp";
import type { BufferLike } from "./player.js";
import { estimateWordTimes, SegmentCutter, speakable, type CutterOptions, type SpeakableOptions } from "./text.js";
import type { Engine, PcmEngine, Timed, VoiceConfig } from "./types.js";

/** A word or phoneme in a render: offsets in the input text, times in seconds from the start of the buffer. */
export interface RenderedTimed {
  start: number;
  end: number;
  t0: number;
  t1: number;
  phoneme?: string;
  /** Guessed from text length because the engine reported no word times. */
  estimated: boolean;
}

/** A whole text rendered to mono samples, with the engine name and word and phoneme times. */
export interface RenderedSpeech {
  /** Mono samples at `sampleRate`. */
  samples: Float32Array;
  sampleRate: number;
  /** Seconds, computed from the sample count. */
  duration: number;
  /** The engine that rendered it. */
  engine: string;
  words: RenderedTimed[];
  phonemes: RenderedTimed[];
}

/** Voice settings, text options, segment gap, abort signal and a skip callback for renderSpeech. */
export interface RenderOptions {
  voice?: VoiceConfig;
  /** Per voice settings by engine id, merged over `voice`. */
  voices?: Record<string, VoiceConfig>;
  speakable?: SpeakableOptions;
  cutter?: CutterOptions;
  /** Silence between segments, seconds. Default 0.08. */
  gap?: number;
  signal?: AbortSignal;
  /** Called with each engine that is skipped and why, for a status line. */
  onSkip?(engine: string, reason: string): void;
}

/** The system voice plays through the platform and hands back no samples. */
export const OFFLINE_RENDER_REFUSAL = "the system voice plays live and gives no audio to save. pick bellows or pocket to save a wav.";

/** Thrown when no engine in the chain can render offline. Its message is the copy to show; humanError in @hackbuild/devices returns it as is. */
export class OfflineRenderError extends Error {
  override readonly name = "OfflineRenderError";
  readonly code: "native" | "failed";
  constructor(code: "native" | "failed", message: string) {
    super(message);
    this.code = code;
  }
}

/** Whether an engine can render to a buffer: PCM engines can unless they say otherwise, native ones cannot. */
export function canRender(e: Engine): e is PcmEngine {
  return e.kind === "pcm" && e.offline !== false;
}

/**
 * Render `text` on the first engine in `engines` that can render and does
 * not fail. Each engine must already be loaded, or loads here with no
 * status hooks. Native engines are skipped with OFFLINE_RENDER_REFUSAL.
 */
export async function renderSpeech(engines: Engine | readonly Engine[], text: string, o: RenderOptions = {}): Promise<RenderedSpeech> {
  const list = Array.isArray(engines) ? (engines as readonly Engine[]) : [engines as Engine];
  const errors: string[] = [];
  for (const e of list) {
    if (o.signal?.aborted) break;
    if (!canRender(e)) {
      o.onSkip?.(e.id, OFFLINE_RENDER_REFUSAL);
      continue;
    }
    try {
      await e.load(o.signal ? { signal: o.signal } : {});
      return await renderOn(e, text, o);
    } catch (err) {
      if (o.signal?.aborted) break;
      const m = err instanceof Error ? err.message : String(err);
      errors.push(`${e.id}: ${m}`);
      o.onSkip?.(e.id, m);
    }
  }
  if (o.signal?.aborted) throw new DOMException("render stopped", "AbortError");
  if (!errors.length) throw new OfflineRenderError("native", OFFLINE_RENDER_REFUSAL);
  throw new OfflineRenderError("failed", `no voice could render this text. ${errors.join("; ")}.`);
}

async function renderOn(e: PcmEngine, text: string, o: RenderOptions): Promise<RenderedSpeech> {
  const cfg = { ...(o.voice ?? {}), ...(o.voices?.[e.id] ?? {}) };
  const signal = o.signal ?? new AbortController().signal;
  const segs = new SegmentCutter(o.cutter).take(text, true);
  const parts: Float32Array[] = [];
  const words: RenderedTimed[] = [];
  const phonemes: RenderedTimed[] = [];
  let rate = 0;
  let n = 0;
  const gap = o.gap ?? 0.08;
  for (const seg of segs) {
    const sp = speakable(seg.text, o.speakable);
    if (!sp.text) continue;
    const at = (i: number) => seg.start + sp.map[Math.min(i, sp.map.length - 1)]!;
    // an end offset is exclusive: one past its last spoken character, so markup after a word stays out
    const endAt = (i: number) => (i > 0 ? at(i - 1) + 1 : at(0));
    if (n > 0 && rate > 0) {
      const g = new Float32Array(Math.round(gap * rate));
      parts.push(g);
      n += g.length;
    }
    const segStart = n;
    let reported = false;
    for await (const c of e.synth(sp.text, cfg, signal)) {
      if (signal.aborted) throw new DOMException("render stopped", "AbortError");
      if (!rate) rate = c.sampleRate;
      const s = c.sampleRate === rate ? c.samples : resample(c.samples, c.sampleRate, rate);
      const base = n / rate;
      const put = (list: RenderedTimed[], w: Timed) => {
        const r: RenderedTimed = { start: at(w.start), end: endAt(w.end), t0: base + w.t0, t1: base + w.t1, estimated: false };
        if (w.phoneme !== undefined) r.phoneme = w.phoneme;
        list.push(r);
      };
      for (const w of c.words ?? []) {
        reported = true;
        put(words, w);
      }
      for (const p of c.phonemes ?? []) put(phonemes, p);
      parts.push(s);
      n += s.length;
    }
    if (!reported && rate) {
      const t0 = segStart / rate;
      for (const w of estimateWordTimes(sp.text, (n - segStart) / rate)) words.push({ start: at(w.start), end: endAt(w.end), t0: t0 + w.t0, t1: t0 + w.t1, estimated: true });
    }
  }
  if (!rate) throw new Error("the engine returned no audio");
  const samples = new Float32Array(n);
  let off = 0;
  for (const p of parts) {
    samples.set(p, off);
    off += p.length;
  }
  return { samples, sampleRate: rate, duration: n / rate, engine: e.id, words, phonemes };
}

/** Linear resample for an engine whose chunks change rate mid render. */
function resample(x: Float32Array, from: number, to: number): Float32Array {
  const n = Math.max(1, Math.round((x.length * to) / from));
  const y = new Float32Array(n);
  const k = from / to;
  for (let i = 0; i < n; i++) {
    const p = i * k;
    const a = Math.floor(p);
    const f = p - a;
    y[i] = (x[a] ?? 0) * (1 - f) + (x[Math.min(a + 1, x.length - 1)] ?? 0) * f;
  }
  return y;
}

/** The render as 16 bit wav bytes. */
export function renderedWavBytes(r: RenderedSpeech): Uint8Array {
  return encodeWav([r.samples], r.sampleRate, "pcm16");
}

/** The render as a wav Blob for "save wav". */
export function renderedWav(r: RenderedSpeech): Blob {
  return new Blob([renderedWavBytes(r) as Uint8Array<ArrayBuffer>], { type: "audio/wav" });
}

/** The render as an AudioBuffer (or the context's buffer type) at the render's rate. */
export function renderedBuffer<B extends BufferLike>(ctx: { createBuffer(channels: number, length: number, rate: number): B }, r: RenderedSpeech): B {
  const b = ctx.createBuffer(1, r.samples.length, r.sampleRate);
  b.getChannelData(0).set(r.samples);
  return b;
}

/** Word and phoneme times as json for the lipsync tool and "export word timing". */
export function renderedTiming(r: RenderedSpeech, text: string): { engine: string; sampleRate: number; duration: number; words: (RenderedTimed & { text: string })[]; phonemes: RenderedTimed[] } {
  return {
    engine: r.engine,
    sampleRate: r.sampleRate,
    duration: r.duration,
    words: r.words.map((w) => ({ ...w, text: text.slice(w.start, w.end) })),
    phonemes: r.phonemes,
  };
}

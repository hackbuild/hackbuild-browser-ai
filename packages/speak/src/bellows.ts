/**
 * Bellows: the articulatory voice of bellows-voice (the owner's physical
 * model of a vocal tract for the bellowsjs engine, MIT) as a PcmEngine. It
 * has no weights, so there is no weight licence to state; the code it runs
 * is MIT. Each segment is rendered offline with `renderSpeech` from
 * `bellows-voice/engine` (0.8.0, git ac30dc2, not on npm on 2026-11-23),
 * which returns the samples and the exact phoneme spans the engine sang.
 *
 * Randomness: the engine draws its jitter and noise from a string seed.
 * The seed is drawn once from the injected Rng when the engine is made,
 * and each segment adds its count, so the same Rng gives the same audio
 * and no draw here goes to the platform random source.
 *
 * The render runs on the calling thread (bellows reports 8 s of speech in
 * 1.1 to 1.8 s in Node, vendor), so pass `render` to move it to a worker.
 */

import type { LoadContext, PcmChunk, PcmEngine, Timed, VoiceConfig } from "./types.js";

export type Rng = () => number;

/** One timed sound, as bellows-voice's SungSpan, seconds from the segment start. */
export interface BellowsSpan {
  ipa: string;
  start: number;
  end: number;
}

export interface BellowsRenderOptions {
  voice?: string;
  seed: string;
  sampleRate?: number;
  rate?: number;
  hz?: number;
  accent?: string;
  tail?: number;
}

export interface BellowsRender {
  samples: Float32Array;
  sampleRate: number;
  spans: BellowsSpan[];
}

/** The part of `bellows-voice/engine` this adapter calls. */
export interface BellowsVoiceModule {
  renderSpeech(text: string, opts: BellowsRenderOptions): BellowsRender;
}

export interface BellowsOptions {
  /** Loads bellows-voice/engine (it imports bellowsjs 0.5.x itself), e.g. through runtimeLoader. */
  runtime: () => Promise<BellowsVoiceModule>;
  /** The injected random source; drawn once, for the seed. */
  rng: Rng;
  /** A bellows-voice starter voice id. Default "narrator-female". */
  voice?: string;
  /** One of its accents by id. Default the engine's General American. */
  accent?: string;
  /** Default 48000. */
  sampleRate?: number;
  /** Replaces the in-thread render, e.g. with a call into a worker that runs renderSpeech. */
  render?: (text: string, opts: BellowsRenderOptions, signal: AbortSignal) => Promise<BellowsRender>;
}

/** The starter voices of bellows-voice 0.8.0 (VOICE_PRESETS ids). */
export const BELLOWS_VOICES = [
  "narrator-female", "narrator-male", "child", "bass", "baritone", "tenor", "contralto", "mezzo", "soprano", "pop-female", "pop-male", "rock", "elder", "beatboxer",
] as const;

/** A seed string from an Rng: one draw, 32 bits. */
export const seedFrom = (rng: Rng): string => String((rng() * 2 ** 32) >>> 0);

/** Spans to phoneme timings. The engine reports no words, so each phoneme covers the whole segment text. */
export function spansToPhonemes(spans: readonly BellowsSpan[], textLength: number): Timed[] {
  const out: Timed[] = [];
  for (const s of spans) {
    if (s.ipa === "_" || !(s.end > s.start)) continue;
    out.push({ start: 0, end: textLength, t0: Math.max(0, s.start), t1: s.end, phoneme: s.ipa });
  }
  return out;
}

export function bellowsEngine(o: BellowsOptions): PcmEngine {
  let mod: BellowsVoiceModule | null = null;
  const seed = seedFrom(o.rng);
  let count = 0;
  return {
    kind: "pcm",
    id: "bellows",
    licence: "none, no weights (bellows-voice and bellowsjs code MIT)",
    async load(ctx: LoadContext) {
      if (mod || o.render) return;
      ctx.onStatus?.({ engine: "bellows", kind: "licence", text: "bellows voice: no weights, code mit" });
      ctx.onStatus?.({ engine: "bellows", kind: "loading", text: "loading bellows-voice" });
      mod = await o.runtime();
      if (typeof mod.renderSpeech !== "function") {
        mod = null;
        throw new Error("bellows-voice has no renderSpeech; it needs 0.8.0 or later");
      }
      ctx.onStatus?.({ engine: "bellows", kind: "ready", text: "bellows voice ready, renders on this thread" });
    },
    async *synth(text: string, cfg: VoiceConfig, signal: AbortSignal): AsyncGenerator<PcmChunk> {
      const opts: BellowsRenderOptions = {
        voice: cfg.voice ?? o.voice ?? "narrator-female",
        seed: `${seed}:${count++}`,
        sampleRate: o.sampleRate ?? 48000,
        tail: 0.15,
        ...(cfg.rate !== undefined ? { rate: cfg.rate } : {}),
        ...(o.accent !== undefined ? { accent: o.accent } : {}),
      };
      let r: BellowsRender;
      if (o.render) r = await o.render(text, opts, signal);
      else {
        if (!mod) throw new Error("bellows is not loaded");
        await Promise.resolve();
        r = mod.renderSpeech(text, opts);
      }
      if (signal.aborted) return;
      yield { samples: r.samples, sampleRate: r.sampleRate, phonemes: spansToPhonemes(r.spans, text.length) };
    },
    voices: () => [...BELLOWS_VOICES],
  };
}

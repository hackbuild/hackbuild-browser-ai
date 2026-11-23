/**
 * Bellows: the articulatory voice of bellows-voice (the owner's physical
 * model of a vocal tract for the bellowsjs engine, MIT) as a PcmEngine. It
 * has no weights, so there is no weight licence to state; the code it runs
 * is MIT. Each segment is rendered offline with `renderSpeech` from
 * `bellows-voice/engine` (bellows-voice 0.8.0 on npm),
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

/** The parts of bellowsjs 0.5 and bellows-voice 0.7 (index and /engine) `renderSpeechFrom` calls. */
export interface BellowsParts {
  bellows: {
    internParam(name: string): number;
    registerBuiltins(): void;
    registerEngine(e: unknown): void;
    renderOffline(setup: unknown[], o: { seconds: number; sampleRate?: number }): { left: Float32Array; right: Float32Array; sampleRate: number };
  };
  voice: {
    lyricsToSyllables(text: string, o?: Record<string, unknown>): unknown[];
    speechPlan(syllables: readonly unknown[], o?: Record<string, unknown>, questions?: readonly boolean[]): { syllables: unknown[]; notes: { hz: number; dur: number; rest?: boolean }[] };
    planSung(notes: readonly { time: number; dur: number; hz: number }[], syllables: readonly unknown[], o?: Record<string, unknown>): { phrases: { start: number; end: number; spans: BellowsSpan[] }[] };
    sungEvents(plan: unknown, o: Record<string, unknown>): { events: unknown[]; leadIn: number };
    resolveAccent(a?: unknown): { prosody?: unknown };
    spellOut(text: string): string;
    voicePreset(id: string): { params: Record<string, number>; speechHz: number } | undefined;
    VOCAL_PLAN_LEAD: number;
    vocalGlideLead(): number;
  };
  engine: { vocalEngine: unknown };
}

/**
 * Legacy: a renderSpeech for bellows-voice 0.7.3, which has none, built from its
 * public API as its own Singer.speak lays a line out: phrases at their
 * marks, speechPlan timing, planSung spans, sungEvents for the kernel and
 * renderOffline on this thread. Spoken consonants at full length, as in
 * bellows-voice (SPOKEN_CONSONANT_SCALE 1).
 */
export function renderSpeechFrom(p: BellowsParts): BellowsVoiceModule {
  let registered = false;
  return {
    renderSpeech(text, o) {
      const { bellows: b, voice: v } = p;
      if (!registered) {
        b.registerBuiltins();
        b.registerEngine(p.engine.vocalEngine);
        registered = true;
      }
      const preset = v.voicePreset(o.voice ?? "narrator-female");
      if (!preset) throw new Error(`bellows-voice: no starter voice "${o.voice}"`);
      const accent = v.resolveAccent(o.accent);
      const syllables: unknown[] = [];
      const questions: boolean[] = [];
      for (const m of v.spellOut(text).matchAll(/[^.!?;:,\n]+[.!?;:,\n]*/gu)) {
        const part = v.lyricsToSyllables(m[0], { numbers: false, accent, reduce: true }) as { phraseEnd?: boolean }[];
        if (!part.length) continue;
        part[part.length - 1]!.phraseEnd = true;
        syllables.push(...part);
        questions.push(m[0].includes("?"));
      }
      const line = v.speechPlan(syllables, { hz: o.hz ?? preset.speechHz, rate: o.rate, prosody: accent.prosody }, questions);
      const lay = (at: number) => {
        const out: { time: number; dur: number; hz: number }[] = [];
        let t = at;
        for (const n of line.notes) {
          const dur = Number.isFinite(n.dur) && n.dur > 0 ? n.dur : 0;
          if (!n.rest) out.push({ time: t, dur, hz: n.hz });
          t += dur;
        }
        return out;
      };
      const ids = { phonemeParam: b.internParam("phoneme"), bendParam: b.internParam("bend"), nextPhonemeParam: b.internParam("nextPhoneme"), nextInParam: b.internParam("nextIn") };
      const plan1 = (at: number) => {
        const plan = v.planSung(lay(at), line.syllables, { consonantScale: 1 });
        const posted = v.sungEvents(plan, { channel: 0, ...ids, planLead: v.VOCAL_PLAN_LEAD, bendLead: v.vocalGlideLead(), firstNoteId: 1, busy: [], notBefore: 0 });
        return { plan, posted };
      };
      let { plan, posted } = plan1(0);
      if (posted.leadIn > 0) ({ plan, posted } = plan1(posted.leadIn));
      const end = plan.phrases.reduce((e, ph) => Math.max(e, ph.end), 0);
      const sampleRate = o.sampleRate ?? 48000;
      const setup = [
        ...Object.entries({ phoneme: ids.phonemeParam, bend: ids.bendParam, nextPhoneme: ids.nextPhonemeParam, nextIn: ids.nextInParam }).map(([name, index]) => ({ type: "internParam", name, index })),
        { type: "createChannel", id: 0, engineId: "vocal", params: preset.params, seed: `${o.seed}::ch0` },
        { type: "events", events: posted.events },
      ];
      const a = b.renderOffline(setup, { seconds: end + (o.tail ?? 0.4), sampleRate });
      const samples = new Float32Array(a.left.length);
      for (let i = 0; i < samples.length; i++) samples[i] = 0.5 * (a.left[i]! + a.right[i]!);
      return { samples, sampleRate: a.sampleRate, spans: plan.phrases.flatMap((ph) => ph.spans) };
    },
  };
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
        throw new Error("bellows-voice has no renderSpeech; pass bellows-voice 0.8.0 /engine, or renderSpeechFrom(parts) for 0.7.3");
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

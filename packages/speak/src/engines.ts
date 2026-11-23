/**
 * Engines: Kokoro through kokoro-js (or a transformers.js style module the
 * caller passes), Web Speech, and a stub that needs no weights. Pocket TTS
 * lives in pocket.ts.
 */

import type { LoadContext, NativeEngine, PcmChunk, PcmEngine, Timed, VoiceConfig } from "./types.js";
import { wordSpans } from "./text.js";

/** A tone engine for `?stub` pages and tests: 60 ms per character at a low level, with exact word times. */
export function stubEngine(o: { id?: string; rate?: number; secPerChar?: number; chunkSec?: number; fail?: "load" | "synth" | "hang" } = {}): PcmEngine {
  const sr = o.rate ?? 24000;
  const spc = o.secPerChar ?? 0.06;
  const chunkSec = o.chunkSec ?? 0.25;
  return {
    kind: "pcm",
    id: o.id ?? "stub",
    licence: "none, no weights",
    async load() {
      if (o.fail === "load") throw new Error("stub engine refused to load");
    },
    async *synth(text, cfg, signal): AsyncGenerator<PcmChunk> {
      if (o.fail === "synth") throw new Error("stub engine failed to synthesize");
      if (o.fail === "hang") {
        await new Promise<void>((res) => signal.addEventListener("abort", () => res(), { once: true }));
        return;
      }
      const dur = (text.length * spc) / (cfg.rate ?? 1);
      const total = Math.max(1, Math.round(dur * sr));
      const words: Timed[] = wordSpans(text).map((w) => ({ ...w, t0: (w.start * spc) / (cfg.rate ?? 1), t1: (w.end * spc) / (cfg.rate ?? 1) }));
      const step = Math.round(chunkSec * sr);
      for (let off = 0; off < total; off += step) {
        if (signal.aborted) return;
        await Promise.resolve();
        const n = Math.min(step, total - off);
        const samples = new Float32Array(n);
        for (let i = 0; i < n; i++) samples[i] = 0.05 * Math.sin((2 * Math.PI * 220 * (off + i)) / sr);
        const t0 = off / sr;
        const t1 = (off + n) / sr;
        const inChunk = words.filter((w) => w.t0 >= t0 && w.t0 < t1).map((w) => ({ ...w, t0: w.t0 - t0, t1: w.t1 - t0 }));
        yield { samples, sampleRate: sr, words: inChunk };
      }
    },
    voices: () => ["stub"],
  };
}

/** The parts of kokoro-js this adapter calls (kokoro-js 1.2.1). */
export interface KokoroModule {
  KokoroTTS: {
    from_pretrained(id: string, o: Record<string, unknown>): Promise<{
      generate(text: string, o: { voice?: string; speed?: number }): Promise<{ audio: Float32Array; sampling_rate: number }>;
      list_voices?(): unknown;
      voices?: Record<string, unknown>;
    }>;
  };
}

export interface KokoroOptions {
  /** Loads kokoro-js, e.g. runtimeLoader(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]) from @hackbuild/devices. */
  runtime: () => Promise<KokoroModule>;
  /** onnx-community/Kokoro-82M-v1.0-ONNX, weights Apache-2.0. */
  model?: string;
  /** "webgpu" runs fp32, "wasm" runs q8 (webgpu with q8 gave garbled audio in the source build). Default wasm. */
  device?: "webgpu" | "wasm";
  voice?: string;
  /**
   * kokoro-js phonemizes through eSpeak NG, which is GPL-3.0-or-later. The
   * engine refuses to load until the caller sets this, after reading
   * KOKORO_GPL_NOTICE. No non-GPL phonemizer for kokoro-js is known on
   * 2026-11-23.
   */
  allowGplPhonemizer?: boolean;
}

/** What loading kokoro-js brings in, stated before it loads. */
export const KOKORO_GPL_NOTICE =
  "kokoro-js phonemizes with the phonemizer package, which is eSpeak NG compiled to wasm under GPL-3.0-or-later. it loads from your url at run time and is never bundled into this MIT package; an app that ships kokoro-js takes on the GPL terms.";

/**
 * Kokoro 82M, opt in: see KOKORO_GPL_NOTICE. Whole segments are generated at once; word times are
 * estimated from the segment length by the speaker, since kokoro-js
 * reports none.
 */
export function kokoroEngine(o: KokoroOptions): PcmEngine {
  type Tts = Awaited<ReturnType<KokoroModule["KokoroTTS"]["from_pretrained"]>>;
  let tts: Tts | null = null;
  const device = o.device ?? "wasm";
  return {
    kind: "pcm",
    id: "kokoro",
    licence: "Kokoro-82M weights Apache-2.0; kokoro-js phonemizer (eSpeak NG) GPL-3.0-or-later",
    async load(ctx: LoadContext) {
      if (tts) return;
      if (!o.allowGplPhonemizer) throw new Error(`${KOKORO_GPL_NOTICE} pass allowGplPhonemizer: true to load it.`);
      ctx.onStatus?.({ engine: "kokoro", kind: "licence", text: "kokoro 82m weights apache-2.0; its phonemizer, espeak ng, is gpl-3.0-or-later" });
      const m = await o.runtime();
      tts = await m.KokoroTTS.from_pretrained(o.model ?? "onnx-community/Kokoro-82M-v1.0-ONNX", {
        dtype: device === "webgpu" ? "fp32" : "q8",
        device,
        progress_callback: (p: { progress?: number; status?: string }) =>
          ctx.onStatus?.({ engine: "kokoro", kind: "loading", text: p.status ?? "loading", ...(p.progress !== undefined ? { progress: p.progress } : {}) }),
      });
      ctx.onStatus?.({ engine: "kokoro", kind: "ready", text: `kokoro ready on ${device}` });
    },
    async *synth(text: string, cfg: VoiceConfig, signal: AbortSignal) {
      if (!tts) throw new Error("kokoro is not loaded");
      const a = await tts.generate(text, { voice: cfg.voice ?? o.voice ?? "af_heart", speed: cfg.rate ?? 1 });
      if (signal.aborted) return;
      yield { samples: a.audio, sampleRate: a.sampling_rate };
    },
    voices: () => (tts?.voices ? Object.keys(tts.voices) : ["af_heart"]),
  };
}

/** The parts of the Web Speech synthesis API used here. */
export interface SynthLike {
  speak(u: UtteranceLike): void;
  cancel(): void;
  getVoices(): { name: string; lang: string }[];
}
export interface UtteranceLike {
  text: string;
  rate: number;
  pitch: number;
  voice: { name: string; lang: string } | null;
  onboundary: ((ev: { charIndex: number; charLength?: number; name?: string }) => void) | null;
  onstart?: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((ev: { error?: string }) => void) | null;
}

/** The system voice. Plays itself; word boundaries come from the browser. */
export function webSpeechEngine(o: { synth?: SynthLike; Utterance?: new (text: string) => UtteranceLike } = {}): NativeEngine {
  const g = globalThis as unknown as { speechSynthesis?: SynthLike; SpeechSynthesisUtterance?: new (t: string) => UtteranceLike };
  const synth = o.synth ?? g.speechSynthesis;
  const U = o.Utterance ?? g.SpeechSynthesisUtterance;
  return {
    kind: "native",
    id: "webspeech",
    licence: "system voices, the browser's and platform's terms",
    async load() {
      if (!synth || !U) throw new Error("no speechSynthesis in this browser");
    },
    speak(text, cfg, hooks, signal) {
      return new Promise<void>((resolve, reject) => {
        if (!synth || !U) return reject(new Error("no speechSynthesis in this browser"));
        const u = new U(text);
        u.rate = cfg.rate ?? 1;
        u.pitch = cfg.pitch ?? 1;
        u.voice = synth.getVoices().find((v) => v.name === cfg.voice) ?? null;
        u.onboundary = (ev) => {
          if (ev.name === undefined || ev.name === "word") hooks.onBoundary(ev.charIndex, ev.charLength);
        };
        u.onstart = () => hooks.onStart?.();
        u.onend = () => resolve();
        u.onerror = (ev) => (ev.error === "interrupted" || ev.error === "canceled" ? resolve() : reject(new Error(`speech synthesis: ${ev.error ?? "error"}`)));
        signal.addEventListener("abort", () => synth.cancel(), { once: true });
        synth.speak(u);
      });
    },
    stop() {
      synth?.cancel();
    },
    voices: () => synth?.getVoices().map((v) => v.name) ?? [],
  };
}

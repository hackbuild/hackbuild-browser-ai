/**
 * Pocket TTS (Kyutai, code MIT, weights CC-BY-4.0) through a community
 * browser build's inference worker. The worker is fetched as text and
 * rewritten so it runs from file:// and on one thread; every rewrite goes
 * through @hackbuild/ai-env, which reports the ones that matched nothing.
 * An upstream change that moves a patched string is reported as
 * `patch-missed` and, by default, fails the load so the chain moves to the
 * next engine instead of hanging.
 *
 * Worker protocol (as observed in the source builds): in `load`,
 * `set_voice {voiceName}`, `generate {text, voice}`, `encode_voice {audio}`,
 * `stop`; out `model_status`, `status`, `voices_loaded`, `bundle_loaded
 * {sampleRate}`, `loaded`, `generation_started`, `audio_chunk {data}`,
 * `stream_ended`, `voice_encoded`, `error`.
 */

import { spawnWorker, type Rewrite, type SpawnOptions, type WorkerLike } from "@hackbuild/ai-env";
import { prepareClone } from "./clone.js";
import type { LoadContext, PcmChunk, PcmEngine, VoiceConfig } from "./types.js";

/** The community build the source apps used. Caller may pass another base. */
export const POCKET_SPACE_BASE = "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/";

/** Prelude that loads sentencepiece.js from a Blob URL, falling back to a data: URL. */
export function pocketPrelude(base: string): string {
  const url = JSON.stringify(new URL("sentencepiece.js", base).href);
  return [
    "self.__hbSentencepiece = async () => {",
    `  const t = await (await fetch(${url})).text();`,
    "  try { return await import(URL.createObjectURL(new Blob([t], { type: 'text/javascript' }))); }",
    "  catch (e) { const u = new TextEncoder().encode(t); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));",
    "    return await import('data:text/javascript;base64,' + btoa(s)); }",
    "};",
  ].join("\n");
}

/** The four rewrites, in order: sentencepiece import, chunk gap, one wasm thread with no proxy, absolute relative paths. */
export function pocketRewrites(base: string, chunkGapSec = 0.1): Rewrite[] {
  return [
    [/import\(\s*(["'`])\.\/sentencepiece\.js(?:\?[^"'`]*)?\1\s*\)/, "self.__hbSentencepiece()"],
    [/CHUNK_GAP_SEC\s*=\s*[\d.]+/, `CHUNK_GAP_SEC = ${chunkGapSec}`],
    [/(\w+)\.env\.wasm\.wasmPaths\s*=/, "$1.env.wasm.numThreads = 1; $1.env.wasm.proxy = false; $1.env.wasm.wasmPaths ="],
    [/(["'`])\.\/(?!\.)/, `$1${base}`],
  ];
}

export interface PocketOptions {
  base?: string;
  /** Fail the load when a rewrite matched nothing. Default true. */
  strictPatches?: boolean;
  chunkGapSec?: number;
  /** How long to wait for `loaded`. Default 420 s (the source builds' figure). */
  loadTimeoutMs?: number;
  voice?: string;
  /** Passed to spawnWorker: worker constructor, fetch, rung order (default classic-blob first). */
  spawn?: Omit<SpawnOptions, "rewrites" | "prelude" | "onMissed">;
  /** Timer for the load timeout. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

export interface PocketEngine extends PcmEngine {
  /** Encode a caller supplied reference (any rate, mono) as voice "custom". Nothing is stored or bundled here. */
  cloneVoice(samples: Float32Array, rate: number): Promise<void>;
  readonly sampleRate: number;
}

type Msg = { type?: string; data?: unknown; error?: string; voices?: unknown[]; defaultVoice?: string; sampleRate?: number; status?: string; text?: string };

export function pocketEngine(o: PocketOptions = {}): PocketEngine {
  const base = o.base ?? POCKET_SPACE_BASE;
  const st = o.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
  const ct = o.clearTimeout ?? ((h) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let w: WorkerLike | null = null;
  let voices: string[] = [];
  let voice = o.voice ?? "";
  let sr = 24000;
  let sink: ((m: Msg) => void) | null = null;
  let busy: Promise<void> = Promise.resolve();

  const engine: PocketEngine = {
    kind: "pcm",
    id: "pocket",
    licence: "Pocket TTS weights CC-BY-4.0 (Kyutai), code MIT",
    get sampleRate() {
      return sr;
    },
    async load(ctx: LoadContext) {
      if (w) return;
      const say = (kind: Parameters<NonNullable<LoadContext["onStatus"]>>[0]["kind"], text: string, progress?: number) =>
        ctx.onStatus?.({ engine: "pocket", kind, text, ...(progress !== undefined ? { progress } : {}) });
      say("licence", "pocket tts weights, cc-by-4.0, kyutai");
      let missed: { index: number; pattern: string }[] = [];
      const spawned = await spawnWorker(
        { url: new URL("inference-worker.js", base).href },
        {
          prefer: ["classic-blob", "module-blob"],
          ...o.spawn,
          prelude: pocketPrelude(base),
          rewrites: pocketRewrites(base, o.chunkGapSec),
          onMissed: (m) => (missed = m),
        },
      );
      if (missed.length) {
        say("patch-missed", `worker patches matched nothing: ${missed.map((m) => m.pattern).join(", ")}`);
        if (o.strictPatches !== false) {
          spawned.worker.terminate();
          throw new Error("pocket worker changed upstream; patches did not match");
        }
      }
      const worker = spawned.worker;
      await new Promise<void>((resolve, reject) => {
        const to = st(() => {
          worker.removeEventListener("message", on);
          reject(new Error(`pocket did not load in ${(o.loadTimeoutMs ?? 420000) / 1000} s`));
        }, o.loadTimeoutMs ?? 420000);
        const on = (ev: { data?: unknown }) => {
          const m = (ev.data ?? {}) as Msg;
          if (m.type === "model_status" || m.type === "status") say("loading", String(m.text ?? m.status ?? "loading").slice(0, 40));
          else if (m.type === "voices_loaded") {
            voices = (m.voices ?? []).map((v) => (typeof v === "string" ? v : String((v as { name?: string; id?: string }).name ?? (v as { id?: string }).id)));
            voice ||= m.defaultVoice ?? voices[0] ?? "";
          } else if (m.type === "bundle_loaded" && m.sampleRate) sr = m.sampleRate;
          else if (m.type === "loaded") {
            ct(to);
            resolve();
          } else if (m.type === "error") {
            ct(to);
            reject(new Error(m.error ?? "pocket worker error"));
          }
        };
        worker.addEventListener("message", on);
        worker.postMessage({ type: "load" });
      });
      worker.addEventListener("message", (ev) => sink?.((ev.data ?? {}) as Msg));
      w = worker;
      if (voice) worker.postMessage({ type: "set_voice", data: { voiceName: voice } });
      say("ready", `pocket ready on ${spawned.rung}`);
    },
    synth(text: string, cfg: VoiceConfig, signal: AbortSignal): AsyncIterable<PcmChunk> {
      const worker = w;
      if (!worker) throw new Error("pocket is not loaded");
      return {
        [Symbol.asyncIterator]: async function* () {
          // one generate at a time
          let release!: () => void;
          const prev = busy;
          busy = new Promise<void>((r) => (release = r));
          await prev;
          const queue: Msg[] = [];
          let wake: (() => void) | null = null;
          sink = (m) => {
            queue.push(m);
            wake?.();
          };
          const onAbort = () => {
            worker.postMessage({ type: "stop" });
            wake?.();
          };
          signal.addEventListener("abort", onAbort, { once: true });
          try {
            const v = cfg.voice ?? voice;
            worker.postMessage({ type: "generate", data: { text, voice: v } });
            for (;;) {
              if (signal.aborted) return;
              const m = queue.shift();
              if (!m) {
                await new Promise<void>((r) => (wake = r));
                wake = null;
                continue;
              }
              if (m.type === "audio_chunk" && m.data instanceof Float32Array) yield { samples: m.data, sampleRate: sr };
              else if (m.type === "stream_ended") return;
              else if (m.type === "error") throw new Error(m.error ?? "pocket generate error");
            }
          } finally {
            signal.removeEventListener("abort", onAbort);
            sink = null;
            release();
          }
        },
      };
    },
    async cloneVoice(samples, rate) {
      const worker = w;
      if (!worker) throw new Error("pocket is not loaded");
      const audio = prepareClone(samples, rate, { rate: 24000 });
      await new Promise<void>((resolve, reject) => {
        sink = (m) => {
          if (m.type === "voice_encoded") resolve();
          else if (m.type === "error") reject(new Error(m.error ?? "voice encode error"));
        };
        worker.postMessage({ type: "encode_voice", data: { audio } });
      });
      sink = null;
      voice = "custom";
      worker.postMessage({ type: "set_voice", data: { voiceName: "custom" } });
    },
    voices: () => voices,
    dispose() {
      w?.terminate();
      w = null;
    },
  };
  return engine;
}

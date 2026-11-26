/**
 * Pocket TTS (Kyutai, weights CC-BY-4.0) through a community browser
 * build's inference worker (its Space card says cc-by-4.0). The build is
 * pinned to one commit, and its two scripts are checked against SHA-256
 * values measured at that commit before they run. The worker is fetched as text and
 * rewritten so it runs from file:// and on one thread; every rewrite goes
 * through @hackbuild/ai-env, which reports the ones that matched nothing.
 * An upstream change that moves a patched string is reported as
 * `patch-missed` and, by default, fails the load so the chain moves to the
 * next engine instead of hanging.
 *
 * Worker protocol (as observed): in `load`,
 * `set_voice {voiceName}`, `generate {text, voice}`, `encode_voice {audio}`,
 * `stop`; out `model_status`, `status`, `voices_loaded`, `bundle_loaded
 * {sampleRate}`, `loaded`, `generation_started`, `audio_chunk {data}`,
 * `stream_ended`, `voice_encoded`, `error`.
 */

import { sha256Text, spawnWorker, type Rewrite, type SpawnOptions, type WorkerLike } from "@hackbuild/ai-env";
import { prepareClone } from "./clone.js";
import type { LoadContext, PcmChunk, PcmEngine, VoiceConfig } from "./types.js";

/** The community build's commit, pinned 2026-11-23 (the Space's head, modified 2026-04-21). */
export const POCKET_SPACE_COMMIT = "d0c0c79b7712256a32d691c67f20b8ae2e020d00";
/** The community build at that commit. A caller may pass another base, with its own hashes. */
export const POCKET_SPACE_BASE = `https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/${POCKET_SPACE_COMMIT}/`;
/** SHA-256 of the build's scripts at POCKET_SPACE_COMMIT (measured 2026-11-23: 33984 and 4020131 bytes). */
export const POCKET_SHA256 = {
  worker: "dace0a022e17dffcf60fdb7b86e49facf093f709b352fb306c1d6641ae0f5366",
  sentencepiece: "fc802c6945931e685d82d0f601cda185bb43990870d712119caf5ea74e6e9c56",
} as const;

/** Prelude that imports the checked sentencepiece.js text from a Blob URL, falling back to a data: URL. */
export function pocketPrelude(sentencepieceSource: string): string {
  return [
    "self.__hbSentencepiece = async () => {",
    `  const t = ${JSON.stringify(sentencepieceSource)};`,
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

/** Build base, hashes, patch strictness, chunk gap, load timeout, voice and worker spawn options for pocketEngine. */
export interface PocketOptions {
  base?: string;
  /** Fail the load when a rewrite matched nothing. Default true. */
  strictPatches?: boolean;
  chunkGapSec?: number;
  /** How long to wait for `loaded`. Default 420 s. */
  loadTimeoutMs?: number;
  voice?: string;
  /**
   * SHA-256 of inference-worker.js and sentencepiece.js. Default POCKET_SHA256
   * for the default base. With another base and no hashes the scripts run
   * unchecked, which the load reports.
   */
  sha256?: { worker: string; sentencepiece: string };
  /** Passed to spawnWorker: worker constructor, fetch, rung order (default classic-blob first). */
  spawn?: Omit<SpawnOptions, "rewrites" | "prelude" | "onMissed">;
  /** Timer for the load timeout. */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (h: unknown) => void;
}

/** A PCM engine for Pocket TTS that can also clone a voice from a reference you supply. */
export interface PocketEngine extends PcmEngine {
  /** Encode a caller supplied reference (any rate, mono) as voice "custom". Nothing is stored or bundled here. */
  cloneVoice(samples: Float32Array, rate: number): Promise<void>;
  readonly sampleRate: number;
}

type Msg = { type?: string; data?: unknown; error?: string; voices?: unknown[]; defaultVoice?: string; sampleRate?: number; status?: string; text?: string };

/** Pocket TTS (weights CC-BY-4.0) in a patched worker from the pinned community browser build. */
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
    licence: "Pocket TTS weights CC-BY-4.0 (Kyutai); the browser build's scripts per its Space card, cc-by-4.0",
    get sampleRate() {
      return sr;
    },
    async load(ctx: LoadContext) {
      if (w) return;
      const say = (kind: Parameters<NonNullable<LoadContext["onStatus"]>>[0]["kind"], text: string, progress?: number) =>
        ctx.onStatus?.({ engine: "pocket", kind, text, ...(progress !== undefined ? { progress } : {}) });
      say("licence", "pocket tts weights, cc-by-4.0, kyutai");
      const sums = o.sha256 ?? (base === POCKET_SPACE_BASE ? POCKET_SHA256 : null);
      if (!sums) say("loading", "pocket scripts from a custom base run unchecked; pass sha256 to pin them");
      const f = o.spawn?.fetch ?? globalThis.fetch.bind(globalThis);
      const spUrl = new URL("sentencepiece.js", base).href;
      const spRes = await f(spUrl);
      if (!spRes.ok) throw new Error(`sentencepiece.js http ${spRes.status}`);
      const sp = await spRes.text();
      if (sums) {
        const got = await sha256Text(sp);
        if (got !== sums.sentencepiece) throw new Error(`sentencepiece.js sha256 ${got}, expected ${sums.sentencepiece}`);
      }
      let missed: { index: number; pattern: string }[] = [];
      const spawned = await spawnWorker(
        { url: new URL("inference-worker.js", base).href, ...(sums ? { sha256: sums.worker } : {}) },
        {
          prefer: ["classic-blob", "module-blob"],
          ...o.spawn,
          prelude: pocketPrelude(sp),
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
      // a load that times out or errors terminates its worker, so a retry does not leave one downloading
      const fail = (err: Error, reject: (e: Error) => void) => {
        worker.removeEventListener("message", on);
        worker.terminate();
        reject(err);
      };
      let on: (ev: { data?: unknown }) => void = () => {};
      await new Promise<void>((resolve, reject) => {
        const to = st(() => fail(new Error(`pocket did not load in ${(o.loadTimeoutMs ?? 420000) / 1000} s`), reject), o.loadTimeoutMs ?? 420000);
        on = (ev: { data?: unknown }) => {
          const m = (ev.data ?? {}) as Msg;
          if (m.type === "model_status" || m.type === "status") say("loading", String(m.text ?? m.status ?? "loading").slice(0, 40));
          else if (m.type === "voices_loaded") {
            voices = (m.voices ?? []).map((v) => (typeof v === "string" ? v : String((v as { name?: string; id?: string }).name ?? (v as { id?: string }).id)));
            voice ||= m.defaultVoice ?? voices[0] ?? "";
          } else if (m.type === "bundle_loaded" && m.sampleRate) sr = m.sampleRate;
          else if (m.type === "loaded") {
            ct(to);
            worker.removeEventListener("message", on);
            resolve();
          } else if (m.type === "error") {
            ct(to);
            fail(new Error(m.error ?? "pocket worker error"), reject);
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
      // the worker has one message sink; wait for a running generate to finish first
      let release!: () => void;
      const prev = busy;
      busy = new Promise<void>((r) => (release = r));
      await prev;
      try {
        await new Promise<void>((resolve, reject) => {
          sink = (m) => {
            if (m.type === "voice_encoded") resolve();
            else if (m.type === "error") reject(new Error(m.error ?? "voice encode error"));
          };
          worker.postMessage({ type: "encode_voice", data: { audio } });
        });
      } finally {
        sink = null;
        release();
      }
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

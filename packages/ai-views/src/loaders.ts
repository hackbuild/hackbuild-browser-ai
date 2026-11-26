/**
 * jobLoader: the real loader of a pick. Pass it to `useModelPick(job, {
 * loader: jobLoader(job) })` and a load fetches the runtime (transformers.js,
 * onnxruntime web, WebLLM, wllama, MediaPipe, a voice) from its pinned CDN
 * only when the person presses load, fetches the weights through
 * @hackbuild/weights where the runtime does not fetch its own, and resolves
 * to the object a page uses for that job. Nothing loads at import.
 *
 * One models hub is shared by every jobLoader made with the same options
 * object (or with none), so a model loaded for one view is reused by the next
 * and webgpu work takes one gpu lock.
 */

import { importEsm, probe, type Env } from "@hackbuild/ai-env";
import type { ChatEngine } from "@hackbuild/chat";
import type { Dsp } from "@hackbuild/audio-dsp";
import type { OrtModule, TjsModule } from "@hackbuild/devices";
import type { Embedder } from "@hackbuild/embed";
import type { ClipTokenize, FormOptions, ImageGenerator } from "@hackbuild/imagegen";
import { createHub, createRegistry, pinnedUrl, type FactoryContext, type Hub, type ModelRecord } from "@hackbuild/models";
import type { Engine } from "@hackbuild/speak";
import type { WeightStore } from "@hackbuild/weights";
import { hfResolve } from "@hackbuild/weights";
import { ALL_RECORDS, type Job } from "./jobs.js";
import type { FrameBox } from "./frame.js";
import type { FoundMask, MaskEverythingOptions, MaskModels } from "./mount-mask.js";
import type { LoadContext, Loader } from "./pick.js";
import type { RunResult, Transcriber } from "./transcribe.js";

/** Pinned CDN modules jobLoader imports at load time. */
export const RUNTIME_URLS = {
  webllm: ["https://esm.run/@mlc-ai/web-llm@0.2.84", "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm"],
  bellows: ["https://cdn.jsdelivr.net/npm/bellows-voice@0.8.0/engine/+esm"],
  kokoro: ["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"],
} as const;

/** The runtime modules, each a function that imports it. Tests pass fakes; a page leaves them out. */
export interface RuntimeModules {
  transformers?: () => Promise<TjsModule>;
  ort?: () => Promise<OrtModule>;
  webllm?: () => Promise<unknown>;
  wllama?: () => Promise<unknown>;
  tasksVision?: () => Promise<unknown>;
  kokoro?: () => Promise<unknown>;
  bellows?: () => Promise<unknown>;
  /** The audio dsp core transcription runs on; default the wasm inlined in @hackbuild/audio-dsp. */
  dsp?: () => Promise<Dsp>;
}

/** Options for {@link jobLoader}. Share one object between loaders to share one hub. */
export interface JobLoaderOptions {
  /** Where weights are kept; default `openWeightStore()`. */
  store?: WeightStore | Promise<WeightStore>;
  /** This machine; default `probe()` from @hackbuild/ai-env. */
  env?: Env;
  /** Runtime modules in place of the pinned CDN imports (tests). */
  modules?: RuntimeModules;
  /** Kokoro's phonemizer is GPL-3.0-or-later; it is fetched only when this is true. */
  allowGplPhonemizer?: boolean;
  /** fetch for files a runtime does not fetch itself (static embedders). */
  fetch?: typeof fetch;
  /** Random numbers for the bellows voice; default a fixed seed. */
  rng?: () => number;
}

/** A detector as a page calls it: boxes in image pixels, best first. */
export type DetectFn = (image: unknown) => Promise<FrameBox[]>;
/** A depth model as a page calls it: 0 to 1 per pixel, larger is nearer (relative inverse depth). */
export type DepthFn = (image: unknown) => Promise<{ width: number; height: number; data: Float32Array }>;
/** A vision language model as a page calls it: a question about an image (a caption without one), answered in words. */
export type AskFn = (image: unknown, question?: string) => Promise<string>;
/** An image model with its CLIP tokenizer: `make` generates with the form's defaults filled in. */
export type ImageJob = ImageGenerator & { tokenize: ClipTokenize; make(o: FormOptions): ReturnType<ImageGenerator["generate"]> };

/**
 * What a jobLoader load resolves to, per job: chat a ChatEngine; transcribe a
 * Transcriber; detect a DetectFn; masks MaskModels; depth a DepthFn; vision an
 * AskFn; image an ImageJob; voice a loaded @hackbuild/speak Engine; embed an
 * Embedder. faceswap and landmarks resolve to the hub's loaded value as is.
 */
export interface JobValues {
  chat: ChatEngine;
  transcribe: Transcriber;
  detect: DetectFn;
  masks: MaskModels;
  depth: DepthFn;
  vision: AskFn;
  image: ImageJob;
  voice: Engine;
  embed: Embedder;
  faceswap: unknown;
  landmarks: unknown;
}

interface Runtime {
  hub: Hub;
  store: WeightStore;
  modules: RuntimeModules;
  dsp?: Promise<Dsp>;
  tokenizers: Map<string, Promise<ClipTokenize>>;
}

const DEFAULT = {};

/** Lines a factory throws that already say what to do; they reach the row as they are. */
const PLAIN = {
  kokoro: "kokoro's phonemizer is gpl. pass allowGplPhonemizer: true to load it, or pick another voice.",
  promptApi: "this browser has no built in model. use chrome with the prompt api on.",
};

/** Rejects as soon as the signal aborts, whether or not the work below it stops. */
function untilAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new DOMException("stopped", "AbortError"));
  return new Promise<T>((ok, bad) => {
    const stop = () => bad(new DOMException("stopped", "AbortError"));
    signal.addEventListener("abort", stop, { once: true });
    p.then(ok, bad).finally(() => signal.removeEventListener("abort", stop));
  });
}
const runtimes = new WeakMap<object, Promise<Runtime>>();

/** The licence of the record a weight url belongs to, for the store's licence line. */
function licenceFor(url: string): string | null {
  for (const r of ALL_RECORDS) {
    const id = r.source.modelId ?? r.source.repo;
    if ((id && url.includes(`/${id}/`)) || (r.source.url && url.startsWith(r.source.url))) return r.licence;
  }
  return null;
}

/** The pinned revision of the record a Hugging Face repo belongs to, so resolve/main requests share one stored file. */
function revisionFor(repo: string): string | undefined {
  return ALL_RECORDS.find((r) => (r.source.modelId ?? r.source.repo) === repo)?.source.revision;
}

async function makeRuntime(o: JobLoaderOptions): Promise<Runtime> {
  const [{ loadOrt, loadTransformers, ortProvider, runtimeLoader, tjsProvider }, { openWeightStore, transformersCache }] = await Promise.all([import("@hackbuild/devices"), import("@hackbuild/weights")]);
  const [env, store] = await Promise.all([o.env ?? probe(), o.store ?? openWeightStore()]);
  const hub = createHub({ registry: createRegistry(ALL_RECORDS), env });
  const m = o.modules ?? {};
  const rt: Runtime = { hub, store, modules: m, tokenizers: new Map() };
  const tjsModule = m.transformers ?? loadTransformers();
  const tjs = tjsProvider({ runtime: tjsModule, cache: transformersCache(store, { licenceFor, keyFor: (u) => pinnedUrl(u, revisionFor) }) });
  const [vision, chatTjs, embed] = await Promise.all([import("@hackbuild/vision"), import("@hackbuild/chat/transformers"), import("@hackbuild/embed")]);
  tjs.loader("depth", vision.depthLoader);
  tjs.loader("vision.caption", vision.vlmLoader);
  tjs.loader("vision.ask", vision.vlmLoader);
  tjs.loader("segment", vision.samLoader);
  tjs.loader("chat", async (ctx) => {
    const { createEngine } = await import("@hackbuild/chat");
    const generator = await ctx.tjs.pipeline!("text-generation", ctx.record.source.modelId ?? ctx.record.id, ctx.options);
    const driver = chatTjs.transformersDriver({ module: ctx.tjs as never, generator: generator as never, id: ctx.record.id });
    return createEngine(driver, ctx.record.quirks?.systemRole === false ? { quirks: { systemRole: false } } : {});
  });
  // the embed loaders: transformers.js feature extraction, and the static (potion) files through fetch
  embed.attachEmbed(hub, tjs, o.fetch ? { fetch: o.fetch } : {});
  hub.provide("tjs", tjs.factory);
  hub.provide("ort", ortProvider({ runtime: m.ort ?? loadOrt(), store }).factory);
  hub.provide("mediapipe", vision.mediapipeProvider({ runtime: (m.tasksVision ?? vision.loadTasksVision()) as never, store }));
  hub.provide("webllm", (ctx) => webllmFactory(ctx, m));
  hub.provide("wllama", (ctx) => wllamaFactory(ctx, rt));
  hub.provide("prompt-api", async () => {
    const p = await import("@hackbuild/chat/prompt-api");
    if (!p.getLanguageModel()) throw new Error(PLAIN.promptApi);
    return p.promptApi();
  });
  const voice = (make: (speak: typeof import("@hackbuild/speak")) => Engine) => async (ctx: FactoryContext) => {
    const e = make(await import("@hackbuild/speak"));
    await e.load({ ...(ctx.signal ? { signal: ctx.signal } : {}), onStatus: (s) => { if (s.progress !== undefined) ctx.report("fetch", s.progress) } });
    return e;
  };
  hub.provide("system", voice((s) => s.webSpeechEngine()));
  hub.provide("pocket-worker", voice((s) => s.pocketEngine({})));
  hub.provide("bellows-voice", voice((s) => s.bellowsEngine({ runtime: (m.bellows ?? runtimeLoader([...RUNTIME_URLS.bellows])) as never, rng: o.rng ?? seeded(1) })));
  hub.provide("kokoro-js", async (ctx: FactoryContext) => {
    if (!o.allowGplPhonemizer) throw new Error(PLAIN.kokoro);
    return voice((s) => s.kokoroEngine({ runtime: (m.kokoro ?? runtimeLoader([...RUNTIME_URLS.kokoro])) as never, allowGplPhonemizer: true }))(ctx);
  });
  return rt;
}

async function webllmFactory(ctx: FactoryContext, m: RuntimeModules): Promise<ChatEngine> {
  const w = await import("@hackbuild/chat/webllm");
  const mod = (await (m.webllm ?? (() => importEsm(RUNTIME_URLS.webllm)))()) as Parameters<typeof w.loadWebLLM>[0]["module"];
  const id = ctx.record.source.modelId ?? ctx.record.id;
  return w.loadWebLLM({
    module: mod,
    modelId: id,
    contextWindow: ctx.record.ctx ?? 4096,
    nativeTools: /hermes/i.test(id),
    onProgress: (p) => {
      const ph = w.webllmPhase(p);
      if (ph.phase !== "ready") ctx.report(ph.phase, ph.fraction, ph.file);
    },
  });
}

async function wllamaFactory(ctx: FactoryContext, rt: Runtime): Promise<ChatEngine> {
  const { repo, file } = ctx.record.source;
  if (!repo || !file) throw new Error(`${ctx.record.id} names no gguf repo and file.`);
  const w = await import("@hackbuild/chat/wllama");
  const url = hfResolve(repo, ctx.record.source.revision ?? "main") + file;
  const blob = await rt.store.get(
    { url, key: `gguf:${repo}/${file}`, licence: ctx.record.licence, ...(ctx.record.source.sha256 ? { sha256: ctx.record.source.sha256 } : {}) },
    { ...(ctx.signal ? { signal: ctx.signal } : {}), onProgress: (p) => ctx.report("fetch", p.fraction) },
  );
  ctx.report("compile", null);
  const urls = w.wllamaUrls();
  const module = (await (rt.modules.wllama ?? (() => importEsm(urls.esm)))()) as Parameters<typeof w.loadWllama>[0]["module"];
  return w.loadWllama({ module, wasmUrl: urls.wasm, blobs: [blob], id: ctx.record.id, ...(ctx.record.ctx ? { nCtx: ctx.record.ctx } : {}) });
}

/** A small seeded random source (mulberry32), so no Math.random runs in library code. */
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Pixels ({ width, height, data }) as a canvas, which every runtime reads; anything else passes through. */
export function asImage(img: unknown): unknown {
  const p = img as { width?: number; height?: number; data?: ArrayLike<number>; getContext?: unknown };
  if (!p || typeof p !== "object" || p.getContext || !p.data || !p.width || !p.height || typeof document === "undefined") return img;
  const c = document.createElement("canvas");
  c.width = p.width;
  c.height = p.height;
  c.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(p.data), p.width, p.height), 0, 0);
  return c;
}

/** A file as 16 kHz samples per channel (at most two), decoded by the browser. */
async function pcm16k(file: Blob): Promise<Float32Array[]> {
  const bytes = await file.arrayBuffer();
  const probeCtx = new OfflineAudioContext(1, 1, 16000);
  const buf = await probeCtx.decodeAudioData(bytes);
  const ch = Math.min(2, buf.numberOfChannels);
  const off = new OfflineAudioContext(ch, Math.max(1, Math.ceil(buf.duration * 16000)), 16000);
  const src = off.createBufferSource();
  src.buffer = buf;
  src.connect(off.destination);
  src.start();
  const out = await off.startRendering();
  return Array.from({ length: ch }, (_, i) => out.getChannelData(i));
}

/** A level rail folded to at most `bins` bins: loudest frame and whether the gate kept most of it. */
function railOf(rail: { db: ArrayLike<number>; open: ArrayLike<number> }, bins = 400): { db: number[]; kept: number[] } {
  const n = Math.max(1, Math.min(bins, rail.db.length));
  const db = new Array<number>(n).fill(-90);
  const kept = new Array<number>(n).fill(0);
  const count = new Array<number>(n).fill(0);
  for (let i = 0; i < rail.db.length; i++) {
    const b = Math.min(n - 1, Math.floor((i * n) / rail.db.length));
    db[b] = Math.max(db[b]!, rail.db[i]!);
    kept[b]! += rail.open[i]!;
    count[b]!++;
  }
  return { db: db.map((x) => Math.round(x * 10) / 10), kept: kept.map((k, b) => (count[b] && k / count[b]! >= 0.5 ? 1 : 0)) };
}

async function dspOf(rt: Runtime): Promise<Dsp> {
  rt.dsp ??= rt.modules.dsp
    ? rt.modules.dsp()
    : Promise.all([import("@hackbuild/audio-dsp"), import("@hackbuild/audio-dsp/inline")]).then(([a, i]) => a.loadDsp({ base64: i.AUDIO_DSP_WASM_BASE64 }));
  return rt.dsp;
}

async function clipTokenizer(rt: Runtime, id: string): Promise<ClipTokenize> {
  let p = rt.tokenizers.get(id);
  if (!p) {
    p = (async () => {
      const load = rt.modules.transformers ?? (await import("@hackbuild/devices")).loadTransformers();
      const tjs = (await load()) as unknown as { AutoTokenizer: { from_pretrained(id: string): Promise<(t: string, o: object) => Promise<{ input_ids: { data: ArrayLike<number | bigint> } }>> } };
      const tok = await tjs.AutoTokenizer.from_pretrained(id);
      return async (text: string) => Int32Array.from((await tok(text, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data, (v) => Number(v));
    })();
    p.catch(() => rt.tokenizers.delete(id));
    rt.tokenizers.set(id, p);
  }
  return p;
}

/** Points on a 4 by 3 grid, for segment everything with a point prompted model. */
const GRID = [0.2, 0.4, 0.6, 0.8].flatMap((x) => [0.25, 0.5, 0.75].map((y) => ({ x, y })));

async function adapt(job: Job, rec: ModelRecord, value: unknown, rt: Runtime, ctx: LoadContext): Promise<unknown> {
  const hub = rt.hub;
  const vision = () => import("@hackbuild/vision");
  switch (job) {
    case "transcribe": {
      const t = await import("@hackbuild/transcribe");
      const run: Transcriber = async (file, c): Promise<RunResult> => {
        const [dsp, chans] = await Promise.all([dspOf(rt), pcm16k(file)]);
        const { channel, ...run } = c.options ?? {};
        const lang = run.language ?? ctx.options.language;
        const out = await t.transcribe(hub, dsp, t.toMono(chans, channel ?? "auto"), {
          ...run,
          model: rec.id,
          signal: c.signal,
          ...(lang ? { language: lang } : {}),
          onProgress: (p) => c.onProgress(p.total ? p.done / p.total : 0),
        });
        return { segments: out.segments, dropped: out.dropped, duration: out.stats.dur, language: out.language, model: rec.label ?? rec.id, stats: out.stats, rail: railOf(out.rail) };
      };
      return run;
    }
    case "detect": {
      const v = await vision();
      const fn: DetectFn = async (image) =>
        (await v.detect(hub, asImage(image), { model: rec.id })).map((d) => ({ label: d.label, score: d.score, x: d.box.x, y: d.box.y, w: d.box.w, h: d.box.h }));
      return fn;
    }
    case "depth": {
      const v = await vision();
      const fn: DepthFn = (image) => v.depth(hub, asImage(image), { model: rec.id });
      return fn;
    }
    case "vision": {
      const v = await vision();
      const fn: AskFn = (image, question) => (question ? v.ask(hub, asImage(image), question, { model: rec.id }) : v.caption(hub, asImage(image), { model: rec.id }));
      return fn;
    }
    case "masks": {
      const v = await vision();
      let key = 0;
      const keys = new WeakMap<object, string>();
      const keyOf = (img: object) => keys.get(img) ?? (keys.set(img, `img-${++key}`), `img-${key}`);
      const first = async (image: { width: number; height: number }, x: number, y: number) =>
        (await v.segment(hub, asImage(image), { points: [{ x, y, label: 1 }] }, { model: rec.id, key: keyOf(image) }))[0];
      if (rec.provides?.includes("segment.everything")) {
        // FastSAM: one pass finds every object; a press picks the one under it from that pass
        let last: { img: object; key: string; list: Awaited<ReturnType<typeof v.segmentEverything>> } | null = null;
        const all = async (image: { width: number; height: number }, o: MaskEverythingOptions = {}) => {
          const key = JSON.stringify(o);
          if (last?.img !== image || last.key !== key) last = { img: image, key, list: await v.segmentEverything(hub, asImage(image), { ...o, model: rec.id }) };
          return last.list;
        };
        const fast: MaskModels = {
          segment: async (image, p) => v.instanceAt(await all(image), p.x, p.y)?.mask.data ?? null,
          everything: async (image, o) => (await all(image, o)).map((i, k) => ({ mask: i.mask.data, label: i.label ?? `object ${k + 1}`, score: i.score, box: i.box })),
        };
        return fast;
      }
      const models: MaskModels = {
        segment: async (image, p) => (await first(image, p.x, p.y))?.data ?? null,
        everything: async (image) => {
          const out: FoundMask[] = [];
          for (const g of GRID) {
            const m = await first(image, g.x * image.width, g.y * image.height);
            if (!m || out.some((o) => overlap(o.mask, m.data) > 0.6)) continue;
            out.push({ mask: m.data, label: `object ${out.length + 1}`, score: m.score ?? 0 });
          }
          return out;
        },
      };
      return models;
    }
    case "image": {
      const g = await import("@hackbuild/imagegen");
      const gen = await g.loadImagegen(hub, { id: rec.id }, { ...(ctx.signal ? { signal: ctx.signal } : {}) });
      const tokenize = await clipTokenizer(rt, gen.form.tokenizer);
      const job: ImageJob = Object.assign(gen, { tokenize, make: (o: FormOptions) => gen.generate(tokenize, o) });
      return job;
    }
    default:
      return value;
  }
}

/** Shared area over the smaller area of two 0 or 255 masks of one size. */
function overlap(a: Uint8Array, b: Uint8Array): number {
  let both = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i]! > 127;
    const y = b[i]! > 127;
    if (x) na++;
    if (y) nb++;
    if (x && y) both++;
  }
  return both / Math.max(1, Math.min(na, nb));
}

/** Records jobLoader cannot run yet, with the words a row shows. */
const NOT_YET: Record<string, string> = {
  "fastsam-s": "fastsam needs its own decoder, which this loader does not have yet. pick slimsam.",
};

/**
 * A real Loader for a job. The runtime and weights load only when a pick
 * calls it; progress goes to `ctx.onProgress`, `ctx.signal` stops it, and a
 * failure throws in plain words. Resolves to {@link JobValues}[job].
 */
export function jobLoader<J extends Job>(job: J, o: JobLoaderOptions = {}): Loader {
  const key = Object.keys(o).length ? o : DEFAULT;
  return async (rec, ctx) => {
    if (NOT_YET[rec.id]) throw new Error(NOT_YET[rec.id]);
    let rt = runtimes.get(key);
    if (!rt) {
      rt = makeRuntime(o);
      runtimes.set(key, rt);
      rt.catch(() => runtimes.delete(key));
    }
    const r = await rt;
    if (!r.hub.registry.get(rec.id)) r.hub.registry.add(rec);
    const off = r.hub.onLoad((e) => {
      if (e.id === rec.id && (e.phase === "fetch" || e.phase === "compile" || e.phase === "warm")) ctx.onProgress(e.fraction);
    });
    try {
      // an image model loads through loadImagegen, which takes its own lease
      const run = async () => adapt(job, rec, job === "image" ? null : (await r.hub.use({ id: rec.id }, { signal: ctx.signal })).value, r, ctx);
      return await untilAbort(run(), ctx.signal);
    } catch (e) {
      if (ctx.signal.aborted) throw e;
      const failures = (e as { failures?: { error: string }[]; cause?: { failures?: { error: string }[] } })?.failures ?? (e as { cause?: { failures?: { error: string }[] } })?.cause?.failures ?? [];
      const said = [String((e as Error)?.message ?? e), ...failures.map((f) => f.error)].join(" ");
      const plain = Object.values(PLAIN).find((l) => said.includes(l));
      throw new Error(plain ?? (await import("@hackbuild/devices")).humanError("model", e));
    } finally {
      off();
    }
  };
}

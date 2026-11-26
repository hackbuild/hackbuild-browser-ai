/**
 * One transformers.js provider for the models hub. Every capability
 * package registers a loader for its capability on the same provider, so
 * `hub.provide("tjs", tjs.factory)` is called once per page and the
 * runtime is configured once: no local models, the browser cache on, wasm
 * threads from the probe, the proxy worker off (it cannot start on
 * file://), the wasm cache off.
 */

import type { Env } from "@hackbuild/ai-env";
import type { Factory, FactoryContext, ModelRecord, Rung } from "@hackbuild/models";
import { progressMerger, type FileProgressEvent, type MergedProgress } from "./progress.js";
import { wasmThreads } from "./ladders.js";

/** The parts of transformers.js `env` the provider sets: local and remote models, caches and the onnx wasm backend. */
export interface TjsEnv {
  allowLocalModels?: boolean;
  allowRemoteModels?: boolean;
  useBrowserCache?: boolean;
  useWasmCache?: boolean;
  useCustomCache?: boolean;
  customCache?: unknown;
  backends?: { onnx?: { wasm?: { numThreads?: number; proxy?: boolean } } };
}

/** The parts of the transformers.js module the provider touches. Tests pass a fake. */
export interface TjsModule {
  pipeline?: (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;
  env?: TjsEnv;
  [name: string]: unknown;
}

/** What a custom {@link TjsLoader} receives: the hub's factory context, the transformers.js module and the pipeline options for the rung. */
export interface TjsLoadContext extends FactoryContext {
  tjs: TjsModule;
  /** Pipeline options for this rung: device, dtype, progress_callback. */
  options: Record<string, unknown>;
}

/** A custom loader for one capability on the transformers.js provider; it returns the loaded model. */
export type TjsLoader<T = unknown> = (ctx: TjsLoadContext) => Promise<T>;

/** transformers.js pipeline task per capability, for the default loader. */
export const TJS_TASKS: Record<string, string> = {
  depth: "depth-estimation",
  transcribe: "automatic-speech-recognition",
  detect: "object-detection",
  "vision.caption": "image-to-text",
  embed: "feature-extraction",
  segment: "image-segmentation",
};

/** Options for {@link tjsProvider}: the runtime loader, a custom cache from @hackbuild/weights, and a progress callback. */
export interface TjsProviderOptions {
  runtime: () => Promise<TjsModule>;
  /** A `transformersCache(store, ...)` from @hackbuild/weights, set as env.customCache. */
  cache?: unknown;
  onProgress?: (recordId: string, p: MergedProgress) => void;
}

/** The transformers.js provider: the hub factory, `loader` to register a capability's loader, and `configure`. */
export interface TjsProvider {
  factory: Factory;
  /** Register the loader for a capability. The first capability of a record with a loader wins. */
  loader<T>(capability: string, fn: TjsLoader<T>): void;
  configure(tjs: TjsModule, env: Env | undefined): void;
}

/** Configure transformers.js once: no local models, the browser or a custom cache, the wasm cache off, wasm threads from the probe and the proxy worker off. */
export function configureTjs(tjs: TjsModule, env: Env | undefined, cache?: unknown): void {
  const e = tjs.env;
  if (!e) return;
  e.allowLocalModels = false;
  if ("useWasmCache" in e) e.useWasmCache = false;
  if (cache) {
    e.useCustomCache = true;
    e.customCache = cache;
    e.useBrowserCache = false;
  } else e.useBrowserCache = env?.protocol !== "file";
  const w = e.backends?.onnx?.wasm;
  if (w) {
    w.numThreads = wasmThreads(env);
    w.proxy = false;
  }
}

/** Pipeline options for a rung. Runtime options other than `task` and `loader` pass through. */
export function pipelineOptions(rung: Rung, progress?: (ev: FileProgressEvent) => void): Record<string, unknown> {
  const o: Record<string, unknown> = { device: rung.device === "webgpu" ? "webgpu" : "wasm" };
  if (rung.dtype !== undefined) o.dtype = rung.dtype;
  if (progress) o.progress_callback = progress;
  for (const [k, v] of Object.entries(rung.options ?? {})) if (k !== "task" && k !== "loader") o[k] = v;
  return o;
}

function modelIdOf(rec: ModelRecord): string {
  const id = rec.source.modelId ?? rec.source.repo;
  if (!id) throw new Error(`${rec.id}: a transformers.js record needs source.modelId`);
  return id;
}

/** The transformers.js provider for the models hub: configures the runtime once and loads each record through a registered loader or `pipeline`. */
export function tjsProvider(opts: TjsProviderOptions): TjsProvider {
  const loaders = new Map<string, TjsLoader>();
  let configured: TjsModule | null = null;
  const p: TjsProvider = {
    configure(tjs, env) {
      configureTjs(tjs, env, opts.cache);
      configured = tjs;
    },
    loader(capability, fn) {
      loaders.set(capability, fn as TjsLoader);
    },
    factory: async (ctx) => {
      const tjs = await opts.runtime();
      if (configured !== tjs) p.configure(tjs, ctx.env);
      // merged file progress goes to hub.onLoad listeners and to the provider's own callback
      let file: string | undefined;
      const merge = progressMerger((m) => {
        ctx.report?.("fetch", m.fraction, file);
        opts.onProgress?.(ctx.record.id, m);
      });
      const progress = (ev: FileProgressEvent) => {
        file = ev.file ?? ev.name ?? file;
        merge(ev);
      };
      const options = pipelineOptions(ctx.rung, progress);
      // the pinned commit, so transformers.js fetches resolve/<commit>/ and not main
      if (ctx.record.source.revision && options.revision === undefined) options.revision = ctx.record.source.revision;
      const named = ctx.rung.options?.loader;
      const cap = typeof named === "string" ? named : ctx.record.provides.find((c) => loaders.has(c));
      const custom = cap ? loaders.get(cap) : undefined;
      if (custom) return custom({ ...ctx, tjs, options });
      const task = (ctx.rung.options?.task as string | undefined) ?? TJS_TASKS[ctx.record.provides[0]!];
      if (!task) throw new Error(`${ctx.record.id}: no transformers.js task for ${ctx.record.provides[0]}; register a loader`);
      if (!tjs.pipeline) throw new Error("the transformers.js module has no pipeline export");
      return tjs.pipeline(task, modelIdOf(ctx.record), options);
    },
  };
  return p;
}

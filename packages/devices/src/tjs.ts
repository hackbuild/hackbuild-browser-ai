/**
 * One transformers.js provider for the models hub. Every capability
 * package registers a loader for its capability on the same provider, so
 * `hub.provide("tjs", tjs.factory)` is called once per page and the
 * runtime is configured once: no local models, the browser cache on, wasm
 * threads from the probe, the proxy worker off (it cannot start on
 * file://, SCRIBE), the wasm cache off (BAIL).
 */

import type { Env } from "@hackbuild/ai-env";
import type { Factory, FactoryContext, ModelRecord, Rung } from "@hackbuild/models";
import { progressMerger, type FileProgressEvent, type MergedProgress } from "./progress.js";
import { wasmThreads } from "./ladders.js";

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

export interface TjsLoadContext extends FactoryContext {
  tjs: TjsModule;
  /** Pipeline options for this rung: device, dtype, progress_callback. */
  options: Record<string, unknown>;
}

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

export interface TjsProviderOptions {
  runtime: () => Promise<TjsModule>;
  /** A `transformersCache(store, ...)` from @hackbuild/weights, set as env.customCache. */
  cache?: unknown;
  onProgress?: (recordId: string, p: MergedProgress) => void;
}

export interface TjsProvider {
  factory: Factory;
  /** Register the loader for a capability. The first capability of a record with a loader wins. */
  loader<T>(capability: string, fn: TjsLoader<T>): void;
  configure(tjs: TjsModule, env: Env | undefined): void;
}

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
      const progress = opts.onProgress ? progressMerger((m) => opts.onProgress!(ctx.record.id, m)) : undefined;
      const options = pipelineOptions(ctx.rung, progress);
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

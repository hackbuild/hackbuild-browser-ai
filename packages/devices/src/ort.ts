/**
 * One onnxruntime-web provider for the models hub. The graph bytes are
 * fetched once through the weight store (`store.once`) and every rung of
 * the ladder builds a session from the same bytes (as earlier builds did), since
 * onnxruntime aborts on a webgpu partition failure instead of falling back
 * on its own. Records list their graphs in `source.files`; files that are
 * not `.onnx` are passed as external data.
 */

import type { Env } from "@hackbuild/ai-env";
import type { Factory, ModelRecord, Rung } from "@hackbuild/models";
import { classifyError, pinnedSha } from "@hackbuild/models";
import { hfResolve, type WeightRef, type WeightStore } from "@hackbuild/weights";
import { wasmThreads } from "./ladders.js";

export interface OrtTensorLike {
  readonly data: ArrayLike<number> | ArrayLike<bigint>;
  readonly dims: readonly number[];
  readonly type?: string;
  dispose?(): void;
}

export interface OrtSession {
  readonly inputNames: readonly string[];
  readonly outputNames: readonly string[];
  run(feeds: Record<string, unknown>, opts?: Record<string, unknown>): Promise<Record<string, OrtTensorLike>>;
  release?(): Promise<void>;
}

/** The parts of the onnxruntime-web module the provider touches. Tests pass a fake. */
export interface OrtModule {
  InferenceSession: { create(model: Uint8Array, opts?: Record<string, unknown>): Promise<OrtSession> };
  Tensor: new (type: string, data: ArrayLike<number> | Float32Array | Int32Array | BigInt64Array | Uint8Array, dims: readonly number[]) => OrtTensorLike;
  env?: { wasm?: { numThreads?: number; proxy?: boolean; wasmPaths?: unknown; simd?: boolean } };
}

export interface OrtModel {
  readonly ort: OrtModule;
  /** Sessions by graph name (file name without `.onnx`). */
  readonly sessions: Record<string, OrtSession>;
  /** The first graph's session. */
  readonly session: OrtSession;
  readonly rung: Rung;
  dispose(): Promise<void>;
}

export interface OrtProviderOptions {
  runtime: () => Promise<OrtModule>;
  store: WeightStore;
  wasmPaths?: string;
  onProgress?: (recordId: string, file: string, fraction: number | null) => void;
}

export interface GraphFile {
  name: string;
  path: string;
  ref: WeightRef;
  external: boolean;
}

/** The files of an ort record with their weight references. */
export function graphFiles(rec: ModelRecord): GraphFile[] {
  const s = rec.source;
  const base = s.url && !s.url.endsWith(".onnx") ? (s.url.endsWith("/") ? s.url : s.url + "/") : s.repo ? hfResolve(s.repo, s.revision) : "";
  const list = s.files?.length ? s.files : s.file ? [{ path: s.file, ...(s.sha256 ? { sha256: s.sha256 } : {}) }] : [];
  if (!list.length && s.url?.endsWith(".onnx")) {
    const path = s.url.split("/").pop()!;
    const ref: WeightRef = { url: s.url, licence: rec.licence };
    const sha = s.sha256 ?? pinnedSha(s.url);
    if (sha) ref.sha256 = sha;
    return [{ name: path.replace(/\.onnx$/, ""), path, ref, external: false }];
  }
  if (!list.length) throw new Error(`${rec.id}: an ort record needs source.url, source.file or source.files`);
  return list.map((f) => {
    const ref: WeightRef = { url: /^https?:|^blob:|^data:/.test(f.path) ? f.path : base + f.path, licence: rec.licence };
    const sha = f.sha256 ?? pinnedSha(ref.url);
    if (sha) ref.sha256 = sha;
    const file = f.path.split("/").pop()!;
    return { name: file.replace(/\.onnx$/, ""), path: file, ref, external: !file.endsWith(".onnx") };
  });
}

export function configureOrt(ort: OrtModule, env: Env | undefined, wasmPaths?: string): void {
  const w = ort.env?.wasm;
  if (!w) return;
  w.numThreads = wasmThreads(env);
  w.proxy = false;
  if (wasmPaths) w.wasmPaths = wasmPaths;
}

/** Session options for a rung: the rung's ort block plus any runtime options. */
export function sessionOptions(rung: Rung, external: { path: string; data: Uint8Array }[]): Record<string, unknown> {
  const o: Record<string, unknown> = {
    executionProviders: rung.ort?.executionProviders ?? (rung.device === "webgpu" ? ["webgpu", "wasm"] : ["wasm"]),
  };
  if (rung.ort?.graphOptimizationLevel) o.graphOptimizationLevel = rung.ort.graphOptimizationLevel;
  if (external.length) o.externalData = external;
  return { ...o, ...(rung.options ?? {}) };
}

export interface OrtProvider {
  factory: Factory<OrtModel>;
  /** Release bytes held for a record whose every rung failed. */
  forget(rec: ModelRecord): void;
}

export function ortProvider(opts: OrtProviderOptions): OrtProvider {
  const configured = new WeakSet<object>();
  const release = (files: GraphFile[]) => {
    for (const f of files) opts.store.release(f.ref.key ?? f.ref.url);
  };
  return {
    forget(rec) {
      release(graphFiles(rec));
    },
    factory: async ({ record, rung, env, signal, last }) => {
      const ort = await opts.runtime();
      if (!configured.has(ort)) {
        configureOrt(ort, env, opts.wasmPaths);
        configured.add(ort);
      }
      const files = graphFiles(record);
      const sessions: Record<string, OrtSession> = {};
      try {
        const bytes = await Promise.all(
          files.map((f) =>
            opts.store.once(f.ref, {
              ...(signal ? { signal } : {}),
              ...(opts.onProgress ? { onProgress: (p: { fraction: number | null }) => opts.onProgress!(record.id, f.path, p.fraction) } : {}),
            }),
          ),
        );
        const external = files.flatMap((f, i) => (f.external ? [{ path: f.path, data: bytes[i]! }] : []));
        for (let i = 0; i < files.length; i++) {
          const f = files[i]!;
          if (f.external) continue;
          sessions[f.name] = await ort.InferenceSession.create(bytes[i]!, sessionOptions(rung, external));
        }
        release(files);
        const first = Object.values(sessions)[0];
        if (!first) throw new Error(`${record.id}: no .onnx graph among the files`);
        return {
          ort,
          sessions,
          session: first,
          rung,
          async dispose() {
            for (const s of Object.values(sessions)) await s.release?.();
          },
        };
      } catch (e) {
        // sessions built before a later graph failed would otherwise leak
        for (const s of Object.values(sessions)) await Promise.resolve(s.release?.()).catch(() => undefined);
        const k = classifyError(e);
        if (k === "network" || k === "abort" || last) release(files);
        throw e;
      }
    },
  };
}

/** Float32 tensor helper over the injected module. */
export function f32(ort: OrtModule, data: Float32Array, dims: readonly number[]): OrtTensorLike {
  return new ort.Tensor("float32", data, dims);
}

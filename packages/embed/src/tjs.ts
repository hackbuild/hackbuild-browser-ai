/**
 * A transformers.js feature extraction adapter: MiniLM
 * (Xenova/all-MiniLM-L6-v2, weights Apache-2.0) by default, or any
 * sentence model the pipeline reads, such as bge-small
 * (Xenova/bge-small-en-v1.5, weights MIT). Mean pooling and L2
 * normalization run inside the pipeline. The id names the model,
 * revision, dtype, device, pooling and normalization, since each changes
 * the vectors.
 */

import type { Embedder } from "@hackbuild/memory";

/** What a transformers.js feature-extraction pipeline returns. */
export interface FeatureTensor {
  data: ArrayLike<number>;
  dims: number[];
}
/** A transformers.js feature extraction pipeline called with pooling and normalization. */
export type FeaturePipeline = (texts: string[], opts: { pooling: "mean" | "cls" | "none"; normalize: boolean }) => Promise<FeatureTensor>;

/** Settings for `tjsEmbedder`; each one that changes the vectors goes into the id. */
export interface TjsEmbedderOptions {
  modelId: string;
  dtype?: string;
  device?: string;
  revision?: string;
  pooling?: "mean" | "cls";
  normalize?: boolean;
  /** Texts per pipeline call. Default 16. */
  batch?: number;
  /** Vector size. Probed with one call when left out. */
  dim?: number;
}

/** Wrap a feature extraction pipeline as an Embedder that runs texts in batches. */
export async function tjsEmbedder(pipe: FeaturePipeline, o: TjsEmbedderOptions): Promise<Embedder> {
  const pooling = o.pooling ?? "mean";
  const normalize = o.normalize ?? true;
  const batch = Math.max(1, o.batch ?? 16);
  const run = async (texts: string[]): Promise<Float32Array[]> => {
    const t = await pipe(texts, { pooling, normalize });
    const d = t.dims[t.dims.length - 1]!;
    const out: Float32Array[] = [];
    for (let i = 0; i < texts.length; i++) out.push(Float32Array.from(Array.prototype.slice.call(t.data, i * d, (i + 1) * d) as number[]));
    return out;
  };
  const dim = o.dim ?? (await run(["dimension probe"]))[0]!.length;
  const id = ["tjs", o.modelId, o.revision ?? "main", o.dtype ?? "default", o.device ?? "auto", pooling, normalize ? "n" : "u", dim].join(":");
  return {
    id,
    dim,
    async embed(texts) {
      const out: Float32Array[] = [];
      for (let i = 0; i < texts.length; i += batch) out.push(...(await run(texts.slice(i, i + batch))));
      return out;
    },
  };
}

/** The pieces of transformers.js this adapter calls. */
export interface TjsLike {
  pipeline?: (task: string, model: string, opts: Record<string, unknown>) => Promise<unknown>;
}

/**
 * MiniLM through a transformers.js module the caller loaded (for example
 * `await loadTransformers()()` from @hackbuild/devices). Defaults: wasm and
 * q8, the earlier chat build setting; pass device "webgpu" and dtype "fp32" to move it.
 */
export async function miniLM(tjs: TjsLike, o: Partial<TjsEmbedderOptions> = {}): Promise<Embedder> {
  if (!tjs.pipeline) throw new Error("the transformers.js module has no pipeline export");
  const modelId = o.modelId ?? "Xenova/all-MiniLM-L6-v2";
  const dtype = o.dtype ?? "q8";
  const device = o.device ?? "wasm";
  const opts: Record<string, unknown> = { dtype, device };
  if (o.revision) opts.revision = o.revision;
  const pipe = (await tjs.pipeline("feature-extraction", modelId, opts)) as FeaturePipeline;
  return tjsEmbedder(pipe, { ...o, modelId, dtype, device, dim: o.dim ?? 384 });
}

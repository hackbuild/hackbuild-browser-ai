/**
 * Embedder records for the models hub. Sizes are inferred from the model
 * repos' file lists; licences are the model cards' as of 2026-11-22.
 */

import { tjsLadder, type TjsProvider } from "@hackbuild/devices";
import type { Factory, Hub, ModelRecord } from "@hackbuild/models";
import type { Embedder } from "@hackbuild/memory";
import { loadStaticEmbedder } from "./static.js";
import { tjsEmbedder, type FeaturePipeline } from "./tjs.js";

export const EMBED_RECORDS: ModelRecord[] = [
  {
    id: "potion-base-8m",
    label: "potion base 8M (static)",
    provides: ["embed"],
    provider: "static",
    source: { repo: "minishlab/potion-base-8M", url: "https://huggingface.co/minishlab/potion-base-8M/resolve/main/" },
    sizeMB: 30,
    sizeSource: "inferred",
    ladder: [{ device: "cpu" }],
    licence: "MIT",
    commercial: true,
    place: "main",
    notes: ["256 dims, no runtime, about 0.08 ms per sentence in the source build (measured there, not here)", "misses paraphrase"],
  },
  {
    id: "minilm-l6",
    label: "all-MiniLM-L6-v2",
    provides: ["embed"],
    provider: "tjs",
    source: { modelId: "Xenova/all-MiniLM-L6-v2" },
    sizeMB: 23,
    sizeSource: "inferred",
    ladder: tjsLadder({ wasm: ["q8", "fp32"], webgpu: ["fp32"], wasmFirst: true }),
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["384 dims; webgpu with q8 garbled other models in the source builds, so q8 stays on wasm"],
  },
  {
    id: "bge-small-en",
    label: "bge-small-en-v1.5",
    provides: ["embed"],
    provider: "tjs",
    source: { modelId: "Xenova/bge-small-en-v1.5" },
    sizeMB: 34,
    sizeSource: "inferred",
    ladder: tjsLadder({ wasm: ["q8", "fp32"], webgpu: ["fp32"], wasmFirst: true }),
    licence: "MIT",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["384 dims, english, cls pooling per the model card"],
  },
];

/** A hub factory for static records: fetches tokenizer.json, model.safetensors and config.json from `source.url`. */
export function staticFactory(o: { fetch?: typeof fetch } = {}): Factory<Embedder> {
  return async (ctx) => {
    const base = ctx.record.source.url;
    if (!base) throw new Error(`${ctx.record.id}: a static record needs source.url`);
    return loadStaticEmbedder(base, { name: ctx.record.id, ...(o.fetch ? { fetch: o.fetch } : {}) });
  };
}

/**
 * Add the embed records to a hub, register the transformers.js loader for
 * "embed" (an Embedder, with the rung's dtype and device in its id) and the
 * static factory.
 */
export function attachEmbed(hub: Hub, tjs?: TjsProvider, o: { fetch?: typeof fetch } = {}): void {
  hub.registry.add(...EMBED_RECORDS);
  hub.provide("static", staticFactory(o));
  tjs?.loader<Embedder>("embed", async (ctx) => {
    if (!ctx.tjs.pipeline) throw new Error("the transformers.js module has no pipeline export");
    const modelId = ctx.record.source.modelId ?? ctx.record.source.repo!;
    const pipe = (await ctx.tjs.pipeline("feature-extraction", modelId, ctx.options)) as FeaturePipeline;
    const dtype = typeof ctx.rung.dtype === "string" ? ctx.rung.dtype : JSON.stringify(ctx.rung.dtype ?? "default");
    const cls = ctx.record.notes?.some((n) => /cls pooling/.test(n));
    return tjsEmbedder(pipe, { modelId, dtype, device: ctx.rung.device, pooling: cls ? "cls" : "mean", dim: 384 });
  });
}

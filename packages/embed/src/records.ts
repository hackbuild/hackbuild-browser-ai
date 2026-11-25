/**
 * Embedder records for the models hub. Sizes are inferred from the model
 * repos' file lists; licences are the model cards' as of 2026-11-22.
 */

import { tjsLadder, type TjsProvider } from "@hackbuild/devices";
import { pinnedBase, pinnedSha, type Factory, type Hub, type ModelRecord } from "@hackbuild/models";
import type { Embedder } from "@hackbuild/memory";
import { loadStaticEmbedder } from "./static.js";
import { tjsEmbedder, type FeaturePipeline } from "./tjs.js";

export const EMBED_RECORDS: ModelRecord[] = [
  {
    id: "potion-base-8m",
    label: "potion base 8M (static)",
    speed: "instant",
    verdict: "instant, misses paraphrase",
    group: "tiny",
    provides: ["embed"],
    provider: "static",
    source: { repo: "minishlab/potion-base-8M", url: pinnedBase("minishlab/potion-base-8M") },
    sizeMB: 30,
    sizeSource: "inferred",
    ladder: [{ device: "cpu" }],
    licence: "MIT",
    commercial: true,
    place: "main",
    notes: ["256 dims, no runtime, about 0.08 ms per sentence in an earlier build (measured there, not here)", "misses paraphrase"],
  },
  {
    id: "minilm-l6",
    label: "all-MiniLM-L6-v2",
    speed: "fast",
    verdict: "small, english",
    group: "start here",
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
    notes: ["384 dims; webgpu with q8 garbled other models in earlier builds, so q8 stays on wasm"],
  },
  {
    id: "bge-small-en",
    label: "bge-small-en-v1.5",
    speed: "fast",
    verdict: "sharper recall, english",
    group: "good",
    provides: ["embed"],
    provider: "tjs",
    source: { modelId: "Xenova/bge-small-en-v1.5" },
    // model_quantized.onnx 34.0 MB, model.onnx 133.1 MB in the hub listing (vendor, 2026-11-25); q8 loads first
    sizeMB: 32,
    sizeSource: "vendor",
    ladder: tjsLadder({ wasm: ["q8", "fp32"], webgpu: ["fp32"], wasmFirst: true }),
    licence: "MIT",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["384 dims, english, cls pooling per the model card"],
  },
];

/** A hub factory for static records: fetches tokenizer.json, model.safetensors and config.json from `source.url`. */
/** `sha256For` defaults to pinnedSha, so files at the pinned commit are checked. */
export function staticFactory(o: { fetch?: typeof fetch; sha256For?: (url: string) => string | undefined } = {}): Factory<Embedder> {
  return async (ctx) => {
    const base = ctx.record.source.url;
    if (!base) throw new Error(`${ctx.record.id}: a static record needs source.url`);
    return loadStaticEmbedder(base, { name: ctx.record.id, sha256For: o.sha256For ?? pinnedSha, ...(o.fetch ? { fetch: o.fetch } : {}) });
  };
}

/**
 * Add the embed records to a hub, register the transformers.js loader for
 * "embed" (an Embedder, with the rung's dtype and device in its id) and the
 * static factory.
 */
export function attachEmbed(hub: Hub, tjs?: TjsProvider, o: { fetch?: typeof fetch; sha256For?: (url: string) => string | undefined } = {}): void {
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

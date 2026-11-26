/**
 * transformers.js loaders for the vision capabilities, registered on the
 * shared devices provider with `tjs.loader(capability, fn)`. Each returns
 * the package's model shape.
 */

import type { TjsLoadContext, TjsModule } from "@hackbuild/devices";
import { promptSegmenter } from "./segment.js";
import type { DepthMap, DepthModel, ImageInput, Mask, Segmenter, Vlm } from "./types.js";

interface TensorLike {
  data: ArrayLike<number>;
  dims: number[];
  slice?(...a: unknown[]): TensorLike;
}

interface RawImageLike {
  width: number;
  height: number;
  channels?: number;
  data: ArrayLike<number>;
}

type Fn = (...a: unknown[]) => Promise<unknown>;
type Cls = { from_pretrained(id: string, o?: Record<string, unknown>): Promise<unknown> };

const cls = (tjs: TjsModule, ...names: string[]): Cls => {
  for (const n of names) if (tjs[n]) return tjs[n] as Cls;
  throw new Error(`the transformers.js module has none of ${names.join(", ")}`);
};

async function toRaw(tjs: TjsModule, img: ImageInput): Promise<unknown> {
  const R = tjs.RawImage as { read?: (x: unknown) => Promise<unknown> } | undefined;
  return R?.read ? R.read(img) : img;
}

/** Normalize a depth pipeline result. predicted_depth keeps the raw range (as earlier builds did); depth is the 8 bit image (as earlier builds did). */
export function depthFromOutput(out: { predicted_depth?: TensorLike; depth?: RawImageLike }): DepthMap {
  const pd = out.predicted_depth;
  if (pd && pd.data && pd.dims?.length >= 2) {
    const h = pd.dims[pd.dims.length - 2]!;
    const w = pd.dims[pd.dims.length - 1]!;
    let mn = Infinity;
    let mx = -Infinity;
    for (let i = 0; i < w * h; i++) {
      const v = pd.data[i]!;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const inv = mx > mn ? 1 / (mx - mn) : 0;
    const data = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) data[i] = (pd.data[i]! - mn) * inv;
    return { width: w, height: h, data, range: [mn, mx] };
  }
  const d = out.depth;
  if (!d) throw new Error("depth pipeline returned neither predicted_depth nor depth");
  const ch = d.channels ?? 1;
  const data = new Float32Array(d.width * d.height);
  for (let i = 0; i < data.length; i++) data[i] = d.data[i * ch]! / 255;
  return { width: d.width, height: d.height, data, range: [0, 255] };
}

/** The transformers.js loader for depth records: a depth-estimation pipeline wrapped as a {@link DepthModel}. */
export async function depthLoader(ctx: TjsLoadContext): Promise<DepthModel> {
  const pipe = (await ctx.tjs.pipeline!("depth-estimation", ctx.record.source.modelId!, ctx.options)) as Fn & { dispose?: () => unknown };
  return {
    estimate: async (image) => depthFromOutput((await pipe(image)) as Parameters<typeof depthFromOutput>[0]),
    dispose: () => pipe.dispose?.(),
  };
}

/** The transformers.js loader for caption and question records: the VLM's processor and model wrapped as a {@link Vlm}. */
export async function vlmLoader(ctx: TjsLoadContext): Promise<Vlm> {
  const id = ctx.record.source.modelId!;
  const processor = (await cls(ctx.tjs, "AutoProcessor").from_pretrained(id)) as Fn & {
    apply_chat_template(m: unknown, o: Record<string, unknown>): string;
    batch_decode(t: unknown, o: Record<string, unknown>): string[];
  };
  const model = (await cls(ctx.tjs, "AutoModelForImageTextToText", "AutoModelForVision2Seq").from_pretrained(id, ctx.options)) as {
    generate(o: Record<string, unknown>): Promise<TensorLike>;
    dispose?: () => unknown;
  };
  const rp = ctx.record.quirks?.repetitionPenalty;
  const cap = ctx.record.quirks?.maxTokensAction ?? 64;
  const imagesFirst = ctx.record.quirks?.processorImagesFirst === true;
  return {
    async ask(image, question, o = {}) {
      const text = processor.apply_chat_template(
        [{ role: "user", content: [{ type: "image" }, { type: "text", text: question ?? "Describe this image in one sentence." }] }],
        { add_generation_prompt: true },
      );
      const raw = [await toRaw(ctx.tjs, image)];
      const inputs = (await (imagesFirst ? processor(raw, text) : processor(text, raw))) as Record<string, unknown> & { input_ids: TensorLike };
      const ids = await model.generate({ ...inputs, max_new_tokens: o.maxTokens ?? cap, do_sample: false, ...(rp ? { repetition_penalty: rp } : {}) });
      const start = inputs.input_ids.dims[inputs.input_ids.dims.length - 1]!;
      const gen = ids.slice ? ids.slice(null, [start, null]) : ids;
      return (processor.batch_decode(gen, { skip_special_tokens: true })[0] ?? "").trim();
    },
    dispose: () => model.dispose?.(),
  };
}

/** SlimSAM: one embedding per image, kept in an `EmbeddingCache`, then point, negative point and box prompts. */
export async function samLoader(ctx: TjsLoadContext): Promise<Segmenter> {
  const id = ctx.record.source.modelId!;
  const processor = (await cls(ctx.tjs, "AutoProcessor").from_pretrained(id)) as Fn & {
    post_process_masks(m: unknown, a: unknown, b: unknown): Promise<TensorLike[]>;
  };
  const model = (await cls(ctx.tjs, "SamModel").from_pretrained(id, ctx.options)) as Fn & {
    get_image_embeddings(i: unknown): Promise<Record<string, unknown>>;
    dispose?: () => unknown;
  };
  type Emb = { raw: unknown; inputs: Record<string, unknown>; emb: Record<string, unknown> };
  return promptSegmenter<Emb>({
    async encode(image) {
      const raw = await toRaw(ctx.tjs, image);
      const inputs = (await processor(raw)) as Record<string, unknown>;
      return { raw, inputs, emb: await model.get_image_embeddings(inputs) };
    },
    async decode(e, prompt) {
      const pts = prompt.points?.length ? prompt.points : null;
      const b = prompt.box;
      const q: Record<string, unknown> = {};
      if (pts) {
        q.input_points = [[pts.map((p) => [p.x, p.y])]];
        q.input_labels = [[pts.map((p) => p.label ?? 1)]];
      }
      if (b) q.input_boxes = [[[b.x, b.y, b.x + b.w, b.y + b.h]]];
      const p = (await processor(e.raw, q)) as Record<string, unknown>;
      const feed: Record<string, unknown> = { ...e.emb };
      for (const k of ["input_points", "input_labels", "input_boxes"]) if (p[k] !== undefined) feed[k] = p[k];
      const out = (await model(feed)) as { pred_masks: unknown; iou_scores: TensorLike };
      const masks = await processor.post_process_masks(out.pred_masks, e.inputs.original_sizes, e.inputs.reshaped_input_sizes);
      const m = masks[0]!;
      const [n, h, w] = m.dims.slice(-3) as [number, number, number];
      const res: Mask[] = [];
      for (let k = 0; k < n; k++) {
        const data = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) data[i] = m.data[k * w * h + i] ? 255 : 0;
        res.push({ width: w, height: h, data, score: out.iou_scores.data[k] ?? 0 });
      }
      return res;
    },
    dispose: () => model.dispose?.(),
  });
}

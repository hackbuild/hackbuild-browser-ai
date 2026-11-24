/**
 * Image generation records. Licences are the model cards' as of
 * 2026-11-22; check them before shipping a product. Sizes inferred.
 *
 * Each record carries a `form`: what the generate form shows for it, so a
 * model select can reshape the form (steps range and default, guidance and
 * a negative prompt only where the model takes them, the sizes its graphs
 * accept) and the load button can name the size. The field set follows an
 * earlier image generation bench's model table.
 */

import type { ModelRecord } from "@hackbuild/models";
import type { Spacing } from "./schedule.js";

export interface ImageForm {
  steps: { min: number; max: number; default: number };
  /** Classifier free guidance; null when the model takes none and the field is hidden. */
  guidance: { min: number; max: number; default: number; step: number } | null;
  /** Show a negative prompt field. Only models run with guidance use one. */
  negative: boolean;
  /** Output sides in pixels the graphs accept, the default first. */
  sizes: number[];
  spacing: Spacing;
  /** One line under the select saying what the model is. */
  note: string;
  /** CLIP tokenizer the caller loads, transformers.js model id. */
  tokenizer: string;
  /** Session keys of the three graphs in the loaded ort model. */
  graphs: { textEncoder: string; unet: string; vaeDecoder: string };
}

export type ImagegenRecord = ModelRecord & { form: ImageForm };

const graphs = { textEncoder: "text_encoder", unet: "unet", vaeDecoder: "vae_decoder" };
const files = [{ path: "text_encoder/model.onnx" }, { path: "unet/model.onnx" }, { path: "vae_decoder/model.onnx" }];
// fixed free dimensions for a 512 pixel image at batch 1, as an earlier build set them; ort ignores names a graph lacks
const free512 = {
  freeDimensionOverrides: { batch_size: 1, num_channels: 4, height: 64, width: 64, sequence_length: 77, num_channels_latent: 4, height_latent: 64, width_latent: 64 },
};

export const IMAGEGEN_RECORDS: ImagegenRecord[] = [
  {
    id: "sd-turbo",
    label: "sd-turbo 512",
    provides: ["imagegen"],
    provider: "ort",
    source: { repo: "schmuell/sd-turbo-ort-web", files },
    sizeMB: 2600,
    sizeSource: "inferred",
    ladder: [{ device: "webgpu", ort: { executionProviders: ["webgpu"] }, options: free512 }],
    licence: "Stability AI Non-Commercial Research Community License (the LICENSE in schmuell/sd-turbo-ort-web; upstream stabilityai/sd-turbo moved to the Community License in July 2024, this export did not)",
    commercial: false,
    place: "gpu",
    runtime: "onnxruntime-web@1.27.0",
    notes: [
      "webgpu only in an earlier build, no wasm floor",
      "tokenizer: Xenova/clip-vit-base-patch16 through transformers.js (CLIP weights MIT)",
      "graph file paths inferred from an earlier build, not checked against the repo",
    ],
    form: {
      steps: { min: 1, max: 4, default: 2 },
      guidance: null,
      negative: false,
      sizes: [512],
      spacing: "trailing",
      note: "distilled from sd 2.1. 1 to 4 steps, no negative prompt. the fastest path.",
      tokenizer: "Xenova/clip-vit-base-patch16",
      graphs,
    },
  },
  {
    id: "sd-1.5",
    label: "stable diffusion 1.5",
    provides: ["imagegen"],
    provider: "ort",
    source: { repo: "microsoft/stable-diffusion-v1.5-webnn", files },
    sizeMB: 2000,
    sizeSource: "inferred",
    ladder: [{ device: "webgpu", ort: { executionProviders: ["webgpu"] }, options: free512 }],
    licence: "CreativeML OpenRAIL-M (use restrictions in its attachment A)",
    commercial: true,
    place: "gpu",
    runtime: "onnxruntime-web@1.27.0",
    notes: [
      "about 2 GB by an earlier bench's label (vendor); the repo, its file paths and its input dtypes are inferred and not checked",
      "runs the unet twice a step for guidance, so a step costs about twice an sd-turbo step (inferred)",
      "tokenizer: Xenova/clip-vit-base-patch16 through transformers.js (CLIP weights MIT)",
    ],
    form: {
      steps: { min: 5, max: 40, default: 22 },
      guidance: { min: 1, max: 12, default: 7.5, step: 0.5 },
      negative: true,
      sizes: [512],
      spacing: "leading",
      note: "classic sd, openrail-m licence. 20 to 30 steps with guidance, takes a negative prompt. slower per image.",
      tokenizer: "Xenova/clip-vit-base-patch16",
      graphs,
    },
  },
];

/** The form for a record, or null for a record without one (a stub). */
export function formOf(rec: ModelRecord | undefined): ImageForm | null {
  const f = (rec as Partial<ImagegenRecord> | undefined)?.form;
  return f ?? null;
}

/** The load button label: names the model and its download size with the size's source. */
export function loadLabel(rec: ModelRecord): string {
  const name = rec.label ?? rec.id;
  if (rec.sizeMB === null) return `load ${name}, size unknown`;
  if (rec.sizeMB === 0) return `load ${name}, no download`;
  const size = rec.sizeMB >= 1000 ? `${(rec.sizeMB / 1000).toFixed(1)} gb` : `${rec.sizeMB} mb`;
  return `load ${name}, about ${size} (${rec.sizeSource})`;
}

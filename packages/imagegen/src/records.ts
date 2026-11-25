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
    speed: "fast",
    verdict: "fast, built in",
    group: "start here",
    provides: ["imagegen"],
    provider: "ort",
    source: { repo: "schmuell/sd-turbo-ort-web", files },
    // text encoder 681.4, unet 1733.4, vae decoder 99.1 MB in the hub listing (vendor, 2026-11-25), in MiB
    sizeMB: 2397,
    sizeSource: "vendor",
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
    speed: "slow",
    verdict: "classic, takes negatives",
    group: "good",
    provides: ["imagegen"],
    provider: "ort",
    source: { repo: "microsoft/stable-diffusion-v1.5-webnn", files },
    // fp16 text encoder 246.5, unet 1719.4, vae 99.1 MB in the hub listing, no safety checker (vendor, 2026-11-25), in MiB
    sizeMB: 1969,
    sizeSource: "vendor",
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

/**
 * Listed for pickers, not registered by attachImagegen: SDXL-Turbo has two
 * text encoders and the pipeline here runs one, so routing must not pick it.
 */
export const IMAGEGEN_PICKER_RECORDS: ImagegenRecord[] = [
  {
    id: "sdxl-turbo",
    label: "sdxl-turbo 512",
    speed: "steady",
    verdict: "not run yet",
    unrunnable: "not run yet. sdxl-turbo needs two text encoders and this pipeline runs one.",
    group: "good",
    provides: ["imagegen"],
    provider: "ort",
    source: {
      repo: "webnn/sdxl-turbo",
      files: [{ path: "text_encoder/model.onnx" }, { path: "text_encoder_2/model.onnx" }, { path: "unet/model.onnx" }, { path: "vae_decoder/model.onnx" }],
    },
    // q4f16 text encoder 124.4, text encoder 2 483.7, unet 1965.6, vae decoder 97.6 MB in the hub listing (vendor, 2026-11-25), in MiB
    sizeMB: 2548,
    sizeSource: "vendor",
    ladder: [{ device: "webgpu", ort: { executionProviders: ["webgpu"] }, options: free512 }],
    licence: "Stability AI Community License (named in the card text; the repo has no licence field)",
    commercial: "unknown",
    place: "gpu",
    runtime: "onnxruntime-web@1.27.0",
    notes: [
      "two text encoders; the pipeline in this package runs one, so this record is listed and not run yet",
      "an earlier image bench offered it as the highest quality of three",
    ],
    form: {
      steps: { min: 1, max: 4, default: 1 },
      guidance: null,
      negative: false,
      sizes: [512],
      spacing: "trailing",
      note: "distilled from sdxl. 1 to 4 steps, no negative prompt. the best looking of the three.",
      tokenizer: "Xenova/clip-vit-base-patch16",
      graphs,
    },
  },
];

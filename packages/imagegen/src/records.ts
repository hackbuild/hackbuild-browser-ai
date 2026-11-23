/**
 * Image generation records. Licences are the model cards' as of
 * 2026-11-22; check them before shipping a product. Sizes inferred.
 */

import type { ModelRecord } from "@hackbuild/models";

export const IMAGEGEN_RECORDS: ModelRecord[] = [
  {
    id: "sd-turbo",
    label: "sd-turbo 512",
    provides: ["imagegen"],
    provider: "ort",
    source: {
      repo: "schmuell/sd-turbo-ort-web",
      files: [{ path: "text_encoder/model.onnx" }, { path: "unet/model.onnx" }, { path: "vae_decoder/model.onnx" }],
    },
    sizeMB: 2600,
    sizeSource: "inferred",
    ladder: [{ device: "webgpu", ort: { executionProviders: ["webgpu"] } }],
    licence: "Stability AI Non-Commercial Research Community License (the LICENSE in schmuell/sd-turbo-ort-web; upstream stabilityai/sd-turbo moved to the Community License in July 2024, this export did not)",
    commercial: false,
    place: "gpu",
    runtime: "onnxruntime-web@1.27.0",
    notes: [
      "webgpu only in an earlier build, no wasm floor",
      "tokenizer: Xenova/clip-vit-base-patch16 through transformers.js (CLIP weights MIT)",
      "graph file paths inferred from an earlier build, not checked against the repo",
    ],
  },
];

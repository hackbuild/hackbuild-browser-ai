/** VAD records. Licence per the model card as of 2026-11-22; size inferred. */

import type { ModelRecord } from "@hackbuild/models";

export const VAD_RECORDS: ModelRecord[] = [
  {
    id: "silero-vad-v5",
    label: "silero vad v5",
    provides: ["vad"],
    provider: "ort",
    source: { repo: "snakers4/silero-vad", file: "src/silero_vad/data/silero_vad.onnx" },
    sizeMB: 2.3,
    sizeSource: "inferred",
    ladder: [{ device: "wasm", ort: { executionProviders: ["wasm"] } }],
    licence: "MIT",
    commercial: true,
    place: "main",
    notes: ["512 samples at 16 kHz per frame with 64 samples of context", "single threaded wasm; threaded wasm hung inside workers in an earlier build"],
  },
];

/** VAD records. Licence per the model card as of 2026-11-22; size inferred. */

import type { ModelRecord } from "@hackbuild/models";

/** Model records for the VAD this package runs, for pickers and the models registry. */
export const VAD_RECORDS: ModelRecord[] = [
  {
    id: "silero-vad-v5",
    label: "silero vad v5",
    speed: "instant",
    verdict: "hears speech start",
    group: "start here",
    provides: ["vad"],
    provider: "ort",
    // a GitHub repo, not a Hugging Face one: pinned by commit on raw.githubusercontent.com (CORS open)
    source: {
      url: "https://raw.githubusercontent.com/snakers4/silero-vad/63d4a2a7bfce8cd9bb39ed8fa0afcb5236d73e01/src/silero_vad/data/silero_vad.onnx",
      revision: "63d4a2a7bfce8cd9bb39ed8fa0afcb5236d73e01",
      sha256: "f6f4407b41e05e277e7f5cfd9b9ae957b1dfe763c6076a934734c0b448e09b31",
    },
    sizeMB: 2.2,
    sizeSource: "measured",
    ladder: [{ device: "wasm", ort: { executionProviders: ["wasm"] } }],
    licence: "MIT",
    commercial: true,
    place: "main",
    notes: ["512 samples at 16 kHz per frame with 64 samples of context", "single threaded wasm; threaded wasm has hung inside workers"],
  },
];

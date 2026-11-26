/**
 * Speech to text records for the models hub. Ladders and dtypes are
 * the earlier transcription tool's per model table; sizes are inferred from the builds'
 * notes, except rows marked vendor: those sum the quantized encoder and
 * decoder in the hub listing (no download, 2026-11-25), in MiB. Licences are the model cards' as of 2026-11-22.
 */

import { LADDERS, tjsLadder } from "@hackbuild/devices";
import type { ModelRecord } from "@hackbuild/models";

const asr = (r: Omit<ModelRecord, "provides" | "provider" | "sizeSource" | "commercial" | "place"> & Partial<ModelRecord>): ModelRecord => ({
  provides: ["transcribe"],
  provider: "tjs",
  sizeSource: "inferred",
  commercial: true,
  place: "cpu-worker",
  runtime: "@huggingface/transformers@4.3.2",
  ...r,
});

/** The Whisper and Moonshine model records for the models hub. */
export const TRANSCRIBE_RECORDS: ModelRecord[] = [
  asr({
    id: "whisper-large-v3-turbo",
    label: "whisper large-v3-turbo",
    speed: "steady",
    verdict: "best accuracy, multilingual",
    group: "good",
    source: { modelId: "onnx-community/whisper-large-v3-turbo" },
    // per rung, from the hub listing (vendor, 2026-11-25): encoder fp16 1274.3 MB plus decoder q4 334.1 MB is 1534 MiB (the first rung);
    // encoder fp32 2548.3 MB plus decoder q4 is 2749 MiB; encoder and decoder q8 (wasm) 644.8 plus 439.9 MB is 1034 MiB
    sizeMB: 1534,
    sizeSource: "vendor",
    ladder: LADDERS.whisperTurbo(),
    licence: "MIT",
    place: "gpu",
    notes: ["best accuracy, multilingual, wants webgpu (as earlier builds did)", "download per rung: 1.5 gb fp16 encoder and q4 decoder, 2.7 gb fp32 encoder, 1.0 gb q8 on wasm (vendor)"],
  }),
  asr({
    id: "whisper-base",
    label: "whisper base",
    speed: "fast",
    verdict: "multilingual, light",
    group: "start here",
    source: { modelId: "onnx-community/whisper-base" },
    sizeMB: 77,
    sizeSource: "vendor",
    ladder: LADDERS.whisperSmall(true),
    licence: "MIT",
  }),
  asr({
    id: "whisper-small.en",
    label: "whisper small.en",
    speed: "steady",
    verdict: "english, careful",
    group: "good",
    source: { modelId: "Xenova/whisper-small.en" },
    sizeMB: 238,
    sizeSource: "vendor",
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only"],
  }),
  asr({
    id: "whisper-base.en",
    label: "whisper base.en",
    speed: "fast",
    verdict: "english, no gpu pick",
    group: "tiny",
    source: { modelId: "Xenova/whisper-base.en" },
    sizeMB: 90,
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only; the earlier transcription tool's no gpu default"],
  }),
  asr({
    id: "whisper-tiny.en",
    label: "whisper tiny.en",
    speed: "instant",
    verdict: "english, rough",
    group: "tiny",
    source: { modelId: "Xenova/whisper-tiny.en" },
    sizeMB: 39,
    sizeSource: "vendor",
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only"],
  }),
  asr({
    id: "moonshine-base",
    label: "moonshine base",
    speed: "fast",
    verdict: "english, no timestamps",
    group: "tiny",
    source: { modelId: "onnx-community/moonshine-base-ONNX" },
    sizeMB: 60,
    sizeSource: "vendor",
    ladder: tjsLadder({ webgpu: [{ encoder_model: "fp32", decoder_model_merged: "q4" }], wasm: [{ encoder_model: "q8", decoder_model_merged: "q8" }] }),
    licence: "MIT (english models, per the model card; check before use)",
    commercial: "unknown",
    notes: ["english only; no timestamps, one chunk per reel"],
  }),
];

/** The record earlier builds picked: turbo with a webgpu adapter, base.en without. */
export function defaultTranscribeId(webgpu: boolean): string {
  return webgpu ? "whisper-large-v3-turbo" : "whisper-base.en";
}

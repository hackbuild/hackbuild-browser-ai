/**
 * Speech to text records for the models hub. Ladders and dtypes are
 * the earlier transcription tool's per model table; sizes are inferred from the builds'
 * notes. Licences are the model cards' as of 2026-11-22.
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

export const TRANSCRIBE_RECORDS: ModelRecord[] = [
  asr({
    id: "whisper-large-v3-turbo",
    label: "whisper large-v3-turbo",
    source: { modelId: "onnx-community/whisper-large-v3-turbo" },
    sizeMB: 900,
    ladder: LADDERS.whisperTurbo(),
    licence: "MIT",
    place: "gpu",
    notes: ["best accuracy, multilingual, wants webgpu (as earlier builds did)"],
  }),
  asr({
    id: "whisper-base",
    label: "whisper base",
    source: { modelId: "onnx-community/whisper-base" },
    sizeMB: 90,
    ladder: LADDERS.whisperSmall(true),
    licence: "MIT",
  }),
  asr({
    id: "whisper-small.en",
    label: "whisper small.en",
    source: { modelId: "Xenova/whisper-small.en" },
    sizeMB: 250,
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only"],
  }),
  asr({
    id: "whisper-base.en",
    label: "whisper base.en",
    source: { modelId: "Xenova/whisper-base.en" },
    sizeMB: 90,
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only; the earlier transcription tool's no gpu default"],
  }),
  asr({
    id: "whisper-tiny.en",
    label: "whisper tiny.en",
    source: { modelId: "Xenova/whisper-tiny.en" },
    sizeMB: 40,
    ladder: LADDERS.whisperSmall(false),
    licence: "MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0)",
    notes: ["english only"],
  }),
  asr({
    id: "moonshine-base",
    label: "moonshine base",
    source: { modelId: "onnx-community/moonshine-base-ONNX" },
    sizeMB: 250,
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

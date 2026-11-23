/**
 * Voice records for pickers and the models registry. Sizes are inferred
 * from the model repos; licences are the model cards' as of 2026-11-22.
 */

import type { ModelRecord } from "@hackbuild/models";

export const SPEAK_RECORDS: ModelRecord[] = [
  {
    id: "kokoro-82m",
    label: "kokoro 82m",
    provides: ["speak"],
    provider: "kokoro-js",
    source: { modelId: "onnx-community/Kokoro-82M-v1.0-ONNX" },
    sizeMB: 330,
    sizeSource: "inferred",
    ladder: [
      { device: "webgpu", dtype: "fp32", needs: ["http"] },
      { device: "wasm", dtype: "q8" },
    ],
    licence: "Apache-2.0 (weights); the kokoro-js runtime phonemizes with eSpeak NG, GPL-3.0-or-later, loaded at run time and opt in",
    commercial: true,
    place: "cpu-worker",
    runtime: "kokoro-js@1.2.1",
    notes: ["webgpu with q8 gave garbled audio in the source build", "fp32 weights (about 330 MB, inferred) do not cache on file://, so webgpu needs http"],
  },
  {
    id: "pocket-tts",
    label: "pocket tts",
    provides: ["speak"],
    provider: "pocket-worker",
    source: { url: "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/main/", repo: "kyutai/pocket-tts" },
    sizeMB: null,
    sizeSource: "unknown",
    ladder: [{ device: "wasm" }],
    licence: "CC-BY-4.0 (weights), MIT (code)",
    commercial: true,
    place: "cpu-worker",
    notes: ["zero shot clone from a caller supplied reference", "community browser build; its worker is patched at load and patches are reported when they stop matching"],
  },
  {
    id: "bellows-voice",
    label: "bellows voice",
    provides: ["speak"],
    provider: "bellows-voice",
    source: { repo: "virgilvox/bellows-voice" },
    sizeMB: 0,
    sizeSource: "vendor",
    ladder: [{ device: "wasm" }],
    licence: "none, no weights (code MIT)",
    commercial: true,
    place: "cpu-worker",
    runtime: "bellows-voice@0.8.0 on bellowsjs@0.5.0",
    notes: ["a physical model of the vocal tract, no download beyond its code (about 65 KB gzipped, vendor)", "deterministic per seed; the seed is drawn once from the injected rng", "exact phoneme times; no word times"],
  },
  {
    id: "web-speech",
    label: "system voice",
    provides: ["speak"],
    provider: "system",
    source: {},
    sizeMB: 0,
    sizeSource: "vendor",
    ladder: [{ device: "browser" }],
    licence: "system voices, the platform's terms",
    commercial: "unknown",
    place: "main",
    notes: ["some browsers send text to a server for system voices"],
  },
];

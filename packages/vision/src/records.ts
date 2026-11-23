/**
 * Vision records for the models hub. Licences are the model cards' as of
 * 2026-11-22; sizes are inferred from the builds and parameter counts.
 * YOLO weights are AGPL-3.0 (Ultralytics): they are never registered by
 * default, and `yoloRecord` builds a record only for a URL the app
 * supplies.
 */

import { LADDERS, tjsLadder } from "@hackbuild/devices";
import type { ModelRecord, Rung } from "@hackbuild/models";

export const MP_MODELS = "https://storage.googleapis.com/mediapipe-models/";

/** MediaPipe ladder: GPU delegate (webgl), then the CPU delegate (wasm). */
export const mediapipeLadder = (): Rung[] => [{ device: "webgl" }, { device: "wasm" }];

const mp = (id: string, provides: string, path: string, sizeMB: number, label: string): ModelRecord => ({
  id,
  label,
  provides: [provides],
  provider: "mediapipe",
  source: { url: MP_MODELS + path },
  sizeMB,
  sizeSource: "inferred",
  ladder: mediapipeLadder(),
  licence: "Apache-2.0",
  commercial: true,
  place: "main",
  runtime: "@mediapipe/tasks-vision@1.2.3",
});

export const VISION_RECORDS: ModelRecord[] = [
  {
    id: "depth-anything-v2-small",
    label: "depth anything v2 small",
    provides: ["depth"],
    provider: "tjs",
    source: { modelId: "onnx-community/depth-anything-v2-small" },
    sizeMB: 100,
    sizeSource: "inferred",
    ladder: LADDERS.depth(),
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["earlier builds: fp16 on webgpu, fp32 on the same device after a failure"],
  },
  mp("efficientdet-lite0", "detect", "object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", 7, "mediapipe efficientdet lite0 (coco, 80 classes)"),
  mp("selfie-segmenter", "segment.person", "image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite", 1, "mediapipe selfie segmenter"),
  mp("face-landmarker", "landmarks.face", "face_landmarker/face_landmarker/float16/1/face_landmarker.task", 4, "mediapipe face landmarker with blendshapes"),
  mp("hand-landmarker", "landmarks.hand", "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", 8, "mediapipe hand landmarker"),
  mp("pose-landmarker-lite", "landmarks.pose", "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", 6, "mediapipe pose landmarker lite"),
  {
    id: "slimsam-77-uniform",
    label: "slimsam 77 uniform (point prompts)",
    provides: ["segment"],
    provider: "tjs",
    source: { modelId: "Xenova/slimsam-77-uniform" },
    sizeMB: 40,
    sizeSource: "inferred",
    ladder: tjsLadder({ webgpu: ["fp16", "fp32"], wasm: ["fp32"] }),
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["earlier builds: one image embedding, then any number of point prompts"],
  },
  {
    id: "smolvlm-256m-instruct",
    label: "smolvlm 256m",
    provides: ["vision.caption", "vision.ask"],
    provider: "tjs",
    source: { modelId: "HuggingFaceTB/SmolVLM-256M-Instruct" },
    sizeMB: 260,
    sizeSource: "inferred",
    ladder: LADDERS.smolvlm(),
    quirks: { repetitionPenalty: 1.3, maxTokensAction: 64 },
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
  },
  {
    id: "lfm2-vl-450m",
    label: "lfm2-vl 450m",
    provides: ["vision.caption", "vision.ask"],
    provider: "tjs",
    source: { modelId: "onnx-community/LFM2-VL-450M-ONNX" },
    sizeMB: 320,
    sizeSource: "inferred",
    ladder: LADDERS.vlmGpuOnly(),
    // transformers.js 4.3.2 Lfm2VlProcessor._call(images, text): text first threw
    // "undefined is not iterable" in the browser pass (measured 2026-11-23)
    quirks: { maxTokensAction: 72, processorImagesFirst: true },
    licence: "LFM Open License v1.0",
    commercial: "unknown",
    place: "gpu",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["earlier builds: q4f16 on webgpu only; the licence limits commercial use by revenue, read it before shipping"],
  },
];

/** A face landmark fallback record over face-api.js tiny nets (code MIT; weights MIT from @vladmandic/face-api). */
export function faceApiRecord(baseUrl: string): ModelRecord {
  return {
    id: "face-api-tiny",
    label: "face-api tiny landmarks (68 points)",
    provides: ["landmarks.face"],
    provider: "faceapi",
    source: { url: baseUrl },
    sizeMB: 1,
    sizeSource: "inferred",
    ladder: [{ device: "wasm" }],
    licence: "MIT",
    commercial: true,
    place: "main",
  };
}

/** YOLOv8n exported to ONNX (640 input, [1, 84, 8400] output). External: the app supplies the URL and accepts the weight licence. */
export function yoloRecord(o: { url: string; sha256?: string; id?: string; licence?: string; labels?: string[] }): ModelRecord {
  return {
    id: o.id ?? "yolov8n",
    label: "yolov8n (external)",
    provides: ["detect"],
    provider: "ort",
    source: { url: o.url, ...(o.sha256 ? { sha256: o.sha256 } : {}) },
    sizeMB: 13,
    sizeSource: "inferred",
    ladder: [
      { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"] } },
      { device: "wasm", ort: { executionProviders: ["wasm"] } },
    ],
    licence: o.licence ?? "AGPL-3.0 (Ultralytics YOLOv8 weights), supplied by the app",
    commercial: false,
    place: "gpu",
    notes: ["earlier builds: 640 letterbox, per class nms at iou 0.45, at most 13 boxes"],
  };
}

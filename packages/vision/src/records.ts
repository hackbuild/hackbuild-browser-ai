/**
 * Vision records for the models hub. Licences are the model cards' as of
 * 2026-11-22; sizes are inferred from the builds and parameter counts, except where
 * a row says vendor: those sum the hub listing's files (no download), in MiB.
 * YOLO weights are AGPL-3.0 (Ultralytics): they are never registered by
 * default. YOLOv8n has no onnx-community or Xenova repo (an HTTP HEAD of
 * their config.json gave 401 on 2026-11-25), so `yoloRecord` builds a record
 * only for a URL the app supplies; YOLOv10 n, s and m, FastSAM and the face
 * swap set sit in PICKER_RECORDS. The YOLOv10 n, s and m, SmolVLM 500M,
 * Gemma 4 E2B and FastSAM repos answered that HEAD with 200 the same day.
 */

import { LADDERS, tjsLadder } from "@hackbuild/devices";
import type { ModelRecord, Rung, Speed } from "@hackbuild/models";

/** The MediaPipe model storage base URL the MediaPipe records load from. */
export const MP_MODELS = "https://storage.googleapis.com/mediapipe-models/";

/** MediaPipe ladder: GPU delegate (webgl), then the CPU delegate (wasm). */
export const mediapipeLadder = (): Rung[] => [{ device: "webgl" }, { device: "wasm" }];

const mp = (id: string, provides: string, path: string, sizeMB: number, label: string, verdict = "light, on the gpu", group = "start here"): ModelRecord => ({
  id,
  label,
  group,
  speed: "instant",
  verdict,
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

/** The vision records registered by `attachVision`: Depth Anything V2 small, MediaPipe detection, segmentation and landmarks, SlimSAM, SmolVLM 256M and LFM2-VL 450M. */
export const VISION_RECORDS: ModelRecord[] = [
  {
    id: "depth-anything-v2-small",
    label: "depth anything v2 small",
    speed: "fast",
    verdict: "good edges",
    group: "start here",
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
    notes: ["fp16 on webgpu, fp32 on the same device after a failure"],
  },
  mp("efficientdet-lite0", "detect", "object_detector/efficientdet_lite0/float16/1/efficientdet_lite0.tflite", 7, "mediapipe efficientdet lite0 (coco, 80 classes)", "light, 80 things"),
  mp("selfie-segmenter", "segment.person", "image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite", 1, "mediapipe selfie segmenter"),
  mp("face-landmarker", "landmarks.face", "face_landmarker/face_landmarker/float16/1/face_landmarker.task", 4, "mediapipe face landmarker with blendshapes"),
  mp("hand-landmarker", "landmarks.hand", "hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task", 8, "mediapipe hand landmarker"),
  {
    ...mp("gesture-recognizer", "landmarks.gesture", "gesture_recognizer/gesture_recognizer/float16/1/gesture_recognizer.task", 8, "mediapipe gesture recognizer (7 canned gestures)"),
    // the model card's licence was not checked when this record was added
    licence: "unknown, check the mediapipe model card",
    commercial: "unknown",
    notes: ["optional: hands feed waves and canned gestures to the signal tracker, which runs on faces alone"],
  },
  mp("pose-landmarker-lite", "landmarks.pose", "pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task", 6, "mediapipe pose landmarker lite"),
  {
    id: "slimsam-77-uniform",
    label: "slimsam 77 uniform (point prompts)",
    speed: "fast",
    verdict: "click to cut",
    group: "start here",
    provides: ["segment"],
    provider: "tjs",
    source: { modelId: "Xenova/slimsam-77-uniform" },
    // fp32 vision encoder 23.3 plus prompt decoder 16.6 MB in the hub listing, 38 MiB; quantized 13.8 MB (vendor, 2026-11-25)
    sizeMB: 38,
    sizeSource: "vendor",
    ladder: tjsLadder({ webgpu: ["fp16", "fp32"], wasm: ["fp32"] }),
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["one image embedding, then any number of point prompts"],
  },
  {
    id: "smolvlm-256m-instruct",
    label: "smolvlm 256m",
    speed: "fast",
    verdict: "fastest, short answers",
    group: "start here",
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
    speed: "fast",
    verdict: "faster, sharper",
    group: "tiny",
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
    notes: ["q4f16 on webgpu only; the licence limits commercial use by revenue, read it before shipping"],
  },
];

/**
 * Records listed for pickers and never registered by default, so a hub's
 * routing by capability keeps its small defaults: larger alternates (smolvlm 500m and 2 video, gemma 4 e2b, two more
 * depth models), and records under licences that limit use (YOLOv10 and
 * FastSAM are AGPL-3.0 upstream, Ultralytics; the face swap set is
 * InsightFace, non-commercial). A hub that runs one adds it itself. Sizes
 * are the hub listings' files (vendor, 2026-11-25), in MiB.
 */
const yolo10 = (size: "n" | "s" | "m", mb: number, speed: Speed, verdict: string): ModelRecord => ({
  id: `yolov10${size}`,
  label: `yolov10 ${({ n: "nano", s: "small", m: "medium" })[size]}`,
  group: size === "n" ? "tiny" : "good",
  speed,
  verdict,
  provides: ["detect"],
  provider: "ort",
  source: { repo: `onnx-community/yolov10${size}`, file: "onnx/model.onnx" },
  sizeMB: mb,
  sizeSource: "vendor",
  ladder: [
    { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"] } },
    { device: "wasm", ort: { executionProviders: ["wasm"] } },
  ],
  licence: "AGPL-3.0 (Ultralytics weights, the model card's licence field)",
  commercial: false,
  place: "gpu",
  notes: ["output [1, 300, 6] after the model's own selection, so no nms pass (vendor, the yolov10 paper)", "comes in nano, small and medium"],
});

/** Records listed for pickers and never registered by default: larger alternates, and records under licences that limit use (YOLOv10, FastSAM, the face swap set). */
export const PICKER_RECORDS: ModelRecord[] = [
  {
    id: "smolvlm-500m-instruct",
    label: "smolvlm 500m",
    speed: "steady",
    verdict: "better captions, slower",
    group: "good",
    provides: ["vision.caption", "vision.ask"],
    provider: "tjs",
    source: { modelId: "HuggingFaceTB/SmolVLM-500M-Instruct" },
    // q4 decoder 229.1, q4 vision 66.7, q4 embed 189.2 MB in the onnx folder of the hub listing (vendor, 2026-11-25)
    sizeMB: 463,
    sizeSource: "vendor",
    ladder: LADDERS.smolvlm(),
    quirks: { repetitionPenalty: 1.3, maxTokensAction: 64 },
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
  },
  {
    id: "smolvlm2-256m-video-instruct",
    label: "smolvlm2 256m video",
    speed: "fast",
    verdict: "watches short clips",
    group: "tiny",
    provides: ["vision.caption", "vision.ask"],
    provider: "tjs",
    source: { modelId: "HuggingFaceTB/SmolVLM2-256M-Video-Instruct" },
    // q4 decoder 86.9, q4 vision 63.8, q4 embed 113.5 MB in the hub listing (vendor, 2026-11-25), in MiB
    sizeMB: 252,
    sizeSource: "vendor",
    ladder: LADDERS.smolvlm(),
    quirks: { repetitionPenalty: 1.3, maxTokensAction: 64 },
    licence: "Apache-2.0",
    commercial: true,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["an option beside smolvlm 256m and 500m"],
  },
  {
    id: "depth-anything-v2-base",
    label: "depth anything v2 base",
    speed: "steady",
    verdict: "finer depth, non commercial",
    group: "good",
    provides: ["depth"],
    provider: "tjs",
    source: { modelId: "onnx-community/depth-anything-v2-base" },
    // model_fp16.onnx 194.6 MB, model.onnx 388.9 MB in the hub listing (vendor, 2026-11-25); the first rung loads fp16
    sizeMB: 186,
    sizeSource: "vendor",
    ladder: LADDERS.depth(),
    licence: "CC-BY-NC-4.0 (the model card's licence field)",
    commercial: false,
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
  },
  {
    id: "depth-anything-small-v1",
    label: "depth anything v1 small",
    speed: "fast",
    verdict: "the first version",
    group: "tiny",
    provides: ["depth"],
    provider: "tjs",
    source: { modelId: "Xenova/depth-anything-small-hf" },
    // model_fp16.onnx 49.9 MB in the hub listing (vendor, 2026-11-25)
    sizeMB: 48,
    sizeSource: "vendor",
    ladder: LADDERS.depth(),
    licence: "Apache-2.0 (the upstream card; this export's card has no licence field)",
    commercial: "unknown",
    place: "cpu-worker",
    runtime: "@huggingface/transformers@4.3.2",
  },
  {
    id: "gemma-4-e2b-vision",
    label: "gemma 4 e2b",
    speed: "slow",
    verdict: "sees most, heavy",
    group: "good",
    provides: ["vision.caption", "vision.ask"],
    provider: "tjs",
    source: { modelId: "onnx-community/gemma-4-E2B-it-ONNX" },
    // q4 decoder, vision and embed graphs with their external data, no audio encoder: 3739.7 MB in the hub listing (vendor, 2026-11-25)
    sizeMB: 3566,
    sizeSource: "vendor",
    ladder: LADDERS.vlmGpuOnly(),
    quirks: { systemRole: false, strictAlternation: true, maxTokensAction: 96 },
    licence: "Apache-2.0 (the model card's licence field)",
    commercial: true,
    place: "gpu",
    runtime: "@huggingface/transformers@4.3.2",
    notes: ["about 3.3 GB (vendor)"],
  },
  yolo10("n", 9, "instant", "nano, quick"),
  yolo10("s", 28, "fast", "small, sharper"),
  yolo10("m", 59, "steady", "medium, best boxes"),
  {
    id: "fastsam-s",
    label: "fastsam s",
    speed: "fast",
    verdict: "finds everything, cpu ok",
    group: "good",
    provides: ["segment.everything"],
    provider: "ort",
    source: { repo: "anakhiu/fastsam-onnx", file: "fastsam_s.onnx" },
    sizeMB: 45,
    sizeSource: "vendor",
    ladder: [
      { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"] } },
      { device: "wasm", ort: { executionProviders: ["wasm"] } },
    ],
    licence: "AGPL-3.0 upstream (Ultralytics FastSAM); the export's card says apache-2.0",
    commercial: false,
    place: "cpu-worker",
    // fastsam_s.onnx 47637745 bytes in the hub listing (vendor, 2026-11-25, https://huggingface.co/anakhiu/fastsam-onnx/tree/main), in MiB
    notes: ["finds every mask in one pass on onnxruntime-web; the original page loaded a 93 MB build (vendor, its review)", "segment everything: prototype masks, nms, then a pick by click (segmentEverything, instanceAt)"],
  },
  {
    id: "scrfd-10g",
    label: "face finder (scrfd 10g)",
    speed: "fast",
    verdict: "finds faces",
    group: "start here",
    provides: ["face.detect"],
    provider: "ort",
    source: { repo: "immich-app/buffalo_l", file: "detection/model.onnx" },
    sizeMB: 16,
    sizeSource: "vendor",
    ladder: [{ device: "wasm", ort: { executionProviders: ["wasm"] } }],
    licence: "InsightFace model pack: non-commercial research only (the buffalo_l pack terms)",
    commercial: false,
    place: "cpu-worker",
  },
  {
    id: "arcface-w600k-r50",
    label: "face id (arcface r50)",
    speed: "steady",
    verdict: "who is who",
    group: "start here",
    provides: ["face.embed"],
    provider: "ort",
    source: { repo: "immich-app/buffalo_l", file: "recognition/model.onnx" },
    sizeMB: 166,
    sizeSource: "vendor",
    ladder: [
      { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"] } },
      { device: "wasm", ort: { executionProviders: ["wasm"] } },
    ],
    licence: "InsightFace model pack: non-commercial research only (the buffalo_l pack terms)",
    commercial: false,
    place: "cpu-worker",
  },
  {
    id: "inswapper-128",
    label: "face swap (inswapper 128)",
    speed: "slow",
    verdict: "the swap itself",
    group: "start here",
    provides: ["face.swap"],
    provider: "ort",
    source: { repo: "hacksider/inswapper_128", file: "inswapper_128.onnx" },
    sizeMB: 529,
    sizeSource: "vendor",
    ladder: [
      { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"] } },
      { device: "wasm", ort: { executionProviders: ["wasm"] } },
    ],
    licence: "InsightFace: non-commercial research only; the mirror's card says gpl-3.0",
    commercial: false,
    place: "gpu",
    notes: ["128 px faces; paste the result back with a feathered mask"],
  },
];

/** A face landmark fallback record over face-api.js tiny nets (code MIT; weights MIT from @vladmandic/face-api). */
export function faceApiRecord(baseUrl: string): ModelRecord {
  return {
    id: "face-api-tiny",
    label: "face-api tiny landmarks (68 points)",
    speed: "instant",
    verdict: "68 points, cpu",
    group: "cpu",
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
    group: "tiny",
    speed: "instant",
    verdict: "nano, your file",
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
    notes: ["640 letterbox, per class nms at iou 0.45, at most 13 boxes"],
  };
}

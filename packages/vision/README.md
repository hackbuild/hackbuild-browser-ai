# @hackbuild/vision

Perception through the `@hackbuild/models` hub: depth, detection,
segmentation, face, hand and pose landmarks with a fallback chain, and
captions and questions through small VLMs, plus a webcam loop helper and
a result cache. Code MIT; this README CC-BY-4.0 with the code samples
also MIT. No weights ship here.

    npm install @hackbuild/vision

## Wire it once

    import { createHub, stubFactory } from "@hackbuild/models";
    import { tjsProvider, loadTransformers } from "@hackbuild/devices";
    import { attachVision, mediapipeProvider, loadTasksVision, visionStubs, depth, detect, landmarks, caption } from "@hackbuild/vision";

    const tjs = tjsProvider({ runtime: loadTransformers() });
    const hub = createHub({ env, stub: new URLSearchParams(location.search).has("stub") });
    attachVision(hub, tjs);                    // records plus transformers.js loaders
    hub.provide("tjs", tjs.factory);
    hub.provide("mediapipe", mediapipeProvider({ runtime: loadTasksVision() }));
    hub.provide("stub", stubFactory(visionStubs()));

    const map = await depth(hub, imageOrCanvas);           // 0 to 1, larger is nearer, plus the raw range
    const boxes = await detect(hub, video, { scoreThreshold: 0.4 });
    const face = await landmarks(hub, "face", video);      // falls through the chain, face.failures says what failed
    const line = await caption(hub, frame);                // serialized on the vlm chain

## Models

| capability | record | runtime | weight licence |
|---|---|---|---|
| depth | depth-anything-v2-small | transformers.js, fp16 then fp32 on webgpu, q8 then fp32 on wasm (BAIL) | Apache-2.0 |
| detect | efficientdet-lite0 (default) | MediaPipe, GPU then CPU delegate | Apache-2.0 |
| detect | `yoloRecord({ url })`, optional and external | onnxruntime-web, 640 letterbox, per class NMS at 0.45, 13 boxes (HACKLE) | AGPL-3.0 (Ultralytics), supplied by the app |
| segment (points) | slimsam-77-uniform | transformers.js, one embedding per image | Apache-2.0 |
| segment.person | selfie-segmenter | MediaPipe | Apache-2.0 |
| landmarks.face | face-landmarker, then `faceApiRecord(url)` | MediaPipe with blendshapes, then face-api.js tiny 68 points | Apache-2.0; MIT |
| landmarks.hand, landmarks.pose | hand-landmarker, pose-landmarker-lite | MediaPipe | Apache-2.0 |
| vision.caption, vision.ask | smolvlm-256m-instruct | transformers.js, per sub graph dtypes, repetition penalty 1.3 | Apache-2.0 |
| vision.caption, vision.ask | lfm2-vl-450m | transformers.js, q4f16 on webgpu only (HACKLE) | LFM Open License v1.0, commercial use limited by revenue |

The YOLO decoder is written from the published output layout
([1, 84, 8400]); no Ultralytics code is used. YOLO is never registered by
default.

## Sharing the GPU with a scene

Every call takes `schedule` (passed to `hub.run`: `minIntervalMs`,
`idleOnly`, `frameBudgetMs`, `when: "skip"`) and `size` or `maxMB` to
route to a smaller model. Report frame times with `hub.reportFrame(ms)`
and show `hub.onBusy` in the UI:

    hub.onBusy((n) => (pill.textContent = n ? "model busy" : ""));
    await depth(hub, frame, { size: "tiny", schedule: { minIntervalMs: 1200, frameBudgetMs: 20, when: "skip" } });

`readbackLoop({ read, onFrame, maxHz })` is the agent eye pattern: an
async readback (`readRenderTargetPixelsAsync`), a busy flag that skips
frames instead of queueing them, and a rate cap (default 10 Hz).

## Loop and cache

`perceptionLoop({ step, interval })` runs one step at a time beside the
render loop; `detectCadenceMs(latency)` is HACKLE's max(0.45 s, 4 times
the last latency). `ResultCache` keeps results by key so a depth map is
computed once per image (BAIL). `depthToRgba` and `fitSize` (BAIL's 1024
px cap) help with canvases.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/vision` passes 15 tests under Node
  22.18.0 with fake runtimes: licences on every record and YOLO kept
  external, every capability in stub mode, depth normalization from
  predicted_depth and from the 8 bit image, the depth record walking fp16
  to fp32 through the transformers.js provider, the MediaPipe provider
  falling from the GPU to the CPU delegate and mapping detections, masks,
  hands and blendshapes, the face fallback to face-api.js after the
  MediaPipe record fails, YOLO letterbox, decode and NMS, an external YOLO
  record through an ort model, VLM questions serialized on one chain,
  SlimSAM embedding an image once for several prompts, the loop's busy
  guard and interval, the LRU cache, schedule options reaching the hub
  (interval wait, skip, frame budget skip) with routing to a smaller
  model and busy reports, and the readback loop's rate cap and busy
  skips.

### Not verified by anything

- Any model in a browser: tasks-vision 1.2.3 (the HACKLE pin) task
  options and result shapes, transformers.js 4.3.2 SmolVLM, LFM2-VL and
  SlimSAM class names and processor calls, a real YOLOv8n export's output
  name and layout.
- FastSAM: not built. Its weights are AGPL-3.0 and its mask decoder is
  not written; SlimSAM covers point prompts.
- Accuracy and speed of every model (no numbers measured).
- Whether the frame budget and idle waits remove stutter in a real scene
  (needs a person looking at real frame rate).

# @hackbuild/vision

Perception through the `@hackbuild/models` hub: depth, detection,
segmentation, face, hand and pose landmarks with a fallback chain, and
captions and questions through small VLMs, plus a webcam loop helper and
a result cache. Code MIT; this README CC-BY-4.0 with the code samples
also MIT. No weights ship here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
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
| depth | depth-anything-v2-small | transformers.js, fp16 then fp32 on webgpu, q8 then fp32 on wasm (as earlier builds did) | Apache-2.0 |
| detect | efficientdet-lite0 (default) | MediaPipe, GPU then CPU delegate | Apache-2.0 |
| detect | `yoloRecord({ url })`, optional and external | onnxruntime-web, 640 letterbox, per class NMS at 0.45, 13 boxes (as earlier builds did) | AGPL-3.0 (Ultralytics), supplied by the app |
| segment (points) | slimsam-77-uniform | transformers.js, one embedding per image | Apache-2.0 |
| segment.person | selfie-segmenter | MediaPipe | Apache-2.0 |
| landmarks.face | face-landmarker, then `faceApiRecord(url)` | MediaPipe with blendshapes, then face-api.js tiny 68 points | Apache-2.0; MIT |
| landmarks.hand, landmarks.pose | hand-landmarker, pose-landmarker-lite | MediaPipe | Apache-2.0 |

`PICKER_RECORDS` lists models for pickers that no hub registers by
default, so routing by capability keeps the small defaults above: SmolVLM
500M and SmolVLM2 256M video, Gemma 4 E2B, depth anything v2 base
(CC-BY-NC-4.0) and v1 small, YOLOv10 nano, small and medium and FastSAM-s
(AGPL-3.0 upstream), and the face swap set (scrfd 10g, ArcFace r50,
inswapper 128; InsightFace, non-commercial). Sizes are the Hugging Face
file listings (vendor, no download). A hub that runs one adds the record.
| landmarks.gesture (optional) | gesture-recognizer | MediaPipe, hand points plus 7 canned gestures | unknown, model card not checked |
| vision.caption, vision.ask | smolvlm-256m-instruct | transformers.js, per sub graph dtypes, repetition penalty 1.3 | Apache-2.0 |
| vision.caption, vision.ask | lfm2-vl-450m | transformers.js, q4f16 on webgpu only (as earlier builds did) | LFM Open License v1.0, commercial use limited by revenue |

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

The schedule alone did not hold the scene's frames on an Apple M1: with
`frameBudgetMs` 20 and `minIntervalMs` 200 the frame p95 stayed at 49.8
ms with no main thread task over 50 ms (measured, Chrome 150). Running
the model in a worker did: `depthWorker({ urls: transformersUrls(),
device })` loads transformers.js and Depth Anything V2 small (Apache-2.0)
in a dedicated worker and takes RGBA pixels, so pre and post processing,
the readback and the normalization leave the page's thread:

    const w = await depthWorker({ urls: transformersUrls(), device: "webgpu" });
    paint(await w.estimate(ctx2d.getImageData(0, 0, 512, 288)));

`readbackLoop({ read, onFrame, maxHz })` is the agent eye pattern: an
async readback (`readRenderTargetPixelsAsync`), a busy flag that skips
frames instead of queueing them, and a rate cap (default 10 Hz).

## Loop and cache

`perceptionLoop({ step, interval })` runs one step at a time beside the
render loop; `detectCadenceMs(latency)` is the earlier scene app's max(0.45 s, 4 times
the last latency). `ResultCache` keeps results by key so a depth map is
computed once per image (as earlier builds did). `depthToRgba` and `fitSize` (as earlier builds did) help with canvases.

## Prompts, the embedding cache, mask operations and export

`segment` takes points (label 1 object, 0 background), a box, or both.
The image is encoded once and every later prompt on it decodes from the
cached embedding. Pass a stable `key` (an image hash) and your own
`EmbeddingCache` to see and drop what is kept:

    const cache = new EmbeddingCache(4);                 // four images, least recently used out
    const opts = { key: imageHash, cache };
    const [m] = await segment(hub, img, { box: { x: 40, y: 30, w: 200, h: 160 } }, opts);
    const [n] = await segment(hub, img, { points: [{ x: 90, y: 80 }, { x: 120, y: 90, label: 0 }] }, opts);
    cache.hits;                                          // 1, the second prompt did not encode
    cache.delete(imageHash);

`promptSegmenter({ encode, decode })` builds the same cached segmenter
around any encoder and decoder; scores come back clamped to 0 to 1.

Mask operations are functions on `Mask` (128 and up is inside):
`maskUnion`, `maskIntersect`, `maskSubtract`, `maskInvert`,
`maskThreshold`, `maskFeather(m, r)` (gaussian, sigma r / 2, soft edges),
`maskDilate(m, r)` and `maskErode(m, r)` (a disc of radius r through an
exact distance transform; the image border is not treated as outside),
`maskLargestComponent(m, 8 | 4)` and `maskArea`.

Export: `maskToPng` (grey), `cutoutPng(pixels, mask)` (the image with
the mask as alpha), `maskToSvg` (one even odd path along pixel edges,
loops from `maskOutline`), `maskToRle` and `maskFromRle` (COCO style
uncompressed run length, column major). `encodePng` deflates through
CompressionStream where the runtime has it and writes stored blocks
otherwise.

## Perception signals and seen notes

`SignalTracker` turns per frame face and hand readings into steady
signals and a few events: `arrived`, `left`, `smiled`, `gesture`. The
clock comes in with each frame. Hands are optional; it runs on faces
alone.

    const tracker = new SignalTracker();
    const notes = new SeenNotes();
    const f = await landmarks(hub, "face", video, { timestamp: now });
    const h = everyOther ? await landmarks(hub, "gesture", video, { timestamp: now }) : null;
    for (const e of tracker.feed(rawFromLandmarks(f, h), now)) for (const r of reactionsFor(e, rng)) play(r);
    const seen = notes.next(tracker.perception, wantsLook(text) ? await caption(hub, still) : null); // null when nothing changed

Thresholds are vendor figures from earlier builds, none measured here:
presence grace 2.5 s, "left" after 8 s, "arrived" after 20 s away, smile
on at 0.55 and off at 0.3 held 500 ms with a 10 s cooldown, gestures held
350 ms with a 4 s cooldown and a 0.6 score floor, a wave as 2 wrist
reversals inside 1.5 s above face level. `DEFAULT_REACTIONS` is data
(smile back after 600 ms at 0.7 chance, drawn from the injected rng);
`gazeTarget` applies a gain of 1.3. Frames never leave the tab; only the
signals and the lowercase note do.

## What is verified, and what is not

- Signals: the tracker's rules (noise, smile hold and cooldown, presence grace, left and arrived, wave and low hand, gesture score floor) and the seen note run in unit tests on synthetic frames. Not tuned against a live camera in this repository.

### Verified on this machine

- 2026-11-22: `npx vitest run packages/vision` passes 15 tests (19 on 2026-11-23) under Node
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

- 2026-11-23, Chrome 150 on an Apple M1, the vision page (#35): the
  scene alone at 16.7 / 18.3 ms frame p50 / p95; depth on the main thread
  16.7 / 49.9 unscheduled and 16.7 / 49.8 with the frame budget; depth in
  the worker on webgpu 16.7 / 18.3 (22 runs in 6 s, 280 ms p50), with a
  200 ms gap 16.7 / 18.3, on wasm 16.7 / 18.2 (4,664 ms per run); no main
  thread task over 50 ms in any mode (measured). Unit tests run the worker
  source on the inline rung with a fake transformers.js module.
- 2026-11-23: LFM2-VL 450M (LFM Open License v1.0) loads and captions on
  webgpu after the images first processor fix: load 8,743 ms, caption
  4,671 ms, the caption names the cube and the scene (measured).

- 2026-11-24: `npx vitest run packages/vision` passes 30 tests: one
  encode for point, negative point and box prompts on one image, shared
  encodes in flight, failed encodes dropped, least recently used
  eviction, SlimSAM fed `input_boxes` and negative labels from one
  embedding, a box prompt routed through the hub to the stub, union,
  subtract, invert, a radius 3 dilate giving 29 pixels (computed),
  erode keeping the border, feather, largest piece at 4 and 8
  connectivity, PNG grey and alpha read back through zlib, the SVG
  outline of a square and a ring, and the run length round trip.

### Not verified by anything

- Any model in a browser: tasks-vision 1.2.3 (as earlier builds did) task
  options and result shapes, transformers.js 4.3.2 SmolVLM, LFM2-VL and
  SlimSAM class names and processor calls (box prompts through
  `input_boxes` included), a real YOLOv8n export's output
  name and layout.
- FastSAM: not built. Its weights are AGPL-3.0 and its mask decoder is
  not written; SlimSAM covers point prompts.
- Accuracy and speed of every model (no numbers measured).
- Whether the frame budget and idle waits remove stutter in a real scene
  (needs a person looking at real frame rate).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 22,943 bytes | 24,090 bytes |
| `dist/single/index.iife.js` (single file build) | 53,001 bytes | 55,651 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

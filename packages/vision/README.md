# @hackbuild/vision

Get depth, objects, masks, landmarks and captions from an image or a webcam in your tab, through one models hub that shares the GPU with your scene.

[![npm](https://img.shields.io/npm/v/@hackbuild/vision)](https://www.npmjs.com/package/@hackbuild/vision) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 23.8 kB measured](https://img.shields.io/badge/gzip-23.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: Depth Anything V2 small on webgpu and wasm, the EfficientDet detector on a still frame, SmolVLM 256M and LFM2-VL 450M captions and SlimSAM point masks ran in one automated pass in Chrome 150 on an Apple M1 that nobody has looked at. The webcam landmarkers, the person segmenter, YOLO, and every other browser and device have not run.

## What it does

- Runs depth, detection, segmentation, face, hand and pose landmarks, captions and questions through the `@hackbuild/models` hub.
- Falls through a chain of landmark models when one fails, and says which failed.
- Keeps image embeddings so later point and box prompts on the same image skip the encoder, and gives mask operations and PNG, SVG and run length export.
- Runs depth in a worker and schedules calls around your render loop so the scene keeps its frames.
- Turns face and hand landmarks into steady presence, expression and gesture signals for a character.

## Install

```sh
npm install @hackbuild/vision
```

It depends on [@hackbuild/ai-env](../ai-env/README.md), [@hackbuild/models](../models/README.md), [@hackbuild/devices](../devices/README.md) and [@hackbuild/weights](../weights/README.md). The model runtimes are not bundled; they load at run time from pinned URLs, and each is optional:

| subpath | runtime | pin |
|---|---|---|
| `.` (depth, segment, caption, ask) | @huggingface/transformers, through `loadTransformers` from @hackbuild/devices | 4.3.2 |
| `.` (detect, segment.person, landmarks) | @mediapipe/tasks-vision, through `loadTasksVision` | 1.2.3 |
| `.` (YOLO, optional) | onnxruntime-web, through `loadOrt` from @hackbuild/devices | 1.27.0 |
| `.` (face fallback, optional) | face-api.js, a runtime you pass to `faceApiProvider` | unknown |

## Quick start

```ts
import { probe } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { createHub } from "@hackbuild/models";
import { attachVision, caption, depth, detect, loadTasksVision, mediapipeProvider } from "@hackbuild/vision";

// one hub; transformers.js and MediaPipe tasks-vision load at run time from pinned urls
const tjs = tjsProvider({ runtime: loadTransformers() });
const hub = createHub({ env: await probe() });
attachVision(hub, tjs); // the vision records plus the transformers.js loaders
hub.provide("tjs", tjs.factory);
hub.provide("mediapipe", mediapipeProvider({ runtime: loadTasksVision() }));

// each call loads its model on first use, runs it under the gpu lock, and releases it
const video = document.querySelector("video")!;
video.srcObject = await navigator.mediaDevices.getUserMedia({ video: true }); // the webcam
await video.play();
const map = await depth(hub, video); // Depth Anything V2 small, weights Apache-2.0
const boxes = await detect(hub, video, { scoreThreshold: 0.4 }); // MediaPipe EfficientDet lite0, Apache-2.0
const line = await caption(hub, video); // SmolVLM 256M, Apache-2.0
console.log(map.width, map.height, boxes.map((b) => b.label), line);
```

## Live example

The vision tool in the suite runs this package: [hackbuild-suite vision](https://hackbuild.github.io/hackbuild-suite/#/image/vision). The demo page runs Depth Anything, MediaPipe detection, SlimSAM masks and SmolVLM captions on a scene built in code, with the frame cost of each: [hackbuild-browser-ai/vision](https://hackbuild.github.io/hackbuild-browser-ai/vision/).

## Concepts

### wire it once

Make one hub, attach the vision records, and provide the runtimes you use. In stub mode every capability answers from `visionStubs()` with no weights.

```ts
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
```

Each call routes through the hub (`use`, `run`, `release`), so WebGPU models take the gpu lock and idle models fall out under the budget. VLM calls also go through one serial chain. Landmarks walk a fallback chain of records: MediaPipe GPU, MediaPipe CPU (both rungs of one record), then any other record for the same capability, such as face-api.js. The MediaPipe provider loads one wasm fileset per page and creates one task per record, with the GPU delegate on a webgl rung and the CPU delegate on a wasm rung.

### sharing the GPU with a scene

Every call takes `schedule` (passed to `hub.run`: `minIntervalMs`, `idleOnly`, `frameBudgetMs`, `when: "skip"`) and `size` or `maxMB` to route to a smaller model. Report frame times with `hub.reportFrame(ms)` and show `hub.onBusy` in the UI:

```ts
hub.onBusy((n) => (pill.textContent = n ? "model busy" : ""));
await depth(hub, frame, { size: "tiny", schedule: { minIntervalMs: 1200, frameBudgetMs: 20, when: "skip" } });
```

The schedule alone did not hold the scene's frames on an Apple M1 in Chrome 150, even with `frameBudgetMs` 20 and `minIntervalMs` 200; the frame times are in the verified table below. Running the model in a worker did: `depthWorker({ urls: transformersUrls(), device })` loads transformers.js and Depth Anything V2 small (Apache-2.0) in a dedicated worker and takes RGBA pixels, so pre and post processing, the readback and the normalization leave the page's thread. Only models of the registered depth records load in the worker, at their pinned commit, since Depth Anything base and large carry CC-BY-NC-4.0 weights; pass `record` for another model with its licence named.

```ts
const w = await depthWorker({ urls: transformersUrls(), device: "webgpu" });
paint(await w.estimate(ctx2d.getImageData(0, 0, 512, 288)));
```

`readbackLoop({ read, onFrame, maxHz })` is the agent eye pattern: an async readback (`readRenderTargetPixelsAsync`), a busy flag that skips frames instead of queueing them, and a rate cap (default 10 Hz).

### loop and cache

`perceptionLoop({ step, interval })` runs one step at a time beside the render loop; `detectCadenceMs(latency)` waits max(0.45 s, 4 times the last latency). `ResultCache` keeps results by key so a depth map is computed once per image. `depthToRgba` and `fitSize` help with canvases.

### prompts and the embedding cache

`segment` takes points (label 1 object, 0 background), a box, or both; with no prompt it routes to the person segmenter. The image is encoded once and every later prompt on it decodes from the cached embedding. Pass a stable `key` (an image hash) and your own `EmbeddingCache` to see and drop what is kept:

```ts
const cache = new EmbeddingCache(4);                 // four images, least recently used out
const opts = { key: imageHash, cache };
const [m] = await segment(hub, img, { box: { x: 40, y: 30, w: 200, h: 160 } }, opts);
const [n] = await segment(hub, img, { points: [{ x: 90, y: 80 }, { x: 120, y: 90, label: 0 }] }, opts);
cache.hits;                                          // 1, the second prompt did not encode
cache.delete(imageHash);
```

`promptSegmenter({ encode, decode })` builds the same cached segmenter around any encoder and decoder; scores come back clamped to 0 to 1.

### mask operations and export

Mask operations are functions on `Mask` (128 and up is inside): `maskUnion`, `maskIntersect`, `maskSubtract`, `maskInvert`, `maskThreshold`, `maskFeather(m, r)` (gaussian, sigma r / 2, soft edges), `maskDilate(m, r)` and `maskErode(m, r)` (a disc of radius r through an exact distance transform; the image border is not treated as outside), `maskLargestComponent(m, 8 | 4)` and `maskArea`.

Export: `maskToPng` (grey), `cutoutPng(pixels, mask)` (the image with the mask as alpha), `maskToSvg` (one even odd path along pixel edges, loops from `maskOutline`), `maskToRle` and `maskFromRle` (COCO style uncompressed run length, column major). `encodePng` deflates through CompressionStream where the runtime has it and writes stored blocks otherwise.

### segment everything, selection tools and auto masks

`segmentEverything(hub, image, { confidence, iou, minArea, sigmoid })` runs FastSAM-s once and returns every instance (box, score, area, mask), best first, after a class agnostic NMS (defaults 0.4 and 0.9, the FastSAM defaults). The decoder reads the box output and the 4D prototype output by rank, sums coefficients times prototypes, applies the sigmoid, crops to the box and maps back through the letterbox. `instanceAt(instances, x, y)` gives the smallest instance under a point, for hover and click picks. Asking for it adds the FastSAM record (AGPL-3.0 upstream) to the registry.

The selection rasterisers come from the hackbuild-ui mask tools on the `@hackbuild/vision/select` subpath (hackbuild-ui 0.10 is an optional peer there): `wandMask(px, x, y, tolerance, contiguous)`, `floodMask`, `lassoMask` and `polygonMask`, `rectMask`, `ellipseMask`, each returning a vision `Mask`, plus the raw `wandSelect`, `polygonFill`, `rectFill` and `ellipseFill`. `selectionToMask` and `maskToSelection` in the main entry convert between the two shapes.

```ts
import { wandMask } from "@hackbuild/vision/select";
const sel = wandMask(pixels, x, y, 18);           // 18 percent of the rgb cube, contiguous
const kept = maskUnion(current, sel);
```

No model auto modes, ported from the mask studio: `edgeMask(px, 50)` (Sobel on luma), `thresholdMask(px, 128)`, `autoThresholdMask(px)` (Otsu, returns the cut), `colourClusters(px, { k, rng })` with `clusterMask` (all but the largest cluster) and `clusterMasks` (one per cluster).

`exportInstances(pixels, instances)` returns the files of a per instance export: `instance_<n>_cutout.png` and `instance_<n>_mask.png`, cropped to each mask unless `crop: false`, and `instances.json` with every box, score, area and crop.

### perception signals and seen notes

`SignalTracker` turns per frame face and hand readings into steady signals and a few events: `arrived`, `left`, `smiled`, `gesture`. The clock comes in with each frame. Hands are optional; it runs on faces alone.

```ts
const tracker = new SignalTracker();
const notes = new SeenNotes();
const f = await landmarks(hub, "face", video, { timestamp: now });
const h = everyOther ? await landmarks(hub, "gesture", video, { timestamp: now }) : null;
for (const e of tracker.feed(rawFromLandmarks(f, h), now)) for (const r of reactionsFor(e, rng)) play(r);
const seen = notes.next(tracker.perception, wantsLook(text) ? await caption(hub, still) : null); // null when nothing changed
```

Thresholds are vendor figures, none measured here:

| threshold | value |
|---|---|
| presence grace | 2.5 s (vendor) |
| "left" after | 8 s (vendor) |
| "arrived" after time away | 20 s (vendor) |
| smile on, off, hold, cooldown | 0.55, 0.3, 500 ms, 10 s (vendor) |
| gesture hold, cooldown, score floor | 350 ms, 4 s, 0.6 (vendor) |
| wave | 2 wrist reversals inside 1.5 s above face level (vendor) |
| smile back reaction | after 600 ms at 0.7 chance (vendor) |
| `gazeTarget` gain | 1.3 (vendor) |

`DEFAULT_REACTIONS` is data, drawn from the injected rng. Frames never leave the tab; only the signals and the lowercase note do.

### yolo stays external

The YOLO decoder is written from the published output layouts ([1, 84, 8400] for YOLOv8, [1, 300, 6] end to end for YOLOv10, told apart by the dims); no Ultralytics code is used. YOLO is never registered by default: `yoloRecord({ url })` builds a record for a URL the app supplies, with a 640 letterbox and per class NMS at 0.45 keeping 13 boxes. `detectAt(hub, image, "n" | "s" | "m")` picks YOLOv10 nano, small or medium (`DETECT_SIZES`) and adds that record on first use; picking a size is the opt in to the AGPL-3.0 weights. NMS runs on the end to end output too.

## API overview

| export | what it does |
|---|---|
| [`attachVision`](../../docs/api/vision/index.md#attachvision) | register the vision records and transformers.js loaders on a hub |
| [`depth`](../../docs/api/vision/index.md#depth) | a depth map, 0 to 1 with larger nearer |
| [`detect`](../../docs/api/vision/index.md#detect) | boxes with labels and scores |
| [`detectAt`](../../docs/api/vision/index.md#detectat) | boxes from YOLOv10 at a chosen size, n, s or m |
| [`segmentEverything`](../../docs/api/vision/index.md#segmenteverything) | every instance in one FastSAM pass |
| [`instanceAt`](../../docs/api/vision/index.md#instanceat) | the instance under a point |
| [`edgeMask`](../../docs/api/vision/index.md#edgemask) | one of the no model auto masks; threshold, Otsu and clusters sit beside it |
| [`wandMask`](../../docs/api/vision/select.md#wandmask) | `@hackbuild/vision/select`: the hackbuild-ui wand, flood, lasso, polygon, rectangle and ellipse as vision masks |
| [`exportInstances`](../../docs/api/vision/index.md#exportinstances) | cutout and mask PNGs per instance plus a JSON of boxes |
| [`segment`](../../docs/api/vision/index.md#segment) | masks from points and a box, or a person mask |
| [`landmarks`](../../docs/api/vision/index.md#landmarks) | face, hand, pose or gesture landmarks through a fallback chain |
| [`caption`](../../docs/api/vision/index.md#caption) | a one sentence caption from a small VLM |
| [`ask`](../../docs/api/vision/index.md#ask) | a VLM's answer to a question about an image |
| [`mediapipeProvider`](../../docs/api/vision/index.md#mediapipeprovider) | the MediaPipe tasks-vision provider for the hub |
| [`depthWorker`](../../docs/api/vision/index.md#depthworker) | Depth Anything in a dedicated worker |
| [`perceptionLoop`](../../docs/api/vision/index.md#perceptionloop) | one perception step at a time beside a render loop |
| [`readbackLoop`](../../docs/api/vision/index.md#readbackloop) | rate capped async readback that skips frames while busy |
| [`ResultCache`](../../docs/api/vision/index.md#resultcache) | a small LRU of results by key |
| [`EmbeddingCache`](../../docs/api/vision/index.md#embeddingcache) | image embeddings kept for later prompts |
| [`maskUnion`](../../docs/api/vision/index.md#maskunion) | one of the mask operations; the rest sit beside it |
| [`cutoutPng`](../../docs/api/vision/index.md#cutoutpng) | the image with the mask as alpha, as a PNG |
| [`maskToSvg`](../../docs/api/vision/index.md#masktosvg) | the mask outline as an SVG path |
| [`maskToRle`](../../docs/api/vision/index.md#masktorle) | COCO style run length |
| [`SignalTracker`](../../docs/api/vision/index.md#signaltracker) | steady perception signals and events from face and hand frames |
| [`SeenNotes`](../../docs/api/vision/index.md#seennotes) | one lowercase line for a language model when the signals change |
| [`VISION_RECORDS`](../../docs/api/vision/index.md#vision_records) | the records `attachVision` registers |
| [`PICKER_RECORDS`](../../docs/api/vision/index.md#picker_records) | records for pickers, never registered by default |
| [`yoloRecord`](../../docs/api/vision/index.md#yolorecord) | an external YOLOv8n record for a URL you supply |
| [`visionStubs`](../../docs/api/vision/index.md#visionstubs) | weightless models for stub pages and tests |

The full reference is in [docs/api/vision](../../docs/api/vision/README.md).

## Models and weights

| capability | record | runtime | size | weight licence |
|---|---|---|---|---|
| depth | `depth-anything-v2-small` (`onnx-community/depth-anything-v2-small`) | transformers.js, fp16 then fp32 on webgpu, q8 then fp32 on wasm | 100 MB (inferred) | Apache-2.0 |
| detect | `efficientdet-lite0` (default) | MediaPipe, GPU then CPU delegate | 7 MB (inferred) | Apache-2.0 |
| detect | `yoloRecord({ url })`, optional and external | onnxruntime-web, 640 letterbox, per class NMS at 0.45, 13 boxes | unknown | AGPL-3.0 (Ultralytics), supplied by the app |
| segment (points) | `slimsam-77-uniform` (`Xenova/slimsam-77-uniform`) | transformers.js, one embedding per image | 38 MiB (vendor) | Apache-2.0 |
| segment.person | `selfie-segmenter` | MediaPipe | 1 MB (inferred) | Apache-2.0 |
| landmarks.face | `face-landmarker`, then `faceApiRecord(url)` | MediaPipe with blendshapes, then face-api.js tiny 68 points | 4 MB, 1 MB (inferred) | Apache-2.0; MIT |
| landmarks.hand, landmarks.pose | `hand-landmarker`, `pose-landmarker-lite` | MediaPipe | 8 MB, 6 MB (inferred) | Apache-2.0 |
| landmarks.gesture (optional) | `gesture-recognizer` | MediaPipe, hand points plus 7 canned gestures | 8 MB (inferred) | unknown, model card not checked |
| vision.caption, vision.ask | `smolvlm-256m-instruct` (`HuggingFaceTB/SmolVLM-256M-Instruct`) | transformers.js, per sub graph dtypes, repetition penalty 1.3 | 260 MB (inferred) | Apache-2.0 |
| vision.caption, vision.ask | `lfm2-vl-450m` (`onnx-community/LFM2-VL-450M-ONNX`) | transformers.js, q4f16 on webgpu only | 320 MB (inferred) | LFM Open License v1.0, commercial use limited by revenue |

MediaPipe models load from `MP_MODELS` (Google's MediaPipe model storage); transformers.js models load from the Hugging Face hub. Weights are never bundled; @hackbuild/weights caches the files read through it. `PICKER_RECORDS` lists models for pickers that no hub registers by default, so routing by capability keeps the small defaults above: SmolVLM 500M and SmolVLM2 256M video, Gemma 4 E2B, depth anything v2 base (CC-BY-NC-4.0) and v1 small, YOLOv10 nano, small and medium and FastSAM-s (AGPL-3.0 upstream), and the face swap set (scrfd 10g, ArcFace r50, inswapper 128; InsightFace, non-commercial). Their sizes are vendor figures from the Hugging Face file listings, taken without a download. A hub that runs one adds the record.

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| transformers.js models on WebGPU | a WebGPU adapter | yes, Chrome 150 on an Apple M1 (measured) | unknown | unknown | unknown |
| transformers.js models on WASM | WebAssembly | yes (inferred) | unknown | unknown | unknown |
| MediaPipe tasks | WebGL for the GPU delegate, wasm for the CPU one | yes (inferred) | unknown | unknown | unknown |
| LFM2-VL 450M | WebGPU, no wasm rung | yes, Chrome 150 on an Apple M1 (measured) | unknown | unknown | unknown |
| depth worker | a module or classic Worker | yes, Chrome 150 (measured) | unknown | unknown | unknown |
| threads | the probe's safe wasm thread count | from the probe | from the probe | from the probe | from the probe |

Without WebGPU the transformers.js ladders fall to wasm, and MediaPipe falls from the GPU delegate to the CPU one. LFM2-VL has no fallback.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `no face landmark model loaded: ID (ERROR); ...` | every record in the landmark chain failed; `failures` lists each | read `failures`; add `faceApiRecord(url)` as a fallback, or check the provider is registered |
| `maskUnion: masks are W x H and W2 x H2` (and the other two mask operations) | masks of different sizes | resize one mask to the other first |
| `cutoutRgba: image is W x H, mask W2 x H2` | image and mask differ in size | pass the mask made from this image |
| `encodePng: N bytes for W x H x C` | data shorter than width times height times channels | pass the full buffer |
| `maskFromRle: counts cover N pixels of M` | the run length does not match its size | check `size` is `[height, width]` |
| `a prompt needs at least one point or a box` | a prompted segmenter got an empty prompt | pass points or a box, or call `segment` with no prompt for a person mask |
| `ID: no mediapipe task for CAPABILITY` | the record's capability has no MediaPipe task | use detect, segment.person or a landmarks capability |
| `ID: a mediapipe record needs source.url` | the record names no model file | set `source.url` |
| `the transformers.js module has none of NAMES` | the runtime lacks the model class | use the pinned transformers.js 4.3.2 |
| `depth pipeline returned neither predicted_depth nor depth` | the pipeline gave another output | use a depth-estimation model |
| `depth worker: ID is not a registered depth record; pass record with its licence named` | `modelId` is not one of the depth records | pass `record` with its licence |
| `depth worker is not loaded` / `no transformers.js url loaded` | the worker could not import transformers.js | check the `urls`; use `transformersUrls()` |

## Works with

- [@hackbuild/models](../models/README.md) is the hub every call routes through.
- [@hackbuild/devices](../devices/README.md) gives the transformers.js and ort providers and the pinned runtime loaders.
- [@hackbuild/weights](../weights/README.md) caches the weights the providers read.
- [@hackbuild/depth-mesh](../depth-mesh/README.md) turns a depth map or a mask into a relief solid you can print.
- [@hackbuild/media](../media/README.md) picks keyframes from a video for `caption`.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weight licences: Depth Anything V2 small, MediaPipe models, SlimSAM and SmolVLM, Apache-2.0; face-api.js tiny nets, MIT; LFM2-VL, LFM Open License v1.0; YOLO, AGPL-3.0 (external, supplied by the app); the gesture recognizer, unknown.

## What is verified, and what is not

- Signals: the tracker's rules (noise, smile hold and cooldown, presence grace, left and arrived, wave and low hand, gesture score floor) and the seen note run in unit tests on synthetic frames. Not tuned against a live camera in this repository.

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/vision` under Node 22.18.0 with fake runtimes: licences on every record and YOLO kept external, every capability in stub mode, depth normalization from predicted_depth and from the 8 bit image, the depth record walking fp16 to fp32 through the transformers.js provider, the MediaPipe provider falling from the GPU to the CPU delegate and mapping detections, masks, hands and blendshapes, the face fallback to face-api.js after the MediaPipe record fails, YOLO letterbox, decode and NMS, an external YOLO record through an ort model, VLM questions serialized on one chain, SlimSAM embedding an image once for several prompts, the loop's busy guard and interval, the LRU cache, schedule options reaching the hub (interval wait, skip, frame budget skip) with routing to a smaller model and busy reports, and the readback loop's rate cap and busy skips | passes 15 tests (19 on 2026-11-23) |
| 2026-11-23 | Chrome 150 on an Apple M1, the vision page (#35), frame p50 / p95 beside depth; unit tests run the worker source on the inline rung with a fake transformers.js module | scene alone 16.7 / 18.3 ms; depth on the main thread 16.7 / 49.9 unscheduled and 16.7 / 49.8 with the frame budget; depth in the worker on webgpu 16.7 / 18.3 (22 runs in 6 s, 280 ms p50), with a 200 ms gap 16.7 / 18.3, on wasm 16.7 / 18.2 (4,664 ms per run); no main thread task over 50 ms in any mode (measured) |
| 2026-11-23 | LFM2-VL 450M (LFM Open License v1.0) loads and captions on webgpu after the images first processor fix | load 8,743 ms, caption 4,671 ms, the caption names the cube and the scene (measured) |
| 2026-11-25 | `npx vitest run packages/vision`: the YOLOv10 end to end decode with NMS, `detectAt` adding the picked size and running a fake ort model, the FastSAM decode of synthetic prototypes through the letterbox and the hub, `instanceAt`, the hackbuild-ui rasteriser wrappers, the edge, threshold, Otsu and seeded k-means masks, and the per instance export | passes 50 tests |
| 2026-11-24 | `npx vitest run packages/vision`: one encode for point, negative point and box prompts on one image, shared encodes in flight, failed encodes dropped, least recently used eviction, SlimSAM fed `input_boxes` and negative labels from one embedding, a box prompt routed through the hub to the stub, union, subtract, invert, a radius 3 dilate, erode keeping the border, feather, largest piece at 4 and 8 connectivity, PNG grey and alpha read back through zlib, the SVG outline of a square and a ring, and the run length round trip | passes 30 tests; the radius 3 dilate gives 29 pixels (computed) |

### Not verified by anything

- Any model in a browser beyond the automated pass: tasks-vision 1.2.3 task
  options and result shapes, transformers.js 4.3.2 SmolVLM, LFM2-VL and
  SlimSAM class names and processor calls (box prompts through
  `input_boxes` included), a real YOLOv8n export's output
  name and layout.
- FastSAM and YOLOv10: the decoders run in unit tests on synthetic
  outputs only. The output names, the prototype layout of the
  `anakhiu/fastsam-onnx` export and the YOLOv10 end to end layout of the
  onnx-community exports are inferred from the published architectures;
  no real export has been run here.
- Accuracy and speed of every model: no numbers taken.
- Whether the frame budget and idle waits remove stutter in a real scene
  (needs a person looking at real frame rate).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 23,813 bytes | 25,003 bytes |
| `dist/single/index.iife.js` (single file build) | 54,219 bytes | 56,929 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

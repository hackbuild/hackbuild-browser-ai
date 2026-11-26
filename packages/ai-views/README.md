# @hackbuild/ai-views

Put a model picker, a chat, a transcriber, a mask studio or a camera frame on your page, drawn with the hackbuild-ui stylesheet, as custom elements or Vue components.

[![npm](https://img.shields.io/npm/v/@hackbuild/ai-views)](https://www.npmjs.com/package/@hackbuild/ai-views) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 20.1 kB measured](https://img.shields.io/badge/gzip-20.1%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no model run of this package has been verified in a real browser yet.

## What it does

- Gives each job (chat, speech to text, vision, detector, masks, image, voice, depth, embed, face swap, landmarks) a model picker whose rows say whether a model fits this machine and why not.
- Keeps the state behind every view in node safe objects: a pick, a jobs rack, a chat thread and list, a transcribe queue.
- Draws the views in light DOM with the page's hackbuild-ui stylesheet and never styles locally.
- Ships every view as a mount function, a custom element and a Vue 3 component, all on one code path.
- Replaces @hackbuild/ai-elements.

## Install

```sh
npm install @hackbuild/ai-views @virgilvox/hackbuild-ui
```

@virgilvox/hackbuild-ui is a required peer; the page also loads its stylesheet. Vue is an optional peer, needed only for the `/vue` entry.

| subpath | runtime | pin |
|---|---|---|
| `.` | none; node safe state | none |
| `./elements` | @virgilvox/hackbuild-ui (peer) | `>=0.10.0 <0.11.0` |
| `./vue` | vue (optional peer) and @virgilvox/hackbuild-ui | vue `^3.4.0` |

Model runtimes are never imported here. A picker loads only through the loader you pass, such as `weightsLoader(store)` or your own that starts a runtime.

## Quick start

```ts
import { importEsm } from "@hackbuild/ai-env";
import { ALL_RECORDS, chatThread, useModelPick, weightsLoader } from "@hackbuild/ai-views";
import { mountChatPane, mountComposer, mountModelSelect } from "@hackbuild/ai-views/elements";
import { loadWllama, wllamaUrls, type WllamaModule } from "@hackbuild/chat/wllama";
import { openWeightStore } from "@hackbuild/weights";

// a chat picker over the GGUF rows, files through the weight store; Qwen2.5 0.5B Instruct weights are Apache-2.0
const fetchFiles = weightsLoader(await openWeightStore());
const wllama = await importEsm<WllamaModule>(wllamaUrls().esm); // the runtime is passed in, never bundled
const thread = chatThread({ system: "answer in one line." });
const pick = useModelPick("chat", {
  records: ALL_RECORDS.filter((r) => r.provider === "wllama"), chosen: "qwen2.5-0.5b-instruct-gguf",
  loader: async (rec, ctx) => thread.setEngine(await loadWllama({ module: wllama, blobs: [...((await fetchFiles(rec, ctx)) as Map<string, Blob>).values()] })),
});

// the picker, the turns and the composer, drawn with the page's hackbuild-ui stylesheet
mountModelSelect(document.querySelector<HTMLElement>("#model")!, pick);
mountChatPane(document.querySelector<HTMLElement>("#chat")!, thread);
mountComposer(document.querySelector<HTMLElement>("#composer")!, thread);
```

## Live example

The view demo pages run every view on stub providers with no weights: [hackbuild-browser-ai/views](https://hackbuild.github.io/hackbuild-browser-ai/views/). The package page is at [hackbuild-browser-ai/ai-views](https://hackbuild.github.io/hackbuild-browser-ai/ai-views/).

## Concepts

### three entries

`@hackbuild/ai-views` is node safe: `JOBS`, `jobRecords(job)`, `rowOf` (a record as a hackbuild-ui ModelRow), `useModelPick(job)`, `useJobsPick(jobs, presets)`, `weightsLoader(store)`, `weightsRemover(store)`, `defaultPick`, `chatThread`, `chatList`, `contextSegments`, `transcribeQueue`, the frame geometry and `traceRows`. `@hackbuild/ai-views/elements` holds the mount functions and `define()`. `@hackbuild/ai-views/vue` holds `ModelSelect`, `ModelJobs`, `ChatPane`, `Composer`, `ChatList`, `ContextMeter`, `MemoryInspector`, `TranscribeDrop`, `TranscriptView`, `TranscribeQueue`, `MaskStudio`, `MaskTools`, `MaskVerbs`, `MaskRack`, `FrameView` and `CameraFeed`; only this entry imports Vue.

### custom elements

Nothing registers on import. `define()` registers the elements bare, and `define("hb")` gives `<hb-model-select>` and so on; names already defined are left alone. Each element carries `.hb-view` (display contents), so a layout region of hackbuild-ui places its parts. A `for` attribute names the element whose state a part binds to:

```html
<model-select job="chat" variant="chip"></model-select>
<chat-pane id="chat"></chat-pane> <chat-composer for="chat"></chat-composer>
<transcribe-drop id="t"></transcribe-drop> <transcript-exports for="t"></transcript-exports>
<mask-studio id="m"></mask-studio> <mask-tools for="m"></mask-tools>
<frame-view id="f"></frame-view> <camera-feed for="f"></camera-feed>
```

Set `engine` on `<chat-pane>` to a @hackbuild/chat engine, or `pick`, `env`, `loader` and `records` on `<model-select>`. `<model-select>` fires `choose`, then `loaded` and `failed` once per load.

### vue

Each component mounts the same function the custom element does, on a host that shows as `.hb-view`; props in, events out. `ModelSelect` emits `pick`, `choose`, `loaded` and `failed`; `MaskStudio` emits `studio`, `FrameView` emits `view` and `CameraFeed` emits `feed` and `frame`, each handing over the mounted object.

```ts
import { ModelSelect, ChatPane, Composer } from "@hackbuild/ai-views/vue";
import { chatThread } from "@hackbuild/ai-views";
const thread = chatThread({ engine });
// <ModelSelect job="chat" variant="chip" /> <ChatPane :thread="thread" /> <Composer :thread="thread" />
```

### picks and loaders

A pick loads only through its loader (none is an error the row shows), runs it for every row, a no download row included, and keeps its result on `snapshot().loaded`; `remove()` deletes through `onRemove`. It starts on the first "start here" record that fits, else the first fast or steady one. `weightsLoader(store)` fetches a record's files through @hackbuild/weights; a record that loads through its runtime (WebLLM, MediaPipe and the like) takes `jobLoader(job)`. `useJobsPick` joins pickers as a rack with a line per job, presets with their download totals, and load all.

### real loads

`jobLoader(job, { store?, env?, allowGplPhonemizer? })` is the loader a page passes to `useModelPick(job, { loader })`. A load imports the runtime from its pinned CDN only when the person presses load, fetches weights through @hackbuild/weights where the runtime does not fetch its own, sends progress to the row, stops on the row's stop, and fails in plain words. One models hub serves every loader made with the same options object. Probe the machine with `probe()` from @hackbuild/ai-env and pass it to the pick as `env`.

| job | resolves to | runtimes |
|---|---|---|
| chat | a @hackbuild/chat `ChatEngine` | WebLLM, wllama (gguf through the weight store), transformers.js, the browser's built in model |
| transcribe | a `Transcriber` for TranscribeDrop | whisper on transformers.js, the dsp core inlined |
| detect | `(image) => FrameBox[]` | MediaPipe EfficientDet, YOLO on onnxruntime web |
| masks | `MaskModels`: click segment, and segment everything from a 4 by 3 grid of points | SlimSAM on transformers.js; FastSAM is refused until it has a decoder |
| depth | `(image) => { width, height, data }`, 0 to 1, larger is nearer | Depth Anything on transformers.js |
| vision | `(image, question?) => string`, a caption without a question | SmolVLM, LFM2-VL, Gemma on transformers.js |
| image | an imagegen `ImageGenerator` with its CLIP `tokenize` and `make(form)` | onnxruntime web; the tokenizer on transformers.js |
| voice | a loaded @hackbuild/speak `Engine` | the system voice (no download), bellows, pocket tts, kokoro (gpl phonemizer, opt in) |
| embed | an @hackbuild/embed `Embedder` | static potion files, transformers.js |

The bar chip shows the name cut short (`shortName`: "hermes 3 llama 3.2 3b" reads "hermes 3 3b") and the size, then the state once a load moves; the full name is its label.

### views

| view | element | what it does |
|---|---|---|
| ModelSelect | `<model-select job variant go>` | one line with the choice and one pink "load, size"; the bar chip; a sheet with search, the fits, uncensored and no download filters, groups, the row detail and the "your own" forms. `<model-jobs jobs>` (properties `env`, `loader`, `records`, `presets`) gives a line per job, presets with totals and "load all" |
| ChatPane, Composer | `<chat-pane>`, `<chat-composer for>`, `<chat-list for>`, `<chat-context for budget>` | the thread, reasoning in a fold, memory used per reply, copy and redo on the last reply; the chats list (new, open, rename, delete) and the context meter; Enter sends, Shift Enter adds a line, Escape stops |
| TranscribeDrop, TranscriptView | `<transcribe-drop>`, `<transcript-view for>`, `<transcribe-queue for>`, `<transcript-exports for>` | the drop zone becomes the transcript; a queue of files; lines with their time, edit in place with undo; txt, srt, vtt, json |
| MaskStudio | `<mask-studio>`, `<mask-tools for>`, `<mask-verbs for>`, `<mask-rack for part>` | click segment, wand, brush, eraser, lasso, polygon, rectangle, ellipse, flood, pan (the hackbuild-ui mask editor's tools), segment everything, smooth, expand, shrink, saved masks, undo, zoom; `mask()` gives ImageData and `exportAs()` a png Blob |
| FrameView, CameraFeed | `<frame-view>`, `<camera-feed for>` | boxes with word and score, landmarks, a count and the caption over a frame; the camera at a set rate |
| memory inspector | `<memory-inspector>` | one row per fused recall candidate, the used ones marked |

### jobs and records

Jobs and their records: chat (the chat rows of the @hackbuild/models catalogue), speech to text (six records), vision language (SmolVLM 256M and 500M, SmolVLM2 256M video, LFM2-VL 450M, Gemma 4 E2B), detector (EfficientDet lite0, YOLOv10 n, s and m), masks (SlimSAM, FastSAM-s), image (SD-Turbo, SD 1.5, and SDXL-Turbo greyed as not run yet), voice (Kokoro, Pocket TTS, the vocal tract, the system voice), depth, embed, landmarks and face swap (scrfd, ArcFace, inswapper). The records come from the packages that run them; a record listed in more than one place counts once. Every record carries its weight licence; the non commercial ones are marked in the picker.

## API overview

| export | what it does |
|---|---|
| [`useModelPick`](../../docs/api/ai-views/index.md#usemodelpick) | a model picker for one job |
| [`useJobsPick`](../../docs/api/ai-views/index.md#usejobspick) | pickers for several jobs as one rack |
| [`weightsLoader`](../../docs/api/ai-views/index.md#weightsloader) | a loader that fetches files through a weight store |
| [`jobLoader`](../../docs/api/ai-views/index.md#jobloader) | the real loader of a job: runtime and weights at load time |
| [`chatThread`](../../docs/api/ai-views/index.md#chatthread) | a chat thread over an engine |
| [`chatList`](../../docs/api/ai-views/index.md#chatlist) | several chats, one open |
| [`transcribeQueue`](../../docs/api/ai-views/index.md#transcribequeue) | a queue of files to transcribe, with edits and exports |
| [`JOBS`](../../docs/api/ai-views/index.md#jobs) | every job's words and capability test |
| [`ALL_RECORDS`](../../docs/api/ai-views/index.md#all_records) | every record the views know |
| [`rowOf`](../../docs/api/ai-views/index.md#rowof) | a record as one picker row |
| [`define`](../../docs/api/ai-views/elements.md#define) | register the custom elements |
| [`mountModelSelect`](../../docs/api/ai-views/elements.md#mountmodelselect) | the picker on a host |
| [`mountChatPane`](../../docs/api/ai-views/elements.md#mountchatpane), [`mountComposer`](../../docs/api/ai-views/elements.md#mountcomposer) | the turns and the message box |
| [`mountTranscribeDrop`](../../docs/api/ai-views/elements.md#mounttranscribedrop) | the drop zone that becomes the transcript |
| [`mountMaskStudio`](../../docs/api/ai-views/elements.md#mountmaskstudio) | the mask studio |
| [`mountFrameView`](../../docs/api/ai-views/elements.md#mountframeview), [`mountCameraFeed`](../../docs/api/ai-views/elements.md#mountcamerafeed) | a frame with results drawn over it, and the camera |
| [`ModelSelect`](../../docs/api/ai-views/vue.md#modelselect), [`ChatPane`](../../docs/api/ai-views/vue.md#chatpane) and the other components | the views as Vue components |

The full reference is in [docs/api/ai-views](../../docs/api/ai-views/README.md).

## Models and weights

This package runs no model; it lists records and loads them through the loader you pass. Weights are never bundled; `weightsLoader(store)` fetches them from the host in the table and @hackbuild/weights caches them. The 40 chat records are listed in [@hackbuild/models](../models/README.md#models-and-weights). Sizes are MiB of download; the source word is in each cell. Licences are as recorded on each record; several are non commercial or AGPL-3.0, and the picker marks them.

| model | id | size, MiB (source word in the cell) | licence | loads from |
|---|---|---|---|---|
| whisper large-v3-turbo | `whisper-large-v3-turbo` | 1534 (vendor) | MIT | Hugging Face `onnx-community/whisper-large-v3-turbo`, transformers.js |
| whisper base | `whisper-base` | 77 (vendor) | MIT | Hugging Face `onnx-community/whisper-base`, transformers.js |
| whisper small.en | `whisper-small.en` | 238 (vendor) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Hugging Face `Xenova/whisper-small.en`, transformers.js |
| whisper base.en | `whisper-base.en` | 90 (inferred) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Hugging Face `Xenova/whisper-base.en`, transformers.js |
| whisper tiny.en | `whisper-tiny.en` | 39 (vendor) | MIT (the OpenAI Whisper release; the Xenova ONNX card says apache-2.0) | Hugging Face `Xenova/whisper-tiny.en`, transformers.js |
| moonshine base | `moonshine-base` | 60 (vendor) | MIT (english models, per the model card; check before use) | Hugging Face `onnx-community/moonshine-base-ONNX`, transformers.js |
| depth anything v2 small | `depth-anything-v2-small` | 100 (inferred) | Apache-2.0 | Hugging Face `onnx-community/depth-anything-v2-small`, transformers.js |
| mediapipe efficientdet lite0 (coco, 80 classes) | `efficientdet-lite0` | 7 (inferred) | Apache-2.0 | `storage.googleapis.com`, MediaPipe |
| mediapipe selfie segmenter | `selfie-segmenter` | 1 (inferred) | Apache-2.0 | `storage.googleapis.com`, MediaPipe |
| mediapipe face landmarker with blendshapes | `face-landmarker` | 4 (inferred) | Apache-2.0 | `storage.googleapis.com`, MediaPipe |
| mediapipe hand landmarker | `hand-landmarker` | 8 (inferred) | Apache-2.0 | `storage.googleapis.com`, MediaPipe |
| mediapipe gesture recognizer (7 canned gestures) | `gesture-recognizer` | 8 (inferred) | unknown, check the mediapipe model card | `storage.googleapis.com`, MediaPipe |
| mediapipe pose landmarker lite | `pose-landmarker-lite` | 6 (inferred) | Apache-2.0 | `storage.googleapis.com`, MediaPipe |
| slimsam 77 uniform (point prompts) | `slimsam-77-uniform` | 38 (vendor) | Apache-2.0 | Hugging Face `Xenova/slimsam-77-uniform`, transformers.js |
| smolvlm 256m | `smolvlm-256m-instruct` | 260 (inferred) | Apache-2.0 | Hugging Face `HuggingFaceTB/SmolVLM-256M-Instruct`, transformers.js |
| lfm2-vl 450m | `lfm2-vl-450m` | 320 (inferred) | LFM Open License v1.0 | Hugging Face `onnx-community/LFM2-VL-450M-ONNX`, transformers.js |
| smolvlm 500m | `smolvlm-500m-instruct` | 463 (vendor) | Apache-2.0 | Hugging Face `HuggingFaceTB/SmolVLM-500M-Instruct`, transformers.js |
| smolvlm2 256m video | `smolvlm2-256m-video-instruct` | 252 (vendor) | Apache-2.0 | Hugging Face `HuggingFaceTB/SmolVLM2-256M-Video-Instruct`, transformers.js |
| depth anything v2 base | `depth-anything-v2-base` | 186 (vendor) | CC-BY-NC-4.0 (the model card's licence field) | Hugging Face `onnx-community/depth-anything-v2-base`, transformers.js |
| depth anything v1 small | `depth-anything-small-v1` | 48 (vendor) | Apache-2.0 (the upstream card; this export's card has no licence field) | Hugging Face `Xenova/depth-anything-small-hf`, transformers.js |
| gemma 4 e2b | `gemma-4-e2b-vision` | 3566 (vendor) | Apache-2.0 (the model card's licence field) | Hugging Face `onnx-community/gemma-4-E2B-it-ONNX`, transformers.js |
| yolov10 nano | `yolov10n` | 9 (vendor) | AGPL-3.0 (Ultralytics weights, the model card's licence field) | Hugging Face `onnx-community/yolov10n`, `onnx/model.onnx`, onnxruntime-web |
| yolov10 small | `yolov10s` | 28 (vendor) | AGPL-3.0 (Ultralytics weights, the model card's licence field) | Hugging Face `onnx-community/yolov10s`, `onnx/model.onnx`, onnxruntime-web |
| yolov10 medium | `yolov10m` | 59 (vendor) | AGPL-3.0 (Ultralytics weights, the model card's licence field) | Hugging Face `onnx-community/yolov10m`, `onnx/model.onnx`, onnxruntime-web |
| fastsam s | `fastsam-s` | 45 (vendor) | AGPL-3.0 upstream (Ultralytics FastSAM); the export's card says apache-2.0 | Hugging Face `anakhiu/fastsam-onnx`, `fastsam_s.onnx`, onnxruntime-web |
| face finder (scrfd 10g) | `scrfd-10g` | 16 (vendor) | InsightFace model pack: non-commercial research only (the buffalo_l pack terms) | Hugging Face `immich-app/buffalo_l`, `detection/model.onnx`, onnxruntime-web |
| face id (arcface r50) | `arcface-w600k-r50` | 166 (vendor) | InsightFace model pack: non-commercial research only (the buffalo_l pack terms) | Hugging Face `immich-app/buffalo_l`, `recognition/model.onnx`, onnxruntime-web |
| face swap (inswapper 128) | `inswapper-128` | 529 (vendor) | InsightFace: non-commercial research only; the mirror's card says gpl-3.0 | Hugging Face `hacksider/inswapper_128`, `inswapper_128.onnx`, onnxruntime-web |
| kokoro 82m | `kokoro-82m` | 310 (vendor) | Apache-2.0 (weights); the kokoro-js runtime phonemizes with eSpeak NG, GPL-3.0-or-later, loaded at run time and opt in | Hugging Face `onnx-community/Kokoro-82M-v1.0-ONNX`, kokoro-js |
| pocket tts | `pocket-tts` | 189 (inferred) | CC-BY-4.0 (weights), MIT (code) | Hugging Face `kyutai/pocket-tts`, the Pocket TTS worker |
| bellows voice | `bellows-voice` | 0 (vendor) | none, no weights (code MIT) | nothing to download, the vocal tract code |
| system voice | `web-speech` | 0 (vendor) | system voices, the platform's terms | nothing to download, the system voice |
| sd-turbo 512 | `sd-turbo` | 2397 (vendor) | Stability AI Non-Commercial Research Community License (the LICENSE in schmuell/sd-turbo-ort-web; upstream stabilityai/sd-turbo moved to the Community License in July 2024, this export did not) | Hugging Face `schmuell/sd-turbo-ort-web`, onnxruntime-web |
| stable diffusion 1.5 | `sd-1.5` | 1969 (vendor) | CreativeML OpenRAIL-M (use restrictions in its attachment A) | Hugging Face `microsoft/stable-diffusion-v1.5-webnn`, onnxruntime-web |
| sdxl-turbo 512 (listed, not run yet) | `sdxl-turbo` | 2548 (vendor) | Stability AI Community License (named in the card text; the repo has no licence field) | Hugging Face `webnn/sdxl-turbo`, onnxruntime-web |
| potion base 8M (static) | `potion-base-8m` | 30 (inferred) | MIT | Hugging Face `minishlab/potion-base-8M`, the static embedder |
| all-MiniLM-L6-v2 | `minilm-l6` | 23 (inferred) | Apache-2.0 | Hugging Face `Xenova/all-MiniLM-L6-v2`, transformers.js |
| bge-small-en-v1.5 | `bge-small-en` | 32 (vendor) | MIT | Hugging Face `Xenova/bge-small-en-v1.5`, transformers.js |
| face-api tiny landmarks (68 points) | `face-api-tiny` | 1 (inferred) | MIT | `cdn.jsdelivr.net`, face-api |
| all-minilm-l6-v2 | `all-minilm-l6-v2` | 23 (inferred) | Apache-2.0 | Hugging Face `Xenova/all-MiniLM-L6-v2`, transformers.js |
| htdemucs-fast | `htdemucs-fast` | 166 (inferred) | MIT | Hugging Face `StemSplitio/htdemucs-onnx`, `htdemucs_fp16weights.onnx`, onnxruntime-web |

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| state (`.` entry) | nothing | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| custom elements | `customElements` | yes (measured, headless) | yes (inferred) | yes (inferred) | yes (inferred) |
| Vue components | Vue 3.4 or later | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| CameraFeed | `getUserMedia` on a secure page | unknown | unknown | unknown | unknown |
| mask drawing by touch | pointer events | unknown | unknown | unknown | unknown |

No WebGPU or wasm here; the model you load brings its own needs, and its row says when it cannot run. The headless smoke runs the demo pages on stub providers; no real model has run through a view (see below).

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `no loader for <id>: pass one to useModelPick, such as weightsLoader(store)` | a pick has no loader | pass `loader` to `useModelPick`, or set `loader` on `<model-select>` |
| `<model> loads through its runtime. the page passes a loader for it.` | `weightsLoader` got a record with no files to fetch (WebLLM, MediaPipe and the like) | pass a loader that starts that runtime |
| `this needs a model. pick one in the bar and load it.` (a reply, `NO_ENGINE`) | the thread has no engine | load a model and call `thread.setEngine`, or set `engine` on `<chat-pane>` |
| `no speech model loaded. pick one and load it.` (a failed file) | `<transcribe-drop>` has no transcriber | set its transcriber from @hackbuild/transcribe |
| `no custom elements in this environment` | `define()` ran without `customElements` or `HTMLElement` | call it on a page, or pass a registry and a base class |
| `the image did not load: ...`, `the cut failed: ...`, `segment everything failed: ...` (studio state) | the image or a segment model failed | read the message; check the model loaded |

## Works with

- [@hackbuild/models](../models/README.md) supplies the records, fit words and budget behind every picker row.
- [@hackbuild/weights](../weights/README.md) fetches and caches the files through `weightsLoader(store)` and deletes them through `weightsRemover(store)`.
- [@hackbuild/chat](../chat/README.md) gives the engine a chat thread streams from.
- [@hackbuild/transcribe](../transcribe/README.md) gives the transcriber a transcribe queue runs, and the txt, srt, vtt and json writers.
- [@hackbuild/memory](../memory/README.md) gives the recall the memory inspector shows.
- [@hackbuild/vision](../vision/README.md), [@hackbuild/speak](../speak/README.md), [@hackbuild/embed](../embed/README.md) and [@hackbuild/imagegen](../imagegen/README.md) supply the records of their jobs.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights ship here. Each record names its weight licence in the table above, among them Apache-2.0, MIT, CC-BY-NC-4.0, AGPL-3.0 (YOLOv10, FastSAM), the InsightFace non-commercial research terms, the Stability AI licences and CreativeML OpenRAIL-M. The quick start loads Qwen2.5 0.5B Instruct GGUF, weights Apache-2.0.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-25 | `npx vitest run packages/ai-views` | pass: every job has the records above with a speed word and a verdict; rows carry size, memory, backend, marks, detail and options, and a row that does not fit names why; a pick loads with progress, cancels and keeps a failure's words; presets total their download; the chat thread streams with the reasoning apart and memory used; the queue runs, edits with undo and exports; the frame mapping crops and mirrors; define registers every element |
| 2026-11-25 | `node tools/smoke-views.mjs`, headless | pass: one smoke per demo page on stub providers with no weights |
| 2026-11-25 | `npx vitest run packages/ai-views/test/loaders.test.ts` | pass: jobLoader loads a transformers.js chat model and a depth model through fake runtime modules, a WebLLM model through a fake module, refuses kokoro without the opt in and FastSAM in plain words, stops on abort, imports nothing before a load, makes no network request; the chip cuts a name and shows its size |

### Not verified by anything

- A real model through jobLoader or any view in this package: tests use fake runtime modules and the demos stubs; no weights were fetched. The transcribe, detect, masks, vision, image, voice and embed paths of jobLoader have no test of their own yet.
- Touch drawing on a phone.
- Screen readers.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 20,078 bytes | 21,081 bytes |
| `dist/single/elements.iife.js` (single file build) | 95,538 bytes | 100,314 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

# Checks that need a real browser or model

Every row below needs a real browser, a real model, or both. Unit tests
with fakes cover the logic around each one (see each package README).

First pass: 2026-11-23, Chrome 150.0.7871.125 driven by puppeteer-core
with a visible window on an Apple M1 under macOS 12, the real GPU (WebGL
renderer ANGLE Metal, Apple M1; WebGPU adapter vendor apple, architecture
common-3, with shader-f16). The pages are the ones in `examples/`, run by
`npm run examples:check`; each page under `?auto` records its result.
Downloads over about 300 MB were not run, except Kokoro on webgpu fp32 (about 326 MB, inferred; row 42). Who looked: the automated pass
measured everything below; the owner has not looked at any page yet.

Counted over the 57 rows: 18 pass, 0 fail, 39 not run (a row counts as
pass when the part that ran passed; the cell says what did not run).
Rerun on 2026-11-23 after the fixes below, same machine and browser:
the speak, audio-dsp and vision pages (rows 26, 29, 31, 35, 42, 44 and
the new 57); the other rows are from the first pass. Rows 58 to 60
are the shared origin check of 2026-11-24 (`npm run check:origin`,
headless, stub bytes only): 2 pass, 1 fail. Rerun again after
the audit fixes on 2026-11-23: the devices and speak pages (rows 1, 5,
7, 24, 42, 44 and 57).

| # | package | check | needs | status |
|---|---|---|---|---|
| 1 | ai-env | `probe()` fields in Chrome, Safari and Firefox over https and from file:// | browsers | pass in Chrome over http and on the https site (the check accepted http only until 2026-11-23); Safari, Firefox and file:// not run |
| 2 | ai-env | a module blob worker refused on file:// in Chrome, and the ladder landing on classic-blob | Chrome, file:// page | not run: no page for it in this pass |
| 3 | ai-env | `importEsm` of the wllama 4.0.0 and 3.8.1 ESM builds from file:// through Blob and `data:` URLs | Chrome, network | not run: no page for it in this pass |
| 4 | weights | OPFS, Cache Storage and IndexedDB part stores with a file over 2 GB | Chrome, Safari, disk space | not run: needs a file over 2 GB |
| 5 | weights | resume against Hugging Face's CDN: does it answer `Range` plus `If-Range` with 206 | browser, network | pass: 206 for `bytes=5015811-` after a stop (rerun 2026-11-23). The CDN also answers 206 to a stale If-Range, so a 206 proves only that ranges work; the store now compares the 206 ETag and starts over when it differs (unit tests) |
| 6 | weights | `transformersCache` as transformers.js 4.3.2 `env.customCache` | browser, transformers.js | not run: the pages use transformers.js's own cache |
| 7 | weights | SHA-256 throughput on the main thread and in a worker | browser | pass on the main thread, 149 MB/s (measured, rerun 2026-11-23; first pass 88), digest equal to Web Crypto's; the check could not fail before 2026-11-23; the worker half not run |
| 8 | models | each `CATALOG` ladder loads on its first rung, or falls to the next with a named error | WebGPU and non WebGPU machines, every catalog model (licences in the record) | not run for the whole catalog; the rungs taken by the pages are listed below |
| 9 | models | `classifyError` patterns against current WebLLM 0.2.89, onnxruntime-web 1.31 and transformers.js 4.3.2 messages | browsers, models | not run |
| 10 | models | two webgpu models under the hub's gpu lock with no device lost | WebGPU machine, two models | not run: the vision page runs its models one after another, not two at once |
| 11 | chat | WebLLM 0.2.84 and 0.2.89 stream, json_object plus schema, context ladder | WebGPU, an MLC model (Qwen2.5 0.5B, Apache-2.0) | pass for 0.2.84 and 0.2.89: stream, json_object plus schema parsed, ladder settled at 4096 |
| 12 | chat | wllama 4.0.0 and 3.8.1 load a GGUF Blob from the IndexedDB store, stream, json_schema | browser, a GGUF (Qwen2.5 0.5B Instruct Q4_K_M, Apache-2.0) | not run: the Q4_K_M GGUF is 398 MB (vendor), over this pass's download limit |
| 13 | chat | transformers.js 4.3.2 SmolLM2 360M streaming and interrupt | browser, SmolLM2 (Apache-2.0) | pass: stream, and an abort ended the stream 8 ms after the stop (measured) |
| 14 | chat | Prompt API in Chrome 148 with `responseConstraint` | Chrome 148 on supported hardware, Chrome built in AI terms | not run: `LanguageModel` present, availability `unavailable` ("the service is not running") |
| 15 | chat | OpenAI compatible stream from a local Ollama or llama.cpp server | a local server and model | not run: needs a local server |
| 16 | chat | Anthropic Messages API from a page with `output_config.format` | an API key and the provider's terms | not run: needs an API key |
| 17 | structured | each mode with 0.5B to 4B models: how often the reply parses, per model | browser, models | not run: no page for it in this pass |
| 18 | structured | XGrammar compiling the sanitized strict anyOf for a 10 tool list | WebLLM, an MLC model | not run |
| 19 | memory | IndexedDB persistence, quota errors and a private window | browsers | not run: `open()` used IndexedDB from http and file:// with no note; quota and a private window not run |
| 20 | memory | the wasm core from file:// through the inlined base64 build | Chrome, file:// page | pass from file:// through the iife build (Chrome 150); Safari not run |
| 21 | memory | recall quality with MiniLM (Apache-2.0) and bge-small (MIT) embedders | browser, transformers.js, embedder weights | not run |
| 22 | memory | prefix stable injection keeping a wllama or WebLLM KV prefix warm (time to first token, measured) | browser, model | not run |
| 23 | all | every `dist/single/*.js` file loaded from a file:// page | Chrome, Safari | pass after a fix: the ESM files failed (33 of 33 refused from file://); the new iife builds load 33 of 33 in Chrome 150; Safari not run |
| 24 | devices | `loadTransformers()` and `loadOrt()` import transformers.js 4.3.2 and onnxruntime-web 1.27.0 from the pinned URLs over https and from file:// | Chrome, Safari, network | pass in Chrome over http; from file:// both import through the devices IIFE (audit run, 2026-11-23); Safari not run |
| 25 | devices | the ort ladder from webgpu basic to wasm on a graph that fails to partition (htdemucs, MIT) with one download | WebGPU machine, network | not run: no page for htdemucs in this pass |
| 26 | audio-dsp | the inlined wasm core from a file:// page, and kernel speed on 10 minutes of 16 kHz audio (measured) | Chrome, Safari, file:// page | pass over http and from file:// (iife); kernel times below; Safari not run |
| 27 | transcribe | whisper-large-v3-turbo (MIT) on webgpu and whisper-base.en (MIT) on wasm over a 10 minute file, against an earlier transcription tool run of the same file | WebGPU machine, network, a test recording | not run: large v3 turbo is about 900 MB (inferred) and no 10 minute recording or the earlier transcription tool run is here; a base.en round trip passed (below) |
| 28 | transcribe | the live segmenter on a microphone and the Web Speech adapter in Chrome | Chrome, microphone | not run: needs a microphone |
| 29 | vision | depth-anything-v2-small (Apache-2.0) on webgpu fp16 and wasm q8, against the earlier relief bench's output for the same photo | WebGPU machine, network | pass: webgpu fp16 and wasm q8 rungs ran; the earlier relief bench comparison not run |
| 30 | vision | tasks-vision 1.2.3 detector, segmenter and face, hand and pose landmarkers (Apache-2.0) on a webcam, GPU and CPU delegates | Chrome, Safari, webcam | not run: needs a webcam; the detector ran on a still frame (below) |
| 31 | vision | SmolVLM 256M (Apache-2.0) and LFM2-VL 450M (LFM Open License) captions; SlimSAM (Apache-2.0) point masks | WebGPU machine, network | pass on the rerun: LFM2-VL 450M captions after the images first processor fix (it threw "undefined is not iterable" on the first pass); SmolVLM 256M and SlimSAM pass; captions read by the harness only |
| 32 | vision | an external YOLOv8n export (AGPL-3.0, owner supplied) through the ort provider | browser, the onnx file | not run: needs the owner supplied ONNX file |
| 33 | depth-mesh | an earlier relief bench style relief from a Depth Anything map (Apache-2.0), sliced in Flash Studio and printed | browser, slicer, printer | not run: needs a slicer and a printer; the relief from a synthetic depth map is a closed solid |
| 34 | depth-mesh | an earlier scan bench turntable carve from a webcam and an ICP scan, at real frame rate, looked at by a person | Chrome, webcam, turntable | not run: needs a webcam and a turntable |
| 35 | models, vision | a webgpu depth or VLM model beside a three.js scene with and without `frameBudgetMs` and `minIntervalMs`: frame times measured, stutter looked at by a person | WebGPU machine, a scene | pass as a measurement (below): the schedule alone left frame p95 at 49.8 ms; `depthWorker` holds it at 18.3 ms on webgpu; stutter not looked at by a person |
| 36 | stems | htdemucs fast and slow (MIT) on webgpu and wasm over a 3 minute song: realtime factor measured, stems listened to | WebGPU machine, network, a CC0 song | not run: no page for it in this pass |
| 37 | notes | Basic Pitch (Apache-2.0) on tfjs 3.21.0 webgl and cpu over a separated bass stem; notes compared with the basic-pitch library's decoder | browser, network | not run: no page for it in this pass |
| 38 | biosignal | training and cross validation on a real headset recording or a public motor imagery set, in the tab | browser, EEG data | not run |
| 39 | media | decodeAudio on mp4, mov, webm and mkv, and record() of a canvas, in Chrome, Safari and Firefox | browsers, CC0 test files | not run: no page for it in this pass |
| 40 | embed | potion-base-8M (MIT) loaded from its repo, vectors compared with the Python model2vec package on 20 sentences | browser or Node, network, Python | pass: 20 sentences, max abs difference 5.1e-7 against model2vec 0.10.0 in Python (measured) |
| 41 | embed | all-MiniLM-L6-v2 (Apache-2.0) and bge-small-en-v1.5 (MIT) through transformers.js 4.3.2 on wasm q8 and webgpu fp32, with speed measured | browser, network | pass on wasm q8 and webgpu fp32 for both models |
| 42 | speak | Kokoro 82M (Apache-2.0) through kokoro-js 1.2.1 on webgpu fp32 and wasm q8: time to first audio measured, joins listened to | browser, network | pass, rerun 2026-11-23 with speaking timed at the audio clock: wasm q8 first audio 38,888 ms cold (download included) and 14,661 ms warm; webgpu fp32 47,355 ms cold and 990 ms warm (measured); Kokoro is now opt in for its GPL phonemizer; joins not listened to by a person. Earlier first audio numbers measured scheduling time |
| 43 | speak | Pocket TTS (weights CC-BY-4.0) worker patches against the current upstream source, from file:// and https, with a clone from an owner supplied reference kept out of git | Chrome, network | not run: needs the community build's base URL |
| 44 | speak | Web Speech boundaries and the engine chain falling to it when the others fail, in Chrome, Safari and Firefox | browsers | pass in Chrome: 48 voices, 17 word boundaries, time to first audio 14 ms (measured, rerun 2026-11-23); Safari and Firefox not run; the fall through is covered by unit tests only |
| 45 | listen | Silero VAD v5 (MIT) on onnxruntime-web 1.27.0: tensor names, probabilities on a recorded voice, single thread from file:// | Chrome, network | not run: needs a microphone |
| 46 | listen | barge in through laptop speakers with echo cancellation on, while speak plays Kokoro or the system voice: false triggers counted | Chrome, microphone, speakers | not run: needs a microphone and speakers |
| 47 | listen | capture worklet from a Blob and a data: URL, end of speech to text latency with whisper-base.en (MIT) measured | Chrome, Safari, microphone | not run: needs a microphone |
| 48 | character | the inlined wasm core from a file:// page: read a PNG card dropped on the page, write it back, open the result in a card reader of another tool | Chrome, Safari, file:// page | not run: the iife core loads from file://; no card was read or written |
| 49 | character | CHARX archives written by other tools (deflate entries, data descriptors) read, and this package's CHARX opened by another reader | browser, CHARX files with CC0 or own content | not run |
| 50 | act | the act GBNF grammar compiled by wllama 4.0.0 and the JSON Schema by WebLLM XGrammar, and how often Qwen2.5 0.5B and 1.5B (Apache-2.0) place valid tags with and without it | browser, models | not run |
| 51 | act | cues fired from word timestamps of a real voice on a VRM avatar: timing, cooldown and mood decay looked at by a person | browser, a voice engine, an avatar | not run |
| 52 | agent | plan validity per mode (schema, looser schema, free text) for Qwen2.5 0.5B and 1.5B Instruct (Apache-2.0) and Gemma 3 1B (Gemma terms) over a fixed request set | browser, models | not run |
| 53 | agent | time from request to first spoken word with streamed say against a real voice (measured) | browser, model, voice engine | not run |
| 54 | imagegen | SD-Turbo (Stability AI Community License) from schmuell/sd-turbo-ort-web on onnxruntime-web 1.27.0 webgpu: graph names, one and four step images looked at by a person, time per step measured | WebGPU machine, network | not run: the three graphs are 2,513 MB (vendor, repo listing 2026-11-23); the listing has the three graph paths the record names |
| 55 | ai-elements | a person looks at each element (model picker, download bar, status pills, chat panel, memory inspector) in Chrome and Safari, light and dark, and tabs through them with a screen reader on | Chrome, Safari | not run: needs a person, Safari and a screen reader; screenshots in `.local/shots` |
| 56 | ai-elements | the chat panel streaming a real engine (Qwen2.5 0.5B, Apache-2.0) for 500 tokens: repaint cost per token measured | browser, model | pass: 500 tokens, frame ms p95 17.4 while streaming and 17.4 idle (measured) |
| 57 | speak | the bellows voice (bellows-voice 0.8.0 on bellowsjs 0.5.x, MIT, no weights) through the speaker: time to first audio, phoneme times, listened to by a person | browser, network | pass, rerun 2026-11-23 on bellows-voice 0.8.0 from npm: first audio 495 ms cold and 433 ms warm on a second line, at the audio clock, 67 phoneme events (measured); earlier numbers measured scheduling time; not listened to by a person |
| 58 | weights | shared origin (suite decision D7): a blob put through the store on one path of a host is read on another path, per backend | Chrome, http | pass on opfs, idb and cache: 300,000 stub bytes put on `/a/`, read on `/b/` with sha-256 equal (measured, `node tools/check-origin.mjs`, 2026-11-24, headless Chrome 150) |
| 59 | weights | the WebLLM 0.2.84 IndexedDB cache (`webllm/model`, store `urls`) and `transformersCache` shared across paths of one host | Chrome, http | pass: a raw `webllm/model` entry of 4,096 bytes and a `transformersCache` put both read on the other path (measured, same run); the real WebLLM runtime not run |
| 60 | weights | two pages of one origin asking the store for one key at once download it once | Chrome, http | fail: 2 stub fetches for one key (measured, same run); bytes intact on both pages for a 524,288 byte stub, but both pages wrote the same parts. Each store dedupes in memory only, so pages and tabs do not share a flight |

## Measured on the first pass

All numbers measured on the machine above unless the label says
otherwise. Load times include the download from a fresh browser profile.

| page | what | numbers |
|---|---|---|
| chat | webllm 0.2.84, Qwen2.5 0.5B Instruct q4f16 (Apache-2.0) | load 9,355 ms, first token 1,427 ms, 48.2 tokens per s |
| chat | webllm 0.2.89, same model from cache | load 2,978 ms, first token 1,805 ms, 30 tokens per s |
| chat | transformers.js 4.3.2, SmolLM2 360M Instruct q4f16 on webgpu (Apache-2.0) | load 9,349 ms, first token 1,163 ms, 37 tokens per s |
| transcribe | whisper-base.en (MIT) on a sentence spoken by Kokoro | wasm q8: load 4,159 ms, 5,988 ms, word error rate 0.053; webgpu fp32: load 8,815 ms, 3,517 ms, word error rate 0.053 (computed) |
| speak | Kokoro 82M (Apache-2.0) through kokoro-js 1.2.1 | wasm q8: first audio 7,925 ms cold, 7,431 ms warm; webgpu fp32: 13,753 ms cold, 1,147 ms warm. Rerun: wasm q8 12,132 cold, 7,388 warm; webgpu fp32 11,436 cold, 1,123 warm |
| speak, rerun | the system voice and the bellows voice | system voice first audio 76 ms; bellows 798 ms cold, 263 ms warm, say to done 5,413 ms warm |
| vision | Depth Anything v2 small (Apache-2.0), 512 px frame | webgpu fp16 204.7 ms p50, wasm q8 3,025 ms p50 |
| vision | the three.js scene beside depth (#35) | alone 16.7 / 17.4 ms frame p50 / p95; depth unscheduled 16.7 / 49.9 ms (26 runs in 6 s); with `frameBudgetMs` 20 and `minIntervalMs` 200, 16.7 / 49.3 ms (20 runs, 26 skips) |
| vision, rerun | the same scene, depth on the main thread and in `depthWorker` | alone 16.7 / 18.3; main thread unscheduled 16.7 / 49.9 and budgeted 16.7 / 49.8, no main thread task over 50 ms; worker webgpu 16.7 / 18.3 (22 runs in 6 s, 280 ms p50), worker webgpu with a 200 ms gap 16.7 / 18.3 (14 runs), worker wasm 16.7 / 18.2 (2 runs, 4,664 ms p50) |
| vision, rerun | LFM2-VL 450M (LFM Open License v1.0) on webgpu | load 8,743 ms, caption 4,671 ms |
| vision | EfficientDet Lite0 (Apache-2.0) on MediaPipe, webgl delegate | 2,016 ms for the first call, one detection on the shapes |
| vision | SlimSAM 77 (Apache-2.0), SmolVLM 256M (Apache-2.0) | SlimSAM load 2,250 ms, first mask 5,260 ms; SmolVLM load 15,263 ms, caption 16,950 ms, caption names the shapes |
| depth-mesh | relief from a 256 px synthetic depth map, carve of 24 silhouettes at 64 cubed | relief 17.5 ms, 74,604 triangles, 0 open edges; carve 43.7 ms, hull to box volume 1.122 (computed); 59.9 fps p50 |
| embed | potion-base-8M (MIT), MiniLM L6 v2 (Apache-2.0), bge-small-en v1.5 (MIT), 20 sentences | potion 1.8 ms; MiniLM wasm q8 251 ms, webgpu fp32 256 ms; bge wasm q8 418 ms, webgpu fp32 50 ms |
| audio-dsp | 10 minutes of 16 kHz audio | dc block 56 ms, biquad 60 ms, spectral subtraction 1,414 ms, limiter 253 ms, stft 1,197 ms; sinc resample 16 to 48 kHz 94,421 ms |
| audio-dsp, rerun | the same, after the polyphase sinc | sinc resample 16 to 48 kHz 3,267 ms (28.9 times faster, computed); dc block 71, biquad 75, spectral subtraction 1,740, limiter 289, stft 1,188, all kernels 8,677 ms |
| devices | runtime imports, resume, sha-256 | transformers.js import 45 ms, onnxruntime-web 171 ms (cached by the earlier pages); resume of a 23 MB file 745 ms after a stop at 5.0 MB; sha-256 88 MB/s |
| ai-elements | chat panel with Qwen2.5 0.5B on webllm | 500 tokens in 18,051 ms, frame ms p50 / p95 16.7 / 17.4 |

Found on this pass and fixed (each its own commit): surface nets faces
wound inward (depth-mesh), `task` sent to english only Whisper models
(transcribe), ESM single files refused from file:// (bundle, iife builds
added), SmolVLM fp16 encoder rung giving captions unrelated to the image
(devices ladder).

Found on the first pass and fixed on 2026-11-23, each its own commit and
rerun above: the LFM2-VL loader error (#31, transformers.js 4.3.2 wants
images before text for that processor); the windowed sinc resampler took
94 s for 10 minutes of audio since it evaluated sin and cos per tap (a
polyphase table now, 3.3 s); the depth frame budget did not remove the
50 ms frame spikes (#35, no main thread long task was found, and depth
in a worker holds frame p95 at 18.3 ms); the system voice reported no
audio start, so its time to first audio read 0 (it now starts at the
onstart event or the first boundary, and reads unknown without either).

## Layout and mobile, 2026-11-23

The example pages and the ai-elements moved onto the hackbuild-ui 0.4.3
class layer, mobile first. Chrome 150 on the Apple M1, puppeteer-core,
every page of `_site` (index and the ten pages) at 320 px (touch, scale
2), 360 px (Galaxy S9+ profile, touch), 390 px (iPhone 13 profile,
touch), 768 px (touch), 1024, 1280 and 1440 px, full page screenshots
in `.local/layout/` (gitignored). At every width: no sideways scroll
against the device width; on the phone and touch profiles every button,
link, select, input and summary in the page and inside the ai-elements
shadow roots is at least 44 px tall, and fields are 16 px (measured by
the layout script). On the phone profiles the viewport sits above the
controls, so the scene shows above the fold; from 641 px the controls
go back under the header. Looked at in the screenshots by the builder;
the owner has not looked, and no real phone has opened the pages.

The `?auto` checks after the restyle: chat, transcribe, speak,
depth-mesh, embed, audio-dsp, devices and ai-elements pass; imagegen not
run (download over the limit); vision passes its depth, frame budget and
detector rows but timed out at 900 s downloading SmolVLM for row 31 on
three runs this afternoon. Transcribe and speak each timed out once the
same way and passed on a rerun, and the unchanged pages from before the
restyle timed out on the same transcribe download, so the stalls are
the network to the model hosts, not the pages. Detector counts on the
still frame moved between runs (2, 1, 1) with the same code.

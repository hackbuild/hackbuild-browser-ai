# Checks that need a real browser or model

Every row below needs a real browser, a real model, or both. None has run
as of 2026-11-22; each row is marked not run until someone runs it and
writes the date, the browser and version, the machine, and who looked.
Unit tests with fakes cover the logic around each one (see each package
README).

| # | package | check | needs | status |
|---|---|---|---|---|
| 1 | ai-env | `probe()` fields in Chrome, Safari and Firefox over https and from file:// | browsers | not run |
| 2 | ai-env | a module blob worker refused on file:// in Chrome, and the ladder landing on classic-blob | Chrome, file:// page | not run |
| 3 | ai-env | `importEsm` of the wllama 4.0.0 and 3.8.1 ESM builds from file:// through Blob and `data:` URLs | Chrome, network | not run |
| 4 | weights | OPFS, Cache Storage and IndexedDB part stores with a file over 2 GB | Chrome, Safari, disk space | not run |
| 5 | weights | resume against Hugging Face's CDN: does it answer `Range` plus `If-Range` with 206 | browser, network | not run |
| 6 | weights | `transformersCache` as transformers.js 4.3.2 `env.customCache` | browser, transformers.js | not run |
| 7 | weights | SHA-256 throughput on the main thread and in a worker | browser | not run |
| 8 | models | each `CATALOG` ladder loads on its first rung, or falls to the next with a named error | WebGPU and non WebGPU machines, every catalog model (licences in the record) | not run |
| 9 | models | `classifyError` patterns against current WebLLM 0.2.89, onnxruntime-web 1.31 and transformers.js 4.3.2 messages | browsers, models | not run |
| 10 | models | two webgpu models under the hub's gpu lock with no device lost | WebGPU machine, two models | not run |
| 11 | chat | WebLLM 0.2.84 and 0.2.89 stream, json_object plus schema, context ladder | WebGPU, an MLC model (Qwen2.5 0.5B, Apache-2.0) | not run |
| 12 | chat | wllama 4.0.0 and 3.8.1 load a GGUF Blob from the IndexedDB store, stream, json_schema | browser, a GGUF (Qwen2.5 0.5B Instruct Q4_K_M, Apache-2.0) | not run |
| 13 | chat | transformers.js 4.3.2 SmolLM2 360M streaming and interrupt | browser, SmolLM2 (Apache-2.0) | not run |
| 14 | chat | Prompt API in Chrome 148 with `responseConstraint` | Chrome 148 on supported hardware, Chrome built in AI terms | not run |
| 15 | chat | OpenAI compatible stream from a local Ollama or llama.cpp server | a local server and model | not run |
| 16 | chat | Anthropic Messages API from a page with `output_config.format` | an API key and the provider's terms | not run |
| 17 | structured | each mode with 0.5B to 4B models: how often the reply parses, per model | browser, models | not run |
| 18 | structured | XGrammar compiling the sanitized strict anyOf for a 10 tool list | WebLLM, an MLC model | not run |
| 19 | memory | IndexedDB persistence, quota errors and a private window | browsers | not run |
| 20 | memory | the wasm core from file:// through the inlined base64 build | Chrome, file:// page | not run |
| 21 | memory | recall quality with MiniLM (Apache-2.0) and bge-small (MIT) embedders | browser, transformers.js, embedder weights | not run |
| 22 | memory | prefix stable injection keeping a wllama or WebLLM KV prefix warm (time to first token, measured) | browser, model | not run |
| 23 | all | every `dist/single/*.js` file loaded from a file:// page | Chrome, Safari | not run |
| 24 | devices | `loadTransformers()` and `loadOrt()` import transformers.js 4.3.2 and onnxruntime-web 1.27.0 from the pinned URLs over https and from file:// | Chrome, Safari, network | not run |
| 25 | devices | the ort ladder from webgpu basic to wasm on a graph that fails to partition (htdemucs, MIT) with one download | WebGPU machine, network | not run |
| 26 | audio-dsp | the inlined wasm core from a file:// page, and kernel speed on 10 minutes of 16 kHz audio (measured) | Chrome, Safari, file:// page | not run |
| 27 | transcribe | whisper-large-v3-turbo (MIT) on webgpu and whisper-base.en (MIT) on wasm over a 10 minute file, against a SCRIBE run of the same file | WebGPU machine, network, a test recording | not run |
| 28 | transcribe | the live segmenter on a microphone and the Web Speech adapter in Chrome | Chrome, microphone | not run |
| 29 | vision | depth-anything-v2-small (Apache-2.0) on webgpu fp16 and wasm q8, against BAIL's output for the same photo | WebGPU machine, network | not run |
| 30 | vision | tasks-vision 1.2.3 detector, segmenter and face, hand and pose landmarkers (Apache-2.0) on a webcam, GPU and CPU delegates | Chrome, Safari, webcam | not run |
| 31 | vision | SmolVLM 256M (Apache-2.0) and LFM2-VL 450M (LFM Open License) captions; SlimSAM (Apache-2.0) point masks | WebGPU machine, network | not run |
| 32 | vision | an external YOLOv8n export (AGPL-3.0, owner supplied) through the ort provider | browser, the onnx file | not run |
| 33 | depth-mesh | a BAIL style relief from a Depth Anything map (Apache-2.0), sliced in Flash Studio and printed | browser, slicer, printer | not run |
| 34 | depth-mesh | a CALIPER turntable carve from a webcam and an ICP scan, at real frame rate, looked at by a person | Chrome, webcam, turntable | not run |
| 35 | models, vision | a webgpu depth or VLM model beside a three.js scene with and without `frameBudgetMs` and `minIntervalMs`: frame times measured, stutter looked at by a person | WebGPU machine, a scene | not run |
| 36 | stems | htdemucs fast and slow (MIT) on webgpu and wasm over a 3 minute song: realtime factor measured, stems listened to | WebGPU machine, network, a CC0 song | not run |
| 37 | notes | Basic Pitch (Apache-2.0) on tfjs 3.21.0 webgl and cpu over a separated bass stem; notes compared with the basic-pitch library's decoder | browser, network | not run |
| 38 | biosignal | training and cross validation on a real headset recording or a public motor imagery set, in the tab | browser, EEG data | not run |
| 39 | media | decodeAudio on mp4, mov, webm and mkv, and record() of a canvas, in Chrome, Safari and Firefox | browsers, CC0 test files | not run |
| 40 | embed | potion-base-8M (MIT) loaded from its repo, vectors compared with the Python model2vec package on 20 sentences | browser or Node, network, Python | not run |
| 41 | embed | all-MiniLM-L6-v2 (Apache-2.0) and bge-small-en-v1.5 (MIT) through transformers.js 4.3.2 on wasm q8 and webgpu fp32, with speed measured | browser, network | not run |
| 42 | speak | Kokoro 82M (Apache-2.0) through kokoro-js 1.2.1 on webgpu fp32 and wasm q8: time to first audio measured, joins listened to | browser, network | not run |
| 43 | speak | Pocket TTS (weights CC-BY-4.0) worker patches against the current upstream source, from file:// and https, with a clone from an owner supplied reference kept out of git | Chrome, network | not run |
| 44 | speak | Web Speech boundaries and the engine chain falling to it when the others fail, in Chrome, Safari and Firefox | browsers | not run |
| 45 | listen | Silero VAD v5 (MIT) on onnxruntime-web 1.27.0: tensor names, probabilities on a recorded voice, single thread from file:// | Chrome, network | not run |
| 46 | listen | barge in through laptop speakers with echo cancellation on, while speak plays Kokoro or the system voice: false triggers counted | Chrome, microphone, speakers | not run |
| 47 | listen | capture worklet from a Blob and a data: URL, end of speech to text latency with whisper-base.en (MIT) measured | Chrome, Safari, microphone | not run |

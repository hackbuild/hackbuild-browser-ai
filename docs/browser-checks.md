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

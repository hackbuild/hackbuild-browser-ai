# @hackbuild/embed

Turn sentences into vectors in the tab, for memory recall and action matching, with an id that changes only when the vectors would.

[![npm](https://img.shields.io/npm/v/@hackbuild/embed)](https://www.npmjs.com/package/@hackbuild/embed) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 6.8 kB measured](https://img.shields.io/badge/gzip-6.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Builds a model2vec style static embedder in plain TypeScript from tokenizer.json, model.safetensors and config.json, with no ML runtime.
- Wraps a transformers.js feature extraction pipeline, MiniLM by default or bge-small, as the same `Embedder` shape.
- Gives each embedder an id that fingerprints the model and settings, so @hackbuild/memory re-embeds only when the vectors would change.
- Adds its model records and loaders to a @hackbuild/models hub.
- Keeps vectors in a brute force cosine `VectorIndex` with top k and a score floor.

## Install

```sh
npm install @hackbuild/embed
```

It depends on @hackbuild/memory, @hackbuild/models and @hackbuild/devices, which install with it. It has no peers. transformers.js is passed in at run time for `miniLM` and `tjsEmbedder`, never imported by this package; `loadTransformers` in @hackbuild/devices loads the pinned 4.3.2.

## Quick start

```ts
import { staticEmbedder, VectorIndex } from "@hackbuild/embed";
import { openWeightStore } from "@hackbuild/weights";

// potion-base-8M, weights MIT, fetched once and cached by the weight store
const base = "https://huggingface.co/minishlab/potion-base-8M/resolve/main/";
const store = await openWeightStore();
const get = (file: string) => store.once({ url: base + file, licence: "MIT" });
const dec = new TextDecoder();
const e = staticEmbedder({ name: "potion-base-8M", tokenizer: dec.decode(await get("tokenizer.json")), weights: await get("model.safetensors"), config: dec.decode(await get("config.json")) });

// embed a few notes and keep them in an index
const notes = ["the mug goes on the shelf", "water the plants on friday", "the router password is on the fridge"];
const index = new VectorIndex<string>();
(await e.embed(notes)).forEach((v, i) => index.add(notes[i]!, v));

// the two closest notes at cosine 0.1 or above, best first
console.log(e.id, index.search(e.embedOne("where is the cup"), 2, 0.1));
```

## Live example

The embed page loads potion-base-8M, MiniLM or bge-small and searches 20 sentences: [hackbuild-browser-ai/embed](https://hackbuild.github.io/hackbuild-browser-ai/embed/). The suite memory view recalls through these embedders: [hackbuild-suite memory](https://hackbuild.github.io/hackbuild-suite/#/chat/memory).

## Concepts

### the embedder contract

Every embedder here satisfies the `Embedder` contract of @hackbuild/memory: `{ id, dim, embed(texts) }`, where `embed` resolves one Float32Array per text. `hashedEmbedder` is re-exported from @hackbuild/memory as the fallback with no download.

### static embedding

`staticEmbedder` uses no special tokens, drops unknown tokens, keeps at most 512 tokens, and takes the mean of the token rows (weighted by a `weights` tensor and remapped by a `mapping` tensor when the file has them). It L2 normalizes unless config.json says `"normalize": false`. An empty result is a zero vector. `embedOne` embeds one text synchronously. It runs in a worker or Node. Static vectors find shared words and near synonyms; they miss paraphrase, which is a limit of the model. `loadStaticEmbedder` fetches the three files from a base URL you choose, through the `fetch` you pass, and checks each file's SHA-256 when `sha256For` returns one.

### tokenization

The tokenizer reads tokenizer.json with a WordPiece or WordLevel model, or a vocab.txt. The BertNormalizer steps run in the library order (clean text, pad CJK ideographs, strip accents, lowercase), then whitespace and punctuation splitting, then greedy longest match with `##` continuations; a word with no full cover is one unknown token. Unigram and BPE models are refused with a message.

### safetensors

`readSafetensors` reads F32, F16 and BF16 floats and widens F16 and BF16 to float32; I32 and I64 tensors come out as Int32Array.

### ids

A static id is `model2vec:<name>:<dim>:<FNV-1a of the weights>:<FNV-1a of the tokenizer>:<n|u>`, computed from the bytes. A transformers.js id is `tjs:<model>:<revision>:<dtype>:<device>:<pooling>:<n|u>:<dim>`, for example `tjs:Xenova/all-MiniLM-L6-v2:main:q8:wasm:mean:n:384`. Two loads of the same files give the same id; a change to weights, vocabulary, dtype, device, pooling or normalization gives another.

### transformers.js

`miniLM(tjs)` loads Xenova/all-MiniLM-L6-v2 on wasm at q8; pass `{ device: "webgpu", dtype: "fp32" }` to move it. `tjsEmbedder(pipeline, opts)` wraps any feature extraction pipeline, in batches of 16 by default, and probes the vector size with one call when `dim` is left out. bge-small takes `pooling: "cls"`.

### the hub

`attachEmbed(hub, tjsProvider)` adds the records (potion-base-8m, minilm-l6, bge-small-en), registers the static factory and the transformers.js loader for `"embed"`; then `await hub.use("embed")` gives an embedder. The MiniLM and bge ladders run wasm q8 first, then wasm fp32, then webgpu fp32, keeping embedding off the GPU a chat model uses. The static factory checks files at the pinned commit with `pinnedSha`.

## API overview

| export | what it does |
|---|---|
| [`staticEmbedder`](../../docs/api/embed/README.md#staticembedder) | build a static embedder from tokenizer, weights and config bytes |
| [`loadStaticEmbedder`](../../docs/api/embed/README.md#loadstaticembedder) | fetch the three model2vec files from a base URL and build the embedder |
| [`miniLM`](../../docs/api/embed/README.md#minilm) | MiniLM, or another sentence model, through a transformers.js module you loaded |
| [`tjsEmbedder`](../../docs/api/embed/README.md#tjsembedder) | wrap a feature extraction pipeline as an embedder |
| [`attachEmbed`](../../docs/api/embed/README.md#attachembed) | add the embed records and loaders to a models hub |
| [`EMBED_RECORDS`](../../docs/api/embed/README.md#embed_records) | the hub records for the three models |
| [`staticFactory`](../../docs/api/embed/README.md#staticfactory) | the hub factory for static records |
| [`VectorIndex`](../../docs/api/embed/README.md#vectorindex) | an in memory cosine index with top k and a floor |
| [`cosine`](../../docs/api/embed/README.md#cosine) | the cosine similarity of two vectors |
| [`loadTokenizer`](../../docs/api/embed/README.md#loadtokenizer) | read a tokenizer.json or vocab.txt |
| [`readSafetensors`](../../docs/api/embed/README.md#readsafetensors) | parse a safetensors file |
| [`hashedEmbedder`](../../docs/api/embed/README.md#hashedembedder) | the download free fallback from @hackbuild/memory |

The full reference is in [docs/api/embed](../../docs/api/embed/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| potion-base-8M (static, 256 dims) | `potion-base-8m` | 30 MB (inferred) | MIT | minishlab/potion-base-8M on Hugging Face, or a base URL you give |
| all-MiniLM-L6-v2 (384 dims) | `minilm-l6` | 23 MB (inferred) | Apache-2.0 | Xenova/all-MiniLM-L6-v2 through transformers.js |
| bge-small-en-v1.5 (384 dims) | `bge-small-en` | 32 MB (vendor, q8 file 34.0 MB, fp32 file 133.1 MB) | MIT | Xenova/bge-small-en-v1.5 through transformers.js |

No weights ship in this package. The static files load from the URL you give or the pinned Hugging Face commit through the hub; @hackbuild/weights caches them when you fetch through its store, as the quick start does. The transformers.js models load through the runtime, which can use a `transformersCache` from @hackbuild/weights. The licence is the model card's as of 2026-11-22.

## Browser support

| feature | WebGPU | WASM | threads | Safari | Firefox | phone |
|---|---|---|---|---|---|---|
| static embedder | not used | not used | not used | yes (inferred) | yes (inferred) | yes (inferred) |
| MiniLM, bge-small | optional, fp32 | yes, q8 first | unknown | unknown | unknown | unknown |
| `VectorIndex` | not used | not used | not used | yes | yes | yes |

The static embedder is plain TypeScript and runs on the page, in a worker or in Node. The transformers.js ladders start on wasm q8 and fall back to wasm fp32, then webgpu fp32; q8 stays off webgpu because it garbled other models in earlier builds. With no model loaded, `hashedEmbedder` gives vectors with no download.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `safetensors: file shorter than its header length` | the weights file is truncated or not safetensors | fetch the file again |
| `safetensors: header runs past the end of the file` | the download stopped early | fetch the file again |
| `safetensors: dtype ... of ... is not supported` | a tensor type other than F32, F16, BF16, I32 or I64 | use a model with float weights |
| `model2vec: no 2d float embeddings tensor in the safetensors file` | the file is not a model2vec model | point at a model2vec repo such as potion-base-8M |
| `model2vec: http ... for ...` | the base URL returned an error | check the base URL ends at the repo's resolve path |
| `model2vec: sha256 of ... is ..., expected ...` | the file does not match its pin | fetch it again; the pin names the expected bytes |
| `tokenizer.json has no model.vocab` | the tokenizer file has no vocabulary | use the repo's tokenizer.json or a vocab.txt |
| `tokenizer model ... is not supported; WordPiece and WordLevel are` | a Unigram or BPE tokenizer | use a model with a WordPiece or WordLevel tokenizer |
| `the transformers.js module has no pipeline export` | the module passed in is not transformers.js | pass the module from `loadTransformers` in @hackbuild/devices |
| `...: a static record needs source.url` | a static hub record with no URL | give the record a `source.url` |

## Works with

- [@hackbuild/memory](../memory/README.md) takes any embedder here for recall and re-embeds when the id changes.
- [@hackbuild/models](../models/README.md) holds the hub that `attachEmbed` adds records and loaders to.
- [@hackbuild/devices](../devices/README.md) loads the pinned transformers.js and builds the device ladders.
- [@hackbuild/weights](../weights/README.md) fetches and caches the weight files.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/embed` passes, 16 tests, in Node
  22.18.0: tokenization against hand written expectations, safetensors
  F32, F16 and I64 reads, mean and normalization, token weights and row
  mapping, id stability, batching and the hub's static factory, all on
  fixtures written in the test.

### Not verified by anything

- Agreement with the Python model2vec package on potion-base-8M: no
  reference vectors were computed here, so "bit exact" is not claimed.
- The real potion-base-8M tokenizer.json loading (its model type was not
  checked in this build; a Unigram file would be refused).
- MiniLM and bge-small through transformers.js 4.3.2 in a browser, and
  their speed.
- Speed of the static embedder (the 0.08 ms per sentence figure is the
  earlier build's, not measured here).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 6,800 bytes | 7,140 bytes |
| `dist/single/index.iife.js` (single file build) | 33,786 bytes | 35,475 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. Weights are not part of this package: potion-base-8M is MIT, all-MiniLM-L6-v2 is Apache-2.0 and bge-small-en-v1.5 is MIT, per their model cards.

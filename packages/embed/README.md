# @hackbuild/embed

Sentence embedders that satisfy the `Embedder` contract of
@hackbuild/memory (`{ id, dim, embed(texts) }`): a model2vec style static
embedder in plain TypeScript, and a transformers.js adapter for MiniLM and
other sentence models. Both give an id that is a stable fingerprint of the
model and settings, so memory re-embeds only when the vectors would
change. Code MIT; this README CC-BY-4.0 with the code samples also MIT. No
weights ship here.

    npm install @hackbuild/embed

## Static (model2vec)

    import { loadStaticEmbedder, staticEmbedder } from "@hackbuild/embed";

    // minishlab/potion-base-8M, weights MIT; the base URL is yours to choose
    const e = await loadStaticEmbedder("https://huggingface.co/minishlab/potion-base-8M/resolve/main/", { name: "potion-base-8M" });
    // or from bytes you already hold (a File, the weights store)
    const e2 = staticEmbedder({ tokenizer: tokenizerJsonText, weights: safetensorsBytes, config: configJsonText });
    e.embedOne("the mug goes on the shelf"); // Float32Array, L2 normalized

- Tokenizer: tokenizer.json with a WordPiece or WordLevel model, or a
  vocab.txt. The BertNormalizer steps run in the library order (clean
  text, pad CJK ideographs, strip accents, lowercase), then whitespace and
  punctuation splitting, then greedy longest match with `##`
  continuations; a word with no full cover is one unknown token. Unigram
  and BPE models are refused with a message.
- Embedding: no special tokens, unknown tokens dropped, at most 512
  tokens, mean of the rows (weighted by a `weights` tensor and remapped by
  a `mapping` tensor when the file has them), L2 normalized unless
  config.json says `"normalize": false`. An empty result is a zero vector.
- Weights: safetensors with F32, F16 or BF16 floats; F16 and BF16 widen
  to float32.
- Id: `model2vec:<name>:<dim>:<FNV-1a of the weights>:<FNV-1a of the
  tokenizer>:<n|u>`, computed from the bytes.

## transformers.js (MiniLM)

    import { miniLM } from "@hackbuild/embed";
    import { loadTransformers } from "@hackbuild/devices";

    const tjs = await loadTransformers()();
    const e = await miniLM(tjs);                       // Xenova/all-MiniLM-L6-v2, weights Apache-2.0, wasm q8
    const g = await miniLM(tjs, { device: "webgpu", dtype: "fp32" });
    e.id; // "tjs:Xenova/all-MiniLM-L6-v2:main:q8:wasm:mean:n:384"

`tjsEmbedder(pipeline, opts)` wraps any feature extraction pipeline, in
batches of 16 by default. bge-small (Xenova/bge-small-en-v1.5, weights MIT)
takes `pooling: "cls"`.

## Hub

    attachEmbed(hub, tjsProvider);           // records: potion-base-8m (MIT), minilm-l6 (Apache-2.0), bge-small-en (MIT)
    const { value: embedder } = await hub.use("embed");

The MiniLM and bge ladders run wasm q8 first, then wasm fp32, then webgpu
fp32, keeping embedding off the gpu a chat model uses.

## Also here

`VectorIndex<T>` (brute force cosine with top k and a floor) and
`cosine`. `hashedEmbedder` is re-exported from @hackbuild/memory as the
zero download fallback.

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
  source build's, not measured here).

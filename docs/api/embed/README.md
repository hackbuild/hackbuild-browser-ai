# @hackbuild/embed

## Classes

### VectorIndex

An in memory list of items and their vectors, searched by cosine for the top k.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Constructors

##### Constructor

```ts
new VectorIndex<T>(): VectorIndex<T>;
```

###### Returns

[`VectorIndex`](#vectorindex)\<`T`\>

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### add()

```ts
add(item, vec): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `item` | `T` |
| `vec` | `Float32Array` |

###### Returns

`void`

##### remove()

```ts
remove(pred): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pred` | (`item`) => `boolean` |

###### Returns

`number`

##### search()

```ts
search(
   q, 
   k?, 
   minScore?
): object[];
```

Top k by cosine at or above minScore, best first; ties keep insertion order.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `q` | `Float32Array` | `undefined` |
| `k?` | `number` | `5` |
| `minScore?` | `number` | `-1` |

###### Returns

`object`[]

## Interfaces

### Embedder

Anything that turns texts into vectors of one size: a transformers.js
MiniLM (Xenova/all-MiniLM-L6-v2, weights Apache-2.0), bge-small
(BAAI/bge-small-en-v1.5, weights MIT), a static model2vec table, or the
hashed embedder below. `id` names the model and settings; vectors are
cached under it, so a different id re-embeds every item.

#### Extended by

- [`StaticEmbedder`](#staticembedder)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-dim"></a> `dim` | `readonly` | `number` |
| <a id="property-id"></a> `id` | `readonly` | `string` |

#### Methods

##### embed()

```ts
embed(texts): Promise<Float32Array<ArrayBufferLike>[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `texts` | `string`[] |

###### Returns

`Promise`\<`Float32Array`\<`ArrayBufferLike`\>[]\>

***

### FeatureTensor

What a transformers.js feature-extraction pipeline returns.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data"></a> `data` | `ArrayLike`\<`number`\> |
| <a id="property-dims"></a> `dims` | `number`[] |

***

### SafeTensors

A parsed safetensors file: tensor names, header metadata and a getter by name.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-metadata"></a> `metadata` | `Record`\<`string`, `string`\> |
| <a id="property-names"></a> `names` | `string`[] |

#### Methods

##### get()

```ts
get(name): Tensor | null;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

[`Tensor`](#tensor) \| `null`

***

### StaticEmbedder

An Embedder that also embeds one text synchronously and exposes its tokenizer.

#### Extends

- [`Embedder`](#embedder)

#### Properties

| Property | Modifier | Type | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-dim-1"></a> `dim` | `readonly` | `number` | [`Embedder`](#embedder).[`dim`](#property-dim) |
| <a id="property-id-1"></a> `id` | `readonly` | `string` | [`Embedder`](#embedder).[`id`](#property-id) |
| <a id="property-tokenizer"></a> `tokenizer` | `readonly` | [`Tokenizer`](#tokenizer) | - |

#### Methods

##### embed()

```ts
embed(texts): Promise<Float32Array<ArrayBufferLike>[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `texts` | `string`[] |

###### Returns

`Promise`\<`Float32Array`\<`ArrayBufferLike`\>[]\>

###### Inherited from

[`Embedder`](#embedder).[`embed`](#embed)

##### embedOne()

```ts
embedOne(text): Float32Array;
```

One text, synchronously.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Float32Array`

***

### StaticFiles

The files a static embedder is built from: tokenizer, weights and an optional config.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-config"></a> `config?` | \| `string` \| \{ `normalize?`: `boolean`; \} | config.json text or object; `normalize` is read from it. |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Tokens per text before truncation. Default 512 (model2vec default). |
| <a id="property-name"></a> `name?` | `string` | A short model name for the id, e.g. "potion-base-8M". |
| <a id="property-tokenizer-1"></a> `tokenizer` | `string` \| [`TokenizerJson`](#tokenizerjson) | tokenizer.json text or parsed object, or a vocab.txt. |
| <a id="property-weights"></a> `weights` | `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> | model.safetensors bytes. |

***

### Tensor

One tensor read from a safetensors file: dtype, shape and its values.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-1"></a> `data` | `Float32Array`\<`ArrayBufferLike`\> \| `Int32Array`\<`ArrayBufferLike`\> |
| <a id="property-dtype"></a> `dtype` | `string` |
| <a id="property-shape"></a> `shape` | `number`[] |

***

### TjsEmbedderOptions

Settings for `tjsEmbedder`; each one that changes the vectors goes into the id.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-batch"></a> `batch?` | `number` | Texts per pipeline call. Default 16. |
| <a id="property-device"></a> `device?` | `string` | - |
| <a id="property-dim-2"></a> `dim?` | `number` | Vector size. Probed with one call when left out. |
| <a id="property-dtype-1"></a> `dtype?` | `string` | - |
| <a id="property-modelid"></a> `modelId` | `string` | - |
| <a id="property-normalize"></a> `normalize?` | `boolean` | - |
| <a id="property-pooling"></a> `pooling?` | `"mean"` \| `"cls"` | - |
| <a id="property-revision"></a> `revision?` | `string` | - |

***

### TjsLike

The pieces of transformers.js this adapter calls.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-pipeline"></a> `pipeline?` | (`task`, `model`, `opts`) => `Promise`\<`unknown`\> |

***

### Tokenizer

A loaded tokenizer that turns text into token ids with no special tokens.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-unkid"></a> `unkId` | `readonly` | `number` \| `null` |
| <a id="property-vocabsize"></a> `vocabSize` | `readonly` | `number` |

#### Methods

##### encode()

```ts
encode(text): number[];
```

Token ids for a text, with no special tokens added.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`number`[]

##### tokens()

```ts
tokens(text): string[];
```

Token strings, for tests and traces.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`string`[]

***

### TokenizerJson

BERT style tokenization from a Hugging Face tokenizer.json: the
BertNormalizer (clean text, pad CJK ideographs, strip accents,
lowercase), the BertPreTokenizer (split on whitespace and punctuation)
and WordPiece (greedy longest match with a continuation prefix). A
WordLevel model is read too. Unigram and BPE models are refused with a
message, since model2vec's English potion models ship WordPiece.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-added_tokens"></a> `added_tokens?` | `object`[] |
| <a id="property-model"></a> `model?` | `object` |
| `model.continuing_subword_prefix?` | `string` |
| `model.max_input_chars_per_word?` | `number` |
| `model.type?` | `string` |
| `model.unk_token?` | `string` |
| `model.vocab?` | `Record`\<`string`, `number`\> \| \[`string`, `number`\][] |
| <a id="property-normalizer"></a> `normalizer?` | `NormalizerJson` \| `null` |

## Type Aliases

### FeaturePipeline

```ts
type FeaturePipeline = (texts, opts) => Promise<FeatureTensor>;
```

A transformers.js feature extraction pipeline called with pooling and normalization.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `texts` | `string`[] |
| `opts` | \{ `normalize`: `boolean`; `pooling`: `"mean"` \| `"cls"` \| `"none"`; \} |
| `opts.normalize` | `boolean` |
| `opts.pooling` | `"mean"` \| `"cls"` \| `"none"` |

#### Returns

`Promise`\<[`FeatureTensor`](#featuretensor)\>

## Variables

### EMBED\_RECORDS

```ts
const EMBED_RECORDS: ModelRecord[];
```

Hub records for potion-base-8M, all-MiniLM-L6-v2 and bge-small-en-v1.5.

## Functions

### attachEmbed()

```ts
function attachEmbed(
   hub, 
   tjs?, 
   o?
): void;
```

Add the embed records to a hub, register the transformers.js loader for
"embed" (an Embedder, with the rung's dtype and device in its id) and the
static factory.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `tjs?` | `TjsProvider` |
| `o?` | \{ `fetch?`: (`input`, `init?`) => `Promise`\<`Response`\>; `sha256For?`: (`url`) => `string` \| `undefined`; \} |
| `o.fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> |
| `o.sha256For?` | (`url`) => `string` \| `undefined` |

#### Returns

`void`

***

### cosine()

```ts
function cosine(a, b): number;
```

The cosine similarity of two vectors, 0 when either is all zeros.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `Float32Array` |
| `b` | `Float32Array` |

#### Returns

`number`

***

### fnv1aBytes()

```ts
function fnv1aBytes(b, seed?): number;
```

FNV-1a 32 bit over bytes.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `b` | `Uint8Array` | `undefined` |
| `seed?` | `number` | `0x811c9dc5` |

#### Returns

`number`

***

### halfToFloat()

```ts
function halfToFloat(h): number;
```

IEEE half to float, exact for every half value.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | `number` |

#### Returns

`number`

***

### hashedEmbedder()

```ts
function hashedEmbedder(dim?): Embedder;
```

Hashed unigram plus bigram embedder: FNV-1a picks a bucket and a sign,
the vector is L2 normalized. No weights, no download, no licence. It
finds shared words and word pairs; it does not find paraphrase.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dim?` | `number` |

#### Returns

[`Embedder`](#embedder)

***

### loadStaticEmbedder()

```ts
function loadStaticEmbedder(base, o?): Promise<StaticEmbedder>;
```

Fetch the three files of a model2vec repo from a base URL (caller supplied) and build the embedder.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `base` | `string` |
| `o?` | \{ `fetch?`: (`input`, `init?`) => `Promise`\<`Response`\>; `name?`: `string`; `sha256For?`: (`url`) => `string` \| `undefined`; \} |
| `o.fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> |
| `o.name?` | `string` |
| `o.sha256For?` | (`url`) => `string` \| `undefined` |

#### Returns

`Promise`\<[`StaticEmbedder`](#staticembedder)\>

***

### loadTokenizer()

```ts
function loadTokenizer(src): Tokenizer;
```

Read a tokenizer.json (text or parsed) or a vocab.txt (one token per line, BERT uncased flags).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` \| [`TokenizerJson`](#tokenizerjson) |

#### Returns

[`Tokenizer`](#tokenizer)

***

### miniLM()

```ts
function miniLM(tjs, o?): Promise<Embedder>;
```

MiniLM through a transformers.js module the caller loaded (for example
`await loadTransformers()()` from @hackbuild/devices). Defaults: wasm and
q8; pass device "webgpu" and dtype "fp32" to move it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tjs` | [`TjsLike`](#tjslike) |
| `o?` | `Partial`\<[`TjsEmbedderOptions`](#tjsembedderoptions)\> |

#### Returns

`Promise`\<[`Embedder`](#embedder)\>

***

### normalize()

```ts
function normalize(text, f): string;
```

The BertNormalizer steps in their library order.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `f` | `NormFlags` |

#### Returns

`string`

***

### preTokenize()

```ts
function preTokenize(s): string[];
```

Whitespace split, then each punctuation character on its own.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`[]

***

### readSafetensors()

```ts
function readSafetensors(buf): SafeTensors;
```

Parse safetensors bytes; floats come out as Float32Array, integers as Int32Array.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `buf` | `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> |

#### Returns

[`SafeTensors`](#safetensors)

***

### staticEmbedder()

```ts
function staticEmbedder(f): StaticEmbedder;
```

Build the embedder. The id is `model2vec:<name>:<dim>:<weights hash>:<vocab hash>:<n|u>`,
computed from the bytes, so two loads of the same files give the same id
and any change to weights, vocabulary or normalization gives another.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | [`StaticFiles`](#staticfiles) |

#### Returns

[`StaticEmbedder`](#staticembedder)

***

### staticFactory()

```ts
function staticFactory(o?): Factory<Embedder>;
```

`sha256For` defaults to pinnedSha, so files at the pinned commit are checked.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `fetch?`: (`input`, `init?`) => `Promise`\<`Response`\>; `sha256For?`: (`url`) => `string` \| `undefined`; \} |
| `o.fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> |
| `o.sha256For?` | (`url`) => `string` \| `undefined` |

#### Returns

`Factory`\<[`Embedder`](#embedder)\>

***

### tjsEmbedder()

```ts
function tjsEmbedder(pipe, o): Promise<Embedder>;
```

Wrap a feature extraction pipeline as an Embedder that runs texts in batches.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pipe` | [`FeaturePipeline`](#featurepipeline) |
| `o` | [`TjsEmbedderOptions`](#tjsembedderoptions) |

#### Returns

`Promise`\<[`Embedder`](#embedder)\>

# transformers

## Interfaces

### LoadTransformersOptions

Options for `loadTransformers`: the module, model id, device, dtype and a progress callback.

#### Extends

- [`EngineOptions`](index.md#engineoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-device"></a> `device?` | `string` | - | - |
| <a id="property-dtype"></a> `dtype?` | `string` \| `Record`\<`string`, `string`\> | - | - |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`EngineOptions`](index.md#engineoptions).[`maxTokens`](index.md#property-maxtokens-1) |
| <a id="property-modelid"></a> `modelId` | `string` | - | - |
| <a id="property-module"></a> `module` | [`TransformersModule`](#transformersmodule) | - | - |
| <a id="property-noschema"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`EngineOptions`](index.md#engineoptions).[`noSchema`](index.md#property-noschema) |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`EngineOptions`](index.md#engineoptions).[`now`](index.md#property-now) |
| <a id="property-onprogress"></a> `onProgress?` | (`p`) => `void` | - | - |
| <a id="property-quirks"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`EngineOptions`](index.md#engineoptions).[`quirks`](index.md#property-quirks) |

***

### TextGenerationLike()

The parts of a transformers.js text generation pipeline this driver uses.

```ts
TextGenerationLike(messages, opts): Promise<unknown>;
```

The parts of a transformers.js text generation pipeline this driver uses.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | `object`[] |
| `opts` | `Record`\<`string`, `unknown`\> |

#### Returns

`Promise`\<`unknown`\>

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-tokenizer"></a> `tokenizer` | `unknown` |

#### Methods

##### dispose()?

```ts
dispose?(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

***

### TransformersDriverOptions

Options for `transformersDriver`: the module's streamer and stopping classes, a built pipeline, an id and the system role quirk.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-generator"></a> `generator` | [`TextGenerationLike`](#textgenerationlike) | - |
| <a id="property-id"></a> `id?` | `string` | - |
| <a id="property-module-1"></a> `module` | `Pick`\<[`TransformersModule`](#transformersmodule), `"TextStreamer"` \| `"InterruptableStoppingCriteria"`\> | - |
| <a id="property-systemrole"></a> `systemRole?` | `boolean` | Gemma 3 templates have no system role. |

***

### TransformersModule

The parts of the @huggingface/transformers module the loader uses.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-interruptablestoppingcriteria"></a> `InterruptableStoppingCriteria` | new () => `object` |
| <a id="property-textstreamer"></a> `TextStreamer` | new (`tokenizer`, `opts`) => `unknown` |

#### Methods

##### pipeline()

```ts
pipeline(
   task, 
   model, 
   opts?
): Promise<TextGenerationLike>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `task` | `"text-generation"` |
| `model` | `string` |
| `opts?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<[`TextGenerationLike`](#textgenerationlike)\>

## Variables

### TRANSFORMERS\_VERSION

```ts
const TRANSFORMERS_VERSION: "4.3.2" = "4.3.2";
```

The @huggingface/transformers version this file is written against.

## Functions

### loadTransformers()

```ts
function loadTransformers(o): Promise<ChatEngine>;
```

Builds a transformers.js text generation pipeline for a model id and wraps it in an engine.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`LoadTransformersOptions`](#loadtransformersoptions) |

#### Returns

`Promise`\<[`ChatEngine`](index.md#chatengine)\>

***

### transformersDriver()

```ts
function transformersDriver(o): Driver;
```

A driver over a transformers.js text generation pipeline that streams through TextStreamer and stops on abort.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`TransformersDriverOptions`](#transformersdriveroptions) |

#### Returns

[`Driver`](index.md#driver)

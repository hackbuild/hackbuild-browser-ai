# webllm

## Interfaces

### LoadWebLLMOptions

Options for `loadWebLLM`: the module, model id, wanted context window, custom catalog entries, a progress callback and native tools.

#### Extends

- [`EngineOptions`](index.md#engineoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-contextwindow"></a> `contextWindow?` | `number` | Wanted context window; the loader walks [want, 8192, 4096, 2048] filtered to at most want. | - |
| <a id="property-custommodels"></a> `customModels?` | `unknown`[] | Custom catalog entries (\{ model, model_id, model_lib \}) added before the prebuilt list. | - |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`EngineOptions`](index.md#engineoptions).[`maxTokens`](index.md#property-maxtokens-1) |
| <a id="property-modelid"></a> `modelId` | `string` | - | - |
| <a id="property-module"></a> `module` | [`WebLLMModule`](#webllmmodule) | - | - |
| <a id="property-nativetools"></a> `nativeTools?` | `boolean` | - | - |
| <a id="property-noschema"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`EngineOptions`](index.md#engineoptions).[`noSchema`](index.md#property-noschema) |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`EngineOptions`](index.md#engineoptions).[`now`](index.md#property-now) |
| <a id="property-onprogress"></a> `onProgress?` | (`p`) => `void` | - | - |
| <a id="property-quirks"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`EngineOptions`](index.md#engineoptions).[`quirks`](index.md#property-quirks) |

***

### MLCEngineLike

The parts of an MLCEngine this driver uses.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-chat"></a> `chat` | `object` |
| `chat.completions` | `object` |
| `chat.completions.create` | (`req`) => `Promise`\<`AsyncIterable`\<\{ `choices`: `object`[]; `usage?`: \{ `completion_tokens?`: `number`; `prompt_tokens?`: `number`; \}; \}, `any`, `any`\>\> |

#### Methods

##### interruptGenerate()?

```ts
interruptGenerate?(): void;
```

###### Returns

`void`

##### unload()?

```ts
unload?(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

***

### WebLLMCache

Lists, measures and evicts the models in WebLLM's own IndexedDB cache.

#### Methods

##### bytes()

```ts
bytes(): Promise<number>;
```

Bytes of every entry in the three databases, model or not.

###### Returns

`Promise`\<`number`\>

##### evict()

```ts
evict(modelId): Promise<void>;
```

Remove a model's weights, tokenizer, config and wasm. A wasm another stored model shares stays.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `modelId` | `string` |

###### Returns

`Promise`\<`void`\>

##### has()

```ts
has(modelId): Promise<boolean>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `modelId` | `string` |

###### Returns

`Promise`\<`boolean`\>

##### list()

```ts
list(): Promise<WebLLMCacheEntry[]>;
```

Models with at least one stored entry, largest first.

###### Returns

`Promise`\<[`WebLLMCacheEntry`](#webllmcacheentry)[]\>

***

### WebLLMCacheEntry

One model's share of WebLLM's own IndexedDB cache.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytes"></a> `bytes` | `number` | Bytes of weights, tokenizer, config and wasm stored for the model (measured by reading the entries). |
| <a id="property-files"></a> `files` | `number` | - |
| <a id="property-modelid-1"></a> `modelId` | `string` | - |

***

### WebLLMDriverOptions

Options for `webllmDriver`: a built MLCEngine, its model id and whether to send native tools.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-engine"></a> `engine` | [`MLCEngineLike`](#mlcenginelike) | - |
| <a id="property-modelid-2"></a> `modelId` | `string` | - |
| <a id="property-nativetools-1"></a> `nativeTools?` | `boolean` | Native tools: only the Hermes 2 Pro and Hermes 3 builds. tool_choice "required" is not sent. |

***

### WebLLMModelEntry

The fields of a WebLLM model_list entry the cache adapter reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-model"></a> `model` | `string` |
| <a id="property-model_id"></a> `model_id` | `string` |
| <a id="property-model_lib"></a> `model_lib?` | `string` |

***

### WebLLMModule

The parts of the @mlc-ai/web-llm module the loader uses.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-prebuiltappconfig"></a> `prebuiltAppConfig?` | `object` |
| `prebuiltAppConfig.model_list` | `unknown`[] |

#### Methods

##### CreateMLCEngine()

```ts
CreateMLCEngine(
   model, 
   cfg?, 
   chatOpts?
): Promise<MLCEngineLike>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` |
| `cfg?` | `Record`\<`string`, `unknown`\> |
| `chatOpts?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<[`MLCEngineLike`](#mlcenginelike)\>

***

### WebLLMPhase

A load step read from WebLLM's progress text, for a row with phase words.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-file"></a> `file?` | `string` | "3 of 24" when the text names a file count. |
| <a id="property-fraction"></a> `fraction` | `number` | 0 to 1 from the runtime's own figure. |
| <a id="property-phase"></a> `phase` | `"fetch"` \| `"compile"` \| `"ready"` | - |

## Variables

### WEBLLM\_DBS

```ts
const WEBLLM_DBS: readonly ["webllm/model", "webllm/config", "webllm/wasm"];
```

WebLLM 0.2.84's IndexedDB databases, each with one store "urls" keyed by "url".

***

### WEBLLM\_VERSION

```ts
const WEBLLM_VERSION: "0.2.84" = "0.2.84";
```

The @mlc-ai/web-llm version this file is pinned to.

## Functions

### loadWebLLM()

```ts
function loadWebLLM(o): Promise<ChatEngine & object>;
```

Create an MLCEngine with the context ladder, IndexedDB cache on, and wrap it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`LoadWebLLMOptions`](#loadwebllmoptions) |

#### Returns

`Promise`\<[`ChatEngine`](index.md#chatengine) & `object`\>

***

### webllmCache()

```ts
function webllmCache(o): WebLLMCache;
```

List and evict the WebLLM cache per model, so the weights manager shows
it as a second group ("kept by webllm") beside the one weight store.
Reads the IndexedDB layout WebLLM 0.2.84 writes with
`useIndexedDBCache: true`; nothing is imported from WebLLM. Pass the
same model_list the engine was built with (prebuilt plus custom).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `indexedDB?`: `IDBFactory`; `modelList`: readonly [`WebLLMModelEntry`](#webllmmodelentry)[]; \} |
| `o.indexedDB?` | `IDBFactory` |
| `o.modelList` | readonly [`WebLLMModelEntry`](#webllmmodelentry)[] |

#### Returns

[`WebLLMCache`](#webllmcache)

***

### webllmDriver()

```ts
function webllmDriver(o): Driver;
```

A driver over a WebLLM MLCEngine that streams chat completions and names a runtime and model library mismatch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`WebLLMDriverOptions`](#webllmdriveroptions) |

#### Returns

[`Driver`](index.md#driver)

***

### webllmPhase()

```ts
function webllmPhase(p): WebLLMPhase;
```

Map WebLLM 0.2.84 progress text to a phase: "Fetching param cache" and
"Loading model from cache" are fetch, "Loading GPU shader modules" is
compile, "Finish loading" is ready. Unknown text keeps the last phase a
caller saw; this returns fetch for it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | \{ `progress`: `number`; `text`: `string`; \} |
| `p.progress` | `number` |
| `p.text` | `string` |

#### Returns

[`WebLLMPhase`](#webllmphase)

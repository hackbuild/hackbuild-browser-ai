# wllama

## Interfaces

### LoadWllamaOptions

Options for `loadWllama`: the module, wasm URL, GGUF blobs, context size, GPU layers and the reasoning switch.

#### Extends

- [`EngineOptions`](index.md#engineoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-blobs"></a> `blobs` | `Blob`[] | GGUF file(s) as Blobs, e.g. from `@hackbuild/weights` store.get(). Split GGUF files go in order. | - |
| <a id="property-id"></a> `id?` | `string` | - | - |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`EngineOptions`](index.md#engineoptions).[`maxTokens`](index.md#property-maxtokens-1) |
| <a id="property-module"></a> `module` | [`WllamaModule`](#wllamamodule) | - | - |
| <a id="property-nctx"></a> `nCtx?` | `number` | Context size. Default 6144 (as earlier builds did). | - |
| <a id="property-ngpulayers"></a> `nGpuLayers?` | `number` | Default: all layers on webgpu when wllama reports support, else 0. | - |
| <a id="property-noschema"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`EngineOptions`](index.md#engineoptions).[`noSchema`](index.md#property-noschema) |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`EngineOptions`](index.md#engineoptions).[`now`](index.md#property-now) |
| <a id="property-quirks"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`EngineOptions`](index.md#engineoptions).[`quirks`](index.md#property-quirks) |
| <a id="property-reasoningoff"></a> `reasoningOff?` | `boolean` | Turn template reasoning off. Default true (reasoning: false, as the builds ran). | - |
| <a id="property-wasmurl"></a> `wasmUrl?` | `string` | wasm URL; default the jsdelivr URL for WLLAMA_VERSION. | - |

***

### WllamaDriverOptions

Options for `wllamaDriver`: a loaded Wllama, an id and whether to keep the KV prefix between calls.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cacheprompt"></a> `cachePrompt?` | `boolean` | Keep the KV prefix between calls (as earlier builds did). Default true. |
| <a id="property-id-1"></a> `id?` | `string` | - |
| <a id="property-wllama"></a> `wllama` | [`WllamaLike`](#wllamalike) | - |

***

### WllamaLike

The parts of a Wllama instance this driver uses.

#### Methods

##### createChatCompletion()

```ts
createChatCompletion(opts): Promise<AsyncIterable<{
  choices: object[];
}, any, any>>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`AsyncIterable`\<\{
  `choices`: `object`[];
\}, `any`, `any`\>\>

##### exit()?

```ts
exit?(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### getLoadedContextInfo()

```ts
getLoadedContextInfo(): unknown;
```

###### Returns

`unknown`

##### isSupportWebGPU()?

```ts
isSupportWebGPU?(): boolean;
```

###### Returns

`boolean`

##### loadModel()

```ts
loadModel(blobs, params?): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `blobs` | `Blob`[] |
| `params?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`void`\>

***

### WllamaModule

The parts of the @wllama/wllama module the loader uses.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-wllama-1"></a> `Wllama` | new (`paths`, `cfg?`) => [`WllamaLike`](#wllamalike) |

## Variables

### WLLAMA\_FALLBACK\_VERSION

```ts
const WLLAMA_FALLBACK_VERSION: "3.8.1" = "3.8.1";
```

The older @wllama/wllama version that stays the fallback.

***

### WLLAMA\_VERSION

```ts
const WLLAMA_VERSION: "4.0.0" = "4.0.0";
```

The @wllama/wllama version this file is pinned to.

## Functions

### loadWllama()

```ts
function loadWllama(o): Promise<ChatEngine & object>;
```

Construct wllama, load the GGUF blobs, and confirm the load with
getLoadedContextInfo(): wllama can resolve loadModel and still have no
model, so a load only counts when that call returns. The last native
error line is kept and named in the failure.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`LoadWllamaOptions`](#loadwllamaoptions) |

#### Returns

`Promise`\<[`ChatEngine`](index.md#chatengine) & `object`\>

***

### wllamaDriver()

```ts
function wllamaDriver(o): Driver;
```

A driver over a loaded Wllama that streams chat completions and prewarms its prefix cache.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`WllamaDriverOptions`](#wllamadriveroptions) |

#### Returns

[`Driver`](index.md#driver)

***

### wllamaUrls()

```ts
function wllamaUrls(version?): object;
```

jsdelivr URLs of the ESM entry and the wasm for a wllama version.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `WLLAMA_VERSION` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `esm` | `string` |
| `wasm` | `string` |

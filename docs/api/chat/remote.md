# remote

## Interfaces

### AnthropicOptions

Options for the Anthropic Messages API: base URL, API version header and the browser access header.

#### Extends

- [`RemoteOptions`](#remoteoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-apikey"></a> `apiKey?` | `string` | - | [`RemoteOptions`](#remoteoptions).[`apiKey`](#property-apikey-2) |
| <a id="property-base"></a> `base?` | `string` | Default https://api.anthropic.com | - |
| <a id="property-browser"></a> `browser?` | `boolean` | Send the header that lets a browser page call the API directly. Default true. | - |
| <a id="property-fetch"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - | [`RemoteOptions`](#remoteoptions).[`fetch`](#property-fetch-2) |
| <a id="property-headers"></a> `headers?` | `Record`\<`string`, `string`\> | - | [`RemoteOptions`](#remoteoptions).[`headers`](#property-headers-2) |
| <a id="property-licence"></a> `licence?` | `string` | Licence or terms of the remote model, shown by apps. | [`RemoteOptions`](#remoteoptions).[`licence`](#property-licence-2) |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`RemoteOptions`](#remoteoptions).[`maxTokens`](#property-maxtokens-2) |
| <a id="property-model"></a> `model` | `string` | - | [`RemoteOptions`](#remoteoptions).[`model`](#property-model-2) |
| <a id="property-noschema"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`RemoteOptions`](#remoteoptions).[`noSchema`](#property-noschema-2) |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`RemoteOptions`](#remoteoptions).[`now`](#property-now-2) |
| <a id="property-quirks"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`RemoteOptions`](#remoteoptions).[`quirks`](#property-quirks-2) |
| <a id="property-version"></a> `version?` | `string` | anthropic-version header. Default 2023-06-01. | - |

***

### OpenAIOptions

Options for an OpenAI compatible endpoint: the base URL, the schema mode and llama.cpp sampling fields.

#### Extends

- [`RemoteOptions`](#remoteoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-apikey-1"></a> `apiKey?` | `string` | - | [`RemoteOptions`](#remoteoptions).[`apiKey`](#property-apikey-2) |
| <a id="property-base-1"></a> `base` | `string` | Base URL up to and including /v1, e.g. http://localhost:11434/v1 (Ollama). | - |
| <a id="property-fetch-1"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - | [`RemoteOptions`](#remoteoptions).[`fetch`](#property-fetch-2) |
| <a id="property-headers-1"></a> `headers?` | `Record`\<`string`, `string`\> | - | [`RemoteOptions`](#remoteoptions).[`headers`](#property-headers-2) |
| <a id="property-licence-1"></a> `licence?` | `string` | Licence or terms of the remote model, shown by apps. | [`RemoteOptions`](#remoteoptions).[`licence`](#property-licence-2) |
| <a id="property-llamaparams"></a> `llamaParams?` | `boolean` | Send llama.cpp and Ollama sampling fields (`repeat_penalty`). OpenAI rejects them. Default false. | - |
| <a id="property-maxtokens-1"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`RemoteOptions`](#remoteoptions).[`maxTokens`](#property-maxtokens-2) |
| <a id="property-model-1"></a> `model` | `string` | - | [`RemoteOptions`](#remoteoptions).[`model`](#property-model-2) |
| <a id="property-noschema-1"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`RemoteOptions`](#remoteoptions).[`noSchema`](#property-noschema-2) |
| <a id="property-now-1"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`RemoteOptions`](#remoteoptions).[`now`](#property-now-2) |
| <a id="property-quirks-1"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`RemoteOptions`](#remoteoptions).[`quirks`](#property-quirks-2) |
| <a id="property-schemamode"></a> `schemaMode?` | `"json_schema"` \| `"json_object"` | "json_schema" (default) or "json_object" for servers that only take the older form. | - |

***

### RemoteOptions

Options shared by the remote engines: model, API key, fetch, extra headers and the model's licence or terms.

#### Extends

- [`EngineOptions`](index.md#engineoptions)

#### Extended by

- [`OpenAIOptions`](#openaioptions)
- [`AnthropicOptions`](#anthropicoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-apikey-2"></a> `apiKey?` | `string` | - | - |
| <a id="property-fetch-2"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - | - |
| <a id="property-headers-2"></a> `headers?` | `Record`\<`string`, `string`\> | - | - |
| <a id="property-licence-2"></a> `licence?` | `string` | Licence or terms of the remote model, shown by apps. | - |
| <a id="property-maxtokens-2"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`EngineOptions`](index.md#engineoptions).[`maxTokens`](index.md#property-maxtokens-1) |
| <a id="property-model-2"></a> `model` | `string` | - | - |
| <a id="property-noschema-2"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`EngineOptions`](index.md#engineoptions).[`noSchema`](index.md#property-noschema) |
| <a id="property-now-2"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`EngineOptions`](index.md#engineoptions).[`now`](index.md#property-now) |
| <a id="property-quirks-2"></a> `quirks?` | [`EngineQuirks`](index.md#enginequirks) | - | [`EngineOptions`](index.md#engineoptions).[`quirks`](index.md#property-quirks) |

## Functions

### anthropicDriver()

```ts
function anthropicDriver(o): Driver;
```

Anthropic Messages API driver. System turns go in `system`; a schema goes
in `output_config.format` as a json_schema. Sampling options are not sent,
since current models refuse temperature, top_p and top_k.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`AnthropicOptions`](#anthropicoptions) |

#### Returns

[`Driver`](index.md#driver)

***

### anthropicMessages()

```ts
function anthropicMessages(o): ChatEngine;
```

An engine over the Anthropic Messages API. `model` is required; there is no default.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`AnthropicOptions`](#anthropicoptions) |

#### Returns

[`ChatEngine`](index.md#chatengine)

***

### oaiMessages()

```ts
function oaiMessages(ms): Record<string, unknown>[];
```

Messages in the chat completions shape. A tool result goes out as a
native `tool` message only when it carries the id of a call echoed on
the assistant message before it; otherwise it is sent as user text, which
every compatible server accepts.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ms` | readonly [`ChatMessage`](index.md#chatmessage)[] |

#### Returns

`Record`\<`string`, `unknown`\>[]

***

### openaiCompatible()

```ts
function openaiCompatible(o): ChatEngine;
```

An engine over an OpenAI compatible endpoint.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`OpenAIOptions`](#openaioptions) |

#### Returns

[`ChatEngine`](index.md#chatengine)

***

### openaiDriver()

```ts
function openaiDriver(o): Driver;
```

A driver over an OpenAI compatible chat completions endpoint, streamed over server sent events.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`OpenAIOptions`](#openaioptions) |

#### Returns

[`Driver`](index.md#driver)

## References

### ChatMessage

Re-exports [ChatMessage](index.md#chatmessage)

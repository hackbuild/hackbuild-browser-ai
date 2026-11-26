# prompt-api

## Interfaces

### LanguageModelSession

The parts of a Chrome Prompt API session this driver uses.

#### Methods

##### destroy()?

```ts
destroy?(): void;
```

###### Returns

`void`

##### promptStreaming()

```ts
promptStreaming(input, opts?): AsyncIterable<string, any, any> | ReadableStream<string>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |
| `opts?` | \{ `responseConstraint?`: `unknown`; `signal?`: `AbortSignal`; \} |
| `opts.responseConstraint?` | `unknown` |
| `opts.signal?` | `AbortSignal` |

###### Returns

`AsyncIterable`\<`string`, `any`, `any`\> \| `ReadableStream`\<`string`\>

***

### LanguageModelStatic

The parts of Chrome's `LanguageModel` global this driver uses.

#### Methods

##### availability()

```ts
availability(opts?): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`"unavailable"` \| `"downloadable"` \| `"downloading"` \| `"available"`\>

##### create()

```ts
create(opts?): Promise<LanguageModelSession>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<[`LanguageModelSession`](#languagemodelsession)\>

***

### PromptApiOptions

Options for the Prompt API engine: the `LanguageModel` to use, a download progress callback and the languages in and out.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-languagemodel"></a> `LanguageModel?` | [`LanguageModelStatic`](#languagemodelstatic) | - |
| <a id="property-languages"></a> `languages?` | `string`[] | Languages of the text in and out. Default ["en"]; Chrome warns when none is given. |
| <a id="property-ondownload"></a> `onDownload?` | (`fraction`) => `void` | - |

## Functions

### getLanguageModel()

```ts
function getLanguageModel(g?): LanguageModelStatic | null;
```

Returns the `LanguageModel` global when the browser has one, else null.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `g?` | `unknown` | `globalThis` |

#### Returns

[`LanguageModelStatic`](#languagemodelstatic) \| `null`

***

### promptApi()

```ts
function promptApi(o?): ChatEngine;
```

An engine over Chrome's built in Prompt API.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`PromptApiOptions`](#promptapioptions) & [`EngineOptions`](index.md#engineoptions) |

#### Returns

[`ChatEngine`](index.md#chatengine)

***

### promptApiDriver()

```ts
function promptApiDriver(o?): Driver;
```

A driver over Chrome's built in Prompt API that creates a session per request from the history.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`PromptApiOptions`](#promptapioptions) |

#### Returns

[`Driver`](index.md#driver)

***

### promptLanguages()

```ts
function promptLanguages(languages?): Record<string, unknown>;
```

The expected input and output languages, as availability() and create() take them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `languages?` | readonly `string`[] |

#### Returns

`Record`\<`string`, `unknown`\>

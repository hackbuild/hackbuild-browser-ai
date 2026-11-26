# index

## Classes

### Channel

Push based async queue: turns callback streams into async iterables.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Implements

- `AsyncIterable`\<`T`\>

#### Constructors

##### Constructor

```ts
new Channel<T>(): Channel<T>;
```

###### Returns

[`Channel`](#channel)\<`T`\>

#### Methods

##### \[asyncIterator\]()

```ts
[asyncIterator](): AsyncIterator<T>;
```

###### Returns

`AsyncIterator`\<`T`\>

###### Implementation of

`AsyncIterable.[asyncIterator]`

##### close()

```ts
close(): void;
```

###### Returns

`void`

##### fail()

```ts
fail(e): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

###### Returns

`void`

##### push()

```ts
push(v): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | `T` |

###### Returns

`void`

***

### ChatError

An error from a chat engine, with a `code` (schema, http, runtime, load, abort or unavailable) and the HTTP status when there is one.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ChatError(
   code, 
   message, 
   status?
): ChatError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | `"unavailable"` \| `"schema"` \| `"http"` \| `"runtime"` \| `"load"` \| `"abort"` |
| `message` | `string` |
| `status?` | `number` |

###### Returns

[`ChatError`](#chaterror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `readonly` | `"unavailable"` \| `"schema"` \| `"http"` \| `"runtime"` \| `"load"` \| `"abort"` |
| <a id="property-status"></a> `status` | `readonly` | `number` \| `undefined` |

***

### SessionError

The error a session read throws, with a lowercase reason such as `not a chat session: no messages list`.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new SessionError(message): SessionError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |

###### Returns

[`SessionError`](#sessionerror)

###### Overrides

`Error.constructor`

***

### ThinkSplitter

Separates think blocks from visible text as a stream arrives, closed or unclosed, holding back half a tag until it can be read.

#### Constructors

##### Constructor

```ts
new ThinkSplitter(): ThinkSplitter;
```

###### Returns

[`ThinkSplitter`](#thinksplitter)

#### Methods

##### end()

```ts
end(): object;
```

Flush at end of stream. An unclosed think block stays think.

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `text` | `string` |
| `think` | `string` |

##### push()

```ts
push(chunk): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `chunk` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `text` | `string` |
| `think` | `string` |

## Interfaces

### ChatEngine

A chat engine over one runtime, with the same stream, complete, prewarm and dispose calls for every runtime.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-caps"></a> `caps` | `readonly` | [`DriverCaps`](#drivercaps) |
| <a id="property-id"></a> `id` | `readonly` | `string` |
| <a id="property-provider"></a> `provider` | `readonly` | `string` |

#### Methods

##### complete()

```ts
complete(messages, opts?): Promise<ChatResult>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`ChatMessage`](#chatmessage)[] |
| `opts?` | [`StreamOptions`](#streamoptions) |

###### Returns

`Promise`\<[`ChatResult`](#chatresult)\>

##### dispose()

```ts
dispose(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### prewarm()?

```ts
prewarm?(messages, opts?): Promise<boolean>;
```

Evaluate the system prompt and history before the first send, so the
first reply starts sooner. Resolves true when the driver ran it, false
when it has no prefix cache and nothing was called.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`ChatMessage`](#chatmessage)[] |
| `opts?` | `Pick`\<[`StreamOptions`](#streamoptions), `"signal"`\> |

###### Returns

`Promise`\<`boolean`\>

##### stream()

```ts
stream(messages, opts?): AsyncGenerator<ChatEvent, ChatResult>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`ChatMessage`](#chatmessage)[] |
| `opts?` | [`StreamOptions`](#streamoptions) |

###### Returns

`AsyncGenerator`\<[`ChatEvent`](#chatevent), [`ChatResult`](#chatresult)\>

***

### ChatMessage

One turn of a conversation: a role, its text, and for tool turns the tool name, call id or calls.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-content"></a> `content` | `string` | - |
| <a id="property-name"></a> `name?` | `string` | Tool name for role "tool". |
| <a id="property-role"></a> `role` | [`Role`](#role) | - |
| <a id="property-toolcallid"></a> `toolCallId?` | `string` | For role "tool": the id of the call this result answers (OpenAI `tool_call_id`). |
| <a id="property-toolcalls"></a> `toolCalls?` | [`ToolCall`](#toolcall)[] | For role "assistant": the tool calls the model made in this turn, echoed back to native tool APIs. |

***

### ChatResult

A finished reply: visible text, think text, finish reason, tool calls, schema fallback state, usage and timing stats.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-finish"></a> `finish` | [`Finish`](#finish) | - |
| <a id="property-schemafallback"></a> `schemaFallback` | `boolean` | The schema was refused and the reply came as free text with the schema in the prompt. |
| <a id="property-schemaindex"></a> `schemaIndex` | `number` | Index of the schema the runtime took: 0 for `schema`, 1 and up for `fallbackSchemas`, -1 for none. |
| <a id="property-stats"></a> `stats` | [`ReplyStats`](#replystats) | - |
| <a id="property-text"></a> `text` | `string` | - |
| <a id="property-think"></a> `think` | `string` | - |
| <a id="property-toolcalls-1"></a> `toolCalls` | [`ToolCall`](#toolcall)[] | - |
| <a id="property-usage"></a> `usage?` | `object` | - |
| `usage.input?` | `number` | - |
| `usage.output?` | `number` | - |

***

### ChatSession

A saved chat in the `.hbchat.json` shape: id, title, times, model, system text, settings and messages.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-created"></a> `created` | `number` | - |
| <a id="property-id-1"></a> `id` | `string` | - |
| <a id="property-kind"></a> `kind` | `"hackbuild.chat"` | - |
| <a id="property-messages"></a> `messages` | [`SessionMessage`](#sessionmessage)[] | - |
| <a id="property-model"></a> `model?` | `object` | - |
| `model.id` | `string` | - |
| `model.provider?` | `string` | - |
| <a id="property-params"></a> `params?` | `Record`\<`string`, `string` \| `number` \| `boolean`\> | Sampling and context settings as they were set. |
| <a id="property-system"></a> `system?` | `string` | - |
| <a id="property-title"></a> `title` | `string` | - |
| <a id="property-updated"></a> `updated` | `number` | - |
| <a id="property-version"></a> `version` | `1` | - |

***

### Driver

A runtime adapter. Each optional runtime lives behind a subpath export.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-caps-1"></a> `caps` | `readonly` | [`DriverCaps`](#drivercaps) |
| <a id="property-id-2"></a> `id` | `readonly` | `string` |
| <a id="property-provider-1"></a> `provider` | `readonly` | `string` |

#### Methods

##### dispose()?

```ts
dispose?(): void | Promise<void>;
```

###### Returns

`void` \| `Promise`\<`void`\>

##### prewarm()?

```ts
prewarm?(req): Promise<void>;
```

Evaluate the prompt into the runtime's prefix cache with no output. Drivers with no prefix cache leave it out.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`DriverRequest`](#driverrequest) |

###### Returns

`Promise`\<`void`\>

##### stream()

```ts
stream(req): AsyncIterable<DriverEvent>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`DriverRequest`](#driverrequest) |

###### Returns

`AsyncIterable`\<[`DriverEvent`](#driverevent)\>

***

### DriverCaps

What a runtime supports: constrained output, native tools, a system role and stop strings.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-schema"></a> `schema` | `boolean` | Grammar or schema constrained output. |
| <a id="property-stop"></a> `stop` | `boolean` | The runtime handles stop strings itself. The engine cuts too, either way. |
| <a id="property-systemrole"></a> `systemRole` | `boolean` | The runtime takes a system role (Gemma 3 templates do not). |
| <a id="property-tools"></a> `tools` | `boolean` | - |

***

### DriverRequest

The request an engine hands its driver after normalizing messages and options.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-maxtokens"></a> `maxTokens` | `number` |
| <a id="property-messages-1"></a> `messages` | [`ChatMessage`](#chatmessage)[] |
| <a id="property-minp"></a> `minP?` | `number` |
| <a id="property-repetitionpenalty"></a> `repetitionPenalty?` | `number` |
| <a id="property-schema-1"></a> `schema?` | [`JsonSchema`](#jsonschema) |
| <a id="property-signal"></a> `signal?` | `AbortSignal` |
| <a id="property-stop-1"></a> `stop?` | `string`[] |
| <a id="property-temperature"></a> `temperature?` | `number` |
| <a id="property-tools-1"></a> `tools?` | [`ToolSpec`](#toolspec)[] |
| <a id="property-topk"></a> `topK?` | `number` |
| <a id="property-topp"></a> `topP?` | `number` |

***

### EngineOptions

Options for `createEngine`: quirks, default max tokens, starting with schemas off, and the clock for reply stats.

#### Extended by

- [`LoadWebLLMOptions`](webllm.md#loadwebllmoptions)
- [`LoadWllamaOptions`](wllama.md#loadwllamaoptions)
- [`LoadTransformersOptions`](transformers.md#loadtransformersoptions)
- [`RemoteOptions`](remote.md#remoteoptions)
- [`ScriptedOptions`](#scriptedoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxtokens-1"></a> `maxTokens?` | `number` | Default max tokens. 512. |
| <a id="property-noschema"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. |
| <a id="property-quirks"></a> `quirks?` | [`EngineQuirks`](#enginequirks) | - |

***

### EngineQuirks

Template quirks of a model: whether it takes a system role, needs strict user and assistant alternation, or wants a default repetition penalty.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-repetitionpenalty-1"></a> `repetitionPenalty?` | `number` |
| <a id="property-strictalternation"></a> `strictAlternation?` | `boolean` |
| <a id="property-systemrole-1"></a> `systemRole?` | `boolean` |

***

### NormalizeOptions

Options for `normalizeMessages`: system role, strict alternation and tool results as user turns.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-strictalternation-1"></a> `strictAlternation?` | `boolean` | Join same role turns and start with a user turn. Default false. |
| <a id="property-systemrole-2"></a> `systemRole?` | `boolean` | false: merge system text into the first user turn. Default true. |
| <a id="property-toolasuser"></a> `toolAsUser?` | `boolean` | Tool results become user turns prefixed with the tool name when the runtime has no tool role. Default true. |

***

### ReplyStats

Timing of one reply, from the engine's clock.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-firsttokenms"></a> `firstTokenMs` | `number` \| `null` | Time from the request to the first token, text or think; null for an empty reply. |
| <a id="property-tokens"></a> `tokens` | `number` | Output tokens: from the runtime's usage when it reports one, else one per streamed chunk. |
| <a id="property-tokenspersecond"></a> `tokensPerSecond` | `number` \| `null` | Output tokens per second after the first token; null when the reply was empty or took no time. |
| <a id="property-tokenssource"></a> `tokensSource` | `"measured"` \| `"inferred"` | "measured" when tokens came from the runtime's usage; "inferred" when counted from stream chunks. |
| <a id="property-totalms"></a> `totalMs` | `number` | Time from the request to the end of the reply. |

***

### ScriptedOptions

Options for a scripted engine: the replies or a function of the request, chunk size, a schema refusal message and caps.

#### Extends

- [`EngineOptions`](#engineoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-chunk"></a> `chunk?` | `number` | Characters per streamed piece. Default 4. | - |
| <a id="property-id-3"></a> `id?` | `string` | - | - |
| <a id="property-maxtokens-2"></a> `maxTokens?` | `number` | Default max tokens. 512. | [`EngineOptions`](#engineoptions).[`maxTokens`](#property-maxtokens-1) |
| <a id="property-noschema-1"></a> `noSchema?` | `boolean` | Start with schemas off (a runtime known to reject them). | [`EngineOptions`](#engineoptions).[`noSchema`](#property-noschema) |
| <a id="property-now-1"></a> `now?` | () => `number` | Clock in ms for reply stats. Default performance.now where present, else Date.now. | [`EngineOptions`](#engineoptions).[`now`](#property-now) |
| <a id="property-quirks-1"></a> `quirks?` | [`EngineQuirks`](#enginequirks) | - | [`EngineOptions`](#engineoptions).[`quirks`](#property-quirks) |
| <a id="property-refuseschema"></a> `refuseSchema?` | `string` | Reject a request that carries a schema with this message (to exercise the fallback). | - |
| <a id="property-replies"></a> `replies` | readonly `string`[] \| ((`req`, `call`) => `string`) | Replies in order (the last one repeats), or a function of the request. | - |
| <a id="property-schema-2"></a> `schema?` | `boolean` | - | - |
| <a id="property-systemrole-3"></a> `systemRole?` | `boolean` | - | - |

***

### SessionMessage

One stored message: visible text, the raw reply, think text, error, stats, seen and recalled lines, cues and tool calls.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at?` | `number` | Time the message was made, in the caller's clock (ms). |
| <a id="property-content-1"></a> `content` | `string` | Visible text. |
| <a id="property-cues"></a> `cues?` | `unknown` | Cue marks recorded while the reply was spoken, for replay. |
| <a id="property-edited"></a> `edited?` | `boolean` | - |
| <a id="property-error"></a> `error?` | `string` | The reply failed with this line; the message stays, flagged. |
| <a id="property-id-4"></a> `id` | `string` | - |
| <a id="property-raw"></a> `raw?` | `string` | The reply as the model wrote it, tags and all; this is what goes back into history. |
| <a id="property-recalled"></a> `recalled?` | `object`[] | Memories recalled for this turn, by id, so "memory used (n)" can link to them. |
| <a id="property-role-1"></a> `role` | `Role` | - |
| <a id="property-seen"></a> `seen?` | `string` | What the camera saw when the turn was sent. |
| <a id="property-stats-1"></a> `stats?` | `ReplyStats` | - |
| <a id="property-think-1"></a> `think?` | `string` | - |
| <a id="property-toolcalls-2"></a> `toolCalls?` | `ToolCall`[] | - |

***

### StreamOptions

Options for one reply: sampling, stop strings, schema and fallbacks, tools, an abort signal and what to do with think blocks.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fallbackschemas"></a> `fallbackSchemas?` | [`JsonSchema`](#jsonschema)[] | Looser schemas tried in order when the runtime refuses `schema` before free text. |
| <a id="property-maxtokens-3"></a> `maxTokens?` | `number` | - |
| <a id="property-minp-1"></a> `minP?` | `number` | - |
| <a id="property-repetitionpenalty-2"></a> `repetitionPenalty?` | `number` | - |
| <a id="property-schema-3"></a> `schema?` | [`JsonSchema`](#jsonschema) | Ask for JSON matching this schema. Falls back to free text with the schema in the prompt when the runtime refuses it. |
| <a id="property-signal-1"></a> `signal?` | `AbortSignal` | - |
| <a id="property-stop-2"></a> `stop?` | `string`[] | Cut the reply at the first of these strings. |
| <a id="property-temperature-1"></a> `temperature?` | `number` | - |
| <a id="property-think-2"></a> `think?` | `"emit"` \| `"drop"` | Keep think blocks in `think` events (default) or drop them. Visible text never holds them. |
| <a id="property-tools-2"></a> `tools?` | [`ToolSpec`](#toolspec)[] | Native tools; only engines with caps.tools use them. |
| <a id="property-topk-1"></a> `topK?` | `number` | - |
| <a id="property-topp-1"></a> `topP?` | `number` | - |

***

### ToolCall

A tool call the model made, with its arguments as the JSON string the model wrote.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-arguments"></a> `arguments` | `string` | Arguments as the model wrote them (a JSON string). |
| <a id="property-id-5"></a> `id?` | `string` | - |
| <a id="property-name-1"></a> `name` | `string` | - |

***

### ToolSpec

A tool the model may call: its name, a description and a JSON Schema for its arguments.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-description"></a> `description?` | `string` |
| <a id="property-name-2"></a> `name` | `string` |
| <a id="property-parameters"></a> `parameters` | [`JsonSchema`](#jsonschema) |

## Type Aliases

### ChatEvent

```ts
type ChatEvent = 
  | {
  text: string;
  type: "text";
}
  | {
  text: string;
  type: "think";
}
  | {
  calls: ToolCall[];
  type: "tool";
}
  | {
  result: ChatResult;
  type: "done";
};
```

Events the engine yields to callers: visible text and think text are separate.

***

### DriverEvent

```ts
type DriverEvent = 
  | {
  text: string;
  type: "text";
}
  | {
  text: string;
  type: "think";
}
  | {
  calls: ToolCall[];
  type: "tool";
}
  | {
  finish: Finish;
  type: "done";
  usage?: {
     input?: number;
     output?: number;
  };
};
```

What a driver yields. Drivers do not strip think tags; the engine does.

***

### Finish

```ts
type Finish = "stop" | "length" | "abort" | "tool" | "refusal" | "error";
```

Why a reply ended.

***

### JsonSchema

```ts
type JsonSchema = Record<string, unknown>;
```

JSON Schema as a plain object.

***

### Role

```ts
type Role = "system" | "user" | "assistant" | "tool";
```

One streaming chat interface over every runtime.

## Variables

### PREWARM\_DELAY\_MS

```ts
const PREWARM_DELAY_MS: 1200 = 1200;
```

Wait after a prompt, model or persona change before prewarming again (1.2 s, vendor).

***

### SESSION\_KIND

```ts
const SESSION_KIND: "hackbuild.chat" = "hackbuild.chat";
```

The `kind` field of every chat session file.

***

### SESSION\_VERSION

```ts
const SESSION_VERSION: 1 = 1;
```

The session schema version this build writes and the newest it reads.

## Functions

### createEngine()

```ts
function createEngine(driver, opts?): ChatEngine;
```

Wraps a driver in a chat engine that normalizes roles, splits think blocks, cuts stop strings and falls back from schema to free text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `driver` | [`Driver`](#driver) |
| `opts?` | [`EngineOptions`](#engineoptions) |

#### Returns

[`ChatEngine`](#chatengine)

***

### createSession()

```ts
function createSession(o): ChatSession;
```

Make an empty session with the id and time you give; the title defaults to `new chat`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `id`: `string`; `model?`: \{ `id`: `string`; `provider?`: `string`; \}; `now`: `number`; `system?`: `string`; `title?`: `string`; \} |
| `o.id` | `string` |
| `o.model?` | \{ `id`: `string`; `provider?`: `string`; \} |
| `o.model.id` | `string` |
| `o.model.provider?` | `string` |
| `o.now` | `number` |
| `o.system?` | `string` |
| `o.title?` | `string` |

#### Returns

[`ChatSession`](#chatsession)

***

### exportSession()

```ts
function exportSession(s): string;
```

The session as `.hbchat.json` text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`ChatSession`](#chatsession) |

#### Returns

`string`

***

### importSession()

```ts
function importSession(input, fill?): ChatSession;
```

Read `.hbchat.json` text (or a parsed object) into the current version. Throws SessionError with a lowercase reason.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `unknown` |
| `fill?` | \{ `id?`: `string`; `now?`: `number`; \} |
| `fill.id?` | `string` |
| `fill.now?` | `number` |

#### Returns

[`ChatSession`](#chatsession)

***

### isSchemaError()

```ts
function isSchemaError(e, sentSchema): boolean;
```

Tells whether an error is the runtime refusing a schema, counted only when a schema was sent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |
| `sentSchema` | `boolean` |

#### Returns

`boolean`

***

### maskKey()

```ts
function maskKey(key): string;
```

Mask an API key for display: first 4 and last 4 characters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

#### Returns

`string`

***

### migrateSession()

```ts
function migrateSession(raw, fill?): ChatSession;
```

Bring any accepted shape to the current version: a versioned session,
or an unversioned export holding a `messages` array. Unknown fields are
dropped; a missing id, title or time is filled from `fill`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `unknown` |
| `fill?` | \{ `id?`: `string`; `now?`: `number`; \} |
| `fill.id?` | `string` |
| `fill.now?` | `number` |

#### Returns

[`ChatSession`](#chatsession)

***

### normalizeMessages()

```ts
function normalizeMessages(input, o?): ChatMessage[];
```

Rewrites a message list for a template: merges system turns, turns tool results into user turns, and joins same role turns when asked.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | readonly [`ChatMessage`](#chatmessage)[] |
| `o?` | [`NormalizeOptions`](#normalizeoptions) |

#### Returns

[`ChatMessage`](#chatmessage)[]

***

### schemaInstruction()

```ts
function schemaInstruction(schema): string;
```

The system prompt text that asks for one JSON object matching a schema, used when the runtime refuses the schema itself.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schema` | [`JsonSchema`](#jsonschema) |

#### Returns

`string`

***

### scripted()

```ts
function scripted(o): ChatEngine & object;
```

An engine over `scriptedDriver`, for stub pages and tests.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ScriptedOptions`](#scriptedoptions) |

#### Returns

[`ChatEngine`](#chatengine) & `object`

***

### scriptedDriver()

```ts
function scriptedDriver(o): Driver & object;
```

A driver with no model that streams fixed replies in small pieces and records each request in `calls`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ScriptedOptions`](#scriptedoptions) |

#### Returns

[`Driver`](#driver) & `object`

***

### sessionMessages()

```ts
function sessionMessages(s): ChatMessage[];
```

The messages to send an engine: the system text first, raw replies in
place of their stripped text, and failed or empty replies left out.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`ChatSession`](#chatsession) |

#### Returns

`ChatMessage`[]

***

### sessionToMarkdown()

```ts
function sessionToMarkdown(s): string;
```

The session as markdown: a title line, then one section per message.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`ChatSession`](#chatsession) |

#### Returns

`string`

***

### splitThink()

```ts
function splitThink(s): object;
```

Splits a whole text into visible text and think text, both trimmed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `text` | `string` |
| `think` | `string` |

***

### sse()

```ts
function sse(body, signal?): AsyncGenerator<{
  data: string;
  event: string;
}>;
```

Server sent events from a fetch body. Yields \{ event, data \} per message.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `ReadableStream`\<`Uint8Array`\<`ArrayBufferLike`\>\> |
| `signal?` | `AbortSignal` |

#### Returns

`AsyncGenerator`\<\{
  `data`: `string`;
  `event`: `string`;
\}\>

***

### stripMarkers()

```ts
function stripMarkers(s): string;
```

Removes ChatML, Llama 3, Gemma and channel control markers that small models leak into text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`

***

### stripThink()

```ts
function stripThink(s): string;
```

Remove think blocks, closed or unclosed, and control markers from a whole text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`

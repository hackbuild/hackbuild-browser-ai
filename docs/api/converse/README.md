# @hackbuild/converse

## Classes

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

## Interfaces

### ChatMessage

One message of a request: role, text, and the tool calls or tool result id when there are any.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-content"></a> `content` | `string` |
| <a id="property-name"></a> `name?` | `string` |
| <a id="property-role"></a> `role` | [`Role`](#role) |
| <a id="property-toolcallid"></a> `toolCallId?` | `string` |
| <a id="property-toolcalls"></a> `toolCalls?` | [`ToolCall`](#toolcall)[] |

***

### ChatSession

A saved chat in the `.hbchat.json` shape: id, title, times, model, system text, settings and messages.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-created"></a> `created` | `number` | - |
| <a id="property-id"></a> `id` | `string` | - |
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

### ChatSink

Where sessions live; the suite backs it with its document store.

#### Methods

##### load()

```ts
load(id): Promise<unknown>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`unknown`\>

##### save()

```ts
save(session): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | [`ChatSession`](#chatsession) |

###### Returns

`Promise`\<`void`\>

***

### ChatStore

A debounced saver of one session; it drops saves until `markRestored()` is called.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-restored"></a> `restored` | `readonly` | `boolean` | False until `restored()` is called; saves before that are dropped. |

#### Methods

##### flush()

```ts
flush(): Promise<void>;
```

Save now if a save is waiting.

###### Returns

`Promise`\<`void`\>

##### markRestored()

```ts
markRestored(): void;
```

###### Returns

`void`

##### save()

```ts
save(session): void;
```

Schedule a save of this session.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | [`ChatSession`](#chatsession) |

###### Returns

`void`

***

### Conversation

A running conversation: send, stop, redo, edit, remove, speak again, restore and clear, with events through `on`.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-busy"></a> `busy` | `readonly` | `boolean` |
| <a id="property-session"></a> `session` | `readonly` | [`ChatSession`](#chatsession) |

#### Methods

##### clear()

```ts
clear(): void;
```

Start over: no messages, the greeting again.

###### Returns

`void`

##### edit()

```ts
edit(id, text): Promise<SessionMessage | null>;
```

Change a turn and drop everything after it; a changed user turn is answered again.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `text` | `string` |

###### Returns

`Promise`\<[`SessionMessage`](#sessionmessage) \| `null`\>

##### flush()

```ts
flush(): Promise<void>;
```

Write a waiting save now.

###### Returns

`Promise`\<`void`\>

##### on()

```ts
on(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### prewarm()

```ts
prewarm(): Promise<boolean>;
```

Evaluate the current request into the engine's prefix cache.

###### Returns

`Promise`\<`boolean`\>

##### reached()

```ts
reached(offset): void;
```

Speech reached this offset of the visible text; call it from the speaker's progress.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `offset` | `number` |

###### Returns

`void`

##### redo()

```ts
redo(): Promise<SessionMessage | null>;
```

Drop the last reply and ask again.

###### Returns

`Promise`\<[`SessionMessage`](#sessionmessage) \| `null`\>

##### remove()

```ts
remove(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

##### request()

```ts
request(): ChatMessage[];
```

The request the next reply would send.

###### Returns

[`ChatMessage`](#chatmessage)[]

##### restore()

```ts
restore(): Promise<ChatSession>;
```

Load the stored session (or start one with the greeting); saves start after this resolves.

###### Returns

`Promise`\<[`ChatSession`](#chatsession)\>

##### send()

```ts
send(text): Promise<SessionMessage | null>;
```

Add a user turn and stream the reply. Resolves with the reply, or null when it was empty or aborted before a word.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Promise`\<[`SessionMessage`](#sessionmessage) \| `null`\>

##### speak()

```ts
speak(id): boolean;
```

Speak a message again, replaying its recorded cues; false when there is no speaker or no such message.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`boolean`

##### stop()

```ts
stop(): void;
```

Abort the reply and the voice.

###### Returns

`void`

***

### ConverseEngine

The engine a conversation streams from: a `stream` of events per request, and an optional `prewarm` that fills the prefix cache.

#### Methods

##### prewarm()?

```ts
prewarm?(messages, opts?): Promise<boolean>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`ChatMessage`](#chatmessage)[] |
| `opts?` | \{ `signal?`: `AbortSignal`; \} |
| `opts.signal?` | `AbortSignal` |

###### Returns

`Promise`\<`boolean`\>

##### stream()

```ts
stream(messages, opts?): AsyncIterable<EngineEvent>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | readonly [`ChatMessage`](#chatmessage)[] |
| `opts?` | \{ `signal?`: `AbortSignal`; \} |
| `opts.signal?` | `AbortSignal` |

###### Returns

`AsyncIterable`\<[`EngineEvent`](#engineevent)\>

***

### ConverseOptions

What a conversation needs: the engine and a clock, and optionally the system text, greeting, history cap, director, speaker, memory, camera line and sink.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-debouncems"></a> `debounceMs?` | `number` | - |
| <a id="property-director"></a> `director?` | [`DirectorLike`](#directorlike) | - |
| <a id="property-engine"></a> `engine` | [`ConverseEngine`](#converseengine) | - |
| <a id="property-greeting"></a> `greeting?` | `string` | An assistant line shown first in a new conversation; it never goes to the engine. |
| <a id="property-historylimit"></a> `historyLimit?` | `number` | Keep at most this many messages in a request; never fewer than 2. |
| <a id="property-id-1"></a> `id?` | `string` | Session id to restore and save under. Default "chat". |
| <a id="property-makeid"></a> `makeId?` | () => `string` | New message ids. Default a counter on the clock. |
| <a id="property-memory"></a> `memory?` | `object` | Recall for a user turn; the lines are kept on that turn. |
| `memory.recall` | (`text`) => `Promise`\<`object`[]\> \| `object`[] | - |
| <a id="property-now"></a> `now` | () => `number` | Clock in ms for message times and new sessions. |
| <a id="property-replaycue"></a> `replayCue?` | (`cue`) => `void` | Fires a recorded cue when a message is spoken again. |
| <a id="property-seen"></a> `seen?` | () => `string` \| `null` \| `undefined` | What the camera sees now, one line, or nothing. |
| <a id="property-sink"></a> `sink?` | [`ChatSink`](#chatsink) | - |
| <a id="property-speaker"></a> `speaker?` | [`SpeakerLike`](#speakerlike) | - |
| <a id="property-streamoptions"></a> `streamOptions?` | `Record`\<`string`, `unknown`\> | Options passed to every `engine.stream` call, e.g. maxTokens. |
| <a id="property-system-1"></a> `system?` | `string` | - |
| <a id="property-timers"></a> `timers?` | [`Timers`](#timers) | - |

***

### DirectorLike

The part of an `@hackbuild/act` Director the turn loop drives.

#### Methods

##### begin()

```ts
begin(): void;
```

###### Returns

`void`

##### feed()

```ts
feed(chunk): object;
```

Raw model text in, visible text of this chunk out.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `chunk` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `text` | `string` |

##### finish()

```ts
finish(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `text` | `string` |

##### reached()

```ts
reached(offset): unknown;
```

Speech reached this offset of the visible text; fires the cues due.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `offset` | `number` |

###### Returns

`unknown`

##### record()

```ts
record(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cues` | [`RecordedCue`](#recordedcue)[] |

***

### HistoryOptions

What `buildMessages` applies: a message cap, and whether memory and seen notes and lines go in.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-limit"></a> `limit?` | `number` | Keep at most this many messages after the system text; never fewer than 2. Default all. |
| <a id="property-memory-1"></a> `memory?` | `boolean` | Add the memory note to the system text and recalled lines under their turns. |
| <a id="property-seen-1"></a> `seen?` | `boolean` | Add the seen note to the system text and seen lines under their turns. |

***

### RecordedCue

A cue as `@hackbuild/act` records it for replay: the visible text offset, the kind and the name.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-at"></a> `at` | `number` |
| <a id="property-kind-1"></a> `kind` | `string` |
| <a id="property-name-1"></a> `name` | `string` |

***

### ReplyStats

Timing of one reply, from the engine's clock.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-firsttokenms"></a> `firstTokenMs` | `number` \| `null` |
| <a id="property-tokens"></a> `tokens` | `number` |
| <a id="property-tokenspersecond"></a> `tokensPerSecond` | `number` \| `null` |
| <a id="property-tokenssource"></a> `tokensSource` | `"measured"` \| `"inferred"` |
| <a id="property-totalms"></a> `totalMs` | `number` |

***

### SessionMessage

One stored message: visible text, the raw reply, think text, error, stats, seen and recalled lines, cues and tool calls.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at-1"></a> `at?` | `number` | Time the message was made, in the caller's clock (ms). |
| <a id="property-content-1"></a> `content` | `string` | Visible text. |
| <a id="property-cues"></a> `cues?` | `unknown` | Cue marks recorded while the reply was spoken, for replay. |
| <a id="property-edited"></a> `edited?` | `boolean` | - |
| <a id="property-error"></a> `error?` | `string` | The reply failed with this line; the message stays, flagged. |
| <a id="property-id-2"></a> `id` | `string` | - |
| <a id="property-raw"></a> `raw?` | `string` | The reply as the model wrote it, tags and all; this is what goes back into history. |
| <a id="property-recalled"></a> `recalled?` | `object`[] | Memories recalled for this turn, by id, so "memory used (n)" can link to them. |
| <a id="property-role-1"></a> `role` | [`Role`](#role) | - |
| <a id="property-seen-2"></a> `seen?` | `string` | What the camera saw when the turn was sent. |
| <a id="property-stats"></a> `stats?` | [`ReplyStats`](#replystats) | - |
| <a id="property-think"></a> `think?` | `string` | - |
| <a id="property-toolcalls-1"></a> `toolCalls?` | [`ToolCall`](#toolcall)[] | - |

***

### SpeakerLike

The part of an `@hackbuild/speak` Speaker the turn loop drives.

#### Methods

##### feed()

```ts
feed(textSoFar, final?): unknown;
```

Feed the visible reply so far; `final` closes the utterance.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `textSoFar` | `string` |
| `final?` | `boolean` |

###### Returns

`unknown`

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

***

### Timers

The timer pair the store debounces with; pass your own in tests.

#### Methods

##### clearTimeout()

```ts
clearTimeout(h): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | `unknown` |

###### Returns

`void`

##### setTimeout()

```ts
setTimeout(fn, ms): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | () => `void` |
| `ms` | `number` |

###### Returns

`unknown`

***

### ToolCall

One tool call a model asked for: the tool name and its arguments as a JSON string.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-arguments"></a> `arguments` | `string` | Arguments as the model wrote them (a JSON string). |
| <a id="property-id-3"></a> `id?` | `string` | - |
| <a id="property-name-2"></a> `name` | `string` | - |

## Type Aliases

### ConverseEvent

```ts
type ConverseEvent = 
  | {
  session: ChatSession;
  type: "change";
}
  | {
  id: string;
  text: string;
  type: "text";
}
  | {
  id: string;
  text: string;
  type: "think";
}
  | {
  message: SessionMessage;
  type: "done";
}
  | {
  error: unknown;
  message: SessionMessage;
  type: "error";
}
  | {
  busy: boolean;
  type: "busy";
};
```

What a conversation emits: the session changed, reply text or think text arrived, a reply finished or failed, or busy flipped.

***

### EngineEvent

```ts
type EngineEvent = 
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
  result: {
     finish: string;
     stats?: ReplyStats;
     text: string;
     toolCalls?: ToolCall[];
  };
  type: "done";
};
```

What the engine yields: visible text and think text apart, tool calls, then the result.

***

### Role

```ts
type Role = "system" | "user" | "assistant" | "tool";
```

The shapes the conversation core reads. They match `@hackbuild/chat`
structurally, so a `ChatEngine` passes as a `ConverseEngine` with no
import between the two packages.

## Variables

### MEMORY\_TAG

```ts
const MEMORY_TAG: "[memory]" = "[memory]";
```

The tag in front of each recalled memory line under a user turn.

***

### SAVE\_DEBOUNCE\_MS

```ts
const SAVE_DEBOUNCE_MS: 600 = 600;
```

Debounce between a change and its save, in ms (vendor).

***

### SEEN\_NOTE

```ts
const SEEN_NOTE: "Lines that start with [seen] under a user message say what the camera showed when the person wrote it. Use them when they fit." = "Lines that start with [seen] under a user message say what the camera showed when the person wrote it. Use them when they fit.";
```

The fixed line added to the system text when seen lines are on; it tells the model what `[seen]` lines mean.

***

### SEEN\_TAG

```ts
const SEEN_TAG: "[seen]" = "[seen]";
```

The tag in front of the camera line under a user turn.

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

### buildMessages()

```ts
function buildMessages(s, o?): ChatMessage[];
```

The messages to send: failed, empty and wordless replies out, a leading
assistant greeting out, the raw tagged reply in place of the visible
one, the cap applied at a user turn, then the notes and lines.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `Pick`\<[`ChatSession`](#chatsession), `"system"` \| `"messages"`\> |
| `o?` | [`HistoryOptions`](#historyoptions) |

#### Returns

[`ChatMessage`](#chatmessage)[]

***

### createChatStore()

```ts
function createChatStore(sink, o?): ChatStore;
```

Make a store that saves to `sink` 600 ms after the last change, leaving out replies still waiting for their first word.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sink` | [`ChatSink`](#chatsink) |
| `o?` | \{ `debounceMs?`: `number`; `onError?`: (`e`) => `void`; `timers?`: [`Timers`](#timers); \} |
| `o.debounceMs?` | `number` |
| `o.onError?` | (`e`) => `void` |
| `o.timers?` | [`Timers`](#timers) |

#### Returns

[`ChatStore`](#chatstore)

***

### createConversation()

```ts
function createConversation(o): Conversation;
```

Make a conversation over a streaming engine; it keeps the history rules, drives the director and speaker, and saves through the sink when you give one.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ConverseOptions`](#converseoptions) |

#### Returns

[`Conversation`](#conversation)

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

### kept()

```ts
function kept(m): boolean;
```

True for a message that goes back to the engine.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`SessionMessage`](#sessionmessage) |

#### Returns

`boolean`

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

### savable()

```ts
function savable(m): boolean;
```

A message worth saving: anything but an assistant reply with no text, no think, no tool call and no error yet.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`SessionMessage`](#sessionmessage) |

#### Returns

`boolean`

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

[`ChatMessage`](#chatmessage)[]

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

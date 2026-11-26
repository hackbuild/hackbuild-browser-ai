# @hackbuild/structured

## Interfaces

### AgentSchemaOptions

Whether the agent schemas add the `respond_to_user` pseudo tool and ask for a thought first.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-respond"></a> `respond?` | `boolean` | Add the respond_to_user pseudo tool. Default true. |
| <a id="property-thought"></a> `thought?` | `boolean` | Ask for a short thought first. Default true. |

***

### CallOptions

The tools, mode, quirks, guards and sampling settings for one `call`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-guards"></a> `guards?` | [`Guards`](#guards) | - |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | - |
| <a id="property-mode"></a> `mode?` | [`Mode`](#mode) \| `"auto"` | - |
| <a id="property-quirks"></a> `quirks?` | [`CallQuirks`](#callquirks) | - |
| <a id="property-respond-1"></a> `respond?` | `boolean` | Add the respond_to_user pseudo tool. Default true. |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |
| <a id="property-temperature"></a> `temperature?` | `number` | - |
| <a id="property-tools"></a> `tools` | readonly `ToolSpec`[] | - |

***

### CallQuirks

What a runtime is known to do: native tool calls, `<tool_call>` tags, and a token cap for actions.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-maxtokensaction"></a> `maxTokensAction?` | `number` |
| <a id="property-nativetools"></a> `nativeTools?` | `boolean` |
| <a id="property-toolcalltags"></a> `toolCallTags?` | `boolean` |

***

### Decision

The result of one `call`: the mode used, thought, tool and arguments, text for the user, raw reply, fallback taken and any guard that tripped.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fallback"></a> `fallback` | `"none"` \| `"loose"` \| `"text"` | "loose" when the strict schema was refused, "text" when free text was parsed. |
| <a id="property-mode-1"></a> `mode` | [`Mode`](#mode) | - |
| <a id="property-raw"></a> `raw` | `string` | - |
| <a id="property-say"></a> `say` | `string` | Text meant for the user (respond_to_user message, or prose around tags). |
| <a id="property-stop"></a> `stop` | [`StopReason`](#stopreason) \| `null` | A guard that tripped on this call. |
| <a id="property-thought-1"></a> `thought` | `string` | - |
| <a id="property-tool"></a> `tool` | \| \{ `args`: `Record`\<`string`, `unknown`\>; `name`: `string`; \} \| `null` | The tool to run; respond_to_user carries \{ message \}. null when nothing usable came back. |

***

### GuardOptions

Turn guards for small models: stop after 3 parse
failures, when the same call repeats 3 times in the last 6, or after 2
garbage replies in a row; cap pushbacks at 3.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-garbage"></a> `garbage?` | `object` |
| `garbage.consecutive` | `number` |
| `garbage.ratio` | `number` |
| <a id="property-parsefails"></a> `parseFails?` | `number` |
| <a id="property-pushbacks"></a> `pushbacks?` | `number` |
| <a id="property-repeat"></a> `repeat?` | `object` |
| `repeat.count` | `number` |
| `repeat.window` | `number` |

***

### Guards

Counters over one agent run that return a `StopReason` when a limit is reached.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-stopped"></a> `stopped` | `readonly` | [`StopReason`](#stopreason) \| `null` |

#### Methods

##### call()

```ts
call(name, args): StopReason | null;
```

Record a tool call by fingerprint.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `args` | `unknown` |

###### Returns

[`StopReason`](#stopreason) \| `null`

##### parseFail()

```ts
parseFail(): StopReason | null;
```

Record a reply that did not parse.

###### Returns

[`StopReason`](#stopreason) \| `null`

##### pushback()

```ts
pushback(): StopReason | null;
```

###### Returns

[`StopReason`](#stopreason) \| `null`

##### reply()

```ts
reply(text): StopReason | null;
```

Record a parsed reply; resets the consecutive garbage count unless the text is garbage.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

[`StopReason`](#stopreason) \| `null`

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

***

### LinesOptions

Line tagged formats: THOUGHT / ACTION ReAct with multi line bodies
(PATH, CONTENT, CODE), the vision sandbox's short Thought / Action, and
the three line SAW / THOUGHT / GOAL cortex. A tag line is `NAME:` at the
start of a line, any case; its value runs until the next tag line. Raw
newlines in a value are fine, which is why code goes through this format.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-tags"></a> `tags` | readonly `string`[] | Tag names to read; others stay inside the previous value. |

***

### ParsedAction

An action read from an ACTION line: the tool name, its positional arguments, and the text as written.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-args"></a> `args` | `string`[] | Positional arguments from `name(a, b)` or `name a b` forms. |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-raw-1"></a> `raw` | `string` | - |

***

### Tag

One tag found in model text: its key, resolved value, the text as written, and its offset in the visible text.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | `number` | Offset in the visible (stripped) text where the tag sat. |
| <a id="property-key"></a> `key` | `string` | - |
| <a id="property-raw-2"></a> `raw` | `string` | The tag as written. |
| <a id="property-value"></a> `value` | `string` | - |

***

### TagGrammar

Streaming inline tag parser. Small models drift between tag styles, so
the parser accepts all these forms:

  [key:value]  [key=value]  [KEY: value]          keyed tags (BonziBuddy [ACTION: x] is one)
  *phrase*  (phrase)  [phrase]  \{phrase\}  CJK brackets   plain tags, resolved against the vocabularies
  key: value   on a line of its own, for keys in `lineKeys`

feed(chunk) returns the visible text with tags removed and the tags that
completed in this chunk, each with its offset in the visible text, so a
voice timeline can fire a tag when speech reaches it. Text that might
still become a tag is held back (at most `maxTag` characters).

Values resolve exact, then synonym, then substring, then token overlap
(live2d resolveExpr).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-keys"></a> `keys` | `Record`\<`string`, readonly `string`[] \| `null`\> | Vocabulary per key; null accepts any value for that key. |
| <a id="property-linekeys"></a> `lineKeys?` | readonly `string`[] | Keys also accepted as `key: value` on their own line. |
| <a id="property-maxtag"></a> `maxTag?` | `number` | Longest tag held back while streaming. Default 48. |
| <a id="property-plain"></a> `plain?` | `boolean` | Accept plain tags (*x*, (x), [x], \{x\}, CJK brackets). Default true. |
| <a id="property-stripunresolved"></a> `stripUnresolved?` | `boolean` | Remove plain tags that resolve to nothing (stage directions). Default true for * and brackets, false for parentheses. |
| <a id="property-synonyms"></a> `synonyms?` | `Record`\<`string`, `string`\> | word or phrase to canonical value, e.g. \{ grin: "happy", "waves hello": "wave" \}. |

***

### TagParser

A streaming tag parser: `feed` chunks, `end` the stream, `parse` whole text, or `strip` text for speech.

#### Methods

##### end()

```ts
end(): object;
```

Flush at the end of the stream. An unclosed tag is returned as text.

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `tags` | [`Tag`](#tag)[] |
| `text` | `string` |

##### feed()

```ts
feed(chunk): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `chunk` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `tags` | [`Tag`](#tag)[] |
| `text` | `string` |

##### parse()

```ts
parse(text): object;
```

Whole text at once: visible text and every tag.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `tags` | [`Tag`](#tag)[] |
| `text` | `string` |

##### strip()

```ts
strip(text): string;
```

Visible text only, for speech.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`string`

***

### ToolDecision

A tool choice read from model JSON: the thought, the tool name and its arguments object.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-args-1"></a> `args` | `Record`\<`string`, `unknown`\> |
| <a id="property-name-1"></a> `name` | `string` |
| <a id="property-thought-2"></a> `thought` | `string` |

## Type Aliases

### Mode

```ts
type Mode = "constrained" | "prompt" | "native" | "tags" | "lines";
```

How `call` asks the model for a tool: constrained JSON, a Hermes prompt, native tools, inline tags, or THOUGHT and ACTION lines.

***

### StopReason

```ts
type StopReason = "parse-fails" | "repeat" | "garbage" | "pushbacks";
```

Which guard tripped: too many parse failures, a repeated call, garbage replies or too many pushbacks.

## Variables

### RESPOND

```ts
const RESPOND: "respond_to_user" = "respond_to_user";
```

The name of the pseudo tool a model calls to answer the user in words.

***

### STRIPPED\_KEYWORDS

```ts
const STRIPPED_KEYWORDS: readonly ["minItems", "maxItems", "multipleOf", "$schema", "$id", "examples", "default", "title", "minLength", "maxLength", "pattern"];
```

The JSON Schema keywords `sanitizeSchema` removes, because grammar compilers refuse them.

## Functions

### buildAgentSchema()

```ts
function buildAgentSchema(tools, o?): JsonSchema;
```

Root anyOf, one variant per tool: \{ thought, tool_call: \{ name: enum[one], arguments \} \}.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tools` | readonly `ToolSpec`[] |
| `o?` | [`AgentSchemaOptions`](#agentschemaoptions) |

#### Returns

`JsonSchema`

***

### buildLooseAgentSchema()

```ts
function buildLooseAgentSchema(tools, o?): JsonSchema;
```

One variant with an enum over every tool name and arguments of any object.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tools` | readonly `ToolSpec`[] |
| `o?` | [`AgentSchemaOptions`](#agentschemaoptions) |

#### Returns

`JsonSchema`

***

### call()

```ts
function call(
   chat, 
   messages, 
   o
): Promise<Decision>;
```

Ask a chat engine for one tool decision in the chosen mode, with the strict to loose to text fallbacks in constrained mode.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `chat` | `ChatEngine` |
| `messages` | readonly `ChatMessage`[] |
| `o` | [`CallOptions`](#calloptions) |

#### Returns

`Promise`\<[`Decision`](#decision)\>

***

### createGuards()

```ts
function createGuards(o?): Guards;
```

Make guards with the defaults 3 parse failures, the same call 3 times in the last 6, 2 garbage replies in a row, and 3 pushbacks.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`GuardOptions`](#guardoptions) |

#### Returns

[`Guards`](#guards)

***

### createTagParser()

```ts
function createTagParser(g): TagParser;
```

Make a tag parser for the keys, synonyms and line keys you give.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `g` | [`TagGrammar`](#taggrammar) |

#### Returns

[`TagParser`](#tagparser)

***

### fingerprint()

```ts
function fingerprint(name, args): string;
```

Stable fingerprint of a call: name plus arguments with sorted keys.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `args` | `unknown` |

#### Returns

`string`

***

### grabCode()

```ts
function grabCode(value): object;
```

The body of a fenced block when there is one, else the text trimmed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `code` | `string` |
| `lang` | `string` \| `null` |

***

### hermesToolPrompt()

```ts
function hermesToolPrompt(tools): string;
```

The system text that lists the tools in `<tools>` and asks for one `<tool_call>` reply, in the Hermes and Qwen format.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tools` | readonly `ToolSpec`[] |

#### Returns

`string`

***

### jsonCharRatio()

```ts
function jsonCharRatio(text): number;
```

Share of characters that are JSON punctuation. Above .18 a prose reply is likely garbage.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`number`

***

### keywordActions()

```ts
function keywordActions(
   text, 
   synonyms, 
   o?
): string[];
```

Keyword fallback when no ACTION line parses (vision sandbox ACTION_SYNS): words to actions, capped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `synonyms` | `Record`\<`string`, `string`\> |
| `o?` | \{ `max?`: `number`; `maxRepeat?`: `number`; \} |
| `o.max?` | `number` |
| `o.maxRepeat?` | `number` |

#### Returns

`string`[]

***

### looksLikeGarbage()

```ts
function looksLikeGarbage(text, ratio?): boolean;
```

True when a reply is empty, repeats a short run six times or more, or has a JSON punctuation share above `ratio`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `ratio?` | `number` | `0.18` |

#### Returns

`boolean`

***

### parseAction()

```ts
function parseAction(value, known?): ParsedAction | null;
```

Parse an ACTION value: `look(mug)`, `look mug`, `pick_up(red mug, table)`,
`["look", "mug"]`. Names are matched against `known` (case and separators
ignored) when given; an unknown name returns null.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |
| `known?` | readonly `string`[] |

#### Returns

[`ParsedAction`](#parsedaction) \| `null`

***

### parseLines()

```ts
function parseLines(text, o): Record<string, string>;
```

First value per tag, keyed by the tag as given in `tags`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `o` | [`LinesOptions`](#linesoptions) |

#### Returns

`Record`\<`string`, `string`\>

***

### parseLooseJSON()

```ts
function parseLooseJSON(raw): unknown;
```

Parse after repair; then the balanced `{...}` spans, the one that ends
last and starts first tried first, at most 64 of them. null when nothing
parses.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `string` |

#### Returns

`unknown`

***

### parseToolDecision()

```ts
function parseToolDecision(raw): ToolDecision | null;
```

Read `{ thought, tool_call: { name, arguments } }` and the shapes small
models drift to: arguments as a JSON string (double encoded), `tool` or
`action` for the name, `args` or `parameters` for the arguments, and a
flat `{ name, arguments }`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `unknown` |

#### Returns

[`ToolDecision`](#tooldecision) \| `null`

***

### pickMode()

```ts
function pickMode(chat, q?): Mode;
```

The mode `auto` uses: native when the quirks and engine allow tools, constrained when the engine takes schemas, prompt for tool call tag models, else lines.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `chat` | `ChatEngine` |
| `q?` | [`CallQuirks`](#callquirks) |

#### Returns

[`Mode`](#mode)

***

### repairJSON()

```ts
function repairJSON(raw): string;
```

Close what the model left open and drop trailing commas. Returns text that may parse.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `string` |

#### Returns

`string`

***

### resolveValue()

```ts
function resolveValue(
   value, 
   vocab, 
   synonyms?
): string | null;
```

Resolve a value against a vocabulary: exact, synonym, substring, then token overlap.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `value` | `string` |
| `vocab` | readonly `string`[] |
| `synonyms?` | `Record`\<`string`, `string`\> |

#### Returns

`string` \| `null`

***

### sanitizeSchema()

```ts
function sanitizeSchema(schema, opts?): JsonSchema;
```

Copy a schema without the keywords grammar compilers refuse, keeping property names, and add a root `type: "object"` when the root has no type.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `schema` | `JsonSchema` |
| `opts?` | \{ `strip?`: readonly `string`[]; \} |
| `opts.strip?` | readonly `string`[] |

#### Returns

`JsonSchema`

***

### withRespond()

```ts
function withRespond(tools, on?): ToolSpec[];
```

The tool list with `respond_to_user` added at the end, unless it is there already or `on` is false.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `tools` | readonly `ToolSpec`[] | `undefined` |
| `on?` | `boolean` | `true` |

#### Returns

`ToolSpec`[]

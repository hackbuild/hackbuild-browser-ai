# @hackbuild/ai-elements

## Interfaces

### DefineTarget

The part of a custom element registry `define` uses; `customElements` satisfies it.

#### Methods

##### define()

```ts
define(name, ctor): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `ctor` | `CustomElementConstructor` |

###### Returns

`void`

##### get()

```ts
get(name): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

`unknown`

***

### MemoryInspector

A mounted memory inspector whose `set` shows a new recall.

#### Extends

- `Mounted`

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

###### Inherited from

`Mounted.dispose`

##### set()

```ts
set(rec): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`RecallLike`](#recalllike) \| `null` |

###### Returns

`void`

***

### TraceRow

One row of a recall trace as text: rank, id, kind, text, BM25, cosine, RRF, score, and whether it
went to the model.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bm25"></a> `bm25` | `string` | - |
| <a id="property-cos"></a> `cos` | `string` | - |
| <a id="property-id"></a> `id` | `number` | - |
| <a id="property-kind"></a> `kind` | `string` | - |
| <a id="property-rank"></a> `rank` | `number` | - |
| <a id="property-rrf"></a> `rrf` | `string` | - |
| <a id="property-score"></a> `score` | `string` | - |
| <a id="property-text"></a> `text` | `string` | - |
| <a id="property-used"></a> `used` | `boolean` | Inside the hits handed to the model. |

## Type Aliases

### RecallLike

```ts
type RecallLike = Pick<Recall, "trace" | "hits" | "query" | "mode">;
```

The parts of a memory recall the inspector shows: trace, hits, query and mode.

## Variables

### DEPRECATION

```ts
const DEPRECATION: "@hackbuild/ai-elements is deprecated. use @hackbuild/ai-views: <model-select>, <chat-pane>, <chat-composer>, <memory-inspector> and the other views." = "@hackbuild/ai-elements is deprecated. use @hackbuild/ai-views: <model-select>, <chat-pane>, <chat-composer>, <memory-inspector> and the other views.";
```

Written once to the console by define().

***

### ELEMENT\_NAMES

```ts
const ELEMENT_NAMES: readonly ["model-select", "model-jobs", "chat-pane", "chat-composer", "chat-list", "chat-context", "transcribe-drop", "transcript-view", "transcribe-queue", "transcript-exports", "mask-studio", "mask-tools", "mask-verbs", "mask-rack", "frame-view", "camera-feed", "memory-inspector"];
```

The tag names define() registers, before any prefix.

## Functions

### define()

```ts
function define(
   prefix?, 
   registry?, 
   Base?
): string[];
```

Registers the ai-views elements under the prefix (default hb) and notes the deprecation once.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `prefix?` | `string` | `"hb"` |
| `registry?` | [`DefineTarget`](#definetarget) | `undefined` |
| `Base?` | new () => `HTMLElement` | `undefined` |

#### Returns

`string`[]

***

### inspectorHtml()

```ts
function inspectorHtml(rec): string;
```

The HTML of a recall trace table, or an empty note before any recall.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`RecallLike`](#recalllike) \| `null` |

#### Returns

`string`

***

### mountMemoryInspector()

```ts
function mountMemoryInspector(host, rec?): MemoryInspector;
```

Shows a recall trace as a table on a host.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `rec?` | [`RecallLike`](#recalllike) \| `null` |

#### Returns

[`MemoryInspector`](#memoryinspector)

***

### traceRows()

```ts
function traceRows(r, maxText?): TraceRow[];
```

The rows of a recall trace as text, marking the hits handed to the model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `Pick`\<`Recall`, `"trace"` \| `"hits"`\> |
| `maxText?` | `number` |

#### Returns

[`TraceRow`](#tracerow)[]

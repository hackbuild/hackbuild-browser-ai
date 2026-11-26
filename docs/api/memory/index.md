# index

## Classes

### Core

The loaded core. One instance holds any number of indexes.

#### Constructors

##### Constructor

```ts
new Core(x): Core;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |

###### Returns

[`Core`](#core)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-simd"></a> `simd` | `readonly` | `boolean` |

#### Accessors

##### exports

###### Get Signature

```ts
get exports(): Exports;
```

###### Returns

`Exports`

#### Methods

##### call()

```ts
call<R>(bufs, fn): R;
```

Runs fn with each buffer copied into wasm memory, then frees them.

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-r"></a> `R` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bufs` | (`Uint8Array`\<`ArrayBufferLike`\> \| `null`)[] |
| `fn` | (`flat`) => `R` |

###### Returns

`R`

##### exp()

```ts
exp(x): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |

###### Returns

`number`

##### index()

```ts
index(dim): CoreIndex;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dim` | `number` |

###### Returns

[`CoreIndex`](#coreindex-1)

##### ln()

```ts
ln(x): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |

###### Returns

`number`

##### out()

```ts
out(n): Float64Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |

###### Returns

`Float64Array`

##### retention()

```ts
retention(
   kind, 
   ageH, 
   uses
): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | `number` |
| `ageH` | `number` |
| `uses` | `number` |

###### Returns

`number`

***

### CoreIndex

One index inside the core: a flat list of items with BM25 tokens and vectors.

#### Constructors

##### Constructor

```ts
new CoreIndex(
   core, 
   handle, 
   dim
): CoreIndex;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `core` | [`Core`](#core) |
| `handle` | `number` |
| `dim` | `number` |

###### Returns

[`CoreIndex`](#coreindex-1)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-dim"></a> `dim` | `readonly` | `number` |
| <a id="property-handle"></a> `handle` | `readonly` | `number` |

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### decay()

```ts
decay(nowH, floor): number[];
```

Drops items under the retention floor; returns their ids.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `nowH` | `number` |
| `floor` | `number` |

###### Returns

`number`[]

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### findDup()

```ts
findDup(
   text, 
   vec, 
   kind, 
   scope, 
   nowH, 
   windowH, 
   threshold
): number | null;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `vec` | `Float32Array`\<`ArrayBufferLike`\> \| `null` |
| `kind` | `number` |
| `scope` | `number` |
| `nowH` | `number` |
| `windowH` | `number` |
| `threshold` | `number` |

###### Returns

`number` \| `null`

##### merge()

```ts
merge(keep, drop): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `keep` | `number` |
| `drop` | `number` |

###### Returns

`boolean`

##### mergeNear()

```ts
mergeNear(threshold): [number, number][];
```

Merges near duplicates; returns [kept, dropped] pairs.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `threshold` | `number` |

###### Returns

\[`number`, `number`\][]

##### numbers()

```ts
numbers(id): Float64Array<ArrayBufferLike> | null;
```

created, lastUsed, importance, arousal, valence, novelty, uses, weight.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`Float64Array`\<`ArrayBufferLike`\> \| `null`

##### recall()

```ts
recall(
   query, 
   vec, 
   p
): CoreHit[];
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `vec` | `Float32Array`\<`ArrayBufferLike`\> \| `null` |
| `p` | [`CoreParams`](#coreparams) |

###### Returns

[`CoreHit`](#corehit)[]

##### recallRaw()

```ts
recallRaw(
   query, 
   vec, 
   block, 
   scopes
): Float64Array;
```

Raw hits as the out buffer holds them, for the parity test.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `vec` | `Float32Array`\<`ArrayBufferLike`\> \| `null` |
| `block` | `Float64Array` |
| `scopes` | `Uint32Array` |

###### Returns

`Float64Array`

##### remove()

```ts
remove(id): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`boolean`

##### touch()

```ts
touch(id, nowH): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |
| `nowH` | `number` |

###### Returns

`boolean`

##### upsert()

```ts
upsert(it): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `it` | [`CoreItem`](#coreitem) |

###### Returns

`void`

***

### CoreMemory

Pinned facts that go into every prompt, capped in characters.

#### Constructors

##### Constructor

```ts
new CoreMemory(lines?, maxChars?): CoreMemory;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `lines?` | `string`[] | `[]` |
| `maxChars?` | `number` | `700` |

###### Returns

[`CoreMemory`](#corememory)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-lines"></a> `lines` | `public` | `string`[] | `undefined` |
| <a id="property-maxchars"></a> `maxChars` | `readonly` | `number` | `700` |

#### Methods

##### append()

```ts
append(fact): boolean;
```

Appends a fact unless one with the same key (first 40 letters, digits and spaces, any case) exists; evicts the oldest lines to fit. Returns false for a duplicate.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fact` | `string` |

###### Returns

`boolean`

##### remove()

```ts
remove(match): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `match` | `string` |

###### Returns

`boolean`

##### text()

```ts
text(): string;
```

###### Returns

`string`

##### key()

```ts
static key(s): string;
```

Lowercase, letters, digits and spaces only, first 40 characters.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

###### Returns

`string`

***

### Memory

One agent's memory: add, recall, assemble, edit, compact and export, over the wasm core and a sink. Made by `open`.

#### Constructors

##### Constructor

```ts
new Memory(
   id, 
   opts, 
   sink, 
   notes
): Memory;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `opts` | [`OpenOptions`](#openoptions) |
| `sink` | [`MemorySink`](#memorysink) |
| `notes` | `string`[] |

###### Returns

[`Memory`](#memory)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-core"></a> `core` | `readonly` | [`CoreMemory`](#corememory) |
| <a id="property-id"></a> `id` | `readonly` | `string` |
| <a id="property-sink"></a> `sink` | `readonly` | [`MemorySink`](#memorysink) |

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

##### status

###### Get Signature

```ts
get status(): Status;
```

###### Returns

[`Status`](#status-1)

#### Methods

##### add()

```ts
add(text, o?): Promise<{
  id: number;
  merged: boolean;
}>;
```

Writes a memory, or strengthens its near duplicate.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `o?` | [`AddOptions`](#addoptions) |

###### Returns

`Promise`\<\{
  `id`: `number`;
  `merged`: `boolean`;
\}\>

##### addExchange()

```ts
addExchange(
   said, 
   reply, 
   o?
): Promise<
  | {
  id: number;
  merged: boolean;
}
| null>;
```

Writes a note of one exchange (kind episode, meta.said), or nothing when the user turn is too short.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `said` | `string` |
| `reply` | `string` |
| `o?` | [`AddOptions`](#addoptions) & `object` |

###### Returns

`Promise`\<
  \| \{
  `id`: `number`;
  `merged`: `boolean`;
\}
  \| `null`\>

##### all()

```ts
all(): StoredItem[];
```

###### Returns

[`StoredItem`](#storeditem)[]

##### assemble()

```ts
assemble(o): Promise<Assembled & object>;
```

Recall, select and budget in one call: core, summary, recalled lines and recent turns.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `budgetTokens`: `number`; `core?`: `boolean`; `estimate?`: (`s`) => `number`; `fixed?`: `string`[]; `previous?`: `string`; `query?`: `string`; `recall?`: [`RecallOptions`](#recalloptions); `recent?`: `string`[]; `sections?`: [`Section`](#section)[]; `select?`: \{ `dedup?`: `number`; `k?`: `number`; `maxChars?`: `number`; `perSection?`: `number`; \}; `summary?`: `string`; \} |
| `o.budgetTokens` | `number` |
| `o.core?` | `boolean` |
| `o.estimate?` | (`s`) => `number` |
| `o.fixed?` | `string`[] |
| `o.previous?` | `string` |
| `o.query?` | `string` |
| `o.recall?` | [`RecallOptions`](#recalloptions) |
| `o.recent?` | `string`[] |
| `o.sections?` | [`Section`](#section)[] |
| `o.select?` | \{ `dedup?`: `number`; `k?`: `number`; `maxChars?`: `number`; `perSection?`: `number`; \} |
| `o.select.dedup?` | `number` |
| `o.select.k?` | `number` |
| `o.select.maxChars?` | `number` |
| `o.select.perSection?` | `number` |
| `o.summary?` | `string` |

###### Returns

`Promise`\<[`Assembled`](#assembled) & `object`\>

##### close()

```ts
close(): void;
```

###### Returns

`void`

##### compact()

```ts
compact(o?): Promise<CompactReport>;
```

Decay, near duplicate merge and episode folding in one call, with what each removed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`CompactOptions`](#compactoptions) |

###### Returns

`Promise`\<[`CompactReport`](#compactreport)\>

##### consolidate()

```ts
consolidate(o?): Promise<
  | {
  folded: number;
  id: number;
}
| null>;
```

Folds old episodes of a scope into one gist once there are more than
min of them, keeping the newest keep. summarize gets the folded texts
oldest first; without it the gist is a word count summary.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `keep?`: `number`; `min?`: `number`; `scope?`: `string`; `summarize?`: (`texts`) => `Promise`\<`string`\>; \} |
| `o.keep?` | `number` |
| `o.min?` | `number` |
| `o.scope?` | `string` |
| `o.summarize?` | (`texts`) => `Promise`\<`string`\> |

###### Returns

`Promise`\<
  \| \{
  `folded`: `number`;
  `id`: `number`;
\}
  \| `null`\>

##### decay()

```ts
decay(floor?): Promise<number[]>;
```

Drops items whose kind retention is under floor (rule, lore and doc never decay).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `floor?` | `number` | `0.05` |

###### Returns

`Promise`\<`number`[]\>

##### edit()

```ts
edit(id, patch): Promise<StoredItem | null>;
```

Changes one memory by hand. New text is embedded again and every cached vector of the old text is dropped. Null when the id is gone.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |
| `patch` | [`EditPatch`](#editpatch) |

###### Returns

`Promise`\<[`StoredItem`](#storeditem) \| `null`\>

##### explain()

```ts
explain(q, o?): Promise<RecallTrace>;
```

A recall for the inspector: nothing is strengthened unless asked.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | `string` |
| `o?` | [`RecallOptions`](#recalloptions) |

###### Returns

`Promise`\<[`RecallTrace`](#recalltrace)\>

##### export()

```ts
export(): ExportData;
```

Items and core as JSON. Vectors are left out; import re-embeds.

###### Returns

[`ExportData`](#exportdata)

##### get()

```ts
get(id): StoredItem | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

[`StoredItem`](#storeditem) \| `undefined`

##### import()

```ts
import(data, o?): Promise<number>;
```

Loads an export. replace (default) clears this memory first.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`ExportData`](#exportdata) |
| `o?` | \{ `replace?`: `boolean`; \} |
| `o.replace?` | `boolean` |

###### Returns

`Promise`\<`number`\>

##### mergeNear()

```ts
mergeNear(threshold?): Promise<[number, number][]>;
```

Merges stored near duplicates by vector, keeping the older item.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `threshold?` | `number` | `0.95` |

###### Returns

`Promise`\<\[`number`, `number`\][]\>

##### persist()

```ts
persist(o?): Promise<boolean>;
```

Asks the browser not to clear this origin's storage. False when it says no or cannot.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `storage?`: [`StorageLike`](#storagelike) \| `null`; \} |
| `o.storage?` | [`StorageLike`](#storagelike) \| `null` |

###### Returns

`Promise`\<`boolean`\>

##### recall()

```ts
recall(q, o?): Promise<Recall>;
```

Hybrid recall with a full trace of the fused candidates.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | `string` |
| `o?` | [`RecallOptions`](#recalloptions) |

###### Returns

`Promise`\<[`Recall`](#recall-2)\>

##### remember()

```ts
remember(fact): Promise<boolean>;
```

Adds a pinned fact and persists the core block.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fact` | `string` |

###### Returns

`Promise`\<`boolean`\>

##### remove()

```ts
remove(ids): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ids` | `number`[] |

###### Returns

`Promise`\<`void`\>

##### trace()

```ts
trace(r): RecallTrace;
```

The recall trace view's object for a recall: per query term weights
over the memories the recall could see, and per candidate its rank,
used mark, score parts and per term BM25 contributions. Texts are read
now, so an edit after the recall shows in the terms.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`Recall`](#recall-2) |

###### Returns

[`RecallTrace`](#recalltrace)

##### usage()

```ts
usage(o?): Promise<Usage>;
```

Counts and an estimate of the bytes this memory holds, plus the browser's estimate for the origin when it gives one.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `storage?`: [`StorageLike`](#storagelike) \| `null`; \} |
| `o.storage?` | [`StorageLike`](#storagelike) \| `null` |

###### Returns

`Promise`\<[`Usage`](#usage-1)\>

***

### RecallConversation

Keeps a conversation whose prompt only ever grows at the end.

#### Constructors

##### Constructor

```ts
new RecallConversation(system?, opts?): RecallConversation;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `system?` | `string` | `""` |
| `opts?` | \{ `note?`: `string`; `tag?`: `string`; \} | `{}` |
| `opts.note?` | `string` | `undefined` |
| `opts.tag?` | `string` | `undefined` |

###### Returns

[`RecallConversation`](#recallconversation)

#### Accessors

##### messages

###### Get Signature

```ts
get messages(): Message[];
```

###### Returns

[`Message`](#message)[]

#### Methods

##### assistant()

```ts
assistant(text): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`void`

##### user()

```ts
user(text, recalled?): Message[];
```

Adds a user turn with its recalled lines and returns the whole prompt.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `recalled?` | `string`[] | `[]` |

###### Returns

[`Message`](#message)[]

## Interfaces

### AddOptions

Options for `Memory.add`: kind, scope, importance, emotion, novelty and the other fields stored on the item.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-arousal"></a> `arousal?` | `number` | - |
| <a id="property-dedup"></a> `dedup?` | `boolean` | Merge into a near duplicate in the same kind and scope. Default true. |
| <a id="property-dupcosine"></a> `dupCosine?` | `number` | Cosine at or above this is a duplicate. Default 0.93 (inferred from earlier builds). |
| <a id="property-dupwindowms"></a> `dupWindowMs?` | `number` | Equal text within this many ms is a duplicate. Default 60 000. |
| <a id="property-entities"></a> `entities?` | `string`[] | - |
| <a id="property-importance"></a> `importance?` | `number` | - |
| <a id="property-kind"></a> `kind?` | `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"` | - |
| <a id="property-meta"></a> `meta?` | `Record`\<`string`, `unknown`\> | - |
| <a id="property-novelty"></a> `novelty?` | `number` | - |
| <a id="property-place"></a> `place?` | \[`number`, `number`, `number`\] | - |
| <a id="property-scope"></a> `scope?` | `string` | - |
| <a id="property-section"></a> `section?` | `string` | - |
| <a id="property-valence"></a> `valence?` | `number` | - |

***

### Assembled

A context fitted to a token budget: the text, the section names kept and dropped, and the tokens used.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-budgettokens"></a> `budgetTokens` | `number` |
| <a id="property-dropped"></a> `dropped` | `string`[] |
| <a id="property-kept"></a> `kept` | `string`[] |
| <a id="property-text"></a> `text` | `string` |
| <a id="property-usedtokens"></a> `usedTokens` | `number` |

***

### CompactOptions

Options for `Memory.compact`: the decay floor, the merge cosine and the episode folding, each of which can be turned off.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-consolidate"></a> `consolidate?` | \| `false` \| \{ `keep?`: `number`; `min?`: `number`; `scope?`: `string`; `summarize?`: (`texts`) => `Promise`\<`string`\>; \} | Episode folding into a gist; false skips it. Default on with consolidate's defaults. |
| <a id="property-decay"></a> `decay?` | `number` \| `false` | Retention floor for decay; false skips decay. Default 0.05. |
| <a id="property-merge"></a> `merge?` | `number` \| `false` | Cosine for merging stored near duplicates; false skips it. Default 0.95. |

***

### CompactReport

What `Memory.compact` did: item counts before and after, the ids decayed, the pairs merged and the gist made.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-after"></a> `after` | `number` |
| <a id="property-before"></a> `before` | `number` |
| <a id="property-decayed"></a> `decayed` | `number`[] |
| <a id="property-gist"></a> `gist` | \| \{ `folded`: `number`; `id`: `number`; \} \| `null` |
| <a id="property-merged"></a> `merged` | \[`number`, `number`\][] |

***

### CoreHit

One fused candidate and every term its score came from.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bm25"></a> `bm25` | `number` |
| <a id="property-bm25rank"></a> `bm25Rank` | `number` |
| <a id="property-cos"></a> `cos` | `number` |
| <a id="property-id-1"></a> `id` | `number` |
| <a id="property-imp"></a> `imp` | `number` |
| <a id="property-rec"></a> `rec` | `number` |
| <a id="property-rel"></a> `rel` | `number` |
| <a id="property-ret"></a> `ret` | `number` |
| <a id="property-rrf"></a> `rrf` | `number` |
| <a id="property-score"></a> `score` | `number` |
| <a id="property-vecrank"></a> `vecRank` | `number` |

***

### CoreItem

Numbers of one item as the core keeps them. Times in hours.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-arousal-1"></a> `arousal` | `number` |
| <a id="property-created"></a> `created` | `number` |
| <a id="property-id-2"></a> `id` | `number` |
| <a id="property-importance-1"></a> `importance` | `number` |
| <a id="property-kind-1"></a> `kind` | `number` |
| <a id="property-lastused"></a> `lastUsed` | `number` |
| <a id="property-novelty-1"></a> `novelty` | `number` |
| <a id="property-place-1"></a> `place?` | \[`number`, `number`, `number`\] |
| <a id="property-scope-1"></a> `scope` | `number` |
| <a id="property-text-1"></a> `text` | `string` |
| <a id="property-uses"></a> `uses` | `number` |
| <a id="property-valence-1"></a> `valence` | `number` |
| <a id="property-vector"></a> `vector?` | `Float32Array`\<`ArrayBufferLike`\> |
| <a id="property-weight"></a> `weight` | `number` |

***

### CoreParams

Recall parameters. Defaults are the values earlier builds used.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-b"></a> `b?` | `number` |
| <a id="property-cand"></a> `cand?` | `number` |
| <a id="property-k"></a> `k?` | `number` |
| <a id="property-k1"></a> `k1?` | `number` |
| <a id="property-kinds"></a> `kinds?` | `number`[] |
| <a id="property-now"></a> `now` | `number` |
| <a id="property-place-2"></a> `place?` | \[`number`, `number`, `number`\] |
| <a id="property-rrfk"></a> `rrfK?` | `number` |
| <a id="property-scopes"></a> `scopes?` | `number`[] |
| <a id="property-scorer"></a> `scorer?` | `"linear"` \| `"organic"` |
| <a id="property-tauh"></a> `tauH?` | `number` |
| <a id="property-valence-2"></a> `valence?` | `number` |
| <a id="property-vecfloor"></a> `vecFloor?` | `number` |
| <a id="property-wimp"></a> `wImp?` | `number` |
| <a id="property-wrec"></a> `wRec?` | `number` |
| <a id="property-wrel"></a> `wRel?` | `number` |

***

### EditPatch

The fields `Memory.edit` changes on one item; new text is embedded again.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-entities-1"></a> `entities?` | `string`[] |
| <a id="property-importance-2"></a> `importance?` | `number` |
| <a id="property-kind-2"></a> `kind?` | `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"` |
| <a id="property-meta-1"></a> `meta?` | `Record`\<`string`, `unknown`\> |
| <a id="property-scope-2"></a> `scope?` | `string` |
| <a id="property-section-1"></a> `section?` | `string` |
| <a id="property-text-2"></a> `text?` | `string` |

***

### Embedder

Anything that turns texts into vectors of one size: a transformers.js
MiniLM (Xenova/all-MiniLM-L6-v2, weights Apache-2.0), bge-small
(BAAI/bge-small-en-v1.5, weights MIT), a static model2vec table, or the
hashed embedder below. `id` names the model and settings; vectors are
cached under it, so a different id re-embeds every item.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-dim-1"></a> `dim` | `readonly` | `number` |
| <a id="property-id-3"></a> `id` | `readonly` | `string` |

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

### ExportData

The JSON `Memory.export` gives and `Memory.import` takes: items without vectors and the core memory lines.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-core-1"></a> `core` | `string`[] |
| <a id="property-format"></a> `format` | `"hackbuild-memory"` |
| <a id="property-id-4"></a> `id` | `string` |
| <a id="property-items"></a> `items` | [`StoredItem`](#storeditem)[] |
| <a id="property-version"></a> `version` | `1` |

***

### Hit

One recalled item with its final score and the core's per stage numbers.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-item"></a> `item` | [`StoredItem`](#storeditem) |
| <a id="property-score-1"></a> `score` | `number` |
| <a id="property-terms"></a> `terms` | [`CoreHit`](#corehit) |

***

### MemorySink

Where a memory keeps its items, vectors per embedder and key values. `indexedDbSink`, `memorySink` and `sealedSink` implement it.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-kind-3"></a> `kind` | `readonly` | `"indexeddb"` \| `"memory"` |

#### Methods

##### clear()

```ts
clear(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### close()

```ts
close(): void;
```

###### Returns

`void`

##### deleteItems()

```ts
deleteItems(ids): Promise<void>;
```

Deletes the items and every embedder's vector for them.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ids` | `number`[] |

###### Returns

`Promise`\<`void`\>

##### getKv()

```ts
getKv<T>(key): Promise<T | undefined>;
```

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`T` \| `undefined`\>

##### getVectors()

```ts
getVectors(embedderId, ids): Promise<Map<number, Float32Array<ArrayBufferLike>>>;
```

Vectors are kept per embedder id, so a model change re-embeds.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `embedderId` | `string` |
| `ids` | `number`[] |

###### Returns

`Promise`\<`Map`\<`number`, `Float32Array`\<`ArrayBufferLike`\>\>\>

##### loadItems()

```ts
loadItems(): Promise<StoredItem[]>;
```

###### Returns

`Promise`\<[`StoredItem`](#storeditem)[]\>

##### putItems()

```ts
putItems(items): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `items` | [`StoredItem`](#storeditem)[] |

###### Returns

`Promise`\<`void`\>

##### putKv()

```ts
putKv(key, value): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `value` | `unknown` |

###### Returns

`Promise`\<`void`\>

##### putVectors()

```ts
putVectors(embedderId, vecs): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `embedderId` | `string` |
| `vecs` | `Map`\<`number`, `Float32Array`\<`ArrayBufferLike`\>\> |

###### Returns

`Promise`\<`void`\>

***

### Message

A chat message with a role and text content, as `injectRecall` and `RecallConversation` read and write it.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-content"></a> `content` | `string` |
| <a id="property-role"></a> `role` | `"system"` \| `"user"` \| `"assistant"` \| `"tool"` |

***

### OpenOptions

Options for `open`: the loaded core, the embedder, the sink, the scopes and the injected clock.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-batch"></a> `batch?` | `number` | Texts per embed call. Default 12. |
| <a id="property-core-2"></a> `core` | [`Core`](#core) | The loaded wasm core (loadCore). |
| <a id="property-embed"></a> `embed?` | [`Embedder`](#embedder) \| `null` | Leave out for keyword only recall. |
| <a id="property-indexeddb"></a> `indexedDB?` | `IDBFactory` | - |
| <a id="property-now-1"></a> `now?` | () => `number` | Clock in milliseconds since 1970. Default Date.now. |
| <a id="property-scopes-1"></a> `scopes?` | `string`[] | Scopes recall searches when a call names none. Default ["self"]. |
| <a id="property-sink-1"></a> `sink?` | [`MemorySink`](#memorysink) | Defaults to IndexedDB, then to a Map when IndexedDB fails. |

***

### Recall

The result of `Memory.recall`: the hits, every fused candidate as a trace row, and the mode it ran in.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-hits"></a> `hits` | [`Hit`](#hit)[] | - |
| <a id="property-mode"></a> `mode` | `"hybrid"` \| `"keyword"` | - |
| <a id="property-params"></a> `params` | [`RecallParams`](#recallparams) | What the recall ran with; `Memory.trace` reads it. |
| <a id="property-query"></a> `query` | `string` | - |
| <a id="property-trace"></a> `trace` | ([`CoreHit`](#corehit) & `object`)[] | Every fused candidate, ranked, with its terms: the recall inspector rows. `parts` times `weight` is the score. |

***

### RecallOptions

Options for `Memory.recall`: how many hits, the candidate pool, the scorer, scope and kind filters and the turns to skip.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cand-1"></a> `cand?` | `number` | - |
| <a id="property-k-1"></a> `k?` | `number` | - |
| <a id="property-kinds-1"></a> `kinds?` | (`"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"`)[] | - |
| <a id="property-place-3"></a> `place?` | \[`number`, `number`, `number`\] | - |
| <a id="property-previous"></a> `previous?` | `string` | The previous user turn, prepended to a query under 45 characters. |
| <a id="property-rrfk-1"></a> `rrfK?` | `number` | - |
| <a id="property-scopes-2"></a> `scopes?` | `string`[] | - |
| <a id="property-score-2"></a> `score?` | `"linear"` \| `"organic"` | - |
| <a id="property-skipsaid"></a> `skipSaid?` | `string`[] | User turns still in view: a memory whose meta.said is one of them is skipped and the next takes its place. |
| <a id="property-strengthen"></a> `strengthen?` | `boolean` | uses + 1 and weight + 0.02 on each hit. Default true. |
| <a id="property-tauh-1"></a> `tauH?` | `number` | Recency time constant in hours for the linear scorer. Default 72. |
| <a id="property-valence-3"></a> `valence?` | `number` | - |
| <a id="property-vecfloor-1"></a> `vecFloor?` | `number` | - |
| <a id="property-weights"></a> `weights?` | `object` | - |
| `weights.imp?` | `number` | - |
| `weights.rec?` | `number` | - |
| `weights.rel?` | `number` | - |

***

### RecallParams

The parameters a recall ran with, as the trace needs them.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cand-2"></a> `cand` | `number` | - |
| <a id="property-k-2"></a> `k` | `number` | - |
| <a id="property-kinds-2"></a> `kinds` | \| (`"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"`)[] \| `null` | - |
| <a id="property-now-2"></a> `now` | `number` | Clock at the recall, ms. |
| <a id="property-place-4"></a> `place` | \[`number`, `number`, `number`\] \| `null` | - |
| <a id="property-rrfk-2"></a> `rrfK` | `number` | - |
| <a id="property-scopes-3"></a> `scopes` | `string`[] \| `null` | - |
| <a id="property-scorer-1"></a> `scorer` | `"linear"` \| `"organic"` | - |
| <a id="property-skipsaid-1"></a> `skipSaid` | `string`[] | User turns still in view; memories of them were skipped. |
| <a id="property-tauh-2"></a> `tauH` | `number` | - |
| <a id="property-valence-4"></a> `valence` | `number` | - |
| <a id="property-vecfloor-2"></a> `vecFloor` | `number` | - |
| <a id="property-weights-1"></a> `weights` | `object` | - |
| `weights.imp` | `number` | - |
| `weights.rec` | `number` | - |
| `weights.rel` | `number` | - |

***

### RecallTrace

The recall inspector's view of one query: the parameters, per term weights and every candidate row with its score parts.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-how"></a> `how` | `string` | One lowercase sentence on how candidates were scored. |
| <a id="property-mode-1"></a> `mode` | `"hybrid"` \| `"keyword"` | - |
| <a id="property-params-1"></a> `params` | [`RecallParams`](#recallparams) | - |
| <a id="property-query-1"></a> `query` | `string` | - |
| <a id="property-rows"></a> `rows` | [`TraceRow`](#tracerow)[] | - |
| <a id="property-terms-1"></a> `terms` | [`TermWeight`](#termweight)[] | - |

***

### Section

One named block of context with the priority `budget` keeps it by.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-name"></a> `name` | `string` |
| <a id="property-priority"></a> `priority` | `number` |
| <a id="property-text-3"></a> `text` | `string` |

***

### Status

How a memory is running: hybrid or keyword recall, IndexedDB or a Map, SIMD on or off, and why.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-mode-2"></a> `mode` | `"hybrid"` \| `"keyword"` | - |
| <a id="property-notes"></a> `notes` | `string`[] | Why recall is keyword only, or why the sink is a Map, in lowercase. |
| <a id="property-simd-1"></a> `simd` | `boolean` | - |
| <a id="property-sink-2"></a> `sink` | `"indexeddb"` \| `"memory"` | - |

***

### StorageLike

The part of the browser's StorageManager the usage line reads.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-estimate"></a> `estimate?` | () => `Promise`\<\{ `quota?`: `number`; `usage?`: `number`; \}\> |
| <a id="property-persist"></a> `persist?` | () => `Promise`\<`boolean`\> |
| <a id="property-persisted"></a> `persisted?` | () => `Promise`\<`boolean`\> |

***

### StoredItem

One stored item. Times are milliseconds since 1970.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-arousal-2"></a> `arousal` | `number` | - |
| <a id="property-created-1"></a> `created` | `number` | - |
| <a id="property-edited"></a> `edited?` | `number` | When a person last changed it by hand, ms since 1970. |
| <a id="property-entities-2"></a> `entities?` | `string`[] | - |
| <a id="property-id-5"></a> `id` | `number` | - |
| <a id="property-importance-3"></a> `importance` | `number` | - |
| <a id="property-kind-4"></a> `kind` | `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"` | - |
| <a id="property-lastused-1"></a> `lastUsed` | `number` | - |
| <a id="property-meta-2"></a> `meta?` | `Record`\<`string`, `unknown`\> | - |
| <a id="property-novelty-2"></a> `novelty` | `number` | - |
| <a id="property-place-5"></a> `place?` | \[`number`, `number`, `number`\] | - |
| <a id="property-scope-3"></a> `scope` | `string` | - |
| <a id="property-section-2"></a> `section?` | `string` | Section or source label, used by the per section cap in select. |
| <a id="property-text-4"></a> `text` | `string` | - |
| <a id="property-uses-1"></a> `uses` | `number` | - |
| <a id="property-valence-5"></a> `valence` | `number` | - |
| <a id="property-weight-1"></a> `weight` | `number` | - |

***

### TermWeight

One query term: in how many admitted memories it occurs and its idf.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-df"></a> `df` | `number` |
| <a id="property-idf"></a> `idf` | `number` |
| <a id="property-term"></a> `term` | `string` |

***

### TraceRow

One candidate in a recall trace: its ranks, score parts, weight, matched terms and whether the caller got it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bm25-1"></a> `bm25` | `number` | - |
| <a id="property-bm25rank-1"></a> `bm25Rank` | `number` | - |
| <a id="property-cos-1"></a> `cos` | `number` | - |
| <a id="property-id-6"></a> `id` | `number` | - |
| <a id="property-imp-1"></a> `imp` | `number` | - |
| <a id="property-kind-5"></a> `kind` | `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"` | - |
| <a id="property-parts"></a> `parts` | `Record`\<`string`, `number`\> | Score parts before the weight: the sum times weight is the score. |
| <a id="property-rank"></a> `rank` | `number` | 1 based rank by final score. |
| <a id="property-rec-1"></a> `rec` | `number` | - |
| <a id="property-rel-1"></a> `rel` | `number` | - |
| <a id="property-ret-1"></a> `ret` | `number` | - |
| <a id="property-rrf-1"></a> `rrf` | `number` | - |
| <a id="property-score-3"></a> `score` | `number` | - |
| <a id="property-skipped"></a> `skipped` | `boolean` | Left out because its exchange is still in view. |
| <a id="property-terms-2"></a> `terms` | `object`[] | BM25 contribution of each query term found in this memory. |
| <a id="property-text-5"></a> `text` | `string` | - |
| <a id="property-used"></a> `used` | `boolean` | In the hits the caller got. |
| <a id="property-vecrank-1"></a> `vecRank` | `number` | - |
| <a id="property-weight-2"></a> `weight` | `number` | The item's strength multiplier at recall time. |

***

### Usage

What `Memory.usage` reports: item counts by kind, core lines, a computed byte estimate and the browser's storage estimate.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-browser"></a> `browser` | \| \{ `persisted`: `boolean` \| `null`; `quota`: `number` \| `null`; `usage`: `number` \| `null`; \} \| `null` | The whole origin, from navigator.storage.estimate (vendor estimate); null where the browser gives none. |
| <a id="property-bykind"></a> `byKind` | `Record`\<[`Kind`](#kind), `number`\> | - |
| <a id="property-bytes"></a> `bytes` | `number` | Bytes of item json plus one float32 vector per item when an embedder is loaded (computed estimate; the store's real overhead is unknown). |
| <a id="property-corelines"></a> `coreLines` | `number` | - |
| <a id="property-items-1"></a> `items` | `number` | - |

## Type Aliases

### CoreSource

```ts
type CoreSource = 
  | {
  url: string | URL;
}
  | {
  bytes: ArrayBuffer | Uint8Array;
}
  | {
  base64: string;
};
```

Where `loadCore` gets the wasm: a URL, the bytes, or inlined base64.

***

### Kind

```ts
type Kind = typeof KINDS[number];
```

An item kind: episode, gist, lesson, fact, rule, lore, doc or note.

## Variables

### CHARS\_PER\_TOKEN

```ts
const CHARS_PER_TOKEN: 3.6 = 3.6;
```

Characters per token for the default estimate (inferred from earlier builds, not measured on a tokenizer).

***

### HIT\_STRIDE

```ts
const HIT_STRIDE: 11 = 11;
```

The number of float64 values per hit row the core writes, one per field of `CoreHit`.

***

### KINDS

```ts
const KINDS: readonly ["episode", "gist", "lesson", "fact", "rule", "lore", "doc", "note"];
```

Item kinds, in the order of the Rust constants.

***

### RECALL\_NOTE

```ts
const RECALL_NOTE: "Lines that start with [memory] under a user message are notes you kept from earlier talks. Use them when they fit; never quote them as the person's words." = "Lines that start with [memory] under a user message are notes you kept from earlier talks. Use them when they fit; never quote them as the person's words.";
```

The fixed note `injectRecall` adds to the system message, telling the model what `[memory]` lines are.

## Functions

### assembleSections()

```ts
function assembleSections(o): Assembled;
```

The memory sections in the order of the embodied agent prompt: core
facts (priority 10), caller sections, a summary (6), recalled lines (5),
recent turns (3), then budget().

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `budgetTokens`: `number`; `coreText?`: `string`; `estimate?`: (`s`) => `number`; `fixed?`: `string`[]; `recalled?`: `string`[]; `recent?`: `string`[]; `sections?`: [`Section`](#section)[]; `summary?`: `string`; \} |
| `o.budgetTokens` | `number` |
| `o.coreText?` | `string` |
| `o.estimate?` | (`s`) => `number` |
| `o.fixed?` | `string`[] |
| `o.recalled?` | `string`[] |
| `o.recent?` | `string`[] |
| `o.sections?` | [`Section`](#section)[] |
| `o.summary?` | `string` |

#### Returns

[`Assembled`](#assembled)

***

### budget()

```ts
function budget(opts): Assembled;
```

Fixed lines always go in; ranked sections join highest priority first
while they fit the budget (equal priorities keep their given order). A
section that does not fit is skipped and smaller ones below it may still
join.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | \{ `budgetTokens`: `number`; `estimate?`: (`s`) => `number`; `fixed?`: `string`[]; `joiner?`: `string`; `sections`: [`Section`](#section)[]; \} |
| `opts.budgetTokens` | `number` |
| `opts.estimate?` | (`s`) => `number` |
| `opts.fixed?` | `string`[] |
| `opts.joiner?` | `string` |
| `opts.sections` | [`Section`](#section)[] |

#### Returns

[`Assembled`](#assembled)

***

### estimateTokens()

```ts
function estimateTokens(s): number;
```

Estimates the tokens in a string as its length over `CHARS_PER_TOKEN`, rounded up.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`number`

***

### exchangeNote()

```ts
function exchangeNote(
   said, 
   reply, 
   o?
): 
  | {
  meta: {
     said: string;
  };
  text: string;
}
  | null;
```

An exchange worth keeping, as a note: null under 3 meaningful words; the reply cut at 160 characters on a word boundary.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `said` | `string` |
| `reply` | `string` |
| `o?` | \{ `minWords?`: `number`; `replyChars?`: `number`; \} |
| `o.minWords?` | `number` |
| `o.replyChars?` | `number` |

#### Returns

  \| \{
  `meta`: \{
     `said`: `string`;
  \};
  `text`: `string`;
\}
  \| `null`

***

### expandQuery()

```ts
function expandQuery(
   query, 
   previous?, 
   minChars?
): string;
```

The previous user turn goes in front of a short query (under 45 characters), so follow ups retrieve.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `query` | `string` | `undefined` |
| `previous?` | `string` | `undefined` |
| `minChars?` | `number` | `45` |

#### Returns

`string`

***

### fingerprint()

```ts
function fingerprint(texts, embedderId): string;
```

Fingerprint of a corpus under an embedder: FNV-1a over every text and the embedder id.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `texts` | `string`[] |
| `embedderId` | `string` |

#### Returns

`string`

***

### fnv1a()

```ts
function fnv1a(s, seed?): number;
```

FNV-1a 32 bit over the UTF-16 code units of s.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `s` | `string` | `undefined` |
| `seed?` | `number` | `0x811c9dc5` |

#### Returns

`number`

***

### gistOf()

```ts
function gistOf(texts): string;
```

A gist without a model: the most frequent words and three samples.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `texts` | `string`[] |

#### Returns

`string`

***

### hashedEmbedder()

```ts
function hashedEmbedder(dim?): Embedder;
```

Hashed unigram plus bigram embedder: FNV-1a picks a bucket and a sign,
the vector is L2 normalized. No weights, no download, no licence. It
finds shared words and word pairs; it does not find paraphrase.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dim?` | `number` | `384` |

#### Returns

[`Embedder`](#embedder)

***

### howScored()

```ts
function howScored(
   mode, 
   p, 
   rows, 
   used
): string;
```

The sentence above the trace.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mode` | `"hybrid"` \| `"keyword"` |
| `p` | [`RecallParams`](#recallparams) |
| `rows` | `number` |
| `used` | `number` |

#### Returns

`string`

***

### indexedDbSink()

```ts
function indexedDbSink(id, opts?): Promise<MemorySink>;
```

A sink over one IndexedDB database per memory id, named
`hackbuild-memory:<id>`, with stores items (keyPath id), vectors (key
`<embedder id>|<item id>`, value an ArrayBuffer of float32) and kv.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `opts?` | \{ `indexedDB?`: `IDBFactory`; \} |
| `opts.indexedDB?` | `IDBFactory` |

#### Returns

`Promise`\<[`MemorySink`](#memorysink)\>

***

### injectRecall()

```ts
function injectRecall(
   messages, 
   recalled, 
   opts?
): Message[];
```

Prefix stable recall injection. The system message gets one fixed note
(the same text every turn); recalled lines go under the latest user
message only. No earlier message changes, so a runtime that keeps the
KV cache of the previous prompt reuses all of it, provided the caller
keeps the returned messages as its history.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `messages` | [`Message`](#message)[] |
| `recalled` | `string`[] |
| `opts?` | \{ `note?`: `string`; `tag?`: `string`; \} |
| `opts.note?` | `string` |
| `opts.tag?` | `string` |

#### Returns

[`Message`](#message)[]

***

### jaccard()

```ts
function jaccard(a, b): number;
```

The Jaccard similarity of the word sets of two strings, 0 to 1; two empty strings give 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `string` |
| `b` | `string` |

#### Returns

`number`

***

### kindCode()

```ts
function kindCode(k): number;
```

The core's number for a kind, its index in `KINDS`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `k` | `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` \| `"note"` |

#### Returns

`number`

***

### loadCore()

```ts
function loadCore(src, opts?): Promise<Core>;
```

Instantiates the core from a URL, bytes, or inlined base64. A URL is
fetched as an ArrayBuffer and instantiated from bytes, which also works
from file:// pages that refuse instantiateStreaming.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`CoreSource`](#coresource) |
| `opts?` | \{ `fetch?`: (`input`, `init?`) => `Promise`\<`Response`\>; \} |
| `opts.fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> |

#### Returns

`Promise`\<[`Core`](#core)\>

***

### memorySink()

```ts
function memorySink(): MemorySink;
```

A sink over a Map. Nothing outlives the page.

#### Returns

[`MemorySink`](#memorysink)

***

### open()

```ts
function open(id, opts): Promise<Memory>;
```

Opens or creates the memory named id.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `opts` | [`OpenOptions`](#openoptions) |

#### Returns

`Promise`\<[`Memory`](#memory)\>

***

### paramBlock()

```ts
function paramBlock(p): Float64Array;
```

The parameter block layout read by params_from in crates/memory/src/lib.rs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`CoreParams`](#coreparams) |

#### Returns

`Float64Array`

***

### scoreParts()

```ts
function scoreParts(
   h, 
   it, 
   p
): Record<string, number>;
```

Score parts of one hit, the same arithmetic as the core's scorers.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | [`CoreHit`](#corehit) |
| `it` | [`StoredItem`](#storeditem) |
| `p` | [`RecallParams`](#recallparams) |

#### Returns

`Record`\<`string`, `number`\>

***

### select()

```ts
function select(hits, opts?): string[];
```

Picks recalled texts for a prompt: at most k, at most perSection from one
section, none within the Jaccard threshold of one already picked, and at
most maxChars in all; the last one is cut at a word boundary.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hits` | `object`[] |
| `opts?` | \{ `dedup?`: `number`; `k?`: `number`; `maxChars?`: `number`; `perSection?`: `number`; \} |
| `opts.dedup?` | `number` |
| `opts.k?` | `number` |
| `opts.maxChars?` | `number` |
| `opts.perSection?` | `number` |

#### Returns

`string`[]

***

### termWeights()

```ts
function termWeights(query, docs): object;
```

Per term idf over the admitted memories, and each memory's per term BM25 contribution.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `docs` | readonly `Pick`\<[`StoredItem`](#storeditem), `"id"` \| `"text"`\>[] |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `byId` | `Map`\<`number`, `object`[]\> |
| `terms` | [`TermWeight`](#termweight)[] |

***

### tokenize()

```ts
function tokenize(text): string[];
```

The core's tokenizer: lowercase, split on anything not a letter or digit, stop words and one character tokens out, a few suffixes stripped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`string`[]

***

### withRecall()

```ts
function withRecall(
   text, 
   recalled, 
   tag?
): string;
```

A user message with recalled lines under it, one tagged line each.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `recalled` | `string`[] | `undefined` |
| `tag?` | `string` | `"[memory]"` |

#### Returns

`string`

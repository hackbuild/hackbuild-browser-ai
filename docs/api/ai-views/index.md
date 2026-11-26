# index

## Interfaces

### Channel

One file in a transcribe queue: name, size, status, progress, segments, dropped lines and the
error if it failed.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dropped"></a> `dropped` | `Dropped`[] | - |
| <a id="property-duration"></a> `duration?` | `number` | - |
| <a id="property-error"></a> `error?` | `string` | - |
| <a id="property-id"></a> `id` | `number` | - |
| <a id="property-language"></a> `language?` | `string` | - |
| <a id="property-meta"></a> `meta` | `StripFigure`[] | - |
| <a id="property-model"></a> `model?` | `string` | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-pct"></a> `pct` | `number` | 0 to 100 while running. |
| <a id="property-rail"></a> `rail?` | `object` | - |
| `rail.db` | `number`[] | - |
| `rail.kept` | `number`[] | - |
| <a id="property-segments"></a> `segments` | `Seg`[] | - |
| <a id="property-size"></a> `size` | `number` | - |
| <a id="property-stats"></a> `stats?` | `object` | - |
| `stats.density` | `number` | - |
| `stats.dur` | `number` | - |
| `stats.forced` | `boolean` | - |
| `stats.gainDb` | `number` | - |
| `stats.loudDb` | `number` | - |
| `stats.noiseDb` | `number` | - |
| `stats.reels` | `number` | - |
| `stats.rtf` | `number` | - |
| `stats.snrDb` | `number` | - |
| `stats.speechDb` | `number` | - |
| `stats.thrDb` | `number` | - |
| `stats.wall` | `number` | - |
| <a id="property-status"></a> `status` | `StripStatus` | - |

***

### ChatList

Several chats: a list with the newest first, one
open. `thread` always speaks for the open chat, so a pane and a composer
bound to it follow a switch.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-thread"></a> `thread` | `readonly` | [`ChatThread`](#chatthread) |

#### Methods

##### create()

```ts
create(): string;
```

###### Returns

`string`

##### dump()

```ts
dump(): ChatListData;
```

Every chat as plain data, for storage or an export.

###### Returns

[`ChatListData`](#chatlistdata)

##### open()

```ts
open(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

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

##### rename()

```ts
rename(id, title): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `title` | `string` |

###### Returns

`void`

##### restore()

```ts
restore(data, o?): void;
```

Adds chats from `dump()` data (an import or a reload); `replace` drops the current ones first.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | [`ChatListData`](#chatlistdata) |
| `o?` | \{ `replace?`: `boolean`; \} |
| `o.replace?` | `boolean` |

###### Returns

`void`

##### setEngine()

```ts
setEngine(engine): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `engine` | `ChatEngine` \| `null` |

###### Returns

`void`

##### snapshot()

```ts
snapshot(): ChatListSnapshot;
```

###### Returns

[`ChatListSnapshot`](#chatlistsnapshot-1)

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

***

### ChatListData

A chat list as plain data: format, version, the open chat and each chat's title and turns.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-chats"></a> `chats` | `object`[] |
| <a id="property-current"></a> `current?` | `string` |
| <a id="property-format"></a> `format` | `"hackbuild-chats"` |
| <a id="property-version"></a> `version` | `1` |

***

### ChatListItem

One chat in a chat list: id, title, last update and turn count.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-count"></a> `count` | `number` |
| <a id="property-id-1"></a> `id` | `string` |
| <a id="property-title"></a> `title` | `string` |
| <a id="property-updated"></a> `updated` | `number` |

***

### ChatListSnapshot

The chats of a list, newest first, and the id of the open one.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-current-1"></a> `current` | `string` |
| <a id="property-items"></a> `items` | readonly [`ChatListItem`](#chatlistitem)[] |

***

### ChatThread

A chat thread: send, stop, regenerate, remove and clear turns, set the engine, and export as markdown.

#### Methods

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### load()

```ts
load(turns): void;
```

Replace the turns (a restored or imported chat).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `turns` | readonly [`Turn`](#turn)[] |

###### Returns

`void`

##### markdown()

```ts
markdown(title?): string;
```

The thread as markdown, for an export.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `title?` | `string` |

###### Returns

`string`

##### regenerate()

```ts
regenerate(): Promise<void>;
```

Drop the last reply and ask again.

###### Returns

`Promise`\<`void`\>

##### remove()

```ts
remove(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### send()

```ts
send(text): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

##### setEngine()

```ts
setEngine(engine): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `engine` | `ChatEngine` \| `null` |

###### Returns

`void`

##### snapshot()

```ts
snapshot(): ThreadSnapshot;
```

###### Returns

[`ThreadSnapshot`](#threadsnapshot)

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

***

### FrameBox

What FrameView draws over a frame, as data: boxes from a detector,
landmark points from a face, hand or pose model, and a caption from a
vision language model. Coordinates are in source pixels. Pure, so the
mapping onto a tile that crops (object-fit cover) is tested in Node.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-h"></a> `h` | `number` | - |
| <a id="property-label"></a> `label?` | `string` | - |
| <a id="property-score"></a> `score?` | `number` | 0 to 1. |
| <a id="property-w"></a> `w` | `number` | - |
| <a id="property-x"></a> `x` | `number` | - |
| <a id="property-y"></a> `y` | `number` | - |

***

### FrameLandmarks

Landmark points to draw on a frame, with the index pairs to join and a label.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-edges"></a> `edges?` | \[`number`, `number`\][] | Index pairs to join with lines. |
| <a id="property-label-1"></a> `label?` | `string` | - |
| <a id="property-points"></a> `points` | `object`[] | - |

***

### FrameResults

What to draw on a frame: boxes, landmarks, a caption and a corner tag.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-boxes"></a> `boxes?` | [`FrameBox`](#framebox)[] | - |
| <a id="property-caption"></a> `caption?` | `string` | - |
| <a id="property-landmarks"></a> `landmarks?` | [`FrameLandmarks`](#framelandmarks)[] | - |
| <a id="property-tag"></a> `tag?` | `string` | Short words for a tile corner: "3 found", "12 ms". |

***

### JobDef

A job's words (line label, sheet title, empty line) and which capabilities serve it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-empty"></a> `empty` | `string` | What the gate or the empty line says with nothing picked. |
| <a id="property-label-2"></a> `label` | `string` | The word on a job line: "brain", "ears". |
| <a id="property-provides"></a> `provides` | (`caps`) => `boolean` | - |
| <a id="property-title-1"></a> `title` | `string` | The sheet's title: "pick a chat model". |

***

### JobLine

One line of a jobs rack: the job, its label, whether it is required, and the chosen row.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-job"></a> `job` | [`Job`](#job) |
| <a id="property-label-3"></a> `label` | `string` |
| <a id="property-required"></a> `required` | `boolean` |
| <a id="property-row"></a> `row` | `ModelRow` \| `undefined` |

***

### JobLoaderOptions

Options for [jobLoader](#jobloader). Share one object between loaders to share one hub.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-allowgplphonemizer"></a> `allowGplPhonemizer?` | `boolean` | Kokoro's phonemizer is GPL-3.0-or-later; it is fetched only when this is true. |
| <a id="property-env"></a> `env?` | `Env` | This machine; default `probe()` from @hackbuild/ai-env. |
| <a id="property-fetch"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | fetch for files a runtime does not fetch itself (static embedders). |
| <a id="property-modules"></a> `modules?` | [`RuntimeModules`](#runtimemodules) | Runtime modules in place of the pinned CDN imports (tests). |
| <a id="property-rng"></a> `rng?` | () => `number` | Random numbers for the bellows voice; default a fixed seed. |
| <a id="property-store"></a> `store?` | `WeightStore` \| `Promise`\<`WeightStore`\> | Where weights are kept; default `openWeightStore()`. |

***

### JobsPick

Several pickers as one rack: a line per job, presets with their totals, and load all.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-picks"></a> `picks` | `readonly` | `ReadonlyMap`\<[`Job`](#job), [`ModelPick`](#modelpick)\> |

#### Methods

##### all()

```ts
all(): object;
```

"load all, 1.2 gb" and the ids it would fetch.

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `ids` | `string`[] |
| `label` | `string` |

##### applyPreset()

```ts
applyPreset(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

##### lines()

```ts
lines(): JobLine[];
```

###### Returns

[`JobLine`](#jobline)[]

##### loadAll()

```ts
loadAll(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### presets()

```ts
presets(): object[];
```

###### Returns

`object`[]

##### setPresets()

```ts
setPresets(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | readonly [`PickPreset`](#pickpreset)[] |

###### Returns

`void`

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | () => `void` |

###### Returns

() => `void`

##### update()

```ts
update(o): void;
```

New machine facts, records or loader for every job.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `env?`: `Env`; `estimate?`: `StorageEstimate` \| `null`; `loader?`: [`Loader`](#loader); `onRemove?`: (`rec`) => `void` \| `Promise`\<`void`\>; `records?`: readonly `ModelRecord`[]; `stored?`: `Iterable`\<`string`, `any`, `any`\>; \} |
| `o.env?` | `Env` |
| `o.estimate?` | `StorageEstimate` \| `null` |
| `o.loader?` | [`Loader`](#loader) |
| `o.onRemove?` | (`rec`) => `void` \| `Promise`\<`void`\> |
| `o.records?` | readonly `ModelRecord`[] |
| `o.stored?` | `Iterable`\<`string`, `any`, `any`\> |

###### Returns

`void`

***

### JobValues

What a jobLoader load resolves to, per job: chat a ChatEngine; transcribe a
Transcriber; detect a DetectFn; masks MaskModels; depth a DepthFn; vision an
AskFn; image an ImageJob; voice a loaded @hackbuild/speak Engine; embed an
Embedder. faceswap and landmarks resolve to the hub's loaded value as is.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-chat"></a> `chat` | `ChatEngine` |
| <a id="property-depth"></a> `depth` | [`DepthFn`](#depthfn) |
| <a id="property-detect"></a> `detect` | [`DetectFn`](#detectfn) |
| <a id="property-embed"></a> `embed` | `Embedder` |
| <a id="property-faceswap"></a> `faceswap` | `unknown` |
| <a id="property-image"></a> `image` | [`ImageJob`](#imagejob) |
| <a id="property-landmarks-1"></a> `landmarks` | `unknown` |
| <a id="property-masks"></a> `masks` | [`MaskModels`](elements.md#maskmodels) |
| <a id="property-transcribe"></a> `transcribe` | [`Transcriber`](#transcriber) |
| <a id="property-vision"></a> `vision` | [`AskFn`](#askfn) |
| <a id="property-voice"></a> `voice` | `Engine` |

***

### LoadContext

What a loader gets: an abort signal, a progress callback and the row's options.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-onprogress"></a> `onProgress` | (`fraction`) => `void` | 0 to 1, or null while the total is unknown. |
| <a id="property-options"></a> `options` | `Record`\<`string`, `string`\> | - |
| <a id="property-signal"></a> `signal` | `AbortSignal` | - |

***

### MemoryUsed

A memory recalled for a reply, with its label and score.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-label-4"></a> `label` | `string` | - |
| <a id="property-score-1"></a> `score?` | `number` | 0 to 1, shown beside the label. |

***

### ModelPick

A model picker for one job: choose, load, cancel, remove, set row options, add your own model,
and subscribe to its snapshot.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-job-1"></a> `job` | `readonly` | [`Job`](#job) |

#### Methods

##### cancel()

```ts
cancel(id?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id?` | `string` |

###### Returns

`void`

##### choose()

```ts
choose(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`void`

##### custom()

```ts
custom(kind, values): string;
```

Add a model from a "your own" form; returns its id.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | `OwnKind` |
| `values` | `Record`\<`string`, `string`\> |

###### Returns

`string`

##### error()

```ts
error(id): string | undefined;
```

The error of the last failed load of a row.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`string` \| `undefined`

##### load()

```ts
load(id?): Promise<void>;
```

Load the chosen model, or `id`, through the loader. Rejects when there is no loader or the load fails; the row shows it.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id?` | `string` |

###### Returns

`Promise`\<`void`\>

##### option()

```ts
option(
   id, 
   key, 
   value
): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `key` | `string` |
| `value` | `string` |

###### Returns

`void`

##### optionsOf()

```ts
optionsOf(id): Record<string, string>;
```

Options set on a row.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Record`\<`string`, `string`\>

##### record()

```ts
record(id): ModelRecord | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`ModelRecord` \| `undefined`

##### remove()

```ts
remove(id): Promise<void>;
```

Delete a stored model through onRemove, then forget it.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`void`\>

##### result()

```ts
result(id): unknown;
```

What the loader returned for a model.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`unknown`

##### snapshot()

```ts
snapshot(): PickSnapshot;
```

###### Returns

[`PickSnapshot`](#picksnapshot)

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

##### update()

```ts
update(o): void;
```

New machine facts (env, storage) or records.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `env?`: `Env`; `estimate?`: `StorageEstimate` \| `null`; `loader?`: [`Loader`](#loader); `onRemove?`: (`rec`) => `void` \| `Promise`\<`void`\>; `records?`: readonly `ModelRecord`[]; `stored?`: `Iterable`\<`string`, `any`, `any`\>; \} |
| `o.env?` | `Env` |
| `o.estimate?` | `StorageEstimate` \| `null` |
| `o.loader?` | [`Loader`](#loader) |
| `o.onRemove?` | (`rec`) => `void` \| `Promise`\<`void`\> |
| `o.records?` | readonly `ModelRecord`[] |
| `o.stored?` | `Iterable`\<`string`, `any`, `any`\> |

###### Returns

`void`

***

### Persona

A persona in three parts, highest priority first, with its name and first line.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-first"></a> `first?` | `string` | - |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-notes"></a> `notes` | `string` | Extra notes: dropped before the profile when the request runs out of room. |
| <a id="property-profile"></a> `profile` | `string` | Who you are and how to answer: always sent. |
| <a id="property-rules"></a> `rules` | `string` | Extra rules: dropped first. |

***

### PersonaPresetX

A named persona a person can load in one press.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-label-5"></a> `label` | `string` |
| <a id="property-persona"></a> `persona` | [`Persona`](#persona) |

***

### PersonaRack

The persona state: the current persona, presets, and the system prompt fitted to a budget.

#### Methods

##### load()

```ts
load(i): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |

###### Returns

`void`

##### removePreset()

```ts
removePreset(i): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |

###### Returns

`void`

##### save()

```ts
save(label): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `label` | `string` |

###### Returns

`void`

##### set()

```ts
set(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | `Partial`\<[`Persona`](#persona)\> |

###### Returns

`void`

##### snapshot()

```ts
snapshot(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `builtIn` | `number` |
| `on` | `number` |
| `persona` | [`Persona`](#persona) |
| `presets` | readonly [`PersonaPresetX`](#personapresetx)[] |

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

##### system()

```ts
system(mem?, budgetTokens?): object;
```

The system prompt: profile, memory, notes, rules, in that priority, fitted
to `budgetTokens` (about 4 characters a token, inferred); the lowest go
first. Returns the text and the parts dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mem?` | readonly [`MemoryUsed`](#memoryused)[] |
| `budgetTokens?` | `number` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `dropped` | `string`[] |
| `text` | `string` |

***

### PickOptions

Options for `useModelPick`: records, env, storage estimate, loader, remover, stored ids, the
chosen id and extra row options.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-chosen"></a> `chosen?` | `string` | - |
| <a id="property-env-1"></a> `env?` | `Env` | - |
| <a id="property-estimate"></a> `estimate?` | `StorageEstimate` \| `null` | - |
| <a id="property-extra"></a> `extra?` | (`rec`) => readonly `ModelOption`[] | Options a job adds to every row, like a language select for speech. |
| <a id="property-loader"></a> `loader?` | [`Loader`](#loader) | Loads a model; required to load. weightsLoader(store) fetches files; a page with a runtime passes its own. |
| <a id="property-onremove"></a> `onRemove?` | (`rec`) => `void` \| `Promise`\<`void`\> | Deletes a stored model's weights; weightsRemover(store) does it through @hackbuild/weights. |
| <a id="property-records"></a> `records?` | readonly `ModelRecord`[] | Records to pick from; default every record the views know. |
| <a id="property-stored"></a> `stored?` | `Iterable`\<`string`, `any`, `any`\> | Ids already on this machine. |

***

### PickPreset

A preset for a tool with several jobs: one pick per job.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-id-2"></a> `id` | `string` |
| <a id="property-label-6"></a> `label` | `string` |
| <a id="property-picks-1"></a> `picks` | `Partial`\<`Record`\<[`Job`](#job), `string`\>\> |

***

### PickSnapshot

What a picker shows: its job, title, rows, the chosen id and row, and what the loader returned for it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-chosen-1"></a> `chosen` | `string` | - |
| <a id="property-empty-1"></a> `empty` | `string` | - |
| <a id="property-job-2"></a> `job` | [`Job`](#job) | - |
| <a id="property-loaded"></a> `loaded` | `unknown` | What the loader returned for the chosen model, once it is loaded (an engine, a session). |
| <a id="property-row-1"></a> `row` | `ModelRow` \| `undefined` | - |
| <a id="property-rows"></a> `rows` | `ModelRow`[] | - |
| <a id="property-title-2"></a> `title` | `string` | - |

***

### QueueSnapshot

What a transcribe queue shows: channels, the selected one, whether it runs, and undo state.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-canredo"></a> `canRedo` | `boolean` |
| <a id="property-canundo"></a> `canUndo` | `boolean` |
| <a id="property-channels"></a> `channels` | readonly [`Channel`](#channel)[] |
| <a id="property-running"></a> `running` | `boolean` |
| <a id="property-selected"></a> `selected` | `number` \| `null` |

***

### RepoCheck

What a hub repo check found: whether it exists, whether it carries onnx files, and the words a row shows.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-note"></a> `note` | `string` |
| <a id="property-ok"></a> `ok` | `boolean` |
| <a id="property-onnx"></a> `onnx` | `number` |

***

### RowContext

What a row needs beyond its record: env, storage estimate, load state and progress, option
values, job options, and whether the person added it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-env-2"></a> `env?` | `Env` | - |
| <a id="property-estimate-1"></a> `estimate?` | `StorageEstimate` \| `null` | - |
| <a id="property-extra-1"></a> `extra?` | readonly `ModelOption`[] | Options a job adds, like a language for speech. |
| <a id="property-options-1"></a> `options?` | `Record`\<`string`, `string`\> | - |
| <a id="property-own"></a> `own?` | `boolean` | A row the person added by hand. |
| <a id="property-progress"></a> `progress?` | `number` | - |
| <a id="property-state"></a> `state?` | `ModelPickState` | - |

***

### RunContext

What a transcriber gets: an abort signal and a progress callback.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-onprogress-1"></a> `onProgress` | (`fraction`) => `void` | 0 to 1. |
| <a id="property-options-2"></a> `options?` | [`TranscribeRunOptions`](#transcriberunoptions) | The queue's run settings at the start of this file. |
| <a id="property-signal-1"></a> `signal` | `AbortSignal` | - |

***

### RunResult

What a transcriber returns: segments, dropped lines, duration, language and model.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dropped-1"></a> `dropped?` | `Dropped`[] | - |
| <a id="property-duration-1"></a> `duration?` | `number` | Seconds of audio. |
| <a id="property-language-1"></a> `language?` | `string` | - |
| <a id="property-model-1"></a> `model?` | `string` | - |
| <a id="property-rail-1"></a> `rail?` | `object` | Loudest level per bin in dBFS and whether the gate kept it, for a level strip. |
| `rail.db` | `number`[] | - |
| `rail.kept` | `number`[] | - |
| <a id="property-segments-1"></a> `segments` | `Seg`[] | - |
| <a id="property-stats-1"></a> `stats?` | `object` | Levels and speed of the run (computed), for the readout and the zip manifest. |
| `stats.density` | `number` | - |
| `stats.dur` | `number` | - |
| `stats.forced` | `boolean` | - |
| `stats.gainDb` | `number` | - |
| `stats.loudDb` | `number` | - |
| `stats.noiseDb` | `number` | - |
| `stats.reels` | `number` | - |
| `stats.rtf` | `number` | - |
| `stats.snrDb` | `number` | - |
| `stats.speechDb` | `number` | - |
| `stats.thrDb` | `number` | - |
| `stats.wall` | `number` | - |

***

### RuntimeModules

The runtime modules, each a function that imports it. Tests pass fakes; a page leaves them out.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bellows"></a> `bellows?` | () => `Promise`\<`unknown`\> | - |
| <a id="property-dsp"></a> `dsp?` | () => `Promise`\<`Dsp`\> | The audio dsp core transcription runs on; default the wasm inlined in @hackbuild/audio-dsp. |
| <a id="property-kokoro"></a> `kokoro?` | () => `Promise`\<`unknown`\> | - |
| <a id="property-ort"></a> `ort?` | () => `Promise`\<`OrtModule`\> | - |
| <a id="property-tasksvision"></a> `tasksVision?` | () => `Promise`\<`unknown`\> | - |
| <a id="property-transformers"></a> `transformers?` | () => `Promise`\<`TjsModule`\> | - |
| <a id="property-webllm"></a> `webllm?` | () => `Promise`\<`unknown`\> | - |
| <a id="property-wllama"></a> `wllama?` | () => `Promise`\<`unknown`\> | - |

***

### Speaker

Spoken lines in order, and the clone.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-cloned"></a> `cloned` | `readonly` | `boolean` |

#### Methods

##### clearClone()

```ts
clearClone(): void;
```

###### Returns

`void`

##### cloneFile()

```ts
cloneFile(file): Promise<number>;
```

Clones from an audio file; resolves to seconds of reference used.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `Blob` |

###### Returns

`Promise`\<`number`\>

##### cloneMic()

```ts
cloneMic(seconds, onTick?): Promise<number>;
```

Records `seconds` of mic and clones from it; `onTick` gets the seconds left.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seconds` | `number` |
| `onTick?` | (`left`) => `void` |

###### Returns

`Promise`\<`number`\>

##### cloneWav()

```ts
cloneWav(): Blob | null;
```

The prepared reference as a wav, or null with no clone.

###### Returns

`Blob` \| `null`

##### say()

```ts
say(text): Promise<void>;
```

Queues a line; resolves when it has been said or dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | () => `void` |

###### Returns

() => `void`

***

### SpeakerOptions

Options of `speaker`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-config"></a> `config?` | () => `VoiceConfig` | The voice config each line uses; a clone sets its own. |
| <a id="property-halt"></a> `halt?` | () => `void` | Stops what `play` is playing. |
| <a id="property-onerror"></a> `onError?` | (`err`, `text`) => `void` | A line that failed to render or play, with the reason; the chain goes on with the next line. |
| <a id="property-online"></a> `onLine?` | (`text`) => `void` | Each line as it starts, for a caption. |
| <a id="property-play"></a> `play?` | (`line`) => `Promise`\<`void`\> | Plays one line; resolves when it is over. A character stage's `say` fits. With none, the line is dropped after `onLine`. |

***

### SpokenLine

One line ready to play: the text, and for a rendering engine the audio with its word and phoneme times.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-audio"></a> `audio?` | `AudioBuffer` |
| <a id="property-phonemes"></a> `phonemes?` | readonly `object`[] |
| <a id="property-text"></a> `text` | `string` |
| <a id="property-words"></a> `words?` | readonly `object`[] |

***

### ThreadOptions

Options for `chatThread` and `chatList`: engine, system prompt, memory recall, the no engine
reply, clock and reply token cap.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-engine"></a> `engine?` | `ChatEngine` \| `null` | - |
| <a id="property-history"></a> `history?` | () => `number` | How many earlier turns go with each request; all when unset. |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | Reply token cap. |
| <a id="property-noengine"></a> `noEngine?` | `string` | What a reply says with no engine. |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onreply"></a> `onReply?` | (`turn`, `said`) => `void` | Called when a reply ends with text, with the user's message: speak it, save a note. |
| <a id="property-recall"></a> `recall?` | (`query`) => `Promise`\<[`MemoryUsed`](#memoryused)[]\> | Memory for a message; its hits ride along in the system prompt and show under the reply. |
| <a id="property-stream"></a> `stream?` | () => `Omit`\<`StreamOptions`, `"signal"`\> | Sampling, schema and other reply options, read at each reply. |
| <a id="property-system"></a> `system?` | `string` \| (() => `string`) | The system prompt, or a function read at each reply (a persona that changes). |
| <a id="property-systemfor"></a> `systemFor?` | (`mem`) => `string` | Builds the system prompt from the persona and the memory recalled for this reply, in place of the default join; a page fits both to a budget here (priority trimmed sections). |

***

### ThreadSnapshot

What a thread shows: its turns, whether a reply streams, and whether an engine is set.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-busy"></a> `busy` | `boolean` | - |
| <a id="property-ready"></a> `ready` | `boolean` | An engine is set; without one a reply says how to get one. |
| <a id="property-turns"></a> `turns` | readonly [`Turn`](#turn)[] | - |

***

### TraceRow

One row of a recall trace as text: rank, id, kind, text, BM25, cosine, RRF, score, and whether it
went to the model.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bm25"></a> `bm25` | `string` | - |
| <a id="property-cos"></a> `cos` | `string` | - |
| <a id="property-id-3"></a> `id` | `number` | - |
| <a id="property-kind"></a> `kind` | `string` | - |
| <a id="property-rank"></a> `rank` | `number` | - |
| <a id="property-rrf"></a> `rrf` | `string` | - |
| <a id="property-score-2"></a> `score` | `string` | - |
| <a id="property-text-1"></a> `text` | `string` | - |
| <a id="property-used"></a> `used` | `boolean` | Inside the hits handed to the model. |

***

### TranscribeQueue

A transcribe queue: add files, start and stop, select, edit lines with undo, and export a channel
as txt, srt, vtt or json.

#### Methods

##### add()

```ts
add(files): void;
```

Queue files; starts the run unless `autostart` is off.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | `Iterable`\<`Blob` & `object`\> |

###### Returns

`void`

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### edit()

```ts
edit(
   id, 
   index, 
   patch
): void;
```

Change one line's text or speaker; one undo step.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |
| `index` | `number` |
| `patch` | \{ `speaker?`: `string`; `text?`: `string`; \} |
| `patch.speaker?` | `string` |
| `patch.text?` | `string` |

###### Returns

`void`

##### exportAs()

```ts
exportAs(kind, id?): 
  | {
  name: string;
  text: string;
  type: string;
}
  | null;
```

One channel as a file: its name, text and media type.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | [`ExportKind`](#exportkind) |
| `id?` | `number` |

###### Returns

  \| \{
  `name`: `string`;
  `text`: `string`;
  `type`: `string`;
\}
  \| `null`

##### redo()

```ts
redo(): void;
```

###### Returns

`void`

##### remove()

```ts
remove(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### select()

```ts
select(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### setTranscriber()

```ts
setTranscriber(t): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`Transcriber`](#transcriber) |

###### Returns

`void`

##### snapshot()

```ts
snapshot(): QueueSnapshot;
```

###### Returns

[`QueueSnapshot`](#queuesnapshot)

##### start()

```ts
start(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

##### undo()

```ts
undo(): void;
```

###### Returns

`void`

##### zip()

```ts
zip(o?): 
  | {
  data: Uint8Array;
  manifest: Manifest;
  name: string;
}
  | null;
```

Every finished channel in four formats, with manifest.json first, as one zip; null with none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `date?`: `Date`; `tool?`: `string`; \} |
| `o.date?` | `Date` |
| `o.tool?` | `string` |

###### Returns

  \| \{
  `data`: `Uint8Array`;
  `manifest`: `Manifest`;
  `name`: `string`;
\}
  \| `null`

***

### TranscribeRunOptions

Run settings a transcriber reads: the capture front end (target level, lift, denoise, gate
margin, rumble filter, skip silence, re-level), the channel, the language and the phantom filter.

#### Extends

- `FrontEndOptions`

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-channel"></a> `channel?` | `"auto"` \| `"mix"` \| `"L"` \| `"R"` | auto picks the loudest side when one dominates, else mixes. | - |
| <a id="property-denoise"></a> `denoise?` | `0` \| `1` \| `2` \| `3` | Spectral gate strength 0 to 3. Default 2. | `FrontEndOptions.denoise` |
| <a id="property-halluc"></a> `halluc?` | `boolean` | The phantom text filter. Default on. | - |
| <a id="property-hp"></a> `hp?` | `number` | High pass corner in Hz; 0 turns it off. Default 80. | `FrontEndOptions.hp` |
| <a id="property-language-2"></a> `language?` | `string` | - | - |
| <a id="property-maxgaindb"></a> `maxGainDb?` | `number` | Largest lift in dB. Default 60. | `FrontEndOptions.maxGainDb` |
| <a id="property-perreelagc"></a> `perReelAgc?` | `boolean` | Level each reel again. Default true. | `FrontEndOptions.perReelAgc` |
| <a id="property-skipsilence"></a> `skipSilence?` | `boolean` | Gate the silence out. Default true. | `FrontEndOptions.skipSilence` |
| <a id="property-targetdb"></a> `targetDb?` | `number` | Target speech level, dBFS. Default -20. | `FrontEndOptions.targetDb` |
| <a id="property-vadmargin"></a> `vadMargin?` | `number` | Gate margin over the floor in dB. Default 6. | `FrontEndOptions.vadMargin` |

***

### Turn

One chat turn: role, text, reasoning, time, whether it is done, memory used, stats and a note.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | `number` | - |
| <a id="property-done"></a> `done` | `boolean` | - |
| <a id="property-id-4"></a> `id` | `number` | - |
| <a id="property-mem"></a> `mem?` | [`MemoryUsed`](#memoryused)[] | Memory recalled for this reply. |
| <a id="property-note-1"></a> `note?` | `string` | "stopped", "failed: ...". |
| <a id="property-role"></a> `role` | `"user"` \| `"assistant"` | - |
| <a id="property-stats-2"></a> `stats?` | `string` | "31.2 tok/s, first word 0.64 s, 44 tok (measured)". |
| <a id="property-text-2"></a> `text` | `string` | - |
| <a id="property-think"></a> `think` | `string` | Reasoning, shown in a fold under the reply. |

***

### VoiceRow

Spoken replies: auto speak, the voice, rate and pitch, speak and stop.

#### Methods

##### reply()

```ts
reply(text): void;
```

Speaks `text` when auto speak is on: hand it to a chat thread's onReply.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`void`

##### set()

```ts
set(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | `Partial`\<\{ `auto`: `boolean`; `pitch`: `number`; `rate`: `number`; `voice`: `string`; \}\> |

###### Returns

`void`

##### snapshot()

```ts
snapshot(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `auto` | `boolean` |
| `error` | `string` |
| `pitch` | `number` |
| `rate` | `number` |
| `speaking` | `boolean` |
| `voice` | `string` |
| `voices` | `string`[] |

##### speak()

```ts
speak(text): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`Promise`\<`void`\>

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### subscribe()

```ts
subscribe(fn): () => void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`s`) => `void` |

###### Returns

() => `void`

## Type Aliases

### AskFn

```ts
type AskFn = (image, question?) => Promise<string>;
```

A vision language model as a page calls it: a question about an image (a caption without one), answered in words.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |
| `question?` | `string` |

#### Returns

`Promise`\<`string`\>

***

### DepthFn

```ts
type DepthFn = (image) => Promise<{
  data: Float32Array;
  height: number;
  width: number;
}>;
```

A depth model as a page calls it: 0 to 1 per pixel, larger is nearer (relative inverse depth).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |

#### Returns

`Promise`\<\{
  `data`: `Float32Array`;
  `height`: `number`;
  `width`: `number`;
\}\>

***

### DetectFn

```ts
type DetectFn = (image) => Promise<FrameBox[]>;
```

A detector as a page calls it: boxes in image pixels, best first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |

#### Returns

`Promise`\<[`FrameBox`](#framebox)[]\>

***

### ExportKind

```ts
type ExportKind = "txt" | "srt" | "vtt" | "json";
```

A transcript export format: txt, srt, vtt or json.

***

### ImageJob

```ts
type ImageJob = ImageGenerator & object;
```

An image model with its CLIP tokenizer: `make` generates with the form's defaults filled in.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `tokenize` | `ClipTokenize` |
| `make()` | (`o`) => `Promise`\<`Generated`\> |

***

### Job

```ts
type Job = 
  | "chat"
  | "transcribe"
  | "vision"
  | "detect"
  | "masks"
  | "image"
  | "voice"
  | "depth"
  | "embed"
  | "faceswap"
  | "landmarks";
```

A job a model picker serves, such as chat, transcribe, vision or masks.

***

### Loader

```ts
type Loader = (rec, ctx) => Promise<unknown>;
```

Fetches a model's weights (and may start its runtime). Throws to fail the row.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` |
| `ctx` | [`LoadContext`](#loadcontext) |

#### Returns

`Promise`\<`unknown`\>

***

### RecallLike

```ts
type RecallLike = Pick<Recall, "trace" | "hits" | "query" | "mode">;
```

The parts of a memory recall the inspector shows: trace, hits, query and mode.

***

### Transcriber

```ts
type Transcriber = (file, ctx) => Promise<RunResult>;
```

Turns one file into a transcript. A page wires @hackbuild/transcribe here; a stub needs none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `file` | `Blob` & `object` |
| `ctx` | [`RunContext`](#runcontext) |

#### Returns

`Promise`\<[`RunResult`](#runresult)\>

## Variables

### ALL\_RECORDS

```ts
const ALL_RECORDS: readonly ModelRecord[];
```

Every record the views know, the running package's copy of a duplicate first.

***

### FACE\_API\_BASE

```ts
const FACE_API_BASE: "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/" = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";
```

Base URL of the face-api weights (MIT) on the package CDN.

***

### JOB\_NAMES

```ts
const JOB_NAMES: Job[];
```

Every job name, in the order of `JOBS`.

***

### JOBS

```ts
const JOBS: Readonly<Record<Job, JobDef>>;
```

The words and capability test of every job.

***

### NO\_ENGINE

```ts
const NO_ENGINE: "this needs a model. pick one in the bar and load it." = "this needs a model. pick one in the bar and load it.";
```

What a reply says when no chat engine is set.

***

### RUNTIME\_URLS

```ts
const RUNTIME_URLS: object;
```

Pinned CDN modules jobLoader imports at load time.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| <a id="property-bellows-1"></a> `bellows` | readonly \[`"https://cdn.jsdelivr.net/npm/bellows-voice@0.8.0/engine/+esm"`\] |
| <a id="property-kokoro-1"></a> `kokoro` | readonly \[`"https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"`\] |
| <a id="property-webllm-1"></a> `webllm` | readonly \[`"https://esm.run/@mlc-ai/web-llm@0.2.84"`, `"https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm"`\] |

## Functions

### asImage()

```ts
function asImage(img): unknown;
```

Pixels (\{ width, height, data \}) as a canvas, which every runtime reads; anything else passes through.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `img` | `unknown` |

#### Returns

`unknown`

***

### backendOf()

```ts
function backendOf(r, env?): ModelBackend;
```

Where it runs here: the first rung this machine can take, else the record's first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |
| `env?` | `Env` |

#### Returns

`ModelBackend`

***

### boxWords()

```ts
function boxWords(b): string;
```

"cup 94%", or the label alone, or the score alone.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | [`FrameBox`](#framebox) |

#### Returns

`string`

***

### canClone()

```ts
function canClone(e): e is PocketEngine;
```

True when the engine clones a voice from reference audio.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

#### Returns

`e is PocketEngine`

***

### chatList()

```ts
function chatList(o?): ChatList;
```

Creates a list of chat threads, newest first, with one open; its `thread` always speaks for the
open chat.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`ThreadOptions`](#threadoptions) |

#### Returns

[`ChatList`](#chatlist)

***

### chatThread()

```ts
function chatThread(o?): ChatThread;
```

Creates a chat thread that streams replies from an engine, with optional memory recall per message.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`ThreadOptions`](#threadoptions) |

#### Returns

[`ChatThread`](#chatthread)

***

### contextSegments()

```ts
function contextSegments(s, system?): object[];
```

Tokens the next request carries, by source, for a context meter: about 4 characters a token (inferred).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `s` | [`ThreadSnapshot`](#threadsnapshot) | `undefined` |
| `system?` | `string` | `""` |

#### Returns

`object`[]

***

### defaultPick()

```ts
function defaultPick(
   records, 
   env?, 
   estimate?
): string;
```

The row a picker starts on: the first "start here" record that fits this
machine, else the first that fits and is fast or steady, else the first
that fits, else the first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `records` | readonly `ModelRecord`[] |
| `env?` | `Env` |
| `estimate?` | `StorageEstimate` \| `null` |

#### Returns

`string`

***

### detailOf()

```ts
function detailOf(r): object[];
```

The chevron detail: licence, source, context, quant, runtime, and where the size came from.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |

#### Returns

`object`[]

***

### fitMap()

```ts
function fitMap(
   src, 
   view, 
   fit?
): object;
```

Source to view pixels for object-fit cover (crop) or contain (bars).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `src` | \{ `h`: `number`; `w`: `number`; \} | `undefined` |
| `src.h` | `number` | `undefined` |
| `src.w` | `number` | `undefined` |
| `view` | \{ `h`: `number`; `w`: `number`; \} | `undefined` |
| `view.h` | `number` | `undefined` |
| `view.w` | `number` | `undefined` |
| `fit?` | `"cover"` \| `"contain"` | `"cover"` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `dx` | `number` |
| `dy` | `number` |
| `scale` | `number` |

***

### frameTag()

```ts
function frameTag(r): string;
```

The corner tag: the caller's words, else how many boxes and landmark sets were found.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`FrameResults`](#frameresults) |

#### Returns

`string`

***

### groupOf()

```ts
function groupOf(r, state?): ModelRowGroup;
```

The group a row sits in. A model on this machine leads; else the record's group, else by size.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `r` | `ModelRecord` | `undefined` |
| `state?` | `ModelPickState` | `"none"` |

#### Returns

`ModelRowGroup`

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

### isJob()

```ts
function isJob(s): s is Job;
```

Whether a string is a job name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` \| `null` \| `undefined` |

#### Returns

`s is Job`

***

### isNoDownload()

```ts
function isNoDownload(r): boolean;
```

Whether a record has nothing to download: a built in, system or zero size model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |

#### Returns

`boolean`

***

### isUncensored()

```ts
function isUncensored(r): boolean;
```

Whether a record's censorship is "uncensored" or "abliterated".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |

#### Returns

`boolean`

***

### jobLoader()

```ts
function jobLoader<J>(job, o?): Loader;
```

A real Loader for a job. The runtime and weights load only when a pick
calls it; progress goes to `ctx.onProgress`, `ctx.signal` stops it, and a
failure throws in plain words. Resolves to [JobValues](#jobvalues)[job].

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-j"></a> `J` *extends* [`Job`](#job) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | `J` |
| `o?` | [`JobLoaderOptions`](#jobloaderoptions) |

#### Returns

[`Loader`](#loader)

***

### jobRecords()

```ts
function jobRecords(job, records?): ModelRecord[];
```

The records that do a job, catalogue order kept.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `job` | [`Job`](#job) | `undefined` |
| `records?` | readonly `ModelRecord`[] | `ALL_RECORDS` |

#### Returns

`ModelRecord`[]

***

### labelColour()

```ts
function labelColour(label, palette): string;
```

One colour per label, stable across frames, from a palette.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `label` | `string` \| `undefined` |
| `palette` | readonly `string`[] |

#### Returns

`string`

***

### optionsOf()

```ts
function optionsOf(
   r, 
   values?, 
   extra?
): ModelOption[];
```

The options a chosen row offers: backend when the ladder has gpu and cpu, quant when it has several, context for chat.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `r` | `ModelRecord` | `undefined` |
| `values?` | `Record`\<`string`, `string`\> | `{}` |
| `extra?` | readonly `ModelOption`[] | `[]` |

#### Returns

`ModelOption`[]

***

### ownRecord()

```ts
function ownRecord(
   job, 
   kind, 
   v
): ModelRecord;
```

A record for a "your own" form. Its licence is unknown until the person reads the card.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | [`Job`](#job) |
| `kind` | `OwnKind` |
| `v` | `Record`\<`string`, `string`\> |

#### Returns

`ModelRecord`

***

### personaRack()

```ts
function personaRack(o?): PersonaRack;
```

Creates a persona rack with built in presets and any saved ones; `onSave` keeps the saved ones.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `onSave?`: (`saved`) => `void`; `persona?`: [`Persona`](#persona); `presets?`: readonly [`PersonaPresetX`](#personapresetx)[]; `saved?`: readonly [`PersonaPresetX`](#personapresetx)[]; \} |
| `o.onSave?` | (`saved`) => `void` |
| `o.persona?` | [`Persona`](#persona) |
| `o.presets?` | readonly [`PersonaPresetX`](#personapresetx)[] |
| `o.saved?` | readonly [`PersonaPresetX`](#personapresetx)[] |

#### Returns

[`PersonaRack`](#personarack)

***

### rowOf()

```ts
function rowOf(r, ctx?): ModelRow;
```

One record as one picker row.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |
| `ctx?` | [`RowContext`](#rowcontext) |

#### Returns

`ModelRow`

***

### sizeWords()

```ts
function sizeWords(r): string | undefined;
```

Download words: "1.7 gb". Null for a record with no download or an unknown size.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |

#### Returns

`string` \| `undefined`

***

### speaker()

```ts
function speaker(engine, o?): Speaker;
```

A speaker over the engine `engine()` returns at each line (null: text only, timed by `play`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `engine` | () => `Engine` \| `null` |
| `o?` | [`SpeakerOptions`](#speakeroptions) |

#### Returns

[`Speaker`](#speaker)

***

### storedIds()

```ts
function storedIds(store, records): Promise<string[]>;
```

The ids of records whose files are already in a weight store: the cache
badge of a picker. A record counts when every file key it names is kept,
or, for one its runtime fetches by model id, when any kept url sits under
that id on the hub. Records cached elsewhere (WebLLM's own cache) are not seen.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `store` | `Pick`\<`WeightStore`, `"keys"`\> |
| `records` | readonly `ModelRecord`[] |

#### Returns

`Promise`\<`string`[]\>

***

### toView()

```ts
function toView(
   b, 
   m, 
   viewW, 
   mirror?
): FrameBox;
```

A box in view pixels; mirrored for a selfie view.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `b` | [`FrameBox`](#framebox) | `undefined` |
| `m` | \{ `dx`: `number`; `dy`: `number`; `scale`: `number`; \} | `undefined` |
| `m.dx` | `number` | `undefined` |
| `m.dy` | `number` | `undefined` |
| `m.scale` | `number` | `undefined` |
| `viewW` | `number` | `undefined` |
| `mirror?` | `boolean` | `false` |

#### Returns

[`FrameBox`](#framebox)

***

### traceRows()

```ts
function traceRows(r, maxText?): TraceRow[];
```

The rows of a recall trace as text, marking the hits handed to the model.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `r` | `Pick`\<`Recall`, `"trace"` \| `"hits"`\> | `undefined` |
| `maxText?` | `number` | `80` |

#### Returns

[`TraceRow`](#tracerow)[]

***

### transcribeQueue()

```ts
function transcribeQueue(o): TranscribeQueue;
```

Creates a transcribe queue that runs each file through `run`, one at a time.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `autostart?`: `boolean`; `options?`: () => [`TranscribeRunOptions`](#transcriberunoptions); `run`: [`Transcriber`](#transcriber); \} |
| `o.autostart?` | `boolean` |
| `o.options?` | () => [`TranscribeRunOptions`](#transcriberunoptions) |
| `o.run` | [`Transcriber`](#transcriber) |

#### Returns

[`TranscribeQueue`](#transcribequeue)

***

### useJobsPick()

```ts
function useJobsPick(
   jobs, 
   initialPresets?, 
   shared?
): JobsPick;
```

Creates one picker per job and joins them as a rack with presets and load all.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `jobs` | readonly `object`[] | `undefined` |
| `initialPresets?` | readonly [`PickPreset`](#pickpreset)[] | `[]` |
| `shared?` | [`PickOptions`](#pickoptions) | `{}` |

#### Returns

[`JobsPick`](#jobspick)

***

### useModelPick()

```ts
function useModelPick(job, o?): ModelPick;
```

Creates a model picker for a job, with rows that say whether each model fits this machine.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `job` | [`Job`](#job) |
| `o?` | [`PickOptions`](#pickoptions) |

#### Returns

[`ModelPick`](#modelpick)

***

### verifyRepo()

```ts
function verifyRepo(repo, o?): Promise<RepoCheck>;
```

Checks a hub repo id before it is used as your own model: it exists, it is
public, and it carries onnx files transformers.js can run. One request to
the hub's model api; no weights are fetched.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `repo` | `string` |
| `o?` | \{ `fetch?`: (`input`, `init?`) => `Promise`\<`Response`\>; `host?`: `string`; \} |
| `o.fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> |
| `o.host?` | `string` |

#### Returns

`Promise`\<[`RepoCheck`](#repocheck)\>

***

### voiceRow()

```ts
function voiceRow(engine, o?): VoiceRow;
```

Creates the voice state over a native engine (`webSpeechEngine()` of @hackbuild/speak).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `engine` | `NativeEngine` |
| `o?` | \{ `auto?`: `boolean`; `onChange?`: (`s`) => `void`; `pitch?`: `number`; `rate?`: `number`; `voice?`: `string`; \} |
| `o.auto?` | `boolean` |
| `o.onChange?` | (`s`) => `void` |
| `o.pitch?` | `number` |
| `o.rate?` | `number` |
| `o.voice?` | `string` |

#### Returns

[`VoiceRow`](#voicerow)

***

### weightKeys()

```ts
function weightKeys(rec): string[];
```

The cache keys of a record's files in a weight store, as weightsLoader writes them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` |

#### Returns

`string`[]

***

### weightsLoader()

```ts
function weightsLoader(store): Loader;
```

A loader that fetches a record's weight files through a weight store; records that load through
their runtime throw.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `store` | `WeightStore` |

#### Returns

[`Loader`](#loader)

***

### weightsRemover()

```ts
function weightsRemover(store): (rec) => Promise<void>;
```

Deletes a stored model's files from a weight store: the remove of a picker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `store` | `WeightStore` |

#### Returns

(`rec`) => `Promise`\<`void`\>

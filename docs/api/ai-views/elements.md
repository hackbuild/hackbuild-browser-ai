# elements

## Interfaces

### CameraFeed

A mounted camera feed: start, stop, the video element, whether it is live, and a subscription to
live and error changes.

#### Extends

- `Mounted`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-live"></a> `live` | `readonly` | `boolean` |
| <a id="property-video"></a> `video` | `readonly` | `HTMLVideoElement` |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

###### Inherited from

`Mounted.dispose`

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

***

### CameraFeedOptions

Options for `mountCameraFeed`: frames per second, the frame callback, which camera, and whether
to draw a tile of its own.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-facingmode"></a> `facingMode?` | `"user"` \| `"environment"` | - |
| <a id="property-fps"></a> `fps?` | `number` | Called with the video this many times a second while live. Default 4. |
| <a id="property-onframe"></a> `onFrame?` | (`video`) => `void` \| `Promise`\<`void`\> | - |
| <a id="property-tile"></a> `tile?` | `boolean` | Draw the video in a tile of its own; off when a FrameView shows it. |

***

### ChatPaneOptions

Options for `mountChatPane`: the reply's name and the empty state's words.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-emptyname"></a> `emptyName?` | `string` | The empty state, in Permanent Marker. |
| <a id="property-emptynote"></a> `emptyNote?` | `string` | - |
| <a id="property-name"></a> `name?` | `string` | The reply's name in its head. |

***

### ComposerOptions

Options for `mountComposer`: placeholder and accessible label.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-label"></a> `label?` | `string` |
| <a id="property-placeholder"></a> `placeholder?` | `string` |

***

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

### FoundMask

One object a segment model found: a mask in image pixels (0 or 255), its word and score.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-label-1"></a> `label` | `string` |
| <a id="property-mask"></a> `mask` | `Uint8Array` |
| <a id="property-score"></a> `score` | `number` |

***

### FrameView

A mounted frame view: set the source, the results to draw, mirroring, and paint again.

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

##### paint()

```ts
paint(): void;
```

Draw again, as after a resize or a new video frame.

###### Returns

`void`

##### setMirror()

```ts
setMirror(on): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `on` | `boolean` |

###### Returns

`void`

##### setResults()

```ts
setResults(r): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`FrameResults`](index.md#frameresults) |

###### Returns

`void`

##### setSource()

```ts
setSource(src): Promise<void>;
```

An image url, or a live element (a camera video); null shows the empty tile.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` \| `Source` \| `null` |

###### Returns

`Promise`\<`void`\>

***

### FrameViewOptions

Options for `mountFrameView`: empty words, mirroring and the colours of the drawn boxes.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-empty"></a> `empty?` | `string` | - |
| <a id="property-mirror"></a> `mirror?` | `boolean` | - |
| <a id="property-palette"></a> `palette?` | readonly `string`[] | Ink of the drawn boxes' word strip; default the paper token. |

***

### MaskModels

The segment models a mask studio calls: a click segment for one point and a segment everything.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-everything"></a> `everything?` | (`image`) => `Promise`\<[`FoundMask`](#foundmask)[]\> | Segment everything: every object at once. |
| <a id="property-segment"></a> `segment?` | (`image`, `point`) => `Promise`\<`Uint8Array`\<`ArrayBufferLike`\> \| `null`\> | Click segment: the mask under one point, in image pixels. |

***

### MaskStudio

A mounted mask studio: image, tools, undo, grow and shrink, saved masks, found objects, export,
and a subscription to its state.

#### Extends

- `Mounted`

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-haseverything"></a> `hasEverything` | `boolean` |
| <a id="property-hassegment"></a> `hasSegment` | `boolean` |

#### Methods

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### cutAt()

```ts
cutAt(
   x, 
   y, 
   mode?
): Promise<void>;
```

The click segment model at a point in image pixels, as a press with the point tool.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `number` |
| `y` | `number` |
| `mode?` | `MaskMode` |

###### Returns

`Promise`\<`void`\>

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

###### Inherited from

`Mounted.dispose`

##### everything()

```ts
everything(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### expand()

```ts
expand(px?): void;
```

Grow, shrink or round off the mask, one undo step each.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `px?` | `number` |

###### Returns

`void`

##### exportAs()

```ts
exportAs(kind): Promise<Blob | null>;
```

The mask, matte or cutout as a png Blob.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | `MaskOutput` |

###### Returns

`Promise`\<`Blob` \| `null`\>

##### forget()

```ts
forget(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### invert()

```ts
invert(): void;
```

###### Returns

`void`

##### mask()

```ts
mask(kind?): ImageData | null;
```

The current mask as ImageData (alpha by default), null before an image.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind?` | `MaskOutput` |

###### Returns

`ImageData` \| `null`

##### pick()

```ts
pick(): void;
```

Open the file picker.

###### Returns

`void`

##### redo()

```ts
redo(): void;
```

###### Returns

`void`

##### restore()

```ts
restore(id): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### save()

```ts
save(name?): void;
```

Put the current mask aside; restore puts it back as one undo step.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name?` | `string` |

###### Returns

`void`

##### setImage()

```ts
setImage(src): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` \| `HTMLImageElement` \| `HTMLCanvasElement` \| `ImageBitmap` \| `MaskPixels` |

###### Returns

`Promise`\<`void`\>

##### setMode()

```ts
setMode(m): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | `MaskMode` |

###### Returns

`void`

##### setModels()

```ts
setModels(m): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`MaskModels`](#maskmodels) |

###### Returns

`void`

##### setSize()

```ts
setSize(px): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `px` | `number` |

###### Returns

`void`

##### setTolerance()

```ts
setTolerance(pct): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `pct` | `number` |

###### Returns

`void`

##### setTool()

```ts
setTool(t): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`StudioTool`](#studiotool) |

###### Returns

`void`

##### shrink()

```ts
shrink(px?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `px?` | `number` |

###### Returns

`void`

##### smooth()

```ts
smooth(r?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `r?` | `number` |

###### Returns

`void`

##### state()

```ts
state(): StudioState;
```

###### Returns

[`StudioState`](#studiostate)

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

##### toggleFound()

```ts
toggleFound(index): void;
```

Add or take out one found object.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `index` | `number` |

###### Returns

`void`

##### undo()

```ts
undo(): void;
```

###### Returns

`void`

##### zoom()

```ts
zoom(dir): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `dir` | `-1` \| `0` \| `1` |

###### Returns

`void`

***

### MaskStudioOptions

Options for `mountMaskStudio`: the segment models, empty state words, a sample button and the
export file name.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-models"></a> `models?` | [`MaskModels`](#maskmodels) | - |
| <a id="property-name-1"></a> `name?` | `string` | Name of exported files, without extension. |
| <a id="property-note"></a> `note?` | `string` | - |
| <a id="property-onsample"></a> `onSample?` | () => `void` | - |
| <a id="property-samplelabel"></a> `sampleLabel?` | `string` | - |
| <a id="property-title"></a> `title?` | `string` | - |

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
| `rec` | [`RecallLike`](index.md#recalllike) \| `null` |

###### Returns

`void`

***

### MemoryLike

What a memory pane needs from a store; a `Memory` from @hackbuild/memory fits.

#### Methods

##### add()

```ts
add(text, o?): Promise<unknown>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `o?` | \{ `kind?`: `"note"` \| `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"`; `meta?`: `Record`\<`string`, `unknown`\>; `section?`: `string`; \} |
| `o.kind?` | `"note"` \| `"episode"` \| `"gist"` \| `"lesson"` \| `"fact"` \| `"rule"` \| `"lore"` \| `"doc"` |
| `o.meta?` | `Record`\<`string`, `unknown`\> |
| `o.section?` | `string` |

###### Returns

`Promise`\<`unknown`\>

##### all()

```ts
all(): StoredItem[];
```

###### Returns

`StoredItem`[]

##### edit()

```ts
edit(id, patch): Promise<unknown>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |
| `patch` | `EditPatch` |

###### Returns

`Promise`\<`unknown`\>

##### export()

```ts
export(): ExportData;
```

###### Returns

`ExportData`

##### import()

```ts
import(data, o?): Promise<number>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `ExportData` |
| `o?` | \{ `replace?`: `boolean`; \} |
| `o.replace?` | `boolean` |

###### Returns

`Promise`\<`number`\>

##### recall()

```ts
recall(q, o?): Promise<Recall>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | `string` |
| `o?` | \{ `k?`: `number`; \} |
| `o.k?` | `number` |

###### Returns

`Promise`\<`Recall`\>

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

***

### MemoryPaneHandle

A memory pane over a host: `refresh` after the store changes elsewhere, `used` to mark what the last reply used.

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

##### refresh()

```ts
refresh(): void;
```

###### Returns

`void`

##### used()

```ts
used(labels): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `labels` | readonly `string`[] |

###### Returns

`void`

***

### ModelSelectElement

The `<model-select>` element: set `pick`, `env`, `loader` or `records` on it before or after it
connects.

#### Extends

- `HTMLElement`

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-env"></a> `env` | `Env` \| `undefined` |
| <a id="property-loader"></a> `loader` | [`Loader`](index.md#loader) \| `undefined` |
| <a id="property-pick"></a> `pick` | [`ModelPick`](index.md#modelpick) |
| <a id="property-records"></a> `records` | readonly `ModelRecord`[] \| `undefined` |

***

### ModelSelectOptions

Options for `mountModelSelect`: the one line or the chip variant, and whether to draw the load button.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-go"></a> `go?` | `boolean` | Draw the pink load. Off on a gate, whose own button is the pink action. |
| <a id="property-variant"></a> `variant?` | `"line"` \| `"chip"` | "line" (default): the one line and the pink load. "chip": the one model chip of the bar. |

***

### SourcesDropOptions

Options for a sources drop: what reads the files into memory, and a line per file.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-accept"></a> `accept?` | `string` | - |
| <a id="property-ingest"></a> `ingest` | (`files`, `o`) => `Promise`\<\{ `chunks`: `number`; `files`: `number`; \}\> | @hackbuild/memory `ingest(mem, files, o)` bound to a store. |

***

### StudioState

What a mask studio shows: tool, mode, sizes, undo state, coverage, zoom, found and saved masks,
image size and the last error.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-busy"></a> `busy` | `string` | - |
| <a id="property-canredo"></a> `canRedo` | `boolean` | - |
| <a id="property-canundo"></a> `canUndo` | `boolean` | - |
| <a id="property-coverage"></a> `coverage` | `number` | - |
| <a id="property-error"></a> `error` | `string` | The last failure, in words. |
| <a id="property-found"></a> `found` | ([`FoundMask`](#foundmask) & `object`)[] | - |
| <a id="property-height"></a> `height` | `number` | - |
| <a id="property-mode"></a> `mode` | `MaskMode` | - |
| <a id="property-ready"></a> `ready` | `boolean` | - |
| <a id="property-saved"></a> `saved` | `object`[] | Masks put aside with a name and a small preview, newest first. |
| <a id="property-size"></a> `size` | `number` | - |
| <a id="property-tolerance"></a> `tolerance` | `number` | - |
| <a id="property-tool"></a> `tool` | [`StudioTool`](#studiotool) | - |
| <a id="property-width"></a> `width` | `number` | - |
| <a id="property-zoom"></a> `zoom` | `number` | - |

***

### TranscribeDropHandle

A mounted drop zone whose `pick` opens the file picker.

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

##### pick()

```ts
pick(): void;
```

Open the file picker: the add files verb.

###### Returns

`void`

##### pickFolder()

```ts
pickFolder(): void;
```

Open the folder picker.

###### Returns

`void`

***

### TranscribeDropOptions

Options for `mountTranscribeDrop`: accepted types, empty state words and a sample button, plus
the transcript view options.

#### Extends

- [`TranscriptViewOptions`](#transcriptviewoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-accept-1"></a> `accept?` | `string` | - | - |
| <a id="property-folders"></a> `folders?` | `boolean` | A "choose a folder" button; a dropped folder is read whole either way. | - |
| <a id="property-note-1"></a> `note?` | `string` | - | - |
| <a id="property-onsample-1"></a> `onSample?` | () => `void` | - | - |
| <a id="property-onseek"></a> `onSeek?` | (`seconds`) => `void` | Times as buttons that seek a player. | [`TranscriptViewOptions`](#transcriptviewoptions).[`onSeek`](#property-onseek-1) |
| <a id="property-picklabel"></a> `pickLabel?` | `string` | - | - |
| <a id="property-samplelabel-1"></a> `sampleLabel?` | `string` | A sample a person can try with no file; the page queues it. | - |
| <a id="property-showdropped"></a> `showDropped?` | `boolean` | Show dropped lines in place. | [`TranscriptViewOptions`](#transcriptviewoptions).[`showDropped`](#property-showdropped-1) |
| <a id="property-speakers"></a> `speakers?` | `boolean` | Speaker fields beside each line. Off by default: they are inputs, and a subject keeps few controls. | [`TranscriptViewOptions`](#transcriptviewoptions).[`speakers`](#property-speakers-1) |
| <a id="property-title-1"></a> `title?` | `string` | - | - |

***

### TranscriptViewOptions

Options for a transcript: speaker fields, a seek callback for the times, and whether dropped
lines show in place.

#### Extended by

- [`TranscribeDropOptions`](#transcribedropoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-onseek-1"></a> `onSeek?` | (`seconds`) => `void` | Times as buttons that seek a player. |
| <a id="property-showdropped-1"></a> `showDropped?` | `boolean` | Show dropped lines in place. |
| <a id="property-speakers-1"></a> `speakers?` | `boolean` | Speaker fields beside each line. Off by default: they are inputs, and a subject keeps few controls. |

## Type Aliases

### ElementName

```ts
type ElementName = typeof ELEMENT_NAMES[number];
```

A tag name `define` registers, before any prefix.

***

### StudioTool

```ts
type StudioTool = "point" | MaskTool;
```

A mask studio tool: the click segment point or one of the hackbuild-ui mask tools.

## Variables

### ELEMENT\_NAMES

```ts
const ELEMENT_NAMES: readonly ["model-select", "model-jobs", "chat-pane", "chat-composer", "chat-list", "chat-context", "transcribe-drop", "transcript-view", "transcribe-queue", "transcript-exports", "mask-studio", "mask-tools", "mask-verbs", "mask-rack", "frame-view", "camera-feed", "memory-inspector"];
```

The tag names define() registers, before any prefix.

## Functions

### chipWords()

```ts
function chipWords(s): string;
```

The chip's words: the short name, then the download size, or the state once it moves.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`PickSnapshot`](index.md#picksnapshot) |

#### Returns

`string`

***

### define()

```ts
function define(
   prefix?, 
   registry?, 
   Base?
): string[];
```

Register the elements, bare (`<model-select>`) or under a prefix
(`define("hb")` gives `<hb-model-select>`). Names already defined are
left alone. Returns the tag names.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `prefix?` | `string` | `""` |
| `registry?` | [`DefineTarget`](#definetarget) | `undefined` |
| `Base?` | `Base` | `undefined` |

#### Returns

`string`[]

***

### droppedFiles()

```ts
function droppedFiles(dt): Promise<File[]>;
```

The files of a drop, with dropped folders read through, media only.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dt` | `DataTransfer` \| `null` \| `undefined` |

#### Returns

`Promise`\<`File`[]\>

***

### gateWords()

```ts
function gateWords(row): string;
```

The words of a gate's one pink button for a pick: "load, 1.7 gb", then "ready".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `row` | `ModelRow` \| `undefined` |

#### Returns

`string`

***

### isMedia()

```ts
function isMedia(f): boolean;
```

A file a speech run can read: audio or video by type or by name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | \{ `name`: `string`; `type`: `string`; \} |
| `f.name` | `string` |
| `f.type` | `string` |

#### Returns

`boolean`

***

### isProtected()

```ts
function isProtected(it): boolean;
```

True when an item is kept out of cleanup: decay never drops it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `it` | `StoredItem` |

#### Returns

`boolean`

***

### mountCameraFeed()

```ts
function mountCameraFeed(host, o?): CameraFeed;
```

Opens the camera into a host and hands the video to `onFrame` at the set rate while it is live.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `o?` | [`CameraFeedOptions`](#camerafeedoptions) |

#### Returns

[`CameraFeed`](#camerafeed)

***

### mountChatList()

```ts
function mountChatList(
   host, 
   list, 
   o?
): Mounted;
```

The chat list rail (hackbuild-ui HbConversationList markup): new, open, rename, delete with a second press.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `list` | [`ChatList`](index.md#chatlist) |
| `o?` | \{ `label?`: `string`; \} |
| `o.label?` | `string` |

#### Returns

`Mounted`

***

### mountChatPane()

```ts
function mountChatPane(
   host, 
   thread, 
   o?
): Mounted;
```

The thread over a host, with the empty state inside it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `thread` | [`ChatThread`](index.md#chatthread) |
| `o?` | [`ChatPaneOptions`](#chatpaneoptions) |

#### Returns

`Mounted`

***

### mountComposer()

```ts
function mountComposer(
   host, 
   thread, 
   o?
): Mounted;
```

The composer: Enter sends (Shift Enter adds a line, Escape stops), send is the one pink, stop replaces it while a reply streams.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `thread` | [`ChatThread`](index.md#chatthread) |
| `o?` | [`ComposerOptions`](#composeroptions) |

#### Returns

`Mounted`

***

### mountContextMeter()

```ts
function mountContextMeter(
   host, 
   thread, 
   o?
): Mounted;
```

The context meter (hackbuild-ui `.hb-ctxmeter`): what the next request carries against the model's context.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `thread` | [`ChatThread`](index.md#chatthread) |
| `o?` | \{ `budget?`: `number` \| (() => `number`); `system?`: `string` \| (() => `string`); \} |
| `o.budget?` | `number` \| (() => `number`) |
| `o.system?` | `string` \| (() => `string`) |

#### Returns

`Mounted`

***

### mountExportMenu()

```ts
function mountExportMenu(
   host, 
   queue, 
   o?
): Mounted;
```

ExportMenu: the selected transcript as txt, srt, vtt or json, a copy, and
every finished transcript as one zip with a manifest, plus undo and redo of
edits. Nothing shows until there is text; undo shows once there is a change.
`go` makes the first export the one pink action.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `queue` | [`TranscribeQueue`](index.md#transcribequeue) |
| `o?` | \{ `go?`: `boolean`; `save?`: (`name`, `data`, `type`) => `void`; `tool?`: `string`; \} |
| `o.go?` | `boolean` |
| `o.save?` | (`name`, `data`, `type`) => `void` |
| `o.tool?` | `string` |

#### Returns

`Mounted`

***

### mountFrameView()

```ts
function mountFrameView(host, o?): FrameView;
```

Draws a frame in a camera tile on a host, with boxes, landmarks, a corner tag and a caption over it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `o?` | [`FrameViewOptions`](#frameviewoptions) |

#### Returns

[`FrameView`](#frameview)

***

### mountMaskRack()

```ts
function mountMaskRack(
   host, 
   studio, 
   part, 
   o?
): Mounted;
```

The rack parts: what was found, the mask tools' settings, and the exports once there is a mask.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `studio` | [`MaskStudio`](#maskstudio) |
| `part` | `"found"` \| `"mask"` \| `"saved"` \| `"export"` |
| `o?` | \{ `name?`: `string`; \} |
| `o.name?` | `string` |

#### Returns

`Mounted`

***

### mountMaskStudio()

```ts
function mountMaskStudio(host, o?): MaskStudio;
```

Mounts a mask studio on a host: drop or open an image, then cut masks with the point, wand, brush
and lasso tools or a segment model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `o?` | [`MaskStudioOptions`](#maskstudiooptions) |

#### Returns

[`MaskStudio`](#maskstudio)

***

### mountMaskTools()

```ts
function mountMaskTools(host, studio): Mounted;
```

The tool rail of a studio: point (when a click model is set), wand, brush, lasso, and segment everything (when that model is set).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `studio` | [`MaskStudio`](#maskstudio) |

#### Returns

`Mounted`

***

### mountMaskVerbs()

```ts
function mountMaskVerbs(host, studio): Mounted;
```

The verb row on the canvas: undo and redo once there is a change, zoom once there is an image.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `studio` | [`MaskStudio`](#maskstudio) |

#### Returns

`Mounted`

***

### mountMemoryInspector()

```ts
function mountMemoryInspector(host, rec?): MemoryInspector;
```

Shows a recall trace as a table on a host.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `host` | `HTMLElement` | `undefined` |
| `rec?` | [`RecallLike`](index.md#recalllike) \| `null` | `null` |

#### Returns

[`MemoryInspector`](#memoryinspector)

***

### mountMemoryPane()

```ts
function mountMemoryPane(
   host, 
   mem, 
   o?
): MemoryPaneHandle;
```

The memory pane: counts, search, a source filter, add a note, the list with protect and forget, export, import, erase.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `mem` | [`MemoryLike`](#memorylike) |
| `o?` | \{ `name?`: `string`; `onChange?`: () => `void`; \} |
| `o.name?` | `string` |
| `o.onChange?` | () => `void` |

#### Returns

[`MemoryPaneHandle`](#memorypanehandle)

***

### mountModelJobs()

```ts
function mountModelJobs(
   host, 
   jobs, 
   o?
): Mounted;
```

Several jobs: one line per job, presets with totals, and one pink "load all, \<total\>".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `jobs` | [`JobsPick`](index.md#jobspick) |
| `o?` | \{ `go?`: `boolean`; \} |
| `o.go?` | `boolean` |

#### Returns

`Mounted`

***

### mountModelSelect()

```ts
function mountModelSelect(
   host, 
   pick, 
   o?
): Mounted;
```

The closed picker over a host; pressing it opens the sheet.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `pick` | [`ModelPick`](index.md#modelpick) |
| `o?` | [`ModelSelectOptions`](#modelselectoptions) |

#### Returns

`Mounted`

***

### mountPersonaRack()

```ts
function mountPersonaRack(host, rack): Mounted;
```

The persona rack: presets one press away, name, the three parts with their cost, the template, save, and the persona as a file.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `rack` | [`PersonaRack`](index.md#personarack) |

#### Returns

`Mounted`

***

### mountSessionMenu()

```ts
function mountSessionMenu(
   host, 
   list, 
   o?
): Mounted;
```

The session menu of a chat list: clear the open chat, export it as markdown, every chat as json, and import.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `list` | [`ChatList`](index.md#chatlist) |
| `o?` | \{ `onImport?`: (`n`) => `void`; \} |
| `o.onImport?` | (`n`) => `void` |

#### Returns

`Mounted`

***

### mountSourcesDrop()

```ts
function mountSourcesDrop(host, o): Mounted;
```

A drop zone for sources: files or a whole folder of text, pdf, docx, zip and mail go into memory; a line per file says what came in.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `o` | [`SourcesDropOptions`](#sourcesdropoptions) |

#### Returns

`Mounted`

***

### mountTranscribeDrop()

```ts
function mountTranscribeDrop(
   host, 
   queue, 
   o?
): TranscribeDropHandle;
```

The drop zone that becomes the transcript.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `queue` | [`TranscribeQueue`](index.md#transcribequeue) |
| `o?` | [`TranscribeDropOptions`](#transcribedropoptions) |

#### Returns

[`TranscribeDropHandle`](#transcribedrophandle)

***

### mountTranscribeQueue()

```ts
function mountTranscribeQueue(host, queue): Mounted;
```

The queue as hackbuild-ui strips: name, state, figures, progress, remove; run and stop.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `queue` | [`TranscribeQueue`](index.md#transcribequeue) |

#### Returns

`Mounted`

***

### mountTranscriptExports()

```ts
function mountTranscriptExports(
   host, 
   queue, 
   o?
): Mounted;
```

`go` makes the first export the one pink action: the next thing to do once there is text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `queue` | [`TranscribeQueue`](index.md#transcribequeue) |
| `o?` | \{ `go?`: `boolean`; `save?`: (`name`, `text`, `type`) => `void`; \} |
| `o.go?` | `boolean` |
| `o.save?` | (`name`, `text`, `type`) => `void` |

#### Returns

`Mounted`

***

### mountTranscriptView()

```ts
function mountTranscriptView(
   host, 
   queue, 
   o?
): Mounted;
```

The selected channel's transcript over a host.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `queue` | [`TranscribeQueue`](index.md#transcribequeue) |
| `o?` | [`TranscriptViewOptions`](#transcriptviewoptions) |

#### Returns

`Mounted`

***

### mountVoiceRow()

```ts
function mountVoiceRow(
   host, 
   row, 
   o?
): Mounted;
```

The voice row: auto speak, voice, rate, pitch, test and stop.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `host` | `HTMLElement` |
| `row` | [`VoiceRow`](index.md#voicerow) |
| `o?` | \{ `test?`: `string`; \} |
| `o.test?` | `string` |

#### Returns

`Mounted`

***

### pickSheet()

```ts
function pickSheet(pick): Mounted & object;
```

The sheet of one pick, in a drawer on the body. Opens on `open()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pick` | [`ModelPick`](index.md#modelpick) |

#### Returns

`Mounted` & `object`

***

### protect()

```ts
function protect(
   mem, 
   it, 
   on
): Promise<void>;
```

Protect an item from cleanup (it becomes lore, which never decays) or give it back its kind.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mem` | `Pick`\<[`MemoryLike`](#memorylike), `"edit"`\> |
| `it` | `StoredItem` |
| `on` | `boolean` |

#### Returns

`Promise`\<`void`\>

***

### shortName()

```ts
function shortName(name): string;
```

A model name cut for the bar chip: filler words (instruct, chat, quant tags)
go, and a name of more than three words keeps its first two and its last,
which is usually the size: "hermes 3 llama 3.2 3b" reads "hermes 3 3b".
A note in brackets goes first: "slimsam 77 uniform (point prompts)" reads "slimsam 77".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`

***

### transcriptHtml()

```ts
function transcriptHtml(c, o?): string;
```

The HTML of one channel's transcript, or an empty note when there is none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Channel`](index.md#channel) \| `undefined` |
| `o?` | [`TranscriptViewOptions`](#transcriptviewoptions) |

#### Returns

`string`

***

### turnHtml()

```ts
function turnHtml(t, o): string;
```

The HTML of one chat turn, with its reasoning fold, memory used and stats.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`Turn`](index.md#turn) |
| `o` | \{ `busy`: `boolean`; `last`: `boolean`; `name`: `string`; \} |
| `o.busy` | `boolean` |
| `o.last` | `boolean` |
| `o.name` | `string` |

#### Returns

`string`

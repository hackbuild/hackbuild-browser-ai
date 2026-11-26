# @hackbuild/vision

## Classes

### EmbeddingCache

Least recently used embeddings by image. A key is a string the caller
picks (an image hash) or the image object itself. Encodes in flight are
shared, so a hover and a click on a fresh image encode once.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-e"></a> `E` | `unknown` |

#### Constructors

##### Constructor

```ts
new EmbeddingCache<E>(max?): EmbeddingCache<E>;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `max?` | `number` | `4` |

###### Returns

[`EmbeddingCache`](#embeddingcache)\<`E`\>

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-hits"></a> `hits` | `public` | `number` | `0` |
| <a id="property-max"></a> `max` | `readonly` | `number` | `4` |
| <a id="property-misses"></a> `misses` | `public` | `number` | `0` |

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### delete()

```ts
delete(key): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `unknown` |

###### Returns

`boolean`

##### getOr()

```ts
getOr(key, make): Promise<E>;
```

The embedding for `key`, encoding it with `make` on a miss. A failed encode is not kept.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `unknown` |
| `make` | () => `Promise`\<`E`\> |

###### Returns

`Promise`\<`E`\>

##### has()

```ts
has(key): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `unknown` |

###### Returns

`boolean`

##### peek()

```ts
peek(key): Promise<E> | undefined;
```

The cached embedding, or undefined; counts nothing.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `unknown` |

###### Returns

`Promise`\<`E`\> \| `undefined`

##### set()

```ts
set(key, v): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `unknown` |
| `v` | `E` \| `Promise`\<`E`\> |

###### Returns

`void`

***

### ResultCache

A small LRU of results by key, so a depth map is computed once per image.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Constructors

##### Constructor

```ts
new ResultCache<T>(max?): ResultCache<T>;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `max?` | `number` | `16` |

###### Returns

[`ResultCache`](#resultcache)\<`T`\>

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### get()

```ts
get(key): T | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`T` \| `undefined`

##### getOr()

```ts
getOr(key, make): Promise<T>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `make` | () => `Promise`\<`T`\> |

###### Returns

`Promise`\<`T`\>

##### set()

```ts
set(key, v): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `v` | `T` |

###### Returns

`void`

***

### SeenNotes

The seen note for a turn: null when nothing changed since the last note,
so a chat about anything else is not padded with the same observation.
A caption from an on demand look is always included.

#### Constructors

##### Constructor

```ts
new SeenNotes(): SeenNotes;
```

###### Returns

[`SeenNotes`](#seennotes)

#### Methods

##### next()

```ts
next(p, caption?): string | null;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`Perception`](#perception-1) |
| `caption?` | `string` \| `null` |

###### Returns

`string` \| `null`

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

***

### SignalTracker

Turns raw face and hand frames into steady signals and discrete events, smoothed or held so one noisy frame never fires a reaction.

#### Constructors

##### Constructor

```ts
new SignalTracker(): SignalTracker;
```

###### Returns

[`SignalTracker`](#signaltracker)

#### Accessors

##### perception

###### Get Signature

```ts
get perception(): Perception;
```

###### Returns

[`Perception`](#perception-1)

#### Methods

##### feed()

```ts
feed(raw, now): PerceptionEvent[];
```

Feed one frame; returns the events it fired, usually none.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | [`RawFrame`](#rawframe) |
| `now` | `number` |

###### Returns

[`PerceptionEvent`](#perceptionevent)[]

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

## Interfaces

### Box

A rectangle in image pixels: left, top, width and height.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-h"></a> `h` | `number` |
| <a id="property-w"></a> `w` | `number` |
| <a id="property-x"></a> `x` | `number` |
| <a id="property-y"></a> `y` | `number` |

***

### CallOptions

Options for each vision call: a record id, a size class or MB cap to route to a smaller model, an abort signal and the hub's scheduling.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxmb"></a> `maxMB?` | `number` | - |
| <a id="property-model"></a> `model?` | `string` | A record id instead of routing by capability. |
| <a id="property-schedule"></a> `schedule?` | `RunOptions` | Scheduling around rendering: minimum interval, idle only, frame time budget, wait or skip (see the models hub). |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |
| <a id="property-size"></a> `size?` | `SizeClass` | Route to a smaller model: a size class, or a download cap in MB. |

***

### DepthMap

A depth map: width, height, 0 to 1 per pixel with larger nearer, and the raw output range.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-data"></a> `data` | `Float32Array` | 0 to 1 per pixel, larger is nearer (Depth Anything is relative inverse depth). |
| <a id="property-height"></a> `height` | `number` | - |
| <a id="property-range"></a> `range` | \[`min`: `number`, `max`: `number`\] | The raw model output range before normalizing, for stable scale across frames. |
| <a id="property-width"></a> `width` | `number` | - |

***

### DepthModel

A loaded depth model: `estimate` returns a [DepthMap](#depthmap) for an image.

#### Methods

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

##### estimate()

```ts
estimate(image): Promise<DepthMap>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |

###### Returns

`Promise`\<[`DepthMap`](#depthmap)\>

***

### DepthWorker

A depth model in a worker: the worker rung that started, the device, `estimate` and `dispose`.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-device"></a> `device` | `readonly` | `"webgpu"` \| `"wasm"` | - |
| <a id="property-rung"></a> `rung` | `readonly` | `WorkerRung` | The worker rung that started (module-blob, classic-blob or inline). |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### estimate()

```ts
estimate(image): Promise<DepthMap>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | [`WorkerPixels`](#workerpixels) |

###### Returns

`Promise`\<[`DepthMap`](#depthmap)\>

***

### DepthWorkerOptions

Options for [depthWorker](#depthworker-1): the transformers.js URLs, the depth model or record, the licence callback, device, dtype and worker rungs.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-device-1"></a> `device?` | `"webgpu"` \| `"wasm"` | Default "webgpu". |
| <a id="property-dtype"></a> `dtype?` | `string` | Default "fp16" on webgpu, "q8" on wasm. |
| <a id="property-modelid"></a> `modelId?` | `string` | Default onnx-community/depth-anything-v2-small. Only models of the registered depth records load, at their pinned commit, since Depth Anything base and large carry CC-BY-NC-4.0 weights; pass `record` for another model with its licence named. |
| <a id="property-onlicence"></a> `onLicence?` | (`line`) => `void` | Called once with the weight licence line before the model loads. Default console.info. |
| <a id="property-record"></a> `record?` | `ModelRecord` | A depth record of your own: its modelId, revision and licence are used instead of the built in list. |
| <a id="property-spawn"></a> `spawn?` | `Pick`\<`SpawnOptions`, `"prefer"` \| `"Worker"` \| `"createObjectURL"` \| `"readyMs"` \| `"prelude"`\> | Worker rungs; module blob first by default. |
| <a id="property-urls"></a> `urls` | readonly `string`[] | transformers.js ESM URLs tried in order (transformersUrls() from @hackbuild/devices). |

***

### Detection

One detected object: its label, score and box.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-box"></a> `box` | [`Box`](#box) | Pixels of the input image. |
| <a id="property-label"></a> `label` | `string` | - |
| <a id="property-score"></a> `score` | `number` | - |

***

### Detector

A loaded detector: `detect` returns the objects in an image.

#### Methods

##### detect()

```ts
detect(image, opts?): Promise<Detection[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |
| `opts?` | \{ `maxResults?`: `number`; `scoreThreshold?`: `number`; `timestamp?`: `number`; \} |
| `opts.maxResults?` | `number` |
| `opts.scoreThreshold?` | `number` |
| `opts.timestamp?` | `number` |

###### Returns

`Promise`\<[`Detection`](#detection)[]\>

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

***

### FaceApi

The parts of face-api.js the provider touches. Tests pass a fake.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-nets"></a> `nets` | `object` |
| `nets.faceLandmark68TinyNet` | `object` |
| `nets.faceLandmark68TinyNet.loadFromUri` | (`u`) => `Promise`\<`void`\> |
| `nets.tinyFaceDetector` | `object` |
| `nets.tinyFaceDetector.loadFromUri` | (`u`) => `Promise`\<`void`\> |
| <a id="property-tinyfacedetectoroptions"></a> `TinyFaceDetectorOptions` | new (`o?`) => `unknown` |

#### Methods

##### detectAllFaces()

```ts
detectAllFaces(img, o): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `img` | `unknown` |
| `o` | `unknown` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `withFaceLandmarks()` | (`tiny`) => `Promise`\<`object`[]\> |

***

### Landmarker

A loaded landmark model: `detect` returns [Landmarks](#landmarks) for an image.

#### Methods

##### detect()

```ts
detect(image, opts?): Promise<Landmarks>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |
| `opts?` | \{ `timestamp?`: `number`; \} |
| `opts.timestamp?` | `number` |

###### Returns

`Promise`\<[`Landmarks`](#landmarks)\>

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

***

### Landmarks

Landmarks for each face, hand or body, with blendshapes, handedness and gestures where the model gives them, and the record that answered.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-blendshapes"></a> `blendshapes?` | `Record`\<`string`, `number`\>[] | Face blendshapes by name, per face. |
| <a id="property-gestures"></a> `gestures?` | ( \| \{ `name`: `string`; `score`: `number`; \} \| `null`)[] | Top canned gesture per hand ("Open_Palm", "Thumb_Up" and so on), null for "None". |
| <a id="property-handedness"></a> `handedness?` | `string`[] | Hand labels, per hand. |
| <a id="property-points"></a> `points` | \[`number`, `number`, `number`\][][] | One list per face, hand or body; x and y normalized 0 to 1, z relative. |
| <a id="property-source"></a> `source` | `string` | Which record produced this, for status lines after a fallback. |

***

### Letterbox

How an image was fitted into the square input: scale, left and top padding, and the square side.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-padx"></a> `padX` | `number` |
| <a id="property-pady"></a> `padY` | `number` |
| <a id="property-scale"></a> `scale` | `number` |
| <a id="property-size-1"></a> `size` | `number` |

***

### Loop

A running loop: `stop`, whether it runs or is busy, the last step's latency and the step count.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-busy"></a> `busy` | `readonly` | `boolean` |
| <a id="property-lastlatencyms"></a> `lastLatencyMs` | `readonly` | `number` |
| <a id="property-running"></a> `running` | `readonly` | `boolean` |
| <a id="property-steps"></a> `steps` | `readonly` | `number` |

#### Methods

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

***

### LoopOptions

A perception loop beside a render loop: one step at a time (a busy
guard), each step started no sooner than `interval(lastLatency)`
after the previous one began (an adaptive cadence or a fixed
period), stopped by `stop()` or an abort signal. The scheduler is
injectable so tests run without timers.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-interval"></a> `interval?` | (`lastLatencyMs`) => `number` | ms between step starts given the last latency. Default a fixed 0 (every frame). |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onbusy"></a> `onBusy?` | () => `void` | Called on each frame that found the previous step still running. |
| <a id="property-onerror"></a> `onError?` | (`e`) => `void` | - |
| <a id="property-onresult"></a> `onResult?` | (`r`, `latencyMs`) => `void` | - |
| <a id="property-schedule-1"></a> `schedule?` | (`fn`) => `void` | Frame scheduler; default requestAnimationFrame, else setTimeout 16 ms. |
| <a id="property-signal-1"></a> `signal?` | `AbortSignal` | - |
| <a id="property-step"></a> `step` | (`tick`) => `Promise`\<`T`\> | - |

***

### Mask

A mask the size of its image: 0 or 255 per pixel, or a confidence 0 to 255, with an optional score.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-data-1"></a> `data` | `Uint8Array` | 0 or 255 per pixel, or a confidence 0 to 255. |
| <a id="property-height-1"></a> `height` | `number` | - |
| <a id="property-score-1"></a> `score?` | `number` | - |
| <a id="property-width-1"></a> `width` | `number` | - |

***

### MaskRle

COCO style uncompressed run length: column major, the first run counts outside pixels.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-counts"></a> `counts` | `number`[] |
| <a id="property-size-2"></a> `size` | \[`height`: `number`, `width`: `number`\] |

***

### MediapipeProviderOptions

Options for [mediapipeProvider](#mediapipeprovider): the runtime loader, the wasm fileset directory, and a weight store to read model files through.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-runtime"></a> `runtime` | () => `Promise`\<[`TasksVision`](#tasksvision)\> | - |
| <a id="property-store"></a> `store?` | `WeightStore` | Read model files through the weight store (resume, sha-256, licence line) and pass them as buffers. |
| <a id="property-wasmbase"></a> `wasmBase?` | `string` | - |

***

### Perception

Steady signals for one moment: present, where the face is, facing, smile, surprise and frown strengths, and the held gesture.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-face"></a> `face` | \| \{ `x`: `number`; `y`: `number`; \} \| `null` | The face in the viewer's frame, -1 to 1 on both axes: +x the character's left (the person's right), +y up. Null when no face is seen. |
| <a id="property-facing"></a> `facing` | `boolean` | Facing the screen rather than turned away. |
| <a id="property-frown"></a> `frown` | `number` | - |
| <a id="property-gesture"></a> `gesture` | [`HandGesture`](#handgesture) \| `null` | - |
| <a id="property-present"></a> `present` | `boolean` | - |
| <a id="property-smile"></a> `smile` | `number` | Expression strengths, 0 to 1, smoothed. |
| <a id="property-surprise"></a> `surprise` | `number` | - |

***

### Pixels

RGBA pixels, as ImageData has them.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-2"></a> `data` | \| `Uint8ClampedArray`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> |
| <a id="property-height-2"></a> `height` | `number` |
| <a id="property-width-2"></a> `width` | `number` |

***

### PromptSegmenterOptions

The parts of a prompted segmenter: an image encoder run once per image, a prompt decoder, and the embedding cache.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-e-1"></a> `E` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cache"></a> `cache?` | [`EmbeddingCache`](#embeddingcache)\<`E`\> | Shared cache; a fresh one holding 4 images when omitted. |

#### Methods

##### decode()

```ts
decode(
   embedding, 
   prompt, 
   image
): Promise<Mask[]>;
```

The prompt decoder: runs per prompt against the cached embedding.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `embedding` | `E` |
| `prompt` | [`SegmentPrompt`](#segmentprompt) |
| `image` | `unknown` |

###### Returns

`Promise`\<[`Mask`](#mask)[]\>

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

##### encode()

```ts
encode(image): Promise<E>;
```

The image encoder: runs once per image.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |

###### Returns

`Promise`\<`E`\>

***

### RawFace

One face reading before smoothing. Image coordinates are 0 to 1 in the raw (unmirrored) camera frame.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-frown-1"></a> `frown` | `number` | - |
| <a id="property-pitch"></a> `pitch` | `number` | - |
| <a id="property-smile-1"></a> `smile` | `number` | - |
| <a id="property-surprise-1"></a> `surprise` | `number` | - |
| <a id="property-x-1"></a> `x` | `number` | - |
| <a id="property-y-1"></a> `y` | `number` | - |
| <a id="property-yaw"></a> `yaw` | `number` | Head turn and tilt as the nose offset from the face centre, in face widths and heights; near zero when facing the camera. |

***

### RawFrame

One frame's readings for [SignalTracker](#signaltracker): the face, and the hands when they were checked.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-face-1"></a> `face` | [`RawFace`](#rawface) \| `null` | - |
| <a id="property-hands"></a> `hands` | [`RawHand`](#rawhand)[] \| `null` | Null on frames where hands were not checked. |

***

### RawHand

One hand reading before smoothing: wrist position, the recognizer's canned label and its score.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-gesture-1"></a> `gesture` | `string` \| `null` | The recognizer's canned label (Open_Palm, Thumb_Up, ...), if any. |
| <a id="property-score-2"></a> `score` | `number` | - |
| <a id="property-x-2"></a> `x` | `number` | Wrist position. |
| <a id="property-y-2"></a> `y` | `number` | - |

***

### Reaction

One reaction to a perception event: a mood or a gesture by common name, after a delay, with a chance.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-chance"></a> `chance?` | `number` |
| <a id="property-delayms"></a> `delayMs?` | `number` |
| <a id="property-gesture-2"></a> `gesture?` | [`HandGesture`](#handgesture) |
| <a id="property-kind"></a> `kind` | `"gesture"` \| `"mood"` |
| <a id="property-name"></a> `name` | `string` |
| <a id="property-on"></a> `on` | `"gesture"` \| `"arrived"` \| `"left"` \| `"smiled"` |

***

### ReadbackOptions

Options for [readbackLoop](#readbackloop): the async read, the frame consumer, a rate cap (10 Hz), and an abort signal.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxhz"></a> `maxHz?` | `number` | Rate cap. Default 10 Hz. |
| <a id="property-now-1"></a> `now?` | () => `number` | - |
| <a id="property-onerror-1"></a> `onError?` | (`e`) => `void` | - |
| <a id="property-onframe"></a> `onFrame` | (`frame`) => `void` \| `Promise`\<`void`\> | Consumer of each frame; a slow consumer holds the loop (it runs inside the busy window). |
| <a id="property-read"></a> `read` | () => `Promise`\<`T`\> | An async readback, e.g. three.js readRenderTargetPixelsAsync or a canvas createImageBitmap. |
| <a id="property-schedule-2"></a> `schedule?` | (`fn`) => `void` | - |
| <a id="property-signal-2"></a> `signal?` | `AbortSignal` | - |

***

### Segmenter

A loaded segmenter: `segment` returns masks for an image and prompt, best first.

#### Methods

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

##### segment()

```ts
segment(
   image, 
   prompt?, 
   o?
): Promise<Mask[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |
| `prompt?` | [`SegmentPrompt`](#segmentprompt) |
| `o?` | [`SegmentOptions`](#segmentoptions) |

###### Returns

`Promise`\<[`Mask`](#mask)[]\>

***

### SegmentOptions

How a segmenter keeps image embeddings: a stable key for the image and the cache to keep them in.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cache-1"></a> `cache?` | [`EmbeddingCache`](#embeddingcache)\<`unknown`\> | The caller's embedding cache; the segmenter's own when omitted. |
| <a id="property-key"></a> `key?` | `string` | A stable key for the image, such as a hash; the image object itself when omitted. |

***

### SegmentPrompt

What to cut out: points (object or background) and a box, in image pixels.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-box-1"></a> `box?` | [`Box`](#box) | A box around the object, image pixels. |
| <a id="property-points-1"></a> `points?` | `object`[] | Points in image pixels; label 1 for object, 0 for background (a negative point). |

***

### TasksVision

The parts of @mediapipe/tasks-vision the provider touches. Tests pass a fake.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-facelandmarker"></a> `FaceLandmarker?` | `TaskClass` |
| <a id="property-filesetresolver"></a> `FilesetResolver` | `object` |
| `FilesetResolver.forVisionTasks` | (`base`) => `Promise`\<`unknown`\> |
| <a id="property-gesturerecognizer"></a> `GestureRecognizer?` | `TaskClass` |
| <a id="property-handlandmarker"></a> `HandLandmarker?` | `TaskClass` |
| <a id="property-imagesegmenter"></a> `ImageSegmenter?` | `TaskClass` |
| <a id="property-objectdetector"></a> `ObjectDetector?` | `TaskClass` |
| <a id="property-poselandmarker"></a> `PoseLandmarker?` | `TaskClass` |

***

### Vlm

A loaded vision language model: `ask` answers a question about an image, or captions it.

#### Methods

##### ask()

```ts
ask(
   image, 
   question?, 
   opts?
): Promise<string>;
```

Answer a question about an image; caption when the question is omitted.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | `unknown` |
| `question?` | `string` |
| `opts?` | \{ `maxTokens?`: `number`; `signal?`: `AbortSignal`; \} |
| `opts.maxTokens?` | `number` |
| `opts.signal?` | `AbortSignal` |

###### Returns

`Promise`\<`string`\>

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

***

### WorkerPixels

RGBA pixels the page sends to the depth worker: ImageData, or anything with width, height and data.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-3"></a> `data` | \| `Uint8ClampedArray`\<`ArrayBufferLike`\> \| `Uint8Array`\<`ArrayBufferLike`\> |
| <a id="property-height-3"></a> `height` | `number` |
| <a id="property-width-3"></a> `width` | `number` |

## Type Aliases

### HandGesture

```ts
type HandGesture = 
  | "wave"
  | "thumbs_up"
  | "thumbs_down"
  | "open_palm"
  | "victory"
  | "pointing_up"
  | "fist"
  | "love";
```

The hand gestures the tracker reports: a wave from wrist motion, and the canned recognizer gestures by name.

***

### ImageInput

```ts
type ImageInput = unknown;
```

Anything the runtimes accept: an image, canvas, video frame, bitmap, URL or data URL.

***

### LandmarkKind

```ts
type LandmarkKind = "face" | "hand" | "pose" | "gesture";
```

"gesture" is hand landmarks plus a canned gesture label per hand (MediaPipe gesture recognizer).

***

### PerceptionEvent

```ts
type PerceptionEvent = 
  | {
  type: "arrived";
}
  | {
  type: "left";
}
  | {
  type: "smiled";
}
  | {
  gesture: HandGesture;
  type: "gesture";
};
```

A discrete perception event: someone arrived, left, smiled, or made a gesture.

## Variables

### CANNED\_GESTURES

```ts
const CANNED_GESTURES: Readonly<Record<string, HandGesture>>;
```

Canned recognizer labels to gesture names.

***

### COCO\_LABELS

```ts
const COCO_LABELS: string[];
```

The 80 COCO class names, in YOLO class index order.

***

### DEFAULT\_REACTIONS

```ts
const DEFAULT_REACTIONS: readonly Reaction[];
```

Default reactions (vendor): greet on arrival, smile back after 600 ms at 0.7 chance, answer waves and a few gestures.

***

### DEPTH\_WORKER\_SOURCE

```ts
const DEPTH_WORKER_SOURCE: "\nlet pipe = null;\nlet RawImage = null;\nconst norm = (out) => {\n  const pd = out.predicted_depth;\n  if (pd && pd.data && pd.dims && pd.dims.length >= 2) {\n    const h = pd.dims[pd.dims.length - 2], w = pd.dims[pd.dims.length - 1];\n    let mn = Infinity, mx = -Infinity;\n    for (let i = 0; i < w * h; i++) { const v = pd.data[i]; if (v < mn) mn = v; if (v > mx) mx = v; }\n    const inv = mx > mn ? 1 / (mx - mn) : 0;\n    const data = new Float32Array(w * h);\n    for (let i = 0; i < w * h; i++) data[i] = (pd.data[i] - mn) * inv;\n    return { width: w, height: h, data, range: [mn, mx] };\n  }\n  const d = out.depth;\n  if (!d) throw new Error(\"depth pipeline returned neither predicted_depth nor depth\");\n  const ch = d.channels || 1;\n  const data = new Float32Array(d.width * d.height);\n  for (let i = 0; i < data.length; i++) data[i] = d.data[i * ch] / 255;\n  return { width: d.width, height: d.height, data, range: [0, 255] };\n};\nself.onmessage = async (ev) => {\n  const m = ev.data;\n  if (!m || typeof m !== \"object\" || !(\"op\" in m)) return;\n  try {\n    if (m.op === \"load\") {\n      let tjs = null, err = null;\n      const load = self.__import || ((u) => import(u));\n      for (const u of m.urls) { try { tjs = await load(u); break; } catch (e) { err = e; } }\n      if (!tjs) throw err || new Error(\"no transformers.js url loaded\");\n      RawImage = tjs.RawImage;\n      pipe = await tjs.pipeline(\"depth-estimation\", m.modelId, { device: m.device, dtype: m.dtype, revision: m.revision });\n      self.postMessage({ id: m.id, ok: true });\n    } else if (m.op === \"run\") {\n      if (!pipe) throw new Error(\"depth worker is not loaded\");\n      const img = new RawImage(new Uint8ClampedArray(m.data), m.width, m.height, 4);\n      const d = norm(await pipe(img));\n      self.postMessage({ id: m.id, ok: true, depth: d }, [d.data.buffer]);\n    }\n  } catch (e) {\n    self.postMessage({ id: m.id, ok: false, error: String((e && e.message) || e) });\n  }\n};\n";
```

The worker's source. It imports transformers.js at load and answers run messages.

***

### LOOK\_PATTERN

```ts
const LOOK_PATTERN: RegExp;
```

Questions that call for an on demand look rather than the steady signals. Replace it to suit a persona.

***

### MP\_MODELS

```ts
const MP_MODELS: "https://storage.googleapis.com/mediapipe-models/" = "https://storage.googleapis.com/mediapipe-models/";
```

The MediaPipe model storage base URL the MediaPipe records load from.

***

### PICKER\_RECORDS

```ts
const PICKER_RECORDS: ModelRecord[];
```

Records listed for pickers and never registered by default: larger alternates, and records under licences that limit use (YOLOv10, FastSAM, the face swap set).

***

### TASKS\_VISION

```ts
const TASKS_VISION: "1.2.3" = "1.2.3";
```

The pinned @mediapipe/tasks-vision version, 1.2.3.

***

### VISION\_RECORDS

```ts
const VISION_RECORDS: ModelRecord[];
```

The vision records registered by `attachVision`: Depth Anything V2 small, MediaPipe detection, segmentation and landmarks, SlimSAM, SmolVLM 256M and LFM2-VL 450M.

## Functions

### ask()

```ts
function ask(
   hub, 
   image, 
   question, 
   o?
): Promise<string>;
```

Answer a question about an image with the routed vision language model. VLM calls are serialized on one chain.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `image` | `unknown` |
| `question` | `string` |
| `o?` | [`CallOptions`](#calloptions) & `object` |

#### Returns

`Promise`\<`string`\>

***

### attachVision()

```ts
function attachVision(hub, tjs?): void;
```

Add the vision records and register the transformers.js loaders. MediaPipe and ort factories are provided by the app.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `tjs?` | `TjsProvider` |

#### Returns

`void`

***

### caption()

```ts
function caption(
   hub, 
   image, 
   o?
): Promise<string>;
```

Caption an image. VLM calls are serialized on one chain.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `image` | `unknown` |
| `o?` | [`CallOptions`](#calloptions) & `object` |

#### Returns

`Promise`\<`string`\>

***

### centreDetector()

```ts
function centreDetector(label?): Detector;
```

A stub detector with no weights: one centred box with the given label.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `label?` | `string` | `"person"` |

#### Returns

[`Detector`](#detector)

***

### cutoutPng()

```ts
function cutoutPng(
   image, 
   m, 
   o?
): Promise<Uint8Array<ArrayBufferLike>>;
```

The image with the mask as alpha, as a PNG (the cutout).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | [`Pixels`](#pixels) |
| `m` | [`Mask`](#mask) |
| `o?` | \{ `compress?`: `boolean`; \} |
| `o.compress?` | `boolean` |

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### cutoutRgba()

```ts
function cutoutRgba(image, m): Uint8ClampedArray;
```

The image's RGBA with the mask as alpha (the cutout).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `image` | [`Pixels`](#pixels) |
| `m` | [`Mask`](#mask) |

#### Returns

`Uint8ClampedArray`

***

### decodeYolo()

```ts
function decodeYolo(
   out, 
   dims, 
   lb, 
   src, 
   o?
): Detection[];
```

Decode a [4 + classes, anchors] output (batch 1) into boxes in source pixels.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `out` | `ArrayLike`\<`number`\> |
| `dims` | readonly `number`[] |
| `lb` | [`Letterbox`](#letterbox) |
| `src` | \{ `height`: `number`; `width`: `number`; \} |
| `src.height` | `number` |
| `src.width` | `number` |
| `o?` | \{ `iou?`: `number`; `labels?`: readonly `string`[]; `max?`: `number`; `scoreThreshold?`: `number`; \} |
| `o.iou?` | `number` |
| `o.labels?` | readonly `string`[] |
| `o.max?` | `number` |
| `o.scoreThreshold?` | `number` |

#### Returns

[`Detection`](#detection)[]

***

### depth()

```ts
function depth(
   hub, 
   image, 
   o?
): Promise<DepthMap>;
```

A depth map of an image from the routed depth model (Depth Anything V2 small by default), loaded and released through the hub.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `image` | `unknown` |
| `o?` | [`CallOptions`](#calloptions) |

#### Returns

`Promise`\<[`DepthMap`](#depthmap)\>

***

### depthFromOutput()

```ts
function depthFromOutput(out): DepthMap;
```

Normalize a depth pipeline result. predicted_depth keeps the raw range; depth is the 8 bit image.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `out` | \{ `depth?`: `RawImageLike`; `predicted_depth?`: `TensorLike`; \} |
| `out.depth?` | `RawImageLike` |
| `out.predicted_depth?` | `TensorLike` |

#### Returns

[`DepthMap`](#depthmap)

***

### depthLoader()

```ts
function depthLoader(ctx): Promise<DepthModel>;
```

The transformers.js loader for depth records: a depth-estimation pipeline wrapped as a [DepthModel](#depthmodel).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `TjsLoadContext` |

#### Returns

`Promise`\<[`DepthModel`](#depthmodel)\>

***

### depthToRgba()

```ts
function depthToRgba(d): Uint8ClampedArray;
```

A depth map as an 8 bit grey RGBA buffer, for a canvas or a PNG (store it as a PNG data URL to keep it with a design).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `d` | \{ `data`: `Float32Array`; `height`: `number`; `width`: `number`; \} |
| `d.data` | `Float32Array` |
| `d.height` | `number` |
| `d.width` | `number` |

#### Returns

`Uint8ClampedArray`

***

### depthWorker()

```ts
function depthWorker(o): Promise<DepthWorker>;
```

Spawns the worker and loads the model in it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`DepthWorkerOptions`](#depthworkeroptions) |

#### Returns

`Promise`\<[`DepthWorker`](#depthworker)\>

***

### describePerception()

```ts
function describePerception(p): string;
```

Perception as one short lowercase line for a language model.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`Perception`](#perception-1) |

#### Returns

`string`

***

### detect()

```ts
function detect(
   hub, 
   image, 
   o?
): Promise<Detection[]>;
```

Objects in an image from the routed detector (MediaPipe EfficientDet by default, or a YOLO ort model), loaded and released through the hub.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `image` | `unknown` |
| `o?` | [`CallOptions`](#calloptions) & `object` |

#### Returns

`Promise`\<[`Detection`](#detection)[]\>

***

### detectCadenceMs()

```ts
function detectCadenceMs(lastLatencyMs): number;
```

Detection cadence: wait max(0.45 s, 4 times the last latency) between runs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lastLatencyMs` | `number` |

#### Returns

`number`

***

### discSegmenter()

```ts
function discSegmenter(): Segmenter & object;
```

A disc at the first positive point, or in the middle of the box, with a
hole at each negative point. The stub encoder counts its runs on
`encodes`, so tests can see the embedding cache work.

#### Returns

[`Segmenter`](#segmenter) & `object`

***

### emptyMask()

```ts
function emptyMask(width, height): Mask;
```

An empty mask.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |

#### Returns

[`Mask`](#mask)

***

### encodePng()

```ts
function encodePng(
   width, 
   height, 
   data, 
   o?
): Promise<Uint8Array<ArrayBufferLike>>;
```

A PNG file from RGBA (4 channels) or grey (1 channel) bytes. Deflates
through CompressionStream where the runtime has one, stored blocks
otherwise or with `compress: false`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `data` | `ArrayLike`\<`number`\> |
| `o?` | \{ `channels?`: `1` \| `4`; `compress?`: `boolean`; \} |
| `o.channels?` | `1` \| `4` |
| `o.compress?` | `boolean` |

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### faceApiProvider()

```ts
function faceApiProvider(opts): Factory<Landmarker>;
```

The face-api.js provider for the models hub: the tiny face detector and 68 point tiny landmark net, as a face [Landmarker](#landmarker).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | \{ `runtime`: () => `Promise`\<[`FaceApi`](#faceapi)\>; \} |
| `opts.runtime` | () => `Promise`\<[`FaceApi`](#faceapi)\> |

#### Returns

`Factory`\<[`Landmarker`](#landmarker)\>

***

### faceApiRecord()

```ts
function faceApiRecord(baseUrl): ModelRecord;
```

A face landmark fallback record over face-api.js tiny nets (code MIT; weights MIT from @vladmandic/face-api).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `baseUrl` | `string` |

#### Returns

`ModelRecord`

***

### fitSize()

```ts
function fitSize(
   w, 
   h, 
   maxPx?
): object;
```

Scale so the longest side is at most maxPx.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `w` | `number` | `undefined` |
| `h` | `number` | `undefined` |
| `maxPx?` | `number` | `1024` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `height` | `number` |
| `scale` | `number` |
| `width` | `number` |

***

### fixedLandmarker()

```ts
function fixedLandmarker(count, source?): Landmarker;
```

A stub landmarker with no weights: one list of `count` fixed points.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `count` | `number` | `undefined` |
| `source?` | `string` | `"stub"` |

#### Returns

[`Landmarker`](#landmarker)

***

### fixedVlm()

```ts
function fixedVlm(text?): Vlm;
```

A stub vision language model with no weights: a fixed caption, or a fixed answer that repeats the question.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text?` | `string` | `"a stub caption."` |

#### Returns

[`Vlm`](#vlm)

***

### gazeTarget()

```ts
function gazeTarget(p, gain?): 
  | {
  x: number;
  y: number;
}
  | null;
```

Where the character should look, -1 to 1, with a gain (vendor 1.3) so small head moves read; null when nobody is in view.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `p` | [`Perception`](#perception-1) | `undefined` |
| `gain?` | `number` | `1.3` |

#### Returns

  \| \{
  `x`: `number`;
  `y`: `number`;
\}
  \| `null`

***

### hasPrompt()

```ts
function hasPrompt(p?): boolean;
```

True when the prompt has a point or a box.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p?` | [`SegmentPrompt`](#segmentprompt) |

#### Returns

`boolean`

***

### iou()

```ts
function iou(a, b): number;
```

Intersection over union of two boxes, 0 to 1.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | [`Box`](#box) |
| `b` | [`Box`](#box) |

#### Returns

`number`

***

### landmarkChain()

```ts
function landmarkChain(hub, kind): ModelRecord[];
```

Records for a landmark kind in fallback order: the routed record first, then the rest.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `kind` | [`LandmarkKind`](#landmarkkind) |

#### Returns

`ModelRecord`[]

***

### landmarks()

```ts
function landmarks(
   hub, 
   kind, 
   image, 
   o?
): Promise<Landmarks & object>;
```

Landmarks through the fallback chain. `failures` lists the records that failed before the one that answered.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `kind` | [`LandmarkKind`](#landmarkkind) |
| `image` | `unknown` |
| `o?` | [`CallOptions`](#calloptions) & `object` |

#### Returns

`Promise`\<[`Landmarks`](#landmarks) & `object`\>

***

### letterboxParams()

```ts
function letterboxParams(
   w, 
   h, 
   size?
): Letterbox;
```

The scale and padding that fit a `w` by `h` image into a `size` square (640 by default), centred.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `w` | `number` | `undefined` |
| `h` | `number` | `undefined` |
| `size?` | `number` | `640` |

#### Returns

[`Letterbox`](#letterbox)

***

### letterboxTensor()

```ts
function letterboxTensor(px, size?): object;
```

RGBA pixels to a planar float tensor [1, 3, size, size] in 0 to 1, nearest neighbour, grey padding.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `px` | [`Pixels`](#pixels) | `undefined` |
| `size?` | `number` | `640` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `data` | `Float32Array` |
| `lb` | [`Letterbox`](#letterbox) |

***

### loadTasksVision()

```ts
function loadTasksVision(version?): () => Promise<TasksVision>;
```

A loader that imports the pinned @mediapipe/tasks-vision at run time; pass it as `runtime` to [mediapipeProvider](#mediapipeprovider).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `TASKS_VISION` |

#### Returns

() => `Promise`\<[`TasksVision`](#tasksvision)\>

***

### maskArea()

```ts
function maskArea(m): number;
```

Inside pixels (128 and up).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |

#### Returns

`number`

***

### maskDilate()

```ts
function maskDilate(m, r): Mask;
```

Grow by a disc of radius `r` pixels (expand).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |
| `r` | `number` |

#### Returns

[`Mask`](#mask)

***

### maskErode()

```ts
function maskErode(m, r): Mask;
```

Shrink by a disc of radius `r` pixels; the image border does not count as outside.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |
| `r` | `number` |

#### Returns

[`Mask`](#mask)

***

### maskFeather()

```ts
function maskFeather(m, r): Mask;
```

Soft edges: a gaussian of radius `r` with sigma r / 2 (a smooth without a rethreshold), edges clamped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |
| `r` | `number` |

#### Returns

[`Mask`](#mask)

***

### maskFromRle()

```ts
function maskFromRle(r): Mask;
```

A mask from COCO style run length, inside 255. Throws when the counts do not cover the image.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`MaskRle`](#maskrle) |

#### Returns

[`Mask`](#mask)

***

### maskIntersect()

```ts
function maskIntersect(a, b): Mask;
```

Pixels inside both masks, the smaller value of each. Throws when the sizes differ.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | [`Mask`](#mask) |
| `b` | [`Mask`](#mask) |

#### Returns

[`Mask`](#mask)

***

### maskInvert()

```ts
function maskInvert(m): Mask;
```

The mask with inside and outside swapped, 255 minus each value.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |

#### Returns

[`Mask`](#mask)

***

### maskLargestComponent()

```ts
function maskLargestComponent(m, connectivity?): Mask;
```

Keep only the largest connected piece (8 connected by default).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `m` | [`Mask`](#mask) | `undefined` |
| `connectivity?` | `4` \| `8` | `8` |

#### Returns

[`Mask`](#mask)

***

### maskOutline()

```ts
function maskOutline(m): [number, number][][];
```

Outline loops along pixel edges, inside on the right going clockwise
in image space (y down); holes run the other way. Points are pixel
corners, collinear runs merged.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |

#### Returns

\[`number`, `number`\][][]

***

### maskSubtract()

```ts
function maskSubtract(a, b): Mask;
```

`a` with `b` taken out (shift with a selection tool in a mask editor).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | [`Mask`](#mask) |
| `b` | [`Mask`](#mask) |

#### Returns

[`Mask`](#mask)

***

### maskThreshold()

```ts
function maskThreshold(m, t?): Mask;
```

Every value to 0 or 255 at `t`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `m` | [`Mask`](#mask) | `undefined` |
| `t?` | `number` | `ON` |

#### Returns

[`Mask`](#mask)

***

### maskToPng()

```ts
function maskToPng(m, o?): Promise<Uint8Array<ArrayBufferLike>>;
```

The mask as a grey PNG.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |
| `o?` | \{ `compress?`: `boolean`; \} |
| `o.compress?` | `boolean` |

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

***

### maskToRgba()

```ts
function maskToRgba(m): Uint8ClampedArray;
```

Grey RGBA, opaque, for a canvas or a PNG.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |

#### Returns

`Uint8ClampedArray`

***

### maskToRle()

```ts
function maskToRle(m): MaskRle;
```

The mask as COCO style uncompressed run length, column major, 128 and up inside.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |

#### Returns

[`MaskRle`](#maskrle)

***

### maskToSvg()

```ts
function maskToSvg(m, o?): string;
```

The outline as an SVG file, one even odd path in image pixels.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mask`](#mask) |
| `o?` | \{ `fill?`: `string`; \} |
| `o.fill?` | `string` |

#### Returns

`string`

***

### maskUnion()

```ts
function maskUnion(a, b): Mask;
```

Pixels inside either mask, the larger value of each. Throws when the sizes differ.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | [`Mask`](#mask) |
| `b` | [`Mask`](#mask) |

#### Returns

[`Mask`](#mask)

***

### mediapipeLadder()

```ts
function mediapipeLadder(): Rung[];
```

MediaPipe ladder: GPU delegate (webgl), then the CPU delegate (wasm).

#### Returns

`Rung`[]

***

### mediapipeProvider()

```ts
function mediapipeProvider(opts): Factory;
```

The MediaPipe tasks-vision provider for the models hub: one task per record, the GPU delegate on a webgl rung and the CPU delegate on a wasm rung.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`MediapipeProviderOptions`](#mediapipeprovideroptions) |

#### Returns

`Factory`

***

### nms()

```ts
function nms(
   dets, 
   iouThreshold?, 
   max?
): Detection[];
```

Greedy NMS within each label, best first, then the top `max` overall.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `dets` | [`Detection`](#detection)[] | `undefined` |
| `iouThreshold?` | `number` | `0.45` |
| `max?` | `number` | `13` |

#### Returns

[`Detection`](#detection)[]

***

### perceptionLoop()

```ts
function perceptionLoop<T>(o): Loop;
```

Run a perception step beside a render loop, one at a time, each started no sooner than `interval(lastLatency)` after the previous one began.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`LoopOptions`](#loopoptions)\<`T`\> |

#### Returns

[`Loop`](#loop)

***

### promptSegmenter()

```ts
function promptSegmenter<E>(o): Segmenter & object;
```

A segmenter from an encoder and a decoder, with the embedding cache on `cache`. Masks come best first, scores clamped to 0 to 1.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-e-2"></a> `E` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`PromptSegmenterOptions`](#promptsegmenteroptions)\<`E`\> |

#### Returns

[`Segmenter`](#segmenter) & `object`

***

### rampDepth()

```ts
function rampDepth(): DepthModel;
```

A stub depth model with no weights: a left to right ramp at the image's size.

#### Returns

[`DepthModel`](#depthmodel)

***

### rawFace()

```ts
function rawFace(lm, index?): RawFace | null;
```

One raw face from a face landmark result, or null. Expressions read 0 without blendshapes.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `lm` | [`Landmarks`](#landmarks) | `undefined` |
| `index?` | `number` | `0` |

#### Returns

[`RawFace`](#rawface) \| `null`

***

### rawFromLandmarks()

```ts
function rawFromLandmarks(face, hands?): RawFrame;
```

A tracker frame from `landmarks` results. Leave `hands` out on frames where hands were not checked.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `face` | [`Landmarks`](#landmarks) \| `null` \| `undefined` |
| `hands?` | [`Landmarks`](#landmarks) \| `null` |

#### Returns

[`RawFrame`](#rawframe)

***

### rawHands()

```ts
function rawHands(lm): RawHand[];
```

Raw hands from a gesture recognizer or hand landmarker result: the wrist (point 0) and the top gesture.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lm` | [`Landmarks`](#landmarks) |

#### Returns

[`RawHand`](#rawhand)[]

***

### reactionsFor()

```ts
function reactionsFor(
   e, 
   rng, 
   table?
): Reaction[];
```

The reactions an event calls for. A chance is drawn once per reaction from the injected `rng`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `e` | [`PerceptionEvent`](#perceptionevent) | `undefined` |
| `rng` | () => `number` | `undefined` |
| `table?` | readonly [`Reaction`](#reaction)[] | `DEFAULT_REACTIONS` |

#### Returns

[`Reaction`](#reaction)[]

***

### readbackLoop()

```ts
function readbackLoop<T>(o): Loop & object;
```

Agent eye style readback: one read at a time (a busy flag guards
re-entry; frames while busy are counted as skipped instead of queued),
capped at maxHz.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ReadbackOptions`](#readbackoptions)\<`T`\> |

#### Returns

[`Loop`](#loop) & `object`

***

### samLoader()

```ts
function samLoader(ctx): Promise<Segmenter>;
```

SlimSAM: one embedding per image, kept in an `EmbeddingCache`, then point, negative point and box prompts.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `TjsLoadContext` |

#### Returns

`Promise`\<[`Segmenter`](#segmenter)\>

***

### segment()

```ts
function segment(
   hub, 
   image, 
   prompt?, 
   o?
): Promise<Mask[]>;
```

Point, negative point and box prompted masks (SlimSAM), or a person mask
without a prompt (selfie segmenter). Best first. The image is encoded
once: pass `key` (an image hash) and your own `cache` to keep and drop
embeddings yourself.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `image` | `unknown` |
| `prompt?` | [`SegmentPrompt`](#segmentprompt) |
| `o?` | [`CallOptions`](#calloptions) & [`SegmentOptions`](#segmentoptions) |

#### Returns

`Promise`\<[`Mask`](#mask)[]\>

***

### tasksVisionUrls()

```ts
function tasksVisionUrls(version?): string[];
```

The URL @mediapipe/tasks-vision is imported from, on jsDelivr.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `TASKS_VISION` |

#### Returns

`string`[]

***

### tasksVisionWasm()

```ts
function tasksVisionWasm(version?): string;
```

The directory of the tasks-vision wasm fileset, on jsDelivr.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `TASKS_VISION` |

#### Returns

`string`

***

### visionStubs()

```ts
function visionStubs(): Record<string, (r) => unknown>;
```

Stub builders to merge into `stubFactory({...})`.

#### Returns

`Record`\<`string`, (`r`) => `unknown`\>

***

### vlmLoader()

```ts
function vlmLoader(ctx): Promise<Vlm>;
```

The transformers.js loader for caption and question records: the VLM's processor and model wrapped as a [Vlm](#vlm).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | `TjsLoadContext` |

#### Returns

`Promise`\<[`Vlm`](#vlm)\>

***

### wantsLook()

```ts
function wantsLook(text, pattern?): boolean;
```

True when a message asks the character to look, by [LOOK\_PATTERN](#look_pattern) or the pattern you pass.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `pattern?` | `RegExp` | `LOOK_PATTERN` |

#### Returns

`boolean`

***

### yoloDetector()

```ts
function yoloDetector(m, o?): Detector;
```

Wrap an ort model as a Detector. Images must be Pixels, or `toPixels` must turn them into Pixels.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | `OrtModel` |
| `o?` | \{ `labels?`: readonly `string`[]; `size?`: `number`; `toPixels?`: (`img`) => [`Pixels`](#pixels); \} |
| `o.labels?` | readonly `string`[] |
| `o.size?` | `number` |
| `o.toPixels?` | (`img`) => [`Pixels`](#pixels) |

#### Returns

[`Detector`](#detector)

***

### yoloRecord()

```ts
function yoloRecord(o): ModelRecord;
```

YOLOv8n exported to ONNX (640 input, [1, 84, 8400] output). External: the app supplies the URL and accepts the weight licence.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `id?`: `string`; `labels?`: `string`[]; `licence?`: `string`; `sha256?`: `string`; `url`: `string`; \} |
| `o.id?` | `string` |
| `o.labels?` | `string`[] |
| `o.licence?` | `string` |
| `o.sha256?` | `string` |
| `o.url` | `string` |

#### Returns

`ModelRecord`

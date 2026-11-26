# @hackbuild/media

## Interfaces

### DecodedAudio

Audio decoded and resampled by [decodeAudio](#decodeaudio): one Float32Array per channel at sampleRate.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-channels"></a> `channels` | `Float32Array`\<`ArrayBufferLike`\>[] |
| <a id="property-duration"></a> `duration` | `number` |
| <a id="property-samplerate"></a> `sampleRate` | `number` |

***

### OfflineCtxLike

The part of OfflineAudioContext that [decodeAudio](#decodeaudio) calls; tests and workers pass their own.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-destination"></a> `destination` | `unknown` |

#### Methods

##### createBufferSource()

```ts
createBufferSource(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `buffer` | `AudioBufferLike` \| `null` |
| `connect()` | (`d`) => `void` |
| `start()` | () => `void` |

##### decodeAudioData()

```ts
decodeAudioData(b): Promise<AudioBufferLike>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `ArrayBuffer` |

###### Returns

`Promise`\<`AudioBufferLike`\>

##### startRendering()

```ts
startRendering(): Promise<AudioBufferLike>;
```

###### Returns

`Promise`\<`AudioBufferLike`\>

## Type Aliases

### OfflineCtor

```ts
type OfflineCtor = new (channels, length, sampleRate) => OfflineCtxLike;
```

A constructor of an [OfflineCtxLike](#offlinectxlike), with the OfflineAudioContext arguments.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `channels` | `number` |
| `length` | `number` |
| `sampleRate` | `number` |

#### Returns

[`OfflineCtxLike`](#offlinectxlike)

## Variables

### RECORDER\_TYPES

```ts
const RECORDER_TYPES: string[];
```

MIME types [pickMime](#pickmime) tries in order: vp9, vp8, plain webm, then mp4.

## Functions

### decodeAudio()

```ts
function decodeAudio(
   data, 
   sampleRate?, 
   Ctx?
): Promise<DecodedAudio>;
```

Decode and resample with the browser's decoder (as earlier builds did). Names the failure when the browser refuses the container.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `ArrayBuffer` \| `Blob` | `undefined` |
| `sampleRate?` | `number` | `16000` |
| `Ctx?` | [`OfflineCtor`](#offlinector) | `undefined` |

#### Returns

`Promise`\<[`DecodedAudio`](#decodedaudio)\>

***

### histDistance()

```ts
function histDistance(a, b): number;
```

Half the L1 distance of two normalized histograms: 0 same, 1 disjoint.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `Float32Array` |
| `b` | `Float32Array` |

#### Returns

`number`

***

### lumaHistogram()

```ts
function lumaHistogram(rgba, bins?): Float32Array;
```

A 32 bin luminance histogram of RGBA pixels, normalized to sum 1.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `rgba` | `ArrayLike`\<`number`\> | `undefined` |
| `bins?` | `number` | `32` |

#### Returns

`Float32Array`

***

### pickKeyframes()

```ts
function pickKeyframes(frames, o?): number[];
```

Keyframes from sampled frames: the first frame, every frame whose
histogram moved more than `threshold` from the last keyframe, and at
least one every `maxGap` seconds; at most `max` frames, the biggest
changes kept.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frames` | readonly `object`[] |
| `o?` | \{ `max?`: `number`; `maxGap?`: `number`; `threshold?`: `number`; \} |
| `o.max?` | `number` |
| `o.maxGap?` | `number` |
| `o.threshold?` | `number` |

#### Returns

`number`[]

***

### pickMime()

```ts
function pickMime(isSupported?, types?): string;
```

The first type the recorder supports, or "" for the browser default.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `isSupported?` | (`t`) => `boolean` | `...` |
| `types?` | `string`[] | `RECORDER_TYPES` |

#### Returns

`string`

***

### record()

```ts
function record(stream, o?): object;
```

Record a MediaStream (canvas.captureStream() plus audio tracks) until `stop()`; resolves the Blob.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `stream` | `unknown` |
| `o?` | \{ `bitsPerSecond?`: `number`; `mimeType?`: `string`; `Recorder?`: new (`s`, `opts`) => `RecorderLike`; `timeslice?`: `number`; \} |
| `o.bitsPerSecond?` | `number` |
| `o.mimeType?` | `string` |
| `o.Recorder?` | new (`s`, `opts`) => `RecorderLike` |
| `o.timeslice?` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `mimeType` | `string` |
| `stop()` | () => `Promise`\<`Blob`\> |

***

### sampleTimes()

```ts
function sampleTimes(duration, step?): number[];
```

Sample times for a video of `duration` seconds every `step` seconds, inside the clip.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `duration` | `number` | `undefined` |
| `step?` | `number` | `1` |

#### Returns

`number`[]

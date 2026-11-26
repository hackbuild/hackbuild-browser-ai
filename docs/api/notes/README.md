# @hackbuild/notes

## Interfaces

### MidiTrack

One track for `writeMidi`: a name, its notes, a General MIDI program, or drums on channel 10.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-drums"></a> `drums?` | `boolean` | Drum kit on channel 10. |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-notes"></a> `notes` | readonly `MidiNote`[] | - |
| <a id="property-program"></a> `program?` | `number` | General MIDI program; ignored for drums. |

***

### Note

A note or drum hit: start and length in seconds, MIDI note, velocity, and the drum name for hits.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-drum"></a> `drum?` | `string` | - |
| <a id="property-dur"></a> `dur` | `number` | - |
| <a id="property-m"></a> `m` | `number` | MIDI note. |
| <a id="property-t"></a> `t` | `number` | Seconds. |
| <a id="property-v"></a> `v` | `number` | 0 to 1. |

***

### PitchModel

Runs B windows (B * BP_WINDOW samples) and returns frames and onsets, B * BP_ROWS * BP_BINS each.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-batch"></a> `batch` | `readonly` | `number` |

#### Methods

##### dispose()?

```ts
dispose?(): unknown;
```

###### Returns

`unknown`

##### run()

```ts
run(windows, batch): Promise<{
  frames: Float32Array;
  onsets: Float32Array;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `windows` | `Float32Array` |
| `batch` | `number` |

###### Returns

`Promise`\<\{
  `frames`: `Float32Array`;
  `onsets`: `Float32Array`;
\}\>

***

### Tfjs

The parts of tfjs the provider touches. Tests pass a fake.

#### Methods

##### env()

```ts
env(): object;
```

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `set()` | (`flag`, `v`) => `void` |

##### loadGraphModel()

```ts
loadGraphModel(url): Promise<{
  dispose?(): void;
  execute(x, outs): object[];
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

###### Returns

`Promise`\<\{
  `dispose?`(): `void`;
  `execute`(`x`, `outs`): `object`[];
\}\>

##### ready()

```ts
ready(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### setBackend()

```ts
setBackend(name): Promise<boolean>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

`Promise`\<`boolean`\>

##### tensor()

```ts
tensor(
   data, 
   shape, 
   dtype?
): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `Float32Array` |
| `shape` | `number`[] |
| `dtype?` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `dispose()` | () => `void` |

## Variables

### BASIC\_PITCH

```ts
const BASIC_PITCH: ModelRecord;
```

The models hub record for Spotify's Basic Pitch graph (weights Apache-2.0) on tfjs, webgl in batches of 4, else cpu in batches of 1.

***

### BP\_BINS

```ts
const BP_BINS: 88 = 88;
```

Pitch bins per frame, 88, from MIDI 21 (A0).

***

### BP\_FFT\_HOP

```ts
const BP_FFT_HOP: 256 = 256;
```

Samples between frames inside a window, 256.

***

### BP\_FPS

```ts
const BP_FPS: number;
```

Frames per second inside a window, 86 (the 22050 Hz rate over the 256 sample hop, floored).

***

### BP\_HOP

```ts
const BP_HOP: number;
```

Samples between window starts, 36164.

***

### BP\_KEPT

```ts
const BP_KEPT: number;
```

Frames kept per window after the trim.

***

### BP\_OVERLAP

```ts
const BP_OVERLAP: number;
```

Samples two windows share, 7680 (30 frames).

***

### BP\_OVERLAP\_HALF

```ts
const BP_OVERLAP_HALF: number;
```

Half the overlap, 3840 samples, the zero lead pad before the first window.

***

### BP\_RATE

```ts
const BP_RATE: 22050 = 22050;
```

Sample rate Basic Pitch takes, 22050 Hz.

***

### BP\_ROWS

```ts
const BP_ROWS: 172 = 172;
```

Frames the model returns per window, 172.

***

### BP\_TRIM

```ts
const BP_TRIM: 15 = 15;
```

Frames dropped off each end of a window, 15.

***

### BP\_WINDOW

```ts
const BP_WINDOW: number;
```

Samples in one model window, 43844.

***

### DETAILS

```ts
const DETAILS: object;
```

Note extraction presets.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-loose"></a> `loose` | `object` | - |
| `loose.frameThresh` | `0.22` | `0.22` |
| `loose.mergeGap` | `0.08` | `0.08` |
| `loose.minDur` | `0.03` | `0.03` |
| `loose.minFrames` | `3` | `3` |
| `loose.onsetThresh` | `0.35` | `0.35` |
| <a id="property-normal"></a> `normal` | `object` | - |
| `normal.frameThresh` | `0.3` | `0.3` |
| `normal.mergeGap` | `0.05` | `0.05` |
| `normal.minDur` | `0.05` | `0.05` |
| `normal.minFrames` | `5` | `5` |
| `normal.onsetThresh` | `0.5` | `0.5` |
| <a id="property-tight"></a> `tight` | `object` | - |
| `tight.frameThresh` | `0.35` | `0.35` |
| `tight.mergeGap` | `0.03` | `0.03` |
| `tight.minDur` | `0.06` | `0.06` |
| `tight.minFrames` | `8` | `8` |
| `tight.onsetThresh` | `0.6` | `0.6` |

***

### DRUM\_BANDS

```ts
const DRUM_BANDS: Band[];
```

The kick, snare, hat and tom bands: filters, minimum gap in seconds, onset sensitivity and gate.

***

### GM\_DRUMS

```ts
const GM_DRUMS: object;
```

General MIDI notes for each drum: kick 36, snare 38, hat 42, tom 45.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-hat"></a> `hat` | `42` | `42` |
| <a id="property-kick"></a> `kick` | `36` | `36` |
| <a id="property-snare"></a> `snare` | `38` | `38` |
| <a id="property-tom"></a> `tom` | `45` | `45` |

## Functions

### attachNotes()

```ts
function attachNotes(hub): void;
```

Add the Basic Pitch record to a models hub's registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |

#### Returns

`void`

***

### bpFrameCount()

```ts
function bpFrameCount(samples): number;
```

Frames whose time falls inside `samples` at 22.05 kHz.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `samples` | `number` |

#### Returns

`number`

***

### bpFrameTime()

```ts
function bpFrameTime(i): number;
```

Time in seconds of stitched frame i. Inside a window frames step by the
256 sample FFT hop; windows step by BP_HOP (36164 samples) for 142 kept
frames, so the mean rate is 86.58 fps (computed), not 86.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |

#### Returns

`number`

***

### decodeNotes()

```ts
function decodeNotes(
   frames, 
   onsets, 
   o?
): Note[];
```

Notes from posteriors: a note starts at an onset peak over onsetThresh
(or a frame rise over the frame threshold when no onset fired), lasts
while the frame posterior stays over frameThresh (gaps up to 2 frames
bridged), and needs minFrames frames. Velocity is the mean frame
posterior. Bin 0 is MIDI 21 (A0).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `frames` | `Float32Array`\<`ArrayBufferLike`\>[] |
| `onsets` | `Float32Array`\<`ArrayBufferLike`\>[] |
| `o?` | \{ `frameThresh?`: `number`; `minFrames?`: `number`; `onsetThresh?`: `number`; \} |
| `o.frameThresh?` | `number` |
| `o.minFrames?` | `number` |
| `o.onsetThresh?` | `number` |

#### Returns

[`Note`](#note)[]

***

### drumNotes()

```ts
function drumNotes(
   dsp, 
   mono, 
   sampleRate, 
   o?
): Note[];
```

Drum hits from a mono signal at any rate: resamples to 22050 Hz, finds
onsets per band, groups them on one 25 ms grid with cross band rules,
and returns General MIDI notes. Toms only when `toms` is set.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dsp` | `Dsp` |
| `mono` | `Float32Array` |
| `sampleRate` | `number` |
| `o?` | \{ `toms?`: `boolean`; \} |
| `o.toms?` | `boolean` |

#### Returns

[`Note`](#note)[]

***

### estimateTempo()

```ts
function estimateTempo(
   dsp, 
   mono, 
   sampleRate
): object;
```

bpm (2 decimals) and grid offset in seconds (3 decimals).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dsp` | `Dsp` |
| `mono` | `Float32Array` |
| `sampleRate` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `bpm` | `number` |
| `offset` | `number` |

***

### fitGridToNotes()

```ts
function fitGridToNotes(dsp, notes): 
  | {
  bpm: number;
  offset: number;
  r: number;
}
  | null;
```

Grid from transcribed notes by vector strength; null when R is under 0.25.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dsp` | `Dsp` |
| `notes` | readonly [`Note`](#note)[] |

#### Returns

  \| \{
  `bpm`: `number`;
  `offset`: `number`;
  `r`: `number`;
\}
  \| `null`

***

### isShaderFailure()

```ts
function isShaderFailure(e): boolean;
```

Shader failures that mean "use the cpu backend".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

#### Returns

`boolean`

***

### keepMonophonic()

```ts
function keepMonophonic(notes, pick?): Note[];
```

One note at a time, keeping the higher (or lower) line.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `notes` | readonly [`Note`](#note)[] | `undefined` |
| `pick?` | `"high"` \| `"low"` | `"high"` |

#### Returns

[`Note`](#note)[]

***

### notesStubs()

```ts
function notesStubs(): Record<string, (r) => unknown>;
```

Stub builders for the models hub: the `notes` capability returns `stubPitch()`.

#### Returns

`Record`\<`string`, (`r`) => `unknown`\>

***

### refineNotes()

```ts
function refineNotes(notes, o?): Note[];
```

Merge same pitch splits, drop octave, twelfth and double octave ghosts, drop dust.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `notes` | readonly [`Note`](#note)[] |
| `o?` | \{ `harmonics?`: `boolean`; `mergeGap?`: `number`; `minDur?`: `number`; `minVel?`: `number`; \} |
| `o.harmonics?` | `boolean` |
| `o.mergeGap?` | `number` |
| `o.minDur?` | `number` |
| `o.minVel?` | `number` |

#### Returns

[`Note`](#note)[]

***

### runPitch()

```ts
function runPitch(
   m, 
   mono, 
   o?
): Promise<{
  frames: Float32Array<ArrayBufferLike>[];
  onsets: Float32Array<ArrayBufferLike>[];
}>;
```

Frames and onsets (rows of 88) for a 22050 Hz mono signal.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`PitchModel`](#pitchmodel) |
| `mono` | `Float32Array` |
| `o?` | \{ `onProgress?`: (`f`) => `void`; `signal?`: `AbortSignal`; `yieldEvery?`: () => `Promise`\<`void`\>; \} |
| `o.onProgress?` | (`f`) => `void` |
| `o.signal?` | `AbortSignal` |
| `o.yieldEvery?` | () => `Promise`\<`void`\> |

#### Returns

`Promise`\<\{
  `frames`: `Float32Array`\<`ArrayBufferLike`\>[];
  `onsets`: `Float32Array`\<`ArrayBufferLike`\>[];
\}\>

***

### stubPitch()

```ts
function stubPitch(): PitchModel;
```

A stub pitch model: A4 (bin 48) held through every window, onset on each window's first kept frame.

#### Returns

[`PitchModel`](#pitchmodel)

***

### tfjsPitchProvider()

```ts
function tfjsPitchProvider(opts): Factory<PitchModel>;
```

A models hub factory for the tfjs provider that loads the Basic Pitch
graph and returns a PitchModel. You pass tfjs in through `runtime`. On
webgl it sets WEBGL_SIZE_UPLOAD_UNIFORM to 0 and reads only the frames
and onsets outputs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | \{ `runtime`: () => `Promise`\<[`Tfjs`](#tfjs)\>; \} |
| `opts.runtime` | () => `Promise`\<[`Tfjs`](#tfjs)\> |

#### Returns

`Factory`\<[`PitchModel`](#pitchmodel)\>

***

### writeMidi()

```ts
function writeMidi(tracks, bpm): Uint8Array;
```

A format 1 file: a tempo track (tempo, 4/4) then one track per input. Note times are seconds at `bpm`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tracks` | readonly [`MidiTrack`](#miditrack)[] |
| `bpm` | `number` |

#### Returns

`Uint8Array`

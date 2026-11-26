# @hackbuild/stems

## Interfaces

### SeparateOptions

Options for `separate`: record id, overlap, segment length, abort signal, run schedule, progress callback and clock.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-model"></a> `model?` | `string` | - |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onprogress"></a> `onProgress?` | (`p`) => `void` | - |
| <a id="property-overlap"></a> `overlap?` | `number` | Override the record's overlap, 0 to 0.6. |
| <a id="property-schedule"></a> `schedule?` | `RunOptions` | - |
| <a id="property-segment"></a> `segment?` | `number` | Segment length; default SEGMENT. Tests use short ones. |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |

***

### Separator

A separator takes one stereo segment of SEGMENT samples, returns [tracks][2][SEGMENT] flat.

#### Methods

##### separate()

```ts
separate(left, right): Promise<{
  data: ArrayLike<number>;
  samples: number;
  tracks: number;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `left` | `Float32Array` |
| `right` | `Float32Array` |

###### Returns

`Promise`\<\{
  `data`: `ArrayLike`\<`number`\>;
  `samples`: `number`;
  `tracks`: `number`;
\}\>

***

### Stems

What `separate` returns: left and right channels per stem, the realtime factor and the record id used.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-model-1"></a> `model` | `string` | - |
| <a id="property-rtf"></a> `rtf` | `number` | Audio seconds per wall second (computed). |
| <a id="property-stems"></a> `stems` | `Record`\<[`Track`](#track), \{ `left`: `Float32Array`; `right`: `Float32Array`; \}\> | - |

## Type Aliases

### Track

```ts
type Track = typeof TRACKS[number];
```

One stem name from TRACKS.

## Variables

### SAMPLE\_RATE

```ts
const SAMPLE_RATE: 44100 = 44100;
```

Sample rate the separator takes and returns, 44100 Hz.

***

### SEGMENT

```ts
const SEGMENT: 343980 = 343980;
```

Samples per model segment, 343980 (7.8 s at 44.1 kHz).

***

### STEMS\_RECORDS

```ts
const STEMS_RECORDS: ModelRecord[];
```

The models hub records for htdemucs (weights MIT): fp16 weights at 10 percent overlap, fp32 at 40 percent.

***

### TRACKS

```ts
const TRACKS: readonly ["drums", "bass", "other", "vocals"];
```

The four stems in model output order: drums, bass, other, vocals.

## Functions

### attachStems()

```ts
function attachStems(hub): void;
```

Add the htdemucs records to a models hub's registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |

#### Returns

`void`

***

### ortSeparator()

```ts
function ortSeparator(m): Separator;
```

Wrap an ort model as a Separator; refuses two input exports.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | `OrtModel` |

#### Returns

[`Separator`](#separator)

***

### overlapOf()

```ts
function overlapOf(r): number;
```

The overlap a record was tuned for (notes "overlap x"), else 0.25.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | `ModelRecord` |

#### Returns

`number`

***

### separate()

```ts
function separate(
   hub, 
   left, 
   right, 
   o?
): Promise<Stems>;
```

Separate a 44.1 kHz stereo mix. Resample first (audio-dsp) when the source rate differs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `left` | `Float32Array` |
| `right` | `Float32Array` |
| `o?` | [`SeparateOptions`](#separateoptions) |

#### Returns

`Promise`\<[`Stems`](#stems)\>

***

### stemsStubs()

```ts
function stemsStubs(): Record<string, (r) => unknown>;
```

Stub builders for the models hub: the `stems` capability returns `stubSeparator()`.

#### Returns

`Record`\<`string`, (`r`) => `unknown`\>

***

### stubSeparator()

```ts
function stubSeparator(): Separator;
```

Stub separator: every stem is a quarter of the mix.

#### Returns

[`Separator`](#separator)

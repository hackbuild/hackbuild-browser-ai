# @hackbuild/audio-dsp

## Classes

### Dsp

The DSP kernels. Sample rates in Hz, times in seconds.

#### Constructors

##### Constructor

```ts
new Dsp(x): Dsp;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |

###### Returns

[`Dsp`](#dsp)

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-simd"></a> `simd` | `readonly` | `boolean` | True when the wasm build runs its sums on simd128 lanes. |

#### Methods

##### biquad()

```ts
biquad(
   x, 
   kind, 
   fc, 
   sr, 
   q?
): Float32Array;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `kind` | [`FilterKind`](#filterkind) | `undefined` |
| `fc` | `number` | `undefined` |
| `sr` | `number` | `undefined` |
| `q?` | `number` | `0.707` |

###### Returns

`Float32Array`

##### biquadCoef()

```ts
biquadCoef(
   kind, 
   fc, 
   sr, 
   q?
): number[];
```

b0, b1, b2, a1, a2 normalized by a0 (RBJ cookbook).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `kind` | [`FilterKind`](#filterkind) | `undefined` |
| `fc` | `number` | `undefined` |
| `sr` | `number` | `undefined` |
| `q?` | `number` | `0.707` |

###### Returns

`number`[]

##### dcBlock()

```ts
dcBlock(x): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |

###### Returns

`Float32Array`

##### decimate()

```ts
decimate(
   x, 
   factor, 
   taps?, 
   cutoff?, 
   sr?
): Float32Array;
```

FIR low pass then every factor-th sample (earlier builds: factor 3, 41 taps, 7 kHz from 48 kHz).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `factor` | `number` | `undefined` |
| `taps?` | `number` | `41` |
| `cutoff?` | `number` | `7000` |
| `sr?` | `number` | `48000` |

###### Returns

`Float32Array`

##### denoise()

```ts
denoise(
   x, 
   noise, 
   alpha, 
   gFloor, 
   w?, 
   hop?
): Float32Array;
```

Spectral subtraction; earlier builds: alpha 1.2, 1.8, 2.6 with gain floors 0.15, 0.08, 0.04.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `noise` | `Float32Array` | `undefined` |
| `alpha` | `number` | `undefined` |
| `gFloor` | `number` | `undefined` |
| `w?` | `number` | `512` |
| `hop?` | `number` | `256` |

###### Returns

`Float32Array`

##### envelopePeak()

```ts
envelopePeak(x, n): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |
| `n` | `number` |

###### Returns

`Float32Array`

##### envelopeRms()

```ts
envelopeRms(x, hop): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |
| `hop` | `number` |

###### Returns

`Float32Array`

##### estimateTempo()

```ts
estimateTempo(env, fps): object;
```

bpm by onset autocorrelation over 60 to 200, offset by a 96 step phase search. Not rounded.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Float32Array` |
| `fps` | `number` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `bpm` | `number` |
| `offset` | `number` |

##### fitGrid()

```ts
fitGrid(times, weights): 
  | {
  bpm: number;
  offset: number;
  r: number;
}
  | null;
```

Vector strength grid fit over 55 to 208 bpm; null when the weights sum to zero.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `times` | `ArrayLike`\<`number`\> |
| `weights` | `ArrayLike`\<`number`\> |

###### Returns

  \| \{
  `bpm`: `number`;
  `offset`: `number`;
  `r`: `number`;
\}
  \| `null`

##### formants()

```ts
formants(
   x, 
   sr, 
   center, 
   winSec?, 
   decim?, 
   order?
): Formant[];
```

Formants of x around sample index `center` by LPC, ported from
bellowsjs estimateFormants (MIT, same owner): decimate, pre-emphasis,
Hamming window, Levinson-Durbin, Durand-Kerner roots. Ascending by
frequency; poles wider than 700 Hz dropped. Defaults suit an adult
voice at 44.1 or 48 kHz.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `sr` | `number` | `undefined` |
| `center` | `number` | `undefined` |
| `winSec?` | `number` | `0.04` |
| `decim?` | `number` | `4` |
| `order?` | `number` | `14` |

###### Returns

[`Formant`](#formant)[]

##### frameCount()

```ts
frameCount(
   n, 
   frame, 
   hop
): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |
| `frame` | `number` |
| `hop` | `number` |

###### Returns

`number`

##### frameDb()

```ts
frameDb(
   x, 
   hop?, 
   frame?
): Float32Array;
```

Level per frame in dB; the earlier transcription tool uses 400 sample frames on a 160 sample hop at 16 kHz.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `hop?` | `number` | `160` |
| `frame?` | `number` | `400` |

###### Returns

`Float32Array`

##### limit()

```ts
limit(
   x, 
   ceil?, 
   sr?
): Float32Array;
```

Lookahead limiter; returns a new array.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `ceil?` | `number` | `0.891` |
| `sr?` | `number` | `16000` |

###### Returns

`Float32Array`

##### math()

```ts
math(): object;
```

The core's deterministic math, for parity checks.

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `atan2()` | (`y`, `x`) => `number` |
| `cos()` | (`x`) => `number` |
| `exp()` | (`x`) => `number` |
| `ln()` | (`x`) => `number` |
| `sin()` | (`x`) => `number` |

##### noiseFloor()

```ts
noiseFloor(db, win?): number;
```

Median of window minima (150 frames is 1.5 s at a 10 ms hop).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `db` | `Float32Array` | `undefined` |
| `win?` | `number` | `150` |

###### Returns

`number`

##### noiseSpectrum()

```ts
noiseSpectrum(
   sig, 
   db, 
   floorDb, 
   w?, 
   frameHop?
): Float32Array<ArrayBufferLike> | null;
```

Median magnitude of quiet frames, or null when no frame fits.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `sig` | `Float32Array` | `undefined` |
| `db` | `Float32Array` | `undefined` |
| `floorDb` | `number` | `undefined` |
| `w?` | `number` | `512` |
| `frameHop?` | `number` | `160` |

###### Returns

`Float32Array`\<`ArrayBufferLike`\> \| `null`

##### percentile()

```ts
percentile(x, q): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |
| `q` | `number` |

###### Returns

`number`

##### pickOnsets()

```ts
pickOnsets(
   env, 
   fps, 
   minGap?, 
   sens?, 
   gate?
): Onset[];
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `env` | `Float32Array` | `undefined` |
| `fps` | `number` | `undefined` |
| `minGap?` | `number` | `0.05` |
| `sens?` | `number` | `1` |
| `gate?` | `number` | `0.1` |

###### Returns

[`Onset`](#onset)[]

##### resample()

```ts
resample(
   x, 
   src, 
   dst, 
   mode?, 
   zeros?
): Float32Array;
```

Windowed sinc by default; "linear" is the earlier transcription tool interpolator.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `src` | `number` | `undefined` |
| `dst` | `number` | `undefined` |
| `mode?` | `"sinc"` \| `"linear"` | `"sinc"` |
| `zeros?` | `number` | `16` |

###### Returns

`Float32Array`

##### resampleLength()

```ts
resampleLength(
   n, 
   src, 
   dst
): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |
| `src` | `number` |
| `dst` | `number` |

###### Returns

`number`

##### stftMag()

```ts
stftMag(
   x, 
   w?, 
   hop?
): object;
```

Hann windowed magnitude frames, row major, w / 2 + 1 bins per frame.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `w?` | `number` | `1024` |
| `hop?` | `number` | `256` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `bins` | `number` |
| `frames` | `number` |
| `mag` | `Float32Array` |

##### synth()

```ts
synth(
   seed, 
   n, 
   sr
): Float32Array;
```

The seeded test signal the parity fixture uses.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |
| `n` | `number` |
| `sr` | `number` |

###### Returns

`Float32Array`

##### vowel()

```ts
vowel(
   n, 
   sr, 
   f0, 
   f1, 
   f2, 
   f3
): Float32Array;
```

A test vowel: an impulse train at f0 through three resonators, n samples.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | `number` |
| `sr` | `number` |
| `f0` | `number` |
| `f1` | `number` |
| `f2` | `number` |
| `f3` | `number` |

###### Returns

`Float32Array`

***

### OverlapAdd

Accumulates weighted segment outputs into `tracks` by `channels` buffers of `total` samples.

#### Constructors

##### Constructor

```ts
new OverlapAdd(
   total, 
   tracks, 
   channels, 
   fade
): OverlapAdd;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `total` | `number` |
| `tracks` | `number` |
| `channels` | `number` |
| `fade` | `number` |

###### Returns

[`OverlapAdd`](#overlapadd)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-channels"></a> `channels` | `readonly` | `number` |
| <a id="property-fade"></a> `fade` | `readonly` | `number` |
| <a id="property-out"></a> `out` | `readonly` | `Float32Array`\<`ArrayBufferLike`\>[][] |
| <a id="property-total"></a> `total` | `readonly` | `number` |
| <a id="property-tracks"></a> `tracks` | `readonly` | `number` |

#### Methods

##### add()

```ts
add(
   seg, 
   data, 
   stride
): void;
```

Add one segment. `data` is laid out [track][channel][sample] with
`stride` samples per channel row (the model's segment length).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seg` | [`OlaSegment`](#olasegment) |
| `data` | `ArrayLike`\<`number`\> |
| `stride` | `number` |

###### Returns

`void`

##### finish()

```ts
finish(): Float32Array<ArrayBufferLike>[][];
```

Divide by the summed weights. Call once.

###### Returns

`Float32Array`\<`ArrayBufferLike`\>[][]

## Interfaces

### Formant

One resonance: centre frequency and bandwidth, Hz.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bw"></a> `bw` | `number` |
| <a id="property-f"></a> `f` | `number` |

***

### GateOptions

The hysteresis gate from the earlier transcription tool, over frame levels in dB: speech
turns on after 3 frames above the threshold and off after 25 below,
regions are padded, merged across short gaps and dropped when short.
Regions come back in samples, end exclusive.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-frame"></a> `frame?` | `number` | Samples per frame. Default 400 (25 ms at 16 kHz). |
| <a id="property-hop"></a> `hop?` | `number` | Samples per frame hop. Default 160 (10 ms at 16 kHz). |
| <a id="property-mergegap"></a> `mergeGap?` | `number` | Merge regions closer than this many seconds. Default 0.30. |
| <a id="property-mindur"></a> `minDur?` | `number` | Drop regions shorter than this many seconds. Default 0.20. |
| <a id="property-off"></a> `off?` | `number` | Frames below the threshold to close. Default 25. |
| <a id="property-on"></a> `on?` | `number` | Frames above the threshold to open. Default 3. |
| <a id="property-pad"></a> `pad?` | `number` | Seconds of padding each side. Default 0.25. |
| <a id="property-samplerate"></a> `sampleRate?` | `number` | - |

***

### MidiNote

One note for `writeMidi`: start and duration in seconds, note number and velocity.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dur"></a> `dur` | `number` | Duration, seconds. |
| <a id="property-m"></a> `m` | `number` | MIDI note number. |
| <a id="property-t"></a> `t` | `number` | Start, seconds. |
| <a id="property-v"></a> `v` | `number` | Velocity 0 to 1. |

***

### MidiTrack

One track for `writeMidi`: a name, its notes, a General MIDI program, or drums on channel 10.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-drums"></a> `drums?` | `boolean` | Drum kit on channel 10. |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-notes"></a> `notes` | readonly [`MidiNote`](#midinote)[] | - |
| <a id="property-program"></a> `program?` | `number` | General MIDI program; ignored for drums. |

***

### OlaSegment

Overlap add for models that take fixed length segments (htdemucs in
an earlier August build): segments of S samples on a stride of
S (1 - overlap), a linear crossfade over min(S - stride, S / 4) at each
end, weights floored at 1e-4, and a division by the summed weights.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-len"></a> `len` | `number` | Real samples in this segment; the model input is zero padded to S. |
| <a id="property-start"></a> `start` | `number` | - |

***

### Onset

One onset from `Dsp.pickOnsets`: the attack foot frame, the novelty peak frame and its strength.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-frame-1"></a> `frame` | `number` | Frame of the attack foot. |
| <a id="property-peak"></a> `peak` | `number` | Frame of the novelty peak. |
| <a id="property-strength"></a> `strength` | `number` | - |

***

### Segment

File writers: txt, srt, vtt and json transcripts in the earlier transcription tool
layouts (byte for byte), lrc in the earlier lyrics tool's, 16 bit and float WAV, standard
MIDI files in the earlier transcription tool layout (format 1, 480 ticks per quarter,
drums on channel 10), and a store only zip.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-end"></a> `end` | `number` |
| <a id="property-start-1"></a> `start` | `number` |
| <a id="property-text"></a> `text` | `string` |

***

### TranscriptJson

The fields `toJson` writes: source, duration, model, language, stats, segments and dropped lines.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-dropped"></a> `dropped?` | readonly `object`[] |
| <a id="property-duration"></a> `duration` | `number` |
| <a id="property-language"></a> `language` | `string` |
| <a id="property-model"></a> `model` | `string` |
| <a id="property-segments"></a> `segments` | readonly [`Segment`](#segment)[] |
| <a id="property-source"></a> `source` | `string` |
| <a id="property-stats"></a> `stats?` | `Record`\<`string`, `unknown`\> \| `null` |

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

Where `loadDsp` gets the wasm core: a URL to fetch, the bytes, or the inlined base64.

***

### FilterKind

```ts
type FilterKind = "highpass" | "lowpass" | "bandpass";
```

The biquad shapes `Dsp.biquad` builds.

***

### Region

```ts
type Region = [start: number, end: number];
```

A speech region in samples, end exclusive.

## Functions

### coverage()

```ts
function coverage(
   regions, 
   a, 
   b, 
   sampleRate?
): number;
```

Fraction of [a, b) seconds covered by regions given in samples.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `regions` | readonly [`Region`](#region)[] | `undefined` |
| `a` | `number` | `undefined` |
| `b` | `number` | `undefined` |
| `sampleRate?` | `number` | `16000` |

#### Returns

`number`

***

### crc32()

```ts
function crc32(b): number;
```

The CRC-32 of the bytes, as zip uses it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `Uint8Array` |

#### Returns

`number`

***

### decodeWav()

```ts
function decodeWav(bytes): object;
```

Parse PCM 8, 16, 24, 32 bit or float 32 WAV into channels.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `channels` | `Float32Array`\<`ArrayBufferLike`\>[] |
| `sampleRate` | `number` |

***

### encodeWav()

```ts
function encodeWav(
   channels, 
   sampleRate, 
   format?
): Uint8Array;
```

WAV bytes, interleaved. 16 bit PCM by default, or 32 bit float.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `channels` | readonly `Float32Array`\<`ArrayBufferLike`\>[] | `undefined` |
| `sampleRate` | `number` | `undefined` |
| `format?` | `"pcm16"` \| `"float32"` | `"pcm16"` |

#### Returns

`Uint8Array`

***

### fadeWeight()

```ts
function fadeWeight(
   i, 
   len, 
   fade
): number;
```

Crossfade weight of sample i in a segment of len samples.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | `number` |
| `len` | `number` |
| `fade` | `number` |

#### Returns

`number`

***

### gate()

```ts
function gate(
   db, 
   threshold, 
   nSamples, 
   o?
): Region[];
```

Speech regions from frame levels in dB: open after `on` frames above `threshold`, close after `off` below, then pad, merge and drop short ones.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `db` | `ArrayLike`\<`number`\> |
| `threshold` | `number` |
| `nSamples` | `number` |
| `o?` | [`GateOptions`](#gateoptions) |

#### Returns

[`Region`](#region)[]

***

### gateThreshold()

```ts
function gateThreshold(
   noiseDb, 
   loudDb, 
   marginDb?
): number;
```

Threshold from the floor: floor + margin, at least floor + 2, at most the 95th percentile minus 8 (as earlier builds did).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `noiseDb` | `number` | `undefined` |
| `loudDb` | `number` | `undefined` |
| `marginDb?` | `number` | `6` |

#### Returns

`number`

***

### loadDsp()

```ts
function loadDsp(src): Promise<Dsp>;
```

Instantiate the core from a URL, bytes, or the inlined base64 (`@hackbuild/audio-dsp/inline`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`CoreSource`](#coresource) |

#### Returns

`Promise`\<[`Dsp`](#dsp)\>

***

### lrcStamp()

```ts
function lrcStamp(sec): string;
```

mm:ss.xx

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sec` | `number` |

#### Returns

`string`

***

### parseLrc()

```ts
function parseLrc(text): Segment[];
```

Lines of an lrc file; a line's end is the next start, or start plus 0.07 s per character (at least 1.5 s).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

[`Segment`](#segment)[]

***

### planSegments()

```ts
function planSegments(
   total, 
   size, 
   overlap
): object;
```

Segment starts and lengths over `total` samples for a model that takes `size` samples, with the stride and fade that `overlap` (0 to 0.6) gives.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `total` | `number` |
| `size` | `number` |
| `overlap` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `fade` | `number` |
| `segments` | [`OlaSegment`](#olasegment)[] |
| `stride` | `number` |

***

### spreadWords()

```ts
function spreadWords(
   text, 
   start, 
   end
): Segment[];
```

Word timing spread across a line by character count (as earlier builds did).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `start` | `number` |
| `end` | `number` |

#### Returns

[`Segment`](#segment)[]

***

### timestamp()

```ts
function timestamp(t, comma): string;
```

hh:mm:ss,mmm (srt) or hh:mm:ss.mmm (vtt); milliseconds rounded, capped at 999.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `number` |
| `comma` | `boolean` |

#### Returns

`string`

***

### toJson()

```ts
function toJson(t): string;
```

The earlier transcription tool json export: times to 3 decimals, two space indent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`TranscriptJson`](#transcriptjson) |

#### Returns

`string`

***

### toLrc()

```ts
function toLrc(lines, title?): string;
```

Lrc lyrics: an optional `[ti:]` title line, then one `[mm:ss.xx]` line per segment start.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lines` | readonly [`Segment`](#segment)[] |
| `title?` | `string` |

#### Returns

`string`

***

### toSrt()

```ts
function toSrt(segs): string;
```

SubRip text: numbered cues with comma millisecond stamps.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Segment`](#segment)[] |

#### Returns

`string`

***

### toTxt()

```ts
function toTxt(segs): string;
```

Plain text; a gap over 2 s starts a paragraph.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Segment`](#segment)[] |

#### Returns

`string`

***

### toVtt()

```ts
function toVtt(segs): string;
```

WebVTT text: a WEBVTT header, dot millisecond stamps, and `&` and `<` escaped in cue text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Segment`](#segment)[] |

#### Returns

`string`

***

### unzipStore()

```ts
function unzipStore(zip): object[];
```

Reads a store only zip, as `zipStore` writes it, back into entries. The
central directory gives names and offsets; each entry's crc32 is checked.
Throws on a file that is no zip, a compressed entry, or a crc mismatch,
naming the entry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `zip` | `Uint8Array` |

#### Returns

`object`[]

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

***

### zipStore()

```ts
function zipStore(entries, date?): Uint8Array;
```

A store only zip (no compression), UTF-8 names. `date` sets the DOS time stamp; pass one for reproducible bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entries` | readonly `object`[] |
| `date?` | `Date` |

#### Returns

`Uint8Array`

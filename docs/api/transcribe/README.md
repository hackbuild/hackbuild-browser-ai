# @hackbuild/transcribe

## Classes

### LiveSegmenter

Cuts live audio blocks into 16 kHz speech segments, by the gate closing or by a fixed window, and hands each to `onSegment`.

#### Constructors

##### Constructor

```ts
new LiveSegmenter(opts): LiveSegmenter;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`LiveOptions`](#liveoptions) |

###### Returns

[`LiveSegmenter`](#livesegmenter)

#### Properties

| Property | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-dropped"></a> `dropped` | `number` | `0` |

#### Accessors

##### pending

###### Get Signature

```ts
get pending(): number;
```

###### Returns

`number`

#### Methods

##### done()

```ts
done(): void;
```

Call when a queued segment has been transcribed.

###### Returns

`void`

##### flush()

```ts
flush(): void;
```

Close the current segment now, e.g. when the stream stops.

###### Returns

`void`

##### push()

```ts
push(block, gateOpen?): void;
```

Feed a block; `gateOpen` is the squelch or VAD state for it (ignored in fixed mode).

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `block` | `Float32Array` | `undefined` |
| `gateOpen?` | `boolean` | `true` |

###### Returns

`void`

***

### StreamDecimator

A streaming FIR decimator that keeps its history across blocks.

#### Constructors

##### Constructor

```ts
new StreamDecimator(taps, factor): StreamDecimator;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `taps` | `Float64Array` |
| `factor` | `number` |

###### Returns

[`StreamDecimator`](#streamdecimator)

#### Methods

##### process()

```ts
process(x): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |

###### Returns

`Float32Array`

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

***

### StreamResampler

A streaming windowed sinc resampler for any rate ratio, so 44.1, 22.05
and 24 kHz input reach 16 kHz at the right speed. Zero phase: output
sample n sits at input time n * inRate / outRate. The kernel is a Hann
windowed sinc with `half` input taps each side, looked up from a table
of `phases` fractional offsets with linear interpolation.

#### Constructors

##### Constructor

```ts
new StreamResampler(
   inRate, 
   outRate?, 
   cutoffHz?, 
   half?, 
   phases?
): StreamResampler;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `inRate` | `number` | `undefined` |
| `outRate?` | `number` | `16000` |
| `cutoffHz?` | `number` | `7000` |
| `half?` | `number` | `16` |
| `phases?` | `number` | `256` |

###### Returns

[`StreamResampler`](#streamresampler)

#### Methods

##### process()

```ts
process(x): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |

###### Returns

`Float32Array`

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

***

### TranscriptImportError

Thrown when a file is not a transcript this reads; the message is the copy to show.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new TranscriptImportError(message?): TranscriptImportError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message?` | `string` |

###### Returns

[`TranscriptImportError`](#transcriptimporterror)

###### Inherited from

`Error.constructor`

##### Constructor

```ts
new TranscriptImportError(message?, options?): TranscriptImportError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message?` | `string` |
| `options?` | `ErrorOptions` |

###### Returns

[`TranscriptImportError`](#transcriptimporterror)

###### Inherited from

`Error.constructor`

#### Properties

| Property | Modifier | Type | Default value | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `readonly` | `"TranscriptImportError"` | `"TranscriptImportError"` | `Error.name` |

## Interfaces

### Analysis

What `analyze` finds: the cleaned signal, frame levels, speech regions, the noise print, levels and the gain.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-gain"></a> `gain` | `number` | - |
| <a id="property-noise"></a> `noise` | `Float32Array`\<`ArrayBufferLike`\> \| `null` | - |
| <a id="property-sig"></a> `sig` | `Float32Array` | - |
| <a id="property-stats"></a> `stats` | `object` | All levels in dB, computed. |
| `stats.density` | `number` | - |
| `stats.dur` | `number` | - |
| `stats.forced` | `boolean` | - |
| `stats.gainDb` | `number` | - |
| `stats.loudDb` | `number` | - |
| `stats.noiseDb` | `number` | - |
| `stats.snrDb` | `number` | - |
| `stats.speechDb` | `number` | - |
| `stats.thrDb` | `number` | - |
| <a id="property-vad"></a> `vad` | `Region`[] | - |
| <a id="property-vdb"></a> `vdb` | `Float32Array` | - |

***

### AsrOutput

The transformers.js ASR pipeline call shape.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-chunks"></a> `chunks?` | `object`[] |
| <a id="property-text"></a> `text?` | `string` |

***

### Decoded

Decoded audio: the sample rate and one Float32Array per channel.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-channels"></a> `channels` | `Float32Array`\<`ArrayBufferLike`\>[] |
| <a id="property-samplerate"></a> `sampleRate` | `number` |

***

### Dropped

A line the phantom filter dropped, with the reason.

#### Extends

- [`Seg`](#seg)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-confidence"></a> `confidence?` | `number` | 0 to 1, when the engine gives one. | [`Seg`](#seg).[`confidence`](#property-confidence-1) |
| <a id="property-edited"></a> `edited?` | `boolean` | Set when a person changed the text, speaker or times. | [`Seg`](#seg).[`edited`](#property-edited-1) |
| <a id="property-end"></a> `end` | `number` | - | [`Seg`](#seg).[`end`](#property-end-1) |
| <a id="property-speaker"></a> `speaker?` | `string` | Speaker label, set by hand; no diarization runs here. | [`Seg`](#seg).[`speaker`](#property-speaker-1) |
| <a id="property-start"></a> `start` | `number` | - | [`Seg`](#seg).[`start`](#property-start-1) |
| <a id="property-text-1"></a> `text` | `string` | - | [`Seg`](#seg).[`text`](#property-text-2) |
| <a id="property-why"></a> `why` | [`DropReason`](#dropreason) | - | - |
| <a id="property-words"></a> `words?` | [`Word`](#word)[] | - | [`Seg`](#seg).[`words`](#property-words-1) |

***

### FileLike

The parts of a File the queue reads: name, size and type.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-name-1"></a> `name` | `string` |
| <a id="property-size"></a> `size` | `number` |
| <a id="property-type"></a> `type` | `string` |

***

### FileMeta

Measured from the decoded audio. Levels in dBFS (computed), -90 for silence.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-channels-1"></a> `channels` | `number` | - |
| <a id="property-duration"></a> `duration` | `number` | Seconds. |
| <a id="property-peakdb"></a> `peakDb` | `number` | - |
| <a id="property-rmsdb"></a> `rmsDb` | `number` | - |
| <a id="property-samplerate-1"></a> `sampleRate` | `number` | The decoded rate, which is the file's own rate only when the decoder keeps it. |

***

### FileQueue

A file queue: add, list, start, stop, cancel and retry jobs.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-f"></a> `F` *extends* [`FileLike`](#filelike) |
| <a id="type-parameter-r"></a> `R` |

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-running"></a> `running` | `readonly` | `boolean` |

#### Methods

##### add()

```ts
add(files): object;
```

Adds what it accepts. Skipped files and large file warnings come back as ui lines.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | `Iterable`\<`F`\> |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `added` | [`Job`](#job)\<`F`, `R`\>[] |
| `skipped` | `string`[] |
| `warnings` | `string`[] |

##### cancel()

```ts
cancel(id): void;
```

Stops a running job (back to queued) or takes a waiting one off the list.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### get()

```ts
get(id): Job<F, R> | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

[`Job`](#job)\<`F`, `R`\> \| `undefined`

##### jobs()

```ts
jobs(): Job<F, R>[];
```

###### Returns

[`Job`](#job)\<`F`, `R`\>[]

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

##### retry()

```ts
retry(id): void;
```

Puts a failed or done job back to queued.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `number` |

###### Returns

`void`

##### start()

```ts
start(): Promise<void>;
```

Runs every queued and failed job in order; resolves when the queue stops or empties.

###### Returns

`Promise`\<`void`\>

##### stop()

```ts
stop(): void;
```

Stops after aborting the running job, which goes back to queued.

###### Returns

`void`

***

### FrontEndOptions

Front end settings: high pass corner, gate margin, silence skip, target level, gain cap, denoise strength and per reel levelling.

#### Extended by

- [`TranscribeOptions`](#transcribeoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-denoise"></a> `denoise?` | `0` \| `2` \| `1` \| `3` | Spectral gate strength 0 to 3. Default 2. |
| <a id="property-hp"></a> `hp?` | `number` | High pass corner in Hz; 0 turns it off. Default 80. |
| <a id="property-maxgaindb"></a> `maxGainDb?` | `number` | Largest lift in dB. Default 60. |
| <a id="property-perreelagc"></a> `perReelAgc?` | `boolean` | Level each reel again. Default true. |
| <a id="property-skipsilence"></a> `skipSilence?` | `boolean` | Gate the silence out. Default true. |
| <a id="property-targetdb"></a> `targetDb?` | `number` | Target speech level, dBFS. Default -20. |
| <a id="property-vadmargin"></a> `vadMargin?` | `number` | Gate margin over the floor in dB. Default 6. |

***

### ImportOptions

Settings for reading a transcript back.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-speakers"></a> `speakers?` | `boolean` | srt only: read a leading "name: " as the speaker, as asSrt writes it. Off by default, since a colon in a plain line would be taken for one. Labels are 1 to 32 characters with no colon or newline. |

***

### Job

One file in the queue: its state, phase, progress, measured levels, result and error line.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-f-1"></a> `F` *extends* [`FileLike`](#filelike) | [`FileLike`](#filelike) |
| <a id="type-parameter-r-1"></a> `R` | `unknown` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-error"></a> `error` | `string` \| `null` | A lowercase line naming the failure, when failed. |
| <a id="property-file"></a> `file` | `F` | - |
| <a id="property-id"></a> `id` | `number` | - |
| <a id="property-meta"></a> `meta` | [`FileMeta`](#filemeta) \| `null` | - |
| <a id="property-name-2"></a> `name` | `string` | - |
| <a id="property-phase"></a> `phase` | `"decoding"` \| `"working"` \| `null` | While running: "decoding", then "working". |
| <a id="property-progress"></a> `progress` | `number` | 0 to 1 while working, as the run reports it. |
| <a id="property-result"></a> `result` | `R` \| `null` | - |
| <a id="property-size-1"></a> `size` | `number` | - |
| <a id="property-state"></a> `state` | [`JobState`](#jobstate) | - |

***

### Language

A language for the select: a Whisper code or "auto", and a lowercase name.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `string` | Whisper language code, or "auto". |
| <a id="property-name-3"></a> `name` | `string` | Lowercase name for a select. |

***

### LanguageChoice

What a language select offers for a model, whether it is locked, its value and the reason.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-locked"></a> `locked` | `boolean` | The select is disabled and forced to english. |
| <a id="property-options"></a> `options` | readonly [`Language`](#language)[] | - |
| <a id="property-reason"></a> `reason` | `string` | Why the select is locked, as ui copy; empty when it is not. |
| <a id="property-value"></a> `value` | `string` | The value to show: the wanted code when allowed, else the first allowed. |

***

### LevelRail

Frame levels of a file with the floor, the gate threshold and which frames the gate kept, for drawing and regating.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-db"></a> `db` | `Float32Array` | Speech band level per frame, dBFS (computed). |
| <a id="property-duration-1"></a> `duration` | `number` | Seconds. |
| <a id="property-forced"></a> `forced` | `boolean` | Under 2 percent passed the gate, so the whole file was kept. |
| <a id="property-framesec"></a> `frameSec` | `number` | Seconds per frame step. |
| <a id="property-hop"></a> `hop` | `number` | Samples per frame step. |
| <a id="property-louddb"></a> `loudDb` | `number` | 95th percentile level, the threshold's upper bound, dBFS (computed). |
| <a id="property-margindb"></a> `marginDb` | `number` | - |
| <a id="property-noisedb"></a> `noiseDb` | `number` | Noise floor, dBFS (computed). |
| <a id="property-open"></a> `open` | `Uint8Array` | 1 where the gate kept the frame, 0 where silence was cut. |
| <a id="property-regions"></a> `regions` | `Region`[] | Kept regions in samples, end exclusive. |
| <a id="property-samplerate-2"></a> `sampleRate` | `number` | - |
| <a id="property-thr"></a> `thr` | `Float32Array` | Gate threshold per frame, dBFS (computed). One value today; per frame so a moving gate fits the same shape. |
| <a id="property-thrdb"></a> `thrDb` | `number` | Gate threshold, dBFS (computed). |

***

### LiveOptions

Live segmentation (as earlier builds did): audio arrives in blocks, is decimated to
16 kHz, and is cut into segments either when a gate closes for 500 ms
(squelch mode), at a fixed window (8 s with the squelch off, 2 to 12 s
in spirit box mode), or at 24 s, since Whisper pads to 30 s. Segments
under 0.7 s are dropped. At most 4 segments wait; later ones are counted
as dropped instead of growing a backlog.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-inputrate"></a> `inputRate?` | `number` | Input sample rate; 16000 passes through, integer multiples decimate, other rates resample. |
| <a id="property-maxs"></a> `maxS?` | `number` | - |
| <a id="property-mins"></a> `minS?` | `number` | - |
| <a id="property-mode"></a> `mode?` | `"squelch"` \| `"fixed"` | "squelch": cut when the gate closes; "fixed": cut every windowS. |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms. |
| <a id="property-onsegment"></a> `onSegment` | (`seg`) => `void` | - |
| <a id="property-queue"></a> `queue?` | `number` | Segments waiting before new ones are dropped. Default 4. |
| <a id="property-tailms"></a> `tailMs?` | `number` | - |
| <a id="property-windows"></a> `windowS?` | `number` | - |

***

### Manifest

The `manifest.json` that `bundle` writes into the zip.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-capture"></a> `capture` | `Record`\<`string`, `unknown`\> \| `null` | - |
| <a id="property-files"></a> `files` | [`ManifestFile`](#manifestfile)[] | - |
| <a id="property-generated"></a> `generated` | `string` | - |
| <a id="property-language"></a> `language` | `string` | The one language of every file, or "mixed". |
| <a id="property-model"></a> `model` | `string` | The one model of every file, or "mixed". |
| <a id="property-tool"></a> `tool` | `string` | - |

***

### ManifestFile

One source's row in `manifest.json`: its model, language and levels.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-dropped-1"></a> `dropped` | `number` |
| <a id="property-duration-2"></a> `duration` | `number` \| `null` |
| <a id="property-language-1"></a> `language` | `string` |
| <a id="property-levels"></a> `levels` | \| \{ `lift_db`: `number`; `noise_dbfs`: `number`; `realtime_factor`: `number`; `snr_db`: `number`; `speech_dbfs`: `number`; `speech_density`: `number`; \} \| `null` |
| <a id="property-lines"></a> `lines` | `number` |
| <a id="property-model-1"></a> `model` | `string` |
| <a id="property-outputs"></a> `outputs` | `string`[] |
| <a id="property-source"></a> `source` | `string` |

***

### MappedRun

A run's place in the reel audio and in the source, in samples.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-o0"></a> `o0` | `number` |
| <a id="property-o1"></a> `o1` | `number` |
| <a id="property-s0"></a> `s0` | `number` |
| <a id="property-s1"></a> `s1` | `number` |

***

### Materialized

A reel's audio, its source map and its length in seconds.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-audio"></a> `audio` | `Float32Array` | - |
| <a id="property-dur"></a> `dur` | `number` | Seconds. |
| <a id="property-runs"></a> `runs` | [`MappedRun`](#mappedrun)[] | - |

***

### QueueOptions

The queue's decoder, run, change callback and failure copy.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-f-2"></a> `F` *extends* [`FileLike`](#filelike) |
| <a id="type-parameter-r-2"></a> `R` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-decode"></a> `decode` | (`file`, `signal`) => `Promise`\<[`Decoded`](#decoded)\> | - |
| <a id="property-explain"></a> `explain?` | (`e`) => `string` | A lowercase line for a run failure. Default: "the run failed: \<message\>. press run to try again." |
| <a id="property-largebytes"></a> `largeBytes?` | `number` | Bytes over which a file gets a warning. Default 1.5e9 (vendor). |
| <a id="property-onchange"></a> `onChange?` | (`jobs`) => `void` | Called after every state change with a copy of the list. |
| <a id="property-run"></a> `run` | (`audio`, `ctx`) => `Promise`\<`R`\> | - |

***

### RailBins

A rail folded to bins: the loudest level and the kept share per bin.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-binsec"></a> `binSec` | `number` | Seconds per bin. |
| <a id="property-db-1"></a> `db` | `Float32Array` | Loudest frame per bin, dBFS. |
| <a id="property-kept"></a> `kept` | `Float32Array` | Share of the bin's frames the gate kept, 0 to 1. |

***

### Reel

Speech runs packed into one model call, and the total samples.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-runs-1"></a> `runs` | [`Run`](#run)[] |
| <a id="property-total"></a> `total` | `number` |

***

### Run

One speech run in a reel: source sample range and the silence before it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-pad"></a> `pad` | `number` | Silence before this run in the reel, samples. |
| <a id="property-s0-1"></a> `s0` | `number` | - |
| <a id="property-s1-1"></a> `s1` | `number` | - |

***

### Seg

One transcript line: start and end in seconds, its text, and optional speaker, confidence, words and edited mark.

#### Extended by

- [`Dropped`](#dropped)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-confidence-1"></a> `confidence?` | `number` | 0 to 1, when the engine gives one. |
| <a id="property-edited-1"></a> `edited?` | `boolean` | Set when a person changed the text, speaker or times. |
| <a id="property-end-1"></a> `end` | `number` | - |
| <a id="property-speaker-1"></a> `speaker?` | `string` | Speaker label, set by hand; no diarization runs here. |
| <a id="property-start-1"></a> `start` | `number` | - |
| <a id="property-text-2"></a> `text` | `string` | - |
| <a id="property-words-1"></a> `words?` | [`Word`](#word)[] | - |

***

### SpeechRecognitionLike

Web Speech recognition as a zero download path (Chrome sends audio to
its own service; say so in the UI). Final results become segments with
times from the clock, since the API gives none.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-continuous"></a> `continuous` | `boolean` |
| <a id="property-interimresults"></a> `interimResults` | `boolean` |
| <a id="property-lang"></a> `lang` | `string` |
| <a id="property-onend"></a> `onend` | (() => `void`) \| `null` |
| <a id="property-onerror"></a> `onerror` | ((`ev`) => `void`) \| `null` |
| <a id="property-onresult"></a> `onresult` | ((`ev`) => `void`) \| `null` |

#### Methods

##### start()

```ts
start(): void;
```

###### Returns

`void`

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

***

### TranscribeOptions

Transcribe settings: the front end ones plus model, language, phantom filter, signal, progress and scheduling.

#### Extends

- [`FrontEndOptions`](#frontendoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-denoise-1"></a> `denoise?` | `0` \| `2` \| `1` \| `3` | Spectral gate strength 0 to 3. Default 2. | [`FrontEndOptions`](#frontendoptions).[`denoise`](#property-denoise) |
| <a id="property-halluc"></a> `halluc?` | `boolean` | Run the phantom filter. Default true. | - |
| <a id="property-hp-1"></a> `hp?` | `number` | High pass corner in Hz; 0 turns it off. Default 80. | [`FrontEndOptions`](#frontendoptions).[`hp`](#property-hp) |
| <a id="property-language-2"></a> `language?` | `string` | Language code, or "auto". Ignored by english only models. | - |
| <a id="property-maxgaindb-1"></a> `maxGainDb?` | `number` | Largest lift in dB. Default 60. | [`FrontEndOptions`](#frontendoptions).[`maxGainDb`](#property-maxgaindb) |
| <a id="property-model-2"></a> `model?` | `string` | Use this record id instead of routing by capability. | - |
| <a id="property-now-1"></a> `now?` | () => `number` | Clock for realtime factor, in ms. | - |
| <a id="property-onprogress"></a> `onProgress?` | (`p`) => `void` | - | - |
| <a id="property-perreelagc-1"></a> `perReelAgc?` | `boolean` | Level each reel again. Default true. | [`FrontEndOptions`](#frontendoptions).[`perReelAgc`](#property-perreelagc) |
| <a id="property-schedule"></a> `schedule?` | `RunOptions` | Scheduling for each reel's run (minimum interval, idle only, frame time budget), for pages that also render. | - |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - | - |
| <a id="property-skipsilence-1"></a> `skipSilence?` | `boolean` | Gate the silence out. Default true. | [`FrontEndOptions`](#frontendoptions).[`skipSilence`](#property-skipsilence) |
| <a id="property-targetdb-1"></a> `targetDb?` | `number` | Target speech level, dBFS. Default -20. | [`FrontEndOptions`](#frontendoptions).[`targetDb`](#property-targetdb) |
| <a id="property-vadmargin-1"></a> `vadMargin?` | `number` | Gate margin over the floor in dB. Default 6. | [`FrontEndOptions`](#frontendoptions).[`vadMargin`](#property-vadmargin) |

***

### Transcript

A transcript: kept and dropped lines, stats, the level rail, model and language.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dropped-2"></a> `dropped` | [`Dropped`](#dropped)[] | - |
| <a id="property-language-3"></a> `language` | `string` | Language passed to the model: a code, "auto", or "en" for an english only model. |
| <a id="property-model-3"></a> `model` | `string` | Record id of the run, "" when no reel reached a model. |
| <a id="property-rail"></a> `rail` | [`LevelRail`](#levelrail) | The level rail: frame levels, floor and gate lines, kept frames. |
| <a id="property-segments"></a> `segments` | [`Seg`](#seg)[] | - |
| <a id="property-stats-1"></a> `stats` | `object` | - |
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

### TranscriptDoc

One file's transcript with what made it. A `Transcript` plus its source name fits.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dropped-3"></a> `dropped?` | readonly [`Dropped`](#dropped)[] | - |
| <a id="property-duration-3"></a> `duration?` | `number` | Seconds; falls back to stats.dur. |
| <a id="property-language-4"></a> `language` | `string` | - |
| <a id="property-model-4"></a> `model` | `string` | Record id of the run. |
| <a id="property-segments-1"></a> `segments` | readonly [`Seg`](#seg)[] | - |
| <a id="property-source-1"></a> `source` | `string` | File name the audio came from. |
| <a id="property-stats-2"></a> `stats?` | \| `Partial`\<\{ `density`: `number`; `dur`: `number`; `forced`: `boolean`; `gainDb`: `number`; `loudDb`: `number`; `noiseDb`: `number`; `reels`: `number`; `rtf`: `number`; `snrDb`: `number`; `speechDb`: `number`; `thrDb`: `number`; `wall`: `number`; \}\> \| `null` | - |

***

### WebSpeechOptions

Web Speech settings: language, interim results, callbacks and the recognizer constructor.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-interim"></a> `interim?` | `boolean` | - |
| <a id="property-lang-1"></a> `lang?` | `string` | - |
| <a id="property-now-2"></a> `now?` | () => `number` | - |
| <a id="property-onerror-1"></a> `onError?` | (`error`) => `void` | - |
| <a id="property-onsegment-1"></a> `onSegment` | (`s`) => `void` | - |
| <a id="property-recognition"></a> `Recognition?` | new () => [`SpeechRecognitionLike`](#speechrecognitionlike) | Constructor; default globalThis.SpeechRecognition or webkitSpeechRecognition. |

***

### Word

One timed word, seconds.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-confidence-2"></a> `confidence?` | `number` | 0 to 1, when the engine gives one. |
| <a id="property-end-2"></a> `end` | `number` | - |
| <a id="property-start-2"></a> `start` | `number` | - |
| <a id="property-text-3"></a> `text` | `string` | - |

## Type Aliases

### Asr

```ts
type Asr = (audio, opts) => Promise<AsrOutput>;
```

An ASR function: 16 kHz audio and call options in, text and timed chunks out.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `audio` | `Float32Array` |
| `opts` | `Record`\<`string`, `unknown`\> |

#### Returns

`Promise`\<[`AsrOutput`](#asroutput)\>

***

### DropReason

```ts
type DropReason = "empty" | "watermark" | "outro" | "phantom" | "loop" | "repeat";
```

Why the phantom filter dropped a line.

***

### JobState

```ts
type JobState = "queued" | "running" | "done" | "failed";
```

The file queue (as the earlier transcription tool ran it): files are
accepted by type or extension, a file over 1.5 GB (vendor, the earlier
tool's limit) gets a warning, and each job goes queued, running
(decoding, then working), done or failed. Decoding measures the file:
duration, sample rate, channels, peak and rms level. Stop puts the
running job back to queued; a failure keeps its line of copy. The
decoder and the run are injected, so a page passes `decodeAudio` and
`transcribe`, and a test passes stubs. Pass `humanError` from
`@hackbuild/devices` as `explain` for the shared failure copy; it is
injected so the queue does not pull the error tables into this bundle.

***

### TranscriptFormat

```ts
type TranscriptFormat = "json" | "srt" | "vtt";
```

The transcript formats `importTranscript` reads.

## Variables

### FRAME

```ts
const FRAME: 400 = 400;
```

The frame length in samples, 400 (25 ms at 16 kHz).

***

### HARD

```ts
const HARD: string[];
```

Watermark phrases the phantom filter always drops.

***

### HOP

```ts
const HOP: 160 = 160;
```

The frame hop in samples, 160 (10 ms at 16 kHz).

***

### SOFT

```ts
const SOFT: string[];
```

Stock outro phrases the phantom filter drops when the audio under them was mostly silence.

***

### SR

```ts
const SR: 16000 = 16000;
```

The front end sample rate, 16000 Hz.

***

### TRANSCRIBE\_RECORDS

```ts
const TRANSCRIBE_RECORDS: ModelRecord[];
```

The Whisper and Moonshine model records for the models hub.

***

### WEAK

```ts
const WEAK: Set<string>;
```

Weak one word lines the phantom filter drops when the audio under them was mostly silence.

***

### WHISPER\_LANGUAGES

```ts
const WHISPER_LANGUAGES: readonly Language[];
```

The earlier transcription tool's list, in its order, after auto detect.

## Functions

### acceptsFile()

```ts
function acceptsFile(f): boolean;
```

Audio or video by MIME type, or by one of the earlier tool's extensions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | `Pick`\<[`FileLike`](#filelike), `"name"` \| `"type"`\> |

#### Returns

`boolean`

***

### analyze()

```ts
function analyze(
   dsp, 
   raw, 
   opts?
): Analysis;
```

Run the front end on 16 kHz audio: clean it, gate it, take a noise print and pick a gain.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dsp` | `Dsp` |
| `raw` | `Float32Array` |
| `opts?` | [`FrontEndOptions`](#frontendoptions) |

#### Returns

[`Analysis`](#analysis)

***

### asJson()

```ts
function asJson(doc): string;
```

The json export: source, duration, model, language, stats, segments, dropped lines with the reason.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `doc` | [`TranscriptDoc`](#transcriptdoc) |

#### Returns

`string`

***

### asSrt()

```ts
function asSrt(segs): string;
```

SubRip text with speaker labels leading their lines.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Seg`](#seg)[] |

#### Returns

`string`

***

### asTxt()

```ts
function asTxt(segs): string;
```

Plain text with speaker labels leading their lines; a gap over 2 s starts a paragraph.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Seg`](#seg)[] |

#### Returns

`string`

***

### asVtt()

```ts
function asVtt(segs): string;
```

WebVTT text with speakers as voice tags and cue text escaped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `segs` | readonly [`Seg`](#seg)[] |

#### Returns

`string`

***

### attachTranscribe()

```ts
function attachTranscribe(hub): void;
```

Add the speech to text records to a hub's registry. The default transformers.js loader runs them.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |

#### Returns

`void`

***

### baseName()

```ts
function baseName(name): string;
```

A file name without its extension or folder, made safe for a zip entry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

#### Returns

`string`

***

### blockDb()

```ts
function blockDb(x): number;
```

Level of a block in dBFS (computed).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Float32Array` |

#### Returns

`number`

***

### bundle()

```ts
function bundle(docs, o?): object;
```

The zip of every document: txt, srt, vtt and json per source, and
`manifest.json` first. Two sources with one base name get "-2", "-3".
Pass `date` for reproducible bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `docs` | readonly [`TranscriptDoc`](#transcriptdoc)[] |
| `o?` | \{ `capture?`: `Record`\<`string`, `unknown`\> \| `null`; `date?`: `Date`; `tool?`: `string`; \} |
| `o.capture?` | `Record`\<`string`, `unknown`\> \| `null` |
| `o.date?` | `Date` |
| `o.tool?` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `manifest` | [`Manifest`](#manifest) |
| `zip` | `Uint8Array` |

***

### cleanup()

```ts
function cleanup<T>(
   segs, 
   vad, 
   on?, 
   sampleRate?
): object;
```

The phantom text filter: splits lines into kept and dropped, using the gate's speech regions to tell a real outro from one written over silence.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`Seg`](#seg) |

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `segs` | readonly `T`[] | `undefined` |
| `vad` | readonly `Region`[] | `undefined` |
| `on?` | `boolean` | `true` |
| `sampleRate?` | `number` | `16000` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `dropped` | [`Dropped`](#dropped)[] |
| `kept` | `T`[] |

***

### createQueue()

```ts
function createQueue<F, R>(o): FileQueue<F, R>;
```

A file queue that decodes, measures and runs each file in turn.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-f-3"></a> `F` *extends* [`FileLike`](#filelike) | - |
| <a id="type-parameter-r-3"></a> `R` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`QueueOptions`](#queueoptions)\<`F`, `R`\> |

#### Returns

[`FileQueue`](#filequeue)\<`F`, `R`\>

***

### defaultTranscribeId()

```ts
function defaultTranscribeId(webgpu): string;
```

The record earlier builds picked: turbo with a webgpu adapter, base.en without.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `webgpu` | `boolean` |

#### Returns

`string`

***

### englishOnly()

```ts
function englishOnly(model): boolean;
```

True for a record or repo id that only takes english: a note says so, or the id ends in `.en`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` \| `Pick`\<`ModelRecord`, `"notes"` \| `"source"`\> |

#### Returns

`boolean`

***

### finishReel()

```ts
function finishReel(
   dsp, 
   audio, 
   a, 
   opts?
): Float32Array;
```

Denoise, per reel AGC, gain and limit one materialized reel. Returns a new array.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dsp` | `Dsp` |
| `audio` | `Float32Array` |
| `a` | `Pick`\<[`Analysis`](#analysis), `"noise"` \| `"gain"`\> |
| `opts?` | [`FrontEndOptions`](#frontendoptions) |

#### Returns

`Float32Array`

***

### frontEndOptions()

```ts
function frontEndOptions(o?): Required<FrontEndOptions>;
```

The front end settings with every default filled in.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`FrontEndOptions`](#frontendoptions) |

#### Returns

`Required`\<[`FrontEndOptions`](#frontendoptions)\>

***

### importTranscript()

```ts
function importTranscript(
   name, 
   text, 
   o?
): TranscriptDoc & object;
```

Read a dropped transcript file into a document for editing. srt and
vtt carry no model or language, so those are empty; the source is the
file name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `text` | `string` |
| `o?` | [`ImportOptions`](#importoptions) |

#### Returns

[`TranscriptDoc`](#transcriptdoc) & `object`

***

### languagesFor()

```ts
function languagesFor(model, wanted?): LanguageChoice;
```

The language select for a model: what it may offer and what to show.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `model` | \| `string` \| `Pick`\<`ModelRecord`, `"notes"` \| `"source"` \| `"label"` \| `"id"`\> | `undefined` |
| `wanted?` | `string` | `"auto"` |

#### Returns

[`LanguageChoice`](#languagechoice)

***

### levelRail()

```ts
function levelRail(a, marginDb?): LevelRail;
```

The rail for an analysis from `analyze`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `a` | `Pick`\<[`Analysis`](#analysis), `"vdb"` \| `"vad"` \| `"stats"`\> | `undefined` |
| `marginDb?` | `number` | `6` |

#### Returns

[`LevelRail`](#levelrail)

***

### lowpassTaps()

```ts
function lowpassTaps(cutoff, taps): Float64Array;
```

Hann windowed sinc low pass taps with unit dc gain; cutoff as a fraction of the sample rate.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `cutoff` | `number` |
| `taps` | `number` |

#### Returns

`Float64Array`

***

### mapTime()

```ts
function mapTime(
   runs, 
   t, 
   sr?
): number;
```

Reel seconds to source seconds. Times in a gap map to the end of the run before it.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `runs` | readonly [`MappedRun`](#mappedrun)[] | `undefined` |
| `t` | `number` | `undefined` |
| `sr?` | `number` | `16000` |

#### Returns

`number`

***

### materialize()

```ts
function materialize(
   reel, 
   src, 
   lead, 
   sr?
): Materialized;
```

Build a reel's audio from the source with silence between runs, and the map back to source time.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `reel` | [`Reel`](#reel) | `undefined` |
| `src` | `Float32Array` | `undefined` |
| `lead` | `number` | `undefined` |
| `sr?` | `number` | `16000` |

#### Returns

[`Materialized`](#materialized)

***

### measure()

```ts
function measure(d): FileMeta;
```

Duration, rate, channels, and peak and rms over every channel.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `d` | [`Decoded`](#decoded) |

#### Returns

[`FileMeta`](#filemeta)

***

### packReels()

```ts
function packReels(
   regions, 
   db, 
   maxLen, 
   gapPad, 
   sr?, 
   hop?
): Reel[];
```

Pack speech regions into reels of at most `maxLen` samples, cutting long regions on a quiet frame.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `regions` | readonly `Region`[] | `undefined` |
| `db` | `ArrayLike`\<`number`\> | `undefined` |
| `maxLen` | `number` | `undefined` |
| `gapPad` | `number` | `undefined` |
| `sr?` | `number` | `16000` |
| `hop?` | `number` | `160` |

#### Returns

[`Reel`](#reel)[]

***

### parseSrt()

```ts
function parseSrt(text, o?): Seg[];
```

Segments from SubRip text; `{ speakers: true }` reads a leading "name: " as the speaker.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `o?` | [`ImportOptions`](#importoptions) |

#### Returns

[`Seg`](#seg)[]

***

### parseStamp()

```ts
function parseStamp(s): number;
```

Seconds from an srt or vtt stamp: hh:mm:ss,mmm, hh:mm:ss.mmm or mm:ss.mmm.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`number`

***

### parseTranscriptJson()

```ts
function parseTranscriptJson(text): TranscriptDoc;
```

Our json export (asJson, or the audio-dsp toJson layout) back to a document.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

[`TranscriptDoc`](#transcriptdoc)

***

### parseVtt()

```ts
function parseVtt(text): Seg[];
```

Segments from WebVTT text, with voice tags read as speakers.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

[`Seg`](#seg)[]

***

### railBins()

```ts
function railBins(rail, n): RailBins;
```

Frames folded to `n` bins, for a rail `n` pixels or bars wide.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rail` | [`LevelRail`](#levelrail) |
| `n` | `number` |

#### Returns

[`RailBins`](#railbins)

***

### regate()

```ts
function regate(rail, o?): LevelRail;
```

The rail with the gate run again at a new margin; the floor and levels stay.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rail` | [`LevelRail`](#levelrail) |
| `o?` | \{ `skipSilence?`: `boolean`; `vadMargin?`: `number`; \} |
| `o.skipSilence?` | `boolean` |
| `o.vadMargin?` | `number` |

#### Returns

[`LevelRail`](#levelrail)

***

### sniffTranscript()

```ts
function sniffTranscript(name, text): TranscriptFormat | null;
```

The format of a file, by its extension, else by its first characters.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `text` | `string` |

#### Returns

[`TranscriptFormat`](#transcriptformat) \| `null`

***

### stubAsr()

```ts
function stubAsr(text?): Asr;
```

A stub ASR: one chunk per reel reading "stub transcript, N s", with no weights.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text?` | `string` | `"stub transcript"` |

#### Returns

[`Asr`](#asr)

***

### toMono()

```ts
function toMono(channels, mode?): Float32Array;
```

Mono from a decoded buffer, as earlier builds chose it: one channel when it is 6 dB louder, else the channels within 20 dB of the loudest.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `channels` | readonly `Float32Array`\<`ArrayBufferLike`\>[] | `undefined` |
| `mode?` | `"auto"` \| `"mix"` \| `"L"` \| `"R"` | `"auto"` |

#### Returns

`Float32Array`

***

### toSixteenK()

```ts
function toSixteenK(rate): 
  | {
  process(x): Float32Array;
  reset(): void;
}
  | null;
```

The 16 kHz front stage for a microphone rate: null at 16 kHz, the FIR
decimator for an integer multiple, else the fractional resampler.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rate` | `number` |

#### Returns

  \| \{
  `process`(`x`): `Float32Array`;
  `reset`(): `void`;
\}
  \| `null`

***

### transcribe()

```ts
function transcribe(
   hub, 
   dsp, 
   pcm16k, 
   o?
): Promise<Transcript>;
```

Transcribe 16 kHz mono audio through the models hub, one ASR call per reel, with times in file seconds.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `dsp` | `Dsp` |
| `pcm16k` | `Float32Array` |
| `o?` | [`TranscribeOptions`](#transcribeoptions) |

#### Returns

`Promise`\<[`Transcript`](#transcript)\>

***

### transcribeStubs()

```ts
function transcribeStubs(): Record<string, (r) => unknown>;
```

Stub builders to merge into `stubFactory({...})` for `?stub` pages and tests.

#### Returns

`Record`\<`string`, (`r`) => `unknown`\>

***

### webSpeech()

```ts
function webSpeech(o): object;
```

Wrap the browser's speech recognizer; final results become segments timed by the clock.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`WebSpeechOptions`](#webspeechoptions) |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `start()` | () => `void` |
| `stop()` | () => `void` |

***

### webSpeechAvailable()

```ts
function webSpeechAvailable(g?): boolean;
```

True when the browser has a SpeechRecognition constructor.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `g?` | `Record`\<`string`, `unknown`\> |

#### Returns

`boolean`

# @hackbuild/speak

## Classes

### GaplessPlayer

Plays PCM chunks back to back on one AudioContext through one gain and one analyser.

#### Constructors

##### Constructor

```ts
new GaplessPlayer(ctx, o?): GaplessPlayer;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`AudioContextLike`](#audiocontextlike) |
| `o?` | [`PlayerOptions`](#playeroptions) |

###### Returns

[`GaplessPlayer`](#gaplessplayer)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-analyser"></a> `analyser` | `readonly` | [`AnalyserLike`](#analyserlike) |
| <a id="property-ctx"></a> `ctx` | `readonly` | [`AudioContextLike`](#audiocontextlike) |
| <a id="property-gain"></a> `gain` | `readonly` | [`AudioNodeLike`](#audionodelike) & `object` |

#### Accessors

##### endTime

###### Get Signature

```ts
get endTime(): number;
```

Context time when the last scheduled chunk ends.

###### Returns

`number`

##### playing

###### Get Signature

```ts
get playing(): boolean;
```

###### Returns

`boolean`

#### Methods

##### level()

```ts
level(): number;
```

RMS of the analyser's last window (computed), 0 when silent.

###### Returns

`number`

##### schedule()

```ts
schedule(
   samples, 
   rate, 
   fade?
): object;
```

Schedule one chunk. Fades are applied to a copy. Returns its context time span.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `samples` | `Float32Array` |
| `rate` | `number` |
| `fade?` | \{ `in?`: `boolean`; `out?`: `boolean`; \} |
| `fade.in?` | `boolean` |
| `fade.out?` | `boolean` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `end` | `number` |
| `start` | `number` |

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

***

### OfflineRenderError

Thrown when no engine in the chain can render offline. Its message is the copy to show; humanError in @hackbuild/devices returns it as is.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new OfflineRenderError(code, message): OfflineRenderError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | `"native"` \| `"failed"` |
| `message` | `string` |

###### Returns

[`OfflineRenderError`](#offlinerendererror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type | Default value | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `readonly` | `"native"` \| `"failed"` | `undefined` | - |
| <a id="property-name"></a> `name` | `readonly` | `"OfflineRenderError"` | `"OfflineRenderError"` | `Error.name` |

***

### SegmentCutter

Cuts a growing reply into segments for a voice. The first segment ends
at a clause once it is 24 characters long so speech starts early; later
segments end at sentences, or at the last clause or space before 160
characters. `take(full, final)` returns the segments completed since the
last call.

#### Constructors

##### Constructor

```ts
new SegmentCutter(o?): SegmentCutter;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`CutterOptions`](#cutteroptions) |

###### Returns

[`SegmentCutter`](#segmentcutter)

#### Methods

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

##### take()

```ts
take(full, final): Segment[];
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `full` | `string` |
| `final` | `boolean` |

###### Returns

[`Segment`](#segment)[]

***

### Speaker

Speaks a streaming reply through an engine chain and reports progress as offsets in your text.

#### Constructors

##### Constructor

```ts
new Speaker(o): Speaker;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`SpeakerOptions`](#speakeroptions) |

###### Returns

[`Speaker`](#speaker)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-player"></a> `player` | `readonly` | [`GaplessPlayer`](#gaplessplayer) |

#### Accessors

##### analyser

###### Get Signature

```ts
get analyser(): AnalyserLike;
```

The single analyser every PCM engine plays through.

###### Returns

[`AnalyserLike`](#analyserlike)

##### engine

###### Get Signature

```ts
get engine(): string | null;
```

The engine that spoke last.

###### Returns

`string` \| `null`

##### speaking

###### Get Signature

```ts
get speaking(): boolean;
```

###### Returns

`boolean`

##### utterance

###### Get Signature

```ts
get utterance(): number;
```

###### Returns

`number`

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### done()

```ts
done(): Promise<void>;
```

Resolves when nothing is queued, synthesizing or playing.

###### Returns

`Promise`\<`void`\>

##### feed()

```ts
feed(textSoFar, final?): number;
```

Feed the visible reply so far. After `final`, the next feed starts a new utterance.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `textSoFar` | `string` | `undefined` |
| `final?` | `boolean` | `false` |

###### Returns

`number`

##### level()

```ts
level(): number;
```

Output level for lip sync: analyser RMS for PCM engines, a boundary pulse for a native one (estimated).

###### Returns

`number`

##### render()

```ts
render(text, signal?): Promise<RenderedSpeech>;
```

Render a whole text offline on the speaker's engine chain, with its
voice settings, for "save wav". Engines marked failed are skipped;
native engines are skipped since they give no samples.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `signal?` | `AbortSignal` |

###### Returns

`Promise`\<[`RenderedSpeech`](#renderedspeech)\>

##### resetEngines()

```ts
resetEngines(): void;
```

Clear failure marks so every engine is tried again.

###### Returns

`void`

##### say()

```ts
say(text): Promise<void>;
```

Speak a whole text; resolves when its audio has played or it was stopped.

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

##### tick()

```ts
tick(): void;
```

Fire cues whose time has come and settle the speaking state. Runs on a timer unless tickMs is 0.

###### Returns

`void`

## Interfaces

### AnalyserLike

The part of an AnalyserNode a level or lip sync driver reads.

#### Extends

- [`AudioNodeLike`](#audionodelike)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-fftsize"></a> `fftSize` | `number` |

#### Methods

##### connect()

```ts
connect(n): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | [`AudioNodeLike`](#audionodelike) |

###### Returns

`unknown`

###### Inherited from

[`AudioNodeLike`](#audionodelike).[`connect`](#connect-1)

##### disconnect()?

```ts
disconnect?(): void;
```

###### Returns

`void`

###### Inherited from

[`AudioNodeLike`](#audionodelike).[`disconnect`](#disconnect-1)

##### getFloatTimeDomainData()

```ts
getFloatTimeDomainData(a): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `Float32Array` |

###### Returns

`void`

***

### AudioContextLike

The part of an AudioContext the player uses; tests pass a fake.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-currenttime"></a> `currentTime` | `readonly` | `number` |
| <a id="property-destination"></a> `destination` | `readonly` | [`AudioNodeLike`](#audionodelike) |
| <a id="property-samplerate"></a> `sampleRate` | `readonly` | `number` |
| <a id="property-state"></a> `state?` | `readonly` | `string` |

#### Methods

##### createAnalyser()

```ts
createAnalyser(): AnalyserLike;
```

###### Returns

[`AnalyserLike`](#analyserlike)

##### createBuffer()

```ts
createBuffer(
   channels, 
   length, 
   rate
): BufferLike;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `channels` | `number` |
| `length` | `number` |
| `rate` | `number` |

###### Returns

[`BufferLike`](#bufferlike)

##### createBufferSource()

```ts
createBufferSource(): SourceLike;
```

###### Returns

[`SourceLike`](#sourcelike)

##### createGain()

```ts
createGain(): AudioNodeLike & object;
```

###### Returns

[`AudioNodeLike`](#audionodelike) & `object`

##### resume()?

```ts
resume?(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

***

### AudioNodeLike

The part of an AudioNode the player connects.

#### Extended by

- [`AnalyserLike`](#analyserlike)
- [`SourceLike`](#sourcelike)

#### Methods

##### connect()

```ts
connect(n): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | [`AudioNodeLike`](#audionodelike) |

###### Returns

`unknown`

##### disconnect()?

```ts
disconnect?(): void;
```

###### Returns

`void`

***

### BellowsOptions

The bellows-voice loader, random source, voice, accent, sample rate and an optional render override.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-accent"></a> `accent?` | `string` | One of its accents by id. Default the engine's General American. |
| <a id="property-render"></a> `render?` | (`text`, `opts`, `signal`) => `Promise`\<[`BellowsRender`](#bellowsrender)\> | Replaces the in-thread render, e.g. with a call into a worker that runs renderSpeech. |
| <a id="property-rng"></a> `rng` | `Rng` | The injected random source; drawn once, for the seed. |
| <a id="property-runtime"></a> `runtime` | () => `Promise`\<[`BellowsVoiceModule`](#bellowsvoicemodule)\> | Loads bellows-voice/engine (it imports bellowsjs 0.5.x itself), e.g. through runtimeLoader. |
| <a id="property-samplerate-1"></a> `sampleRate?` | `number` | Default 48000. |
| <a id="property-voice"></a> `voice?` | `string` | A bellows-voice starter voice id. Default "narrator-female". |

***

### BellowsParts

The parts of bellowsjs 0.5 and bellows-voice 0.7 (index and /engine) `renderSpeechFrom` calls.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-bellows"></a> `bellows` | `object` |
| `bellows.internParam` | (`name`) => `number` |
| `bellows.registerBuiltins` | () => `void` |
| `bellows.registerEngine` | (`e`) => `void` |
| `bellows.renderOffline` | (`setup`, `o`) => `object` |
| <a id="property-engine"></a> `engine` | `object` |
| `engine.vocalEngine` | `unknown` |
| <a id="property-voice-1"></a> `voice` | `object` |
| `voice.VOCAL_PLAN_LEAD` | `number` |
| `voice.lyricsToSyllables` | (`text`, `o?`) => `unknown`[] |
| `voice.planSung` | (`notes`, `syllables`, `o?`) => `object` |
| `voice.resolveAccent` | (`a?`) => `object` |
| `voice.speechPlan` | (`syllables`, `o?`, `questions?`) => `object` |
| `voice.spellOut` | (`text`) => `string` |
| `voice.sungEvents` | (`plan`, `o`) => `object` |
| `voice.vocalGlideLead` | () => `number` |
| `voice.voicePreset` | (`id`) => \| \{ `params`: `Record`\<`string`, `number`\>; `speechHz`: `number`; \} \| `undefined` |

***

### BellowsRender

Samples, sample rate and phoneme spans from one bellows-voice render.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-samplerate-2"></a> `sampleRate` | `number` |
| <a id="property-samples"></a> `samples` | `Float32Array` |
| <a id="property-spans"></a> `spans` | [`BellowsSpan`](#bellowsspan)[] |

***

### BellowsRenderOptions

Voice, seed, sample rate, rate, pitch, accent and tail for one bellows-voice render.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-accent-1"></a> `accent?` | `string` |
| <a id="property-hz"></a> `hz?` | `number` |
| <a id="property-rate"></a> `rate?` | `number` |
| <a id="property-samplerate-3"></a> `sampleRate?` | `number` |
| <a id="property-seed"></a> `seed` | `string` |
| <a id="property-tail"></a> `tail?` | `number` |
| <a id="property-voice-2"></a> `voice?` | `string` |

***

### BellowsSpan

One timed sound, as bellows-voice's SungSpan, seconds from the segment start.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-end"></a> `end` | `number` |
| <a id="property-ipa"></a> `ipa` | `string` |
| <a id="property-start"></a> `start` | `number` |

***

### BellowsVoiceModule

The part of `bellows-voice/engine` this adapter calls.

#### Methods

##### renderSpeech()

```ts
renderSpeech(text, opts): BellowsRender;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `opts` | [`BellowsRenderOptions`](#bellowsrenderoptions) |

###### Returns

[`BellowsRender`](#bellowsrender)

***

### BufferLike

The part of an AudioBuffer the player fills.

#### Methods

##### getChannelData()

```ts
getChannelData(c): Float32Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | `number` |

###### Returns

`Float32Array`

***

### CloneOptions

Voice clone reference preparation: mono in, linear resample to 24 kHz,
cut to 15 s, peak normalized to 0.9 (earlier builds' settings). The
reference audio is always the caller's; this package ships none.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-peak"></a> `peak?` | `number` |
| <a id="property-rate-1"></a> `rate?` | `number` |
| <a id="property-seconds"></a> `seconds?` | `number` |

***

### CutterOptions

Where SegmentCutter may end the first segment and how long later ones may grow.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-firstclause"></a> `firstClause?` | `number` | The first segment may end at a clause boundary once this long. Default 24. |
| <a id="property-maxchars"></a> `maxChars?` | `number` | Later segments wait for a sentence end unless longer than this. Default 160. |

***

### EngineStatus

A status line from an engine: loading, ready, failed, a missed patch, a watchdog trip or its licence.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-engine-1"></a> `engine` | `string` |
| <a id="property-kind"></a> `kind` | `"loading"` \| `"ready"` \| `"failed"` \| `"patch-missed"` \| `"watchdog"` \| `"licence"` |
| <a id="property-progress"></a> `progress?` | `number` |
| <a id="property-text"></a> `text` | `string` |

***

### KokoroModule

The parts of kokoro-js this adapter calls (kokoro-js 1.2.1).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-kokorotts"></a> `KokoroTTS` | `object` |
| `KokoroTTS.from_pretrained` | (`id`, `o`) => `Promise`\<\{ `voices?`: `Record`\<`string`, `unknown`\>; `generate`(`text`, `o`): `Promise`\<\{ `audio`: `Float32Array`; `sampling_rate`: `number`; \}\>; `list_voices?`(): `unknown`; \}\> |

***

### KokoroOptions

The kokoro-js loader, model id, device, voice and the GPL phonemizer opt in for kokoroEngine.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-allowgplphonemizer"></a> `allowGplPhonemizer?` | `boolean` | kokoro-js phonemizes through eSpeak NG, which is GPL-3.0-or-later. The engine refuses to load until the caller sets this, after reading KOKORO_GPL_NOTICE. No non-GPL phonemizer for kokoro-js is known on 2026-11-23. |
| <a id="property-device"></a> `device?` | `"webgpu"` \| `"wasm"` | "webgpu" runs fp32, "wasm" runs q8 (webgpu with q8 gave garbled audio in an earlier build). Default wasm. |
| <a id="property-model"></a> `model?` | `string` | onnx-community/Kokoro-82M-v1.0-ONNX, weights Apache-2.0. |
| <a id="property-runtime-1"></a> `runtime` | () => `Promise`\<[`KokoroModule`](#kokoromodule)\> | Loads kokoro-js, e.g. runtimeLoader(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]) from @hackbuild/devices. |
| <a id="property-voice-3"></a> `voice?` | `string` | - |

***

### LoadContext

The abort signal and status callback passed to an engine's load.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-onstatus"></a> `onStatus?` | (`s`) => `void` |
| <a id="property-signal"></a> `signal?` | `AbortSignal` |

***

### NativeEngine

An engine that plays through the platform itself and reports word boundaries.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-id"></a> `id` | `readonly` | `string` | - |
| <a id="property-kind-1"></a> `kind` | `readonly` | `"native"` | - |
| <a id="property-licence"></a> `licence` | `readonly` | `string` | - |
| <a id="property-offline"></a> `offline?` | `readonly` | `false` | Always false: a native engine plays through the platform and hands back no samples. |

#### Methods

##### load()

```ts
load(ctx): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`LoadContext`](#loadcontext) |

###### Returns

`Promise`\<`void`\>

##### speak()

```ts
speak(
   text, 
   cfg, 
   hooks, 
   signal
): Promise<void>;
```

Speak and resolve when done. onBoundary gets character offsets in `text`;
onStart fires when the platform says audio started, when it says so.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `cfg` | [`VoiceConfig`](#voiceconfig) |
| `hooks` | \{ `onBoundary`(`charIndex`, `charLength?`): `void`; `onStart?`(): `void`; \} |
| `hooks.onBoundary` | (`charIndex`, `charLength?`) => `void` |
| `hooks.onStart?` | () => `void` |
| `signal` | `AbortSignal` |

###### Returns

`Promise`\<`void`\>

##### stop()

```ts
stop(): void;
```

###### Returns

`void`

##### voices()?

```ts
voices?(): string[];
```

###### Returns

`string`[]

***

### PcmChunk

A run of samples from a PCM engine, with any word or phoneme times inside it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-phonemes"></a> `phonemes?` | [`Timed`](#timed)[] | - |
| <a id="property-samplerate-4"></a> `sampleRate` | `number` | - |
| <a id="property-samples-1"></a> `samples` | `Float32Array` | - |
| <a id="property-words"></a> `words?` | [`Timed`](#timed)[] | Timings inside this chunk, times relative to the chunk start. |

***

### PcmEngine

An engine that yields samples for the shared player.

#### Extended by

- [`PocketEngine`](#pocketengine)

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-id-1"></a> `id` | `readonly` | `string` | - |
| <a id="property-kind-2"></a> `kind` | `readonly` | `"pcm"` | - |
| <a id="property-licence-1"></a> `licence` | `readonly` | `string` | Weight licence, stated on first load. |
| <a id="property-offline-1"></a> `offline?` | `readonly` | `boolean` | Renders to a buffer for "save wav". PCM engines can unless this is false. |

#### Methods

##### dispose()?

```ts
dispose?(): void;
```

###### Returns

`void`

##### load()

```ts
load(ctx): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`LoadContext`](#loadcontext) |

###### Returns

`Promise`\<`void`\>

##### synth()

```ts
synth(
   text, 
   cfg, 
   signal
): AsyncIterable<PcmChunk>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `cfg` | [`VoiceConfig`](#voiceconfig) |
| `signal` | `AbortSignal` |

###### Returns

`AsyncIterable`\<[`PcmChunk`](#pcmchunk)\>

##### voices()?

```ts
voices?(): string[];
```

###### Returns

`string`[]

***

### PlayerOptions

Scheduling lead and fade length for the gapless player.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fade"></a> `fade?` | `number` | Fade length in samples at the start and end of each segment. Default 96. |
| <a id="property-lead"></a> `lead?` | `number` | Seconds ahead of now for a chunk that starts after a gap. Default 0.04. |

***

### PocketEngine

A PCM engine for Pocket TTS that can also clone a voice from a reference you supply.

#### Extends

- [`PcmEngine`](#pcmengine)

#### Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-id-2"></a> `id` | `readonly` | `string` | - | [`PcmEngine`](#pcmengine).[`id`](#property-id-1) |
| <a id="property-kind-3"></a> `kind` | `readonly` | `"pcm"` | - | [`PcmEngine`](#pcmengine).[`kind`](#property-kind-2) |
| <a id="property-licence-2"></a> `licence` | `readonly` | `string` | Weight licence, stated on first load. | [`PcmEngine`](#pcmengine).[`licence`](#property-licence-1) |
| <a id="property-offline-2"></a> `offline?` | `readonly` | `boolean` | Renders to a buffer for "save wav". PCM engines can unless this is false. | [`PcmEngine`](#pcmengine).[`offline`](#property-offline-1) |
| <a id="property-samplerate-5"></a> `sampleRate` | `readonly` | `number` | - | - |

#### Methods

##### cloneVoice()

```ts
cloneVoice(samples, rate): Promise<void>;
```

Encode a caller supplied reference (any rate, mono) as voice "custom". Nothing is stored or bundled here.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `samples` | `Float32Array` |
| `rate` | `number` |

###### Returns

`Promise`\<`void`\>

##### dispose()?

```ts
dispose?(): void;
```

###### Returns

`void`

###### Inherited from

[`PcmEngine`](#pcmengine).[`dispose`](#dispose-1)

##### load()

```ts
load(ctx): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`LoadContext`](#loadcontext) |

###### Returns

`Promise`\<`void`\>

###### Inherited from

[`PcmEngine`](#pcmengine).[`load`](#load-1)

##### synth()

```ts
synth(
   text, 
   cfg, 
   signal
): AsyncIterable<PcmChunk>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `cfg` | [`VoiceConfig`](#voiceconfig) |
| `signal` | `AbortSignal` |

###### Returns

`AsyncIterable`\<[`PcmChunk`](#pcmchunk)\>

###### Inherited from

[`PcmEngine`](#pcmengine).[`synth`](#synth)

##### voices()?

```ts
voices?(): string[];
```

###### Returns

`string`[]

###### Inherited from

[`PcmEngine`](#pcmengine).[`voices`](#voices-1)

***

### PocketOptions

Build base, hashes, patch strictness, chunk gap, load timeout, voice and worker spawn options for pocketEngine.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-base"></a> `base?` | `string` | - |
| <a id="property-chunkgapsec"></a> `chunkGapSec?` | `number` | - |
| <a id="property-cleartimeout"></a> `clearTimeout?` | (`h`) => `void` | - |
| <a id="property-loadtimeoutms"></a> `loadTimeoutMs?` | `number` | How long to wait for `loaded`. Default 420 s (earlier builds' figure). |
| <a id="property-settimeout"></a> `setTimeout?` | (`fn`, `ms`) => `unknown` | Timer for the load timeout. |
| <a id="property-sha256"></a> `sha256?` | `object` | SHA-256 of inference-worker.js and sentencepiece.js. Default POCKET_SHA256 for the default base. With another base and no hashes the scripts run unchecked, which the load reports. |
| `sha256.sentencepiece` | `string` | - |
| `sha256.worker` | `string` | - |
| <a id="property-spawn"></a> `spawn?` | `Omit`\<`SpawnOptions`, `"rewrites"` \| `"prelude"` \| `"onMissed"`\> | Passed to spawnWorker: worker constructor, fetch, rung order (default classic-blob first). |
| <a id="property-strictpatches"></a> `strictPatches?` | `boolean` | Fail the load when a rewrite matched nothing. Default true. |
| <a id="property-voice-4"></a> `voice?` | `string` | - |

***

### Progress

How far the voice has got, as an offset in the utterance's input text.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-estimated"></a> `estimated` | `boolean` | Word times guessed from text length, not reported by the engine. |
| <a id="property-kind-4"></a> `kind` | `"word"` \| `"segment"` \| `"end"` | - |
| <a id="property-offset"></a> `offset` | `number` | Offset in the utterance's input text. |
| <a id="property-utterance"></a> `utterance` | `number` | - |

***

### RenderedSpeech

A whole text rendered to mono samples, with the engine name and word and phoneme times.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-duration"></a> `duration` | `number` | Seconds, computed from the sample count. |
| <a id="property-engine-2"></a> `engine` | `string` | The engine that rendered it. |
| <a id="property-phonemes-1"></a> `phonemes` | [`RenderedTimed`](#renderedtimed)[] | - |
| <a id="property-samplerate-6"></a> `sampleRate` | `number` | - |
| <a id="property-samples-2"></a> `samples` | `Float32Array` | Mono samples at `sampleRate`. |
| <a id="property-words-1"></a> `words` | [`RenderedTimed`](#renderedtimed)[] | - |

***

### RenderedTimed

A word or phoneme in a render: offsets in the input text, times in seconds from the start of the buffer.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end-1"></a> `end` | `number` | - |
| <a id="property-estimated-1"></a> `estimated` | `boolean` | Guessed from text length because the engine reported no word times. |
| <a id="property-phoneme"></a> `phoneme?` | `string` | - |
| <a id="property-start-1"></a> `start` | `number` | - |
| <a id="property-t0"></a> `t0` | `number` | - |
| <a id="property-t1"></a> `t1` | `number` | - |

***

### RenderOptions

Voice settings, text options, segment gap, abort signal and a skip callback for renderSpeech.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cutter"></a> `cutter?` | [`CutterOptions`](#cutteroptions) | - |
| <a id="property-gap"></a> `gap?` | `number` | Silence between segments, seconds. Default 0.08. |
| <a id="property-signal-1"></a> `signal?` | `AbortSignal` | - |
| <a id="property-speakable"></a> `speakable?` | [`SpeakableOptions`](#speakableoptions) | - |
| <a id="property-voice-5"></a> `voice?` | [`VoiceConfig`](#voiceconfig) | - |
| <a id="property-voices"></a> `voices?` | `Record`\<`string`, [`VoiceConfig`](#voiceconfig)\> | Per voice settings by engine id, merged over `voice`. |

#### Methods

##### onSkip()?

```ts
onSkip?(engine, reason): void;
```

Called with each engine that is skipped and why, for a status line.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `engine` | `string` |
| `reason` | `string` |

###### Returns

`void`

***

### Segment

One cut of the reply: its index, its text and its offsets in the input.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end-2"></a> `end` | `number` | - |
| <a id="property-index"></a> `index` | `number` | - |
| <a id="property-start-2"></a> `start` | `number` | Offsets in the input text. |
| <a id="property-text-1"></a> `text` | `string` | The input text of this segment. |

***

### SourceLike

The part of an AudioBufferSourceNode the player schedules.

#### Extends

- [`AudioNodeLike`](#audionodelike)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-buffer"></a> `buffer` | [`BufferLike`](#bufferlike) \| `null` |
| <a id="property-onended"></a> `onended` | ((`ev`) => `unknown`) \| `null` |

#### Methods

##### connect()

```ts
connect(n): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `n` | [`AudioNodeLike`](#audionodelike) |

###### Returns

`unknown`

###### Inherited from

[`AudioNodeLike`](#audionodelike).[`connect`](#connect-1)

##### disconnect()?

```ts
disconnect?(): void;
```

###### Returns

`void`

###### Inherited from

[`AudioNodeLike`](#audionodelike).[`disconnect`](#disconnect-1)

##### start()

```ts
start(when): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `when` | `number` |

###### Returns

`void`

##### stop()

```ts
stop(when?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `when?` | `number` |

###### Returns

`void`

***

### Speakable

Text for a voice: what to say and where each spoken character came
from. Offsets are kept in the caller's text (the visible reply, with
action tags already removed), so lip sync and action cues share one
coordinate space with the tag parser in @hackbuild/structured.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-map"></a> `map` | `Int32Array` | map[i] is the offset in the input of output character i; map[text.length] is the input length. |
| <a id="property-text-2"></a> `text` | `string` | Text to send to an engine. |

***

### SpeakableOptions

A lexicon of whole word replacements and the word read in place of a bare URL.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-lexicon"></a> `lexicon?` | `Record`\<`string`, `string`\> | Whole word replacements, e.g. \{ "hack.build": "hack dot build", AuDHD: "A U D H D" \}. |
| <a id="property-url"></a> `url?` | `string` | Word read in place of a bare URL. Default "link". |

***

### SpeakerOptions

The audio context, engine chain, voice settings and callbacks for a speaker.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cachesamples"></a> `cacheSamples?` | `number` | Cache size in samples. Default 3 minutes at 24 kHz. 0 turns it off. |
| <a id="property-ctx-1"></a> `ctx` | [`AudioContextLike`](#audiocontextlike) | - |
| <a id="property-cutter-1"></a> `cutter?` | [`CutterOptions`](#cutteroptions) | - |
| <a id="property-engines"></a> `engines` | [`Engine`](#engine-1)[] | Tried in order; a failed engine is skipped until resetEngines(). |
| <a id="property-player-1"></a> `player?` | [`PlayerOptions`](#playeroptions) | - |
| <a id="property-speakable-1"></a> `speakable?` | [`SpeakableOptions`](#speakableoptions) | - |
| <a id="property-tickms"></a> `tickMs?` | `number` | Call tick() every this many ms. Default 25; 0 means the caller calls tick() (per frame or in tests). |
| <a id="property-timers"></a> `timers?` | [`Timers`](#timers) | - |
| <a id="property-voice-6"></a> `voice?` | [`VoiceConfig`](#voiceconfig) | - |
| <a id="property-voices-1"></a> `voices?` | `Record`\<`string`, [`VoiceConfig`](#voiceconfig)\> | Per voice settings by engine id, merged over `voice`. |
| <a id="property-watchdogms"></a> `watchdogMs?` | `number` | No audio from an engine for this long moves to the next engine. Default 45000 ms. |

#### Methods

##### onProgress()?

```ts
onProgress?(p): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`Progress`](#progress) |

###### Returns

`void`

##### onSegment()?

```ts
onSegment?(s): void;
```

A segment starts on an engine; `cached` is true when its audio is a replay from the PCM cache.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`Segment`](#segment) & `object` |

###### Returns

`void`

##### onSpeaking()?

```ts
onSpeaking?(speaking): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `speaking` | `boolean` |

###### Returns

`void`

##### onStatus()?

```ts
onStatus?(s): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`EngineStatus`](#enginestatus) |

###### Returns

`void`

##### onTimed()?

```ts
onTimed?(t): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | [`TimedEvent`](#timedevent) |

###### Returns

`void`

***

### SynthLike

The parts of the Web Speech synthesis API used here.

#### Methods

##### cancel()

```ts
cancel(): void;
```

###### Returns

`void`

##### getVoices()

```ts
getVoices(): object[];
```

###### Returns

`object`[]

##### speak()

```ts
speak(u): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `u` | [`UtteranceLike`](#utterancelike) |

###### Returns

`void`

***

### Timed

A word or phoneme with its span in the text the engine was given and its time from the start of that text's audio, in seconds.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end-3"></a> `end` | `number` | - |
| <a id="property-phoneme-1"></a> `phoneme?` | `string` | A phoneme symbol when the engine reports phonemes. |
| <a id="property-start-3"></a> `start` | `number` | - |
| <a id="property-t0-1"></a> `t0` | `number` | - |
| <a id="property-t1-1"></a> `t1` | `number` | - |

***

### TimedEvent

A word or phoneme placed on the audio clock, for lip sync.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-end-4"></a> `end` | `number` | - |
| <a id="property-estimated-2"></a> `estimated` | `boolean` | - |
| <a id="property-kind-5"></a> `kind` | `"word"` \| `"phoneme"` | - |
| <a id="property-phoneme-2"></a> `phoneme?` | `string` | - |
| <a id="property-start-4"></a> `start` | `number` | - |
| <a id="property-t0-2"></a> `t0` | `number` | AudioContext times; for a native engine the boundary time with no end known (t1 = t0). |
| <a id="property-t1-2"></a> `t1` | `number` | - |
| <a id="property-utterance-1"></a> `utterance` | `number` | - |

***

### Timers

The timer functions the speaker uses; tests pass fakes.

#### Methods

##### clearTimeout()

```ts
clearTimeout(h): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | `unknown` |

###### Returns

`void`

##### setTimeout()

```ts
setTimeout(fn, ms): unknown;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | () => `void` |
| `ms` | `number` |

###### Returns

`unknown`

***

### UtteranceLike

The part of SpeechSynthesisUtterance the system voice engine sets.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-onboundary"></a> `onboundary` | ((`ev`) => `void`) \| `null` |
| <a id="property-onend"></a> `onend` | (() => `void`) \| `null` |
| <a id="property-onerror"></a> `onerror` | ((`ev`) => `void`) \| `null` |
| <a id="property-onstart"></a> `onstart?` | (() => `void`) \| `null` |
| <a id="property-pitch"></a> `pitch` | `number` |
| <a id="property-rate-2"></a> `rate` | `number` |
| <a id="property-text-3"></a> `text` | `string` |
| <a id="property-voice-7"></a> `voice` | \| \{ `lang`: `string`; `name`: `string`; \} \| `null` |

***

### VoiceConfig

Engine contracts. A PCM engine yields audio for the shared player; a native engine plays itself.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-pitch-1"></a> `pitch?` | `number` | - |
| <a id="property-rate-3"></a> `rate?` | `number` | 1 is the engine's normal speed. |
| <a id="property-voice-8"></a> `voice?` | `string` | - |

## Type Aliases

### Engine

```ts
type Engine = PcmEngine | NativeEngine;
```

Any engine the speaker can chain: PCM or native.

## Variables

### BELLOWS\_VOICES

```ts
const BELLOWS_VOICES: readonly ["narrator-female", "narrator-male", "child", "bass", "baritone", "tenor", "contralto", "mezzo", "soprano", "pop-female", "pop-male", "rock", "elder", "beatboxer"];
```

The starter voices of bellows-voice 0.8.0 (VOICE_PRESETS ids).

***

### KOKORO\_GPL\_NOTICE

```ts
const KOKORO_GPL_NOTICE: "kokoro-js phonemizes with the phonemizer package, which is eSpeak NG compiled to wasm under GPL-3.0-or-later. it loads from your url at run time and is never bundled into this MIT package; an app that ships kokoro-js takes on the GPL terms." = "kokoro-js phonemizes with the phonemizer package, which is eSpeak NG compiled to wasm under GPL-3.0-or-later. it loads from your url at run time and is never bundled into this MIT package; an app that ships kokoro-js takes on the GPL terms.";
```

What loading kokoro-js brings in, stated before it loads.

***

### OFFLINE\_RENDER\_REFUSAL

```ts
const OFFLINE_RENDER_REFUSAL: "the system voice plays live and gives no audio to save. pick bellows or pocket to save a wav." = "the system voice plays live and gives no audio to save. pick bellows or pocket to save a wav.";
```

The system voice plays through the platform and hands back no samples.

***

### POCKET\_SPACE\_BASE

```ts
const POCKET_SPACE_BASE: "https://huggingface.co/spaces/KevinAHM/pocket-tts-web/resolve/d0c0c79b7712256a32d691c67f20b8ae2e020d00/";
```

The community build at that commit. A caller may pass another base, with its own hashes.

***

### SPEAK\_RECORDS

```ts
const SPEAK_RECORDS: ModelRecord[];
```

Model records for the voices this package drives, for pickers and the models registry.

## Functions

### bellowsEngine()

```ts
function bellowsEngine(o): PcmEngine;
```

The bellows-voice articulatory voice as a PCM engine, with no weights and exact phoneme times.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`BellowsOptions`](#bellowsoptions) |

#### Returns

[`PcmEngine`](#pcmengine)

***

### canRender()

```ts
function canRender(e): e is PcmEngine;
```

Whether an engine can render to a buffer: PCM engines can unless they say otherwise, native ones cannot.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | [`Engine`](#engine-1) |

#### Returns

`e is PcmEngine`

***

### createSpeaker()

```ts
function createSpeaker(o): Speaker;
```

Makes a Speaker from its options.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`SpeakerOptions`](#speakeroptions) |

#### Returns

[`Speaker`](#speaker)

***

### estimateWordTimes()

```ts
function estimateWordTimes(text, duration): object[];
```

Estimated word times for an engine that gives none: each word gets a
share of the duration by its character count plus one for the gap.
Marked estimated wherever it is reported.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `duration` | `number` |

#### Returns

`object`[]

***

### kokoroEngine()

```ts
function kokoroEngine(o): PcmEngine;
```

Kokoro 82M, opt in: see KOKORO_GPL_NOTICE. Whole segments are generated at once; word times are
estimated from the segment length by the speaker, since kokoro-js
reports none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`KokoroOptions`](#kokorooptions) |

#### Returns

[`PcmEngine`](#pcmengine)

***

### pocketEngine()

```ts
function pocketEngine(o?): PocketEngine;
```

Pocket TTS (weights CC-BY-4.0) in a patched worker from the pinned community browser build.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`PocketOptions`](#pocketoptions) |

#### Returns

[`PocketEngine`](#pocketengine)

***

### pocketPrelude()

```ts
function pocketPrelude(sentencepieceSource): string;
```

Prelude that imports the checked sentencepiece.js text from a Blob URL, falling back to a data: URL.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sentencepieceSource` | `string` |

#### Returns

`string`

***

### pocketRewrites()

```ts
function pocketRewrites(base, chunkGapSec?): Rewrite[];
```

The four rewrites, in order: sentencepiece import, chunk gap, one wasm thread with no proxy, absolute relative paths.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `base` | `string` | `undefined` |
| `chunkGapSec?` | `number` | `0.1` |

#### Returns

`Rewrite`[]

***

### prepareClone()

```ts
function prepareClone(
   samples, 
   rate, 
   o?
): Float32Array;
```

Resamples a mono voice reference to 24 kHz, cuts it to 15 s and normalizes its peak to 0.9, by default.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `samples` | `Float32Array` |
| `rate` | `number` |
| `o?` | [`CloneOptions`](#cloneoptions) |

#### Returns

`Float32Array`

***

### renderedBuffer()

```ts
function renderedBuffer<B>(ctx, r): B;
```

The render as an AudioBuffer (or the context's buffer type) at the render's rate.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-b"></a> `B` *extends* [`BufferLike`](#bufferlike) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | \{ `createBuffer`(`channels`, `length`, `rate`): `B`; \} |
| `ctx.createBuffer` | (`channels`, `length`, `rate`) => `B` |
| `r` | [`RenderedSpeech`](#renderedspeech) |

#### Returns

`B`

***

### renderedTiming()

```ts
function renderedTiming(r, text): object;
```

Word and phoneme times as json for the lipsync tool and "export word timing".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`RenderedSpeech`](#renderedspeech) |
| `text` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `duration` | `number` |
| `engine` | `string` |
| `phonemes` | [`RenderedTimed`](#renderedtimed)[] |
| `sampleRate` | `number` |
| `words` | ([`RenderedTimed`](#renderedtimed) & `object`)[] |

***

### renderedWav()

```ts
function renderedWav(r): Blob;
```

The render as a wav Blob for "save wav".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`RenderedSpeech`](#renderedspeech) |

#### Returns

`Blob`

***

### renderedWavBytes()

```ts
function renderedWavBytes(r): Uint8Array;
```

The render as 16 bit wav bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`RenderedSpeech`](#renderedspeech) |

#### Returns

`Uint8Array`

***

### renderSpeech()

```ts
function renderSpeech(
   engines, 
   text, 
   o?
): Promise<RenderedSpeech>;
```

Render `text` on the first engine in `engines` that can render and does
not fail. Each engine must already be loaded, or loads here with no
status hooks. Native engines are skipped with OFFLINE_RENDER_REFUSAL.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `engines` | [`Engine`](#engine-1) \| readonly [`Engine`](#engine-1)[] |
| `text` | `string` |
| `o?` | [`RenderOptions`](#renderoptions) |

#### Returns

`Promise`\<[`RenderedSpeech`](#renderedspeech)\>

***

### renderSpeechFrom()

```ts
function renderSpeechFrom(p): BellowsVoiceModule;
```

Legacy: a renderSpeech for bellows-voice 0.7.3, which has none, built from its
public API as its own Singer.speak lays a line out: phrases at their
marks, speechPlan timing, planSung spans, sungEvents for the kernel and
renderOffline on this thread. Spoken consonants at full length, as in
bellows-voice (SPOKEN_CONSONANT_SCALE 1).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`BellowsParts`](#bellowsparts) |

#### Returns

[`BellowsVoiceModule`](#bellowsvoicemodule)

***

### seedFrom()

```ts
function seedFrom(rng): string;
```

A seed string from an Rng: one draw, 32 bits.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rng` | `Rng` |

#### Returns

`string`

***

### spansToPhonemes()

```ts
function spansToPhonemes(spans, textLength): Timed[];
```

Spans to phoneme timings. The engine reports no words, so each phoneme covers the whole segment text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `spans` | readonly [`BellowsSpan`](#bellowsspan)[] |
| `textLength` | `number` |

#### Returns

[`Timed`](#timed)[]

***

### speakable()

```ts
function speakable(input, o?): Speakable;
```

Strip what should not be read aloud: think blocks (closed or still
open), code fences, markdown marks, link targets, emoji and variation
selectors; read bare URLs as one word; apply the lexicon; collapse
whitespace. Returns the text and an offset map back into the input.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | `string` |
| `o?` | [`SpeakableOptions`](#speakableoptions) |

#### Returns

[`Speakable`](#speakable)

***

### stubEngine()

```ts
function stubEngine(o?): PcmEngine;
```

A tone engine for `?stub` pages and tests: 60 ms per character at a low level, with exact word times.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `chunkSec?`: `number`; `fail?`: `"load"` \| `"synth"` \| `"hang"`; `id?`: `string`; `rate?`: `number`; `secPerChar?`: `number`; \} |
| `o.chunkSec?` | `number` |
| `o.fail?` | `"load"` \| `"synth"` \| `"hang"` |
| `o.id?` | `string` |
| `o.rate?` | `number` |
| `o.secPerChar?` | `number` |

#### Returns

[`PcmEngine`](#pcmengine)

***

### toMono()

```ts
function toMono(channels): Float32Array;
```

Average channels to mono.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `channels` | readonly `Float32Array`\<`ArrayBufferLike`\>[] |

#### Returns

`Float32Array`

***

### webSpeechEngine()

```ts
function webSpeechEngine(o?): NativeEngine;
```

The system voice. Plays itself; word boundaries come from the browser.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `synth?`: [`SynthLike`](#synthlike); `Utterance?`: new (`text`) => [`UtteranceLike`](#utterancelike); \} |
| `o.synth?` | [`SynthLike`](#synthlike) |
| `o.Utterance?` | new (`text`) => [`UtteranceLike`](#utterancelike) |

#### Returns

[`NativeEngine`](#nativeengine)

***

### wordSpans()

```ts
function wordSpans(text): object[];
```

Word spans in a text: [start, end) character offsets.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`object`[]

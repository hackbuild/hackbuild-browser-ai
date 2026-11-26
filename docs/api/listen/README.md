# @hackbuild/listen

## Classes

### Listener

Turns microphone blocks into utterances through a VAD state machine, a transcriber and the phantom text filter.

#### Constructors

##### Constructor

```ts
new Listener(o): Listener;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ListenerOptions`](#listeneroptions) |

###### Returns

[`Listener`](#listener)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-machine"></a> `machine` | `readonly` | [`VadMachine`](#vadmachine) |

#### Accessors

##### state

###### Get Signature

```ts
get state(): ListenState;
```

###### Returns

[`ListenState`](#listenstate)

#### Methods

##### flush()

```ts
flush(): Promise<void>;
```

End any utterance in progress (for push to talk release).

###### Returns

`Promise`\<`void`\>

##### idle()

```ts
idle(): Promise<void>;
```

Resolves when every pushed block has been processed and transcribed.

###### Returns

`Promise`\<`void`\>

##### push()

```ts
push(block): void;
```

Feed a microphone block. Processing is serialized; await `idle()` to wait for it.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `block` | `Float32Array` |

###### Returns

`void`

##### setTalking()

```ts
setTalking(b): void;
```

Tell the listener the character started or stopped talking (speak's onSpeaking).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `boolean` |

###### Returns

`void`

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

### VadMachine

Finds utterances in per frame speech probabilities and swaps to stricter thresholds while the character talks.

#### Constructors

##### Constructor

```ts
new VadMachine(o?): VadMachine;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`VadOptions`](#vadoptions) |

###### Returns

[`VadMachine`](#vadmachine)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-frame"></a> `frame` | `readonly` | `number` |

#### Accessors

##### current

###### Get Signature

```ts
get current(): Float32Array<ArrayBufferLike> | null;
```

Audio of the utterance in progress, pre pad included; null outside one.

###### Returns

`Float32Array`\<`ArrayBufferLike`\> \| `null`

##### inSpeech

###### Get Signature

```ts
get inSpeech(): boolean;
```

###### Returns

`boolean`

##### isTalking

###### Get Signature

```ts
get isTalking(): boolean;
```

###### Returns

`boolean`

##### thresholds

###### Get Signature

```ts
get thresholds(): Thresholds;
```

###### Returns

[`Thresholds`](#thresholds-1)

#### Methods

##### flush()

```ts
flush(): VadEvent | null;
```

End the current utterance now (stream stopped).

###### Returns

[`VadEvent`](#vadevent) \| `null`

##### process()

```ts
process(prob, frame): VadEvent[];
```

One frame and its speech probability. Returns the events it caused.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `prob` | `number` |
| `frame` | `Float32Array` |

###### Returns

[`VadEvent`](#vadevent)[]

##### reset()

```ts
reset(): void;
```

###### Returns

`void`

##### setTalking()

```ts
setTalking(b): void;
```

The character started or stopped talking.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `boolean` |

###### Returns

`void`

## Interfaces

### DictateTarget

Anything with a text value: an input, a textarea, or a plain object in tests.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-value"></a> `value` | `string` |

#### Methods

##### dispatchEvent()?

```ts
dispatchEvent?(e): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `Event` |

###### Returns

`boolean`

***

### Dictation

Writes interim words into a text field and commits or cancels them.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-active"></a> `active` | `readonly` | `boolean` | Interim words are on screen. |

#### Methods

##### cancel()

```ts
cancel(): void;
```

Drop interim words and restore what was there.

###### Returns

`void`

##### final()

```ts
final(text): string;
```

Commit the final text; an empty final restores what was there. Returns the new value.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`string`

##### interim()

```ts
interim(i): void;
```

Show interim words after what the person had typed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | [`Interim`](#interim-1) |

###### Returns

`void`

***

### Interim

Words heard so far in the utterance in progress; replaced by the next one, never appended.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-stable"></a> `stable` | `string` | Leading words unchanged since the previous hypothesis of this utterance. |
| <a id="property-t"></a> `t` | `number` | Seconds since the utterance started (audio time on the window path, clock time on the system recognizer). |
| <a id="property-text"></a> `text` | `string` | The whole hypothesis so far. |

***

### ListenerOptions

The VAD source, transcriber, input rate, machine settings, interim settings and callbacks for a listener.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dropwhiletalking"></a> `dropWhileTalking?` | `boolean` | Drop an utterance that began while the character talked, for when barge in is off. Default false. |
| <a id="property-filter"></a> `filter?` | `boolean` | Run the phantom filter on transcripts. Default true. |
| <a id="property-gatems"></a> `gateMs?` | `number` | With dropWhileTalking, also drop one that began within this many ms after the voice stopped (audio time). Default 0. |
| <a id="property-inputrate"></a> `inputRate?` | `number` | Microphone rate; any rate is brought to 16 kHz. Default 48000. |
| <a id="property-interim"></a> `interim?` | `object` | Interim text while the person speaks: the growing utterance window is decoded again every `everySec` of new audio (default 0.8) once it holds `minSec` (default 0.5), at most one decode in flight. Needs onInterim and a transcriber; `transcribe` here overrides the final one, for a smaller model. |
| `interim.everySec?` | `number` | - |
| `interim.minSec?` | `number` | - |
| `interim.transcribe?` | [`Transcriber`](#transcriber) | - |
| <a id="property-machine-1"></a> `machine?` | [`VadOptions`](#vadoptions) | - |
| <a id="property-transcribe"></a> `transcribe?` | [`Transcriber`](#transcriber) | - |
| <a id="property-vad"></a> `vad` | [`VadSource`](#vadsource) | - |

#### Methods

##### onBargeIn()?

```ts
onBargeIn?(): void;
```

###### Returns

`void`

##### onError()?

```ts
onError?(e): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

###### Returns

`void`

##### onInterim()?

```ts
onInterim?(i): void;
```

Words heard so far; results for an utterance that already ended are dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | [`Interim`](#interim-1) |

###### Returns

`void`

##### onProb()?

```ts
onProb?(p): void;
```

Per frame probability, for a meter.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | `number` |

###### Returns

`void`

##### onState()?

```ts
onState?(s): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`ListenState`](#listenstate) |

###### Returns

`void`

##### onUtterance()?

```ts
onUtterance?(u): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `u` | [`Utterance`](#utterance) |

###### Returns

`void`

***

### MicOptions

Microphone helpers. Ask for the microphone before any model download so
the permission prompt shows at once. Echo cancellation, noise
suppression and gain control are requested, since barge in depends on
the character's voice being cancelled out of the input.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-deviceid"></a> `deviceId?` | `string` |
| <a id="property-getusermedia"></a> `getUserMedia?` | (`c`) => `Promise`\<`MediaStream`\> |

***

### OrtLike

The onnxruntime-web pieces the Silero source calls.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-inferencesession"></a> `InferenceSession` | `object` |
| `InferenceSession.create` | (`model`, `o?`) => `Promise`\<[`OrtSessionLike`](#ortsessionlike)\> |
| <a id="property-tensor"></a> `Tensor` | new (`type`, `data`, `dims`) => `unknown` |

***

### OrtSessionLike

The part of an onnxruntime-web InferenceSession the Silero source runs.

#### Methods

##### run()

```ts
run(feeds): Promise<Record<string, {
  data: ArrayLike<number>;
}>>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `feeds` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`Record`\<`string`, \{
  `data`: `ArrayLike`\<`number`\>;
\}\>\>

***

### SelfGate

Closed while the character speaks and for `tailMs` after, so it does not hear itself.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-open"></a> `open` | `readonly` | `boolean` |

#### Methods

##### setSpeaking()

```ts
setSpeaking(b): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `boolean` |

###### Returns

`void`

***

### SpeechEngine

The system recognizer with start, stop and its state.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-state"></a> `state` | `readonly` | [`SpeechEngineState`](#speechenginestate) |

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

### SpeechEngineOptions

Language, recognizer constructor, self gate, restart delay and callbacks for speechEngine.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-gate"></a> `gate?` | [`SelfGate`](#selfgate) | Results that arrive while this gate is closed are dropped. |
| <a id="property-lang"></a> `lang?` | `string` | - |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-recognition"></a> `Recognition?` | new () => `SpeechRecognitionLike` | Constructor; default globalThis.SpeechRecognition or webkitSpeechRecognition. |
| <a id="property-restartms"></a> `restartMs?` | `number` | Delay before restarting after the recognizer ends on its own. Default 150 ms. |

#### Methods

##### onError()?

```ts
onError?(error): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | `string` |

###### Returns

`void`

##### onFinal()?

```ts
onFinal?(text): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`void`

##### onInterim()?

```ts
onInterim?(i): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `i` | [`Interim`](#interim-1) |

###### Returns

`void`

##### onState()?

```ts
onState?(s): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`SpeechEngineState`](#speechenginestate) |

###### Returns

`void`

***

### Thresholds

Voice activity: a per frame speech probability from a source (Silero
through onnxruntime-web, or an energy gate with no weights) feeds a
state machine that finds utterances. While the character talks, the
machine swaps to stricter thresholds (positive 0.85 and 450 ms of speech
against 0.5 and 250 ms) so its own voice from the speakers does not
count; speech that clears the stricter bar is a barge in.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-minspeechms"></a> `minSpeechMs` | `number` | Speech needed before an utterance is real, in ms. |
| <a id="property-negative"></a> `negative` | `number` | Probability under which a frame counts toward the end of speech. |
| <a id="property-positive"></a> `positive` | `number` | Probability at or above which a frame is speech. |

***

### Utterance

One utterance: its text, its 16 kHz audio, its length, whether it was a barge in and any dropped text.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bargein"></a> `bargeIn` | `boolean` | This utterance cut the character off. |
| <a id="property-dropped"></a> `dropped?` | `string` | Text the phantom filter dropped, with the reason. |
| <a id="property-pcm"></a> `pcm` | `Float32Array` | - |
| <a id="property-sec"></a> `sec` | `number` | - |
| <a id="property-text-1"></a> `text` | `string` | - |

***

### VadOptions

Frame size, idle and talking thresholds, end of speech quiet, pre speech pad and longest utterance for VadMachine.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-frame-1"></a> `frame?` | `number` | Samples per frame at 16 kHz. Default 512 (32 ms), Silero v5's frame. |
| <a id="property-idle"></a> `idle?` | [`Thresholds`](#thresholds-1) | - |
| <a id="property-maxsec"></a> `maxSec?` | `number` | Longest utterance before a forced end, in s. Default 24 (Whisper pads to 30). |
| <a id="property-prespeechpadms"></a> `preSpeechPadMs?` | `number` | Audio kept from before the start, in ms. Default 300. |
| <a id="property-redemptionms"></a> `redemptionMs?` | `number` | Quiet needed to end an utterance, in ms. Default 600. |
| <a id="property-talking"></a> `talking?` | [`Thresholds`](#thresholds-1) | Used while the character talks. |

***

### VadSource

A speech probability per frame.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-id"></a> `id` | `readonly` | `string` |

#### Methods

##### prob()

```ts
prob(frame): number | Promise<number>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `frame` | `Float32Array` |

###### Returns

`number` \| `Promise`\<`number`\>

##### reset()?

```ts
reset?(): void;
```

###### Returns

`void`

## Type Aliases

### ListenState

```ts
type ListenState = "idle" | "listening" | "hearing" | "transcribing" | "stopped";
```

Where the listener is: idle, listening, hearing speech, transcribing or stopped.

***

### SpeechEngineState

```ts
type SpeechEngineState = "off" | "listening" | "unsupported" | "denied";
```

The system recognizer's state: off, listening, unsupported or denied.

***

### Transcriber

```ts
type Transcriber = (pcm16k, signal?) => Promise<string>;
```

Turns 16 kHz mono speech into text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pcm16k` | `Float32Array` |
| `signal?` | `AbortSignal` |

#### Returns

`Promise`\<`string`\>

***

### VadEvent

```ts
type VadEvent = 
  | {
  type: "start";
}
  | {
  talking: boolean;
  type: "confirmed";
}
  | {
  audio: Float32Array;
  sec: number;
  speech: [number, number][];
  type: "end";
}
  | {
  type: "misfire";
};
```

What VadMachine reports: a start, a confirmed utterance (a barge in while talking), an end with its audio, or a misfire.

#### Union Members

##### Type Literal

```ts
{
  type: "start";
}
```

***

##### Type Literal

```ts
{
  talking: boolean;
  type: "confirmed";
}
```

Enough speech heard; while talking this is the barge in.

***

##### Type Literal

```ts
{
  audio: Float32Array;
  sec: number;
  speech: [number, number][];
  type: "end";
}
```

***

##### Type Literal

```ts
{
  type: "misfire";
}
```

## Variables

### CONVERSATION

```ts
const CONVERSATION: VadOptions;
```

Machine options for a spoken conversation: a longer pause ends a turn, so a breath mid sentence does not (900 ms, vendor).

***

### IDLE

```ts
const IDLE: Thresholds;
```

Thresholds while the character is quiet: positive 0.5, negative 0.35, 250 ms of speech.

***

### TALKING

```ts
const TALKING: Thresholds;
```

Stricter thresholds while the character talks: positive 0.85, negative 0.6, 450 ms of speech.

***

### VAD\_RECORDS

```ts
const VAD_RECORDS: ModelRecord[];
```

Model records for the VAD this package runs, for pickers and the models registry.

## Functions

### captureWorkletSource()

```ts
function captureWorkletSource(size?): string;
```

Source of the capture worklet: posts each 128 sample render quantum of channel 0, batched to `size`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `size?` | `number` | `2048` |

#### Returns

`string`

***

### createListener()

```ts
function createListener(o): Listener;
```

Makes a Listener from its options.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ListenerOptions`](#listeneroptions) |

#### Returns

[`Listener`](#listener)

***

### dictate()

```ts
function dictate(target, o?): Dictation;
```

Write interim text into an input and commit it on the final. Typed text
before the first interim word is kept; each write fires an input event
so a framework binding sees it. `onCommit` gets the value after a
non empty final, for a hands free send.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `target` | [`DictateTarget`](#dictatetarget) |
| `o?` | \{ `onCommit?`(`value`): `void`; \} |
| `o.onCommit?` | (`value`) => `void` |

#### Returns

[`Dictation`](#dictation)

***

### energyVad()

```ts
function energyVad(o?): VadSource;
```

Energy source with no weights: probability rises from 0 at 3 dB over a
tracked noise floor to 1 at 15 dB over it. The floor follows quiet
frames quickly and loud ones slowly. It cannot tell speech from music.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `fall?`: `number`; `floorDb?`: `number`; `rise?`: `number`; \} |
| `o.fall?` | `number` |
| `o.floorDb?` | `number` |
| `o.rise?` | `number` |

#### Returns

[`VadSource`](#vadsource)

***

### hubTranscriber()

```ts
function hubTranscriber(hub, o?): Transcriber;
```

A transcriber over the models hub and @hackbuild/transcribe's records
(Whisper, weights MIT; Moonshine, see its record). The call runs under
hub.run, so a webgpu model takes the gpu lock.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |
| `o?` | \{ `language?`: `string`; `model?`: `string`; `schedule?`: `RunOptions`; \} |
| `o.language?` | `string` |
| `o.model?` | `string` |
| `o.schedule?` | `RunOptions` |

#### Returns

[`Transcriber`](#transcriber)

***

### micBlocks()

```ts
function micBlocks(
   ctx, 
   stream, 
   onBlock, 
   size?
): Promise<() => void>;
```

Stream microphone blocks at the context rate to `onBlock`. The worklet
loads from a Blob URL, then a data: URL (file:// pages). Returns a stop
function. Not run in a browser by this package's tests.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `ctx` | `AudioContext` | `undefined` |
| `stream` | `MediaStream` | `undefined` |
| `onBlock` | (`b`) => `void` | `undefined` |
| `size?` | `number` | `2048` |

#### Returns

`Promise`\<() => `void`\>

***

### openMic()

```ts
function openMic(o?): Promise<MediaStream>;
```

Asks for the microphone with echo cancellation, noise suppression and gain control on.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`MicOptions`](#micoptions) |

#### Returns

`Promise`\<`MediaStream`\>

***

### selfGate()

```ts
function selfGate(o?): SelfGate;
```

Makes a SelfGate that closes while the character speaks and for `tailMs` after (default 400 ms).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | \{ `now?`: () => `number`; `tailMs?`: `number`; \} |
| `o.now?` | () => `number` |
| `o.tailMs?` | `number` |

#### Returns

[`SelfGate`](#selfgate)

***

### sileroVad()

```ts
function sileroVad(
   ort, 
   model, 
   o?
): Promise<VadSource>;
```

Silero VAD v5 (snakers4/silero-vad, weights MIT) on onnxruntime-web:
512 new samples at 16 kHz with the previous 64 as context, a [2, 1, 128]
state carried between frames. The model bytes are the caller's (URL,
ArrayBuffer or File through @hackbuild/weights); single threaded wasm is
the setting an earlier build ran, since threaded wasm hung in workers.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ort` | [`OrtLike`](#ortlike) |
| `model` | `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> |
| `o?` | \{ `executionProviders?`: `string`[]; \} |
| `o.executionProviders?` | `string`[] |

#### Returns

`Promise`\<[`VadSource`](#vadsource)\>

***

### speechEngine()

```ts
function speechEngine(o?): SpeechEngine;
```

The browser's system recognizer with interim results (Chrome sends the
audio to its own service; say so in the UI). With no recognizer the
engine reports "unsupported"; a refused microphone reports "denied".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`SpeechEngineOptions`](#speechengineoptions) |

#### Returns

[`SpeechEngine`](#speechengine)

***

### stablePrefix()

```ts
function stablePrefix(prev, next): string;
```

The leading words two hypotheses share, compared without case or punctuation.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prev` | `string` |
| `next` | `string` |

#### Returns

`string`

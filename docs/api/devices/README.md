# @hackbuild/devices

## Interfaces

### FileProgressEvent

transformers.js reports progress per file. A status line wants one
fraction across files, and an MB count when totals are unknown (an earlier relief bench
summed loaded over total by file name).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-file"></a> `file?` | `string` |
| <a id="property-loaded"></a> `loaded?` | `number` |
| <a id="property-name"></a> `name?` | `string` |
| <a id="property-progress"></a> `progress?` | `number` |
| <a id="property-status"></a> `status?` | `string` |
| <a id="property-total"></a> `total?` | `number` |

***

### GraphFile

One file of an ort record: its session key, file name, label, weight reference, and whether it is external data.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-external"></a> `external` | `boolean` | - |
| <a id="property-label"></a> `label` | `string` | The path as the record lists it, for per file progress rows. |
| <a id="property-name-1"></a> `name` | `string` | Session key: the file name without `.onnx`, or its folder when two graphs share a file name (`text_encoder/model.onnx` is `text_encoder`). |
| <a id="property-path"></a> `path` | `string` | The file name, as external data is matched. |
| <a id="property-ref"></a> `ref` | `WeightRef` | - |

***

### MergedProgress

Progress summed across files: bytes loaded, the total when known, the fraction, the file count and a status line.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-files"></a> `files` | `number` | - |
| <a id="property-fraction"></a> `fraction` | `number` \| `null` | - |
| <a id="property-line"></a> `line` | `string` | "downloading 42% of 96 MB" or "downloading 12 MB" (computed). |
| <a id="property-loaded-1"></a> `loaded` | `number` | - |
| <a id="property-total-1"></a> `total` | `number` \| `null` | null while no file has reported a total. |

***

### OrtModel

What [ortProvider](#ortprovider-1) loads: the runtime module, sessions by graph name, the first session, the rung that worked, and `dispose`.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-ort"></a> `ort` | `readonly` | [`OrtModule`](#ortmodule) | - |
| <a id="property-rung"></a> `rung` | `readonly` | `Rung` | - |
| <a id="property-session"></a> `session` | `readonly` | [`OrtSession`](#ortsession) | The first graph's session. |
| <a id="property-sessions"></a> `sessions` | `readonly` | `Record`\<`string`, [`OrtSession`](#ortsession)\> | Sessions by graph name (file name without `.onnx`). |

#### Methods

##### dispose()

```ts
dispose(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

***

### OrtModule

The parts of the onnxruntime-web module the provider touches. Tests pass a fake.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-env"></a> `env?` | `object` |
| `env.wasm?` | `object` |
| `env.wasm.numThreads?` | `number` |
| `env.wasm.proxy?` | `boolean` |
| `env.wasm.simd?` | `boolean` |
| `env.wasm.wasmPaths?` | `unknown` |
| <a id="property-inferencesession"></a> `InferenceSession` | `object` |
| `InferenceSession.create` | (`model`, `opts?`) => `Promise`\<[`OrtSession`](#ortsession)\> |
| <a id="property-tensor"></a> `Tensor` | new (`type`, `data`, `dims`) => [`OrtTensorLike`](#orttensorlike) |

***

### OrtProvider

The onnxruntime-web provider: the hub factory, and `forget` to release a record's bytes.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-factory"></a> `factory` | `Factory`\<[`OrtModel`](#ortmodel)\> |

#### Methods

##### forget()

```ts
forget(rec): void;
```

Release bytes held for a record whose every rung failed.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` |

###### Returns

`void`

***

### OrtProviderOptions

Options for [ortProvider](#ortprovider-1): the runtime loader, the weight store, the wasm file directory and a per file progress callback.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-onprogress"></a> `onProgress?` | (`recordId`, `file`, `fraction`) => `void` |
| <a id="property-runtime"></a> `runtime` | () => `Promise`\<[`OrtModule`](#ortmodule)\> |
| <a id="property-store"></a> `store` | `WeightStore` |
| <a id="property-wasmpaths"></a> `wasmPaths?` | `string` |

***

### OrtSession

The parts of an onnxruntime-web InferenceSession the provider uses: input and output names, `run` and `release`.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-inputnames"></a> `inputNames` | `readonly` | readonly `string`[] |
| <a id="property-outputnames"></a> `outputNames` | `readonly` | readonly `string`[] |

#### Methods

##### release()?

```ts
release?(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### run()

```ts
run(feeds, opts?): Promise<Record<string, OrtTensorLike>>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `feeds` | `Record`\<`string`, `unknown`\> |
| `opts?` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`Record`\<`string`, [`OrtTensorLike`](#orttensorlike)\>\>

***

### OrtTensorLike

The parts of an onnxruntime-web tensor the provider reads: data, dims, type and `dispose`.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-data"></a> `data` | `readonly` | `ArrayLike`\<`number`\> \| `ArrayLike`\<`bigint`\> |
| <a id="property-dims"></a> `dims` | `readonly` | readonly `number`[] |
| <a id="property-type"></a> `type?` | `readonly` | `string` |

#### Methods

##### dispose()?

```ts
dispose?(): void;
```

###### Returns

`void`

***

### TjsEnv

The parts of transformers.js `env` the provider sets: local and remote models, caches and the onnx wasm backend.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-allowlocalmodels"></a> `allowLocalModels?` | `boolean` |
| <a id="property-allowremotemodels"></a> `allowRemoteModels?` | `boolean` |
| <a id="property-backends"></a> `backends?` | `object` |
| `backends.onnx?` | `object` |
| `backends.onnx.wasm?` | `object` |
| `backends.onnx.wasm.numThreads?` | `number` |
| `backends.onnx.wasm.proxy?` | `boolean` |
| <a id="property-customcache"></a> `customCache?` | `unknown` |
| <a id="property-usebrowsercache"></a> `useBrowserCache?` | `boolean` |
| <a id="property-usecustomcache"></a> `useCustomCache?` | `boolean` |
| <a id="property-usewasmcache"></a> `useWasmCache?` | `boolean` |

***

### TjsLadderSpec

The dtypes to try on WebGPU and on wasm, their order, a fresh heap retry, and options copied onto every rung.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-freshheapretry"></a> `freshHeapRetry?` | `boolean` | Retry the last wasm dtype in a fresh heap after an out of memory (as earlier builds did). |
| <a id="property-options"></a> `options?` | `Record`\<`string`, `unknown`\> | Extra runtime options copied onto every rung, e.g. `{ task: "depth-estimation" }`. |
| <a id="property-wasm"></a> `wasm?` | readonly [`Dtype`](#dtype)[] | dtypes tried on wasm, in order. |
| <a id="property-wasmfirst"></a> `wasmFirst?` | `boolean` | Put wasm before webgpu (an earlier chat build keeps perception off the gpu the chat model uses). |
| <a id="property-webgpu"></a> `webgpu?` | readonly [`Dtype`](#dtype)[] | dtypes tried on webgpu, in order. |

***

### TjsLoadContext

What a custom [TjsLoader](#tjsloader) receives: the hub's factory context, the transformers.js module and the pipeline options for the rung.

#### Extends

- `FactoryContext`

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-env-1"></a> `env` | `Env` \| `undefined` | - | `FactoryContext.env` |
| <a id="property-hub"></a> `hub` | `Hub` | - | `FactoryContext.hub` |
| <a id="property-last"></a> `last` | `boolean` | True on the ladder's last rung: a failure here exhausts it, so a factory frees what it cached for the record. | `FactoryContext.last` |
| <a id="property-options-1"></a> `options` | `Record`\<`string`, `unknown`\> | Pipeline options for this rung: device, dtype, progress_callback. | - |
| <a id="property-record"></a> `record` | `ModelRecord` | - | `FactoryContext.record` |
| <a id="property-rung-1"></a> `rung` | `Rung` | - | `FactoryContext.rung` |
| <a id="property-signal"></a> `signal` | `AbortSignal` \| `undefined` | - | `FactoryContext.signal` |
| <a id="property-tjs"></a> `tjs` | [`TjsModule`](#tjsmodule) | - | - |

#### Methods

##### report()

```ts
report(
   phase, 
   fraction, 
   file?
): void;
```

Tell every `hub.onLoad` listener how this load moves: fetch, then compile, then warm.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `phase` | `"fetch"` \| `"compile"` \| `"warm"` |
| `fraction` | `number` \| `null` |
| `file?` | `string` |

###### Returns

`void`

###### Inherited from

`FactoryContext.report`

***

### TjsModule

The parts of the transformers.js module the provider touches. Tests pass a fake.

#### Indexable

```ts
[name: string]: unknown
```

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-env-2"></a> `env?` | [`TjsEnv`](#tjsenv) |
| <a id="property-pipeline"></a> `pipeline?` | (`task`, `model`, `opts`) => `Promise`\<`unknown`\> |

***

### TjsProvider

The transformers.js provider: the hub factory, `loader` to register a capability's loader, and `configure`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-factory-1"></a> `factory` | `Factory` |

#### Methods

##### configure()

```ts
configure(tjs, env): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tjs` | [`TjsModule`](#tjsmodule) |
| `env` | `Env` \| `undefined` |

###### Returns

`void`

##### loader()

```ts
loader<T>(capability, fn): void;
```

Register the loader for a capability. The first capability of a record with a loader wins.

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `capability` | `string` |
| `fn` | [`TjsLoader`](#tjsloader)\<`T`\> |

###### Returns

`void`

***

### TjsProviderOptions

Options for [tjsProvider](#tjsprovider-1): the runtime loader, a custom cache from @hackbuild/weights, and a progress callback.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cache"></a> `cache?` | `unknown` | A `transformersCache(store, ...)` from @hackbuild/weights, set as env.customCache. |
| <a id="property-onprogress-1"></a> `onProgress?` | (`recordId`, `p`) => `void` | - |
| <a id="property-runtime-1"></a> `runtime` | () => `Promise`\<[`TjsModule`](#tjsmodule)\> | - |

## Type Aliases

### Dtype

```ts
type Dtype = string | Record<string, string>;
```

A transformers.js dtype: one for the whole model, or one per sub graph.

***

### ErrorKind

```ts
type ErrorKind = 
  | "runtime-mismatch"
  | "out-of-memory"
  | "f16"
  | "device-lost"
  | "unsupported-op"
  | "network"
  | "abort"
  | "unknown";
```

The kind of a load failure as `classifyError` names it.

***

### FailureKind

```ts
type FailureKind = "model" | "mic" | "camera" | "storage";
```

What was being done when it failed. "model" covers loads and runs.

***

### TjsLoader

```ts
type TjsLoader<T> = (ctx) => Promise<T>;
```

A custom loader for one capability on the transformers.js provider; it returns the loaded model.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-1"></a> `T` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`TjsLoadContext`](#tjsloadcontext) |

#### Returns

`Promise`\<`T`\>

## Variables

### LADDERS

```ts
const LADDERS: object;
```

Ladders by name, from the builds. Each model record may copy one or write its own.

#### Type Declaration

| Name | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-depth"></a> `depth()` | () => `Rung`[] | - | an earlier relief bench runDepth. |
| <a id="property-ort-1"></a> `ort()` | (`opts`) => `Rung`[] | `ortRungs` | onnxruntime-web rungs: the earlier transcription tool walk, or wasm only when the graph is known to fail on webgpu. |
| <a id="property-perceptioncpu"></a> `perceptionCpu()` | () => `Rung`[] | - | earlier builds: perception models on cpu by default. |
| <a id="property-smolvlm"></a> `smolvlm()` | () => `Rung`[] | - | SmolVLM (weights Apache-2.0): fp16 embed and vision, q4 decoder on webgpu; q8 vision on wasm, as earlier builds ran it. |
| <a id="property-vlmgpuonly"></a> `vlmGpuOnly()` | () => `Rung`[] | - | earlier builds: q4f16 on webgpu only. |
| <a id="property-whispersmall"></a> `whisperSmall()` | (`q4Decoder`) => `Rung`[] | - | whisper-base and the Xenova .en exports (weights MIT; the ONNX cards say apache-2.0). |
| <a id="property-whisperturbo"></a> `whisperTurbo()` | () => `Rung`[] | - | whisper-large-v3-turbo (weights MIT), as the earlier transcription tool ran it. |

***

### PINS

```ts
const PINS: object;
```

The pinned runtime versions: transformers.js 4.3.2 and onnxruntime-web 1.27.0.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-ort-2"></a> `ort` | `"1.27.0"` | `"1.27.0"` |
| <a id="property-transformers"></a> `transformers` | `"4.3.2"` | `"4.3.2"` |

***

### RUNTIME\_SHA256

```ts
const RUNTIME_SHA256: Readonly<Record<string, string>>;
```

SHA-256 of the pinned jsDelivr files, measured 2026-11-23 (two fetches
each, byte identical). Opt in: pass `{ integrity: RUNTIME_SHA256 }`, and
the text is fetched, checked, and imported from a Blob URL, which moves
import.meta.url; set ort's wasmPaths (ortWasmPaths) when you do. The
esm.sh fallbacks are rebuilt by that service and carry no hash, so with
integrity on they run only if their text matches, which it will not.

***

### TJS\_TASKS

```ts
const TJS_TASKS: Record<string, string>;
```

transformers.js pipeline task per capability, for the default loader.

## Functions

### classifyError()

```ts
function classifyError(e): ErrorKind;
```

Name the failure so a ladder and a status line can act on it. Patterns come from the builds' logs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

#### Returns

[`ErrorKind`](#errorkind)

***

### configureOrt()

```ts
function configureOrt(
   ort, 
   env, 
   wasmPaths?
): void;
```

Set onnxruntime-web's wasm thread count from the probe, turn the proxy worker off, and set `wasmPaths` when given.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ort` | [`OrtModule`](#ortmodule) |
| `env` | `Env` \| `undefined` |
| `wasmPaths?` | `string` |

#### Returns

`void`

***

### configureTjs()

```ts
function configureTjs(
   tjs, 
   env, 
   cache?
): void;
```

Configure transformers.js once: no local models, the browser or a custom cache, the wasm cache off, wasm threads from the probe and the proxy worker off.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tjs` | [`TjsModule`](#tjsmodule) |
| `env` | `Env` \| `undefined` |
| `cache?` | `unknown` |

#### Returns

`void`

***

### f32()

```ts
function f32(
   ort, 
   data, 
   dims
): OrtTensorLike;
```

Float32 tensor helper over the injected module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ort` | [`OrtModule`](#ortmodule) |
| `data` | `Float32Array` |
| `dims` | readonly `number`[] |

#### Returns

[`OrtTensorLike`](#orttensorlike)

***

### graphFiles()

```ts
function graphFiles(rec): GraphFile[];
```

The files of an ort record with their weight references.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` |

#### Returns

[`GraphFile`](#graphfile)[]

***

### humanError()

#### Call Signature

```ts
function humanError(raw): string;
```

A lowercase line for a failure, naming it and the working alternative.
`humanError(e)` reads a runtime or storage failure; `humanError("mic", e)`
and `humanError("camera", e)` read a device failure by its DOMException name.
An unknown failure keeps its message.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `unknown` |

##### Returns

`string`

#### Call Signature

```ts
function humanError(kind, raw): string;
```

A lowercase line for a failure, naming it and the working alternative.
`humanError(e)` reads a runtime or storage failure; `humanError("mic", e)`
and `humanError("camera", e)` read a device failure by its DOMException name.
An unknown failure keeps its message.

##### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | [`FailureKind`](#failurekind) |
| `raw` | `unknown` |

##### Returns

`string`

***

### loadOrt()

```ts
function loadOrt(opts?): () => Promise<OrtModule>;
```

A memoized loader of the pinned onnxruntime-web; call the returned function to import it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | `ImportEsmOptions` & `object` |

#### Returns

() => `Promise`\<[`OrtModule`](#ortmodule)\>

***

### loadTransformers()

```ts
function loadTransformers(opts?): () => Promise<TjsModule>;
```

A memoized loader of the pinned transformers.js; call the returned function to import it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | `ImportEsmOptions` & `object` |

#### Returns

() => `Promise`\<[`TjsModule`](#tjsmodule)\>

***

### ortLadder()

```ts
function ortLadder(): Rung[];
```

The onnxruntime-web ladder the earlier transcription tool walks after one fetch: webgpu at basic, all, disabled, then wasm.

#### Returns

`Rung`[]

***

### ortProvider()

```ts
function ortProvider(opts): OrtProvider;
```

The onnxruntime-web provider for the models hub: fetches each graph once through the weight store and builds a session per rung from the same bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`OrtProviderOptions`](#ortprovideroptions) |

#### Returns

[`OrtProvider`](#ortprovider)

***

### ortRungs()

```ts
function ortRungs(opts?): Rung[];
```

onnxruntime-web rungs: the earlier transcription tool walk, or wasm only when the graph is known to fail on webgpu.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `webgpu?`: `boolean`; \} |
| `opts.webgpu?` | `boolean` |

#### Returns

`Rung`[]

***

### ortUrls()

```ts
function ortUrls(version?): string[];
```

The URLs onnxruntime-web is imported from: the jsDelivr WebGPU build, the jsDelivr plain build, then esm.sh.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `PINS.ort` |

#### Returns

`string`[]

***

### ortWasmPaths()

```ts
function ortWasmPaths(version?): string;
```

The wasm file directory for an ort pin, for `ort.env.wasm.wasmPaths`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `PINS.ort` |

#### Returns

`string`

***

### pickDevice()

```ts
function pickDevice(env): "webgpu" | "wasm";
```

"webgpu" when the probe found an adapter, else "wasm".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Env` \| `undefined` |

#### Returns

`"webgpu"` \| `"wasm"`

***

### pipelineOptions()

```ts
function pipelineOptions(rung, progress?): Record<string, unknown>;
```

Pipeline options for a rung. Runtime options other than `task` and `loader` pass through.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rung` | `Rung` |
| `progress?` | (`ev`) => `void` |

#### Returns

`Record`\<`string`, `unknown`\>

***

### progressMerger()

```ts
function progressMerger(onUpdate): (ev) => void;
```

Merge transformers.js per file progress events into one [MergedProgress](#mergedprogress) and pass it to `onUpdate`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `onUpdate` | (`p`) => `void` |

#### Returns

(`ev`) => `void`

***

### runtimeLoader()

```ts
function runtimeLoader<T>(urls, opts?): () => Promise<T>;
```

Memoized loaders, so every package shares one runtime instance per page.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `urls` | readonly `string`[] |
| `opts?` | `ImportEsmOptions` |

#### Returns

() => `Promise`\<`T`\>

***

### sessionOptions()

```ts
function sessionOptions(rung, external): Record<string, unknown>;
```

Session options for a rung: the rung's ort block plus any runtime options.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rung` | `Rung` |
| `external` | `object`[] |

#### Returns

`Record`\<`string`, `unknown`\>

***

### tjsLadder()

```ts
function tjsLadder(spec): Rung[];
```

transformers.js rungs from a spec. f16 rungs get the shader-f16 need from the models package.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `spec` | [`TjsLadderSpec`](#tjsladderspec) |

#### Returns

`Rung`[]

***

### tjsProvider()

```ts
function tjsProvider(opts): TjsProvider;
```

The transformers.js provider for the models hub: configures the runtime once and loads each record through a registered loader or `pipeline`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts` | [`TjsProviderOptions`](#tjsprovideroptions) |

#### Returns

[`TjsProvider`](#tjsprovider)

***

### transformersUrls()

```ts
function transformersUrls(version?): string[];
```

The URLs transformers.js is imported from, jsDelivr first, then esm.sh.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `version?` | `string` | `PINS.transformers` |

#### Returns

`string`[]

***

### walkLadder()

```ts
function walkLadder<T>(
   id, 
   rungs, 
   attempt, 
   opts?
): Promise<{
  failures: LadderFailure[];
  rung: Rung;
  value: T;
}>;
```

Try each rung until `attempt` resolves. An abort stops the walk; a
network error stops it too, since another dtype will not fix the network.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `rungs` | readonly `Rung`[] |
| `attempt` | (`rung`, `index`) => `Promise`\<`T`\> |
| `opts?` | \{ `onFailure?`: (`f`) => `void`; \} |
| `opts.onFailure?` | (`f`) => `void` |

#### Returns

`Promise`\<\{
  `failures`: `LadderFailure`[];
  `rung`: `Rung`;
  `value`: `T`;
\}\>

***

### wasmThreads()

```ts
function wasmThreads(env): number;
```

wasm thread count to set on a runtime: the probe's safe count, 1 without a probe.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Env` \| `undefined` |

#### Returns

`number`

# @hackbuild/models

## Classes

### HubError

The error the hub throws, with a `code` of "no-route", "no-provider", "budget", "abort" or "skipped".

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new HubError(code, message): HubError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | `"abort"` \| `"no-route"` \| `"no-provider"` \| `"budget"` \| `"skipped"` |
| `message` | `string` |

###### Returns

[`HubError`](#huberror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `readonly` | `"abort"` \| `"no-route"` \| `"no-provider"` \| `"budget"` \| `"skipped"` |

***

### LadderError

The error `walkLadder` throws when every rung failed or none fits, with the failure of each rung tried.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new LadderError(id, failures): LadderError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `failures` | [`LadderFailure`](#ladderfailure)[] |

###### Returns

[`LadderError`](#laddererror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-failures"></a> `failures` | `readonly` | [`LadderFailure`](#ladderfailure)[] |

***

### RegistryError

The error a registry throws when a record fails validation.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new RegistryError(message): RegistryError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |

###### Returns

[`RegistryError`](#registryerror)

###### Overrides

`Error.constructor`

## Interfaces

### Budget

The largest model in MB this machine can give one model, with a lowercase reason.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-mb"></a> `mb` | `number` | Largest model, in MB, that leaves this machine responsive. |
| <a id="property-source"></a> `source` | `"proposed"` | Every budget is a proposal until a browser run measures one. |
| <a id="property-why"></a> `why` | `string` | Lowercase reason, e.g. "8 gb memory, webgpu". |

***

### Defaults

A first visit's suggestion: the model, device and threads to set, a reason per field, a download
worth offering, and the budget used.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-budget"></a> `budget` | [`Budget`](#budget) | - |
| <a id="property-download"></a> `download` | [`ModelRecord`](#modelrecord) \| `null` | A catalogue record worth downloading: nothing stored fits, or it is a real step up. |
| <a id="property-patch"></a> `patch` | `object` | - |
| `patch.device` | `"webgpu"` \| `"wasm"` | - |
| `patch.model` | `string` \| `null` | The record to load, or null when nothing stored fits and the person must download first. |
| `patch.threads` | `number` | - |
| <a id="property-reasons"></a> `reasons` | [`Reason`](#reason)[] | - |

***

### DefaultsInput

What `suggestDefaults` and `pickModel` choose from: the catalogue, stored ids, the storage
estimate, the capability and an optional budget.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-budget-1"></a> `budget?` | [`Budget`](#budget) | Override the budget, e.g. from a setting. Default budgetFor(env). |
| <a id="property-catalogue"></a> `catalogue` | readonly [`ModelRecord`](#modelrecord)[] | Records to choose from, e.g. CATALOG or registry.list(). |
| <a id="property-estimate"></a> `estimate?` | [`StorageEstimate`](#storageestimate) \| `null` | store.estimate(); a catalogue offer must fit the free storage. |
| <a id="property-provides"></a> `provides?` | [`Capability`](#capability) | Capability to pick for. Default "chat". |
| <a id="property-stored"></a> `stored?` | readonly `string`[] | Ids already in the weight store. |

***

### ExclusiveOptions

Priority and abort signal for a job in an exclusive queue.

#### Extended by

- [`RunOptions`](#runoptions)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-priority"></a> `priority?` | `number` |
| <a id="property-signal"></a> `signal?` | `AbortSignal` |

***

### FactoryContext

What a factory gets for one rung: the record, the rung, the env, the abort signal, the hub,
whether the rung is the last, and a progress reporter.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-env"></a> `env` | `Env` \| `undefined` | - |
| <a id="property-hub"></a> `hub` | [`Hub`](#hub) | - |
| <a id="property-last"></a> `last` | `boolean` | True on the ladder's last rung: a failure here exhausts it, so a factory frees what it cached for the record. |
| <a id="property-record"></a> `record` | [`ModelRecord`](#modelrecord) | - |
| <a id="property-rung"></a> `rung` | [`Rung`](#rung) | - |
| <a id="property-signal-1"></a> `signal` | `AbortSignal` \| `undefined` | - |

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

***

### FitResult

Whether a record fits this machine, as a `Fit` word, an ok flag and a lowercase reason.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fit"></a> `fit` | [`Fit`](#fit) | - |
| <a id="property-ok"></a> `ok` | `boolean` | True for "fits" and "fits on cpu, slow". |
| <a id="property-reason"></a> `reason` | `string` | Lowercase reason that names the failure. |

***

### GgufFacts

Parameter label, quantization and split position read from a GGUF file name.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-params"></a> `params` | `string` \| `null` | Parameter label, e.g. "3B", "E4B", "26B-A4B"; null when the name has none. |
| <a id="property-part"></a> `part` | \| \{ `count`: `number`; `index`: `number`; \} \| `null` | Split file position ("-00002-of-00003"), or null for a single file. |
| <a id="property-quant"></a> `quant` | `string` \| `null` | Quantization, e.g. "Q4_K_M", "IQ3_XS", "F16"; null when the name has none. |

***

### Hub

A model hub: routes a capability to a record, loads it through a provider factory, keeps loaded
models under a memory budget and queues GPU work.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-env-1"></a> `env` | `readonly` | `Env` \| `undefined` |
| <a id="property-registry"></a> `registry` | `readonly` | [`Registry`](#registry) |

#### Methods

##### busy()

```ts
busy(id?): number;
```

Runs in flight or waiting, for one model id or all.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id?` | `string` |

###### Returns

`number`

##### chain()

```ts
chain(name): <R>(fn) => Promise<R>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

\<`R`\>(`fn`) => `Promise`\<`R`\>

##### exclusive()

```ts
exclusive<R>(
   resource, 
   fn, 
   opts?
): Promise<R>;
```

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-r"></a> `R` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `resource` | `string` |
| `fn` | () => `Promise`\<`R`\> |
| `opts?` | [`ExclusiveOptions`](#exclusiveoptions) |

###### Returns

`Promise`\<`R`\>

##### frameMs()

```ts
frameMs(): number;
```

Mean of the reported frame times, or 0 with none.

###### Returns

`number`

##### onBusy()

```ts
onBusy(fn): () => void;
```

Called with the total busy count whenever it changes. Returns an unsubscribe.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`count`) => `void` |

###### Returns

() => `void`

##### onLoad()

```ts
onLoad(fn): () => void;
```

Called with every load step of every model (fetch, compile, warm, ready, failed). Returns an unsubscribe.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`e`) => `void` |

###### Returns

() => `void`

##### provide()

```ts
provide<T>(provider, factory): void;
```

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `provider` | [`Provider`](#provider) |
| `factory` | [`Factory`](#factory)\<`T`\> |

###### Returns

`void`

##### release()

```ts
release(l): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `l` | [`Loaded`](#loaded) |

###### Returns

`void`

##### reportFrame()

```ts
reportFrame(ms): void;
```

Report one rendered frame's time in ms; the last 30 feed `frameBudgetMs`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ms` | `number` |

###### Returns

`void`

##### residentMB()

```ts
residentMB(): number;
```

###### Returns

`number`

##### run()

```ts
run<T, R>(
   l, 
   fn, 
   opts?
): Promise<R>;
```

Run inference on a loaded model; webgpu models take the gpu lock.

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` |
| <a id="type-parameter-r-1"></a> `R` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `l` | [`Loaded`](#loaded)\<`T`\> |
| `fn` | (`value`) => `Promise`\<`R`\> |
| `opts?` | [`RunOptions`](#runoptions) |

###### Returns

`Promise`\<`R`\>

##### status()

```ts
status(): HubStatus[];
```

###### Returns

[`HubStatus`](#hubstatus-1)[]

##### unload()

```ts
unload(id): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

`Promise`\<`void`\>

##### use()

```ts
use<T>(what, opts?): Promise<Loaded<T>>;
```

Load (or reuse) the model for a capability or record id.

###### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-2"></a> `T` | `unknown` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `what` | \| [`Capability`](#capability) \| \{ `id`: `string`; \} |
| `opts?` | [`UseOptions`](#useoptions) |

###### Returns

`Promise`\<[`Loaded`](#loaded)\<`T`\>\>

***

### HubOptions

Options for `createHub`: registry, env, memory budget, the stub switch, clock, timers and the
licence notice.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-budgetmb-1"></a> `budgetMB?` | `number` | Memory budget for resident models, in MB. Default no limit. |
| <a id="property-env-2"></a> `env?` | `Env` | - |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onlicence"></a> `onLicence?` | (`line`, `record`) => `void` | Called once per record, before its first load, with the weight licence line. Default: one console.info line per model per page session; pass `() => {}` to silence it. Every model reference states its licence. |
| <a id="property-registry-1"></a> `registry?` | [`Registry`](#registry) | - |
| <a id="property-stub"></a> `stub?` | `boolean` | Route every request to the stub provider (the `?stub` switch). |
| <a id="property-timers"></a> `timers?` | [`HubTimers`](#hubtimers) | - |

***

### HubStatus

One loaded model as the hub reports it: id, provider, device, size, references, last use and runs
in flight.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-busy"></a> `busy` | `number` | Runs in flight or waiting. |
| <a id="property-device"></a> `device` | [`Device`](#device) | - |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-lastused"></a> `lastUsed` | `number` | - |
| <a id="property-provider"></a> `provider` | [`Provider`](#provider) | - |
| <a id="property-refs"></a> `refs` | `number` | - |
| <a id="property-sizemb"></a> `sizeMB` | `number` \| `null` | - |

***

### HubTimers

Clock and waits the scheduler uses; tests inject fakes.

#### Methods

##### idle()

```ts
idle(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### sleep()

```ts
sleep(ms): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ms` | `number` |

###### Returns

`Promise`\<`void`\>

***

### LadderFailure

One rung that failed, with the kind of error and its message.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-error"></a> `error` | `string` |
| <a id="property-kind"></a> `kind` | [`ErrorKind`](#errorkind) |
| <a id="property-rung-1"></a> `rung` | [`Rung`](#rung) |

***

### Loaded

A model the hub loaded: its id, record, the rung that worked, the runtime object and the rungs
that failed first.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-3"></a> `T` | `unknown` |

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-failures-1"></a> `failures` | `readonly` | [`LadderFailure`](#ladderfailure)[] | Rungs that failed before this one loaded. |
| <a id="property-id-1"></a> `id` | `readonly` | `string` | - |
| <a id="property-record-1"></a> `record` | `readonly` | [`ModelRecord`](#modelrecord) | - |
| <a id="property-rung-2"></a> `rung` | `readonly` | [`Rung`](#rung) | - |
| <a id="property-value"></a> `value` | `readonly` | `T` | - |

***

### LoadEvent

One step of a load, heard by every listener; one model keeps one id across ladder rungs.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-error-1"></a> `error?` | `string` | For "failed": the reason. |
| <a id="property-file"></a> `file?` | `string` | The file being fetched, when the factory names one. |
| <a id="property-fraction"></a> `fraction` | `number` \| `null` | 0 to 1, or null while unknown. |
| <a id="property-id-2"></a> `id` | `string` | - |
| <a id="property-phase"></a> `phase` | [`LoadPhase`](#loadphase) | - |
| <a id="property-rung-3"></a> `rung` | `number` | Index of the ladder rung the event belongs to. |

***

### ModelRecord

A model: what it provides, the runtime that runs it, where its weights are, its size with the
size source, the device and dtype ladder, quirks and the weight licence.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-badge"></a> `badge?` | `string` | The owner's label for the row, verbatim from the tool that listed it, e.g. "best", "default", "fast, capable". |
| <a id="property-censorship"></a> `censorship?` | [`Censorship`](#censorship) | - |
| <a id="property-commercial"></a> `commercial` | `boolean` \| `"unknown"` | Whether the weight licence allows commercial use; "unknown" when not checked. |
| <a id="property-ctx"></a> `ctx?` | `number` | - |
| <a id="property-family"></a> `family?` | `string` | - |
| <a id="property-group"></a> `group?` | `string` | Catalogue group the row sits in, e.g. "start here", "uncensored", "reasoning". |
| <a id="property-id-3"></a> `id` | `string` | - |
| <a id="property-label"></a> `label?` | `string` | - |
| <a id="property-ladder"></a> `ladder` | [`Rung`](#rung)[] | - |
| <a id="property-licence"></a> `licence` | `string` | Weight licence, by name. Required. |
| <a id="property-nodownload"></a> `noDownload?` | `boolean` | Nothing to fetch: a script, a physical model, or a model the browser has built in. |
| <a id="property-note"></a> `note?` | `string` | One honest line for the catalogue row. |
| <a id="property-notes"></a> `notes?` | `string`[] | - |
| <a id="property-params-1"></a> `params?` | `string` | Parameter count label, e.g. "3B", "360M", "E4B". |
| <a id="property-place"></a> `place?` | `"gpu"` \| `"cpu-worker"` \| `"main"` | Where the model should run when the hub places it. Default "gpu" for webgpu rungs. |
| <a id="property-provider-1"></a> `provider` | [`Provider`](#provider) | - |
| <a id="property-provides-1"></a> `provides` | [`Capability`](#capability)[] | - |
| <a id="property-quant-1"></a> `quant?` | `string` | Quantization as the runtime names it, e.g. "q4f16_1", "Q4_K_M", "q4". |
| <a id="property-quirks"></a> `quirks?` | [`Quirks`](#quirks) | - |
| <a id="property-runtime"></a> `runtime?` | `string` | Runtime pin the record was written against, e.g. "@mlc-ai/web-llm@0.2.84". |
| <a id="property-sizemb-1"></a> `sizeMB` | `number` \| `null` | - |
| <a id="property-sizesource"></a> `sizeSource` | [`SizeSource`](#sizesource) | - |
| <a id="property-source-1"></a> `source` | [`ModelSource`](#modelsource) | - |
| <a id="property-speed"></a> `speed?` | [`Speed`](#speed) | One word for how quick it feels on a machine it fits: instant, fast, steady or slow. |
| <a id="property-tags"></a> `tags?` | `string`[] | Catalogue tags shown as chips, e.g. "tools", "low vram", "think". |
| <a id="property-tier"></a> `tier?` | [`Tier`](#tier) | - |
| <a id="property-unrunnable"></a> `unrunnable?` | `string` | Why no runtime here loads this record yet; set, the record is listed and never offered to load. |
| <a id="property-verdict"></a> `verdict?` | `string` | Two to four words a person picks by, in the owner's voice: "best all round", "likes json", "fast, dim". |
| <a id="property-vrammb"></a> `vramMB?` | `number` \| `null` | GPU memory the runtime states for the model, in MB; a second figure beside the download size. |
| <a id="property-vramsource"></a> `vramSource?` | [`SizeSource`](#sizesource) | - |

***

### ModelSource

Where a model's weights are: repo, revision, files, URL, runtime model id and SHA-256.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-file-1"></a> `file?` | `string` | Single file (GGUF) or the main graph. |
| <a id="property-files"></a> `files?` | `object`[] | Extra files (external data, tokenizer, config). |
| <a id="property-modelid"></a> `modelId?` | `string` | Runtime model id (WebLLM catalog id, transformers.js model id). |
| <a id="property-repo"></a> `repo?` | `string` | Hugging Face repo or similar. |
| <a id="property-revision"></a> `revision?` | `string` | Pin a commit for reproducible loads. |
| <a id="property-sha256"></a> `sha256?` | `string` | - |
| <a id="property-url"></a> `url?` | `string` | - |

***

### OrtRung

onnxruntime-web session options for one rung: execution providers and graph optimization level.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-executionproviders"></a> `executionProviders` | `string`[] |
| <a id="property-graphoptimizationlevel"></a> `graphOptimizationLevel?` | `"disabled"` \| `"basic"` \| `"extended"` \| `"all"` |

***

### Preset

A size preset that fills the slot rack with catalogue ids, named by weight class.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-id-4"></a> `id` | `string` & `object` \| `"phone"` \| `"laptop"` \| `"desktop"` | - |
| <a id="property-label-1"></a> `label` | `string` | Named by weight class. |
| <a id="property-picks"></a> `picks` | `Partial`\<`Record`\<[`Slot`](#slot), `string`\>\> | - |

***

### PresetTotal

The summed download of a preset in MB (computed), the weakest size source among its parts, each
part, and the picks with no known size.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-mb-1"></a> `mb` | `number` | Summed download of the picks with a known size, in MB (computed). |
| <a id="property-parts"></a> `parts` | `object`[] | - |
| <a id="property-source-2"></a> `source` | [`SizeSource`](#sizesource) | The weakest source word among the addends: one inferred size makes the total inferred. |
| <a id="property-unknown"></a> `unknown` | `string`[] | Picks whose id has no record, or whose record has no size. |

***

### Query

Filters for `find` and `route`: capability, provider, size class, largest size, commercial use and env.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-commercial-1"></a> `commercial?` | `boolean` | Drop records whose weight licence forbids commercial use. |
| <a id="property-env-3"></a> `env?` | `Env` | - |
| <a id="property-maxmb"></a> `maxMB?` | `number` | - |
| <a id="property-provider-2"></a> `provider?` | [`Provider`](#provider) | - |
| <a id="property-provides-2"></a> `provides?` | [`Capability`](#capability) | - |
| <a id="property-size"></a> `size?` | [`SizeClass`](#sizeclass) | - |

***

### Quirks

Per model behaviour app code needs: system role, turn alternation, reasoning format, tool
formats, warnings and image order.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-maxtokensaction"></a> `maxTokensAction?` | `number` | Low token cap for action turns. |
| <a id="property-nativetools"></a> `nativeTools?` | `boolean` | Supports OpenAI style tools in its runtime (WebLLM Hermes builds). |
| <a id="property-processorimagesfirst"></a> `processorImagesFirst?` | `boolean` | The model's transformers.js processor takes the images before the text (LFM2-VL, LLaVA, PaliGemma, Pixtral); Idefics3 and SmolVLM take the text first. |
| <a id="property-repetitionpenalty"></a> `repetitionPenalty?` | `number` | - |
| <a id="property-strictalternation"></a> `strictAlternation?` | `boolean` | Turns must alternate user and assistant and start with user (Gemma). |
| <a id="property-systemrole"></a> `systemRole?` | `boolean` | false: the chat template has no system role (Gemma 3); merge it into the first user turn. |
| <a id="property-think"></a> `think?` | `"tags"` \| `"channel"` \| `"none"` | How the model emits reasoning: "tags" for think blocks, "none" when it never does. |
| <a id="property-toolcalltags"></a> `toolCallTags?` | `boolean` | Hermes and Qwen style `<tool_call>` prompt format. |
| <a id="property-warnings"></a> `warnings?` | `string`[] | Notes such as "fp16 overflows on webgpu"; shown in pickers. |

***

### Reason

One row of a reasons list: label, value and a lowercase line saying why.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-label-2"></a> `label` | `string` |
| <a id="property-value-1"></a> `value` | `string` |
| <a id="property-why-1"></a> `why` | `string` |

***

### Registry

A set of model records you can add to, get, list, filter and route a request through.

#### Methods

##### add()

```ts
add(...recs): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`recs` | [`ModelRecord`](#modelrecord)[] |

###### Returns

`void`

##### find()

```ts
find(q): ModelRecord[];
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | [`Query`](#query) |

###### Returns

[`ModelRecord`](#modelrecord)[]

##### get()

```ts
get(id): ModelRecord | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

###### Returns

[`ModelRecord`](#modelrecord) \| `undefined`

##### list()

```ts
list(): ModelRecord[];
```

###### Returns

[`ModelRecord`](#modelrecord)[]

##### route()

```ts
route(q): ModelRecord | undefined;
```

The record the hub should load for a request: runnable here, under the budget, the requested size first, then largest that fits.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `q` | [`Query`](#query) |

###### Returns

[`ModelRecord`](#modelrecord) \| `undefined`

***

### RepoPin

The pinned commit of a Hugging Face repo and the SHA-256 and size of each pinned file.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-files-1"></a> `files` | `readonly` | `Readonly`\<`Record`\<`string`, [`PinFile`](#pinfile)\>\> |
| <a id="property-revision-1"></a> `revision` | `readonly` | `string` |

***

### Rung

One device and dtype to try for a model, with the env needs, onnxruntime options and runtime
knobs for it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-device-1"></a> `device` | [`Device`](#device) | - |
| <a id="property-dtype"></a> `dtype?` | `string` \| `Record`\<`string`, `string`\> | One dtype, or per sub graph dtypes for transformers.js (`{ embed_tokens: "fp16", decoder_model_merged: "q4" }`). |
| <a id="property-freshheap"></a> `freshHeap?` | `boolean` | Load into a fresh wasm heap. |
| <a id="property-needs"></a> `needs?` | [`Need`](#need)[] | Env capabilities the rung needs; rungs whose needs are missing are skipped. |
| <a id="property-options"></a> `options?` | `Record`\<`string`, `unknown`\> | Runtime specific knobs, e.g. `{ context_window_size: 4096 }` for WebLLM. |
| <a id="property-ort"></a> `ort?` | [`OrtRung`](#ortrung) | onnxruntime-web session options for this rung. |

***

### RunOptions

Scheduling for one `hub.run`: least gap between starts, idle only, a frame budget and whether to
wait or skip.

#### Extends

- [`ExclusiveOptions`](#exclusiveoptions)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-framebudgetms"></a> `frameBudgetMs?` | `number` | Start only while the mean of the last reported frame times is at most this many ms. | - |
| <a id="property-idleonly"></a> `idleOnly?` | `boolean` | Start only from an idle callback (requestIdleCallback where present). | - |
| <a id="property-maxdeferms"></a> `maxDeferMs?` | `number` | Give up waiting for the frame budget after this many ms and run anyway. Default 1000. | - |
| <a id="property-minintervalms"></a> `minIntervalMs?` | `number` | Least ms between the starts of two runs of this model. Default 0. | - |
| <a id="property-priority-1"></a> `priority?` | `number` | - | [`ExclusiveOptions`](#exclusiveoptions).[`priority`](#property-priority) |
| <a id="property-signal-2"></a> `signal?` | `AbortSignal` | - | [`ExclusiveOptions`](#exclusiveoptions).[`signal`](#property-signal) |
| <a id="property-when"></a> `when?` | `"wait"` \| `"skip"` | "wait" (default) delays the run until it is due; "skip" rejects with HubError code "skipped" instead. | - |

***

### StorageEstimate

Storage numbers as `@hackbuild/weights` store.estimate() returns them.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-quota"></a> `quota` | `number` \| `null` |
| <a id="property-used"></a> `used` | `number` \| `null` |

#### Methods

##### fits()

```ts
fits(bytes): boolean;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `number` |

###### Returns

`boolean`

***

### UseOptions

Options for `hub.use`: size class, largest size, commercial use, abort signal and load priority.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-commercial-2"></a> `commercial?` | `boolean` | - |
| <a id="property-maxmb-1"></a> `maxMB?` | `number` | - |
| <a id="property-priority-2"></a> `priority?` | `number` | Priority of the load in the gpu queue. |
| <a id="property-signal-3"></a> `signal?` | `AbortSignal` | - |
| <a id="property-size-1"></a> `size?` | [`SizeClass`](#sizeclass) | - |

## Type Aliases

### Capability

```ts
type Capability = KnownCapability | string & object;
```

Known names plus any string a later package adds.

***

### Censorship

```ts
type Censorship = "stock" | "uncensored" | "abliterated" | "unknown";
```

How the weights treat refusals, from the record's label or repo name; never guessed from substrings at run time.

***

### Device

```ts
type Device = "webgpu" | "wasm" | "webgl" | "cpu" | "browser" | "remote";
```

Where a rung runs: webgpu, wasm, webgl, cpu, the browser's built in model, or a remote endpoint.

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

### Factory

```ts
type Factory<T> = (ctx) => Promise<T>;
```

Builds a runtime object for one rung. Throw to move to the next rung.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t-4"></a> `T` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`FactoryContext`](#factorycontext) |

#### Returns

`Promise`\<`T`\>

***

### Fit

```ts
type Fit = 
  | "fits"
  | "fits on cpu, slow"
  | "needs f16"
  | "needs webgpu"
  | "over memory"
  | "over storage"
  | "cannot run here";
```

How a record fits this machine, best first: "fits", then the reasons it does not, down to "cannot run here".

***

### KnownCapability

```ts
type KnownCapability = 
  | "chat"
  | "tools"
  | "vision.caption"
  | "vision.ask"
  | "embed"
  | "rerank"
  | "transcribe"
  | "speak"
  | "vad"
  | "depth"
  | "detect"
  | "segment"
  | "landmarks"
  | "stems"
  | "notes"
  | "imagegen"
  | "biosignal";
```

The capability names the packages in this repository provide.

***

### LoadPhase

```ts
type LoadPhase = "fetch" | "compile" | "warm" | "ready" | "failed";
```

A step of a load: fetch, compile, warm, ready or failed.

***

### Need

```ts
type Need = "webgpu" | "shader-f16" | "isolated" | "http" | "promptApi";
```

An env capability a rung needs: webgpu, shader-f16, cross origin isolation, an http page or the
Prompt API.

***

### PinFile

```ts
type PinFile = readonly [sha256: string, bytes: number, source: "measured" | "vendor"];
```

One pinned file as SHA-256, byte count and whether the hash was measured or taken from the vendor.

***

### Provider

```ts
type Provider = 
  | "webllm"
  | "wllama"
  | "tjs"
  | "ort"
  | "prompt-api"
  | "remote"
  | "mediapipe"
  | "tfjs"
  | "system"
  | "stub"
  | string & object;
```

The runtime that runs a record, such as webllm, wllama, transformers.js ("tjs"), onnxruntime
("ort") or the stub.

***

### SizeClass

```ts
type SizeClass = "tiny" | "small" | "medium" | "large";
```

A size class by download size: tiny, small, medium or large.

***

### SizeSource

```ts
type SizeSource = "vendor" | "measured" | "computed" | "inferred" | "unknown";
```

Where a size figure comes from: vendor, measured, computed, inferred or unknown.

***

### Slot

```ts
type Slot = 
  | "brain"
  | "smallBrain"
  | "embedder"
  | "ears"
  | "vad"
  | "voice"
  | "eyes"
  | "depth"
  | "mask"
  | "detector"
  | "image";
```

The organs of the slot rack, in rack order.

***

### Speed

```ts
type Speed = "instant" | "fast" | "steady" | "slow";
```

How quick a model feels where it fits, slowest last.

***

### Tier

```ts
type Tier = "tiny" | "small" | "medium" | "large";
```

Memory tier the model is comfortable in, the same cut as `sizeClass`.

## Variables

### CATALOG

```ts
const CATALOG: readonly ModelRecord[];
```

The starter model records, each with its size source and weight licence.

***

### CPU\_CAP\_MB

```ts
const CPU_CAP_MB: number;
```

Cap on cpu: reply speed falls with size long before memory runs out. Vendor for a native runtime, proposed here.

***

### FALLBACK\_BUDGET\_MB

```ts
const FALLBACK_BUDGET_MB: number;
```

Budget when the browser does not report device memory. Vendor for a native runtime, proposed here.

***

### MEMORY\_SHARE

```ts
const MEMORY_SHARE: 0.45 = 0.45;
```

Share of device memory a model may take; it shares memory with the OS, the browser, the scene and the voice. Vendor for a native runtime, proposed here until a browser run measures it.

***

### PINNED\_AT

```ts
const PINNED_AT: "2026-11-24" = "2026-11-24";
```

The date the pins were taken.

***

### PINS

```ts
const PINS: Readonly<Record<string, RepoPin>>;
```

Pinned commits and file hashes per Hugging Face repo, written by tools/pin-weights.mjs.

***

### PRESETS

```ts
const PRESETS: readonly Preset[];
```

Size presets that fill the rack, named by weight class (three presets,
light to heavy). Picks are CATALOG ids; the total
is computed from the records, never written by hand.

***

### SLOTS

```ts
const SLOTS: readonly object[];
```

The slots of the model rack, in rack order, with their labels.

***

### SPEEDS

```ts
const SPEEDS: readonly Speed[];
```

The speed words a record may carry, fastest first.

***

### START\_GROUP

```ts
const START_GROUP: "start here" = "start here";
```

The catalogue group a first visit offers downloads from, when the catalogue has one; other groups are a choice the person makes.

***

### STEP\_UP

```ts
const STEP_UP: 1.5 = 1.5;
```

A catalogue model is offered over a stored one only when it is this many times larger (a real step up, not a sideways move). Vendor, proposed here.

## Functions

### budgetFor()

```ts
function budgetFor(env): Budget;
```

The memory budget for one model on this machine, from `deviceMemoryGB` and the backend.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Env` \| `undefined` |

#### Returns

[`Budget`](#budget)

***

### classifyError()

```ts
function classifyError(e): ErrorKind;
```

Name the failure so a ladder and a status line can act on it. Patterns come from runtime error messages seen in logs.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | `unknown` |

#### Returns

[`ErrorKind`](#errorkind)

***

### createHub()

```ts
function createHub(opts?): Hub;
```

Creates a model hub over a registry, with the memory budget and licence notice from `opts`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`HubOptions`](#huboptions) |

#### Returns

[`Hub`](#hub)

***

### createRegistry()

```ts
function createRegistry(initial?): Registry;
```

Creates a registry holding `initial`, validating each record and setting the pinned revision of
pinned repos.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `initial?` | readonly [`ModelRecord`](#modelrecord)[] | `[]` |

#### Returns

[`Registry`](#registry)

***

### firstInSession()

```ts
function firstInSession(model): boolean;
```

True the first time a model is named in this page session; shared by every hackbuild package through a global symbol.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `model` | `string` |

#### Returns

`boolean`

***

### fitOf()

```ts
function fitOf(
   rec, 
   env, 
   estimate?, 
   budget?
): FitResult;
```

Whether a record fits this machine, from three checks: the ladder
against the probe (webgpu and shader-f16), the memory budget against
VRAM or download size, and the storage estimate against the download.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`ModelRecord`](#modelrecord) |
| `env` | `Env` \| `undefined` |
| `estimate?` | [`StorageEstimate`](#storageestimate) \| `null` |
| `budget?` | [`Budget`](#budget) |

#### Returns

[`FitResult`](#fitresult)

***

### ggufFacts()

```ts
function ggufFacts(fileName): GgufFacts;
```

Facts a GGUF file name carries, for a custom model row before any fetch.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fileName` | `string` |

#### Returns

[`GgufFacts`](#gguffacts)

***

### ladderFor()

```ts
function ladderFor(rec, env?): object;
```

The rungs of a record this env can attempt, in order, with the reason for each one dropped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`ModelRecord`](#modelrecord) |
| `env?` | `Env` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `rungs` | [`Rung`](#rung)[] |
| `skipped` | `object`[] |

***

### needsOf()

```ts
function needsOf(r): Need[];
```

Implicit needs of a rung: a webgpu device needs an adapter, an f16 dtype needs shader-f16.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`Rung`](#rung) |

#### Returns

[`Need`](#need)[]

***

### ortLadder()

```ts
function ortLadder(): Rung[];
```

The onnxruntime-web ladder to walk after one fetch: webgpu at basic, all, disabled, then wasm.

#### Returns

[`Rung`](#rung)[]

***

### pickModel()

```ts
function pickModel(env, input): object;
```

The model to start with: the largest stored model that fits the budget, with an offer to download when that helps.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Env` \| `undefined` |
| `input` | [`DefaultsInput`](#defaultsinput) |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `download` | [`ModelRecord`](#modelrecord) \| `null` |
| `model` | `string` \| `null` |
| `why` | `string` |

***

### pinnedBase()

```ts
function pinnedBase(repo, fallback?): string;
```

A resolve URL base at the pinned commit, or at `fallback` when the repo is not pinned.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `repo` | `string` | `undefined` |
| `fallback?` | `string` | `"main"` |

#### Returns

`string`

***

### pinnedSha()

```ts
function pinnedSha(url): string | undefined;
```

SHA-256 of a Hugging Face resolve URL at a pinned commit, or undefined (other host, unpinned repo, other revision).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |

#### Returns

`string` \| `undefined`

***

### pinnedUrl()

```ts
function pinnedUrl(url, revisionFor?): string;
```

A Hugging Face resolve URL at the pinned commit when it names a pinned
repo at `main` (transformers.js lists files at main before it loads at
the revision it was given); any other URL comes back unchanged.
`revisionFor` names revisions for repos outside the pins.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` |
| `revisionFor?` | (`repo`) => `string` \| `undefined` |

#### Returns

`string`

***

### pinOf()

```ts
function pinOf(repo): RepoPin | undefined;
```

The pin of a repo, or undefined when the repo is not pinned.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `repo` | `string` \| `undefined` |

#### Returns

[`RepoPin`](#repopin) \| `undefined`

***

### presetTotal()

```ts
function presetTotal(preset, records): PresetTotal;
```

The summed download a preset states before anything loads; one record is loaded once even when two slots pick it.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `preset` | [`Preset`](#preset) |
| `records` | \| readonly [`ModelRecord`](#modelrecord)[] \| \{ `get`(`id`): [`ModelRecord`](#modelrecord) \| `undefined`; \} |

#### Returns

[`PresetTotal`](#presettotal)

***

### sizeClass()

```ts
function sizeClass(mb): SizeClass | null;
```

Size class by download size: tiny under 400 MB, small under 1.5 GB, medium under 3.5 GB (inferred cut points).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mb` | `number` \| `null` |

#### Returns

[`SizeClass`](#sizeclass) \| `null`

***

### stubFactory()

```ts
function stubFactory(builders): Factory;
```

A stub factory from per capability builders. Every capability package
exports its own builder (chat echoes, depth returns a ramp, transcribe
returns fixed text) and an app registers them once:
`hub.provide("stub", stubFactory({ chat: () => echoChat(), depth: () => rampDepth() }))`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `builders` | `Record`\<`string`, (`record`) => `unknown`\> |

#### Returns

[`Factory`](#factory)

***

### stubRecord()

```ts
function stubRecord(capability): ModelRecord;
```

A record that serves `capability` from the stub provider, with no weights.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `capability` | [`Capability`](#capability) |

#### Returns

[`ModelRecord`](#modelrecord)

***

### suggestDefaults()

```ts
function suggestDefaults(env, input): Defaults;
```

Defaults for a first visit, from the probe and the catalogue, with one reason per field.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `env` | `Env` \| `undefined` |
| `input` | [`DefaultsInput`](#defaultsinput) |

#### Returns

[`Defaults`](#defaults)

***

### validateRecord()

```ts
function validateRecord(r): void;
```

Throws a RegistryError when a record has no id, licence, capability or ladder, or a malformed
speed, verdict, censorship or VRAM source.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `r` | [`ModelRecord`](#modelrecord) |

#### Returns

`void`

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
| <a id="type-parameter-t-5"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |
| `rungs` | readonly [`Rung`](#rung)[] |
| `attempt` | (`rung`, `index`) => `Promise`\<`T`\> |
| `opts?` | \{ `onFailure?`: (`f`) => `void`; \} |
| `opts.onFailure?` | (`f`) => `void` |

#### Returns

`Promise`\<\{
  `failures`: [`LadderFailure`](#ladderfailure)[];
  `rung`: [`Rung`](#rung);
  `value`: `T`;
\}\>

***

### withPin()

```ts
function withPin(rec): ModelRecord;
```

The record with source.revision set from the pins when it names a pinned repo and has none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`ModelRecord`](#modelrecord) |

#### Returns

[`ModelRecord`](#modelrecord)

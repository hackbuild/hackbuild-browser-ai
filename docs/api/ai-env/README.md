# @hackbuild/ai-env

## Classes

### InlineWorker

A worker shaped object that runs the source on the page. The source is
wrapped in a function in a module and imported from a Blob or data: URL,
so no eval or Function constructor is used, and it runs in strict mode.
Messages are delivered on a later task so ordering matches a real
worker. It shares the page realm, so `globalThis`, the DOM and storage
are in reach: spawnWorker uses it only when the caller lists "inline",
and never for a URL source without a SHA-256.

#### Implements

- [`WorkerLike`](#workerlike)

#### Constructors

##### Constructor

```ts
new InlineWorker(src): InlineWorker;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` |

###### Returns

[`InlineWorker`](#inlineworker)

#### Methods

##### addEventListener()

```ts
addEventListener(type, fn): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"message"` \| `"error"` |
| `fn` | (`ev`) => `void` |

###### Returns

`void`

###### Implementation of

[`WorkerLike`](#workerlike).[`addEventListener`](#addeventlistener-1)

##### postMessage()

```ts
postMessage(data): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `unknown` |

###### Returns

`void`

###### Implementation of

[`WorkerLike`](#workerlike).[`postMessage`](#postmessage-1)

##### removeEventListener()

```ts
removeEventListener(type, fn): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"message"` \| `"error"` |
| `fn` | (`ev`) => `void` |

###### Returns

`void`

###### Implementation of

[`WorkerLike`](#workerlike).[`removeEventListener`](#removeeventlistener-1)

##### terminate()

```ts
terminate(): void;
```

###### Returns

`void`

###### Implementation of

[`WorkerLike`](#workerlike).[`terminate`](#terminate-1)

***

### LoadError

The error importEsm and spawnWorker throw when every URL or rung failed, with one entry per
attempt in `attempts`.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new LoadError(message, attempts): LoadError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `attempts` | `object`[] |

###### Returns

[`LoadError`](#loaderror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-attempts"></a> `attempts` | `readonly` | `object`[] |

## Interfaces

### Env

What the tab can do, as measured by `probe`, with one note per missing capability.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-adapter"></a> `adapter` | \| \{ `architecture`: `string`; `vendor`: `string`; \} \| `null` | Adapter vendor and architecture when the browser exposes them, else null. |
| <a id="property-cachestorage"></a> `cacheStorage` | `boolean` | Cache Storage (caches.open) works on this origin. |
| <a id="property-devicememorygb"></a> `deviceMemoryGB` | `number` \| `null` | navigator.deviceMemory in GB (rounded by the browser), or null. |
| <a id="property-f16"></a> `f16` | `boolean` | The adapter lists the "shader-f16" feature. q4f16 and fp16 models need it. |
| <a id="property-indexeddb"></a> `indexedDB` | `boolean` | indexedDB.open is present. |
| <a id="property-isolated"></a> `isolated` | `boolean` | crossOriginIsolated; wasm threads need it. |
| <a id="property-maxbufferbytes"></a> `maxBufferBytes` | `number` \| `null` | maxBufferSize of the adapter in bytes, or null. |
| <a id="property-notes"></a> `notes` | `string`[] | One line per capability that is missing, lowercase, naming the failure. |
| <a id="property-opfs"></a> `opfs` | `boolean` | navigator.storage.getDirectory() resolved. Always false on file://. |
| <a id="property-promptapi"></a> `promptApi` | `boolean` | Chrome built in Prompt API (globalThis.LanguageModel) is present. |
| <a id="property-protocol"></a> `protocol` | [`Protocol`](#protocol) | - |
| <a id="property-threads"></a> `threads` | `number` | Safe wasm thread count: 1 unless isolated, then up to 4. |
| <a id="property-webgpu"></a> `webgpu` | `boolean` | navigator.gpu.requestAdapter() returned an adapter. |

***

### ImportEsmOptions

Options for `importEsm`: a SHA-256 per URL, source rewrites, the classic worker swap, a free form
patch and attempt callbacks.

#### Extends

- [`LoadDeps`](#loaddeps)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-classicworkers"></a> `classicWorkers?` | `boolean` | Swap module workers for classic workers in the source. Default: true on file://. | - |
| <a id="property-createobjecturl"></a> `createObjectURL?` | (`b`) => `string` | - | [`LoadDeps`](#loaddeps).[`createObjectURL`](#property-createobjecturl-1) |
| <a id="property-fetch"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - | [`LoadDeps`](#loaddeps).[`fetch`](#property-fetch-1) |
| <a id="property-importer"></a> `importer?` | [`Importer`](#importer) | Defaults to a native dynamic import. Tests pass a fake. | [`LoadDeps`](#loaddeps).[`importer`](#property-importer-1) |
| <a id="property-integrity"></a> `integrity?` | `Readonly`\<`Record`\<`string`, `string`\>\> | SHA-256 (lowercase hex) of the fetched text per URL. A URL listed here is always fetched as text and checked before it runs; a mismatch moves to the next URL. | - |
| <a id="property-onattempt"></a> `onAttempt?` | (`a`) => `void` | Log of every attempt, for status UIs. | - |
| <a id="property-onmissed"></a> `onMissed?` | (`missed`, `url`) => `void` | - | - |
| <a id="property-patch"></a> `patch?` | (`src`, `url`) => `string` | Free form patch after the rewrites. | - |
| <a id="property-protocol-1"></a> `protocol?` | `string` | - | [`LoadDeps`](#loaddeps).[`protocol`](#property-protocol-2) |
| <a id="property-revokeobjecturl"></a> `revokeObjectURL?` | (`u`) => `void` | - | [`LoadDeps`](#loaddeps).[`revokeObjectURL`](#property-revokeobjecturl-1) |
| <a id="property-rewrites"></a> `rewrites?` | readonly [`Rewrite`](#rewrite)[] | Rewrites applied to the fetched text. Missing matches are reported through onMissed. | - |

***

### LoadDeps

The browser functions the loaders call (fetch, import, object URLs, page protocol); tests pass fakes.

#### Extended by

- [`ImportEsmOptions`](#importesmoptions)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-createobjecturl-1"></a> `createObjectURL?` | (`b`) => `string` | - |
| <a id="property-fetch-1"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - |
| <a id="property-importer-1"></a> `importer?` | [`Importer`](#importer) | Defaults to a native dynamic import. Tests pass a fake. |
| <a id="property-protocol-2"></a> `protocol?` | `string` | - |
| <a id="property-revokeobjecturl-1"></a> `revokeObjectURL?` | (`u`) => `void` | - |

***

### ProbeGlobals

What the probe reads. Defaults to globalThis; tests pass fakes.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-caches"></a> `caches?` | `unknown` |
| <a id="property-crossoriginisolated"></a> `crossOriginIsolated?` | `boolean` |
| <a id="property-indexeddb-1"></a> `indexedDB?` | `unknown` |
| <a id="property-languagemodel"></a> `LanguageModel?` | `unknown` |
| <a id="property-location"></a> `location?` | `object` |
| `location.protocol?` | `string` |
| <a id="property-navigator"></a> `navigator?` | `unknown` |

***

### ProbeOptions

Options for `probe`: the globals to read, the timeout for adapter and OPFS calls, and the thread cap.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-globals"></a> `globals?` | [`ProbeGlobals`](#probeglobals) | - |
| <a id="property-maxthreads"></a> `maxThreads?` | `number` | Upper bound for threads when isolated. Default 4. |
| <a id="property-timeoutms"></a> `timeoutMs?` | `number` | Give up on requestAdapter or getDirectory after this many ms. Default 3000. |

***

### RewriteResult

The rewritten text and the rewrites that matched nothing.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-missed"></a> `missed` | `object`[] | Index and pattern of each rewrite that matched nothing. |
| <a id="property-text"></a> `text` | `string` | - |

***

### Spawned

A started worker, the rung that started it, and the rungs that failed before it.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-failures"></a> `failures` | `object`[] |
| <a id="property-rung"></a> `rung` | [`WorkerRung`](#workerrung) |
| <a id="property-worker"></a> `worker` | [`WorkerLike`](#workerlike) |

***

### SpawnOptions

Options for `spawnWorker`: rung order, rewrites, a prelude, a base URL, the handshake timeout and
the Worker constructor.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-base"></a> `base?` | `string` | Base URL for relative importScripts and imports in the source. |
| <a id="property-createobjecturl-2"></a> `createObjectURL?` | (`b`) => `string` | - |
| <a id="property-fetch-2"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - |
| <a id="property-name"></a> `name?` | `string` | - |
| <a id="property-onmissed-1"></a> `onMissed?` | (`missed`) => `void` | - |
| <a id="property-prefer"></a> `prefer?` | readonly [`WorkerRung`](#workerrung)[] | - |
| <a id="property-prelude"></a> `prelude?` | `string` | Code placed before the source. |
| <a id="property-readyms"></a> `readyMs?` | `number` | How long to wait for the handshake. Default 4000 ms. |
| <a id="property-revokeobjecturl-2"></a> `revokeObjectURL?` | (`u`) => `void` | - |
| <a id="property-rewrites-1"></a> `rewrites?` | readonly [`Rewrite`](#rewrite)[] | Applied to the worker source before spawning. |
| <a id="property-worker-1"></a> `Worker?` | new (`url`, `opts?`) => [`WorkerLike`](#workerlike) | Worker constructor. Default globalThis.Worker. |

***

### WorkerLike

The parts of Worker the ladder uses. A real Worker satisfies it.

#### Methods

##### addEventListener()

```ts
addEventListener(type, fn): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"message"` \| `"error"` |
| `fn` | (`ev`) => `void` |

###### Returns

`void`

##### postMessage()

```ts
postMessage(msg, transfer?): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `msg` | `unknown` |
| `transfer?` | `Transferable`[] |

###### Returns

`void`

##### removeEventListener()

```ts
removeEventListener(type, fn): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | `"message"` \| `"error"` |
| `fn` | (`ev`) => `void` |

###### Returns

`void`

##### terminate()

```ts
terminate(): void;
```

###### Returns

`void`

## Type Aliases

### Importer

```ts
type Importer = (specifier) => Promise<unknown>;
```

A function that imports a module specifier, such as a dynamic `import()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `specifier` | `string` |

#### Returns

`Promise`\<`unknown`\>

***

### Protocol

```ts
type Protocol = "file" | "http" | "https" | "other";
```

Capability probe. Reports what the tab can do before a runtime is chosen:
WebGPU adapter and shader-f16, cross origin isolation, the page protocol,
OPFS, how many wasm threads are safe, and device memory when the browser
says. Each field is measured by trying the API; nothing is assumed from
the user agent.

***

### Rewrite

```ts
type Rewrite = readonly [pattern: RegExp | string, replacement: string];
```

Source text rewriting for runtimes that must run from file://.
Every rewrite reports whether it matched, so an upstream change that
moves a patched string is caught at load time instead of failing later.

***

### WorkerRung

```ts
type WorkerRung = "module-blob" | "classic-blob" | "inline";
```

A way to start a worker: a module worker from a Blob, a classic worker from a Blob, or the source
run on the page.

## Functions

### absolutizeImports()

```ts
function absolutizeImports(src, base): string;
```

Make relative import specifiers absolute against `base`, so a module
imported from a Blob or data: URL can still reach its siblings.
Covers static `from "./x"`, bare `import "./x"` and dynamic `import("./x")`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` |
| `base` | `string` |

#### Returns

`string`

***

### base64ToBytes()

```ts
function base64ToBytes(b64): Uint8Array;
```

Decodes base64 text to bytes, skipping characters outside the base64 alphabet.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b64` | `string` |

#### Returns

`Uint8Array`

***

### bytesToBase64()

```ts
function bytesToBase64(bytes): string;
```

Base64 of bytes, built in 32 KB steps so no call takes a huge argument list.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

#### Returns

`string`

***

### importEsm()

```ts
function importEsm<T>(urls, opts?): Promise<T>;
```

Imports an ES module from the first URL that loads, through plain import, then a patched Blob
URL, then a base64 data: URL, checking a SHA-256 when you give one.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `urls` | `string` \| readonly `string`[] |
| `opts?` | [`ImportEsmOptions`](#importesmoptions) |

#### Returns

`Promise`\<`T`\>

***

### probe()

```ts
function probe(opts?): Promise<Env>;
```

Measures what the tab can do: WebGPU and shader-f16, cross origin isolation, OPFS, Cache Storage,
IndexedDB, safe wasm threads, device memory and the Prompt API.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`ProbeOptions`](#probeoptions) |

#### Returns

`Promise`\<[`Env`](#env)\>

***

### protocolOf()

```ts
function protocolOf(proto): Protocol;
```

Maps a `location.protocol` string to "file", "http", "https" or "other".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `proto` | `string` \| `undefined` |

#### Returns

[`Protocol`](#protocol)

***

### rewriteSource()

```ts
function rewriteSource(src, rewrites): RewriteResult;
```

Applies string or RegExp rewrites to source text and reports each one that matched nothing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` |
| `rewrites` | readonly [`Rewrite`](#rewrite)[] |

#### Returns

[`RewriteResult`](#rewriteresult)

***

### sha256Text()

```ts
function sha256Text(text): Promise<string>;
```

Lowercase hex SHA-256 of a string's UTF-8 bytes, through Web Crypto.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`Promise`\<`string`\>

***

### spawnWorker()

```ts
function spawnWorker(source, opts?): Promise<Spawned>;
```

Spawn a worker from source text or a URL to source text, walking the
rungs in `prefer` (default module-blob, classic-blob). The inline rung
runs on the page and is used only when listed; for a URL source it also
needs `sha256`. The ready handshake message is swallowed; the caller
sees only its own messages.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `source` | \| `string` \| \{ `sha256?`: `string`; `url`: `string`; \} |
| `opts?` | [`SpawnOptions`](#spawnoptions) |

#### Returns

`Promise`\<[`Spawned`](#spawned)\>

***

### textToDataUrl()

```ts
function textToDataUrl(text, mime?): string;
```

Encodes text as a base64 data: URL, JavaScript by default.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `mime?` | `string` | `"text/javascript"` |

#### Returns

`string`

***

### toClassicWorker()

```ts
function toClassicWorker(src): object;
```

Turn module workers into classic workers: Chrome refuses module workers
from a file:// page. Other option keys
are kept. Returns the text and how many constructors changed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | `string` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `count` | `number` |
| `text` | `string` |

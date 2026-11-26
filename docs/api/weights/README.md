# @hackbuild/weights

## Classes

### Sha256

Incremental SHA-256: call `update` with each chunk as it arrives, then `digestHex` once, so a
file of several GB is never held in one buffer.

#### Constructors

##### Constructor

```ts
new Sha256(): Sha256;
```

###### Returns

[`Sha256`](#sha256)

#### Methods

##### digestHex()

```ts
digestHex(): string;
```

###### Returns

`string`

##### update()

```ts
update(data): this;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `Uint8Array` |

###### Returns

`this`

***

### WeightError

The error the store throws, with a `code` of "http", "sha256", "quota", "abort" or "range".

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new WeightError(code, message): WeightError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `code` | `"http"` \| `"sha256"` \| `"quota"` \| `"abort"` \| `"range"` |
| `message` | `string` |

###### Returns

[`WeightError`](#weighterror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `readonly` | `"http"` \| `"sha256"` \| `"quota"` \| `"abort"` \| `"range"` |

## Interfaces

### Backend

A storage backend that keeps each weight file as numbered parts plus one meta record.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `readonly` | [`BackendName`](#backendname) |

#### Methods

##### getMeta()

```ts
getMeta(key): Promise<Meta | null>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<[`Meta`](#meta) \| `null`\>

##### getPart()

```ts
getPart(key, n): Promise<Blob | null>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `n` | `number` |

###### Returns

`Promise`\<`Blob` \| `null`\>

##### keys()

```ts
keys(): Promise<string[]>;
```

###### Returns

`Promise`\<`string`[]\>

##### putMeta()

```ts
putMeta(meta): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `meta` | [`Meta`](#meta) |

###### Returns

`Promise`\<`void`\>

##### putPart()

```ts
putPart(
   key, 
   n, 
   part
): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |
| `n` | `number` |
| `part` | `Blob` |

###### Returns

`Promise`\<`void`\>

##### remove()

```ts
remove(key): Promise<void>;
```

Remove the meta and every part of a key.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`void`\>

***

### DirLike

The parts of FileSystemDirectoryHandle the OPFS backend uses.

#### Methods

##### getDirectoryHandle()

```ts
getDirectoryHandle(name, o?): Promise<DirLike>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `o?` | \{ `create?`: `boolean`; \} |
| `o.create?` | `boolean` |

###### Returns

`Promise`\<[`DirLike`](#dirlike)\>

##### getFileHandle()

```ts
getFileHandle(name, o?): Promise<{
  createWritable(): Promise<{
     close(): Promise<void>;
     write(d): Promise<void>;
  }>;
  getFile(): Promise<Blob>;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `o?` | \{ `create?`: `boolean`; \} |
| `o.create?` | `boolean` |

###### Returns

`Promise`\<\{
  `createWritable`(): `Promise`\<\{
     `close`(): `Promise`\<`void`\>;
     `write`(`d`): `Promise`\<`void`\>;
  \}\>;
  `getFile`(): `Promise`\<`Blob`\>;
\}\>

##### keys()?

```ts
keys?(): AsyncIterable<string>;
```

###### Returns

`AsyncIterable`\<`string`\>

##### removeEntry()

```ts
removeEntry(name, o?): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `o?` | \{ `recursive?`: `boolean`; \} |
| `o.recursive?` | `boolean` |

###### Returns

`Promise`\<`void`\>

***

### DownloadRow

One download in flight, for a row with its own bar and cancel.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fraction"></a> `fraction` | `number` \| `null` | - |
| <a id="property-key"></a> `key` | `string` | - |
| <a id="property-loaded"></a> `loaded` | `number` | - |
| <a id="property-total"></a> `total` | `number` \| `null` | - |
| <a id="property-url"></a> `url` | `string` | - |
| <a id="property-waiters"></a> `waiters` | `number` | Callers waiting on this download. |

***

### Estimate

Used and quota bytes of this origin's storage, and whether a file of a given size fits.

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

True when quota is unknown or free space is at least 1.2 times `bytes`.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `number` |

###### Returns

`boolean`

***

### GetOptions

Options for one `get`: a progress callback, an abort signal, and whether to resume.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-onprogress"></a> `onProgress?` | (`p`) => `void` | - |
| <a id="property-resume"></a> `resume?` | `boolean` | Continue an interrupted download. Default true. |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |

***

### LocksLike

The part of navigator.locks the store uses.

#### Methods

##### request()

```ts
request<T>(
   name, 
   opts, 
   fn
): Promise<T>;
```

###### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `opts` | \{ `signal?`: `AbortSignal`; \} |
| `opts.signal?` | `AbortSignal` |
| `fn` | () => `Promise`\<`T`\> |

###### Returns

`Promise`\<`T`\>

***

### Meta

The stored record of one weight file: URL, licence, total, part sizes, validators and the SHA-256
once complete.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-complete"></a> `complete` | `boolean` | - |
| <a id="property-etag"></a> `etag` | `string` \| `null` | - |
| <a id="property-key-1"></a> `key` | `string` | - |
| <a id="property-lastmodified"></a> `lastModified` | `string` \| `null` | - |
| <a id="property-licence"></a> `licence` | `string` | - |
| <a id="property-parts"></a> `parts` | `number`[] | Byte length of each stored part, in order. |
| <a id="property-sha256"></a> `sha256` | `string` \| `null` | SHA-256 hex of the complete file, set once it is complete. |
| <a id="property-total-1"></a> `total` | `number` \| `null` | Total bytes from Content-Length or Content-Range, null when the server sent neither. |
| <a id="property-updated"></a> `updated` | `number` | - |
| <a id="property-url-1"></a> `url` | `string` \| `null` | - |

***

### Progress

Download progress of one file; `total` and `fraction` are null when the server sent no length.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fraction-1"></a> `fraction` | `number` \| `null` | - |
| <a id="property-key-2"></a> `key` | `string` | - |
| <a id="property-loaded-1"></a> `loaded` | `number` | - |
| <a id="property-resuming"></a> `resuming` | `boolean` | true while existing parts are read back for a resume. |
| <a id="property-total-2"></a> `total` | `number` \| `null` | null when the server sent no length; show an indeterminate bar counting MB. |

***

### RepoFile

One file of a multi file repo, by its path in the repo, with an optional SHA-256.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-optional"></a> `optional?` | `boolean` | A missing optional file (404) is skipped instead of failing the repo. |
| <a id="property-path"></a> `path` | `string` | Path inside the repo, e.g. "onnx/model_q4f16.onnx". |
| <a id="property-sha256-1"></a> `sha256?` | `string` | - |

***

### RepoProgress

Progress over a whole repo: the current file, bytes so far and the known total.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-count"></a> `count` | `number` | - |
| <a id="property-file"></a> `file` | `string` | - |
| <a id="property-fileprogress"></a> `fileProgress` | [`Progress`](#progress) | - |
| <a id="property-index"></a> `index` | `number` | - |
| <a id="property-loaded-2"></a> `loaded` | `number` | Bytes of finished files plus the current file. |
| <a id="property-total-3"></a> `total` | `number` \| `null` | Sum of known totals; null while any file total is unknown. |

***

### RepoRef

A multi file model: base URL, file list, weight licence and key prefix.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-base"></a> `base` | `string` | Base URL ending in "/", e.g. hfResolve("onnx-community/x", "main"). |
| <a id="property-files"></a> `files` | readonly [`RepoFile`](#repofile)[] | - |
| <a id="property-keyprefix"></a> `keyPrefix?` | `string` | Key prefix; default the base URL. |
| <a id="property-licence-1"></a> `licence` | `string` | - |

***

### StoreOptions

Options for `openWeightStore`: backend order, part size, fetch, the licence notice, storage
estimate, persistence and Web Locks.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-backends"></a> `backends?` | \| `"auto"` \| readonly ([`BackendName`](#backendname) \| [`Backend`](#backend))[] | Backend order to try, or backend objects. Default "auto": opfs, idb, cache, memory, skipping what is missing. |
| <a id="property-estimate"></a> `estimate?` | () => `Promise`\<\{ `quota?`: `number`; `usage?`: `number`; \}\> | navigator.storage.estimate, injectable. |
| <a id="property-fetch"></a> `fetch?` | (`input`, `init?`) => `Promise`\<`Response`\> | - |
| <a id="property-locks"></a> `locks?` | `false` \| [`LocksLike`](#lockslike) | Web Locks, so pages and workers of one origin share one download per key: the second page waits, then reads what the first stored. Default navigator.locks where present; false turns it off. |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onnotice"></a> `onNotice?` | (`line`) => `void` | Called once per model per store with the licence line (a Hugging Face repo, or the URL's folder, is one model). Default: one console.info line per model per page session; pass `() => {}` to silence it. |
| <a id="property-partbytes"></a> `partBytes?` | `number` | - |
| <a id="property-persist"></a> `persist?` | () => `Promise`\<`boolean`\> | navigator.storage.persist and persisted, injectable. |
| <a id="property-persisted"></a> `persisted?` | () => `Promise`\<`boolean`\> | - |
| <a id="property-protocol"></a> `protocol?` | `string` | Page protocol; "file:" removes opfs and cache from auto. |

***

### WeightRef

A weight file to fetch: URL, cache key, SHA-256 when known, and the weight licence.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-key-3"></a> `key?` | `string` | Cache key. Default: the URL. Use `gguf:<repo>/<file>` style keys to match older caches. |
| <a id="property-licence-2"></a> `licence` | `string` | Weight licence, stated on first load. Required: every model reference names one. |
| <a id="property-sha256-2"></a> `sha256?` | `string` | Lowercase hex SHA-256 of the whole file, when known. |
| <a id="property-url-2"></a> `url` | `string` | - |

***

### WeightStore

A weight store: get with resume, put files the user supplied, list, evict, cancel, track
downloads and estimate space.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-backend"></a> `backend` | `readonly` | [`Backend`](#backend) |

#### Methods

##### cancel()

```ts
cancel(key): boolean;
```

Stop one download for every caller waiting on it; its parts are kept for resume. False when nothing ran under the key.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`boolean`

##### downloads()

```ts
downloads(): DownloadRow[];
```

Downloads in flight, oldest first.

###### Returns

[`DownloadRow`](#downloadrow)[]

##### estimate()

```ts
estimate(): Promise<Estimate>;
```

###### Returns

`Promise`\<[`Estimate`](#estimate)\>

##### evict()

```ts
evict(key): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`void`\>

##### get()

```ts
get(ref, opts?): Promise<Blob>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | [`WeightRef`](#weightref) |
| `opts?` | [`GetOptions`](#getoptions) |

###### Returns

`Promise`\<`Blob`\>

##### has()

```ts
has(key): Promise<boolean>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<`boolean`\>

##### keys()

```ts
keys(): Promise<string[]>;
```

###### Returns

`Promise`\<`string`[]\>

##### meta()

```ts
meta(key): Promise<Meta | null>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`Promise`\<[`Meta`](#meta) \| `null`\>

##### once()

```ts
once(ref, opts?): Promise<Uint8Array<ArrayBufferLike>>;
```

Bytes of a file, fetched once and shared by every caller until `release` (one fetch feeding many session attempts).

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | [`WeightRef`](#weightref) |
| `opts?` | [`GetOptions`](#getoptions) |

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### onDownloads()

```ts
onDownloads(fn): () => void;
```

Called with the rows whenever a download starts, moves or ends. Returns an unsubscribe.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`rows`) => `void` |

###### Returns

() => `void`

##### persist()

```ts
persist(): Promise<boolean>;
```

Ask the browser not to clear this origin's storage (navigator.storage.persist). False when refused or missing.

###### Returns

`Promise`\<`boolean`\>

##### persisted()

```ts
persisted(): Promise<boolean | null>;
```

Whether the browser keeps this origin's storage; null when the browser cannot say.

###### Returns

`Promise`\<`boolean` \| `null`\>

##### put()

```ts
put(ref, data): Promise<Blob>;
```

Store weights the user supplied as a File, Blob or buffer. Checks the SHA-256 when the ref has one.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `ref` | `Omit`\<[`WeightRef`](#weightref), `"url"`\> & `object` |
| `data` | `Blob` \| `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> |

###### Returns

`Promise`\<`Blob`\>

##### release()

```ts
release(key): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `key` | `string` |

###### Returns

`void`

## Type Aliases

### BackendName

```ts
type BackendName = "opfs" | "cache" | "idb" | "memory";
```

Storage backends. Each stores a weight file as numbered parts plus one
meta record, so every backend resumes the same way and a multi GB file
never has to sit in one buffer. Parts are Blobs, which lets the browser
keep them on disk.

## Functions

### cacheBackend()

```ts
function cacheBackend(opts?): Backend;
```

Cache Storage parts at synthetic URLs. Not available on file://.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `cache?`: `string`; `caches?`: `CacheStorage`; `origin?`: `string`; \} |
| `opts.cache?` | `string` |
| `opts.caches?` | `CacheStorage` |
| `opts.origin?` | `string` |

#### Returns

[`Backend`](#backend)

***

### getRepo()

```ts
function getRepo(
   store, 
   repo, 
   opts?
): Promise<Map<string, Blob>>;
```

Fetch every file of a repo in order. Returns path to Blob; skipped optional files are absent.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `store` | [`WeightStore`](#weightstore) |
| `repo` | [`RepoRef`](#reporef) |
| `opts?` | `Omit`\<[`GetOptions`](#getoptions), `"onProgress"`\> & `object` |

#### Returns

`Promise`\<`Map`\<`string`, `Blob`\>\>

***

### hfResolve()

```ts
function hfResolve(
   repo, 
   revision?, 
   host?
): string;
```

Hugging Face resolve URL base for a repo and revision. Pin a commit hash for reproducible loads.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `repo` | `string` | `undefined` |
| `revision?` | `string` | `"main"` |
| `host?` | `string` | `"https://huggingface.co"` |

#### Returns

`string`

***

### idbBackend()

```ts
function idbBackend(opts?): Backend;
```

IndexedDB parts: one `kv` store with
`<key>:meta` and `<key>:<n>` records. Works on file://.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `db?`: `string`; `indexedDB?`: `IDBFactory`; \} |
| `opts.db?` | `string` |
| `opts.indexedDB?` | `IDBFactory` |

#### Returns

[`Backend`](#backend)

***

### memoryBackend()

```ts
function memoryBackend(): Backend;
```

A backend that keeps parts in memory for this tab only.

#### Returns

[`Backend`](#backend)

***

### openWeightStore()

```ts
function openWeightStore(opts?): Promise<WeightStore>;
```

Open a store. The first backend whose meta read works is used; a backend
that throws on open (OPFS on file://, a blocked IndexedDB) is skipped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | [`StoreOptions`](#storeoptions) |

#### Returns

`Promise`\<[`WeightStore`](#weightstore)\>

***

### opfsBackend()

```ts
function opfsBackend(opts?): Backend;
```

Origin private file system: one directory per key, files `meta.json` and `<n>.part`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `opts?` | \{ `dir?`: `string`; `root?`: () => `Promise`\<[`DirLike`](#dirlike)\>; \} |
| `opts.dir?` | `string` |
| `opts.root?` | () => `Promise`\<[`DirLike`](#dirlike)\> |

#### Returns

[`Backend`](#backend)

***

### ortExternalData()

```ts
function ortExternalData(files, graphPath): Promise<object[]>;
```

onnxruntime-web `externalData` entries for a graph whose weights sit in
side files (model.onnx plus model.onnx_data). Pass the result as
`sessionOptions.externalData`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | `Map`\<`string`, `Blob`\> |
| `graphPath` | `string` |

#### Returns

`Promise`\<`object`[]\>

***

### sha256Hex()

```ts
function sha256Hex(data): string;
```

Lowercase hex SHA-256 of a byte array.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `Uint8Array` |

#### Returns

`string`

***

### transformersCache()

```ts
function transformersCache(store, opts): object;
```

A cache object for transformers.js (`env.useCustomCache = true;
env.customCache = transformersCache(store, ...)`). URLs that
`licenceFor` names are downloaded through the store on `match`, so they
get parts, resume and the licence line; other URLs pass through to
transformers.js's own fetch and are stored on `put`. Keys that are not
http(s) URLs (the local model path) miss without a fetch.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `store` | [`WeightStore`](#weightstore) | - |
| `opts` | \{ `keyFor?`: (`url`) => `string`; `licenceFor`: (`url`) => `string` \| `null`; `onProgress?`: (`p`) => `void`; `sha256For?`: (`url`) => `string` \| `undefined`; \} | - |
| `opts.keyFor?` | (`url`) => `string` | The URL a request is stored and fetched under, e.g. a resolve/main URL moved to its pinned revision (pinnedUrl from @hackbuild/models), so one file is fetched once. |
| `opts.licenceFor` | (`url`) => `string` \| `null` | - |
| `opts.onProgress?` | (`p`) => `void` | - |
| `opts.sha256For?` | (`url`) => `string` \| `undefined` | SHA-256 for a URL when known (e.g. pinnedSha from @hackbuild/models); the store checks it. |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `match()` | (`req`) => `Promise`\<`Response` \| `undefined`\> |
| `put()` | (`req`, `res`) => `Promise`\<`void`\> |

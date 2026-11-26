# @hackbuild/weights

Download model weights once, resume them when the download breaks, check their SHA-256, and keep them on the machine for the next visit.

[![npm](https://img.shields.io/npm/v/@hackbuild/weights)](https://www.npmjs.com/package/@hackbuild/weights) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 9.7 kB measured](https://img.shields.io/badge/gzip-9.7%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Stores weight files over OPFS, Cache Storage, IndexedDB parts or memory, picking the first that opens.
- Resumes a broken download with a Range request guarded by If-Range, and hashes the bytes as they arrive.
- Reports progress even when the server sends no Content-Length, lists downloads in flight, and cancels one for every caller.
- Shares one download per key across callers, tabs and pages of one origin.
- Fetches multi file models (ONNX external data, transformers.js repos, GGUF splits) and serves as the transformers.js cache.

## Install

```sh
npm install @hackbuild/weights @hackbuild/models
```

No dependencies and no peers. The quick start also installs @hackbuild/models for its model records and pinned hashes; the store does not need it. No weights ship with this package; each file keeps its own licence.

## Quick start

```ts
import { CATALOG, pinnedBase, pinnedSha } from "@hackbuild/models";
import { openWeightStore, WeightError } from "@hackbuild/weights";

// one store over opfs, indexeddb parts, cache storage or memory, the first that opens
const store = await openWeightStore();
console.log("stored in", store.backend.name, (await store.estimate()).quota, "bytes of quota");

// Qwen2.5 0.5B Instruct q4_k_m GGUF: the record names the repo, the file and the weight licence (Apache-2.0)
const rec = CATALOG.find((r) => r.id === "qwen2.5-0.5b-instruct-gguf")!;
const url = pinnedBase(rec.source!.repo!) + rec.source!.file!;
const sha256 = pinnedSha(url);
try {
  // an interrupted download resumes on the next get; the bytes are checked against the pinned sha-256
  const ref = { url, key: `gguf:${rec.id}`, licence: rec.licence, ...(sha256 ? { sha256 } : {}) };
  const gguf = await store.get(ref, { onProgress: (p) => console.log(p.fraction === null ? `${(p.loaded / 1e6).toFixed(0)} MB` : `${(p.fraction * 100).toFixed(0)}%`) });
  console.log(gguf.size, "bytes, cached for the next visit");
} catch (e) {
  // code is http, sha256, quota, abort or range
  if (e instanceof WeightError) console.log(e.code, e.message);
}
```

## Live example

The devices page runs resumable weight downloads and measures SHA-256 speed: [hackbuild-browser-ai/devices](https://hackbuild.github.io/hackbuild-browser-ai/devices/). The package page is at [hackbuild-browser-ai/weights](https://hackbuild.github.io/hackbuild-browser-ai/weights/).

## Concepts

### backends

`auto` picks the first of opfs, idb, cache, memory that opens; on file:// opfs and cache are left out. A backend that throws on its first read is skipped. Pass `backends` to set the order or hand in backend objects.

### parts and resume

Every backend stores numbered parts of `partBytes` (default 128 MB) plus a meta record written after each part, so a multi GB file never sits in one buffer. An interrupted download keeps its parts. The next `get` sends `Range: bytes=<kept>-` with `If-Range` (ETag, else Last-Modified); a 206 continues, a 200 starts over, and a 206 with a different ETag or Last-Modified than the stored parts starts over too. A `Content-Range` that starts elsewhere is refused.

### the hash

The SHA-256 is computed as bytes arrive (parts are read again on resume), in plain TypeScript, so a file of several GB never has to be in one buffer for Web Crypto. A mismatch with `WeightRef.sha256` removes the parts and throws `WeightError` code `sha256`.

### space

Before a download with a known length, free space must be at least 1.2 times the file, else `WeightError` code `quota`. `store.estimate()` gives used and quota bytes and a `fits(bytes)` check. `store.persist()` asks the browser not to clear this origin's storage, and `store.persisted()` says whether it will (null when the browser cannot say).

### licences

Every `WeightRef` names its weight licence. The first `get` or `put` of a key per store states the licence through `onNotice` (default `console.info`).

### sharing a download

Concurrent `get`s of one key share one download. `store.once(ref)` returns the same bytes to every caller until `release(key)`, for runtimes that try several sessions on one file. Pages of one origin share the store's backends; each download runs under a Web Lock named for its key (`navigator.locks`; `locks: false` turns it off), so a second page or tab asking for the same key waits and then reads what the first stored.

### rows and cancel

`store.downloads()` lists the downloads in flight with their bytes, and `store.onDownloads(fn)` calls back when one starts, moves or ends, so each row of a manager has its own bar. `store.cancel(key)` stops one download for every caller waiting on it and keeps its parts for resume.

### files the user supplied

`store.put({ key, licence }, file)` stores a File, Blob or buffer the user dropped, checking the SHA-256 when the ref has one.

### multi file models

`getRepo(store, { base: hfResolve(repo, commit), files, licence })` fetches every file of a repo in order and returns a map of path to Blob; a missing optional file (404) is skipped. `ortExternalData(files, graphPath)` gives the external data list onnxruntime-web wants. `transformersCache(store, { licenceFor, sha256For })` is a transformers.js custom cache: it downloads the URLs `licenceFor` names through the store on `match`, so transformers.js repos get parts, resume and the licence line; other URLs go through transformers.js's own fetch and are stored on `put`. Pass `pinnedSha` from @hackbuild/models as `sha256For` to check files at pinned commits.

## API overview

| export | what it does |
|---|---|
| [`openWeightStore`](../../docs/api/weights/README.md#openweightstore) | open a store over the first backend that works |
| [`WeightStore`](../../docs/api/weights/README.md#weightstore) | get, put, list, evict, cancel and estimate |
| [`WeightRef`](../../docs/api/weights/README.md#weightref) | a file to fetch, with key, SHA-256 and licence |
| [`WeightError`](../../docs/api/weights/README.md#weighterror) | the error with a code |
| [`getRepo`](../../docs/api/weights/README.md#getrepo) | fetch every file of a multi file model |
| [`hfResolve`](../../docs/api/weights/README.md#hfresolve) | a Hugging Face resolve URL base for a repo and revision |
| [`ortExternalData`](../../docs/api/weights/README.md#ortexternaldata) | external data files for an ONNX graph |
| [`transformersCache`](../../docs/api/weights/README.md#transformerscache) | a transformers.js custom cache over the store |
| [`Sha256`](../../docs/api/weights/README.md#sha256) | incremental SHA-256 |
| [`opfsBackend`](../../docs/api/weights/README.md#opfsbackend), [`idbBackend`](../../docs/api/weights/README.md#idbbackend), [`cacheBackend`](../../docs/api/weights/README.md#cachebackend), [`memoryBackend`](../../docs/api/weights/README.md#memorybackend) | the backends |

The full reference is in [docs/api/weights](../../docs/api/weights/README.md).

## Browser support

| backend | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| opfs | `navigator.storage.getDirectory`, not on file:// | yes (measured, headless Chrome 150) | unknown | unknown | unknown |
| idb | IndexedDB | yes (measured, headless Chrome 150) | unknown | unknown | unknown |
| cache | Cache Storage, not on file:// | yes (measured, headless Chrome 150) | unknown | unknown | unknown |
| memory | nothing; this tab only | yes | yes | yes | yes |
| shared download | Web Locks | yes (measured, headless Chrome 150) | unknown | unknown | unknown |

No WebGPU, no wasm and no threads. On file:// the store falls to IndexedDB parts, then memory. Whether Hugging Face's CDN answers `If-Range` with 206 is unknown. SHA-256 throughput in a browser is unknown; the hash runs on the main thread unless you open the store in a worker.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `fetch <url> failed: ...` (code `http`) | network, CORS or a wrong URL | check the URL and that the host allows the page's origin |
| `http <status> for <url>` (code `http`) | the server answered with an error | check the URL and revision |
| `download of <key> broke at <n> bytes, parts kept for resume: ...` (code `http`) | the stream broke | call `get` again; it resumes |
| `download of <key> ended at <n> of <total> bytes; parts kept for resume` (code `http`) | the server closed early | call `get` again |
| `parts of <key> went missing after the download` (code `http`) | the browser cleared storage mid download | call `store.persist()`, then `get` again |
| `server resumed <key> at <start>, expected <offset>` (code `range`) | the 206 started at the wrong byte | `store.evict(key)` and download again |
| `sha256 of <key> is <digest>, expected <sha256>; the parts were removed` (code `sha256`) | the file differs from the pinned hash | pin the revision the hash belongs to, or update the hash |
| `not enough storage for <key>: needs <total> bytes plus a 20 percent margin, <free> free` (code `quota`) | less free space than 1.2 times the file | evict other keys, or call `store.persist()` |
| `download of <key> aborted ...` (code `abort`) | the signal aborted or `cancel` ran | none; the parts are kept |
| `sha256: update after digest`, `sha256: digest called twice` | a `Sha256` used after `digestHex` | make a new `Sha256` per file |

## Works with

- [@hackbuild/models](../models/README.md) pins the revisions and hashes; its `pinnedSha` feeds `transformersCache`.
- [@hackbuild/ai-env](../ai-env/README.md) probes OPFS and storage before you open a store.
- [@hackbuild/chat](../chat/README.md), [@hackbuild/transcribe](../transcribe/README.md) and the other model packages take the Blobs this store returns.
- [@hackbuild/ai-views](../ai-views/README.md) loads a picked model through `weightsLoader(store)`.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. No weights ship with this package. The quick start fetches Qwen2.5 0.5B Instruct GGUF, whose weights are Apache-2.0; every other file you store keeps its own licence, which the store states on first load.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/weights` under Node 22.18.0 with a fake server built on `Response` and `ReadableStream` | 20 tests pass (23 on 2026-11-23, after the audit fixes): SHA-256 equal to Node `crypto` at block edges and odd chunkings; parts exactly `partBytes` long; progress with a null total; resume after a broken stream with the expected `Range` and `If-Range` and an equal hash; restart when the server ignores the Range; hash mismatch removes the parts; `once` and concurrent `get` make one fetch; quota refusal; one licence line per key; user supplied files with hash check; the same download, resume, list and evict run on the memory, IndexedDB (fake-indexeddb 6.2.8), Cache Storage (fake) and OPFS (fake directory) backends; repo fetch with an optional 404; ORT external data; the transformers.js cache object |
| 2026-11-24 | `test/weights.test.ts` | pass: rows with progress, cancel for every waiter with parts kept, persist and persisted with and without the browser call, one fetch for two stores on one backend under a fake lock, abort while waiting on the lock |
| 2026-11-24 | `npm run check:origin` in headless Chrome 150 (rows 58 to 60 of docs/browser-checks.md) | pass (measured): store entries on opfs, idb and cache, a WebLLM entry and a `transformersCache` put are read from another path of the same host, and two pages asking for one key at once fetch it once |

### Not verified by anything

- The Web Lock in Safari and Firefox, and across a worker and a page.
- A real browser. Not run: OPFS, Cache Storage and IndexedDB in Chrome or
  Safari; a multi GB GGUF download; resume against Hugging Face's CDN
  (whether it answers `If-Range` with 206 is unknown); quota numbers from
  `navigator.storage.estimate()`; the transformers.js custom cache with a
  real transformers.js 4.3.x build.
- SHA-256 throughput in a browser (unknown; the hash runs in plain
  TypeScript on the main thread unless the caller moves the store into a
  worker).

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 9,741 bytes | 10,228 bytes |
| `dist/single/index.iife.js` (single file build) | 9,666 bytes | 10,149 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

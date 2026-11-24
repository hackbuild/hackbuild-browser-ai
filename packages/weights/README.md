# @hackbuild/weights

One store for model weights over OPFS, Cache Storage, IndexedDB parts and
memory, with resumable Range downloads, a streaming SHA-256, progress that
works without a Content-Length, and one fetch shared by many session
attempts. Code MIT; this README CC-BY-4.0 with the code samples also MIT.
No weights ship with this package; each file keeps its own licence.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/weights

## Use

    import { openWeightStore } from "@hackbuild/weights";

    const store = await openWeightStore();          // backends: "auto"
    const blob = await store.get(
      { url, key: "gguf:org/model.gguf", licence: "Apache-2.0", sha256 },
      { onProgress: ({ loaded, total }) => bar(loaded, total) },  // total null: count MB
    );
    const bytes = await store.once(ref);            // same Uint8Array for every ORT session attempt
    await store.put({ key: "local:model.onnx", licence: "MIT" }, file);  // a File the user dropped

- `auto` picks the first of opfs, idb, cache, memory that opens; on file://
  opfs and cache are left out (as earlier builds did). A backend that
  throws on its first read is skipped.
- Every backend stores numbered parts of `partBytes` (default 128 MB, the
  earlier builds size) plus a meta record written after each part. An
  interrupted download keeps its parts. The next `get` sends
  `Range: bytes=<kept>-` with `If-Range` (ETag, else Last-Modified); a 206
  continues, a 200 starts over, a `Content-Range` that starts elsewhere is
  refused.
- The SHA-256 is computed as bytes arrive (parts are re-read on resume). A
  mismatch removes the parts and throws `WeightError` code `sha256`.
- Before a download with a known length, free space must be at least 1.2
  times the file (as earlier builds did), else `WeightError` code `quota`.
- The first `get` or `put` of a key per store states the licence through
  `onNotice` (default `console.info`).
- Concurrent `get`s of one key share one download.

## Multi file models

    import { getRepo, hfResolve, ortExternalData, transformersCache } from "@hackbuild/weights";

    const files = await getRepo(store, {
      base: hfResolve("onnx-community/depth-anything-v2-small", "<commit>"),
      licence: "Apache-2.0",
      files: [{ path: "config.json" }, { path: "onnx/model.onnx" }, { path: "onnx/model.onnx_data", optional: true }],
    });
    const externalData = await ortExternalData(files, "onnx/model.onnx");

    env.useCustomCache = true;                      // transformers.js
    env.customCache = transformersCache(store, {
      licenceFor: (u) => u.includes("/onnx-community/") ? "Apache-2.0" : null,
      sha256For: pinnedSha,                         // from @hackbuild/models: files at pinned commits
    });

`transformersCache` downloads the URLs `licenceFor` names through the store
on `match`, so transformers.js repos get parts, resume and the licence
line; other URLs go through transformers.js's own fetch and are stored on
`put`. The depth model above is named as an example of the call shape; its
licence is the one on its model card (Apache-2.0 for the small variant,
vendor stated).

## Rows, cancel, persist and other pages

`store.downloads()` lists the downloads in flight with their bytes, and
`store.onDownloads(fn)` calls back when one starts, moves or ends, so
each row of a manager has its own bar. `store.cancel(key)` stops one
download for every caller waiting on it and keeps its parts for resume.
`store.persist()` asks the browser not to clear this origin's storage
and `store.persisted()` says whether it will (null when the browser
cannot say).

Pages of one origin share the store's backends. Each download runs under
a Web Lock named for its key (`navigator.locks`; `locks: false` turns it
off), so a second page or tab asking for the same key waits and then
reads what the first stored, instead of fetching it again.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/weights` passes 20 tests (23 on 2026-11-23, after the audit fixes) under Node
  22.18.0 with a fake server built on `Response` and `ReadableStream`:
  SHA-256 equal to Node `crypto` at block edges and odd chunkings; parts
  exactly `partBytes` long; progress with a null total; resume after a
  broken stream with the expected `Range` and `If-Range` and an equal hash;
  restart when the server ignores the Range; hash mismatch removes the
  parts; `once` and concurrent `get` make one fetch; quota refusal; one
  licence line per key; user supplied files with hash check; the same
  download, resume, list and evict run on the memory, IndexedDB
  (fake-indexeddb 6.2.8), Cache Storage (fake) and OPFS (fake directory)
  backends; repo fetch with an optional 404; ORT external data; the
  transformers.js cache object.

- 2026-11-24: rows with progress, cancel for every waiter with parts
  kept, persist and persisted with and without the browser call, one
  fetch for two stores on one backend under a fake lock, abort while
  waiting on the lock (`test/weights.test.ts`).
- 2026-11-24: `npm run check:origin` in headless Chrome 150: store
  entries on opfs, idb and cache, a WebLLM entry and a
  `transformersCache` put are read from another path of the same host,
  and two pages asking for one key at once fetch it once (measured; rows
  58 to 60 of docs/browser-checks.md).

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
| `dist/index.js` (main entry, imports external) | 9,195 bytes | 9,654 bytes |
| `dist/single/index.iife.js` (single file build) | 9,115 bytes | 9,570 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

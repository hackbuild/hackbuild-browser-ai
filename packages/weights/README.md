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

### Not verified by anything

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
| `dist/index.js` (main entry, imports external) | 8,723 bytes | 9,159 bytes |
| `dist/single/index.iife.js` (single file build) | 8,639 bytes | 9,070 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

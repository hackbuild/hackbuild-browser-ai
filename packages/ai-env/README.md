# @hackbuild/ai-env

Find out what the tab can run, and load runtimes and workers in a way that also works from a file:// page.

[![npm](https://img.shields.io/npm/v/@hackbuild/ai-env)](https://www.npmjs.com/package/@hackbuild/ai-env) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 6.5 kB measured](https://img.shields.io/badge/gzip-6.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Probes WebGPU, shader-f16, cross origin isolation, OPFS, Cache Storage, IndexedDB, safe wasm threads, device memory and the Prompt API by calling each API.
- Imports an ES module from a list of URLs, falling back from plain `import()` to a patched Blob URL to a base64 `data:` URL.
- Checks a SHA-256 of fetched module or worker text before it runs, when you give one.
- Starts a worker through a ladder of rungs, module Blob then classic Blob, with an opt in inline rung.
- Rewrites source text and reports each rewrite that matched nothing.

## Install

```sh
npm install @hackbuild/ai-env
```

No dependencies and no peers. It fetches only the URLs you pass.

## Quick start

```ts
import { importEsm, probe, spawnWorker } from "@hackbuild/ai-env";

// what this tab can do, measured by calling each API
const env = await probe();
console.log(env.webgpu ? "webgpu" : "wasm", env.threads, "threads", env.protocol);
for (const note of env.notes) console.log(note);

// a runtime from a CDN, patched and imported from a Blob URL when the page is a file
const wllama = await importEsm(["https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js"], {
  onAttempt: (a) => console.log(a.via, a.ok ? "ok" : a.error),
});
console.log(Object.keys(wllama as object).length, "exports");

// a worker from source text: a module Blob first, then a classic Blob
const { worker, rung } = await spawnWorker("self.onmessage = (e) => self.postMessage(e.data * 2);");
worker.addEventListener("message", (e) => console.log(rung, "worker says", e.data));
worker.postMessage(21);
```

## Live example

The devices page runs the capability probe, pinned runtime imports, resumable weight downloads and SHA-256 speed: [hackbuild-browser-ai/devices](https://hackbuild.github.io/hackbuild-browser-ai/devices/). The package page is at [hackbuild-browser-ai/ai-env](https://hackbuild.github.io/hackbuild-browser-ai/ai-env/).

## Concepts

### the probe calls each API

Every field of `Env` comes from calling the API: `requestAdapter()`, `adapter.features.has("shader-f16")`, `crossOriginIsolated`, `navigator.storage.getDirectory()`, `caches.keys()`. A call that does not settle in `timeoutMs` (default 3000) counts as absent. `notes` holds one lowercase line per missing capability, ready for a status line: `no webgpu adapter. models run on wasm.`

### threads

`threads` is 1 unless the page is cross origin isolated, then `min(4, hardwareConcurrency)`. The cap of 4 is inferred as safe and not measured here; `maxThreads` changes it.

### file:// pages

OPFS is reported false on file:// without calling it; Chrome refuses it there and the weight store moves to IndexedDB parts. Cache Storage is also off on file://. Chrome refuses module workers from a file:// page, so `importEsm` swaps `new Worker(x, { type: "module" })` for a classic worker by default there (`classicWorkers`).

### the import ladder

`importEsm` uses plain `import()` over http(s) when nothing needs patching. Otherwise it fetches the text, applies `rewrites`, swaps module workers for classic ones, runs `patch`, makes relative imports absolute against the source URL, and imports from a Blob URL, then from a base64 `data:` URL built in 32 KB steps. Each URL in the list is tried in turn, so a CDN fallback list is one call; a `LoadError` lists every attempt. Blob URLs are revoked once the import settles. Bare specifiers are not rewritten, so use a bundled CDN build (`+esm`).

### integrity

`importEsm` takes `integrity: { [url]: sha256 }`. A listed URL is always fetched as text and its SHA-256 checked before it runs; a mismatch moves to the next URL. `spawnWorker({ url, sha256 })` checks the source once, before any rung.

### the worker ladder

`spawnWorker` walks the rungs `module-blob` and `classic-blob` by default. A rung counts once the worker reaches the end of its top level code and posts the ready handshake the loader appends; an error event or a missing handshake in `readyMs` (default 4000) moves to the next rung. The handshake is swallowed, so you see only your own messages. `inline` is opt in: it runs the source on the page through a worker shaped shim, so the page realm (DOM, storage, any key typed in) is in its reach, and it blocks the page while it computes. It imports the source wrapped in a function from a Blob or `data:` URL, with no eval, in strict mode. A `{ url }` source runs inline only with a `sha256` that matches.

### rewrites report misses

`rewriteSource` applies string or RegExp rewrites and reports each one that matched nothing, so an upstream change to a patched string shows at load time through `onMissed` instead of failing later.

## API overview

| export | what it does |
|---|---|
| [`probe`](../../docs/api/ai-env/README.md#probe) | measure what the tab can do |
| [`importEsm`](../../docs/api/ai-env/README.md#importesm) | import an ES module through the fallback ladder |
| [`spawnWorker`](../../docs/api/ai-env/README.md#spawnworker) | start a worker through the rung ladder |
| [`InlineWorker`](../../docs/api/ai-env/README.md#inlineworker) | a worker shaped object that runs the source on the page |
| [`rewriteSource`](../../docs/api/ai-env/README.md#rewritesource) | apply rewrites and report misses |
| [`toClassicWorker`](../../docs/api/ai-env/README.md#toclassicworker) | swap module workers for classic workers in source text |
| [`absolutizeImports`](../../docs/api/ai-env/README.md#absolutizeimports) | make relative imports absolute against a base URL |
| [`sha256Text`](../../docs/api/ai-env/README.md#sha256text) | hex SHA-256 of a string through Web Crypto |
| [`LoadError`](../../docs/api/ai-env/README.md#loaderror) | the error with every attempt listed |
| [`Env`](../../docs/api/ai-env/README.md#env) | what `probe` returns |

The full reference is in [docs/api/ai-env](../../docs/api/ai-env/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| `probe` | nothing; absent APIs read as false | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| `importEsm` Blob and `data:` rungs | dynamic import of Blob or `data:` URLs | unknown | unknown | unknown | unknown |
| `spawnWorker` module rung | module workers | yes (inferred), refused on file:// | unknown | unknown | unknown |
| `spawnWorker` classic rung | Worker | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| integrity checks | Web Crypto `subtle` | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |

No WebGPU and no wasm in this package; it reports whether they are there. Web Crypto exists only in a secure context, so a SHA-256 check fails on a plain http page that is not localhost. No real browser has run this package yet (see below).

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `could not import <urls>` | every URL failed on every way in; `LoadError.attempts` lists each | read the attempts; check the URL, CORS and that the build has no bare specifiers |
| `sha256 <got>, expected <want>` (an attempt) | the fetched text differs from the pinned hash | pin the exact version the hash was taken from, or update the hash |
| `no web crypto in this context, so a sha256 cannot be checked` | no `crypto.subtle` | serve the page over https or localhost |
| `worker source http <status>` | the worker source URL failed | check the URL |
| `worker source sha256 <got>, expected <want>` | the worker source differs from its hash | update the hash or the source |
| `no worker rung started: <rung> (<error>); ...` | every rung failed | read each rung's error; add `"inline"` to `prefer` only for code you trust |
| `no ready handshake in <ms> ms` | the worker's top level code did not finish in time | raise `readyMs`, or fix the error the worker throws |
| `inline runs on the page, so a url source needs a sha256 for it` | `inline` listed for a URL source with no hash | pass `{ url, sha256 }` |
| `importScripts is not available in an inline worker` | the source calls `importScripts` on the inline rung | use a Blob rung, or import modules instead |

## Works with

- [@hackbuild/weights](../weights/README.md) stores the weights; the probe's `protocol` and `opfs` explain which backend it picks.
- [@hackbuild/models](../models/README.md) reads `Env` to skip ladder rungs a device cannot run and to size the memory budget.
- [@hackbuild/chat](../chat/README.md) and the other runtime packages take a module that `importEsm` loaded, so a runtime is passed in and never bundled.
- [@hackbuild/devices](../devices/README.md) reads `Env` to pick webgpu or wasm and the thread count for onnxruntime-web and transformers.js.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/ai-env` under Node 22.18.0 with faked `navigator`, `Worker`, `fetch` and importer | 16 tests pass: probe fields and notes, adapter timeout, module to classic rewrite with kept options, missed rewrite report, relative import rewrite, base64 equal to Node `Buffer` across the 32 KB step, import fallbacks blob to data, worker fallback module to classic to inline, inline message round trip |
| 2026-11-22 | `tsc -b` under TypeScript 7.0.2 | the package typechecks |

### Not verified by anything

- Any real browser. Not run: the probe in Chrome, Safari or Firefox; a
  module blob worker refused on file:// in Chrome and the fall to the
  classic rung; Blob URL and `data:` URL imports of the wllama ESM build
  from file://.
- `importEsm` against a module whose imports use bare specifiers; those
  need a bundled CDN build (`+esm`) and are not rewritten.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 6,462 bytes | 6,785 bytes |
| `dist/single/index.iife.js` (single file build) | 6,404 bytes | 6,724 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

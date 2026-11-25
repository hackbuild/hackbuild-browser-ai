# @hackbuild/ai-env

Capability probe and file:// safe loading of ES modules and workers, for
pages that run models in the tab. Code MIT; this README CC-BY-4.0 with the
code samples also MIT.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/ai-env

## Probe

    import { probe } from "@hackbuild/ai-env";

    const env = await probe();
    // { webgpu, f16, adapter, maxBufferBytes, isolated, protocol, opfs,
    //   cacheStorage, indexedDB, threads, deviceMemoryGB, promptApi, notes }

- Every field comes from calling the API: `requestAdapter()`,
  `adapter.features.has("shader-f16")`, `crossOriginIsolated`,
  `navigator.storage.getDirectory()`, `caches.open()`. A call that does not
  settle in `timeoutMs` (default 3000) counts as absent.
- `threads` is 1 unless the page is cross origin isolated, then
  `min(4, hardwareConcurrency)`; 4 is the cap the transcription build used
  (inferred as safe, not measured here).
- OPFS is reported false on file:// without calling it; Chrome refuses it
  there and the weights store moves to IndexedDB parts.
- `notes` holds one lowercase line per missing capability, ready for a
  status line: `no webgpu adapter. models run on wasm.`

## Loading from file://

    import { importEsm, spawnWorker } from "@hackbuild/ai-env";

    const wllama = await importEsm(
      ["https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js"],
      { onMissed: (m) => console.warn("patch target moved", m) },
    );

    const { worker, rung } = await spawnWorker({ url: workerSrcUrl }, {
      rewrites: [[/CHUNK_GAP_SEC\s*=\s*0\.25/, "CHUNK_GAP_SEC = 0.1"]],
    });

- `importEsm` uses plain `import()` over http(s) when nothing needs
  patching. Otherwise it fetches the text, applies `rewrites`, swaps
  `new Worker(x, { type: "module" })` for a classic worker (default on
  file://), makes relative imports absolute against the source URL, and
  imports from a Blob URL, then from a base64 `data:` URL built in 32 KB
  steps. Each URL in the list is tried in turn; a `LoadError` lists every
  attempt.
- `importEsm` takes `integrity: { [url]: sha256 }`. A listed URL is
  always fetched as text and its SHA-256 checked before it runs; a
  mismatch moves to the next URL. Blob URLs are revoked once the import
  settles.
- `spawnWorker` walks the rungs `module-blob` and `classic-blob` by
  default. A rung counts once the worker reaches the end of its top level
  code and posts the ready handshake the loader appends; an error event or
  a missing handshake in `readyMs` (default 4000) moves to the next rung.
  `inline` is opt in: it runs the source on the page through a worker
  shaped shim, so the page realm (DOM, storage, any key typed in) is in
  its reach, and it blocks the page while it computes. It imports the
  source wrapped in a function from a Blob or `data:` URL, with no eval,
  in strict mode. A `{ url }` source runs inline only with a `sha256`
  that matches, and `{ url, sha256 }` is checked on every rung.
- `rewriteSource` reports each rewrite that matched nothing, so an upstream
  change to a patched string shows at load time.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/ai-env` passes 16 tests under Node
  22.18.0 with faked `navigator`, `Worker`, `fetch` and importer: probe
  fields and notes, adapter timeout, module to classic rewrite with kept
  options, missed rewrite report, relative import rewrite, base64 equal to
  Node `Buffer` across the 32 KB step, import fallbacks blob to data, worker
  fallback module to classic to inline, inline message round trip.
- 2026-11-22: `tsc -b` typechecks the package under TypeScript 7.0.2.

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
| `dist/index.js` (main entry, imports external) | 6,191 bytes | 6,500 bytes |
| `dist/single/index.iife.js` (single file build) | 6,087 bytes | 6,391 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

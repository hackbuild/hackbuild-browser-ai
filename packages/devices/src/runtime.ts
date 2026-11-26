/**
 * Runtime loading with pinned CDN URLs and fallbacks, through ai-env's
 * file:// safe importEsm. Pins:
 * transformers.js 4.3.2 and onnxruntime-web 1.27.0. Both are Apache-2.0 (MIT-compatible) libraries, loaded at
 * runtime and never bundled.
 */

import { importEsm, type ImportEsmOptions } from "@hackbuild/ai-env";
import type { OrtModule } from "./ort.js";
import type { TjsModule } from "./tjs.js";

/** The pinned runtime versions: transformers.js 4.3.2 and onnxruntime-web 1.27.0. */
export const PINS = { transformers: "4.3.2", ort: "1.27.0" } as const;

/**
 * SHA-256 of the pinned jsDelivr files, measured 2026-11-23 (two fetches
 * each, byte identical). Opt in: pass `{ integrity: RUNTIME_SHA256 }`, and
 * the text is fetched, checked, and imported from a Blob URL, which moves
 * import.meta.url; set ort's wasmPaths (ortWasmPaths) when you do. The
 * esm.sh fallbacks are rebuilt by that service and carry no hash, so with
 * integrity on they run only if their text matches, which it will not.
 */
export const RUNTIME_SHA256: Readonly<Record<string, string>> = {
  "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2": "8b5a3171f8876bab2b1820a7d65eb87628e3d30bb5ea85b9dd398e76eb34decb",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.webgpu.min.mjs": "46988a5a025f49449850f39f95eb0d21e40e67b3beb13a0b54efd3ab5d83f60e",
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.27.0/dist/ort.min.mjs": "a4c72a154c44d09c71996c7c5a3c4bd6fe3dfe27095dc766cdb6726775161931",
  "https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js": "e5506753e41a59c11f61f2c52422045be9fc76e32a7e47f037aaad5df4ec723e",
};

/** The URLs transformers.js is imported from, jsDelivr first, then esm.sh. */
export function transformersUrls(version: string = PINS.transformers): string[] {
  return [`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version}`, `https://esm.sh/@huggingface/transformers@${version}`];
}

/** The URLs onnxruntime-web is imported from: the jsDelivr WebGPU build, the jsDelivr plain build, then esm.sh. */
export function ortUrls(version: string = PINS.ort): string[] {
  return [
    `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort.webgpu.min.mjs`,
    `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/ort.min.mjs`,
    `https://esm.sh/onnxruntime-web@${version}/webgpu`,
  ];
}

/** The wasm file directory for an ort pin, for `ort.env.wasm.wasmPaths`. */
export function ortWasmPaths(version: string = PINS.ort): string {
  return `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`;
}

/** Memoized loaders, so every package shares one runtime instance per page. */
export function runtimeLoader<T>(urls: readonly string[], opts: ImportEsmOptions = {}): () => Promise<T> {
  let p: Promise<T> | null = null;
  return () => {
    if (!p) {
      p = importEsm<T>(urls, opts);
      p.catch(() => {
        p = null;
      });
    }
    return p;
  };
}

/** A memoized loader of the pinned transformers.js; call the returned function to import it. */
export const loadTransformers = (opts: ImportEsmOptions & { version?: string } = {}): (() => Promise<TjsModule>) =>
  runtimeLoader<TjsModule>(transformersUrls(opts.version), opts);

/** A memoized loader of the pinned onnxruntime-web; call the returned function to import it. */
export const loadOrt = (opts: ImportEsmOptions & { version?: string } = {}): (() => Promise<OrtModule>) =>
  runtimeLoader<OrtModule>(ortUrls(opts.version), opts);

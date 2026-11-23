/**
 * Runtime loading with pinned CDN URLs and fallbacks, through ai-env's
 * file:// safe importEsm. Pins are the versions the source builds ran:
 * transformers.js 4.3.2 (BAIL) and onnxruntime-web 1.27.0 (SHEAR, SCRIBE
 * August). Both are Apache-2.0 (MIT-compatible) libraries, loaded at
 * runtime and never bundled.
 */

import { importEsm, type ImportEsmOptions } from "@hackbuild/ai-env";
import type { OrtModule } from "./ort.js";
import type { TjsModule } from "./tjs.js";

export const PINS = { transformers: "4.3.2", ort: "1.27.0" } as const;

export function transformersUrls(version: string = PINS.transformers): string[] {
  return [`https://cdn.jsdelivr.net/npm/@huggingface/transformers@${version}`, `https://esm.sh/@huggingface/transformers@${version}`];
}

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

export const loadTransformers = (opts: ImportEsmOptions & { version?: string } = {}): (() => Promise<TjsModule>) =>
  runtimeLoader<TjsModule>(transformersUrls(opts.version), opts);

export const loadOrt = (opts: ImportEsmOptions & { version?: string } = {}): (() => Promise<OrtModule>) =>
  runtimeLoader<OrtModule>(ortUrls(opts.version), opts);

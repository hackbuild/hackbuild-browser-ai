/**
 * Rung builders for the two runtimes every model package uses. The models
 * package keeps the ladder walk and error classification; this file builds
 * the rungs those walks try, in the orders the earlier builds settled on:
 *
 * - earlier builds: fp16 on webgpu, fp32 on the same device; q8 then fp32 on wasm.
 * - earlier builds: webgpu first, wasm q8 after.
 * - earlier builds: q4f16, then q4 in a fresh heap.
 * - earlier builds: per sub graph dtypes (fp16 encoder, q4 decoder).
 */

import type { Env } from "@hackbuild/ai-env";
import { ortLadder, type Rung } from "@hackbuild/models";

/** A transformers.js dtype: one for the whole model, or one per sub graph. */
export type Dtype = string | Record<string, string>;

/** The dtypes to try on WebGPU and on wasm, their order, a fresh heap retry, and options copied onto every rung. */
export interface TjsLadderSpec {
  /** dtypes tried on webgpu, in order. */
  webgpu?: readonly Dtype[];
  /** dtypes tried on wasm, in order. */
  wasm?: readonly Dtype[];
  /** Put wasm before webgpu (an earlier chat build keeps perception off the gpu the chat model uses). */
  wasmFirst?: boolean;
  /** Retry the last wasm dtype in a fresh heap after an out of memory (as earlier builds did). */
  freshHeapRetry?: boolean;
  /** Extra runtime options copied onto every rung, e.g. `{ task: "depth-estimation" }`. */
  options?: Record<string, unknown>;
}

/** transformers.js rungs from a spec. f16 rungs get the shader-f16 need from the models package. */
export function tjsLadder(spec: TjsLadderSpec): Rung[] {
  const mk = (device: "webgpu" | "wasm", dtype: Dtype): Rung => {
    const r: Rung = { device, dtype };
    if (spec.options) r.options = { ...spec.options };
    return r;
  };
  const gpu = (spec.webgpu ?? []).map((d) => mk("webgpu", d));
  const cpu = (spec.wasm ?? []).map((d) => mk("wasm", d));
  if (spec.freshHeapRetry && cpu.length) {
    const last = cpu[cpu.length - 1]!;
    cpu.push({ ...last, freshHeap: true });
  }
  return spec.wasmFirst ? [...cpu, ...gpu] : [...gpu, ...cpu];
}

/** onnxruntime-web rungs: the earlier transcription tool walk, or wasm only when the graph is known to fail on webgpu. */
export function ortRungs(opts: { webgpu?: boolean } = {}): Rung[] {
  const all = ortLadder();
  return opts.webgpu === false ? all.filter((r) => r.device === "wasm") : all;
}

/** Ladders by name, from the builds. Each model record may copy one or write its own. */
export const LADDERS = {
  /** an earlier relief bench runDepth. */
  depth: (): Rung[] => tjsLadder({ webgpu: ["fp16", "fp32"], wasm: ["q8", "fp32"] }),
  /** earlier builds: perception models on cpu by default. */
  perceptionCpu: (): Rung[] => tjsLadder({ webgpu: ["fp32"], wasm: ["q8", "fp32"], wasmFirst: true }),
  /** whisper-large-v3-turbo (weights MIT), as the earlier transcription tool ran it. */
  whisperTurbo: (): Rung[] =>
    tjsLadder({
      webgpu: [
        { encoder_model: "fp16", decoder_model_merged: "q4" },
        { encoder_model: "fp32", decoder_model_merged: "q4" },
      ],
      wasm: [{ encoder_model: "q8", decoder_model_merged: "q8" }],
    }),
  /** whisper-base and the Xenova .en exports (weights MIT; the ONNX cards say apache-2.0). */
  whisperSmall: (q4Decoder = true): Rung[] =>
    tjsLadder({
      webgpu: [{ encoder_model: "fp32", decoder_model_merged: q4Decoder ? "q4" : "fp32" }],
      wasm: [{ encoder_model: "q8", decoder_model_merged: "q8" }],
    }),
  /** SmolVLM (weights Apache-2.0): fp16 embed and vision, q4 decoder on webgpu; q8 vision on wasm, as earlier builds ran it. */
  smolvlm: (): Rung[] =>
    tjsLadder({
      // fp32 encoder first: with the fp16 embed and vision encoder, Chrome 150 on an Apple M1 gave
      // captions unrelated to the image (measured 2026-11-23); fp16 stays as the smaller fallback
      webgpu: [
        { embed_tokens: "fp32", vision_encoder: "fp32", decoder_model_merged: "q4" },
        { embed_tokens: "fp16", vision_encoder: "fp16", decoder_model_merged: "q4" },
      ],
      wasm: [{ embed_tokens: "fp32", vision_encoder: "q8", decoder_model_merged: "q4" }],
      freshHeapRetry: true,
    }),
  /** earlier builds: q4f16 on webgpu only. */
  vlmGpuOnly: (): Rung[] => tjsLadder({ webgpu: ["q4f16", "q4"] }),
  ort: ortRungs,
} as const;

/** "webgpu" when the probe found an adapter, else "wasm". */
export function pickDevice(env: Env | undefined): "webgpu" | "wasm" {
  return env?.webgpu ? "webgpu" : "wasm";
}

/** wasm thread count to set on a runtime: the probe's safe count, 1 without a probe. */
export function wasmThreads(env: Env | undefined): number {
  return Math.max(1, env?.threads ?? 1);
}

/**
 * Model records: what a model provides, which runtime runs it, the device
 * and dtype ladder to walk, the quirks app code used to hard code, and the
 * weight licence. Ladders are per model (an earlier relief bench retries fp32 on the same
 * device, an earlier chat build drops to wasm q8, an earlier vision build retries q4 in a fresh heap), so
 * they live here instead of in one global ladder.
 */

import type { Env } from "@hackbuild/ai-env";

export type KnownCapability =
  | "chat"
  | "tools"
  | "vision.caption"
  | "vision.ask"
  | "embed"
  | "rerank"
  | "transcribe"
  | "speak"
  | "vad"
  | "depth"
  | "detect"
  | "segment"
  | "landmarks"
  | "stems"
  | "notes"
  | "imagegen"
  | "biosignal";
/** Known names plus any string a later package adds. */
export type Capability = KnownCapability | (string & {});

export type Provider = "webllm" | "wllama" | "tjs" | "ort" | "prompt-api" | "remote" | "mediapipe" | "tfjs" | "system" | "stub" | (string & {});

export type Device = "webgpu" | "wasm" | "webgl" | "cpu" | "browser" | "remote";

export type Need = "webgpu" | "shader-f16" | "isolated" | "http" | "promptApi";

export interface OrtRung {
  executionProviders: string[];
  graphOptimizationLevel?: "disabled" | "basic" | "extended" | "all";
}

export interface Rung {
  device: Device;
  /** One dtype, or per sub graph dtypes for transformers.js (`{ embed_tokens: "fp16", decoder_model_merged: "q4" }`). */
  dtype?: string | Record<string, string>;
  /** Env capabilities the rung needs; rungs whose needs are missing are skipped. */
  needs?: Need[];
  /** onnxruntime-web session options for this rung. */
  ort?: OrtRung;
  /** Load into a fresh wasm heap (as earlier builds did). */
  freshHeap?: boolean;
  /** Runtime specific knobs, e.g. `{ context_window_size: 4096 }` for WebLLM. */
  options?: Record<string, unknown>;
}

export interface Quirks {
  /** false: the chat template has no system role (Gemma 3); merge it into the first user turn. */
  systemRole?: boolean;
  /** Turns must alternate user and assistant and start with user (Gemma). */
  strictAlternation?: boolean;
  /** How the model emits reasoning: "tags" for think blocks, "none" when it never does. */
  think?: "tags" | "channel" | "none";
  repetitionPenalty?: number;
  /** Supports OpenAI style tools in its runtime (WebLLM Hermes builds). */
  nativeTools?: boolean;
  /** Hermes and Qwen style `<tool_call>` prompt format. */
  toolCallTags?: boolean;
  /** Notes such as "fp16 overflows on webgpu"; shown in pickers. */
  warnings?: string[];
  /** Low token cap for action turns. */
  maxTokensAction?: number;
  /**
   * The model's transformers.js processor takes the images before the text
   * (LFM2-VL, LLaVA, PaliGemma, Pixtral); Idefics3 and SmolVLM take the text first.
   */
  processorImagesFirst?: boolean;
}

/** How quick a model feels where it fits, slowest last. */
export type Speed = "instant" | "fast" | "steady" | "slow";
export const SPEEDS: readonly Speed[] = ["instant", "fast", "steady", "slow"];

export type SizeSource = "vendor" | "measured" | "computed" | "inferred" | "unknown";

export interface ModelSource {
  /** Hugging Face repo or similar. */
  repo?: string;
  /** Pin a commit for reproducible loads. */
  revision?: string;
  /** Single file (GGUF) or the main graph. */
  file?: string;
  /** Extra files (external data, tokenizer, config). */
  files?: { path: string; sha256?: string; optional?: boolean }[];
  url?: string;
  /** Runtime model id (WebLLM catalog id, transformers.js model id). */
  modelId?: string;
  sha256?: string;
}

/** How the weights treat refusals, from the record's label or repo name; never guessed from substrings at run time. */
export type Censorship = "stock" | "uncensored" | "abliterated" | "unknown";

/** Memory tier the model is comfortable in, the same cut as `sizeClass`. */
export type Tier = "tiny" | "small" | "medium" | "large";

export interface ModelRecord {
  id: string;
  label?: string;
  /** Parameter count label, e.g. "3B", "360M", "E4B". */
  params?: string;
  /** Quantization as the runtime names it, e.g. "q4f16_1", "Q4_K_M", "q4". */
  quant?: string;
  /** GPU memory the runtime states for the model, in MB; a second figure beside the download size. */
  vramMB?: number | null;
  vramSource?: SizeSource;
  censorship?: Censorship;
  /** Catalogue tags shown as chips, e.g. "tools", "low vram", "think". */
  tags?: string[];
  tier?: Tier;
  family?: string;
  /** One honest line for the catalogue row. */
  note?: string;
  /** Catalogue group the row sits in, e.g. "start here", "uncensored", "reasoning". */
  group?: string;
  /** The owner's label for the row, verbatim from the tool that listed it, e.g. "best", "default", "fast, capable". */
  badge?: string;
  /** One word for how quick it feels on a machine it fits: instant, fast, steady or slow. */
  speed?: Speed;
  /** Two to four words a person picks by, in the owner's voice: "best all round", "likes json", "fast, dim". */
  verdict?: string;
  /** Nothing to fetch: a script, a physical model, or a model the browser has built in. */
  noDownload?: boolean;
  /** Why no runtime here loads this record yet; set, the record is listed and never offered to load. */
  unrunnable?: string;
  provides: Capability[];
  provider: Provider;
  source: ModelSource;
  sizeMB: number | null;
  sizeSource: SizeSource;
  ctx?: number;
  ladder: Rung[];
  quirks?: Quirks;
  /** Weight licence, by name. Required. */
  licence: string;
  /** Whether the weight licence allows commercial use; "unknown" when not checked. */
  commercial: boolean | "unknown";
  /** Where the model should run when the hub places it. Default "gpu" for webgpu rungs. */
  place?: "gpu" | "cpu-worker" | "main";
  /** Runtime pin the record was written against, e.g. "@mlc-ai/web-llm@0.2.84". */
  runtime?: string;
  notes?: string[];
}

function has(env: Env | undefined, need: Need): boolean {
  if (!env) return need !== "promptApi";
  switch (need) {
    case "webgpu":
      return env.webgpu;
    case "shader-f16":
      return env.f16;
    case "isolated":
      return env.isolated;
    case "http":
      return env.protocol === "http" || env.protocol === "https";
    case "promptApi":
      return env.promptApi;
  }
}

/** Implicit needs of a rung: a webgpu device needs an adapter, an f16 dtype needs shader-f16. */
export function needsOf(r: Rung): Need[] {
  const out = new Set<Need>(r.needs ?? []);
  if (r.device === "webgpu") out.add("webgpu");
  const dts = typeof r.dtype === "string" ? [r.dtype] : r.dtype ? Object.values(r.dtype) : [];
  if (r.device === "webgpu" && dts.some((d) => /f16|fp16/.test(d))) out.add("shader-f16");
  if (r.device === "browser") out.add("promptApi");
  return [...out];
}

/** The rungs of a record this env can attempt, in order, with the reason for each one dropped. */
export function ladderFor(rec: ModelRecord, env?: Env): { rungs: Rung[]; skipped: { rung: Rung; missing: Need[] }[] } {
  const rungs: Rung[] = [];
  const skipped: { rung: Rung; missing: Need[] }[] = [];
  for (const r of rec.ladder) {
    const missing = needsOf(r).filter((n) => !has(env, n));
    if (missing.length) skipped.push({ rung: r, missing });
    else rungs.push(r);
  }
  return { rungs, skipped };
}

/** The onnxruntime-web ladder the earlier transcription tool walks after one fetch: webgpu at basic, all, disabled, then wasm. */
export function ortLadder(): Rung[] {
  return [
    { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "basic" } },
    { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "all" } },
    { device: "webgpu", ort: { executionProviders: ["webgpu", "wasm"], graphOptimizationLevel: "disabled" } },
    { device: "wasm", ort: { executionProviders: ["wasm"], graphOptimizationLevel: "all" } },
  ];
}

export type ErrorKind = "runtime-mismatch" | "out-of-memory" | "f16" | "device-lost" | "unsupported-op" | "network" | "abort" | "unknown";

/** Name the failure so a ladder and a status line can act on it. Patterns come from the builds' logs. */
export function classifyError(e: unknown): ErrorKind {
  const s = e instanceof Error ? `${e.name} ${e.message}` : String(e);
  if (/AbortError|aborted/i.test(s)) return "abort";
  if (/LinkError|TVMFFI|instantiate|version mismatch/i.test(s)) return "runtime-mismatch";
  if (/out of memory|OOM|memory access out of bounds|Array buffer allocation failed|RangeError: .*memory|could not allocate/i.test(s)) return "out-of-memory";
  // a lost device often names the f16 shader it was running, so it is tested first
  if (/device (was )?lost|GPUDevice.*lost|DXGI_ERROR/i.test(s)) return "device-lost";
  if (/shader-f16|f16|float16/i.test(s)) return "f16";
  if (/not implemented|unsupported (op|operator)|transformer_memcpy|could not find an implementation/i.test(s)) return "unsupported-op";
  // "Failed to load model" from a session is a graph problem, not the network; only fetch failures stop the ladder
  if (/Failed to fetch|fetch failed|NetworkError|network error|http \d{3}/i.test(s)) return "network";
  return "unknown";
}

export interface LadderFailure {
  rung: Rung;
  kind: ErrorKind;
  error: string;
}

export class LadderError extends Error {
  readonly failures: LadderFailure[];
  constructor(id: string, failures: LadderFailure[]) {
    super(
      failures.length
        ? `${id}: every rung failed: ${failures.map((f) => `${f.rung.device}${f.rung.dtype ? " " + JSON.stringify(f.rung.dtype) : ""} (${f.kind})`).join(", ")}`
        : `${id}: no rung fits this device`,
    );
    this.name = "LadderError";
    this.failures = failures;
  }
}

/**
 * Try each rung until `attempt` resolves. An abort stops the walk; a
 * network error stops it too, since another dtype will not fix the network.
 */
export async function walkLadder<T>(
  id: string,
  rungs: readonly Rung[],
  attempt: (rung: Rung, index: number) => Promise<T>,
  opts: { onFailure?: (f: LadderFailure) => void } = {},
): Promise<{ value: T; rung: Rung; failures: LadderFailure[] }> {
  const failures: LadderFailure[] = [];
  for (let i = 0; i < rungs.length; i++) {
    const rung = rungs[i]!;
    try {
      return { value: await attempt(rung, i), rung, failures };
    } catch (e) {
      const f: LadderFailure = { rung, kind: classifyError(e), error: e instanceof Error ? e.message : String(e) };
      failures.push(f);
      opts.onFailure?.(f);
      if (f.kind === "abort" || f.kind === "network") break;
    }
  }
  throw new LadderError(id, failures);
}

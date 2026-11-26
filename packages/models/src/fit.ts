/**
 * Catalogue facts the picker needs before any download: the memory budget
 * a machine can give a model, whether a record fits here and why not,
 * size presets that state their summed download, and the facts a GGUF
 * file name carries.
 */

import type { Env } from "@hackbuild/ai-env";
import { ladderFor, type ModelRecord, type Need, type SizeSource } from "./record.js";

const MB = 1024 * 1024;
/** Share of device memory a model may take; it shares memory with the OS, the browser, the scene and the voice. Vendor for a native runtime, proposed here until a browser run measures it. */
export const MEMORY_SHARE = 0.45;
/** Cap on cpu: reply speed falls with size long before memory runs out. Vendor for a native runtime, proposed here. */
export const CPU_CAP_MB = 6 * 1024;
/** Budget when the browser does not report device memory. Vendor for a native runtime, proposed here. */
export const FALLBACK_BUDGET_MB = 5.5 * 1024;

/** The largest model in MB this machine can give one model, with a lowercase reason. */
export interface Budget {
  /** Largest model, in MB, that leaves this machine responsive. */
  mb: number;
  /** Lowercase reason, e.g. "8 gb memory, webgpu". */
  why: string;
  /** Every budget is a proposal until a browser run measures one. */
  source: "proposed";
}

/** The memory budget for one model on this machine, from `deviceMemoryGB` and the backend. */
export function budgetFor(env: Env | undefined): Budget {
  const gb = env?.deviceMemoryGB ?? null;
  if (!env || gb === null) return { mb: FALLBACK_BUDGET_MB, why: "machine memory unknown", source: "proposed" };
  const share = Math.round(gb * 1024 * MEMORY_SHARE);
  // navigator.deviceMemory rounds down and stops at 8
  const ram = `${gb} gb memory${gb >= 8 ? " or more" : ""}`;
  if (!env.webgpu && share > CPU_CAP_MB) return { mb: CPU_CAP_MB, why: `${ram}, running on cpu`, source: "proposed" };
  return { mb: share, why: `${ram}, ${env.webgpu ? "webgpu" : "cpu"}`, source: "proposed" };
}

/** Storage numbers as `@hackbuild/weights` store.estimate() returns them. */
export interface StorageEstimate {
  used: number | null;
  quota: number | null;
  fits(bytes: number): boolean;
}

/** How a record fits this machine, best first: "fits", then the reasons it does not, down to "cannot run here". */
export type Fit = "fits" | "fits on cpu, slow" | "needs f16" | "needs webgpu" | "over memory" | "over storage" | "cannot run here";

/** Whether a record fits this machine, as a `Fit` word, an ok flag and a lowercase reason. */
export interface FitResult {
  fit: Fit;
  /** True for "fits" and "fits on cpu, slow". */
  ok: boolean;
  /** Lowercase reason that names the failure. */
  reason: string;
}

const mbText = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} gb` : `${Math.round(mb)} mb`);

const MISSING: Record<Need, [Fit, string]> = {
  "shader-f16": ["needs f16", "this gpu has no shader-f16."],
  webgpu: ["needs webgpu", "no webgpu adapter here."],
  isolated: ["cannot run here", "the page is not cross origin isolated."],
  http: ["cannot run here", "opened from a file. serve the folder."],
  promptApi: ["cannot run here", "this browser has no prompt api."],
};

/**
 * Whether a record fits this machine, from three checks: the ladder
 * against the probe (webgpu and shader-f16), the memory budget against
 * VRAM or download size, and the storage estimate against the download.
 */
export function fitOf(rec: ModelRecord, env: Env | undefined, estimate?: StorageEstimate | null, budget: Budget = budgetFor(env)): FitResult {
  if (rec.unrunnable) return { fit: "cannot run here", ok: false, reason: rec.unrunnable };
  if (rec.provider === "remote") return { fit: "fits", ok: true, reason: "runs on your endpoint. nothing is downloaded." };
  const { rungs, skipped } = ladderFor(rec, env);
  if (!rungs.length) {
    const missing = new Set(skipped.flatMap((s) => s.missing));
    // the most specific cause first: f16 alone means the gpu is there
    const order: Need[] = ["promptApi", "http", "isolated", "webgpu", "shader-f16"];
    const need = order.find((n) => missing.has(n)) ?? "webgpu";
    const [fit, reason] = MISSING[need];
    return { fit, ok: false, reason };
  }
  const memMB = rec.vramMB ?? rec.sizeMB;
  const memSource = rec.vramMB != null ? (rec.vramSource ?? "unknown") : rec.sizeSource;
  if (memMB != null && memMB > budget.mb) {
    return { fit: "over memory", ok: false, reason: `needs ${mbText(memMB)} (${memSource}). this machine gives a model ${mbText(budget.mb)} (${budget.why}).` };
  }
  if (estimate && rec.sizeMB != null && rec.provider !== "prompt-api" && !estimate.fits(rec.sizeMB * MB)) {
    const free = estimate.quota !== null ? Math.max(0, estimate.quota - (estimate.used ?? 0)) / MB : null;
    return { fit: "over storage", ok: false, reason: `${free !== null ? `${mbText(free)} free. ` : ""}this model needs ${mbText(rec.sizeMB)} (${rec.sizeSource}). remove a stored model or pick a smaller one.` };
  }
  const gpuSkipped = skipped.some((s) => s.rung.device === "webgpu");
  const first = rungs[0]!;
  if (gpuSkipped && (first.device === "wasm" || first.device === "cpu")) {
    return { fit: "fits on cpu, slow", ok: true, reason: `${skipped.some((s) => s.missing.includes("webgpu")) ? "no webgpu adapter" : "this gpu has no shader-f16"}. it runs on cpu, slower.` };
  }
  return { fit: "fits", ok: true, reason: `runs on ${first.device}${memMB != null ? `, ${mbText(memMB)} of ${mbText(budget.mb)}` : ""}.` };
}

/** The organs of the slot rack, in rack order. */
export type Slot = "brain" | "smallBrain" | "embedder" | "ears" | "vad" | "voice" | "eyes" | "depth" | "mask" | "detector" | "image";

/** The slots of the model rack, in rack order, with their labels. */
export const SLOTS: readonly { slot: Slot; label: string }[] = [
  { slot: "brain", label: "brain" },
  { slot: "smallBrain", label: "small brain" },
  { slot: "embedder", label: "embedder" },
  { slot: "ears", label: "ears" },
  { slot: "vad", label: "vad" },
  { slot: "voice", label: "voice" },
  { slot: "eyes", label: "eyes" },
  { slot: "depth", label: "depth" },
  { slot: "mask", label: "mask" },
  { slot: "detector", label: "detector" },
  { slot: "image", label: "image" },
];

/** A size preset that fills the slot rack with catalogue ids, named by weight class. */
export interface Preset {
  id: "phone" | "laptop" | "desktop" | (string & {});
  /** Named by weight class. */
  label: string;
  picks: Partial<Record<Slot, string>>;
}

/**
 * Size presets that fill the rack, named by weight class (three presets,
 * light to heavy). Picks are CATALOG ids; the total
 * is computed from the records, never written by hand.
 */
export const PRESETS: readonly Preset[] = [
  { id: "phone", label: "phone", picks: { brain: "smollm2-135m-instruct", embedder: "all-minilm-l6-v2" } },
  {
    id: "laptop",
    label: "laptop",
    picks: { brain: "smollm2-360m-instruct", smallBrain: "smollm2-135m-instruct", embedder: "all-minilm-l6-v2", ears: "whisper-base" },
  },
  {
    id: "desktop",
    label: "desktop",
    picks: {
      brain: "hermes-3-llama-3.2-3b-mlc",
      smallBrain: "smollm2-360m-instruct",
      embedder: "all-minilm-l6-v2",
      ears: "whisper-base",
      voice: "kokoro-82m",
      depth: "depth-anything-v2-small",
    },
  },
];

/**
 * The summed download of a preset in MB (computed), the weakest size source among its parts, each
 * part, and the picks with no known size.
 */
export interface PresetTotal {
  /** Summed download of the picks with a known size, in MB (computed). */
  mb: number;
  /** The weakest source word among the addends: one inferred size makes the total inferred. */
  source: SizeSource;
  parts: { slot: Slot; id: string; sizeMB: number | null; sizeSource: SizeSource }[];
  /** Picks whose id has no record, or whose record has no size. */
  unknown: string[];
}

const STRENGTH: SizeSource[] = ["measured", "vendor", "inferred", "unknown"];

/** The summed download a preset states before anything loads; one record is loaded once even when two slots pick it. */
export function presetTotal(preset: Preset, records: readonly ModelRecord[] | { get(id: string): ModelRecord | undefined }): PresetTotal {
  const get = "get" in records ? (id: string) => records.get(id) : (id: string) => records.find((r) => r.id === id);
  const parts: PresetTotal["parts"] = [];
  const unknown: string[] = [];
  const seen = new Set<string>();
  let mb = 0;
  let worst = 0;
  for (const { slot } of SLOTS) {
    const id = preset.picks[slot];
    if (!id) continue;
    const r = get(id);
    parts.push({ slot, id, sizeMB: r?.sizeMB ?? null, sizeSource: r?.sizeSource ?? "unknown" });
    if (!r || r.sizeMB === null) {
      unknown.push(id);
      worst = STRENGTH.length - 1;
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    mb += r.sizeMB;
    worst = Math.max(worst, STRENGTH.indexOf(r.sizeSource));
  }
  return { mb, source: STRENGTH[worst]!, parts, unknown };
}

/** Parameter label, quantization and split position read from a GGUF file name. */
export interface GgufFacts {
  /** Parameter label, e.g. "3B", "E4B", "26B-A4B"; null when the name has none. */
  params: string | null;
  /** Quantization, e.g. "Q4_K_M", "IQ3_XS", "F16"; null when the name has none. */
  quant: string | null;
  /** Split file position ("-00002-of-00003"), or null for a single file. */
  part: { index: number; count: number } | null;
}

/** Facts a GGUF file name carries, for a custom model row before any fetch. */
export function ggufFacts(fileName: string): GgufFacts {
  const name = fileName.replace(/^.*\//, "");
  // an effective size label (E4B) first, else a count with an optional active part (26B-A4B)
  const p = name.match(/(?<![a-z0-9])E\d+B(?![a-z0-9])/i) ?? name.match(/(\d+(?:\.\d+)?)\s*x?\s*(\d{1,2})?b(?:-a\d+(?:\.\d+)?b)?(?![a-z])/i);
  const q = name.match(/I?Q\d(?:_[A-Z0-9]+)*|\bbf16\b|\bf16\b/i);
  const s = name.match(/-0*(\d+)-of-0*(\d+)\.gguf$/i);
  return {
    params: p ? p[0].toUpperCase() : null,
    quant: q ? q[0].toUpperCase() : null,
    part: s ? { index: Number(s[1]), count: Number(s[2]) } : null,
  };
}

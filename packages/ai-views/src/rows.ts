/**
 * Catalogue records to hackbuild-ui ModelRow: every word a person reads in
 * the picker is written here, once. The kit draws rows and never reads a
 * record; this module never draws.
 */

import type { Env } from "@hackbuild/ai-env";
import { fitOf, ladderFor, type ModelRecord, type StorageEstimate } from "@hackbuild/models";
import { bytesText, type ModelBackend, type ModelOption, type ModelPickState, type ModelRow, type ModelRowGroup } from "@virgilvox/hackbuild-ui/vanilla";

const MIB = 1024 * 1024;

/** Catalogue group words to the sheet's groups. */
const GROUPS: Record<string, ModelRowGroup> = {
  "start here": "start",
  tiny: "small",
  cpu: "small",
  good: "better",
  uncensored: "uncensored",
  reasoning: "reasoning",
  "no download": "none",
  own: "own",
};

export function isNoDownload(r: ModelRecord): boolean {
  return !!r.noDownload || r.sizeMB === 0 || r.provider === "prompt-api" || r.provider === "system";
}

export function isUncensored(r: ModelRecord): boolean {
  return r.censorship === "uncensored" || r.censorship === "abliterated";
}

/** The group a row sits in. A model on this machine leads; else the record's group, else by size. */
export function groupOf(r: ModelRecord, state: ModelPickState = "none"): ModelRowGroup {
  if (state === "stored" || state === "loaded") return "here";
  if (r.group && GROUPS[r.group]) return GROUPS[r.group]!;
  if (isNoDownload(r)) return "none";
  if (isUncensored(r)) return "uncensored";
  return r.sizeMB !== null && r.sizeMB < 600 ? "small" : "better";
}

/** Where it runs here: the first rung this machine can take, else the record's first. */
export function backendOf(r: ModelRecord, env?: Env): ModelBackend {
  if (r.provider === "remote") return "remote";
  const rung = ladderFor(r, env).rungs[0] ?? r.ladder[0];
  switch (rung?.device) {
    case "webgpu":
    case "webgl":
      return "gpu";
    case "browser":
      return "browser";
    case "remote":
      return "remote";
    default:
      return "cpu";
  }
}

/** Download words: "1.7 gb". Null for a record with no download or an unknown size. */
export function sizeWords(r: ModelRecord): string | undefined {
  if (isNoDownload(r) || r.sizeMB === null) return undefined;
  return bytesText(r.sizeMB * MIB);
}

/** The record's label, else its id made readable: "hermes 3 llama 3.2 3b". */
const pretty = (r: ModelRecord) => r.label ?? r.id.replace(/-(mlc|gguf)$/, "").replace(/-/g, " ");

/** The chevron detail: licence, source, context, quant, runtime, and where the size came from. */
export function detailOf(r: ModelRecord): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  const use = r.commercial === true ? "commercial use allowed" : r.commercial === false ? "not for commercial use" : "commercial use unknown";
  out.push({ label: "licence", value: `${r.licence}. ${use}` });
  const src = r.source.repo ?? r.source.modelId ?? r.source.url;
  if (src) out.push({ label: "source", value: r.source.file ? `${src}, ${r.source.file}` : src });
  if (r.sizeMB !== null && !isNoDownload(r)) out.push({ label: "size", value: `${bytesText(r.sizeMB * MIB)}, ${r.sizeSource}` });
  if (r.vramMB != null) out.push({ label: "gpu memory", value: `${bytesText(r.vramMB * MIB)}, ${r.vramSource ?? "unknown"}` });
  if (r.ctx) out.push({ label: "context", value: `${r.ctx} tokens` });
  if (r.quant) out.push({ label: "quant", value: r.quant });
  if (r.runtime) out.push({ label: "runtime", value: r.runtime });
  for (const n of r.notes ?? []) out.push({ label: "note", value: n });
  for (const w of r.quirks?.warnings ?? []) out.push({ label: "warning", value: w });
  return out;
}

/** Context sizes a chat record can take, up to its own. */
const CTX = [2048, 4096, 8192, 16384, 32768];

/** The options a chosen row offers: backend when the ladder has gpu and cpu, quant when it has several, context for chat. */
export function optionsOf(r: ModelRecord, values: Record<string, string> = {}, extra: readonly ModelOption[] = []): ModelOption[] {
  const out: ModelOption[] = [];
  const devices = new Set(r.ladder.map((g) => (g.device === "webgpu" ? "webgpu" : g.device === "wasm" || g.device === "cpu" ? "wasm" : g.device)));
  if (devices.has("webgpu") && devices.has("wasm")) {
    out.push({ key: "backend", label: "backend", value: values.backend ?? "auto", choices: [{ value: "auto", label: "auto" }, { value: "webgpu", label: "webgpu" }, { value: "wasm", label: "wasm, cpu" }] });
  }
  const dtypes = [...new Set(r.ladder.map((g) => (typeof g.dtype === "string" ? g.dtype : null)).filter((d): d is string => !!d))];
  if (dtypes.length > 1) out.push({ key: "quant", label: "quant", value: values.quant ?? dtypes[0]!, choices: dtypes.map((d) => ({ value: d, label: d })) });
  if (r.provides.includes("chat") && r.ctx && r.provider !== "remote") {
    const sizes = CTX.filter((c) => c <= Math.max(r.ctx!, 2048));
    if (sizes.length > 1) out.push({ key: "context", label: "context", value: values.context ?? String(r.ctx), choices: sizes.map((c) => ({ value: String(c), label: `${c / 1024}k` })) });
  }
  return [...out, ...extra];
}

export interface RowContext {
  env?: Env | undefined;
  estimate?: StorageEstimate | null | undefined;
  state?: ModelPickState | undefined;
  progress?: number | undefined;
  options?: Record<string, string> | undefined;
  /** Options a job adds, like a language for speech. */
  extra?: readonly ModelOption[] | undefined;
  /** A row the person added by hand. */
  own?: boolean | undefined;
}

/** One record as one picker row. */
export function rowOf(r: ModelRecord, ctx: RowContext = {}): ModelRow {
  const state = ctx.state ?? "none";
  // the system voice runs wherever speechSynthesis does; its ladder's browser rung reads as a prompt api need
  const fit = r.provider === "system" ? { fit: "fits" as const, ok: true, reason: "" } : fitOf(r, ctx.env, ctx.estimate ?? null);
  const size = sizeWords(r);
  const row: ModelRow = {
    id: r.id,
    name: pretty(r),
    group: ctx.own ? "own" : groupOf(r, state),
    backend: backendOf(r, ctx.env),
    state,
  };
  if (size) row.size = size;
  if (r.vramMB != null) row.memory = `needs ${bytesText(r.vramMB * MIB)}`;
  if (r.sizeMB !== null && !isNoDownload(r)) row.bytes = r.sizeMB * MIB;
  const speed = fit.fit === "fits on cpu, slow" ? "slow" : r.speed;
  if (speed) row.speed = speed;
  if (r.verdict ?? r.badge) row.verdict = (r.verdict ?? r.badge)!;
  if (isUncensored(r)) row.uncensored = true;
  if (r.commercial === false) row.noncommercial = true;
  if (isNoDownload(r)) row.noDownload = true;
  if (!fit.ok) row.unfit = fit.reason;
  if (state === "loading") row.progress = ctx.progress ?? 0;
  const detail = detailOf(r);
  if (detail.length) row.detail = detail;
  const options = optionsOf(r, ctx.options, ctx.extra);
  if (options.length) row.options = options;
  return row;
}

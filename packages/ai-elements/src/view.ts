/**
 * Pure view models for the elements: every string a person reads is built
 * here, so the copy is tested without a browser. UI copy is lowercase,
 * terse, second person, and names the failure.
 */

import type { Env } from "@hackbuild/ai-env";
import { ladderFor, type ModelRecord, type Need, type SizeSource } from "@hackbuild/models";
import type { Recall } from "@hackbuild/memory";
import type { Progress } from "@hackbuild/weights";

/** A size with the word that says where the number came from. */
export function formatSize(mb: number | null, source: SizeSource): string {
  if (mb === null) return "size unknown";
  const v = mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : mb >= 10 ? `${Math.round(mb)} MB` : `${mb.toFixed(1)} MB`;
  return `${v}, ${source}`;
}

export function licenceLine(rec: ModelRecord): string {
  const c = rec.commercial === true ? "commercial use allowed" : rec.commercial === false ? "no commercial use" : "commercial use unknown";
  return `weights ${rec.licence}, ${c}`;
}

const NEED_TEXT: Record<Need, string> = {
  webgpu: "no webgpu adapter",
  "shader-f16": "the gpu has no shader-f16",
  isolated: "the page is not cross origin isolated",
  http: "the page runs from file://",
  promptApi: "no built in prompt api in this browser",
};

/** Why this env cannot run the record, or null when some rung fits. */
export function disableReason(rec: ModelRecord, env: Env | undefined): string | null {
  const { rungs, skipped } = ladderFor(rec, env);
  if (rungs.length) return null;
  if (!skipped.length) return "this model has no device ladder.";
  const missing = [...new Set(skipped.flatMap((s) => s.missing))];
  return `${missing.map((m) => NEED_TEXT[m]).join(", ")}. this model needs ${missing.length > 1 ? "them" : "it"}.`;
}

/** Device needs of the record's first rung, for a short label. */
export function needsLine(rec: ModelRecord): string {
  const devs = [...new Set(rec.ladder.map((r) => r.device))];
  return devs.join(" or ");
}

export interface ModelRow {
  id: string;
  label: string;
  size: string;
  licence: string;
  devices: string;
  disabled: string | null;
  /** First rung this env would try, e.g. "webgpu q4f16". */
  first: string | null;
}

export function modelRows(records: readonly ModelRecord[], env: Env | undefined): ModelRow[] {
  return records.map((r) => {
    const first = ladderFor(r, env).rungs[0];
    const dt = first?.dtype === undefined ? "" : typeof first.dtype === "string" ? ` ${first.dtype}` : " mixed";
    return {
      id: r.id,
      label: r.label ?? r.id,
      size: formatSize(r.sizeMB, r.sizeSource),
      licence: licenceLine(r),
      devices: needsLine(r),
      disabled: disableReason(r, env),
      first: first ? `${first.device}${dt}` : null,
    };
  });
}

const mb = (b: number) => (b / (1024 * 1024)).toFixed(b < 10 * 1024 * 1024 ? 1 : 0);

export interface ProgressView {
  text: string;
  /** 0 to 1, or null for an indeterminate bar. */
  fraction: number | null;
}

/** Download text: percent and MB when the total is known, MB counted when it is not. */
export function progressText(p: Pick<Progress, "loaded" | "total" | "resuming">): ProgressView {
  if (p.resuming) return { text: `resuming, ${mb(p.loaded)} MB on disk`, fraction: p.total ? p.loaded / p.total : null };
  if (p.total === null || p.total <= 0) return { text: `${mb(p.loaded)} MB, total unknown`, fraction: null };
  const f = Math.min(1, p.loaded / p.total);
  return { text: `${Math.floor(f * 100)} percent, ${mb(p.loaded)} of ${mb(p.total)} MB`, fraction: f };
}

export type PillKind = "loading" | "ready" | "busy" | "failed" | "patch-missed" | "idle";

export interface Pill {
  id: string;
  kind: PillKind;
  text: string;
}

/** A status line from an engine or the hub, as a pill. */
export function pillFor(s: { engine?: string; id?: string; kind?: string; text?: string; busy?: number }): Pill {
  const id = s.engine ?? s.id ?? "?";
  if (typeof s.busy === "number") return { id, kind: s.busy > 0 ? "busy" : "ready", text: s.busy > 0 ? `${id} busy, ${s.busy} waiting` : `${id} ready` };
  const kind: PillKind = s.kind === "watchdog" ? "failed" : s.kind === "licence" ? "loading" : ((["loading", "ready", "busy", "failed", "patch-missed"].includes(s.kind ?? "") ? s.kind : "idle") as PillKind);
  return { id, kind, text: (s.text ?? kind).toLowerCase() };
}

export interface TraceRow {
  rank: number;
  id: number;
  kind: string;
  text: string;
  bm25: string;
  cos: string;
  rrf: string;
  score: string;
  /** Inside the k hits handed to the model. */
  used: boolean;
}

const n3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "none");
const rank = (r: number) => (r > 0 ? `#${r}` : "none");

/** One row per fused candidate, best first; ranks of 0 mean the list did not have it. */
export function traceRows(r: Pick<Recall, "trace" | "hits">, maxText = 80): TraceRow[] {
  const used = new Set(r.hits.map((h) => h.item.id));
  return r.trace.map((t, i) => ({
    rank: i + 1,
    id: t.id,
    kind: t.kind,
    text: t.text.length > maxText ? `${t.text.slice(0, maxText - 3)}...` : t.text,
    bm25: `${rank(t.bm25Rank)} ${n3(t.bm25)}`,
    cos: `${rank(t.vecRank)} ${n3(t.cos)}`,
    rrf: n3(t.rrf),
    score: n3(t.score),
    used: used.has(t.id),
  }));
}

/** A key typed into a page, shown as its first and last 4 characters. */
export function maskKey(key: string): string {
  if (key.length <= 8) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

/** Chat transcript state the panel renders. Pure so streaming is testable. */
export interface ChatLine {
  role: "user" | "assistant" | "system";
  text: string;
  think: string;
  done: boolean;
  note?: string;
}

export function appendDelta(lines: readonly ChatLine[], delta: { text?: string; think?: string }): ChatLine[] {
  const out = lines.map((l) => ({ ...l }));
  let last = out[out.length - 1];
  if (!last || last.role !== "assistant" || last.done) {
    last = { role: "assistant", text: "", think: "", done: false };
    out.push(last);
  }
  last.text += delta.text ?? "";
  last.think += delta.think ?? "";
  return out;
}

export function finishLine(lines: readonly ChatLine[], note?: string): ChatLine[] {
  const out = lines.map((l) => ({ ...l }));
  const last = out[out.length - 1];
  if (last && last.role === "assistant" && !last.done) {
    last.done = true;
    if (note) last.note = note;
  }
  return out;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

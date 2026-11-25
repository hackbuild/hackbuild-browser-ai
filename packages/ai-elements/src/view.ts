/**
 * Pure view models for the elements: every string a person reads is built
 * here, so the copy is tested without a browser. UI copy is lowercase,
 * terse, second person, and names the failure.
 */

import type { Env } from "@hackbuild/ai-env";
import { fitOf, type FitResult, type ModelRecord, type SizeSource, type StorageEstimate } from "@hackbuild/models";
import { CENSORSHIP, RESPONSIBILITY, groupRecords, licenceText, searchText, sizeText, vramText } from "@virgilvox/hackbuild-ui/vanilla";
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

/** A row's fit here, the HbModelList shape: the fit word, whether it runs, the reason. */
export type PickerFit = Pick<FitResult, "ok" | "reason"> & { fit: string };

/** fitOf for every record against this env and storage estimate; a fit passed in for an id wins. */
export function pickerFits(records: readonly ModelRecord[], env: Env | undefined, estimate?: StorageEstimate | null, given: Record<string, PickerFit | undefined> = {}): Record<string, PickerFit> {
  const out: Record<string, PickerFit> = {};
  for (const r of records) out[r.id] = given[r.id] ?? fitOf(r, env, estimate);
  return out;
}

export interface PickerView {
  label: string;
  selected: string | null;
  query: string;
  /** The id the probe picked for this machine, and why. */
  defaultId?: string | null;
  defaultWhy?: string;
}

const fitClass = (f: PickerFit) => (!f.ok ? "is-err" : f.fit === "fits" ? "is-ok" : "is-warn");

/**
 * The HbModelList markup (hackbuild-ui, rows variant) for the records: a
 * search field, the censorship legend, groups by size, one radio button
 * per row with the size and its source word, the fit chip, the reason a
 * row that does not fit is off, and the licence as recorded. The picker
 * behaviour is hackbuild-ui/vanilla modelList over this markup.
 */
export function pickerHtml(records: readonly ModelRecord[], fits: Record<string, PickerFit | undefined>, v: PickerView): string {
  const name = (r: ModelRecord) => r.label || r.id;
  const present = (Object.keys(CENSORSHIP) as (keyof typeof CENSORSHIP)[]).filter((k) => records.some((r) => (r.censorship ?? "unknown") === k));
  const steerable = present.some((k) => k === "uncensored" || k === "abliterated");
  const legend = present.length && records.some((r) => r.censorship)
    ? `<p class="hb-model-legend">${present.map((k) => `<span class="hb-model-legend-item"><b>${escapeHtml(CENSORSHIP[k].word)}</b> ${escapeHtml(CENSORSHIP[k].legend)}</span>`).join("")}${steerable ? `<span class="hb-model-legend-item">${escapeHtml(RESPONSIBILITY)}</span>` : ""}</p>`
    : "";
  const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, "-");
  const row = (r: ModelRecord) => {
    const f = fits[r.id];
    const off = f?.ok === false;
    const chosen = r.id === v.selected;
    const vram = vramText(r);
    const lic = licenceText(r.licence, r.commercial);
    const why = `why-${slug(r.id)}`;
    return `<li class="hb-model is-none${off ? " is-off" : ""}${chosen ? " is-chosen" : ""}" data-row>` +
      `<button type="button" class="hb-model-pick" data-model="${escapeHtml(r.id)}" data-search="${escapeHtml(searchText(r))}" role="radio" aria-checked="${chosen}"${off ? ` aria-disabled="true" aria-describedby="${why}"` : ""}>` +
      `<span class="hb-model-head"><span class="hb-model-name">${escapeHtml(name(r))}</span>${r.badge ? `<span class="hb-model-badge">${escapeHtml(r.badge)}</span>` : ""}${r.id === v.defaultId ? `<span class="hb-model-def">picked for this machine</span>` : ""}</span>` +
      (r.id === v.defaultId && v.defaultWhy ? `<span class="hb-model-defwhy">${escapeHtml(v.defaultWhy)}</span>` : "") +
      (r.note ? `<span class="hb-model-note">${escapeHtml(r.note)}</span>` : "") +
      `<span class="hb-model-meta">${escapeHtml(sizeText(r.sizeMB, r.sizeSource))}${vram ? `. ${escapeHtml(vram)}` : ""}</span>` +
      `<span class="hb-model-tags">${r.censorship ? `<span class="hb-model-cens is-${r.censorship}">${escapeHtml(CENSORSHIP[r.censorship].word)}</span>` : ""}${f ? `<span class="hb-model-fit ${fitClass(f)}"><span class="hb-sr">fit here: </span>${escapeHtml(f.fit)}</span>` : ""}${(r.tags ?? []).map((t) => `<span class="hb-model-tag">${escapeHtml(t)}</span>`).join("")}</span>` +
      `</button>` +
      (off ? `<p id="${why}" class="hb-model-why">${escapeHtml(f.reason)}</p>` : "") +
      (lic ? `<p class="hb-licence-q">${escapeHtml(lic)}</p>` : "") +
      `</li>`;
  };
  const groups = groupRecords(records);
  const chosen = records.find((r) => r.id === v.selected);
  const echo = chosen ? `picked: ${name(chosen)}${chosen.badge ? `, ${chosen.badge}` : ""}, ${sizeText(chosen.sizeMB, chosen.sizeSource)}.` : "nothing picked yet.";
  return `<div class="hb-modellist is-rows">` +
    (records.length > 1 ? `<div class="hb-modellist-tools"><label class="hb-modellist-search"><span class="hb-sr">search ${escapeHtml(v.label)}</span><input class="hb-input" type="search" placeholder="search by name, tag or size" spellcheck="false" value="${escapeHtml(v.query)}"></label></div>` : "") +
    legend +
    `<div class="hb-models" aria-label="${escapeHtml(v.label)}">` +
    groups.map((g) => `<section class="hb-model-group" data-group role="group" aria-labelledby="gh-${slug(g.group)}"><h4 id="gh-${slug(g.group)}" class="hb-model-gh">${escapeHtml(g.group)}</h4><ul class="hb-model-rows">${g.rows.map(row).join("")}</ul></section>`).join("") +
    `<p class="hb-model-empty"${groups.length ? " hidden" : ""}>${records.length ? "no model matches. clear the search." : "no models registered."}</p>` +
    `</div><p class="hb-model-echo" role="status" aria-live="polite">${escapeHtml(echo)}</p></div>`;
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
// the core ranks from 0 (best) and uses -1 for absent; shown 1 based
const rank = (r: number) => (r >= 0 ? `#${r + 1}` : "none");

/** One row per fused candidate, best first; a rank of -1 means the list did not have it. */
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
  // below 16 characters, 8 shown characters would give most of the key away
  if (key.length < 16) return "*".repeat(key.length);
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

/**
 * The memory inspector folded in from ai-elements: what a recall found, one
 * row per fused candidate, best first, with the ones handed to the model
 * marked. Rows are built here; the markup is hackbuild-ui's table.
 */

import type { Recall } from "@hackbuild/memory";
import { esc, type Mounted } from "./dom.js";

export interface TraceRow {
  rank: number;
  id: number;
  kind: string;
  text: string;
  bm25: string;
  cos: string;
  rrf: string;
  score: string;
  /** Inside the hits handed to the model. */
  used: boolean;
}

const n3 = (x: number) => (Number.isFinite(x) ? x.toFixed(3) : "none");
// the core ranks from 0 (best) and uses -1 for absent; shown 1 based
const rank = (r: number) => (r >= 0 ? `#${r + 1}` : "none");

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

export type RecallLike = Pick<Recall, "trace" | "hits" | "query" | "mode">;

export function inspectorHtml(rec: RecallLike | null): string {
  if (!rec) return `<p class="hb-lay-empty-note">no recall yet. ask something to see what memory finds.</p>`;
  const rows = traceRows(rec);
  return (
    `<p class="hb-lay-empty-note" role="status">"${esc(rec.query)}", ${esc(rec.mode)} recall, ${rows.length} found, ${rows.filter((x) => x.used).length} used.</p>` +
    `<div class="hb-scroll-x" data-ux="detail"><table class="hb-table"><thead><tr><th class="num">#</th><th>kind</th><th>text</th><th>bm25</th><th>cosine</th><th class="num">rrf</th><th class="num">score</th></tr></thead><tbody>` +
    rows.map((x) => `<tr class="${x.used ? "is-mark" : ""}" data-used="${x.used}"><td class="num">${x.rank}</td><td>${esc(x.kind)}</td><td>${esc(x.text)}</td><td>${esc(x.bm25)}</td><td>${esc(x.cos)}</td><td class="num">${x.rrf}</td><td class="num">${x.score}</td></tr>`).join("") +
    `</tbody></table></div>`
  );
}

export interface MemoryInspector extends Mounted {
  set(rec: RecallLike | null): void;
}

export function mountMemoryInspector(host: HTMLElement, rec: RecallLike | null = null): MemoryInspector {
  host.innerHTML = inspectorHtml(rec);
  return { set: (r) => void (host.innerHTML = inspectorHtml(r)), dispose() {} };
}

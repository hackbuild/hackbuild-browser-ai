// The recall trace view's data: per query term BM25 weights and the parts
// of each candidate's score, recomputed in TypeScript from the same
// formulas the core runs (crates/memory/src/index.rs and text.rs), so
// the view can say why a memory won and why the others lost.

import type { CoreHit, Kind } from "./core.js";
import type { StoredItem } from "./sink.js";

const STOP = new Set(
  (
    "a about after again all am an and any are as at be been before being but by can could did do does doing for from had has have having he her " +
    "here hers him his how i if in into is it its just me more my no nor not of off on once only or other our out over own same she so some such " +
    "than that the their them then there these they this those through to too under until up very was we were what when where which while who " +
    "whom why will with would you your yours"
  ).split(" "),
);

const bytes = (s: string) => new TextEncoder().encode(s).length;

function stem(w: string): string {
  const n = bytes(w);
  if (n > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (n > 4 && (w.endsWith("ed") || w.endsWith("es"))) return w.slice(0, -2);
  if (n > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

/** The core's tokenizer: lowercase, split on anything not a letter or digit, stop words and one character tokens out, a few suffixes stripped. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  let cur = "";
  const flush = () => {
    if ([...cur].length > 1 && !STOP.has(cur)) out.push(stem(cur));
    cur = "";
  };
  for (const c of text) {
    if (/[\p{Alphabetic}\p{N}]/u.test(c)) cur += c.toLowerCase();
    else flush();
  }
  flush();
  return out;
}

/** The parameters a recall ran with, as the trace needs them. */
export interface RecallParams {
  scorer: "linear" | "organic";
  weights: { rel: number; rec: number; imp: number };
  tauH: number;
  rrfK: number;
  cand: number;
  k: number;
  vecFloor: number;
  /** Clock at the recall, ms. */
  now: number;
  scopes: string[] | null;
  kinds: Kind[] | null;
  place: [number, number, number] | null;
  valence: number;
  /** User turns still in view; memories of them were skipped. */
  skipSaid: string[];
}

/** One query term: in how many admitted memories it occurs and its idf. */
export interface TermWeight {
  term: string;
  df: number;
  idf: number;
}

/** One candidate in a recall trace: its ranks, score parts, weight, matched terms and whether the caller got it. */
export interface TraceRow {
  id: number;
  text: string;
  kind: Kind;
  /** 1 based rank by final score. */
  rank: number;
  /** In the hits the caller got. */
  used: boolean;
  /** Left out because its exchange is still in view. */
  skipped: boolean;
  bm25Rank: number;
  vecRank: number;
  bm25: number;
  cos: number;
  rrf: number;
  rel: number;
  rec: number;
  imp: number;
  ret: number;
  /** The item's strength multiplier at recall time. */
  weight: number;
  score: number;
  /** Score parts before the weight: the sum times weight is the score. */
  parts: Record<string, number>;
  /** BM25 contribution of each query term found in this memory. */
  terms: { term: string; tf: number; weight: number }[];
}

/** The recall inspector's view of one query: the parameters, per term weights and every candidate row with its score parts. */
export interface RecallTrace {
  query: string;
  mode: "hybrid" | "keyword";
  params: RecallParams;
  terms: TermWeight[];
  rows: TraceRow[];
  /** One lowercase sentence on how candidates were scored. */
  how: string;
}

const HOUR = 3_600_000;
const K1 = 1.4;
const B = 0.75;

/** Score parts of one hit, the same arithmetic as the core's scorers. */
export function scoreParts(h: CoreHit, it: StoredItem, p: RecallParams): Record<string, number> {
  if (p.scorer === "linear") return { rel: p.weights.rel * h.rel, rec: p.weights.rec * h.rec, imp: p.weights.imp * h.imp };
  const now = p.now / HOUR;
  const sim = h.cos > 0 ? h.cos : h.rel;
  const emo = 0.5 * it.arousal + 0.5 * Math.abs(it.valence);
  const half = 4 + 30 * it.importance + 20 * emo + 8 * Math.min(it.uses, 5);
  const ret = Math.exp(-Math.max(0, now - it.created / HOUR) / half);
  let place = 0;
  if (p.place && it.place) {
    const d = Math.hypot(p.place[0] - it.place[0], p.place[1] - it.place[1], p.place[2] - it.place[2]);
    place = 0.08 * Math.exp(-d / 2.5);
  }
  const mood = 0.05 * (1 - Math.abs(it.valence - p.valence) / 2);
  const recent = it.uses > 0 ? 0.04 * Math.exp(-Math.max(0, now - it.lastUsed / HOUR) / 24) : 0;
  return { sim: 0.6 * sim, ret: 0.18 * ret, emo: 0.06 * emo, novelty: 0.05 * it.novelty, place, mood, recent };
}

/** Per term idf over the admitted memories, and each memory's per term BM25 contribution. */
export function termWeights(query: string, docs: readonly Pick<StoredItem, "id" | "text">[]): { terms: TermWeight[]; byId: Map<number, { term: string; tf: number; weight: number }[]> } {
  const q = [...new Set(tokenize(query))].sort();
  const toks = docs.map((d) => tokenize(d.text));
  const n = docs.length;
  const avgdl = n ? toks.reduce((s, t) => s + t.length, 0) / n : 0;
  const terms = q.map((term) => {
    const df = toks.filter((t) => t.includes(term)).length;
    return { term, df, idf: Math.log(1 + (n - df + 0.5) / (df + 0.5)) };
  });
  const byId = new Map<number, { term: string; tf: number; weight: number }[]>();
  docs.forEach((d, i) => {
    const t = toks[i]!;
    const norm = avgdl > 0 ? t.length / avgdl : 0;
    const rows: { term: string; tf: number; weight: number }[] = [];
    for (const w of terms) {
      const tf = t.filter((x) => x === w.term).length;
      if (tf) rows.push({ term: w.term, tf, weight: (w.idf * tf * (K1 + 1)) / (tf + K1 * (1 - B + B * norm)) });
    }
    byId.set(d.id, rows);
  });
  return { terms, byId };
}

/** The sentence above the trace. */
export function howScored(mode: "hybrid" | "keyword", p: RecallParams, rows: number, used: number): string {
  const by = mode === "hybrid" ? "keyword and meaning, fused by rank" : "keyword only, no embedder loaded";
  const score =
    p.scorer === "linear"
      ? `then scored ${p.weights.rel} relevance, ${p.weights.rec} recency and ${p.weights.imp} importance`
      : "then scored by similarity, retention, emotion, novelty, place, mood and recent use";
  return `${rows} candidates found by ${by}, ${score}, times each memory's strength. ${used} used.`;
}

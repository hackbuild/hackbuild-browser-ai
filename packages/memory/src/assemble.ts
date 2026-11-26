// Token budgeted context assembly, recall selection, prefix stable
// injection and core memory. Pure functions over strings.

/** Characters per token for the default estimate (inferred, not measured on a tokenizer). */
export const CHARS_PER_TOKEN = 3.6;
/** Estimates the tokens in a string as its length over `CHARS_PER_TOKEN`, rounded up. */
export const estimateTokens = (s: string): number => Math.ceil(s.length / CHARS_PER_TOKEN);

/** One named block of context with the priority `budget` keeps it by. */
export interface Section {
  name: string;
  priority: number;
  text: string;
}

/** A context fitted to a token budget: the text, the section names kept and dropped, and the tokens used. */
export interface Assembled {
  text: string;
  kept: string[];
  dropped: string[];
  usedTokens: number;
  budgetTokens: number;
}

/**
 * Fixed lines always go in; ranked sections join highest priority first
 * while they fit the budget (equal priorities keep their given order). A
 * section that does not fit is skipped and smaller ones below it may still
 * join.
 */
export function budget(opts: {
  budgetTokens: number;
  fixed?: string[];
  sections: Section[];
  estimate?: (s: string) => number;
  joiner?: string;
}): Assembled {
  const est = opts.estimate ?? estimateTokens;
  const fixed = (opts.fixed ?? []).filter((s) => s.length > 0);
  let used = fixed.reduce((n, s) => n + est(s), 0);
  const kept: Section[] = [];
  const dropped: string[] = [];
  const ranked = opts.sections
    .map((s, i) => ({ s, i }))
    .filter((x) => x.s.text.length > 0)
    .sort((a, b) => b.s.priority - a.s.priority || a.i - b.i);
  for (const { s } of ranked) {
    const t = est(s.text);
    if (used + t <= opts.budgetTokens) {
      used += t;
      kept.push(s);
    } else dropped.push(s.name);
  }
  const text = [...fixed, ...kept.map((s) => s.text)].join(opts.joiner ?? "\n\n");
  return { text, kept: kept.map((s) => s.name), dropped, usedTokens: used, budgetTokens: opts.budgetTokens };
}

/**
 * The memory sections in the order of the embodied agent prompt: core
 * facts (priority 10), caller sections, a summary (6), recalled lines (5),
 * recent turns (3), then budget().
 */
export function assembleSections(o: {
  budgetTokens: number;
  estimate?: (s: string) => number;
  fixed?: string[];
  sections?: Section[];
  coreText?: string;
  summary?: string;
  recalled?: string[];
  recent?: string[];
}): Assembled {
  const s: Section[] = [];
  if (o.coreText) s.push({ name: "core", priority: 10, text: `WHAT YOU KNOW FOR SURE\n${o.coreText}` });
  s.push(...(o.sections ?? []));
  if (o.summary) s.push({ name: "summary", priority: 6, text: `EARLIER\n${o.summary}` });
  if (o.recalled?.length) s.push({ name: "recall", priority: 5, text: `YOU REMEMBER\n${o.recalled.map((r) => `- ${r}`).join("\n")}` });
  if (o.recent?.length) s.push({ name: "recent", priority: 3, text: `LAST TURNS\n${o.recent.join("\n")}` });
  return budget({ budgetTokens: o.budgetTokens, sections: s, ...(o.fixed ? { fixed: o.fixed } : {}), ...(o.estimate ? { estimate: o.estimate } : {}) });
}

const wordSet = (s: string): Set<string> => new Set(s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []);

/** The Jaccard similarity of the word sets of two strings, 0 to 1; two empty strings give 1. */
export function jaccard(a: string, b: string): number {
  const x = wordSet(a);
  const y = wordSet(b);
  if (!x.size && !y.size) return 1;
  let inter = 0;
  for (const w of x) if (y.has(w)) inter++;
  return inter / (x.size + y.size - inter);
}

/**
 * Picks recalled texts for a prompt: at most k, at most perSection from one
 * section, none within the Jaccard threshold of one already picked, and at
 * most maxChars in all; the last one is cut at a word boundary.
 */
export function select(
  hits: { text: string; section?: string | undefined }[],
  opts: { k?: number; maxChars?: number; perSection?: number; dedup?: number } = {},
): string[] {
  const k = opts.k ?? 3;
  const maxChars = opts.maxChars ?? 1800;
  const per = opts.perSection ?? 2;
  const dd = opts.dedup ?? 0.55;
  const out: string[] = [];
  const count = new Map<string, number>();
  let chars = 0;
  for (const h of hits) {
    if (out.length >= k || chars >= maxChars) break;
    const sec = h.section ?? "";
    if ((count.get(sec) ?? 0) >= per) continue;
    if (out.some((o) => jaccard(o, h.text) >= dd)) continue;
    let t = h.text;
    if (chars + t.length > maxChars) {
      const room = maxChars - chars;
      const cut = t.slice(0, room);
      const sp = cut.lastIndexOf(" ");
      t = (sp > room / 2 ? cut.slice(0, sp) : cut).trimEnd();
      if (!t) break;
    }
    out.push(t);
    chars += t.length;
    count.set(sec, (count.get(sec) ?? 0) + 1);
  }
  return out;
}

/** The previous user turn goes in front of a short query (under 45 characters), so follow ups retrieve. */
export function expandQuery(query: string, previous?: string, minChars = 45): string {
  return previous && query.trim().length < minChars ? `${previous} ${query}` : query;
}

/** A chat message with a role and text content, as `injectRecall` and `RecallConversation` read and write it. */
export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

/** The fixed note `injectRecall` adds to the system message, telling the model what `[memory]` lines are. */
export const RECALL_NOTE =
  "Lines that start with [memory] under a user message are notes you kept from earlier talks. Use them when they fit; never quote them as the person's words.";

/**
 * Prefix stable recall injection. The system message gets one fixed note
 * (the same text every turn); recalled lines go under the latest user
 * message only. No earlier message changes, so a runtime that keeps the
 * KV cache of the previous prompt reuses all of it, provided the caller
 * keeps the returned messages as its history.
 */
export function injectRecall(messages: Message[], recalled: string[], opts: { note?: string; tag?: string } = {}): Message[] {
  const note = opts.note ?? RECALL_NOTE;
  const tag = opts.tag ?? "[memory]";
  const out = messages.map((m) => ({ ...m }));
  const sys = out[0]?.role === "system" ? out[0] : null;
  if (sys) {
    if (!sys.content.endsWith(note)) sys.content = sys.content ? `${sys.content}\n\n${note}` : note;
  } else out.unshift({ role: "system", content: note });
  if (recalled.length) {
    for (let i = out.length - 1; i >= 0; i--) {
      const m = out[i]!;
      if (m.role === "user") {
        m.content = withRecall(m.content, recalled, tag);
        break;
      }
      if (m.role !== "assistant" && m.role !== "tool") break;
    }
  }
  return out;
}

/** A user message with recalled lines under it, one tagged line each. */
export function withRecall(text: string, recalled: string[], tag = "[memory]"): string {
  if (!recalled.length) return text;
  return `${text}\n${recalled.map((r) => `${tag} ${r.replace(/\s*\n\s*/g, " ")}`).join("\n")}`;
}

/** Keeps a conversation whose prompt only ever grows at the end. */
export class RecallConversation {
  private history: Message[];
  constructor(system = "", private readonly opts: { note?: string; tag?: string } = {}) {
    this.history = injectRecall(system ? [{ role: "system", content: system }] : [], [], opts);
  }
  /** Adds a user turn with its recalled lines and returns the whole prompt. */
  user(text: string, recalled: string[] = []): Message[] {
    this.history.push({ role: "user", content: withRecall(text, recalled, this.opts.tag) });
    return this.messages;
  }
  assistant(text: string): void {
    this.history.push({ role: "assistant", content: text });
  }
  get messages(): Message[] {
    return this.history.map((m) => ({ ...m }));
  }
}

/** Pinned facts that go into every prompt, capped in characters. */
export class CoreMemory {
  lines: string[];
  constructor(
    lines: string[] = [],
    readonly maxChars = 700,
  ) {
    this.lines = [...lines];
  }
  /** Appends a fact unless one with the same key (first 40 letters, digits and spaces, any case) exists; evicts the oldest lines to fit. Returns false for a duplicate. */
  append(fact: string): boolean {
    const f = fact.replace(/\s+/g, " ").trim();
    if (!f) return false;
    const key = CoreMemory.key(f);
    if (this.lines.some((l) => CoreMemory.key(l) === key)) return false;
    this.lines.push(f.slice(0, this.maxChars));
    while (this.text().length > this.maxChars && this.lines.length > 1) this.lines.shift();
    return true;
  }
  /** Lowercase, letters, digits and spaces only, first 40 characters. */
  static key(s: string): string {
    return s.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, "").slice(0, 40);
  }
  remove(match: string): boolean {
    const n = this.lines.length;
    this.lines = this.lines.filter((l) => !l.toLowerCase().includes(match.toLowerCase()));
    return this.lines.length < n;
  }
  text(): string {
    return this.lines.join("\n");
  }
}

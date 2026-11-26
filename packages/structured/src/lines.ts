/**
 * Line tagged formats: THOUGHT / ACTION ReAct with multi line bodies
 * (PATH, CONTENT, CODE), the vision sandbox's short Thought / Action, and
 * the three line SAW / THOUGHT / GOAL cortex. A tag line is `NAME:` at the
 * start of a line, any case; its value runs until the next tag line. Raw
 * newlines in a value are fine, which is why code goes through this format.
 */

export interface LinesOptions {
  /** Tag names to read; others stay inside the previous value. */
  tags: readonly string[];
}

/** First value per tag, keyed by the tag as given in `tags`. */
export function parseLines(text: string, o: LinesOptions): Record<string, string> {
  const want = new Map(o.tags.map((t) => [t.toLowerCase(), t]));
  const out: Record<string, string> = {};
  let cur: string | null = null;
  let acc: string[] = [];
  const flush = () => {
    if (cur && !(cur in out)) out[cur] = acc.join("\n").trim();
    acc = [];
  };
  for (const line of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = /^\s*[*_#>-]*\s*([A-Za-z_]+)\s*[*_]*\s*:[*_]*\s?(.*)$/.exec(line);
    const tag = m ? want.get(m[1]!.toLowerCase()) : undefined;
    if (tag) {
      flush();
      cur = tag;
      acc = [m![2]!];
    } else if (cur) acc.push(line);
  }
  flush();
  return out;
}

/** The body of a fenced block when there is one, else the text trimmed. */
export function grabCode(value: string): { code: string; lang: string | null } {
  const m = /```([\w+-]*)\n?([\s\S]*?)(?:```|$)/.exec(value);
  if (m) return { code: m[2]!.replace(/\n$/, ""), lang: m[1] || null };
  return { code: value.trim(), lang: null };
}

/** An action read from an ACTION line: the tool name, its positional arguments, and the text as written. */
export interface ParsedAction {
  name: string;
  /** Positional arguments from `name(a, b)` or `name a b` forms. */
  args: string[];
  raw: string;
}

/**
 * Parse an ACTION value: `look(mug)`, `look mug`, `pick_up(red mug, table)`,
 * `["look", "mug"]`. Names are matched against `known` (case and separators
 * ignored) when given; an unknown name returns null.
 */
export function parseAction(value: string, known?: readonly string[]): ParsedAction | null {
  const raw = value.trim().split("\n")[0]!.trim().replace(/[.;]$/, "");
  if (!raw) return null;
  let name: string;
  let args: string[];
  const arr = /^\[(.*)\]$/.exec(raw);
  const call = /^([\w.-]+)\s*\((.*)\)\s*$/.exec(raw);
  if (arr) {
    const parts = arr[1]!.split(",").map((s) => s.trim().replace(/^["']|["']$/g, ""));
    name = parts.shift() ?? "";
    args = parts.filter(Boolean);
  } else if (call) {
    name = call[1]!;
    args = call[2]!.split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
  } else {
    const [n, ...rest] = raw.split(/\s+/);
    name = n!;
    args = rest.length ? [rest.join(" ").replace(/^["']|["']$/g, "")] : [];
  }
  if (known) {
    const norm = (s: string) => s.toLowerCase().replace(/[\s_-]+/g, "");
    const hit = known.find((k) => norm(k) === norm(name));
    if (!hit) return null;
    name = hit;
  }
  return { name, args, raw };
}

/** Keyword fallback when no ACTION line parses (vision sandbox ACTION_SYNS): words to actions, capped. */
export function keywordActions(text: string, synonyms: Record<string, string>, o: { max?: number; maxRepeat?: number } = {}): string[] {
  const max = o.max ?? 6;
  const maxRepeat = o.maxRepeat ?? 4;
  const out: string[] = [];
  const counts = new Map<string, number>();
  const lower = text.toLowerCase();
  const hits: { at: number; action: string }[] = [];
  for (const [word, action] of Object.entries(synonyms)) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    for (const m of lower.matchAll(re)) hits.push({ at: m.index ?? 0, action });
  }
  hits.sort((a, b) => a.at - b.at);
  for (const h of hits) {
    if (out.length >= max) break;
    const c = counts.get(h.action) ?? 0;
    if (c >= maxRepeat) continue;
    counts.set(h.action, c + 1);
    out.push(h.action);
  }
  return out;
}

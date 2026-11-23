/**
 * Streaming inline tag parser. Small models drift between tag styles, so
 * the parser accepts all the forms earlier character chat builds saw:
 *
 *   [key:value]  [key=value]  [KEY: value]          keyed tags (BonziBuddy [ACTION: x] is one)
 *   *phrase*  (phrase)  [phrase]  {phrase}  CJK brackets   plain tags, resolved against the vocabularies
 *   key: value   on a line of its own, for keys in `lineKeys`
 *
 * feed(chunk) returns the visible text with tags removed and the tags that
 * completed in this chunk, each with its offset in the visible text, so a
 * voice timeline can fire a tag when speech reaches it. Text that might
 * still become a tag is held back (at most `maxTag` characters).
 *
 * Values resolve exact, then synonym, then substring, then token overlap
 * (live2d resolveExpr).
 */

export interface TagGrammar {
  /** Vocabulary per key; null accepts any value for that key. */
  keys: Record<string, readonly string[] | null>;
  /** word or phrase to canonical value, e.g. { grin: "happy", "waves hello": "wave" }. */
  synonyms?: Record<string, string>;
  /** Accept plain tags (*x*, (x), [x], {x}, CJK brackets). Default true. */
  plain?: boolean;
  /** Keys also accepted as `key: value` on their own line. */
  lineKeys?: readonly string[];
  /** Remove plain tags that resolve to nothing (stage directions). Default true for * and brackets, false for parentheses. */
  stripUnresolved?: boolean;
  /** Longest tag held back while streaming. Default 48. */
  maxTag?: number;
}

export interface Tag {
  key: string;
  value: string;
  /** The tag as written. */
  raw: string;
  /** Offset in the visible (stripped) text where the tag sat. */
  at: number;
}

const OPENERS: Record<string, string> = { "[": "]", "*": "*", "(": ")", "{": "}", "【": "】", "「": "」", "（": "）" };

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1);
}

/** Resolve a value against a vocabulary: exact, synonym, substring, then token overlap. */
export function resolveValue(value: string, vocab: readonly string[], synonyms: Record<string, string> = {}): string | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  const lower = vocab.map((x) => x.toLowerCase());
  const exact = lower.indexOf(v);
  if (exact >= 0) return vocab[exact]!;
  const syn = Object.entries(synonyms).find(([k]) => k.toLowerCase() === v);
  if (syn && lower.includes(syn[1].toLowerCase())) return vocab[lower.indexOf(syn[1].toLowerCase())]!;
  for (let i = 0; i < lower.length; i++) {
    const w = lower[i]!;
    if (w.length > 2 && (v.includes(w) || w.includes(v))) return vocab[i]!;
  }
  for (const [k, canon] of Object.entries(synonyms)) {
    if (k.length > 2 && v.includes(k.toLowerCase()) && lower.includes(canon.toLowerCase())) return vocab[lower.indexOf(canon.toLowerCase())]!;
  }
  const vt = new Set(tokens(v));
  let best = -1;
  let bestN = 0;
  lower.forEach((w, i) => {
    const n = tokens(w).filter((t) => vt.has(t)).length;
    if (n > bestN) {
      bestN = n;
      best = i;
    }
  });
  return best >= 0 ? vocab[best]! : null;
}

export interface TagParser {
  feed(chunk: string): { text: string; tags: Tag[] };
  /** Flush at the end of the stream. An unclosed tag is returned as text. */
  end(): { text: string; tags: Tag[] };
  /** Whole text at once: visible text and every tag. */
  parse(text: string): { text: string; tags: Tag[] };
  /** Visible text only, for speech. */
  strip(text: string): string;
}

export function createTagParser(g: TagGrammar): TagParser {
  const keys = Object.keys(g.keys);
  const keyLower = new Map(keys.map((k) => [k.toLowerCase(), k]));
  const plain = g.plain !== false;
  const maxTag = g.maxTag ?? 48;
  const lineKeys = new Set((g.lineKeys ?? []).map((k) => k.toLowerCase()));
  let buf = "";
  let visibleLen = 0;
  let lineStart = true;
  let lastChar = "";
  let skipSpace = false;

  const resolvePlain = (phrase: string): { key: string; value: string } | null => {
    for (const k of keys) {
      const vocab = g.keys[k];
      if (!vocab) continue;
      const r = resolveValue(phrase, vocab, g.synonyms);
      if (r) return { key: k, value: r };
    }
    return null;
  };

  const keyed = (inner: string): { key: string; value: string } | null => {
    const m = /^\s*([\p{L}_][\p{L}\p{N}_ -]{0,24}?)\s*[:=]\s*(.+?)\s*$/u.exec(inner);
    if (!m) return null;
    const key = keyLower.get(m[1]!.toLowerCase());
    if (!key) return null;
    const vocab = g.keys[key];
    if (!vocab) return { key, value: m[2]! };
    const r = resolveValue(m[2]!, vocab, g.synonyms);
    return r ? { key, value: r } : null;
  };

  /** Try to read a tag at the start of s. Returns consumed length, or 0 for no tag, or -1 when more text is needed. */
  const readTag = (s: string, final: boolean): { len: number; tag?: { key: string; value: string }; drop: boolean } => {
    const open = s[0]!;
    const close = OPENERS[open];
    if (close) {
      if (open === "*" && s[1] === "*") return { len: 0, drop: false }; // markdown bold is not a tag
      const end = s.indexOf(close, 1);
      if (end < 0) {
        if (!final && s.length < maxTag && !s.includes("\n")) return { len: -1, drop: false };
        return { len: 0, drop: false };
      }
      const inner = s.slice(1, end);
      if (!inner.trim() || inner.length > maxTag || inner.includes("\n")) return { len: 0, drop: false };
      const k = keyed(inner);
      if (k) return { len: end + 1, tag: k, drop: true };
      if (!plain) return { len: 0, drop: false };
      const p = resolvePlain(inner);
      if (p) return { len: end + 1, tag: p, drop: true };
      const stripUnresolved = g.stripUnresolved ?? open !== "(";
      return stripUnresolved && open !== "{" ? { len: end + 1, drop: true } : { len: 0, drop: false };
    }
    return { len: 0, drop: false };
  };

  const readLine = (s: string, final: boolean): { len: number; tag?: { key: string; value: string } } => {
    const nl = s.indexOf("\n");
    if (nl < 0 && !final) {
      const m = /^\s*([\p{L}_]+)\s*:?/u.exec(s);
      if (m && lineKeys.has(m[1]!.toLowerCase()) && s.length < maxTag) return { len: -1 };
      if (/^\s*[\p{L}_]*$/u.test(s) && s.length < 16) return { len: -1 };
      return { len: 0 };
    }
    const line = nl < 0 ? s : s.slice(0, nl);
    const m = /^\s*([\p{L}_]+)\s*:\s*(.+?)\s*$/u.exec(line);
    if (!m || !lineKeys.has(m[1]!.toLowerCase())) return { len: 0 };
    const k = keyed(`${m[1]}: ${m[2]}`);
    return k ? { len: nl < 0 ? s.length : nl + 1, tag: k } : { len: 0 };
  };

  function run(final: boolean): { text: string; tags: Tag[] } {
    let text = "";
    const tags: Tag[] = [];
    let i = 0;
    while (i < buf.length) {
      const rest = buf.slice(i);
      if (lineStart && lineKeys.size) {
        const r = readLine(rest, final);
        if (r.len < 0) break;
        if (r.len > 0) {
          tags.push({ key: r.tag!.key, value: r.tag!.value, raw: rest.slice(0, r.len).trim(), at: visibleLen + text.length });
          i += r.len;
          lineStart = true;
          continue;
        }
      }
      const ch = buf[i]!;
      if (ch === "*" && buf[i + 1] === undefined && !final) break;
      if (ch === "*" && buf[i + 1] === "*") {
        // markdown bold or italics marker, not a tag
        text += "**";
        lastChar = "*";
        skipSpace = false;
        lineStart = false;
        i += 2;
        continue;
      }
      if (OPENERS[ch]) {
        const r = readTag(rest, final);
        if (r.len < 0) break;
        if (r.len > 0) {
          if (r.tag) tags.push({ key: r.tag.key, value: r.tag.value, raw: rest.slice(0, r.len), at: visibleLen + text.length });
          i += r.len;
          // the space a removed tag leaves behind is collapsed
          if (lastChar === " " || lastChar === "") skipSpace = true;
          continue;
        }
      }
      if (skipSpace && ch === " ") {
        i++;
        continue;
      }
      skipSpace = false;
      text += ch;
      lastChar = ch;
      lineStart = ch === "\n";
      i++;
    }
    buf = buf.slice(i);
    visibleLen += text.length;
    return { text, tags };
  }

  const parser: TagParser = {
    feed(chunk) {
      buf += chunk;
      return run(false);
    },
    end() {
      const r = run(true);
      const rest = buf;
      buf = "";
      visibleLen += rest.length;
      return { text: r.text + rest, tags: r.tags };
    },
    parse(input) {
      const p = createTagParser(g);
      const a = p.feed(input);
      const b = p.end();
      // collapse space runs and trim, carrying each tag's offset into the new text
      const raw = a.text + b.text;
      const runs = [...raw.matchAll(/[ \t]{2,}/g)];
      const collapse = (pos: number): number => {
        let shift = 0;
        for (const m of runs) {
          if (m.index >= pos) break;
          shift += Math.min(pos, m.index + m[0].length) - m.index - 1;
        }
        return pos - shift;
      };
      const collapsed = raw.replace(/[ \t]{2,}/g, " ");
      const lead = collapsed.length - collapsed.trimStart().length;
      const text = collapsed.trim();
      const tags = [...a.tags, ...b.tags].map((t) => ({ ...t, at: Math.max(0, Math.min(text.length, collapse(t.at) - lead)) }));
      return { text, tags };
    },
    strip(text) {
      return parser.parse(text).text;
    },
  };
  return parser;
}

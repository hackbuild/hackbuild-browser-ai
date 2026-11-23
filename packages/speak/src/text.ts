/**
 * Text for a voice: what to say and where each spoken character came
 * from. Offsets are kept in the caller's text (the visible reply, with
 * action tags already removed), so lip sync and action cues share one
 * coordinate space with the tag parser in @hackbuild/structured.
 */

export interface Speakable {
  /** Text to send to an engine. */
  text: string;
  /** map[i] is the offset in the input of output character i; map[text.length] is the input length. */
  map: Int32Array;
}

interface Edit {
  start: number;
  end: number;
  repl: string;
}

export interface SpeakableOptions {
  /** Whole word replacements, e.g. { "hack.build": "hack dot build", AuDHD: "A U D H D" }. */
  lexicon?: Record<string, string>;
  /** Word read in place of a bare URL. Default "link". */
  url?: string;
}

// pictographs plus skin tone modifiers, variation selectors, the zero width joiner and the keycap mark, by code point
const cp = (n: number) => `\\u{${n.toString(16)}}`;
const PICTO = new RegExp(`[\\p{Extended_Pictographic}${cp(0x1f3fb)}-${cp(0x1f3ff)}${cp(0xfe0e)}${cp(0xfe0f)}${cp(0x200d)}${cp(0x20e3)}]+`, "gu");

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Strip what should not be read aloud: think blocks (closed or still
 * open), code fences, markdown marks, link targets, emoji and variation
 * selectors; read bare URLs as one word; apply the lexicon; collapse
 * whitespace. Returns the text and an offset map back into the input.
 */
export function speakable(input: string, o: SpeakableOptions = {}): Speakable {
  const edits: Edit[] = [];
  const claimed: [number, number][] = [];
  const free = (a: number, b: number) => claimed.every(([x, y]) => b <= x || a >= y);
  const add = (start: number, end: number, repl: string) => {
    if (end <= start || !free(start, end)) return;
    claimed.push([start, end]);
    edits.push({ start, end, repl });
  };
  const each = (re: RegExp, fn: (m: RegExpExecArray) => void) => {
    for (const m of input.matchAll(re)) fn(m as RegExpExecArray);
  };
  each(/<(think|thinking|thought)>[\s\S]*?(<\/\1>|$)/gi, (m) => add(m.index, m.index + m[0].length, " "));
  each(/```[\s\S]*?(```|$)/g, (m) => add(m.index, m.index + m[0].length, " "));
  each(/\[([^\]\n]+)\]\((\S+?)\)/g, (m) => {
    add(m.index, m.index + 1, "");
    add(m.index + 1 + m[1]!.length, m.index + m[0].length, "");
  });
  each(/\bhttps?:\/\/\S+|\bwww\.\S+\.\S+/g, (m) => {
    const t = m[0].replace(/[.,;:?)]+$/, "");
    add(m.index, m.index + t.length, o.url ?? "link");
  });
  for (const [k, v] of Object.entries(o.lexicon ?? {})) {
    each(new RegExp(`(?<![\\p{L}\\p{N}])${esc(k)}(?![\\p{L}\\p{N}])`, "gu"), (m) => add(m.index, m.index + m[0].length, v));
  }
  each(/^[ \t]*(#{1,6}|>|[-*+]|\d+[.)])[ \t]+/gm, (m) => add(m.index, m.index + m[0].length, ""));
  each(/[*_~`]+/g, (m) => add(m.index, m.index + m[0].length, ""));
  each(PICTO, (m) => add(m.index, m.index + m[0].length, " "));
  edits.sort((a, b) => a.start - b.start);

  let text = "";
  const map: number[] = [];
  const push = (ch: string, at: number) => {
    if (/\s/.test(ch)) {
      if (!text.length || /\s$/.test(text)) return;
      ch = " ";
    }
    text += ch;
    map.push(at);
  };
  let i = 0;
  for (const e of edits) {
    for (; i < e.start; i++) push(input[i]!, i);
    for (const ch of e.repl) push(ch, e.start);
    i = e.end;
  }
  for (; i < input.length; i++) push(input[i]!, i);
  while (text.endsWith(" ")) {
    text = text.slice(0, -1);
    map.pop();
  }
  map.push(input.length);
  return { text, map: Int32Array.from(map) };
}

export interface Segment {
  index: number;
  /** The input text of this segment. */
  text: string;
  /** Offsets in the input text. */
  start: number;
  end: number;
}

export interface CutterOptions {
  /** The first segment may end at a clause boundary once this long. Default 24. */
  firstClause?: number;
  /** Later segments wait for a sentence end unless longer than this. Default 160. */
  maxChars?: number;
}

const ABBREV = /(?:\b(?:mr|mrs|ms|dr|st|vs|etc|e\.g|i\.e|no|approx))\.$/i;

/**
 * Cuts a growing reply into segments for a voice. The first segment ends
 * at a clause once it is 24 characters long so speech starts early; later
 * segments end at sentences, or at the last clause or space before 160
 * characters. `take(full, final)` returns the segments completed since the
 * last call.
 */
export class SegmentCutter {
  private pos = 0;
  private n = 0;
  private readonly first: number;
  private readonly max: number;
  constructor(o: CutterOptions = {}) {
    this.first = o.firstClause ?? 24;
    this.max = o.maxChars ?? 160;
  }
  reset(): void {
    this.pos = 0;
    this.n = 0;
  }
  take(full: string, final: boolean): Segment[] {
    const out: Segment[] = [];
    for (;;) {
      const cut = this.findCut(full, final);
      if (cut < 0) break;
      const raw = full.slice(this.pos, cut);
      const lead = raw.length - raw.trimStart().length;
      const t = raw.trim();
      if (t) out.push({ index: this.n++, text: t, start: this.pos + lead, end: this.pos + lead + t.length });
      this.pos = cut;
    }
    return out;
  }
  private findCut(full: string, final: boolean): number {
    const rest = full.slice(this.pos);
    if (!rest.trim()) return final && rest.length ? full.length : -1;
    const sentence = /[.?!]+["')\]]*(\s|$)|\n/g;
    let m: RegExpExecArray | null;
    let sent = -1;
    while ((m = sentence.exec(rest))) {
      const endsAt = m.index + m[0].length;
      if (m[1] === "" && !final && endsAt === rest.length) break; // the stream may continue the word
      if (m[0] !== "\n" && ABBREV.test(rest.slice(0, m.index + 1))) continue;
      if (rest.slice(0, m.index).trim().length === 0) continue;
      sent = endsAt;
      break;
    }
    if (this.n === 0) {
      const c = /[,;:]\s/g;
      while ((m = c.exec(rest))) {
        if (sent >= 0 && m.index >= sent) break;
        if (m.index >= this.first - 1) return this.pos + m.index + 1;
      }
    }
    if (sent >= 0) return this.pos + sent;
    if (rest.length > this.max) {
      const head = rest.slice(0, this.max);
      const clause = Math.max(head.lastIndexOf(", "), head.lastIndexOf("; "), head.lastIndexOf(": "));
      const at = clause > 0 ? clause + 1 : head.lastIndexOf(" ");
      return this.pos + (at > 0 ? at : this.max);
    }
    return final ? full.length : -1;
  }
}

/** Word spans in a text: [start, end) character offsets. */
export function wordSpans(text: string): { start: number; end: number }[] {
  return [...text.matchAll(/[\p{L}\p{N}'’]+/gu)].map((m) => ({ start: m.index, end: m.index + m[0].length }));
}

/**
 * Estimated word times for an engine that gives none: each word gets a
 * share of the duration by its character count plus one for the gap.
 * Marked estimated wherever it is reported.
 */
export function estimateWordTimes(text: string, duration: number): { start: number; end: number; t0: number; t1: number }[] {
  const w = wordSpans(text);
  const weight = w.map((x) => x.end - x.start + 1);
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let t = 0;
  return w.map((x, i) => {
    const d = (weight[i]! / total) * duration;
    const r = { ...x, t0: t, t1: t + d };
    t += d;
    return r;
  });
}

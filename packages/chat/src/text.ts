/**
 * Message normalization and reasoning hygiene.
 *
 * normalizeMessages: Gemma templates have no system role and need strict
 * user, assistant alternation that starts with user. The system prompt is
 * merged into the first user turn, same role turns are joined, and leading
 * assistant turns are dropped (satchel normalizeMessages, FERRULE
 * buildMessages).
 *
 * ThinkSplitter: separates think blocks from visible text as the stream
 * arrives, closed or unclosed, and never shows half a tag.
 */

import type { ChatMessage } from "./types.js";

export interface NormalizeOptions {
  /** false: merge system text into the first user turn. Default true. */
  systemRole?: boolean;
  /** Join same role turns and start with a user turn. Default false. */
  strictAlternation?: boolean;
  /** Tool results become user turns prefixed with the tool name when the runtime has no tool role. Default true. */
  toolAsUser?: boolean;
}

export function normalizeMessages(input: readonly ChatMessage[], o: NormalizeOptions = {}): ChatMessage[] {
  const systemRole = o.systemRole ?? true;
  const strict = o.strictAlternation ?? false;
  const toolAsUser = o.toolAsUser ?? true;
  const sys: string[] = [];
  let rest: ChatMessage[] = [];
  for (const m of input) {
    if (m.role === "system") sys.push(m.content);
    else if (m.role === "tool" && toolAsUser) rest.push({ role: "user", content: `[${m.name ?? "tool"} result]\n${m.content}` });
    else rest.push({ ...m });
  }
  const sysText = sys.filter((s) => s.trim()).join("\n\n");
  if (strict || !systemRole) {
    while (rest.length && rest[0]!.role === "assistant") rest.shift();
  }
  if (strict || !systemRole) {
    const joined: ChatMessage[] = [];
    for (const m of rest) {
      const last = joined[joined.length - 1];
      if (last && last.role === m.role) last.content = `${last.content}\n\n${m.content}`;
      else joined.push({ ...m });
    }
    rest = joined;
  }
  if (!systemRole) {
    if (!sysText) return rest;
    if (rest[0]?.role === "user") rest[0] = { role: "user", content: `${sysText}\n\n${rest[0].content}` };
    else rest.unshift({ role: "user", content: sysText });
    return rest;
  }
  return sysText ? [{ role: "system", content: sysText }, ...rest] : rest;
}

const OPEN = /<(think|thinking|thought|reason|reasoning)>/i;
const TAG_NAMES = ["think", "thinking", "thought", "reason", "reasoning"];

/** Control markers small models leak into text (ChatML, Llama 3, Gemma, harmony channels). */
const MARKERS = /<\|im_start\|>(?:assistant|user|system)?\n?|<\|im_end\|>|<\|eot_id\|>|<\|end_of_text\|>|<\|start_header_id\|>\w*<\|end_header_id\|>\n?|<end_of_turn>|<start_of_turn>(?:model|user)?\n?|<\|endoftext\|>|<\|channel\|>\w*(?:<\|message\|>)?|<\|message\|>|<\|end\|>|<\|return\|>|<\/s>/g;

export function stripMarkers(s: string): string {
  return s.replace(MARKERS, "");
}

/** Remove think blocks, closed or unclosed, and control markers from a whole text. */
export function stripThink(s: string): string {
  return splitThink(s).text;
}

export function splitThink(s: string): { text: string; think: string } {
  const sp = new ThinkSplitter();
  const a = sp.push(s);
  const b = sp.end();
  return { text: (a.text + b.text).trim(), think: (a.think + b.think).trim() };
}

/** Longest suffix of `s` that is a prefix of some tag we might still be reading. */
function partialTagTail(s: string, closing: string | null): number {
  const cands = closing ? [`</${closing}>`] : TAG_NAMES.map((n) => `<${n}>`);
  cands.push("<|", "</s");
  const lt = s.lastIndexOf("<");
  if (lt < 0) return 0;
  const tail = s.slice(lt).toLowerCase();
  if (tail.length > 20) return 0;
  return cands.some((c) => c.toLowerCase().startsWith(tail) || (c === "<|" && /^<\|[\w]*\|?$/.test(tail))) ? s.length - lt : 0;
}

export class ThinkSplitter {
  private buf = "";
  private inThink: string | null = null;

  push(chunk: string): { text: string; think: string } {
    this.buf += chunk;
    let text = "";
    let think = "";
    for (;;) {
      if (this.inThink) {
        const close = new RegExp(`</${this.inThink}>`, "i").exec(this.buf);
        if (close) {
          think += this.buf.slice(0, close.index);
          this.buf = this.buf.slice(close.index + close[0].length);
          this.inThink = null;
          continue;
        }
        const keep = partialTagTail(this.buf, this.inThink);
        think += this.buf.slice(0, this.buf.length - keep);
        this.buf = this.buf.slice(this.buf.length - keep);
        break;
      }
      const open = OPEN.exec(this.buf);
      if (open) {
        text += this.buf.slice(0, open.index);
        this.buf = this.buf.slice(open.index + open[0].length);
        this.inThink = open[1]!.toLowerCase();
        continue;
      }
      const keep = partialTagTail(this.buf, null);
      text += this.buf.slice(0, this.buf.length - keep);
      this.buf = this.buf.slice(this.buf.length - keep);
      break;
    }
    return { text: stripMarkers(text), think };
  }

  /** Flush at end of stream. An unclosed think block stays think. */
  end(): { text: string; think: string } {
    const rest = this.buf;
    this.buf = "";
    if (this.inThink) {
      this.inThink = null;
      return { text: "", think: rest };
    }
    return { text: stripMarkers(rest), think: "" };
  }
}

/** Mask an API key for display: first 4 and last 4 characters. */
export function maskKey(key: string): string {
  // below 16 characters, 8 shown characters would give most of the key away
  if (key.length < 16) return "*".repeat(key.length);
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

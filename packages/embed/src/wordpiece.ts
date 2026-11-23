/**
 * BERT style tokenization from a Hugging Face tokenizer.json: the
 * BertNormalizer (clean text, pad CJK ideographs, strip accents,
 * lowercase), the BertPreTokenizer (split on whitespace and punctuation)
 * and WordPiece (greedy longest match with a continuation prefix). A
 * WordLevel model is read too. Unigram and BPE models are refused with a
 * message, since model2vec's English potion models ship WordPiece.
 */

export interface TokenizerJson {
  model?: {
    type?: string;
    vocab?: Record<string, number> | [string, number][];
    unk_token?: string;
    continuing_subword_prefix?: string;
    max_input_chars_per_word?: number;
  };
  normalizer?: NormalizerJson | null;
  added_tokens?: { id: number; content: string; special?: boolean }[];
}

interface NormalizerJson {
  type?: string;
  lowercase?: boolean;
  strip_accents?: boolean | null;
  clean_text?: boolean;
  handle_chinese_chars?: boolean;
  normalizers?: NormalizerJson[];
}

export interface Tokenizer {
  readonly vocabSize: number;
  readonly unkId: number | null;
  /** Token ids for a text, with no special tokens added. */
  encode(text: string): number[];
  /** Token strings, for tests and traces. */
  tokens(text: string): string[];
}

interface NormFlags {
  lowercase: boolean;
  stripAccents: boolean;
  cleanText: boolean;
  chinese: boolean;
}

function normFlags(n: NormalizerJson | null | undefined): NormFlags {
  const out: NormFlags = { lowercase: false, stripAccents: false, cleanText: false, chinese: false };
  const visit = (x: NormalizerJson | null | undefined): void => {
    if (!x) return;
    if (x.type === "Sequence") return x.normalizers?.forEach(visit);
    if (x.type === "BertNormalizer") {
      out.lowercase ||= x.lowercase !== false;
      // tokenizers: strip_accents null follows lowercase
      out.stripAccents ||= x.strip_accents === null || x.strip_accents === undefined ? x.lowercase !== false : x.strip_accents;
      out.cleanText ||= x.clean_text !== false;
      out.chinese ||= x.handle_chinese_chars !== false;
    } else if (x.type === "Lowercase") out.lowercase = true;
    else if (x.type === "StripAccents") out.stripAccents = true;
  };
  visit(n);
  return out;
}

function isCjk(cp: number): boolean {
  return (
    (cp >= 0x4e00 && cp <= 0x9fff) ||
    (cp >= 0x3400 && cp <= 0x4dbf) ||
    (cp >= 0x20000 && cp <= 0x2a6df) ||
    (cp >= 0x2a700 && cp <= 0x2b73f) ||
    (cp >= 0x2b740 && cp <= 0x2b81f) ||
    (cp >= 0x2b820 && cp <= 0x2ceaf) ||
    (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0x2f800 && cp <= 0x2fa1f)
  );
}

function isPunct(ch: string): boolean {
  const cp = ch.codePointAt(0)!;
  if ((cp >= 33 && cp <= 47) || (cp >= 58 && cp <= 64) || (cp >= 91 && cp <= 96) || (cp >= 123 && cp <= 126)) return true;
  return /\p{P}/u.test(ch);
}

/** The BertNormalizer steps in their library order. */
export function normalize(text: string, f: NormFlags): string {
  let s = text;
  if (f.cleanText) {
    let o = "";
    for (const ch of s) {
      const cp = ch.codePointAt(0)!;
      if (cp === 0 || cp === 0xfffd) continue;
      if (ch === "\t" || ch === "\n" || ch === "\r") {
        o += " ";
        continue;
      }
      if (/\p{Cc}|\p{Cf}/u.test(ch)) continue;
      o += /\s/u.test(ch) ? " " : ch;
    }
    s = o;
  }
  if (f.chinese) {
    let o = "";
    for (const ch of s) o += isCjk(ch.codePointAt(0)!) ? ` ${ch} ` : ch;
    s = o;
  }
  if (f.stripAccents) s = s.normalize("NFD").replace(/\p{Mn}/gu, "");
  if (f.lowercase) s = s.toLowerCase();
  return s;
}

/** Whitespace split, then each punctuation character on its own. */
export function preTokenize(s: string): string[] {
  const out: string[] = [];
  for (const w of s.split(/\s+/u)) {
    if (!w) continue;
    let cur = "";
    for (const ch of w) {
      if (isPunct(ch)) {
        if (cur) out.push(cur);
        out.push(ch);
        cur = "";
      } else cur += ch;
    }
    if (cur) out.push(cur);
  }
  return out;
}

function vocabMap(v: TokenizerJson["model"]): Map<string, number> {
  const raw = v?.vocab;
  if (!raw) throw new Error("tokenizer.json has no model.vocab");
  return new Map(Array.isArray(raw) ? raw : Object.entries(raw));
}

/** Read a tokenizer.json (text or parsed) or a vocab.txt (one token per line, BERT uncased flags). */
export function loadTokenizer(src: string | TokenizerJson): Tokenizer {
  let j: TokenizerJson;
  if (typeof src === "string") {
    const t = src.trimStart();
    if (t.startsWith("{")) j = JSON.parse(src) as TokenizerJson;
    else {
      const vocab: Record<string, number> = {};
      src.split(/\r?\n/).forEach((tok, i) => {
        if (tok) vocab[tok] = i;
      });
      j = { model: { type: "WordPiece", vocab, unk_token: "[UNK]" }, normalizer: { type: "BertNormalizer", lowercase: true } };
    }
  } else j = src;
  const type = j.model?.type ?? "WordPiece";
  if (type !== "WordPiece" && type !== "WordLevel") throw new Error(`tokenizer model ${type} is not supported; WordPiece and WordLevel are`);
  const vocab = vocabMap(j.model);
  for (const a of j.added_tokens ?? []) if (!vocab.has(a.content)) vocab.set(a.content, a.id);
  const unk = j.model?.unk_token ?? "[UNK]";
  const unkId = vocab.get(unk) ?? null;
  const prefix = j.model?.continuing_subword_prefix ?? "##";
  const maxChars = j.model?.max_input_chars_per_word ?? 100;
  const flags = normFlags(j.normalizer ?? (type === "WordPiece" ? { type: "BertNormalizer" } : null));

  const piece = (word: string): string[] => {
    if (type === "WordLevel") return [vocab.has(word) ? word : unk];
    const chars = [...word];
    if (chars.length > maxChars) return [unk];
    const out: string[] = [];
    let start = 0;
    while (start < chars.length) {
      let end = chars.length;
      let hit: string | null = null;
      while (start < end) {
        let sub = chars.slice(start, end).join("");
        if (start > 0) sub = prefix + sub;
        if (vocab.has(sub)) {
          hit = sub;
          break;
        }
        end--;
      }
      if (hit === null) return [unk];
      out.push(hit);
      start = end;
    }
    return out;
  };

  const tokens = (text: string): string[] => preTokenize(normalize(text, flags)).flatMap(piece);
  return {
    vocabSize: vocab.size,
    unkId,
    tokens,
    encode: (text) => tokens(text).map((t) => vocab.get(t) ?? unkId ?? -1).filter((id) => id >= 0),
  };
}

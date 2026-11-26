/**
 * Sentence inference for hybrid mode: a sentence the model left untagged
 * may still get a mood or a gesture. Keywords first (whole words, light
 * stemming), after removing weak phrases that carry no feeling ("i think",
 * "no worries", "you're welcome"). Otherwise, with an embedder, the best
 * label must reach a floor of 0.32 and beat the runner up by 0.07.
 * Postures never come from speech, only from explicit tags.
 */

import type { Embedder } from "@hackbuild/memory";
import { cosine, stem, words } from "./resolve.js";
import type { ActKind, ActVocabulary } from "./vocab.js";
import { EMOTION_WORDS, GESTURE_WORDS, type WordTable } from "./words.js";

/** A mood or gesture inferred from an untagged sentence, with its score and the step that found it. */
export interface Inferred {
  kind: Exclude<ActKind, "posture">;
  name: string;
  score: number;
  via: "keyword" | "embed";
}

const HAND_KEYWORDS: WordTable = {
  happy: ["glad", "great", "awesome", "wonderful", "haha", "love", "fantastic", "yay", "happy", "nice"],
  sad: ["sorry", "sad", "unfortunately", "miss", "lost", "terrible"],
  angry: ["hate", "furious", "annoying", "angry", "unfair"],
  surprised: ["wow", "whoa", "really", "incredible", "unbelievable", "surprise"],
  relaxed: ["relax", "calm", "peaceful", "easy"],
  wave: ["hello", "hi", "hey", "bye", "goodbye", "welcome"],
  nod: ["yes", "yeah", "exactly", "agreed", "sure", "right"],
  shake: ["no", "nope", "never"],
  shrug: ["maybe", "perhaps", "dunno", "whatever"],
  think: ["hmm", "wonder", "consider", "think"],
};

/** Keywords per common name: the hand table plus the mood and gesture word tables. Only names the vocabulary has are used. */
export const DEFAULT_KEYWORDS: Readonly<Record<string, readonly string[]>> = (() => {
  const out: Record<string, string[]> = {};
  for (const t of [HAND_KEYWORDS, EMOTION_WORDS, GESTURE_WORDS]) for (const [k, ws] of Object.entries(t)) out[k] = [...new Set([...(out[k] ?? []), ...ws])];
  return out;
})();

/**
 * Single words too common to carry a feeling or a gesture on their own
 * ("right", "sure", "love", "show"): skipped by the keyword step. 27
 * words (computed) from earlier builds, plus "please", which the light
 * stemmer here folds onto "pleased".
 */
export const WEAK_WORDS: readonly string[] = ["right", "look", "there", "show", "sure", "okay", "ok", "yes", "no", "think", "welcome", "love", "maybe", "win", "down", "soft", "warm", "fun", "rest", "plain", "normal", "default", "heart", "blue", "over", "this", "that", "please"];

/** Phrases removed before keyword matching: they read as feeling words but are filler. */
export const WEAK_PHRASES: readonly string[] = [
  "i think",
  "i guess",
  "no worries",
  "no problem",
  "you're welcome",
  "you are welcome",
  "not bad",
  "right now",
  "all right",
  "pretty sure",
  "i'm sure",
  "to be sure",
  "really quick",
];

/** Options for `createInferrer`: keyword tables, weak phrases and words, and the embedding floor and margin. */
export interface InferrerOptions {
  keywords?: Record<string, readonly string[]>;
  weak?: readonly string[];
  /** Single words skipped by the keyword step. Default `WEAK_WORDS`. */
  weakWords?: readonly string[];
  embedder?: Embedder;
  /** Embedding floor. Default 0.32. */
  floor?: number;
  /** Margin over the runner up. Default 0.07. */
  margin?: number;
}

/** Infers a mood or gesture from a sentence, by keywords and then by embedding. */
export interface Inferrer {
  /** Keyword step only. */
  keyword(sentence: string): Inferred | null;
  /** Keyword step, then the embedding step. */
  infer(sentence: string): Promise<Inferred | null>;
}

/** Make an inferrer over a vocabulary's moods and gestures; postures are never inferred. */
export function createInferrer(v: ActVocabulary, o: InferrerOptions = {}): Inferrer {
  const table = { ...DEFAULT_KEYWORDS, ...(o.keywords ?? {}) };
  const weak = (o.weak ?? WEAK_PHRASES).map((p) => p.toLowerCase());
  const weakWords = new Set((o.weakWords ?? WEAK_WORDS).map(stem));
  const floor = o.floor ?? 0.32;
  const margin = o.margin ?? 0.07;
  const labels: { kind: Inferred["kind"]; name: string; text: string; keys: Set<string> }[] = [];
  for (const [kind, list] of [
    ["mood", v.moods],
    ["gesture", v.gestures],
  ] as const) {
    for (const name of list) {
      const kw = table[name.toLowerCase()] ?? [];
      labels.push({ kind, name, text: [name, ...kw].join(", "), keys: new Set(kw.map(stem).filter((k) => !weakWords.has(k))) });
    }
  }
  let vecs: Promise<Float32Array[]> | null = null;

  const keyword = (sentence: string): Inferred | null => {
    let s = ` ${sentence.toLowerCase().replace(/[‘’]/g, "'")} `;
    for (const p of weak) s = s.split(` ${p} `).join(" ").split(` ${p},`).join(" ").split(` ${p}.`).join(" ");
    const ws = words(s).map(stem);
    let best: Inferred | null = null;
    let bestN = 0;
    for (const l of labels) {
      const n = ws.filter((w) => l.keys.has(w)).length;
      if (n > bestN) {
        bestN = n;
        best = { kind: l.kind, name: l.name, score: n, via: "keyword" };
      }
    }
    return best;
  };

  return {
    keyword,
    async infer(sentence) {
      const k = keyword(sentence);
      if (k || !o.embedder || !labels.length || !sentence.trim()) return k;
      vecs ??= o.embedder.embed(labels.map((l) => l.text));
      const [lv, [q]] = await Promise.all([vecs, o.embedder.embed([sentence])]);
      const scored = labels.map((l, i) => ({ l, s: cosine(q!, lv[i]!) })).sort((a, b) => b.s - a.s);
      const a = scored[0]!;
      const b = scored[1];
      if (a.s < floor || (b && a.s - b.s < margin)) return null;
      return { kind: a.l.kind, name: a.l.name, score: a.s, via: "embed" };
    },
  };
}

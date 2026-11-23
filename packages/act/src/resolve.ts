/**
 * Resolve a name a model wrote to a name the avatar can realize: exact
 * name, then alias, then whole word overlap with light stemming, then (when
 * an embedder is given) the nearest name above a cosine floor of 0.55.
 *
 * Whole words only. Substring matching turned "across" into a cross gesture
 * and "I won't lie" into lying down in the builds this grammar comes from,
 * so a word must equal a name word after stemming. A request for a kind of
 * move the avatar has no realization for resolves to nothing: a nod must
 * not become any clip that shares a letter run with it.
 *
 * A requested kind is honoured; a name of another kind crosses over only on
 * an exact name or alias hit (a gesture tag naming an emotion moves the face
 * only when the word is a known mood word).
 */

import type { Embedder } from "@hackbuild/memory";
import { kindOf, namesOf, type ActKind, type ActVocabulary, KINDS } from "./vocab.js";

export interface Resolved {
  kind: ActKind;
  name: string;
  /** How it resolved. */
  via: "exact" | "alias" | "words" | "embed";
}

/** Light stemmer: lowercase and strip ing, ed, es, s (and a doubled final consonant after ing or ed). */
export function stem(w: string): string {
  let s = w.toLowerCase();
  for (const suf of ["ing", "ed", "es", "s"]) {
    if (s.length > suf.length + 2 && s.endsWith(suf)) {
      s = s.slice(0, -suf.length);
      if ((suf === "ing" || suf === "ed") && s.length > 2 && s[s.length - 1] === s[s.length - 2]) s = s.slice(0, -1);
      break;
    }
  }
  // wave, waves, waved and waving all end as "wav"
  if (s.length > 3 && s.endsWith("e")) s = s.slice(0, -1);
  return s;
}

export function words(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? []).map((w) => w.replace(/'/g, ""));
}

const STOP = new Set(["a", "an", "the", "and", "to", "at", "of", "with", "her", "his", "my", "your", "their", "own", "very", "softly", "slowly", "little", "bit"]);

function stems(s: string): string[] {
  return words(s)
    .filter((w) => !STOP.has(w))
    .map(stem);
}

export interface ResolverOptions {
  embedder?: Embedder;
  /** Cosine floor for the embedding step. Default 0.55. */
  floor?: number;
}

export interface Resolver {
  /** Lexical steps only; synchronous. */
  resolve(name: string, kind?: ActKind | null): Resolved | null;
  /** Lexical steps, then the embedding step when an embedder was given. */
  resolveAsync(name: string, kind?: ActKind | null): Promise<Resolved | null>;
}

export function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

export function createResolver(v: ActVocabulary, o: ResolverOptions = {}): Resolver {
  const floor = o.floor ?? 0.55;
  const all: { kind: ActKind; name: string; stems: string[] }[] = KINDS.flatMap((k) => namesOf(v, k).map((name) => ({ kind: k, name, stems: stems(name) })));
  const aliasStems = Object.entries(v.aliases).map(([w, t]) => ({ stems: stems(w), target: t }));
  let vecs: Promise<Float32Array[]> | null = null;

  const exactOrAlias = (n: string): Resolved | null => {
    const k = kindOf(v, n);
    if (k) return { kind: k, name: all.find((x) => x.name.toLowerCase() === n)!.name, via: "exact" };
    // own keys only: "constructor" or "__proto__" from a model is a word, not a lookup
    const t = Object.hasOwn(v.aliases, n) ? v.aliases[n] : undefined;
    if (typeof t === "string") {
      const tk = kindOf(v, t);
      if (tk) return { kind: tk, name: t, via: "alias" };
    }
    return null;
  };

  const resolve = (raw: string, kind: ActKind | null = null): Resolved | null => {
    const n = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!n) return null;
    const ea = exactOrAlias(n);
    if (ea) return ea;
    const ws = stems(n);
    if (!ws.length) return null;
    const wset = new Set(ws);
    let best: { kind: ActKind; name: string; n: number } | null = null;
    const consider = (k: ActKind, name: string, ss: string[]) => {
      if (kind && k !== kind) return;
      const hit = ss.filter((s) => wset.has(s)).length;
      // every word of the name must appear, so "sit" never matches "sit up straight" as "stand"
      if (hit === 0 || hit < ss.length) return;
      if (!best || hit > best.n) best = { kind: k, name, n: hit };
    };
    for (const x of all) consider(x.kind, x.name, x.stems);
    for (const a of aliasStems) {
      const k = kindOf(v, a.target);
      if (k) consider(k, a.target, a.stems);
    }
    const b = best as { kind: ActKind; name: string; n: number } | null;
    return b ? { kind: b.kind, name: b.name, via: "words" } : null;
  };

  return {
    resolve,
    async resolveAsync(raw, kind = null) {
      const lex = resolve(raw, kind);
      if (lex || !o.embedder || !raw.trim() || !all.length) return lex;
      vecs ??= o.embedder.embed(all.map((x) => x.name));
      const [labels, [q]] = await Promise.all([vecs, o.embedder.embed([raw.trim()])]);
      let bi = -1;
      let bs = floor;
      all.forEach((x, i) => {
        if (kind && x.kind !== kind) return;
        const s = cosine(q!, labels[i]!);
        if (s >= bs) {
          bs = s;
          bi = i;
        }
      });
      return bi >= 0 ? { kind: all[bi]!.kind, name: all[bi]!.name, via: "embed" } : null;
    },
  };
}

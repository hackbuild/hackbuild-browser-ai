// The embedder contract and a zero download fallback.

/**
 * Anything that turns texts into vectors of one size: a transformers.js
 * MiniLM (Xenova/all-MiniLM-L6-v2, weights Apache-2.0), bge-small
 * (BAAI/bge-small-en-v1.5, weights MIT), a static model2vec table, or the
 * hashed embedder below. `id` names the model and settings; vectors are
 * cached under it, so a different id re-embeds every item.
 */
export interface Embedder {
  readonly id: string;
  readonly dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

/** FNV-1a 32 bit over the UTF-16 code units of s. */
export function fnv1a(s: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const words = (t: string): string[] => t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

/**
 * Hashed unigram plus bigram embedder: FNV-1a picks a bucket and a sign,
 * the vector is L2 normalized. No weights, no download, no licence. It
 * finds shared words and word pairs; it does not find paraphrase.
 */
export function hashedEmbedder(dim = 384): Embedder {
  const one = (text: string): Float32Array => {
    const v = new Float32Array(dim);
    const w = words(text);
    const grams = [...w, ...w.slice(1).map((x, i) => `${w[i]} ${x}`)];
    for (const g of grams) {
      const h = fnv1a(g);
      const sign = fnv1a(g, 0x9747b28c) & 1 ? 1 : -1;
      v[h % dim]! += sign;
    }
    let n = 0;
    for (let i = 0; i < dim; i++) n += v[i]! * v[i]!;
    n = Math.sqrt(n);
    if (n > 0) for (let i = 0; i < dim; i++) v[i]! /= n;
    return v;
  };
  return { id: `hash-ngram-${dim}-v1`, dim, embed: async (texts) => texts.map(one) };
}

/** Fingerprint of a corpus under an embedder: FNV-1a over every text and the embedder id. */
export function fingerprint(texts: string[], embedderId: string): string {
  let h = fnv1a(embedderId);
  for (const t of texts) h = fnv1a(t, h ^ 0x5bd1e995);
  return `${texts.length}:${h.toString(16)}:${embedderId}`;
}

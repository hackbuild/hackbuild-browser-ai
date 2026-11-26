/** Brute force cosine search: enough for hundreds to a few thousand items (inferred, not measured). */

/** The cosine similarity of two vectors, 0 when either is all zeros. */
export function cosine(a: Float32Array, b: Float32Array): number {
  let d = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    d += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  return na > 0 && nb > 0 ? d / Math.sqrt(na * nb) : 0;
}

/** An in memory list of items and their vectors, searched by cosine for the top k. */
export class VectorIndex<T> {
  private items: { item: T; vec: Float32Array }[] = [];
  get size(): number {
    return this.items.length;
  }
  add(item: T, vec: Float32Array): void {
    this.items.push({ item, vec });
  }
  remove(pred: (item: T) => boolean): number {
    const n = this.items.length;
    this.items = this.items.filter((x) => !pred(x.item));
    return n - this.items.length;
  }
  /** Top k by cosine at or above minScore, best first; ties keep insertion order. */
  search(q: Float32Array, k = 5, minScore = -1): { item: T; score: number }[] {
    return this.items
      .map((x, i) => ({ item: x.item, score: cosine(q, x.vec), i }))
      .filter((x) => x.score >= minScore)
      .sort((a, b) => b.score - a.score || a.i - b.i)
      .slice(0, k)
      .map(({ item, score }) => ({ item, score }));
  }
}

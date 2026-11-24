/**
 * Prompted segmentation with one image embedding per image. The encoder
 * runs once per image; every later point or box prompt on that image
 * decodes from the cached embedding (as the earlier mask studio did, one
 * embedding per image, then hover and click decode from it).
 */

import type { ImageInput, Mask, SegmentOptions, SegmentPrompt, Segmenter } from "./types.js";

/**
 * Least recently used embeddings by image. A key is a string the caller
 * picks (an image hash) or the image object itself. Encodes in flight are
 * shared, so a hover and a click on a fresh image encode once.
 */
export class EmbeddingCache<E = unknown> {
  private readonly m = new Map<unknown, Promise<E>>();
  hits = 0;
  misses = 0;
  constructor(readonly max = 4) {}
  has(key: unknown): boolean {
    return this.m.has(key);
  }
  /** The cached embedding, or undefined; counts nothing. */
  peek(key: unknown): Promise<E> | undefined {
    return this.m.get(key);
  }
  set(key: unknown, v: E | Promise<E>): void {
    this.m.delete(key);
    this.m.set(key, Promise.resolve(v));
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value);
  }
  /** The embedding for `key`, encoding it with `make` on a miss. A failed encode is not kept. */
  getOr(key: unknown, make: () => Promise<E>): Promise<E> {
    const v = this.m.get(key);
    if (v) {
      this.hits++;
      this.m.delete(key);
      this.m.set(key, v);
      return v;
    }
    this.misses++;
    const p = make();
    this.set(key, p);
    p.catch(() => {
      if (this.m.get(key) === p) this.m.delete(key);
    });
    return p;
  }
  delete(key: unknown): boolean {
    return this.m.delete(key);
  }
  clear(): void {
    this.m.clear();
  }
  get size(): number {
    return this.m.size;
  }
}

export interface PromptSegmenterOptions<E> {
  /** The image encoder: runs once per image. */
  encode(image: ImageInput): Promise<E>;
  /** The prompt decoder: runs per prompt against the cached embedding. */
  decode(embedding: E, prompt: SegmentPrompt, image: ImageInput): Promise<Mask[]>;
  /** Shared cache; a fresh one holding 4 images when omitted. */
  cache?: EmbeddingCache<E>;
  dispose?(): unknown;
}

/** True when the prompt has a point or a box. */
export function hasPrompt(p?: SegmentPrompt): boolean {
  return !!(p && (p.points?.length || p.box));
}

/** A segmenter from an encoder and a decoder, with the embedding cache on `cache`. Masks come best first, scores clamped to 0 to 1. */
export function promptSegmenter<E>(o: PromptSegmenterOptions<E>): Segmenter & { cache: EmbeddingCache<E> } {
  const own = o.cache ?? new EmbeddingCache<E>();
  const seg: Segmenter & { cache: EmbeddingCache<E> } = {
    cache: own,
    async segment(image, prompt = {}, so: SegmentOptions = {}) {
      if (!hasPrompt(prompt)) throw new Error("a prompt needs at least one point or a box");
      const cache = (so.cache as EmbeddingCache<E> | undefined) ?? own;
      const emb = await cache.getOr(so.key ?? image, () => o.encode(image));
      const masks = await o.decode(emb, prompt, image);
      for (const m of masks) if (m.score !== undefined) m.score = Math.min(1, Math.max(0, m.score));
      return masks.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    },
  };
  if (o.dispose) seg.dispose = () => o.dispose!();
  return seg;
}

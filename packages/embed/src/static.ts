/**
 * A model2vec style static embedder in plain TypeScript: tokenize with no
 * special tokens, drop unknown tokens, average the token rows (weighted
 * when the file carries per token weights), L2 normalize. No ML runtime;
 * runs in a worker or Node. The reference model is minishlab/potion-base-8M
 * (weights MIT). Static vectors find shared words and near synonyms; they
 * miss paraphrase, which is a limit of the model.
 */

import type { Embedder } from "@hackbuild/memory";
import { readSafetensors } from "./safetensors.js";
import { loadTokenizer, type Tokenizer, type TokenizerJson } from "./wordpiece.js";

/** The files a static embedder is built from: tokenizer, weights and an optional config. */
export interface StaticFiles {
  /** tokenizer.json text or parsed object, or a vocab.txt. */
  tokenizer: string | TokenizerJson;
  /** model.safetensors bytes. */
  weights: ArrayBuffer | Uint8Array;
  /** config.json text or object; `normalize` is read from it. */
  config?: string | { normalize?: boolean };
  /** A short model name for the id, e.g. "potion-base-8M". */
  name?: string;
  /** Tokens per text before truncation. Default 512 (model2vec default). */
  maxTokens?: number;
}

/** An Embedder that also embeds one text synchronously and exposes its tokenizer. */
export interface StaticEmbedder extends Embedder {
  readonly tokenizer: Tokenizer;
  /** One text, synchronously. */
  embedOne(text: string): Float32Array;
}

/** FNV-1a 32 bit over bytes. */
export function fnv1aBytes(b: Uint8Array, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < b.length; i++) {
    h ^= b[i]!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/**
 * Build the embedder. The id is `model2vec:<name>:<dim>:<weights hash>:<vocab hash>:<n|u>`,
 * computed from the bytes, so two loads of the same files give the same id
 * and any change to weights, vocabulary or normalization gives another.
 */
export function staticEmbedder(f: StaticFiles): StaticEmbedder {
  const tok = loadTokenizer(f.tokenizer);
  const bytes = f.weights instanceof Uint8Array ? f.weights : new Uint8Array(f.weights);
  const st = readSafetensors(bytes);
  const embName = st.names.includes("embeddings") ? "embeddings" : st.names.find((n) => st.get(n)!.shape.length === 2);
  const emb = embName ? st.get(embName) : null;
  if (!emb || emb.shape.length !== 2 || !(emb.data instanceof Float32Array)) throw new Error("model2vec: no 2d float embeddings tensor in the safetensors file");
  const [rows, dim] = emb.shape as [number, number];
  const table = emb.data;
  const w = st.get("weights");
  const tokWeights = w && w.data instanceof Float32Array ? w.data : null;
  const m = st.get("mapping");
  const mapping = m ? Int32Array.from(m.data) : null;
  const cfg = typeof f.config === "string" ? (JSON.parse(f.config) as { normalize?: boolean }) : f.config;
  const norm = cfg?.normalize !== false;
  const maxTokens = f.maxTokens ?? 512;

  const vocabText = typeof f.tokenizer === "string" ? f.tokenizer : JSON.stringify(f.tokenizer);
  const vh = fnv1aBytes(new TextEncoder().encode(vocabText));
  const wh = fnv1aBytes(bytes);
  const id = `model2vec:${f.name ?? "static"}:${dim}:${wh.toString(16)}:${vh.toString(16)}:${norm ? "n" : "u"}`;

  const embedOne = (text: string): Float32Array => {
    const v = new Float32Array(dim);
    const ids = tok.encode(text).filter((t) => t !== tok.unkId).slice(0, maxTokens);
    let total = 0;
    for (const t of ids) {
      const row = mapping ? mapping[t] ?? -1 : t;
      if (row < 0 || row >= rows) continue;
      const wt = tokWeights ? (tokWeights[t] ?? 1) : 1;
      const off = row * dim;
      for (let i = 0; i < dim; i++) v[i]! += table[off + i]! * wt;
      total++;
    }
    if (total === 0) return v;
    for (let i = 0; i < dim; i++) v[i]! /= total;
    if (norm) {
      let n = 0;
      for (let i = 0; i < dim; i++) n += v[i]! * v[i]!;
      n = Math.sqrt(n);
      if (n > 0) for (let i = 0; i < dim; i++) v[i]! /= n;
    }
    return v;
  };

  return { id, dim, tokenizer: tok, embedOne, embed: async (texts) => texts.map(embedOne) };
}

/** Fetch the three files of a model2vec repo from a base URL (caller supplied) and build the embedder. */
export async function loadStaticEmbedder(
  base: string,
  o: { name?: string; fetch?: typeof fetch; /** SHA-256 per file URL when known; a mismatch throws. */ sha256For?: (url: string) => string | undefined } = {},
): Promise<StaticEmbedder> {
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  const get = async (p: string): Promise<ArrayBuffer> => {
    const url = new URL(p, base.endsWith("/") ? base : `${base}/`).href;
    const r = await f(url);
    if (!r.ok) throw new Error(`model2vec: http ${r.status} for ${p}`);
    const b = await r.arrayBuffer();
    const want = o.sha256For?.(url);
    if (want) {
      const d = new Uint8Array(await crypto.subtle.digest("SHA-256", b));
      const got = Array.from(d, (x) => x.toString(16).padStart(2, "0")).join("");
      if (got !== want) throw new Error(`model2vec: sha256 of ${p} is ${got}, expected ${want}`);
    }
    return b;
  };
  const [t, w, c] = await Promise.all([get("tokenizer.json"), get("model.safetensors"), get("config.json").catch(() => null)]);
  const dec = new TextDecoder();
  const files: StaticFiles = { tokenizer: dec.decode(t), weights: w };
  if (c) files.config = dec.decode(c);
  if (o.name) files.name = o.name;
  return staticEmbedder(files);
}

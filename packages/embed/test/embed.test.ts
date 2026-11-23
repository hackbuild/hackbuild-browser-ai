import { describe, expect, test } from "vitest";
import { createHub } from "@hackbuild/models";
import {
  EMBED_RECORDS,
  VectorIndex,
  attachEmbed,
  halfToFloat,
  loadTokenizer,
  miniLM,
  readSafetensors,
  staticEmbedder,
  tjsEmbedder,
  type FeaturePipeline,
} from "@hackbuild/embed";

const VOCAB = ["[PAD]", "[UNK]", "[CLS]", "[SEP]", "the", "dog", "cat", "run", "##ning", "##s", "?", ",", "cafe", "un", "##aff", "##able", "日"];
const tokJson = {
  model: { type: "WordPiece", vocab: Object.fromEntries(VOCAB.map((t, i) => [t, i])), unk_token: "[UNK]", continuing_subword_prefix: "##" },
  normalizer: { type: "BertNormalizer", lowercase: true, strip_accents: null, clean_text: true, handle_chinese_chars: true },
};

/** A safetensors file with the given tensors (F32, F16 or I64), written here so no weights are fetched. */
function safetensors(tensors: Record<string, { dtype: "F32" | "F16" | "I64"; shape: number[]; values: number[] }>): Uint8Array {
  const size = { F32: 4, F16: 2, I64: 8 };
  let off = 0;
  const header: Record<string, unknown> = { __metadata__: { format: "pt" } };
  for (const [k, t] of Object.entries(tensors)) {
    const n = t.values.length * size[t.dtype];
    header[k] = { dtype: t.dtype, shape: t.shape, data_offsets: [off, off + n] };
    off += n;
  }
  const h = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(8 + h.length + off);
  const dv = new DataView(out.buffer);
  dv.setBigUint64(0, BigInt(h.length), true);
  out.set(h, 8);
  let p = 8 + h.length;
  for (const t of Object.values(tensors)) {
    for (const v of t.values) {
      if (t.dtype === "F32") dv.setFloat32(p, v, true);
      else if (t.dtype === "I64") dv.setBigInt64(p, BigInt(v), true);
      else dv.setUint16(p, v, true);
      p += size[t.dtype];
    }
  }
  return out;
}

const DIM = 4;
const rows = VOCAB.map((_, i) => [i, i % 3, 1, -i / 2]);
const weights = () => safetensors({ embeddings: { dtype: "F32", shape: [VOCAB.length, DIM], values: rows.flat() } });

describe("wordpiece", () => {
  const tok = loadTokenizer(JSON.stringify(tokJson));
  test("lowercase, punctuation split and continuation pieces", () => {
    expect(tok.tokens("The dogs, running?")).toEqual(["the", "dog", "##s", ",", "run", "##ning", "?"]);
  });
  test("accents stripped and a word with no full cover becomes unk", () => {
    expect(tok.tokens("Café unaffable zebra")).toEqual(["cafe", "un", "##aff", "##able", "[UNK]"]);
  });
  test("cjk ideographs are split out and control characters dropped", () => {
    expect(tok.tokens("dog日cat\u0007")).toEqual(["dog", "日", "cat"]);
    expect(tok.tokens("dogx")).toEqual(["[UNK]"]);
  });
  test("vocab.txt input and refusal of unigram models", () => {
    const t = loadTokenizer(VOCAB.join("\n"));
    expect(t.encode("The cat")).toEqual([4, 6]);
    expect(() => loadTokenizer({ model: { type: "Unigram", vocab: [] } })).toThrow(/Unigram/);
  });
});

describe("safetensors", () => {
  test("f32, f16 and i64 tensors", () => {
    const st = readSafetensors(
      safetensors({
        a: { dtype: "F32", shape: [2], values: [1.5, -2] },
        b: { dtype: "F16", shape: [3], values: [0x3c00, 0xc000, 0x0001] },
        c: { dtype: "I64", shape: [2], values: [7, -1] },
      }),
    );
    expect(st.names).toEqual(["a", "b", "c"]);
    expect([...st.get("a")!.data]).toEqual([1.5, -2]);
    expect([...st.get("b")!.data]).toEqual([1, -2, 2 ** -24]);
    expect([...st.get("c")!.data]).toEqual([7, -1]);
    expect(st.get("zzz")).toBeNull();
  });
  test("half to float edge values", () => {
    expect(halfToFloat(0x7c00)).toBe(Infinity);
    expect(Number.isNaN(halfToFloat(0x7e00))).toBe(true);
    expect(halfToFloat(0x3555)).toBeCloseTo(0.33325, 5);
  });
});

describe("static embedder", () => {
  test("mean of token rows without unk, then l2 normalized", () => {
    const e = staticEmbedder({ tokenizer: tokJson, weights: weights(), name: "fixture" });
    expect(e.dim).toBe(DIM);
    const v = e.embedOne("dog cat zebra");
    const raw = [0, 1, 2, 3].map((i) => (rows[5]![i]! + rows[6]![i]!) / 2);
    const n = Math.hypot(...raw);
    raw.forEach((x, i) => expect(v[i]).toBeCloseTo(x / n, 6));
    expect([...e.embedOne("zebra")]).toEqual([0, 0, 0, 0]);
  });
  test("config normalize false keeps the mean", () => {
    const e = staticEmbedder({ tokenizer: tokJson, weights: weights(), config: '{"normalize": false}' });
    expect([...e.embedOne("the")]).toEqual(rows[4]);
  });
  test("token weights and a row mapping are applied", () => {
    const n = VOCAB.length;
    const w = safetensors({
      embeddings: { dtype: "F32", shape: [2, DIM], values: [1, 0, 0, 0, 0, 1, 0, 0] },
      weights: { dtype: "F32", shape: [n], values: VOCAB.map((_, i) => (i === 5 ? 3 : 1)) },
      mapping: { dtype: "I64", shape: [n], values: VOCAB.map((_, i) => (i === 5 ? 1 : 0)) },
    });
    const e = staticEmbedder({ tokenizer: tokJson, weights: w, config: { normalize: false } });
    expect([...e.embedOne("dog the")]).toEqual([0.5, 1.5, 0, 0]);
  });
  test("the id is stable for the same bytes and changes with the weights", async () => {
    const a = staticEmbedder({ tokenizer: tokJson, weights: weights(), name: "x" });
    const b = staticEmbedder({ tokenizer: tokJson, weights: weights(), name: "x" });
    const w2 = weights();
    w2[w2.length - 1]! ^= 1;
    const c = staticEmbedder({ tokenizer: tokJson, weights: w2, name: "x" });
    expect(a.id).toBe(b.id);
    expect(a.id).not.toBe(c.id);
    expect(a.id).toMatch(/^model2vec:x:4:[0-9a-f]+:[0-9a-f]+:n$/);
    expect(await a.embed(["dog", "cat"])).toHaveLength(2);
  });
});

describe("transformers.js adapter", () => {
  const fakePipe = (dim: number): FeaturePipeline & { calls: number[] } => {
    const calls: number[] = [];
    const f = async (texts: string[]) => {
      calls.push(texts.length);
      const data = new Float32Array(texts.length * dim);
      texts.forEach((t, i) => data.fill(t.length, i * dim, (i + 1) * dim));
      return { data, dims: [texts.length, dim] };
    };
    return Object.assign(f, { calls });
  };
  test("batches, splits rows and names every setting in the id", async () => {
    const p = fakePipe(3);
    const e = await tjsEmbedder(p, { modelId: "m", dtype: "q8", device: "wasm", batch: 2, dim: 3 });
    const v = await e.embed(["a", "bb", "ccc"]);
    expect(p.calls).toEqual([2, 1]);
    expect([...v[2]!]).toEqual([3, 3, 3]);
    expect(e.id).toBe("tjs:m:main:q8:wasm:mean:n:3");
  });
  test("dim is probed when not given", async () => {
    const e = await tjsEmbedder(fakePipe(5), { modelId: "m" });
    expect(e.dim).toBe(5);
  });
  test("miniLM defaults to wasm q8 on Xenova/all-MiniLM-L6-v2", async () => {
    const seen: unknown[] = [];
    const tjs = { pipeline: async (...a: unknown[]) => (seen.push(a), fakePipe(384)) };
    const e = await miniLM(tjs);
    expect(seen[0]).toEqual(["feature-extraction", "Xenova/all-MiniLM-L6-v2", { dtype: "q8", device: "wasm" }]);
    expect(e.id).toBe("tjs:Xenova/all-MiniLM-L6-v2:main:q8:wasm:mean:n:384");
  });
});

describe("records and hub", () => {
  test("every record names a weight licence", () => {
    for (const r of EMBED_RECORDS) expect(r.licence).toMatch(/MIT|Apache-2.0/);
  });
  test("the static factory loads a record from its url", async () => {
    const hub = createHub({});
    const files: Record<string, () => Response> = {
      "tokenizer.json": () => new Response(JSON.stringify(tokJson)),
      "model.safetensors": () => new Response(weights()),
      "config.json": () => new Response('{"normalize": true}'),
    };
    const fetch = (async (u: string) => files[u.split("/").pop()!]?.() ?? new Response("", { status: 404 })) as typeof globalThis.fetch;
    // the pinned hashes refuse these fake files, as they should
    attachEmbed(hub, undefined, { fetch });
    await expect(hub.use({ id: "potion-base-8m" })).rejects.toThrow();
    const hub2 = createHub({});
    attachEmbed(hub2, undefined, { fetch, sha256For: () => undefined });
    const l = await hub2.use<import("@hackbuild/embed").Embedder>({ id: "potion-base-8m" });
    expect(l.value.id).toMatch(/^model2vec:potion-base-8m:4:/);
    expect((await l.value.embed(["dog"]))[0]!.length).toBe(4);
  });
});

test("vector index returns top k above a floor", () => {
  const ix = new VectorIndex<string>();
  ix.add("x", Float32Array.from([1, 0]));
  ix.add("y", Float32Array.from([0.7, 0.7]));
  ix.add("z", Float32Array.from([0, 1]));
  expect(ix.search(Float32Array.from([1, 0.1]), 2).map((h) => h.item)).toEqual(["x", "y"]);
  expect(ix.search(Float32Array.from([1, 0]), 5, 0.5).map((h) => h.item)).toEqual(["x", "y"]);
  expect(ix.remove((s) => s === "x")).toBe(1);
  expect(ix.size).toBe(2);
});

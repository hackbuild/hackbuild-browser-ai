import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { createHub, createRegistry, stubFactory } from "@hackbuild/models";
import {
  EmbeddingCache,
  attachVision,
  cutoutPng,
  discSegmenter,
  emptyMask,
  maskArea,
  maskDilate,
  maskErode,
  maskFeather,
  maskFromRle,
  maskInvert,
  maskLargestComponent,
  maskOutline,
  maskSubtract,
  maskToPng,
  maskToRle,
  maskToSvg,
  maskUnion,
  promptSegmenter,
  samLoader,
  segment,
  visionStubs,
  type Mask,
} from "@hackbuild/vision";

const rect = (w: number, h: number, x0: number, y0: number, x1: number, y1: number): Mask => {
  const m = emptyMask(w, h);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) m.data[y * w + x] = 255;
  return m;
};

/** Raw scanlines of a PNG, filter bytes removed. */
function pngPixels(png: Uint8Array): { w: number; h: number; type: number; px: Uint8Array } {
  const dv = new DataView(png.buffer, png.byteOffset);
  expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let p = 8;
  let w = 0;
  let h = 0;
  let type = 0;
  const idat: Uint8Array[] = [];
  while (p < png.length) {
    const n = dv.getUint32(p);
    const t = String.fromCharCode(...png.subarray(p + 4, p + 8));
    const d = png.subarray(p + 8, p + 8 + n);
    if (t === "IHDR") {
      w = dv.getUint32(p + 8);
      h = dv.getUint32(p + 12);
      type = d[9]!;
    }
    if (t === "IDAT") idat.push(d);
    p += 12 + n;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const ch = type === 6 ? 4 : 1;
  const px = new Uint8Array(w * h * ch);
  for (let y = 0; y < h; y++) {
    expect(raw[y * (w * ch + 1)]).toBe(0);
    px.set(raw.subarray(y * (w * ch + 1) + 1, (y + 1) * (w * ch + 1)), y * w * ch);
  }
  return { w, h, type, px };
}

describe("prompts and the embedding cache", () => {
  it("encodes one image once for points, negative points and boxes", async () => {
    let encodes = 0;
    const seen: unknown[] = [];
    const seg = promptSegmenter<string>({
      encode: async () => `emb${++encodes}`,
      decode: async (e, p) => {
        seen.push([e, p]);
        return [
          { width: 1, height: 1, data: new Uint8Array([255]), score: 1.01 },
          { width: 1, height: 1, data: new Uint8Array([0]), score: 1.2 },
        ];
      },
    });
    const img = { width: 8, height: 8 };
    const m = await seg.segment(img, { points: [{ x: 1, y: 1 }] });
    await seg.segment(img, { points: [{ x: 1, y: 1 }, { x: 2, y: 2, label: 0 }] });
    await seg.segment(img, { box: { x: 0, y: 0, w: 4, h: 4 } });
    expect(encodes).toBe(1);
    expect(seg.cache.hits).toBe(2);
    expect(m.map((x) => x.score)).toEqual([1, 1]);
    await seg.segment({ width: 8, height: 8 }, { points: [{ x: 1, y: 1 }] });
    expect(encodes).toBe(2);
    await expect(seg.segment(img, {})).rejects.toThrow(/point or a box/);
  });

  it("shares an encode in flight, keys by hash, drops failures and evicts the oldest", async () => {
    let encodes = 0;
    let fail = true;
    const cache = new EmbeddingCache<number>(2);
    const seg = promptSegmenter<number>({
      encode: async () => {
        encodes++;
        if (fail) throw new Error("encoder down");
        return encodes;
      },
      decode: async () => [],
    });
    await expect(seg.segment({}, { points: [{ x: 0, y: 0 }] }, { key: "a", cache })).rejects.toThrow("encoder down");
    expect(cache.has("a")).toBe(false);
    fail = false;
    await Promise.all([1, 2, 3].map(() => seg.segment({}, { points: [{ x: 0, y: 0 }] }, { key: "a", cache })));
    expect(encodes).toBe(2);
    await seg.segment({}, { box: { x: 0, y: 0, w: 1, h: 1 } }, { key: "b", cache });
    await seg.segment({}, { box: { x: 0, y: 0, w: 1, h: 1 } }, { key: "c", cache });
    expect([cache.has("a"), cache.has("b"), cache.has("c"), cache.size]).toEqual([false, true, true, 2]);
    expect(seg.cache.size).toBe(0);
  });

  it("routes a box prompt to the prompted model through the hub and the stub cuts negative points", async () => {
    const hub = createHub({ registry: createRegistry(), stub: true });
    attachVision(hub);
    hub.provide("stub", stubFactory(visionStubs()));
    const img = { width: 40, height: 40 };
    const cache = new EmbeddingCache();
    const [boxed] = await segment(hub, img, { box: { x: 0, y: 0, w: 20, h: 20 } }, { key: "img", cache });
    expect(boxed!.data[10 * 40 + 10]).toBe(255);
    expect(boxed!.data[30 * 40 + 30]).toBe(0);
    const [cut] = await segment(hub, img, { points: [{ x: 20, y: 20 }, { x: 20, y: 20, label: 0 }] }, { key: "img", cache });
    expect(cut!.data[20 * 40 + 20]).toBe(0);
    expect(cut!.data[20 * 40 + 28]).toBe(255);
    expect([cache.misses, cache.hits]).toEqual([1, 1]);
  });

  it("feeds slimsam boxes and negative labels from one embedding", async () => {
    let embeds = 0;
    const feeds: Record<string, unknown>[] = [];
    const tjs = {
      AutoProcessor: {
        from_pretrained: async () =>
          Object.assign(async (_raw: unknown, o?: Record<string, unknown>) => (o ? { ...o } : { original_sizes: [[1, 1]], reshaped_input_sizes: [[1, 1]] }), {
            post_process_masks: async () => [{ data: [1], dims: [1, 1, 1, 1] }],
          }),
      },
      SamModel: {
        from_pretrained: async () =>
          Object.assign(
            async (f: Record<string, unknown>) => {
              feeds.push(f);
              return { pred_masks: null, iou_scores: { data: [1.04], dims: [1, 1] } };
            },
            { get_image_embeddings: async () => (embeds++, { image_embeddings: 1 }) },
          ),
      },
    };
    const sam = await samLoader({ tjs, record: { source: { modelId: "x" } }, options: {} } as unknown as Parameters<typeof samLoader>[0]);
    const img = { width: 1, height: 1 };
    const [m] = await sam.segment(img, { box: { x: 1, y: 2, w: 3, h: 4 } });
    await sam.segment(img, { points: [{ x: 1, y: 1 }, { x: 2, y: 2, label: 0 }], box: { x: 0, y: 0, w: 1, h: 1 } });
    expect(embeds).toBe(1);
    expect(m!.score).toBe(1);
    expect(feeds[0]).toMatchObject({ image_embeddings: 1, input_boxes: [[[1, 2, 4, 6]]] });
    expect(feeds[0]!.input_points).toBeUndefined();
    expect(feeds[1]).toMatchObject({ input_labels: [[[1, 0]]], input_boxes: [[[0, 0, 1, 1]]] });
  });

  it("counts stub encodes", async () => {
    const s = discSegmenter();
    const img = { width: 16, height: 16 };
    await s.segment(img, { points: [{ x: 8, y: 8 }] });
    await s.segment(img, { points: [{ x: 4, y: 4 }] });
    expect(s.encodes).toBe(1);
  });
});

describe("mask operations", () => {
  const a = rect(10, 10, 0, 0, 5, 10);
  const b = rect(10, 10, 3, 0, 8, 10);

  it("unions, subtracts and inverts", () => {
    expect(maskArea(maskUnion(a, b))).toBe(80);
    expect(maskArea(maskSubtract(a, b))).toBe(30);
    expect(maskArea(maskInvert(a))).toBe(50);
    expect(() => maskUnion(a, emptyMask(3, 3))).toThrow(RangeError);
  });

  it("dilates and erodes by a disc without eating the border", () => {
    const dot = rect(21, 21, 10, 10, 11, 11);
    const grown = maskDilate(dot, 3);
    // lattice points within radius 3: 29 (computed)
    expect(maskArea(grown)).toBe(29);
    expect(maskErode(grown, 3).data[10 * 21 + 10]).toBe(255);
    expect(maskArea(maskErode(grown, 3))).toBe(1);
    const full = rect(6, 6, 0, 0, 6, 6);
    expect(maskArea(maskErode(full, 2))).toBe(36);
  });

  it("feathers to soft edges and keeps the largest piece", () => {
    const f = maskFeather(a, 2);
    expect(f.data[5 * 10 + 0]).toBe(255);
    expect(f.data[5 * 10 + 9]).toBe(0);
    const mid = f.data[5 * 10 + 4]!;
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(255);
    const two = maskUnion(rect(12, 12, 0, 0, 2, 2), rect(12, 12, 5, 5, 10, 10));
    const big = maskLargestComponent(two);
    expect(maskArea(big)).toBe(25);
    expect(big.data[0]).toBe(0);
    const diag = maskUnion(rect(4, 4, 0, 0, 1, 1), rect(4, 4, 1, 1, 2, 2));
    expect(maskArea(maskLargestComponent(diag, 8))).toBe(2);
    expect(maskArea(maskLargestComponent(diag, 4))).toBe(1);
  });
});

describe("mask export", () => {
  it("writes a grey png and a cutout with the mask as alpha, compressed and stored", async () => {
    const m = rect(3, 2, 1, 0, 3, 2);
    for (const compress of [true, false]) {
      const g = pngPixels(await maskToPng(m, { compress }));
      expect([g.w, g.h, g.type]).toEqual([3, 2, 0]);
      expect(Array.from(g.px)).toEqual([0, 255, 255, 0, 255, 255]);
    }
    const img = { width: 3, height: 2, data: new Uint8ClampedArray(24).fill(200) };
    const c = pngPixels(await cutoutPng(img, m));
    expect(c.type).toBe(6);
    expect(Array.from(c.px.subarray(0, 8))).toEqual([200, 200, 200, 0, 200, 200, 200, 200]);
  });

  it("outlines a square with a hole as an even odd svg path", () => {
    const sq = rect(8, 8, 1, 1, 3, 3);
    expect(maskOutline(sq)).toHaveLength(1);
    expect(maskToSvg(sq)).toContain('d="M1 1L3 1L3 3L1 3Z"');
    const ring = maskSubtract(rect(8, 8, 1, 1, 7, 7), rect(8, 8, 3, 3, 5, 5));
    const loops = maskOutline(ring);
    expect(loops).toHaveLength(2);
    expect(loops.map((l) => l.length)).toEqual([4, 4]);
    expect(maskToSvg(ring)).toMatch(/fill-rule="evenodd"/);
  });

  it("round trips coco run length json", () => {
    const m = maskUnion(rect(5, 4, 0, 0, 1, 1), rect(5, 4, 2, 1, 5, 3));
    const r = maskToRle(m);
    expect(r.size).toEqual([4, 5]);
    expect(r.counts[0]).toBe(0);
    expect(r.counts.reduce((s, n) => s + n, 0)).toBe(20);
    expect(Array.from(maskFromRle(JSON.parse(JSON.stringify(r))).data)).toEqual(Array.from(m.data));
    expect(maskToRle(emptyMask(2, 2)).counts).toEqual([4]);
  });
});

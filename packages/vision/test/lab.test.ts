import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import type { OrtModel } from "@hackbuild/devices";
import { createHub, createRegistry } from "@hackbuild/models";
import {
  DETECT_SIZES,
  PICKER_RECORDS,
  autoThresholdMask,
  clusterMask,
  clusterMasks,
  colourClusters,
  decodeFastSam,
  decodeYoloEnd2End,
  detectAt,
  edgeMask,
  exportInstances,
  instanceAt,
  isEnd2End,
  letterboxParams,
  maskArea,
  maskBox,
  maskToSelection,
  otsuThreshold,
  segmentEverything,
  selectionToMask,
  thresholdMask,
  type Instance,
  type Pixels,
} from "@hackbuild/vision";
import { ellipseMask, floodMask, lassoMask, polygonMask, rectMask, wandMask, wandSelect } from "@hackbuild/vision/select";

const env = (o: Partial<Env> = {}): Env => ({
  webgpu: false,
  f16: false,
  adapter: null,
  maxBufferBytes: null,
  isolated: false,
  protocol: "https",
  opfs: true,
  cacheStorage: true,
  indexedDB: true,
  threads: 1,
  deviceMemoryGB: 8,
  promptApi: false,
  notes: [],
  ...o,
});

/** w x h RGBA: black left half, white right half, with a red square at 4..8 when `square`. */
function halves(w = 16, h = 12, square = false): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = x < w / 2 ? 0 : 255;
      const red = square && x >= 4 && x < 8 && y >= 4 && y < 8;
      data.set(red ? [255, 0, 0, 255] : [v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

function fakeOrt(outputs: Record<string, { data: Float32Array; dims: number[] }>): OrtModel {
  const session = { inputNames: ["images"], outputNames: Object.keys(outputs), run: async () => outputs };
  return {
    ort: { Tensor: class {} as never, InferenceSession: { create: async () => null as never } },
    sessions: { m: session },
    session,
    rung: { device: "wasm" },
    dispose: async () => {},
  };
}

describe("detector sizes", () => {
  it("maps n, s and m to the yolov10 picker records", () => {
    expect(DETECT_SIZES).toEqual({ n: "yolov10n", s: "yolov10s", m: "yolov10m" });
    for (const id of Object.values(DETECT_SIZES)) expect(PICKER_RECORDS.find((r) => r.id === id)?.licence).toMatch(/AGPL/);
  });

  it("decodes the end to end layout and still suppresses duplicates", () => {
    expect(isEnd2End([1, 300, 6])).toBe(true);
    expect(isEnd2End([1, 84, 8400])).toBe(false);
    const lb = letterboxParams(1280, 720, 640);
    const out = Float32Array.from([270, 230, 370, 410, 0.9, 0, 271, 231, 371, 411, 0.8, 0, 90, 190, 110, 210, 0.5, 16, 0, 0, 1, 1, 0.1, 0]);
    const d = decodeYoloEnd2End(out, [1, 4, 6], lb, { width: 1280, height: 720 });
    expect(d.map((x) => x.label)).toEqual(["person", "dog"]);
    expect(d[0]!.box).toEqual({ x: 540, y: 180, w: 200, h: 360 });
  });

  it("adds the picked size on first use and runs it through the ort model", async () => {
    const out = new Float32Array(300 * 6);
    out.set([160, 160, 480, 480, 0.8, 2]); // letterbox pixels: a 64 px image scales by 10 into 640
    const hub = createHub({ registry: createRegistry(), env: env() });
    hub.provide("ort", async () => fakeOrt({ output0: { data: out, dims: [1, 300, 6] } }));
    const px = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    const d = await detectAt(hub, px, "s");
    expect(hub.registry.get("yolov10s")).toBeTruthy();
    expect(d).toEqual([{ label: "car", score: expect.closeTo(0.8, 5), box: { x: 16, y: 16, w: 32, h: 32 } }]);
    await expect(detectAt(hub, px, "x" as never)).rejects.toThrow(/pick n, s or m/);
  });
});

/** Two prototypes on an 8 x 8 grid: left half and right half. Two anchors, each picking one prototype. */
function fastSamFixture(f = 1) {
  const k = 2;
  const ph = 8;
  const pw = 8;
  const protos = new Float32Array(k * ph * pw);
  for (let y = 0; y < ph; y++)
    for (let x = 0; x < pw; x++) {
      protos[y * pw + x] = x < 4 ? 10 : -10;
      protos[ph * pw + y * pw + x] = x >= 4 ? 10 : -10;
    }
  const n = 3;
  const rows = 4 + 1 + k;
  const out = new Float32Array(rows * n);
  const put = (a: number, cx: number, cy: number, w: number, h: number, s: number, c0: number, c1: number) => {
    out[a] = cx;
    out[n + a] = cy;
    out[2 * n + a] = w;
    out[3 * n + a] = h;
    out[4 * n + a] = s;
    out[5 * n + a] = c0;
    out[6 * n + a] = c1;
  };
  put(0, 16 * f, 32 * f, 32 * f, 64 * f, 0.9, 1, 0); // left half of a 64 square input
  put(1, 48 * f, 32 * f, 32 * f, 64 * f, 0.7, 0, 1); // right half
  put(2, 48 * f, 32 * f, 32 * f, 64 * f, 0.2, 0, 1); // under the confidence
  return { out, dims: [1, rows, n], protos, protoDims: [1, k, ph, pw] };
}

describe("fastsam segment everything", () => {
  it("decodes prototype masks per box, best first, through the letterbox", () => {
    const f = fastSamFixture();
    const lb = letterboxParams(32, 32, 64);
    const inst = decodeFastSam(f.out, f.dims, f.protos, f.protoDims, lb, { width: 32, height: 32 }, { minArea: 1 });
    expect(inst.map((i) => i.score)).toEqual([expect.closeTo(0.9, 5), expect.closeTo(0.7, 5)]);
    expect(inst[0]!.box).toEqual({ x: 0, y: 0, w: 16, h: 32 });
    expect(inst[0]!.area).toBe(16 * 32);
    expect(inst[0]!.mask.data[5 * 32 + 3]).toBe(255);
    expect(inst[0]!.mask.data[5 * 32 + 20]).toBe(0);
    expect(inst[1]!.mask.data[5 * 32 + 20]).toBe(255);
    expect(instanceAt(inst, 20, 5)).toBe(inst[1]);
    expect(instanceAt(inst, 40, 5)).toBeUndefined();
    expect(decodeFastSam(f.out, f.dims, f.protos, f.protoDims, lb, { width: 32, height: 32 }, { minArea: 1000 })).toEqual([]);
    expect(() => decodeFastSam(f.out, [1, 6, 3], f.protos, f.protoDims, lb, { width: 32, height: 32 })).toThrow(/no class score/);
  });

  it("routes through the hub and adds the fastsam record on first use", async () => {
    const f = fastSamFixture(10);
    const hub = createHub({ registry: createRegistry(), env: env() });
    hub.provide("ort", async () => fakeOrt({ output1: { data: f.protos, dims: f.protoDims }, output0: { data: f.out, dims: f.dims } }));
    const px = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    const inst = await segmentEverything(hub, px, { minArea: 1 });
    expect(hub.registry.get("fastsam-s")).toBeTruthy();
    expect(inst.length).toBe(2);
    expect(inst[0]!.box).toEqual({ x: 0, y: 0, w: 32, h: 64 });
  });
});

describe("mask selection rasterisers", () => {
  it("wraps the hackbuild-ui tools as vision masks", () => {
    const px = halves(16, 12, true);
    const wand = wandMask(px, 0, 0, 5);
    expect(maskArea(wand)).toBe(8 * 12 - 16);
    expect(maskArea(wandMask(px, 0, 0, 5, false))).toBe(8 * 12 - 16);
    expect(maskArea(floodMask(px, 5, 5))).toBe(16);
    expect(maskToSelection(wand)).toEqual(wandSelect({ width: 16, height: 12, data: px.data as Uint8ClampedArray }, 0, 0, 5));
    expect(maskArea(rectMask(16, 12, { x: 2, y: 2 }, { x: 6, y: 5 }))).toBeGreaterThan(0);
    expect(maskArea(ellipseMask(16, 12, { x: 0, y: 0 }, { x: 16, y: 12 }))).toBeLessThan(16 * 12);
    const tri = [{ x: 0, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 12 }];
    expect(maskArea(polygonMask(16, 12, tri))).toBeGreaterThan(80);
    expect(lassoMask).toBe(polygonMask);
    expect(maskArea(polygonMask(16, 12, tri.slice(0, 2)))).toBe(0);
    expect(() => selectionToMask(new Uint8Array(3), 2, 2)).toThrow(RangeError);
  });
});

describe("no model auto modes", () => {
  it("finds the edge, thresholds by hand and by otsu", () => {
    const px = halves();
    const e = edgeMask(px);
    expect(e.data[5 * 16 + 7]).toBe(255);
    expect(e.data[5 * 16 + 2]).toBe(0);
    expect(e.data[0]).toBe(0);
    expect(maskArea(thresholdMask(px))).toBe(8 * 12);
    expect(maskArea(thresholdMask(px, 128, true))).toBe(8 * 12);
    const t = otsuThreshold(px);
    expect(t).toBeGreaterThanOrEqual(0);
    expect(t).toBeLessThan(255);
    expect(maskArea(autoThresholdMask(px).mask)).toBe(8 * 12);
  });

  it("clusters colours with a seeded rng, the same seed giving the same labels", () => {
    const px = halves(16, 12, true);
    let s = 7;
    const rng = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const c = colourClusters(px, { k: 3, rng });
    s = 7;
    expect(colourClusters(px, { k: 3, rng }).labels).toEqual(c.labels);
    expect(c.counts.reduce((a, b) => a + b, 0)).toBe(16 * 12);
    const masks = clusterMasks(c);
    expect(maskArea(masks[0]!)).toBe(Math.max(...c.counts));
    expect(maskArea(clusterMask(px, { k: 2 }))).toBeGreaterThan(0);
  });
});

describe("per instance export", () => {
  it("writes a cropped cutout and mask png per instance and one json with boxes", async () => {
    const px = halves(16, 12, true);
    const m = rectMask(16, 12, { x: 4, y: 4 }, { x: 8, y: 8 });
    const inst: Instance[] = [
      { box: { x: 4, y: 4, w: 4, h: 4 }, score: 0.876, area: maskArea(m), mask: m, label: "square" },
      { box: { x: 0, y: 0, w: 1, h: 1 }, score: 0.1, area: 0, mask: { width: 16, height: 12, data: new Uint8Array(192) } },
    ];
    expect(maskBox(m)).toEqual({ x: 4, y: 4, w: 4, h: 4 });
    const files = await exportInstances(px, inst, { compress: false });
    expect(files.map((f) => f.name)).toEqual(["instance_1_cutout.png", "instance_1_mask.png", "instances.json"]);
    expect([...files[0]!.data.subarray(1, 4)]).toEqual([80, 78, 71]);
    const json = JSON.parse(new TextDecoder().decode(files[2]!.data));
    expect(json.instances).toEqual([
      { index: 1, score: 0.88, area: 16, label: "square", box: { x: 4, y: 4, w: 4, h: 4 }, crop: { x: 4, y: 4, w: 4, h: 4 }, cutout: "instance_1_cutout.png", mask: "instance_1_mask.png" },
    ]);
    const whole = await exportInstances(px, inst.slice(0, 1), { crop: false, prefix: "obj", compress: false });
    expect(JSON.parse(new TextDecoder().decode(whole[2]!.data)).instances[0].crop).toEqual({ x: 0, y: 0, w: 16, h: 12 });
    expect(whole[2]!.name).toBe("objs.json");
  });
});

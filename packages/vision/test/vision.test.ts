import { describe, expect, it } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import { tjsProvider, type OrtModel, type TjsModule } from "@hackbuild/devices";
import { createHub, createRegistry, stubFactory } from "@hackbuild/models";
import {
  ResultCache,
  VISION_RECORDS,
  ask,
  attachVision,
  caption,
  decodeYolo,
  depth,
  depthFromOutput,
  depthToRgba,
  detect,
  detectCadenceMs,
  faceApiProvider,
  faceApiRecord,
  fitSize,
  landmarks,
  letterboxParams,
  letterboxTensor,
  mediapipeProvider,
  nms,
  perceptionLoop,
  readbackLoop,
  rampDepth,
  segment,
  visionStubs,
  vlmLoader,
  yoloRecord,
  type FaceApi,
  type TasksVision,
} from "@hackbuild/vision";

const env = (o: Partial<Env> = {}): Env => ({
  webgpu: true,
  f16: true,
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
const img = { width: 64, height: 48 };

describe("records", () => {
  it("names a licence on every record and keeps yolo external", () => {
    expect(VISION_RECORDS.every((r) => r.licence.length > 3)).toBe(true);
    expect(VISION_RECORDS.some((r) => /yolo/i.test(r.id))).toBe(false);
    const y = yoloRecord({ url: "https://h.test/yolov8n.onnx" });
    expect(y).toMatchObject({ commercial: false, provider: "ort" });
    expect(y.licence).toMatch(/AGPL-3.0/);
  });
});

describe("stub mode", () => {
  it("serves every capability with no weights", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory(visionStubs()));
    const d = await depth(hub, img);
    expect([d.width, d.height, d.data[63]]).toEqual([64, 48, 1]);
    expect((await detect(hub, img))[0]!.box).toEqual({ x: 16, y: 12, w: 32, h: 24 });
    expect((await segment(hub, img))[0]!.data.filter((v) => v).length).toBeGreaterThan(100);
    const lm = await landmarks(hub, "hand", img);
    expect(lm.points[0]!.length).toBe(21);
    expect(await caption(hub, img)).toBe("a stub caption.");
    expect(await ask(hub, img, "what is it")).toBe("stub answer to: what is it");
  });
});

describe("depth", () => {
  it("normalizes predicted_depth and keeps its range, or reads the 8 bit image", () => {
    const d = depthFromOutput({ predicted_depth: { data: [2, 4, 6, 10], dims: [1, 2, 2] } });
    expect(Array.from(d.data)).toEqual([0, 0.25, 0.5, 1]);
    expect(d.range).toEqual([2, 10]);
    const r = depthFromOutput({ depth: { width: 2, height: 1, channels: 1, data: [0, 255] } });
    expect(Array.from(r.data)).toEqual([0, 1]);
  });

  it("loads through the transformers.js provider with the BAIL fp32 retry", async () => {
    const dtypes: unknown[] = [];
    const mod: TjsModule = {
      env: {},
      pipeline: async (task, _m, o) => {
        dtypes.push(o.dtype);
        if (o.dtype === "fp16") throw new Error("shader-f16 not supported");
        expect(task).toBe("depth-estimation");
        return async () => ({ predicted_depth: { data: [1, 3], dims: [1, 1, 2] } });
      },
    };
    const tjs = tjsProvider({ runtime: async () => mod });
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub, tjs);
    hub.provide("tjs", tjs.factory);
    const d = await depth(hub, "data:image/png;base64,x");
    expect(Array.from(d.data)).toEqual([0, 1]);
    expect(dtypes).toEqual(["fp16", "fp32"]);
  });
});

function fakeTasks(failGpu: string[] = []) {
  const created: { cls: string; delegate: string; opts: Record<string, unknown> }[] = [];
  const mk = (cls: string, result: unknown) => ({
    createFromOptions: async (_fs: unknown, o: Record<string, unknown>) => {
      const delegate = (o.baseOptions as { delegate: string }).delegate;
      created.push({ cls, delegate, opts: o });
      if (delegate === "GPU" && failGpu.includes(cls)) throw new Error("webgl context lost");
      return { detect: () => result, detectForVideo: () => result, segment: () => result, close: () => {} };
    },
  });
  const tv: TasksVision = {
    FilesetResolver: { forVisionTasks: async (b) => ({ b }) },
    ObjectDetector: mk("ObjectDetector", {
      detections: [
        { categories: [{ categoryName: "cup", score: 0.8 }], boundingBox: { originX: 1, originY: 2, width: 3, height: 4 } },
        { categories: [{ categoryName: "dog", score: 0.2 }], boundingBox: { originX: 0, originY: 0, width: 1, height: 1 } },
      ],
    }),
    FaceLandmarker: mk("FaceLandmarker", {
      faceLandmarks: [[{ x: 0.1, y: 0.2, z: 0 }]],
      faceBlendshapes: [{ categories: [{ categoryName: "jawOpen", score: 0.7 }] }],
    }),
    HandLandmarker: mk("HandLandmarker", { landmarks: [[{ x: 0.5, y: 0.5, z: 0.1 }]], handedness: [[{ categoryName: "Left", score: 0.9 }]] }),
    ImageSegmenter: mk("ImageSegmenter", { confidenceMasks: [{ width: 2, height: 1, getAsFloat32Array: () => Float32Array.from([0, 1]) }] }),
  };
  return { tv, created };
}

describe("mediapipe provider", () => {
  it("falls from the GPU delegate to the CPU one and maps detections", async () => {
    const { tv, created } = fakeTasks(["ObjectDetector"]);
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub);
    hub.provide("mediapipe", mediapipeProvider({ runtime: async () => tv }));
    const d = await detect(hub, img, { scoreThreshold: 0.5 });
    expect(d).toEqual([{ label: "cup", score: 0.8, box: { x: 1, y: 2, w: 3, h: 4 } }]);
    expect(created.map((c) => c.delegate)).toEqual(["GPU", "CPU"]);
    expect((created[0]!.opts.baseOptions as { modelAssetPath: string }).modelAssetPath).toMatch(/efficientdet_lite0/);
    const seg = await segment(hub, img);
    expect(Array.from(seg[0]!.data)).toEqual([0, 255]);
    const hand = await landmarks(hub, "hand", img);
    expect(hand).toMatchObject({ handedness: ["Left"], source: "hand-landmarker" });
  });

  it("falls back to face-api when the face landmarker cannot load at all", async () => {
    const { tv } = fakeTasks();
    tv.FaceLandmarker = {
      createFromOptions: async () => {
        throw new Error("Failed to load model: http 404");
      },
    };
    const fa: FaceApi = {
      nets: { tinyFaceDetector: { loadFromUri: async () => {} }, faceLandmark68TinyNet: { loadFromUri: async () => {} } },
      TinyFaceDetectorOptions: class {},
      detectAllFaces: () => ({ withFaceLandmarks: async () => [{ landmarks: { positions: [{ x: 32, y: 24 }] }, detection: { imageWidth: 64, imageHeight: 48 } }] }),
    };
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub);
    hub.registry.add(faceApiRecord("https://h.test/face-api/model/"));
    hub.provide("mediapipe", mediapipeProvider({ runtime: async () => tv }));
    hub.provide("faceapi", faceApiProvider({ runtime: async () => fa }));
    const r = await landmarks(hub, "face", img);
    expect(r.source).toBe("face-api-tiny");
    expect(r.points[0]![0]).toEqual([0.5, 0.5, 0]);
    expect(r.failures[0]!.id).toBe("face-landmarker");
  });

  it("reports blendshapes from the face landmarker", async () => {
    const { tv } = fakeTasks();
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub);
    hub.provide("mediapipe", mediapipeProvider({ runtime: async () => tv }));
    const r = await landmarks(hub, "face", img);
    expect(r.blendshapes).toEqual([{ jawOpen: 0.7 }]);
    expect(r.failures).toEqual([]);
  });
});

describe("yolo", () => {
  it("letterboxes, decodes, maps back to source pixels and suppresses overlaps", () => {
    const lb = letterboxParams(1280, 720, 640);
    expect(lb).toEqual({ scale: 0.5, padX: 0, padY: 140, size: 640 });
    const n = 3;
    const rows = 4 + 80;
    const out = new Float32Array(rows * n);
    const put = (a: number, cx: number, cy: number, w: number, h: number, cls: number, s: number) => {
      out[a] = cx;
      out[n + a] = cy;
      out[2 * n + a] = w;
      out[3 * n + a] = h;
      out[(4 + cls) * n + a] = s;
    };
    put(0, 320, 320, 100, 100, 0, 0.9);
    put(1, 322, 322, 100, 100, 0, 0.6);
    put(2, 100, 200, 20, 20, 16, 0.5);
    const d = decodeYolo(out, [1, rows, n], lb, { width: 1280, height: 720 });
    expect(d.map((x) => x.label)).toEqual(["person", "dog"]);
    expect(d[0]!.box).toEqual({ x: 540, y: 260, w: 200, h: 200 });
    expect(nms([...d, { ...d[0]!, label: "cat" }]).length).toBe(3);
    const t = letterboxTensor({ width: 2, height: 1, data: Uint8ClampedArray.from([255, 0, 0, 255, 0, 255, 0, 255]) }, 4);
    expect(t.data[0]).toBeCloseTo(114 / 255);
    expect([t.data[4], t.data[6], t.data[16 + 6]]).toEqual([1, 0, 1]);
    expect(detectCadenceMs(50)).toBe(450);
    expect(detectCadenceMs(200)).toBe(800);
  });

  it("runs an external yolo record through an ort model", async () => {
    const out = new Float32Array(84);
    out[0] = 320;
    out[1] = 320;
    out[2] = 160;
    out[3] = 160;
    out[4 + 2] = 0.7;
    const model: OrtModel = {
      ort: { Tensor: class {} as never, InferenceSession: { create: async () => null as never } },
      sessions: {},
      session: { inputNames: ["images"], outputNames: ["output0"], run: async () => ({ output0: { data: out, dims: [1, 84, 1] } }) },
      rung: { device: "wasm" },
      dispose: async () => {},
    };
    (model as { sessions: Record<string, unknown> }).sessions.m = model.session;
    const hub = createHub({ registry: createRegistry([yoloRecord({ url: "https://h.test/y.onnx" })]), env: env({ webgpu: false }) });
    hub.provide("ort", async () => model);
    const px = { width: 64, height: 64, data: new Uint8ClampedArray(64 * 64 * 4) };
    const d = await detect(hub, px, { model: "yolov8n" });
    expect(d[0]).toMatchObject({ label: "car", box: { x: 24, y: 24, w: 16, h: 16 } });
  });
});

describe("vlm and sam loaders", () => {
  it("asks through a vision2seq model, serialized on the vlm chain", async () => {
    const order: string[] = [];
    const mod: TjsModule = {
      env: {},
      RawImage: { read: async (x: unknown) => ({ raw: x }) },
      AutoProcessor: {
        from_pretrained: async () =>
          Object.assign(async (text: string) => ({ input_ids: { data: [1, 2], dims: [1, 2] }, text }), {
            apply_chat_template: (m: { content: { text?: string }[] }[]) => `<user>${m[0]!.content[1]!.text}`,
            batch_decode: (t: { tail: string }) => [` ${t.tail} `],
          }),
      },
      AutoModelForVision2Seq: {
        from_pretrained: async (_id: string, o: Record<string, unknown>) => {
          expect(o.dtype).toEqual({ embed_tokens: "fp32", vision_encoder: "fp32", decoder_model_merged: "q4" });
          return {
            generate: async (o2: Record<string, unknown>) => {
              order.push(String(o2.text));
              await new Promise((r) => setTimeout(r, o2.text === "<user>first" ? 20 : 1));
              expect(o2.repetition_penalty).toBe(1.3);
              return { data: [], dims: [1, 5], slice: () => ({ tail: `answer ${String(o2.text)}` }) };
            },
          };
        },
      },
    };
    const tjs = tjsProvider({ runtime: async () => mod });
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub, tjs);
    hub.provide("tjs", tjs.factory);
    const [a, b] = await Promise.all([ask(hub, img, "first", { model: "smolvlm-256m-instruct" }), ask(hub, img, "second", { model: "smolvlm-256m-instruct" })]);
    expect([a, b]).toEqual(["answer <user>first", "answer <user>second"]);
    expect(order).toEqual(["<user>first", "<user>second"]);
  });

  it("passes images first to an lfm2-vl processor", async () => {
    const rec = VISION_RECORDS.find((r) => r.id === "lfm2-vl-450m")!;
    const seen: unknown[][] = [];
    const tjs: TjsModule = {
      env: {},
      RawImage: { read: async (x: unknown) => ({ raw: x }) },
      AutoProcessor: {
        from_pretrained: async () =>
          Object.assign(
            async (images: unknown, text: unknown) => {
              seen.push([images, text]);
              if (!Array.isArray(images)) throw new TypeError("undefined is not iterable");
              return { input_ids: { data: [1], dims: [1, 1] } };
            },
            { apply_chat_template: () => "<image>describe", batch_decode: () => [" a red cube "] },
          ),
      },
      AutoModelForImageTextToText: { from_pretrained: async () => ({ generate: async () => ({ data: [], dims: [1, 3], slice: () => ({}) }) }) },
    };
    const vlm = await vlmLoader({ tjs, record: rec, options: {} } as unknown as Parameters<typeof vlmLoader>[0]);
    expect(await vlm.ask(img)).toBe("a red cube");
    expect(Array.isArray(seen[0]![0])).toBe(true);
    expect(seen[0]![1]).toBe("<image>describe");
  });

  it("embeds an image once for several point prompts", async () => {
    let embeds = 0;
    const mod: TjsModule = {
      env: {},
      AutoProcessor: {
        from_pretrained: async () =>
          Object.assign(async (_raw: unknown, o?: Record<string, unknown>) => (o ? { input_points: o.input_points, input_labels: o.input_labels } : { original_sizes: [[1, 2]], reshaped_input_sizes: [[1, 2]] }), {
            post_process_masks: async () => [{ data: [1, 0, 0, 1], dims: [1, 2, 1, 2] }],
          }),
      },
      SamModel: {
        from_pretrained: async () =>
          Object.assign(async () => ({ pred_masks: null, iou_scores: { data: [0.2, 0.9], dims: [1, 2] } }), {
            get_image_embeddings: async () => {
              embeds++;
              return { image_embeddings: 1 };
            },
          }),
      },
    };
    const tjs = tjsProvider({ runtime: async () => mod });
    const hub = createHub({ registry: createRegistry(), env: env() });
    attachVision(hub, tjs);
    hub.provide("tjs", tjs.factory);
    const m1 = await segment(hub, img, { points: [{ x: 1, y: 0 }] });
    await segment(hub, img, { points: [{ x: 0, y: 0, label: 0 }] });
    expect(embeds).toBe(1);
    expect(m1.map((m) => m.score)).toEqual([0.9, 0.2]);
    expect(Array.from(m1[0]!.data)).toEqual([0, 255]);
  });
});

describe("loop and helpers", () => {
  it("runs one step at a time and waits out the interval", async () => {
    let t = 0;
    const q: (() => void)[] = [];
    let resolveStep: (() => void) | null = null;
    const results: number[] = [];
    const loop = perceptionLoop<number>({
      now: () => t,
      schedule: (f) => q.push(f),
      interval: () => 100,
      step: (tick) => new Promise<number>((r) => (resolveStep = () => r(tick))),
      onResult: (r) => results.push(r),
    });
    const frame = () => q.shift()!();
    frame();
    expect(loop.busy).toBe(true);
    t = 50;
    frame();
    expect(loop.steps).toBe(1);
    resolveStep!();
    await Promise.resolve();
    await Promise.resolve();
    expect(results).toEqual([0]);
    t = 60;
    frame();
    expect(loop.steps).toBe(1);
    t = 120;
    frame();
    expect(loop.steps).toBe(2);
    loop.stop();
    frame();
    expect(loop.running).toBe(false);
  });

  it("keeps a small LRU cache and converts depth for a canvas", async () => {
    const c = new ResultCache<number>(2);
    c.set("a", 1);
    c.set("b", 2);
    c.get("a");
    c.set("c", 3);
    expect([c.get("a"), c.get("b"), c.get("c")]).toEqual([1, undefined, 3]);
    let made = 0;
    await c.getOr("d", async () => ++made);
    await c.getOr("d", async () => ++made);
    expect(made).toBe(1);
    expect(fitSize(4000, 3000)).toEqual({ width: 1024, height: 768, scale: 0.256 });
    expect(Array.from(depthToRgba({ width: 1, height: 1, data: Float32Array.from([0.5]) }))).toEqual([128, 128, 128, 255]);
  });
});

describe("scheduling around rendering", () => {
  it("passes schedule options to the hub, routes to a smaller model, and reports busy", async () => {
    let t = 0;
    const slept: number[] = [];
    const hub = createHub({
      registry: createRegistry(),
      env: env(),
      now: () => t,
      timers: {
        sleep: async (ms) => {
          slept.push(ms);
          t += ms;
        },
        idle: async () => {},
      },
    });
    attachVision(hub);
    hub.registry.add({ ...VISION_RECORDS[0]!, id: "depth-big", sizeMB: 1300, provider: "fake" }, { ...VISION_RECORDS[0]!, id: "depth-small", sizeMB: 100, provider: "fake" });
    hub.registry.add({ ...VISION_RECORDS[0]!, provider: "fake", sizeMB: 1300 });
    const used: string[] = [];
    hub.provide("fake", async ({ record }) => {
      used.push(record.id);
      return rampDepth();
    });
    const busy: number[] = [];
    hub.onBusy((n) => busy.push(n));
    await depth(hub, img, { size: "tiny", schedule: { minIntervalMs: 1000 } });
    t += 400;
    await depth(hub, img, { size: "tiny", schedule: { minIntervalMs: 1000 } });
    expect(slept).toEqual([600]);
    expect(used).toEqual(["depth-small"]);
    await expect(depth(hub, img, { size: "tiny", schedule: { minIntervalMs: 1000, when: "skip" } })).rejects.toMatchObject({ code: "skipped" });
    for (let i = 0; i < 30; i++) hub.reportFrame(40);
    await expect(depth(hub, img, { size: "tiny", schedule: { frameBudgetMs: 20, when: "skip" } })).rejects.toMatchObject({ code: "skipped" });
    expect(busy.filter((b) => b > 0).length).toBeGreaterThan(0);
    expect(hub.busy()).toBe(0);
  });

  it("caps readback rate and skips frames while a read is in flight", async () => {
    let t = 0;
    const q: (() => void)[] = [];
    let finish: (() => void) | null = null;
    const frames: number[] = [];
    const loop = readbackLoop<number>({
      maxHz: 10,
      now: () => t,
      schedule: (f) => q.push(f),
      read: () => new Promise<number>((r) => (finish = () => r(t))),
      onFrame: (f) => {
        frames.push(f);
      },
    });
    const frame = () => q.shift()!();
    frame();
    t = 16;
    frame();
    t = 32;
    frame();
    expect(loop.skipped).toBe(2);
    finish!();
    await new Promise((r) => setTimeout(r, 0));
    expect(frames).toEqual([32]);
    t = 60;
    frame();
    expect(loop.steps).toBe(1);
    t = 101;
    frame();
    expect(loop.steps).toBe(2);
    loop.stop();
  });
});

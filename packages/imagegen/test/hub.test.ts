import { describe, expect, test } from "vitest";
import { ortProvider, type OrtModule, type OrtSession } from "@hackbuild/devices";
import { createHub, createRegistry, stubFactory, type ModelRecord } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";
import {
  IMAGEGEN_RECORDS,
  IMAGEGEN_PICKER_RECORDS,
  FormError, applyForm, attachImagegen, eulerPlan, formOf, generate, leadingTimesteps, loadImagegen, loadLabel, stubImagegenModel, type SessionLike } from "@hackbuild/imagegen";

const env = { webgpu: true, f16: true, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https" as const, opfs: true, cacheStorage: true, indexedDB: true, threads: 1, deviceMemoryGB: 8, promptApi: false, notes: [] };

class T {
  constructor(
    readonly type: string,
    readonly data: Float32Array | Int32Array | BigInt64Array,
    readonly dims: number[],
  ) {}
}

describe("records and forms", () => {
  test("two records, each with a form the select can render", () => {
    expect(IMAGEGEN_RECORDS.map((r) => r.id)).toEqual(["sd-turbo", "sd-1.5"]);
    expect(IMAGEGEN_PICKER_RECORDS.map((r) => r.id)).toEqual(["sdxl-turbo"]);
    expect(formOf(IMAGEGEN_PICKER_RECORDS[0]!)?.steps.default).toBe(1);
    const [turbo, sd15] = IMAGEGEN_RECORDS.map((r) => formOf(r)!);
    expect(turbo).toMatchObject({ steps: { min: 1, max: 4, default: 2 }, guidance: null, negative: false, sizes: [512], spacing: "trailing" });
    expect(sd15).toMatchObject({ steps: { min: 5, max: 40, default: 22 }, guidance: { default: 7.5 }, negative: true, spacing: "leading" });
    for (const r of IMAGEGEN_RECORDS) expect(r.licence.length).toBeGreaterThan(5);
    expect(formOf({ ...IMAGEGEN_RECORDS[0]!, form: undefined } as never)).toBeNull();
  });
  test("the load button names the size and its source", () => {
    expect(loadLabel(IMAGEGEN_RECORDS[0]!)).toBe("load sd-turbo 512, about 2.4 gb (vendor)");
    expect(loadLabel({ ...IMAGEGEN_RECORDS[0]!, sizeMB: null })).toBe("load sd-turbo 512, size unknown");
  });
  test("applyForm fills defaults, clamps, and drops what the model does not take", () => {
    const [turbo, sd15] = IMAGEGEN_RECORDS.map((r) => r.form);
    expect(applyForm(turbo!, { prompt: "x", steps: 9, guidance: 5, negative: "blur" })).toEqual({ prompt: "x", steps: 4, size: 512, spacing: "trailing" });
    expect(applyForm(sd15!, { prompt: "x", negative: "blur" })).toEqual({ prompt: "x", negative: "blur", steps: 22, size: 512, guidance: 7.5, spacing: "leading" });
    expect(() => applyForm(turbo!, { prompt: "x", size: 768 })).toThrow(FormError);
    expect(() => applyForm(turbo!, { prompt: "x", size: 768 })).toThrow("this model makes 512 pixel images, not 768.");
  });
});

test("leading spacing with offset 1", () => {
  expect(leadingTimesteps(4)).toEqual([751, 501, 251, 1]);
  expect(eulerPlan(4, "leading").timesteps).toEqual([751, 501, 251, 1]);
});

test("guidance runs the unet on prompt and negative and mixes the noise", async () => {
  const seen: string[] = [];
  let mixed: Float32Array | null = null;
  const enc = (v: number) => ({ last_hidden_state: { data: new Float32Array(77).fill(v), dims: [1, 77, 1] } });
  const sessions: Record<string, SessionLike> = {
    textEncoder: { run: async (f) => ((f.input_ids as T).data[1] === 9 ? enc(1) : enc(0)) },
    unet: {
      run: async (f) => {
        const h = (f.encoder_hidden_states as T).data[0]!;
        seen.push(h === 1 ? "cond" : "uncond");
        return { out_sample: { data: new Float32Array((f.sample as T).data.length).fill(h === 1 ? 2 : 1) } };
      },
    },
    vaeDecoder: { run: async (f) => ((mixed = (f.latent_sample as T).data as Float32Array), { sample: { data: new Float32Array(3 * 64) } }) },
  };
  // zero noise rng, so the final latent is eps * (0 - sigma0) divided by the vae scale
  await generate({ Tensor: T }, sessions as never, (p) => (p === "a cat" ? [1, 9] : [1, 2]), { prompt: "a cat", negative: "", guidance: 3, steps: 1, size: 8, rng: () => 0.5, spacing: "trailing" });
  expect(seen).toEqual(["cond", "uncond"]);
  const sigma0 = eulerPlan(1).sigmas[0]!;
  // the box-muller of 0.5, 0.5 is -sqrt(2 ln 2); eps = 1 + 3 * (2 - 1) = 4
  const z = Math.sqrt(-2 * Math.log(0.5)) * Math.cos(Math.PI);
  expect(mixed![0]).toBeCloseTo((z * sigma0 + 4 * (0 - sigma0)) / 0.18215, 3);
});

describe("hub loader", () => {
  test("loads through the shared ort provider and weight store, keys graphs by folder, runs under hub.run", async () => {
    const base = "https://huggingface.co/microsoft/stable-diffusion-v1.5-webnn/resolve/main/";
    const body: Record<string, string> = { [base + "text_encoder/model.onnx"]: "te", [base + "unet/model.onnx"]: "unet", [base + "vae_decoder/model.onnx"]: "vae" };
    const fetched: string[] = [];
    const f = async (url: string) => (fetched.push(url), body[url] === undefined ? new Response("missing", { status: 404 }) : new Response(body[url], { headers: { "content-length": String(body[url]!.length) } }));
    const store = await openWeightStore({ backends: ["memory"], fetch: f as unknown as typeof fetch, onNotice: () => {} });
    const stub = stubImagegenModel();
    const byName: Record<string, string> = { te: "text_encoder", unet: "unet", vae: "vae_decoder" };
    const opts: Record<string, unknown>[] = [];
    const ort: OrtModule = {
      env: { wasm: {} },
      Tensor: T as unknown as OrtModule["Tensor"],
      InferenceSession: {
        create: async (bytes, o) => {
          opts.push(o ?? {});
          const s = stub.sessions[byName[new TextDecoder().decode(bytes)]!]!;
          return { inputNames: [], outputNames: [], run: (feeds) => s.run(feeds) } as unknown as OrtSession;
        },
      },
    };
    const hub = createHub({ registry: createRegistry([]), env, onLicence: () => {} });
    hub.provide("ort", ortProvider({ runtime: async () => ort, store }).factory);
    attachImagegen(hub);
    let runs = 0;
    const realRun = hub.run.bind(hub);
    hub.run = ((l, fn, o) => (runs++, realRun(l, fn, o))) as typeof hub.run;
    const gen = await loadImagegen(hub, { id: "sd-1.5" });
    expect(gen.form.negative).toBe(true);
    expect(fetched.sort()).toEqual(Object.keys(body).sort());
    expect(opts[0]!.freeDimensionOverrides).toMatchObject({ height: 64, sequence_length: 77 });
    const steps: string[] = [];
    const img = await gen.generate(() => [1, 2], { prompt: "a brass ferrule", negative: "blur", steps: 5, seed: 7, onStep: (p) => steps.push(`${p.stage} ${p.step}`) });
    expect(img.width).toBe(512);
    expect(steps).toEqual(["text 0", "denoise 1", "denoise 2", "denoise 3", "denoise 4", "denoise 5", "decode 5"]);
    // two text encodes, two unet calls per step, one decode
    expect(runs).toBe(2 + 2 * 5 + 1);
    gen.release();
    expect(hub.status().find((s) => s.id === "sd-1.5")!.refs).toBe(0);
  });

  test("stub mode serves a grey image with no weights", async () => {
    const hub = createHub({ stub: true, env, onLicence: () => {} });
    hub.provide("stub", stubFactory({ imagegen: () => stubImagegenModel() }));
    const gen = await loadImagegen(hub);
    expect(gen.record.id).toBe("stub:imagegen");
    expect(gen.form.steps.default).toBe(2);
    const img = await gen.generate(() => [1], { prompt: "x", seed: 1 });
    expect(img.rgba[0]).toBe(128);
  });

  test("a model without the three graphs is refused and released", async () => {
    const rec: ModelRecord = { ...IMAGEGEN_RECORDS[0]!, id: "odd", provider: "fake" };
    const hub = createHub({ registry: createRegistry([rec]), env, onLicence: () => {} });
    hub.provide("fake", async () => ({ ort: { Tensor: T }, sessions: { model: { run: async () => ({}) } } }));
    await expect(loadImagegen(hub, { id: "odd" })).rejects.toThrow(/no text_encoder graph; it has model/);
    expect(hub.status()[0]!.refs).toBe(0);
  });
});

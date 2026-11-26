import { describe, expect, test } from "vitest";
import { createHub, createRegistry } from "@hackbuild/models";
import { IMAGEGEN_PICKER_RECORDS, XL_IO, formOf, fromHalf, generateXl, loadImagegen, padIds2, toHalf, type SessionLike, type XlSessions } from "@hackbuild/imagegen";

const env = { webgpu: true, f16: true, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https" as const, opfs: true, cacheStorage: true, indexedDB: true, threads: 1, deviceMemoryGB: 8, promptApi: false, notes: [] };

class T {
  constructor(
    readonly type: string,
    readonly data: Float32Array | Int32Array | BigInt64Array | Uint16Array,
    readonly dims: number[],
  ) {}
}

/** Fake SDXL graphs that record every feed; the unet predicts zero noise and the vae returns zeros. */
function fakes(half = false) {
  const feeds: Record<string, Record<string, T>[]> = { te1: [], te2: [], unet: [], vae: [] };
  const f = (n: number, v: number) => (half ? toHalf(new Float32Array(n).fill(v)) : new Float32Array(n).fill(v));
  const s: Record<keyof XlSessions, SessionLike> = {
    textEncoder: { run: async (x) => (feeds.te1!.push(x as never), { "hidden_states.11": { data: f(77 * 3, 1), dims: [1, 77, 3] }, last_hidden_state: { data: f(77 * 3, 9), dims: [1, 77, 3] } }) },
    textEncoder2: { run: async (x) => (feeds.te2!.push(x as never), { "hidden_states.31": { data: f(77 * 5, 2), dims: [1, 77, 5] }, text_embeds: { data: f(5, 3), dims: [1, 5] } }) },
    unet: { run: async (x) => (feeds.unet!.push(x as never), { out_sample: { data: f((x.sample as T).data.length, 0) } }) },
    vaeDecoder: { run: async (x) => (feeds.vae!.push(x as never), { sample: { data: f(3 * 64 * 64, 0) } }) },
  };
  return { s: s as XlSessions, feeds };
}

describe("sdxl-turbo pipeline", () => {
  test("half floats round trip and the second tokenizer pads with zero after the end token", () => {
    const v = [0, 1, -2, 0.5, 65504, 1e-5, 3.14159];
    const back = fromHalf(toHalf(v));
    expect(back[1]).toBe(1);
    expect(back[2]).toBe(-2);
    expect(back[4]).toBe(65504);
    expect(back[6]).toBeCloseTo(3.14, 2);
    expect(fromHalf(toHalf([1e6]))[0]).toBe(Infinity);
    const p = padIds2([49406, 320, 49407, 49407, 49407]);
    expect([...p.slice(0, 5)]).toEqual([49406, 320, 49407, 0, 0]);
    expect(p.length).toBe(77);
  });

  test("joins both hidden states, feeds pooled embeds and time ids, and scales the latent for the sdxl vae", async () => {
    const { s, feeds } = fakes();
    const img = await generateXl({ Tensor: T as never }, s, () => [49406, 320, 49407], { prompt: "a mug", size: 64, seed: 3 });
    expect(img.width).toBe(64);
    const u = feeds.unet![0]!;
    expect(u.encoder_hidden_states!.dims).toEqual([1, 77, 8]);
    expect([...(u.encoder_hidden_states!.data as Float32Array).slice(0, 8)]).toEqual([1, 1, 1, 2, 2, 2, 2, 2]);
    expect(u.text_embeds!.dims).toEqual([1, 5]);
    expect([...(u.time_ids!.data as Float32Array)]).toEqual([64, 64, 0, 0, 64, 64]);
    expect(u.timestep!.type).toBe("int64");
    expect([...(feeds.te2![0]!.input_ids!.data as Int32Array).slice(2, 5)]).toEqual([49407, 0, 0]);
    expect(feeds.unet!.length).toBe(1);
    // zero noise leaves the seeded latent; the vae sees it over 0.13025
    const lat = (u.sample!.data as Float32Array)[0]!;
    const sigma = 14.6146;
    const vae = (feeds.vae![0]!.latent_sample!.data as Float32Array)[0]!;
    expect(vae).toBeCloseTo((lat * Math.sqrt(sigma * sigma + 1)) / XL_IO.vaeScale, 1);
  });

  test("fp16 edges convert at every graph, and guidance runs the negative", async () => {
    const { s, feeds } = fakes(true);
    await generateXl({ Tensor: T as never }, s, () => [49406, 49407], { prompt: "x", size: 64, guidance: 2, xl: { io: "float16", timestep: "float16" } });
    const u = feeds.unet![0]!;
    expect(u.sample!.type).toBe("float16");
    expect(u.timestep!.type).toBe("float16");
    expect(fromHalf(u.timestep!.data as Uint16Array)[0]).toBe(999);
    expect(fromHalf(u.encoder_hidden_states!.data as Uint16Array)[3]).toBe(2);
    expect(feeds.unet!.length).toBe(2);
    expect(feeds.te1!.length).toBe(2);
  });

  test("names a missing output", async () => {
    const { s } = fakes();
    await expect(generateXl({ Tensor: T as never }, s, () => [1], { prompt: "x", size: 64, xl: { pooled: "nope" } })).rejects.toThrow(/no nope output/);
  });

  test("loads the picker record by id through the hub and runs the sdxl form", async () => {
    const rec = IMAGEGEN_PICKER_RECORDS[0]!;
    expect(formOf(rec)).toMatchObject({ pipeline: "sdxl", graphs: { textEncoder2: "text_encoder_2_model_q4f16" } });
    expect(rec.source.files!.map((f) => f.path)).toContain("onnx/unet_model_q4f16.onnx");
    const { s, feeds } = fakes(true);
    const hub = createHub({ registry: createRegistry(), env });
    hub.provide("ort", async () => ({
      ort: { Tensor: T },
      sessions: { text_encoder_model_q4f16: s.textEncoder, text_encoder_2_model_q4f16: s.textEncoder2, unet_model_q4f16: s.unet, vae_decoder_model_q4f16: s.vaeDecoder },
    }));
    const gen = await loadImagegen(hub, { id: "sdxl-turbo" });
    expect(gen.sessions.textEncoder2).toBe(s.textEncoder2);
    await expect(gen.generate(() => [49406, 49407], { prompt: "x", size: 64 })).rejects.toThrow(/512 pixel/);
    // a 512 run on fakes is slow only in the vae buffer; check the feeds instead
    const img = await gen.generate(() => [49406, 49407], { prompt: "x" });
    expect(img.width).toBe(512);
    expect(feeds.unet![0]!.sample!.type).toBe("float16");
    gen.release();
  });
});

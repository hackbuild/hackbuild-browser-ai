import { describe, expect, test } from "vitest";
import { IMAGEGEN_RECORDS, euler, eulerPlan, gaussian, generate, mulberry32, padIds, sigmas, toRgba, trailingTimesteps, type SessionLike } from "@hackbuild/imagegen";

describe("scheduler", () => {
  test("scaled linear sigmas end near 14.6146", () => {
    const s = sigmas();
    expect(s[999]).toBeCloseTo(14.6146, 3);
    expect(s[0]).toBeCloseTo(Math.sqrt(0.00085 / (1 - 0.00085)), 9);
  });
  test("trailing timesteps", () => {
    expect(trailingTimesteps(1)).toEqual([999]);
    expect(trailingTimesteps(4)).toEqual([999, 749, 499, 249]);
    expect(eulerPlan(2).sigmas.at(-1)).toBe(0);
  });
  test("seeded noise repeats and looks standard normal", () => {
    const a = gaussian(mulberry32(7));
    const b = gaussian(mulberry32(7));
    const xs = Array.from({ length: 20000 }, () => a());
    expect(xs.slice(0, 5)).toEqual(Array.from({ length: 5 }, () => b()));
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    const v = xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
    expect(Math.abs(mean)).toBeLessThan(0.03);
    expect(v).toBeCloseTo(1, 1);
  });
  test("an exact noise prediction lands on zero in one step", async () => {
    const plan = eulerPlan(1);
    const x0 = Float32Array.from([1, -2, 3]).map((v) => v * plan.sigmas[0]!);
    const sigma = plan.sigmas[0]!;
    // eps = latent / sigma exactly, given the scaled input
    const out = await euler(x0, plan, async (scaled) => scaled.map((v) => (v * Math.sqrt(sigma * sigma + 1)) / sigma));
    for (const v of out) expect(Math.abs(v)).toBeLessThan(1e-4);
  });
});

test("ids pad with the last token to 77", () => {
  const p = padIds([49406, 320, 49407]);
  expect(p.length).toBe(77);
  expect([...p.slice(0, 4)]).toEqual([49406, 320, 49407, 49407]);
});

test("rgba from nchw", () => {
  const px = toRgba(Float32Array.from([-1, 1, 0, 0, 1, -1]), 2, 1);
  expect([...px]).toEqual([0, 128, 255, 255, 255, 128, 0, 255]);
});

describe("generate", () => {
  class T {
    constructor(
      public type: string,
      public data: Float32Array | Int32Array | BigInt64Array,
      public dims: number[],
    ) {}
  }
  const fakes = () => {
    const calls: string[] = [];
    const sessions: Record<string, SessionLike> = {
      textEncoder: { run: async (f) => (calls.push(`te ${(f.input_ids as T).dims}`), { last_hidden_state: { data: new Float32Array(77 * 4), dims: [1, 77, 4] } }) },
      unet: {
        run: async (f) => {
          const s = f.sample as T;
          calls.push(`unet ${(f.timestep as T).data[0]} ${s.dims}`);
          return { out_sample: { data: new Float32Array(s.data.length) } };
        },
      },
      vaeDecoder: { run: async (f) => (calls.push(`vae ${(f.latent_sample as T).dims}`), { sample: { data: new Float32Array(3 * 64 * 64) } }) },
    };
    return { calls, sessions: sessions as never };
  };

  test("runs text, unet per step and vae with the shapes of a 64 pixel image, inside run()", async () => {
    const f = fakes();
    let wrapped = 0;
    const out = await generate({ Tensor: T }, f.sessions, () => [49406, 320, 49407], {
      prompt: "a mug on a shelf",
      steps: 2,
      size: 64,
      seed: 3,
      run: (fn) => (wrapped++, fn()),
    });
    expect(f.calls).toEqual(["te 1,77", "unet 999 1,4,8,8", "unet 499 1,4,8,8", "vae 1,4,8,8"]);
    expect(wrapped).toBe(4);
    expect(out.rgba.length).toBe(64 * 64 * 4);
    expect(out.rgba[0]).toBe(128);
  });

  test("the same seed gives the same latent into the vae", async () => {
    const grab = async (seed: number) => {
      let got: Float32Array | null = null;
      const s = fakes().sessions as unknown as Record<string, SessionLike>;
      s.vaeDecoder = { run: async (f) => ((got = (f.latent_sample as T).data as Float32Array), { sample: { data: new Float32Array(3 * 64) } }) };
      await generate({ Tensor: T }, s as never, () => [1], { prompt: "x", size: 8, seed });
      return got!;
    };
    expect([...(await grab(5))]).toEqual([...(await grab(5))]);
    expect([...(await grab(5))]).not.toEqual([...(await grab(6))]);
  });

  test("stops when aborted", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(generate({ Tensor: T }, fakes().sessions, () => [1], { prompt: "x", size: 8, signal: ac.signal })).rejects.toThrow(/stopped/);
  });
});

test("the record names its weight licence", () => {
  expect(IMAGEGEN_RECORDS[0]!.licence).toMatch(/Stability AI/);
});

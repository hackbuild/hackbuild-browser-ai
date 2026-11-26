/**
 * SDXL-Turbo text to image, written from the published SDXL description:
 * two CLIP text encoders whose penultimate hidden states are joined on the
 * channel axis (768 plus 1280, 2048 wide), the second encoder's pooled
 * projection as `text_embeds`, six `time_ids` (original size, crop top
 * left, target size), the same Euler loop as SD-Turbo on trailing
 * timesteps, and the latent divided by 0.13025 into the VAE decoder.
 * Exports that keep fp16 inputs and outputs (the WebNN SDXL-Turbo build)
 * take `io: "float16"`; tensors are converted at the graph edge.
 */

import { padIds, toRgba, type ClipTokenize, type Generated, type GenerateOptions, type OrtLike, type SessionLike } from "./pipeline.js";
import { euler, eulerPlan, gaussian, mulberry32 } from "./schedule.js";

/** The four graphs of an SDXL export: two text encoders, the UNet and the VAE decoder. */
export interface XlSessions {
  textEncoder: SessionLike;
  textEncoder2: SessionLike;
  unet: SessionLike;
  vaeDecoder: SessionLike;
}

/** Input and output names and dtypes of an SDXL export; {@link XL_IO} holds the defaults. */
export interface XlIo {
  /** Float tensor dtype at every graph edge. */
  io: "float32" | "float16";
  /** UNet timestep dtype. */
  timestep: "int64" | "float32" | "float16";
  /** Hidden state output of the first encoder; the penultimate layer of 12. */
  hidden1: string;
  /** Hidden state output of the second encoder; the penultimate layer of 32. */
  hidden2: string;
  /** Pooled projection output of the second encoder. */
  pooled: string;
  /** Token id the second tokenizer pads with after the end token: 0, the exclamation mark token. */
  pad2: number;
  /** The SDXL VAE latent scale. */
  vaeScale: number;
}

/** SDXL defaults: fp32 edges, int64 timestep, `hidden_states.11`, `hidden_states.31`, `text_embeds`, pad 0, scale 0.13025. */
export const XL_IO: Readonly<XlIo> = {
  io: "float32",
  timestep: "int64",
  hidden1: "hidden_states.11",
  hidden2: "hidden_states.31",
  pooled: "text_embeds",
  pad2: 0,
  vaeScale: 0.13025,
};

/** The CLIP end of text token. */
const EOT = 49407;

/** Float32 to IEEE 754 half bits, round to nearest even. */
export function toHalf(f: ArrayLike<number>): Uint16Array {
  const out = new Uint16Array(f.length);
  const b = new Float32Array(1);
  const u = new Uint32Array(b.buffer);
  for (let i = 0; i < f.length; i++) {
    b[0] = f[i]!;
    const x = u[0]!;
    const sign = (x >>> 16) & 0x8000;
    const exp = (x >>> 23) & 0xff;
    let mant = x & 0x7fffff;
    if (exp === 0xff) {
      out[i] = sign | 0x7c00 | (mant ? 0x200 : 0);
      continue;
    }
    const e = exp - 127 + 15;
    if (e >= 31) {
      out[i] = sign | 0x7c00;
      continue;
    }
    if (e <= 0) {
      if (e < -10) {
        out[i] = sign;
        continue;
      }
      mant |= 0x800000;
      const shift = 14 - e;
      let h = mant >>> shift;
      const rem = mant & ((1 << shift) - 1);
      const half = 1 << (shift - 1);
      if (rem > half || (rem === half && h & 1)) h++;
      out[i] = sign | h;
      continue;
    }
    let h = (e << 10) | (mant >>> 13);
    const rem = mant & 0x1fff;
    if (rem > 0x1000 || (rem === 0x1000 && h & 1)) h++;
    out[i] = sign | h;
  }
  return out;
}

/** IEEE 754 half bits to float32. */
export function fromHalf(h: ArrayLike<number>): Float32Array {
  const out = new Float32Array(h.length);
  for (let i = 0; i < h.length; i++) {
    const v = h[i]!;
    const s = v & 0x8000 ? -1 : 1;
    const e = (v >>> 10) & 0x1f;
    const m = v & 0x3ff;
    out[i] = e === 0 ? s * m * 2 ** -24 : e === 31 ? (m ? NaN : s * Infinity) : s * (1 + m / 1024) * 2 ** (e - 15);
  }
  return out;
}

type Out = { data: ArrayLike<number>; dims?: readonly number[]; type?: string };

/** An output's floats; fp16 outputs (type "float16" or Uint16Array data) are decoded. */
export function floatsOf(t: Out): Float32Array {
  if (t.type === "float16" || t.data instanceof Uint16Array) return fromHalf(t.data);
  return Float32Array.from(t.data);
}

/** CLIP ids for the second encoder: up to the first end token, then `pad` to 77. */
export function padIds2(ids: ArrayLike<number>, pad = 0): Int32Array {
  const list = Array.from(ids);
  const end = list.indexOf(EOT);
  return padIds(end >= 0 ? list.slice(0, end + 1) : list, 77, pad);
}

function pick(outs: Record<string, Out>, name: string, fallback: string[], what: string): Out {
  for (const n of [name, ...fallback]) if (outs[n]) return outs[n]!;
  throw new Error(`${what}: no ${name} output; the graph gives ${Object.keys(outs).join(", ") || "none"}`);
}

/**
 * SDXL-Turbo text to image: both encoders, the joined hidden states and
 * pooled embedding, the seeded Euler loop with `text_embeds` and
 * `time_ids` on every UNet call, then the VAE. Guidance above 1 runs the
 * UNet on the negative too. Throws when `size` is not a multiple of 8.
 */
export async function generateXl(ort: OrtLike, s: XlSessions, tokenize: ClipTokenize, o: GenerateOptions & { xl?: Partial<XlIo> }): Promise<Generated> {
  const io: XlIo = { ...XL_IO, ...(o.xl ?? {}) };
  const now = o.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
  const run = o.run ?? (<T>(fn: () => Promise<T>) => fn());
  const steps = Math.max(1, Math.min(50, o.steps ?? 1));
  const guidance = o.guidance ?? 1;
  const seed = (o.seed ?? 0) >>> 0;
  const size = o.size ?? 512;
  if (size % 8) throw new Error("size must be a multiple of 8");
  const lw = size / 8;
  const n = 4 * lw * lw;
  const ms = { text: 0, unet: 0, vae: 0 };
  const T = ort.Tensor as unknown as new (type: string, data: unknown, dims: number[]) => unknown;
  const float = (data: Float32Array, dims: number[]) => (io.io === "float16" ? new T("float16", toHalf(data), dims) : new T("float32", data, dims));

  let t = now();
  const encode = async (text: string) => {
    const ids = await tokenize(text.length ? text : " ");
    const a = await run(() => s.textEncoder.run({ input_ids: new ort.Tensor("int32", padIds(ids), [1, 77]) }));
    const b = await run(() => s.textEncoder2.run({ input_ids: new ort.Tensor("int32", padIds2(ids, io.pad2), [1, 77]) }));
    const h1 = floatsOf(pick(a, io.hidden1, ["last_hidden_state"], "text encoder"));
    const h2 = floatsOf(pick(b, io.hidden2, ["last_hidden_state"], "text encoder 2"));
    const pooled = floatsOf(pick(b, io.pooled, ["pooler_output"], "text encoder 2"));
    const w1 = h1.length / 77;
    const w2 = h2.length / 77;
    const joined = new Float32Array(77 * (w1 + w2));
    for (let i = 0; i < 77; i++) {
      joined.set(h1.subarray(i * w1, (i + 1) * w1), i * (w1 + w2));
      joined.set(h2.subarray(i * w2, (i + 1) * w2), i * (w1 + w2) + w1);
    }
    return { hidden: float(joined, [1, 77, w1 + w2]), pooled: float(pooled, [1, pooled.length]) };
  };
  const cond = await encode(o.prompt);
  const uncond = guidance > 1 ? await encode(o.negative ?? "") : null;
  ms.text = now() - t;
  o.onStep?.({ stage: "text", step: 0, steps, ms: ms.text });

  const timeIds = float(Float32Array.from([size, size, 0, 0, size, size]), [1, 6]);
  const stepTensor = (ts: number) =>
    io.timestep === "int64" ? new ort.Tensor("int64", BigInt64Array.from([BigInt(ts)]), [1]) : float(Float32Array.from([ts]), [1]);
  const plan = eulerPlan(steps, o.spacing ?? "trailing");
  const randn = gaussian(o.rng ?? mulberry32(seed));
  const latent = new Float32Array(n);
  const s0 = plan.sigmas[0]!;
  const init = o.spacing === "leading" ? Math.sqrt(s0 * s0 + 1) : s0;
  for (let i = 0; i < n; i++) latent[i] = randn() * init;

  const final = await euler(
    latent,
    plan,
    async (scaled, timestep, step) => {
      const t0 = now();
      const unet = async (c: { hidden: unknown; pooled: unknown }) => {
        const u = await run(() =>
          s.unet.run({ sample: float(scaled, [1, 4, lw, lw]), timestep: stepTensor(timestep), encoder_hidden_states: c.hidden, text_embeds: c.pooled, time_ids: timeIds }),
        );
        return floatsOf(u.out_sample ?? Object.values(u)[0]!);
      };
      const c = await unet(cond);
      let e: Float32Array = c;
      if (uncond) {
        const u = await unet(uncond);
        e = new Float32Array(c.length);
        for (let i = 0; i < e.length; i++) e[i] = u[i]! + guidance * (c[i]! - u[i]!);
      }
      const d = now() - t0;
      ms.unet += d;
      o.onStep?.({ stage: "denoise", step: step + 1, steps, ms: d });
      return e;
    },
    o.signal,
  );

  t = now();
  const vin = new Float32Array(n);
  for (let i = 0; i < n; i++) vin[i] = final[i]! / io.vaeScale;
  const v = await run(() => s.vaeDecoder.run({ latent_sample: float(vin, [1, 4, lw, lw]) }));
  ms.vae = now() - t;
  o.onStep?.({ stage: "decode", step: steps, steps, ms: ms.vae });
  return { width: size, height: size, rgba: toRgba(floatsOf(v.sample ?? Object.values(v)[0]!), size, size), seed, ms };
}

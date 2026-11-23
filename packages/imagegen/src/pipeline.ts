/**
 * SD-Turbo text to image on onnxruntime-web: CLIP token ids into the text
 * encoder, the Euler loop over the UNet, the latent divided by 0.18215
 * into the VAE decoder, and the [-1, 1] NCHW output to RGBA. The caller
 * brings the ort module, the three sessions (weights through
 * @hackbuild/weights) and a tokenizer; the hub's run() wraps each graph
 * call so the gpu lock and frame budget apply.
 */

import { euler, eulerPlan, gaussian, mulberry32, type Rng } from "./schedule.js";

export interface OrtLike {
  Tensor: new (type: string, data: Float32Array | Int32Array | BigInt64Array, dims: number[]) => unknown;
}
export interface SessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number>; dims?: readonly number[] }>>;
}

export interface Sessions {
  textEncoder: SessionLike;
  unet: SessionLike;
  vaeDecoder: SessionLike;
}

/** Prompt to CLIP ids, padded or cut to 77 (transformers.js AutoTokenizer for Xenova/clip-vit-base-patch16 fits). */
export type ClipTokenize = (prompt: string) => Promise<ArrayLike<number>> | ArrayLike<number>;

export interface GenerateOptions {
  prompt: string;
  /** SD-Turbo is distilled for 1 to 4 steps. Default 1. */
  steps?: number;
  seed?: number;
  /** Replaces the seeded noise source. */
  rng?: Rng;
  /** Output side in pixels, a multiple of 8. Default 512. */
  size?: number;
  signal?: AbortSignal;
  /** Wraps each graph call, e.g. (fn) => hub.run(loaded, () => fn(), { frameBudgetMs: 12 }). */
  run?: <T>(fn: () => Promise<T>) => Promise<T>;
  onStep?: (p: { stage: "text" | "denoise" | "decode"; step: number; steps: number; ms: number }) => void;
  now?: () => number;
}

export interface Generated {
  width: number;
  height: number;
  /** RGBA, ready for new ImageData(rgba, width, height). */
  rgba: Uint8ClampedArray;
  seed: number;
  ms: { text: number; unet: number; vae: number };
}

export const VAE_SCALE = 0.18215;

/** NCHW floats in [-1, 1] to RGBA bytes. */
export function toRgba(nchw: ArrayLike<number>, w: number, h: number): Uint8ClampedArray {
  const out = new Uint8ClampedArray(w * h * 4);
  const plane = w * h;
  for (let i = 0; i < plane; i++) {
    for (let c = 0; c < 3; c++) out[i * 4 + c] = Math.round(((nchw[c * plane + i]! + 1) / 2) * 255);
    out[i * 4 + 3] = 255;
  }
  return out;
}

export function padIds(ids: ArrayLike<number>, n = 77, pad?: number): Int32Array {
  const out = new Int32Array(n);
  const last = ids.length ? ids[ids.length - 1]! : 0;
  out.fill(pad ?? last);
  for (let i = 0; i < Math.min(n, ids.length); i++) out[i] = ids[i]!;
  return out;
}

export async function generate(ort: OrtLike, s: Sessions, tokenize: ClipTokenize, o: GenerateOptions): Promise<Generated> {
  const now = o.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
  const run = o.run ?? (<T>(fn: () => Promise<T>) => fn());
  const steps = Math.max(1, Math.min(8, o.steps ?? 1));
  const seed = (o.seed ?? 0) >>> 0;
  const size = o.size ?? 512;
  if (size % 8) throw new Error("size must be a multiple of 8");
  const lw = size / 8;
  const n = 4 * lw * lw;
  const ms = { text: 0, unet: 0, vae: 0 };

  let t = now();
  const ids = padIds(await tokenize(o.prompt.length ? o.prompt : " "));
  const te = await run(() => s.textEncoder.run({ input_ids: new ort.Tensor("int32", ids, [1, 77]) }));
  const hidden = te.last_hidden_state ?? Object.values(te)[0]!;
  ms.text = now() - t;
  o.onStep?.({ stage: "text", step: 0, steps, ms: ms.text });
  const hiddenTensor = new ort.Tensor("float32", Float32Array.from(hidden.data), [...(hidden.dims ?? [1, 77, hidden.data.length / 77])]);

  const plan = eulerPlan(steps);
  const randn = gaussian(o.rng ?? mulberry32(seed));
  const latent = new Float32Array(n);
  for (let i = 0; i < n; i++) latent[i] = randn() * plan.sigmas[0]!;

  const final = await euler(
    latent,
    plan,
    async (scaled, timestep, step) => {
      const t0 = now();
      const u = await run(() =>
        s.unet.run({
          sample: new ort.Tensor("float32", scaled, [1, 4, lw, lw]),
          timestep: new ort.Tensor("int64", BigInt64Array.from([BigInt(timestep)]), [1]),
          encoder_hidden_states: hiddenTensor,
        }),
      );
      const d = now() - t0;
      ms.unet += d;
      o.onStep?.({ stage: "denoise", step: step + 1, steps, ms: d });
      return (u.out_sample ?? Object.values(u)[0]!).data;
    },
    o.signal,
  );

  t = now();
  const vin = new Float32Array(n);
  for (let i = 0; i < n; i++) vin[i] = final[i]! / VAE_SCALE;
  const v = await run(() => s.vaeDecoder.run({ latent_sample: new ort.Tensor("float32", vin, [1, 4, lw, lw]) }));
  ms.vae = now() - t;
  o.onStep?.({ stage: "decode", step: steps, steps, ms: ms.vae });
  return { width: size, height: size, rgba: toRgba((v.sample ?? Object.values(v)[0]!).data, size, size), seed, ms };
}

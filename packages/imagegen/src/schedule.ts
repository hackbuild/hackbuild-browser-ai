/**
 * The sampler SD-Turbo is distilled for, written from the published
 * diffusers description: 1000 step scaled linear betas (0.00085 to
 * 0.012), sigma = sqrt((1 - alphaBar) / alphaBar), trailing timestep
 * spacing, and an Euler step on epsilon. Noise comes from a seeded
 * mulberry32 through Box-Muller, so the same seed gives the same image on
 * the same runtime.
 */

export type Rng = () => number;

/** Sigma for each of the 1000 training timesteps. sigmas()[999] is about 14.6146 (computed). */
export function sigmas(n = 1000, betaStart = 0.00085, betaEnd = 0.012): Float64Array {
  const sb = Math.sqrt(betaStart);
  const se = Math.sqrt(betaEnd);
  const out = new Float64Array(n);
  let cum = 1;
  for (let i = 0; i < n; i++) {
    const beta = (sb + ((se - sb) * i) / (n - 1)) ** 2;
    cum *= 1 - beta;
    out[i] = Math.sqrt((1 - cum) / cum);
  }
  return out;
}

/** Trailing spacing: 1 step is [999], 4 steps are [999, 749, 499, 249]. */
export function trailingTimesteps(steps: number, train = 1000): number[] {
  const ratio = train / steps;
  const out: number[] = [];
  for (let t = train; t > 0.5 && out.length < steps; t -= ratio) out.push(Math.round(t) - 1);
  return out;
}

/** mulberry32: a 32 bit seeded generator in [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal samples by Box-Muller over a uniform source. */
export function gaussian(rng: Rng): Rng {
  return () => {
    const u = 1 - rng();
    const v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export interface EulerPlan {
  timesteps: number[];
  /** One more than timesteps; the last is 0. */
  sigmas: number[];
}

export function eulerPlan(steps: number): EulerPlan {
  const all = sigmas();
  const timesteps = trailingTimesteps(steps);
  return { timesteps, sigmas: [...timesteps.map((t) => all[t]!), 0] };
}

/**
 * Run the Euler loop. `eps(scaled, timestep)` is the UNet: it receives the
 * latent divided by sqrt(sigma^2 + 1) and returns predicted noise; the
 * step is latent += eps * (sigmaNext - sigma).
 */
export async function euler(
  latent: Float32Array,
  plan: EulerPlan,
  eps: (scaled: Float32Array, timestep: number, step: number) => Promise<ArrayLike<number>>,
  signal?: AbortSignal,
): Promise<Float32Array> {
  let x = latent;
  for (let s = 0; s < plan.timesteps.length; s++) {
    if (signal?.aborted) throw new DOMException("image generation stopped", "AbortError");
    const sigma = plan.sigmas[s]!;
    const next = plan.sigmas[s + 1]!;
    const div = Math.sqrt(sigma * sigma + 1);
    const scaled = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) scaled[i] = x[i]! / div;
    const e = await eps(scaled, plan.timesteps[s]!, s);
    const dt = next - sigma;
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = x[i]! + e[i]! * dt;
    x = y;
  }
  return x;
}

/**
 * Voice clone reference preparation: mono in, linear resample to 24 kHz,
 * cut to 15 s, peak normalized to 0.9 (earlier builds' settings). The
 * reference audio is always the caller's; this package ships none.
 */

export interface CloneOptions {
  rate?: number;
  seconds?: number;
  peak?: number;
}

/** Average channels to mono. */
export function toMono(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0]!;
  const n = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(n);
  for (const c of channels) for (let i = 0; i < n; i++) out[i]! += c[i]! / channels.length;
  return out;
}

export function prepareClone(samples: Float32Array, rate: number, o: CloneOptions = {}): Float32Array {
  const dst = o.rate ?? 24000;
  const maxN = Math.round((o.seconds ?? 15) * dst);
  const n = Math.min(maxN, Math.floor((samples.length * dst) / rate));
  const out = new Float32Array(n);
  const step = rate / dst;
  for (let i = 0; i < n; i++) {
    const x = i * step;
    const a = Math.floor(x);
    const f = x - a;
    out[i] = (samples[a] ?? 0) * (1 - f) + (samples[Math.min(a + 1, samples.length - 1)] ?? 0) * f;
  }
  let peak = 0;
  for (const v of out) peak = Math.max(peak, Math.abs(v));
  if (peak > 0) {
    const g = (o.peak ?? 0.9) / peak;
    for (let i = 0; i < n; i++) out[i]! *= g;
  }
  return out;
}

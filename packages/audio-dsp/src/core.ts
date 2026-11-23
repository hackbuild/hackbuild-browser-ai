// Loads the hackbuild-audio-dsp wasm core and wraps its extern "C" surface.
// Every method copies its input into wasm memory, runs one kernel and
// copies the result out, so callers keep plain Float32Arrays.

export type CoreSource = { url: string | URL } | { bytes: ArrayBuffer | Uint8Array } | { base64: string };

type Ptr = number;
interface Exports {
  memory: WebAssembly.Memory;
  ad_alloc(len: number): Ptr;
  ad_free(ptr: Ptr, len: number): void;
  ad_out_ptr(): Ptr;
  ad_simd(): number;
  ad_dc_block(x: Ptr, n: number, out: Ptr): void;
  ad_biquad_coef(k: number, fc: number, fs: number, q: number): number;
  ad_biquad(x: Ptr, n: number, k: number, fc: number, fs: number, q: number, out: Ptr): void;
  ad_frame_count(n: number, frame: number, hop: number): number;
  ad_frame_db(x: Ptr, n: number, hop: number, frame: number, out: Ptr): void;
  ad_percentile(x: Ptr, n: number, q: number): number;
  ad_noise_floor(x: Ptr, n: number, win: number): number;
  ad_envelope_peak(x: Ptr, n: number, out: Ptr, m: number): void;
  ad_envelope_rms(x: Ptr, n: number, hop: number, out: Ptr): void;
  ad_noise_spectrum(sig: Ptr, n: number, db: Ptr, nd: number, floor: number, w: number, hop: number, out: Ptr): number;
  ad_denoise(x: Ptr, n: number, noise: Ptr, alpha: number, gFloor: number, w: number, h: number, out: Ptr): void;
  ad_limit(x: Ptr, n: number, ceil: number, sr: number): void;
  ad_resample_len(n: number, src: number, dst: number): number;
  ad_resample_linear(x: Ptr, n: number, src: number, dst: number, out: Ptr, m: number): void;
  ad_resample_sinc(x: Ptr, n: number, src: number, dst: number, zeros: number, out: Ptr, m: number): void;
  ad_decimate(x: Ptr, n: number, factor: number, taps: number, cutoff: number, sr: number, out: Ptr): void;
  ad_stft_frames(n: number, w: number, hop: number): number;
  ad_stft_mag(x: Ptr, n: number, w: number, hop: number, out: Ptr): number;
  ad_pick_onsets(env: Ptr, n: number, fps: number, gap: number, sens: number, gate: number): number;
  ad_estimate_tempo(env: Ptr, n: number, fps: number): void;
  ad_fit_grid(t: Ptr, w: Ptr, n: number): number;
  ad_synth(seed: number, n: number, sr: number, out: Ptr): void;
  ad_sin(x: number): number;
  ad_cos(x: number): number;
  ad_exp(x: number): number;
  ad_ln(x: number): number;
  ad_atan2(y: number, x: number): number;
  ad_formants(x: Ptr, n: number, sr: number, center: number, winSec: number, decim: number, order: number): number;
  ad_vowel(n: number, sr: number, f0: number, f1: number, f2: number, f3: number, out: Ptr): void;
}

export type FilterKind = "highpass" | "lowpass" | "bandpass";
const KIND: Record<FilterKind, number> = { highpass: 0, lowpass: 1, bandpass: 2 };

/** One resonance: centre frequency and bandwidth, Hz. */
export interface Formant {
  f: number;
  bw: number;
}

export interface Onset {
  /** Frame of the attack foot. */
  frame: number;
  /** Frame of the novelty peak. */
  peak: number;
  strength: number;
}

function b64(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(s, "base64"));
}

async function bytesOf(src: CoreSource): Promise<Uint8Array> {
  if ("bytes" in src) return src.bytes instanceof Uint8Array ? src.bytes : new Uint8Array(src.bytes);
  if ("base64" in src) return b64(src.base64);
  const r = await fetch(src.url);
  if (!r.ok) throw new Error(`audio-dsp wasm: http ${r.status} for ${String(src.url)}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** The DSP kernels. Sample rates in Hz, times in seconds. */
export class Dsp {
  /** True when the wasm build runs its sums on simd128 lanes. */
  readonly simd: boolean;
  constructor(private readonly x: Exports) {
    this.simd = x.ad_simd() === 1;
  }

  private put(a: Float32Array | Float64Array): Ptr {
    const p = this.x.ad_alloc(a.byteLength);
    const view = a instanceof Float32Array ? new Float32Array(this.x.memory.buffer, p, a.length) : new Float64Array(this.x.memory.buffer, p, a.length);
    view.set(a as never);
    return p;
  }
  private take(p: Ptr, n: number): Float32Array {
    return new Float32Array(this.x.memory.buffer, p, n).slice();
  }
  private out(n: number): Float64Array {
    return new Float64Array(this.x.memory.buffer, this.x.ad_out_ptr(), n).slice();
  }
  private free(p: Ptr, bytes: number): void {
    this.x.ad_free(p, bytes);
  }
  /** Run a kernel on x writing m f32 values; the input and output buffers are freed after. */
  private map(x: Float32Array, m: number, run: (px: Ptr, po: Ptr) => void): Float32Array {
    const px = this.put(x);
    const po = this.x.ad_alloc(m * 4);
    try {
      run(px, po);
      return this.take(po, m);
    } finally {
      this.free(px, x.byteLength);
      this.free(po, m * 4);
    }
  }

  dcBlock(x: Float32Array): Float32Array {
    return this.map(x, x.length, (a, b) => this.x.ad_dc_block(a, x.length, b));
  }
  /** b0, b1, b2, a1, a2 normalized by a0 (RBJ cookbook). */
  biquadCoef(kind: FilterKind, fc: number, sr: number, q = 0.707): number[] {
    this.x.ad_biquad_coef(KIND[kind], fc, sr, q);
    return [...this.out(5)];
  }
  biquad(x: Float32Array, kind: FilterKind, fc: number, sr: number, q = 0.707): Float32Array {
    return this.map(x, x.length, (a, b) => this.x.ad_biquad(a, x.length, KIND[kind], fc, sr, q, b));
  }
  frameCount(n: number, frame: number, hop: number): number {
    return this.x.ad_frame_count(n, frame, hop);
  }
  /** Level per frame in dB; SCRIBE uses 400 sample frames on a 160 sample hop at 16 kHz. */
  frameDb(x: Float32Array, hop = 160, frame = 400): Float32Array {
    const m = this.frameCount(x.length, frame, hop);
    return this.map(x, m, (a, b) => this.x.ad_frame_db(a, x.length, hop, frame, b));
  }
  percentile(x: Float32Array, q: number): number {
    const p = this.put(x);
    try {
      return this.x.ad_percentile(p, x.length, q);
    } finally {
      this.free(p, x.byteLength);
    }
  }
  /** Median of window minima (150 frames is 1.5 s at a 10 ms hop). */
  noiseFloor(db: Float32Array, win = 150): number {
    const p = this.put(db);
    try {
      return this.x.ad_noise_floor(p, db.length, win);
    } finally {
      this.free(p, db.byteLength);
    }
  }
  envelopePeak(x: Float32Array, n: number): Float32Array {
    return this.map(x, n, (a, b) => this.x.ad_envelope_peak(a, x.length, b, n));
  }
  envelopeRms(x: Float32Array, hop: number): Float32Array {
    const m = Math.floor(x.length / hop);
    return this.map(x, m, (a, b) => this.x.ad_envelope_rms(a, x.length, hop, b));
  }
  /** Median magnitude of quiet frames, or null when no frame fits. */
  noiseSpectrum(sig: Float32Array, db: Float32Array, floorDb: number, w = 512, frameHop = 160): Float32Array | null {
    const bins = (w >> 1) + 1;
    const pd = this.put(db);
    try {
      let got = 0;
      const r = this.map(sig, bins, (a, b) => {
        got = this.x.ad_noise_spectrum(a, sig.length, pd, db.length, floorDb, w, frameHop, b);
      });
      return got ? r : null;
    } finally {
      this.free(pd, db.byteLength);
    }
  }
  /** Spectral subtraction; SCRIBE strengths: alpha 1.2, 1.8, 2.6 with gain floors 0.15, 0.08, 0.04. */
  denoise(x: Float32Array, noise: Float32Array, alpha: number, gFloor: number, w = 512, hop = 256): Float32Array {
    const pn = this.put(noise);
    try {
      return this.map(x, x.length, (a, b) => this.x.ad_denoise(a, x.length, pn, alpha, gFloor, w, hop, b));
    } finally {
      this.free(pn, noise.byteLength);
    }
  }
  /** Lookahead limiter; returns a new array. */
  limit(x: Float32Array, ceil = 0.891, sr = 16000): Float32Array {
    const p = this.put(x);
    try {
      this.x.ad_limit(p, x.length, ceil, sr);
      return this.take(p, x.length);
    } finally {
      this.free(p, x.byteLength);
    }
  }
  resampleLength(n: number, src: number, dst: number): number {
    return this.x.ad_resample_len(n, src, dst);
  }
  /** Windowed sinc by default; "linear" is the SCRIBE August interpolator. */
  resample(x: Float32Array, src: number, dst: number, mode: "sinc" | "linear" = "sinc", zeros = 16): Float32Array {
    if (src === dst) return x.slice();
    const m = this.resampleLength(x.length, src, dst);
    return this.map(x, m, (a, b) =>
      mode === "linear" ? this.x.ad_resample_linear(a, x.length, src, dst, b, m) : this.x.ad_resample_sinc(a, x.length, src, dst, zeros, b, m),
    );
  }
  /** FIR low pass then every factor-th sample (KERF: factor 3, 41 taps, 7 kHz from 48 kHz). */
  decimate(x: Float32Array, factor: number, taps = 41, cutoff = 7000, sr = 48000): Float32Array {
    return this.map(x, Math.floor(x.length / factor), (a, b) => this.x.ad_decimate(a, x.length, factor, taps, cutoff, sr, b));
  }
  /** Hann windowed magnitude frames, row major, w / 2 + 1 bins per frame. */
  stftMag(x: Float32Array, w = 1024, hop = 256): { mag: Float32Array; frames: number; bins: number } {
    const frames = this.x.ad_stft_frames(x.length, w, hop);
    const bins = (w >> 1) + 1;
    return { mag: this.map(x, frames * bins, (a, b) => this.x.ad_stft_mag(a, x.length, w, hop, b)), frames, bins };
  }
  pickOnsets(env: Float32Array, fps: number, minGap = 0.05, sens = 1, gate = 0.1): Onset[] {
    const p = this.put(env);
    try {
      const n = this.x.ad_pick_onsets(p, env.length, fps, minGap, sens, gate);
      const o = this.out(n * 3);
      return Array.from({ length: n }, (_, i) => ({ frame: o[i * 3]!, peak: o[i * 3 + 1]!, strength: o[i * 3 + 2]! }));
    } finally {
      this.free(p, env.byteLength);
    }
  }
  /** bpm by onset autocorrelation over 60 to 200, offset by a 96 step phase search. Not rounded. */
  estimateTempo(env: Float32Array, fps: number): { bpm: number; offset: number } {
    const p = this.put(env);
    try {
      this.x.ad_estimate_tempo(p, env.length, fps);
      const o = this.out(2);
      return { bpm: o[0]!, offset: o[1]! };
    } finally {
      this.free(p, env.byteLength);
    }
  }
  /** Vector strength grid fit over 55 to 208 bpm; null when the weights sum to zero. */
  fitGrid(times: ArrayLike<number>, weights: ArrayLike<number>): { bpm: number; offset: number; r: number } | null {
    const t = Float64Array.from(times);
    const w = Float64Array.from(weights);
    const pt = this.put(t);
    const pw = this.put(w);
    try {
      if (!this.x.ad_fit_grid(pt, pw, t.length)) return null;
      const o = this.out(3);
      return { bpm: o[0]!, offset: o[1]!, r: o[2]! };
    } finally {
      this.free(pt, t.byteLength);
      this.free(pw, w.byteLength);
    }
  }
  /** The seeded test signal the parity fixture uses. */
  synth(seed: number, n: number, sr: number): Float32Array {
    const po = this.x.ad_alloc(n * 4);
    try {
      this.x.ad_synth(seed >>> 0, n, sr, po);
      return this.take(po, n);
    } finally {
      this.free(po, n * 4);
    }
  }
  /**
   * Formants of x around sample index `center` by LPC, ported from
   * bellowsjs estimateFormants (MIT, same owner): decimate, pre-emphasis,
   * Hamming window, Levinson-Durbin, Durand-Kerner roots. Ascending by
   * frequency; poles wider than 700 Hz dropped. Defaults suit an adult
   * voice at 44.1 or 48 kHz.
   */
  formants(x: Float32Array, sr: number, center: number, winSec = 0.04, decim = 4, order = 14): Formant[] {
    const p = this.put(x);
    try {
      const k = this.x.ad_formants(p, x.length, sr, Math.max(0, Math.floor(center)), winSec, decim, order);
      const o = this.out(2 * k);
      const out: Formant[] = [];
      for (let i = 0; i < k; i++) out.push({ f: o[2 * i]!, bw: o[2 * i + 1]! });
      return out;
    } finally {
      this.free(p, x.byteLength);
    }
  }
  /** A test vowel: an impulse train at f0 through three resonators, n samples. */
  vowel(n: number, sr: number, f0: number, f1: number, f2: number, f3: number): Float32Array {
    const po = this.x.ad_alloc(n * 4);
    this.x.ad_vowel(n, sr, f0, f1, f2, f3, po);
    return this.take(po, n);
  }
  /** The core's deterministic math, for parity checks. */
  math(): { sin(x: number): number; cos(x: number): number; exp(x: number): number; ln(x: number): number; atan2(y: number, x: number): number } {
    const x = this.x;
    return { sin: (v) => x.ad_sin(v), cos: (v) => x.ad_cos(v), exp: (v) => x.ad_exp(v), ln: (v) => x.ad_ln(v), atan2: (a, b) => x.ad_atan2(a, b) };
  }
}

/** Instantiate the core from a URL, bytes, or the inlined base64 (`@hackbuild/audio-dsp/inline`). */
export async function loadDsp(src: CoreSource): Promise<Dsp> {
  const bytes = await bytesOf(src);
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
  return new Dsp(instance.exports as unknown as Exports);
}

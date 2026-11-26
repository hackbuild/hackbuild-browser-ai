/**
 * Live segmentation: audio arrives in blocks, is decimated to
 * 16 kHz, and is cut into segments either when a gate closes for 500 ms
 * (squelch mode), at a fixed window (8 s with the squelch off, 2 to 12 s
 * in spirit box mode), or at 24 s, since Whisper pads to 30 s. Segments
 * under 0.7 s are dropped. At most 4 segments wait; later ones are counted
 * as dropped instead of growing a backlog.
 */

export interface LiveOptions {
  /** "squelch": cut when the gate closes; "fixed": cut every windowS. */
  mode?: "squelch" | "fixed";
  windowS?: number;
  minS?: number;
  maxS?: number;
  tailMs?: number;
  /** Segments waiting before new ones are dropped. Default 4. */
  queue?: number;
  /** Input sample rate; 16000 passes through, integer multiples decimate, other rates resample. */
  inputRate?: number;
  /** Clock in ms. */
  now?: () => number;
  onSegment: (seg: { pcm: Float32Array; sec: number; at: number }) => void;
}

/** Hann windowed sinc low pass taps with unit dc gain; cutoff as a fraction of the sample rate. */
export function lowpassTaps(cutoff: number, taps: number): Float64Array {
  const h = new Float64Array(taps);
  const m = (taps - 1) / 2;
  let s = 0;
  for (let i = 0; i < taps; i++) {
    const t = i - m;
    const x = 2 * cutoff * t;
    const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
    h[i] = 2 * cutoff * sinc * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (taps - 1)));
    s += h[i]!;
  }
  for (let i = 0; i < taps; i++) h[i]! /= s;
  return h;
}

/** A streaming FIR decimator that keeps its history across blocks. */
export class StreamDecimator {
  private hist: Float32Array;
  private phase = 0;
  constructor(
    private readonly taps: Float64Array,
    private readonly factor: number,
  ) {
    this.hist = new Float32Array(taps.length - 1);
  }
  process(x: Float32Array): Float32Array {
    const L = this.taps.length;
    const buf = new Float32Array(this.hist.length + x.length);
    buf.set(this.hist);
    buf.set(x, this.hist.length);
    const out: number[] = [];
    let i = this.phase;
    for (; i < x.length; i += this.factor) {
      let s = 0;
      for (let k = 0; k < L; k++) s += buf[i + k]! * this.taps[L - 1 - k]!;
      out.push(s);
    }
    this.phase = i - x.length;
    this.hist = buf.slice(buf.length - (L - 1));
    return Float32Array.from(out);
  }
  reset(): void {
    this.hist.fill(0);
    this.phase = 0;
  }
}

/**
 * A streaming windowed sinc resampler for any rate ratio, so 44.1, 22.05
 * and 24 kHz input reach 16 kHz at the right speed. Zero phase: output
 * sample n sits at input time n * inRate / outRate. The kernel is a Hann
 * windowed sinc with `half` input taps each side, looked up from a table
 * of `phases` fractional offsets with linear interpolation.
 */
export class StreamResampler {
  private hist: Float32Array;
  private pos: number;
  private readonly step: number;
  private readonly table: Float32Array;
  private readonly half: number;
  private readonly phases: number;
  constructor(inRate: number, outRate = 16000, cutoffHz = 7000, half = 16, phases = 256) {
    if (!(inRate > 0) || !(outRate > 0)) throw new RangeError("sample rates must be positive");
    this.step = inRate / outRate;
    this.half = half;
    this.phases = phases;
    const fc = Math.min(cutoffHz, 0.45 * Math.min(inRate, outRate)) / inRate;
    const w = 2 * half;
    this.table = new Float32Array((phases + 1) * w);
    for (let p = 0; p <= phases; p++) {
      const frac = p / phases;
      let s = 0;
      const row = new Float64Array(w);
      for (let j = 0; j < w; j++) {
        // tap j reads input k = floor(pos) - half + 1 + j; d = pos - k
        const d = frac + half - 1 - j;
        const x = 2 * fc * d;
        const sinc = Math.abs(x) < 1e-12 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
        const win = Math.abs(d) >= half ? 0 : 0.5 + 0.5 * Math.cos((Math.PI * d) / half);
        row[j] = sinc * win;
        s += row[j]!;
      }
      for (let j = 0; j < w; j++) this.table[p * w + j] = row[j]! / s;
    }
    this.hist = new Float32Array(half);
    this.pos = half;
  }
  process(x: Float32Array): Float32Array {
    const H = this.half;
    const w = 2 * H;
    const buf = new Float32Array(this.hist.length + x.length);
    buf.set(this.hist);
    buf.set(x, this.hist.length);
    const out: number[] = [];
    let p = this.pos;
    while (Math.floor(p) + H < buf.length) {
      const i0 = Math.floor(p);
      const ph = (p - i0) * this.phases;
      const r = Math.floor(ph);
      const a = ph - r;
      const t0 = r * w;
      const t1 = t0 + w;
      const k0 = i0 - H + 1;
      let s = 0;
      for (let j = 0; j < w; j++) {
        const c = this.table[t0 + j]! + a * (this.table[t1 + j]! - this.table[t0 + j]!);
        s += buf[k0 + j]! * c;
      }
      out.push(s);
      p += this.step;
    }
    const keep = Math.max(0, Math.floor(p) - H + 1);
    this.hist = buf.slice(keep);
    this.pos = p - keep;
    return Float32Array.from(out);
  }
  reset(): void {
    this.hist = new Float32Array(this.half);
    this.pos = this.half;
  }
}

/**
 * The 16 kHz front stage for a microphone rate: null at 16 kHz, the FIR
 * decimator for an integer multiple, else the fractional resampler.
 */
export function toSixteenK(rate: number): { process(x: Float32Array): Float32Array; reset(): void } | null {
  if (!(rate > 0)) throw new RangeError(`bad input rate ${rate}`);
  if (rate === 16000) return null;
  const f = rate / 16000;
  if (Number.isInteger(f)) return new StreamDecimator(lowpassTaps(7000 / rate, 41), f);
  return new StreamResampler(rate);
}

/** Level of a block in dBFS (computed). */
export function blockDb(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return 10 * Math.log10(s / Math.max(1, x.length) + 1e-12);
}

/** Cuts live audio blocks into 16 kHz speech segments, by the gate closing or by a fixed window, and hands each to `onSegment`. */
export class LiveSegmenter {
  private buf: Float32Array;
  private len = 0;
  private open = false;
  private closeT = 0;
  private waiting = 0;
  dropped = 0;
  private readonly dec: ReturnType<typeof toSixteenK>;
  private readonly o: Required<Omit<LiveOptions, "onSegment" | "now">> & Pick<LiveOptions, "onSegment"> & { now: () => number };

  constructor(opts: LiveOptions) {
    this.o = {
      mode: "squelch",
      windowS: 8,
      minS: 0.7,
      maxS: 24,
      tailMs: 500,
      queue: 4,
      inputRate: 16000,
      ...opts,
      now: opts.now ?? (() => Date.now()),
    };
    this.buf = new Float32Array(16000 * (this.o.maxS + 2));
    this.dec = toSixteenK(this.o.inputRate);
  }

  /** Feed a block; `gateOpen` is the squelch or VAD state for it (ignored in fixed mode). */
  push(block: Float32Array, gateOpen = true): void {
    const t = this.o.now();
    const g = this.o.mode === "fixed" ? true : gateOpen;
    if (g && !this.open) {
      this.open = true;
      this.len = 0;
      this.dec?.reset();
    }
    if (!this.open) return;
    const x = this.dec ? this.dec.process(block) : block;
    const put = Math.min(x.length, this.buf.length - this.len);
    this.buf.set(x.subarray(0, put), this.len);
    this.len += put;
    const dur = this.len / 16000;
    if (!g) this.closeT = this.closeT || t;
    else this.closeT = 0;
    const quiet = !g && this.closeT > 0 && t - this.closeT > this.o.tailMs;
    const fixed = this.o.mode === "fixed" && dur >= this.o.windowS;
    if (dur >= this.o.maxS || fixed || quiet) this.cut(t);
  }

  /** Close the current segment now, e.g. when the stream stops. */
  flush(): void {
    if (this.open) this.cut(this.o.now());
  }

  /** Call when a queued segment has been transcribed. */
  done(): void {
    this.waiting = Math.max(0, this.waiting - 1);
  }

  get pending(): number {
    return this.waiting;
  }

  private cut(at: number): void {
    const n = this.len;
    this.open = false;
    this.closeT = 0;
    this.len = 0;
    if (n < 16000 * this.o.minS) return;
    if (this.waiting >= this.o.queue) {
      this.dropped++;
      return;
    }
    this.waiting++;
    this.o.onSegment({ pcm: this.buf.slice(0, n), sec: n / 16000, at });
  }
}

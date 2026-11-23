/**
 * Live segmentation (KERF EARS): audio arrives in blocks, is decimated to
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
  /** Input sample rate; 16000 skips decimation, 48000 decimates by 3. */
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

/** Level of a block in dBFS (computed). */
export function blockDb(x: Float32Array): number {
  let s = 0;
  for (const v of x) s += v * v;
  return 10 * Math.log10(s / Math.max(1, x.length) + 1e-12);
}

export class LiveSegmenter {
  private buf: Float32Array;
  private len = 0;
  private open = false;
  private closeT = 0;
  private waiting = 0;
  dropped = 0;
  private readonly dec: StreamDecimator | null;
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
    const f = Math.round(this.o.inputRate / 16000);
    this.dec = f > 1 ? new StreamDecimator(lowpassTaps(7000 / this.o.inputRate, 41), f) : null;
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

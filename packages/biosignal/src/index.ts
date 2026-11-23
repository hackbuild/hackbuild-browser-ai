// The biosignal wasm core (crates/biosignal) and helpers around it:
// filtering, epoching, covariances per band, training, cross validation
// folded by trial, and a JSON model export. From an earlier biosignal build.

export type CoreSource = { url: string | URL } | { bytes: ArrayBuffer | Uint8Array } | { base64: string };

type Ptr = number;
interface Exports {
  memory: WebAssembly.Memory;
  bs_alloc(n: number): Ptr;
  bs_free(p: Ptr, n: number): void;
  bs_out_f64(): Ptr;
  bs_out_f32(): Ptr;
  bs_out_len(): number;
  bs_simd(): number;
  bs_bandpass(x: Ptr, n: number, fs: number, lo: number, hi: number, notch: number, out: Ptr): void;
  bs_cov(x: Ptr, c: number, t: number, shrink: number): void;
  bs_tangent(c: Ptr, p: Ptr, n: number): void;
  bs_distance(a: Ptr, b: Ptr, n: number): number;
  bs_fit(covs: Ptr, n: number, bands: number, c: number, y: Ptr, k: number, l2: number, epochs: number, lr: number): number;
  bs_proba(h: number, covs: Ptr): number;
  bs_export(h: number): number;
  bs_import(v: Ptr, n: number): number;
  bs_drop(h: number): void;
  bs_cv(covs: Ptr, n: number, bands: number, c: number, y: Ptr, trials: Ptr, k: number, folds: number, byTrial: number, seed: number, l2: number, epochs: number, lr: number): void;
  bs_synth(seed: number, c: number, t: number, fs: number, hz: number, trials: number, per: number): number;
}

/** A window: c channels by t samples, row major. */
export interface Epoch {
  data: Float32Array;
  channels: number;
  samples: number;
  label: number;
  /** Trial id; windows of one trial stay in one fold. */
  trial: number;
}

export interface Band {
  lo: number;
  hi: number;
}

export interface TrainOptions {
  classes: number;
  l2?: number;
  epochs?: number;
  lr?: number;
}

/** The exported model: plain JSON, loadable with `Biosignal.load`. */
export interface ModelJson {
  kind: "hackbuild-biosignal-riemann";
  version: 1;
  bands: Band[];
  /** Sample rate the model was trained at, Hz. */
  fs: number;
  shrink: number;
  /** Notch frequency, 0 for none. */
  notch: number;
  values: number[];
}

/** Where a neural model (EEGNet on tfjs in an earlier biosignal build) plugs in. Not built here. */
export interface EegNetRunner {
  fit(epochs: readonly Epoch[], classes: number): Promise<void>;
  proba(epoch: Epoch): Promise<number[]>;
  export?(): Promise<Uint8Array>;
}

type Arr = Float32Array | Float64Array | Uint32Array;

function b64(s: string): Uint8Array {
  if (typeof atob === "function") return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  return new Uint8Array((globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(s, "base64"));
}

function checkEpochs(what: string, epochs: readonly Epoch[], bands: readonly Band[], classes: number): void {
  if (!epochs.length) throw new RangeError(`${what}: no epochs`);
  if (!bands.length) throw new RangeError(`${what}: no bands`);
  const c = epochs[0]!.channels;
  for (const e of epochs) {
    if (e.channels !== c || e.data.length !== e.channels * e.samples) throw new RangeError(`${what}: every epoch needs ${c} channels and channels times samples values`);
    if (!(e.label >= 0 && e.label < classes)) throw new RangeError(`${what}: label ${e.label} is outside 0 to ${classes - 1}`);
  }
}

export class Biosignal {
  readonly simd: boolean;
  constructor(private readonly x: Exports) {
    this.simd = x.bs_simd() === 1;
  }
  private with<R>(arrs: Arr[], fn: (...p: Ptr[]) => R): R {
    const ps = arrs.map((a) => {
      const p = this.x.bs_alloc(Math.max(1, a.byteLength));
      new Uint8Array(this.x.memory.buffer, p, a.byteLength).set(new Uint8Array(a.buffer, a.byteOffset, a.byteLength));
      return p;
    });
    try {
      return fn(...ps);
    } finally {
      arrs.forEach((a, i) => this.x.bs_free(ps[i]!, Math.max(1, a.byteLength)));
    }
  }
  private out(n = this.x.bs_out_len()): Float64Array {
    return new Float64Array(this.x.memory.buffer, this.x.bs_out_f64(), n).slice();
  }

  /** Zero phase band pass, with a notch at `notch` Hz and its harmonic when given. */
  bandpass(x: Float32Array, fs: number, lo: number, hi: number, notch = 0): Float32Array {
    const o = new Float32Array(x.length);
    return this.with([x, o], (a, b) => {
      this.x.bs_bandpass(a, x.length, fs, lo, hi, notch, b);
      return new Float32Array(this.x.memory.buffer, b, x.length).slice();
    });
  }
  covariance(data: Float32Array, channels: number, samples: number, shrink = 0.08): Float64Array {
    this.with([data], (p) => this.x.bs_cov(p, channels, samples, shrink));
    return this.out(channels * channels);
  }
  tangent(c: Float64Array, invSqrtRef: Float64Array, n: number): Float64Array {
    this.with([c, invSqrtRef], (a, b) => this.x.bs_tangent(a, b, n));
    return this.out((n * (n + 1)) / 2);
  }
  /** Affine invariant Riemannian distance. */
  distance(a: Float64Array, b: Float64Array, n: number): number {
    return this.with([a, b], (p, q) => this.x.bs_distance(p, q, n));
  }

  /** One covariance per band per epoch, flattened [epoch][band][c][c]. */
  features(epochs: readonly Epoch[], bands: readonly Band[], fs: number, shrink = 0.08, notch = 0): Float64Array {
    const c = epochs[0]?.channels ?? 0;
    const out = new Float64Array(epochs.length * bands.length * c * c);
    epochs.forEach((e, i) =>
      bands.forEach((b, k) => {
        const f = new Float32Array(e.data.length);
        for (let ch = 0; ch < c; ch++) f.set(this.bandpass(e.data.subarray(ch * e.samples, (ch + 1) * e.samples), fs, b.lo, b.hi, notch), ch * e.samples);
        out.set(this.covariance(f, c, e.samples, shrink), (i * bands.length + k) * c * c);
      }),
    );
    return out;
  }

  train(epochs: readonly Epoch[], bands: readonly Band[], fs: number, o: TrainOptions, shrink = 0.08, notch = 0): Classifier {
    checkEpochs("train", epochs, bands, o.classes);
    const c = epochs[0]!.channels;
    const covs = this.features(epochs, bands, fs, shrink, notch);
    const y = Uint32Array.from(epochs, (e) => e.label);
    const h = this.with([covs, y], (p, q) => this.x.bs_fit(p, epochs.length, bands.length, c, q, o.classes, o.l2 ?? 0.05, o.epochs ?? 150, o.lr ?? 0.14));
    return new Classifier(this, this.x, h, bands, fs, shrink, notch, c);
  }

  /**
   * Accuracy per fold. Folds hold whole trials by default, so windows cut
   * from one trial never land on both sides; the reference mean is fitted
   * on the training fold only. `byTrial: false` shows the leaky number.
   */
  crossValidate(epochs: readonly Epoch[], bands: readonly Band[], fs: number, o: TrainOptions & { folds?: number; byTrial?: boolean; seed?: number }, shrink = 0.08, notch = 0): number[] {
    checkEpochs("crossValidate", epochs, bands, o.classes);
    const c = epochs[0]!.channels;
    const covs = this.features(epochs, bands, fs, shrink, notch);
    const y = Uint32Array.from(epochs, (e) => e.label);
    const t = Uint32Array.from(epochs, (e) => e.trial);
    const k = o.folds ?? 5;
    this.with([covs, y, t], (p, q, r) => this.x.bs_cv(p, epochs.length, bands.length, c, q, r, o.classes, k, o.byTrial === false ? 0 : 1, o.seed ?? 1, o.l2 ?? 0.05, o.epochs ?? 150, o.lr ?? 0.14));
    return [...this.out(k)];
  }

  load(m: ModelJson): Classifier {
    if (m.kind !== "hackbuild-biosignal-riemann" || m.version !== 1) throw new Error("not a hackbuild biosignal model, or a newer version");
    const v = Float64Array.from(m.values);
    // header c, bands, k, d; a tangent vector of d values needs d = bands * c(c+1)/2
    const [c, nb, k, d] = [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0];
    if (v.length < 4 || nb !== m.bands.length || d !== (nb * c * (c + 1)) / 2 || !(k >= 2)) throw new Error("model values do not match their header");
    const h = this.with([v], (p) => this.x.bs_import(p, v.length));
    if (h >>> 0 === 0xffffffff) throw new Error("model values do not match their header");
    return new Classifier(this, this.x, h, m.bands, m.fs, m.shrink, m.notch, v[0]!);
  }

  /** The seeded two class fixture the parity test uses. */
  synth(seed: number, c: number, t: number, fs: number, hz: number, trials: number, per: number): Epoch[] {
    const n = this.x.bs_synth(seed, c, t, fs, hz, trials, per);
    const x = new Float32Array(this.x.memory.buffer, this.x.bs_out_f32(), n * c * t).slice();
    const meta = this.out(2 * n);
    return Array.from({ length: n }, (_, i) => ({ data: x.slice(i * c * t, (i + 1) * c * t), channels: c, samples: t, label: meta[i]!, trial: meta[n + i]! }));
  }
}

export class Classifier {
  constructor(
    private readonly bs: Biosignal,
    private readonly x: Exports,
    private readonly h: number,
    readonly bands: readonly Band[],
    readonly fs: number,
    readonly shrink: number,
    readonly notch: number,
    readonly channels: number,
  ) {}
  /** Class probabilities for one epoch. */
  proba(e: Epoch): number[] {
    const covs = this.bs.features([e], this.bands, this.fs, this.shrink, this.notch);
    if (!this.withCovs(covs)) throw new Error("model was dropped");
    return [...new Float64Array(this.x.memory.buffer, this.x.bs_out_f64(), this.x.bs_out_len()).slice()];
  }
  predict(e: Epoch): number {
    const p = this.proba(e);
    return p.reduce((b, v, i) => (v > p[b]! ? i : b), 0);
  }
  private withCovs(covs: Float64Array): number {
    const p = this.x.bs_alloc(covs.byteLength);
    new Float64Array(this.x.memory.buffer, p, covs.length).set(covs);
    try {
      return this.x.bs_proba(this.h, p);
    } finally {
      this.x.bs_free(p, covs.byteLength);
    }
  }
  toJSON(): ModelJson {
    const n = this.x.bs_export(this.h);
    return { kind: "hackbuild-biosignal-riemann", version: 1, bands: [...this.bands], fs: this.fs, shrink: this.shrink, notch: this.notch, values: [...new Float64Array(this.x.memory.buffer, this.x.bs_out_f64(), n)] };
  }
  dispose(): void {
    this.x.bs_drop(this.h);
  }
}

/** Cut windows of `samples` from continuous [c][n] data at event sample indices; one trial per event, `per` windows stepping by `step`. */
export function epochsFromEvents(data: readonly Float32Array[], events: readonly { at: number; label: number }[], samples: number, per = 1, step = samples): Epoch[] {
  const c = data.length;
  const out: Epoch[] = [];
  events.forEach((ev, trial) => {
    for (let w = 0; w < per; w++) {
      const a = ev.at + w * step;
      if (a < 0 || a + samples > data[0]!.length) continue;
      const d = new Float32Array(c * samples);
      for (let ch = 0; ch < c; ch++) d.set(data[ch]!.subarray(a, a + samples), ch * samples);
      out.push({ data: d, channels: c, samples, label: ev.label, trial });
    }
  });
  return out;
}

export async function loadBiosignal(src: CoreSource): Promise<Biosignal> {
  let bytes: Uint8Array;
  if ("bytes" in src) bytes = src.bytes instanceof Uint8Array ? src.bytes : new Uint8Array(src.bytes);
  else if ("base64" in src) bytes = b64(src.base64);
  else {
    const r = await fetch(src.url);
    if (!r.ok) throw new Error(`biosignal wasm: http ${r.status} for ${String(src.url)}`);
    bytes = new Uint8Array(await r.arrayBuffer());
  }
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
  return new Biosignal(instance.exports as unknown as Exports);
}

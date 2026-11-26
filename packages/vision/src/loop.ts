/**
 * A perception loop beside a render loop: one step at a time (a busy
 * guard), each step started no sooner than `interval(lastLatency)`
 * after the previous one began (an adaptive cadence or a fixed
 * period), stopped by `stop()` or an abort signal. The scheduler is
 * injectable so tests run without timers.
 */

export interface LoopOptions<T> {
  step: (tick: number) => Promise<T>;
  /** ms between step starts given the last latency. Default a fixed 0 (every frame). */
  interval?: (lastLatencyMs: number) => number;
  onResult?: (r: T, latencyMs: number) => void;
  onError?: (e: unknown) => void;
  now?: () => number;
  /** Frame scheduler; default requestAnimationFrame, else setTimeout 16 ms. */
  schedule?: (fn: () => void) => void;
  signal?: AbortSignal;
  /** Called on each frame that found the previous step still running. */
  onBusy?: () => void;
}

/** A running loop: `stop`, whether it runs or is busy, the last step's latency and the step count. */
export interface Loop {
  stop(): void;
  readonly running: boolean;
  readonly busy: boolean;
  readonly lastLatencyMs: number;
  readonly steps: number;
}

/** Run a perception step beside a render loop, one at a time, each started no sooner than `interval(lastLatency)` after the previous one began. */
export function perceptionLoop<T>(o: LoopOptions<T>): Loop {
  const now = o.now ?? (() => (globalThis.performance ? performance.now() : Date.now()));
  const g = globalThis as { requestAnimationFrame?: (f: () => void) => unknown };
  const schedule = o.schedule ?? (g.requestAnimationFrame ? (f: () => void) => void g.requestAnimationFrame!(f) : (f: () => void) => void setTimeout(f, 16));
  let running = true;
  let busy = false;
  let last = 0;
  let lastStart = -Infinity;
  let steps = 0;
  const pump = () => {
    if (!running || o.signal?.aborted) {
      running = false;
      return;
    }
    const t = now();
    if (busy) o.onBusy?.();
    else if (t - lastStart >= (o.interval?.(last) ?? 0)) {
      busy = true;
      lastStart = t;
      const tick = steps++;
      o.step(tick).then(
        (r) => {
          last = now() - t;
          busy = false;
          o.onResult?.(r, last);
        },
        (e) => {
          last = now() - t;
          busy = false;
          o.onError?.(e);
        },
      );
    }
    schedule(pump);
  };
  schedule(pump);
  return {
    stop: () => {
      running = false;
    },
    get running() {
      return running;
    },
    get busy() {
      return busy;
    },
    get lastLatencyMs() {
      return last;
    },
    get steps() {
      return steps;
    },
  };
}

/** Options for {@link readbackLoop}: the async read, the frame consumer, a rate cap (10 Hz), and an abort signal. */
export interface ReadbackOptions<T> {
  /** An async readback, e.g. three.js readRenderTargetPixelsAsync or a canvas createImageBitmap. */
  read: () => Promise<T>;
  /** Consumer of each frame; a slow consumer holds the loop (it runs inside the busy window). */
  onFrame: (frame: T) => void | Promise<void>;
  /** Rate cap. Default 10 Hz. */
  maxHz?: number;
  onError?: (e: unknown) => void;
  now?: () => number;
  schedule?: (fn: () => void) => void;
  signal?: AbortSignal;
}

/**
 * Agent eye style readback: one read at a time (a busy flag guards
 * re-entry; frames while busy are counted as skipped instead of queued),
 * capped at maxHz.
 */
export function readbackLoop<T>(o: ReadbackOptions<T>): Loop & { readonly skipped: number } {
  let skipped = 0;
  let inner: Loop | null = null;
  const minMs = 1000 / (o.maxHz ?? 10);
  const lo: LoopOptions<void> = {
    step: async () => {
      const f = await o.read();
      await o.onFrame(f);
    },
    interval: () => minMs,
    onBusy: () => skipped++,
  };
  if (o.onError) lo.onError = o.onError;
  if (o.now) lo.now = o.now;
  if (o.schedule) lo.schedule = o.schedule;
  if (o.signal) lo.signal = o.signal;
  inner = perceptionLoop(lo);
  const l = inner;
  return {
    stop: () => l.stop(),
    get running() {
      return l.running;
    },
    get busy() {
      return l.busy;
    },
    get lastLatencyMs() {
      return l.lastLatencyMs;
    },
    get steps() {
      return l.steps;
    },
    get skipped() {
      return skipped;
    },
  };
}

/** A small LRU of results by key, so a depth map is computed once per image. */
export class ResultCache<T> {
  private readonly m = new Map<string, T>();
  constructor(private readonly max = 16) {}
  get(key: string): T | undefined {
    const v = this.m.get(key);
    if (v !== undefined) {
      this.m.delete(key);
      this.m.set(key, v);
    }
    return v;
  }
  set(key: string, v: T): void {
    this.m.delete(key);
    this.m.set(key, v);
    while (this.m.size > this.max) this.m.delete(this.m.keys().next().value!);
  }
  async getOr(key: string, make: () => Promise<T>): Promise<T> {
    const v = this.get(key);
    if (v !== undefined) return v;
    const n = await make();
    this.set(key, n);
    return n;
  }
  get size(): number {
    return this.m.size;
  }
}

/** A depth map as an 8 bit grey RGBA buffer, for a canvas or a PNG (store it as a PNG data URL to keep it with a design). */
export function depthToRgba(d: { width: number; height: number; data: Float32Array }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.width * d.height * 4);
  for (let i = 0; i < d.width * d.height; i++) {
    const v = Math.round(Math.max(0, Math.min(1, d.data[i]!)) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Scale so the longest side is at most maxPx. */
export function fitSize(w: number, h: number, maxPx = 1024): { width: number; height: number; scale: number } {
  const s = Math.min(1, maxPx / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s };
}

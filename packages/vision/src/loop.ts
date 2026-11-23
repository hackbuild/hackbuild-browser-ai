/**
 * A perception loop beside a render loop: one step at a time (CALIPER's
 * busy guard), each step started no sooner than `interval(lastLatency)`
 * after the previous one began (HACKLE detection cadence, ARBOR's fixed
 * periods), stopped by `stop()` or an abort signal. The scheduler is
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
}

export interface Loop {
  stop(): void;
  readonly running: boolean;
  readonly busy: boolean;
  readonly lastLatencyMs: number;
  readonly steps: number;
}

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
    if (!busy && t - lastStart >= (o.interval?.(last) ?? 0)) {
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

/** A small LRU of results by key (BAIL keeps the depth map with the design so it never reruns). */
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

/** A depth map as an 8 bit grey RGBA buffer, for a canvas or a PNG (BAIL stores depth as a PNG data URL). */
export function depthToRgba(d: { width: number; height: number; data: Float32Array }): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.width * d.height * 4);
  for (let i = 0; i < d.width * d.height; i++) {
    const v = Math.round(Math.max(0, Math.min(1, d.data[i]!)) * 255);
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = 255;
  }
  return out;
}

/** Scale so the longest side is at most maxPx (BAIL shrinks inputs to 1024). */
export function fitSize(w: number, h: number, maxPx = 1024): { width: number; height: number; scale: number } {
  const s = Math.min(1, maxPx / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * s)), height: Math.max(1, Math.round(h * s)), scale: s };
}

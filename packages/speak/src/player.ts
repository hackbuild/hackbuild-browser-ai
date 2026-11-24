/**
 * Gapless playback on one AudioContext: chunks are scheduled back to back
 * 40 ms ahead, every engine's audio goes through one gain and one
 * analyser, and the analyser is the single output a lip sync driver reads.
 */

export interface AudioParamLike {
  value: number;
}
export interface AudioNodeLike {
  connect(n: AudioNodeLike): unknown;
  disconnect?(): void;
}
export interface AnalyserLike extends AudioNodeLike {
  fftSize: number;
  getFloatTimeDomainData(a: Float32Array): void;
}
export interface BufferLike {
  getChannelData(c: number): Float32Array;
}
export interface SourceLike extends AudioNodeLike {
  buffer: BufferLike | null;
  start(when: number): void;
  stop(when?: number): void;
  onended: ((ev: any) => unknown) | null; // any: the dom passes an Event, fakes pass nothing
}
export interface AudioContextLike {
  readonly currentTime: number;
  readonly sampleRate: number;
  readonly state?: string;
  resume?(): Promise<void>;
  readonly destination: AudioNodeLike;
  createBuffer(channels: number, length: number, rate: number): BufferLike;
  createBufferSource(): SourceLike;
  createAnalyser(): AnalyserLike;
  createGain(): AudioNodeLike & { gain: AudioParamLike };
}

export interface PlayerOptions {
  /** Seconds ahead of now for a chunk that starts after a gap. Default 0.04. */
  lead?: number;
  /** Fade length in samples at the start and end of each segment. Default 96. */
  fade?: number;
}

export class GaplessPlayer {
  readonly analyser: AnalyserLike;
  readonly gain: AudioNodeLike & { gain: AudioParamLike };
  private nextT = 0;
  private readonly live = new Set<SourceLike>();
  private readonly buf: Float32Array;
  private readonly lead: number;
  private readonly fadeN: number;
  constructor(
    readonly ctx: AudioContextLike,
    o: PlayerOptions = {},
  ) {
    this.lead = o.lead ?? 0.04;
    this.fadeN = o.fade ?? 96;
    this.gain = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.gain.connect(this.analyser);
    this.analyser.connect(ctx.destination);
    this.buf = new Float32Array(1024);
  }

  /** Context time when the last scheduled chunk ends. */
  get endTime(): number {
    return this.nextT;
  }

  get playing(): boolean {
    return this.ctx.currentTime < this.nextT && this.live.size > 0;
  }

  /** Schedule one chunk. Fades are applied to a copy. Returns its context time span. */
  schedule(samples: Float32Array, rate: number, fade: { in?: boolean; out?: boolean } = {}): { start: number; end: number } {
    const x = Float32Array.from(samples);
    const n = Math.min(this.fadeN, Math.floor(x.length / 2));
    for (let i = 0; i < n; i++) {
      const g = i / n;
      if (fade.in) x[i]! *= g;
      if (fade.out) x[x.length - 1 - i]! *= g;
    }
    const b = this.ctx.createBuffer(1, Math.max(1, x.length), rate);
    b.getChannelData(0).set(x);
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    s.connect(this.gain);
    const start = Math.max(this.ctx.currentTime + this.lead, this.nextT);
    const end = start + x.length / rate;
    s.onended = () => this.live.delete(s);
    this.live.add(s);
    s.start(start);
    this.nextT = end;
    return { start, end };
  }

  stop(): void {
    for (const s of this.live) {
      try {
        s.stop();
      } catch {
        /* already stopped */
      }
    }
    this.live.clear();
    this.nextT = 0;
  }

  /** RMS of the analyser's last window (computed), 0 when silent. */
  level(): number {
    this.analyser.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (const v of this.buf) s += v * v;
    return Math.sqrt(s / this.buf.length);
  }
}

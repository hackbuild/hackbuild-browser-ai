/**
 * Voice activity: a per frame speech probability from a source (Silero
 * through onnxruntime-web, or an energy gate with no weights) feeds a
 * state machine that finds utterances. While the character talks, the
 * machine swaps to stricter thresholds (positive 0.85 and 450 ms of speech
 * against 0.5 and 250 ms) so its own voice from the speakers does not
 * count; speech that clears the stricter bar is a barge in.
 */

export interface Thresholds {
  /** Probability at or above which a frame is speech. */
  positive: number;
  /** Probability under which a frame counts toward the end of speech. */
  negative: number;
  /** Speech needed before an utterance is real, in ms. */
  minSpeechMs: number;
}

export interface VadOptions {
  /** Samples per frame at 16 kHz. Default 512 (32 ms), Silero v5's frame. */
  frame?: number;
  idle?: Thresholds;
  /** Used while the character talks. */
  talking?: Thresholds;
  /** Quiet needed to end an utterance, in ms. Default 600. */
  redemptionMs?: number;
  /** Audio kept from before the start, in ms. Default 300. */
  preSpeechPadMs?: number;
  /** Longest utterance before a forced end, in s. Default 24 (Whisper pads to 30). */
  maxSec?: number;
}

export type VadEvent =
  | { type: "start" }
  /** Enough speech heard; while talking this is the barge in. */
  | { type: "confirmed"; talking: boolean }
  | { type: "end"; audio: Float32Array; speech: [number, number][]; sec: number }
  | { type: "misfire" };

export const IDLE: Thresholds = { positive: 0.5, negative: 0.35, minSpeechMs: 250 };
export const TALKING: Thresholds = { positive: 0.85, negative: 0.6, minSpeechMs: 450 };

export class VadMachine {
  readonly frame: number;
  private readonly o: Required<Omit<VadOptions, "frame">>;
  private talking = false;
  private active = false;
  private confirmed = false;
  private frames: Float32Array[] = [];
  private flags: boolean[] = [];
  private pre: Float32Array[] = [];
  private speechFrames = 0;
  private quietFrames = 0;

  constructor(o: VadOptions = {}) {
    this.frame = o.frame ?? 512;
    this.o = {
      idle: o.idle ?? IDLE,
      talking: o.talking ?? TALKING,
      redemptionMs: o.redemptionMs ?? 600,
      preSpeechPadMs: o.preSpeechPadMs ?? 300,
      maxSec: o.maxSec ?? 24,
    };
  }

  private get ms(): number {
    return (this.frame / 16000) * 1000;
  }

  get thresholds(): Thresholds {
    return this.talking ? this.o.talking : this.o.idle;
  }

  /** The character started or stopped talking. */
  setTalking(b: boolean): void {
    this.talking = b;
  }
  get isTalking(): boolean {
    return this.talking;
  }
  get inSpeech(): boolean {
    return this.active;
  }

  reset(): void {
    this.active = false;
    this.confirmed = false;
    this.frames = [];
    this.flags = [];
    this.pre = [];
    this.speechFrames = 0;
    this.quietFrames = 0;
  }

  /** One frame and its speech probability. Returns the events it caused. */
  process(prob: number, frame: Float32Array): VadEvent[] {
    const th = this.thresholds;
    const out: VadEvent[] = [];
    const speech = prob >= th.positive;
    if (!this.active) {
      if (!speech) {
        this.pre.push(frame);
        const keep = Math.ceil(this.o.preSpeechPadMs / this.ms);
        if (this.pre.length > keep) this.pre.shift();
        return out;
      }
      this.active = true;
      this.frames = [...this.pre];
      this.flags = this.pre.map(() => false);
      this.pre = [];
      this.speechFrames = 0;
      this.quietFrames = 0;
      this.confirmed = false;
      out.push({ type: "start" });
    }
    this.frames.push(frame);
    this.flags.push(speech);
    if (speech) {
      this.speechFrames++;
      this.quietFrames = 0;
    } else if (prob < th.negative) this.quietFrames++;
    if (!this.confirmed && this.speechFrames * this.ms >= th.minSpeechMs) {
      this.confirmed = true;
      out.push({ type: "confirmed", talking: this.talking });
    }
    const long = this.frames.length * this.frame >= this.o.maxSec * 16000;
    if (this.quietFrames * this.ms >= this.o.redemptionMs || long) out.push(this.finish());
    return out;
  }

  /** End the current utterance now (stream stopped). */
  flush(): VadEvent | null {
    return this.active ? this.finish() : null;
  }

  private finish(): VadEvent {
    const th = this.thresholds;
    const ok = this.confirmed || this.speechFrames * this.ms >= th.minSpeechMs;
    const frames = this.frames;
    const flags = this.flags;
    this.reset();
    if (!ok) return { type: "misfire" };
    const audio = new Float32Array(frames.length * this.frame);
    frames.forEach((f, i) => audio.set(f, i * this.frame));
    const speech: [number, number][] = [];
    flags.forEach((s, i) => {
      if (!s) return;
      const last = speech[speech.length - 1];
      if (last && last[1] === i * this.frame) last[1] += this.frame;
      else speech.push([i * this.frame, (i + 1) * this.frame]);
    });
    return { type: "end", audio, speech, sec: audio.length / 16000 };
  }
}

/** A speech probability per frame. */
export interface VadSource {
  readonly id: string;
  prob(frame: Float32Array): number | Promise<number>;
  reset?(): void;
}

/**
 * Energy source with no weights: probability rises from 0 at 3 dB over a
 * tracked noise floor to 1 at 15 dB over it. The floor follows quiet
 * frames quickly and loud ones slowly. It cannot tell speech from music.
 */
export function energyVad(o: { floorDb?: number; rise?: number; fall?: number } = {}): VadSource {
  let floor = o.floorDb ?? -60;
  const rise = o.rise ?? 0.002;
  const fall = o.fall ?? 0.2;
  return {
    id: "energy",
    prob(frame) {
      let s = 0;
      for (const v of frame) s += v * v;
      const db = 10 * Math.log10(s / Math.max(1, frame.length) + 1e-12);
      floor += (db - floor) * (db < floor ? fall : rise);
      return Math.min(1, Math.max(0, (db - floor - 3) / 12));
    },
    reset() {
      floor = o.floorDb ?? -60;
    },
  };
}

/** The onnxruntime-web pieces the Silero source calls. */
export interface OrtLike {
  Tensor: new (type: string, data: Float32Array | BigInt64Array, dims: number[]) => unknown;
  InferenceSession: { create(model: ArrayBuffer | Uint8Array, o?: Record<string, unknown>): Promise<OrtSessionLike> };
}
export interface OrtSessionLike {
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: ArrayLike<number> }>>;
}

/**
 * Silero VAD v5 (snakers4/silero-vad, weights MIT) on onnxruntime-web:
 * 512 new samples at 16 kHz with the previous 64 as context, a [2, 1, 128]
 * state carried between frames. The model bytes are the caller's (URL,
 * ArrayBuffer or File through @hackbuild/weights); single threaded wasm is
 * the setting an earlier build ran, since threaded wasm hung in workers.
 */
export async function sileroVad(ort: OrtLike, model: ArrayBuffer | Uint8Array, o: { executionProviders?: string[] } = {}): Promise<VadSource> {
  const session = await ort.InferenceSession.create(model, { executionProviders: o.executionProviders ?? ["wasm"] });
  let state = new Float32Array(2 * 128);
  let context = new Float32Array(64);
  const sr = new ort.Tensor("int64", BigInt64Array.from([16000n]), []);
  return {
    id: "silero-v5",
    async prob(frame) {
      const x = new Float32Array(64 + frame.length);
      x.set(context);
      x.set(frame, 64);
      context = x.slice(x.length - 64);
      const out = await session.run({
        input: new ort.Tensor("float32", x, [1, x.length]),
        state: new ort.Tensor("float32", state, [2, 1, 128]),
        sr,
      });
      const stateN = out.stateN ?? out.state;
      if (stateN) state = Float32Array.from(stateN.data);
      return Number((out.output ?? Object.values(out)[0]!).data[0]);
    },
    reset() {
      state = new Float32Array(2 * 128);
      context = new Float32Array(64);
    },
  };
}

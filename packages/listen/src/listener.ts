/**
 * The listener: microphone blocks at any rate are decimated to 16 kHz,
 * framed for the VAD, and each utterance goes to a transcriber, then
 * through the phantom text filter of @hackbuild/transcribe. Speech that
 * clears the stricter bar while the character talks calls onBargeIn,
 * which should stop the voice.
 */

import type { Hub, RunOptions } from "@hackbuild/models";
import { cleanup, lowpassTaps, StreamDecimator, type Asr } from "@hackbuild/transcribe";
import { VadMachine, type VadOptions, type VadSource } from "./vad.js";

/** Turns 16 kHz mono speech into text. */
export type Transcriber = (pcm16k: Float32Array, signal?: AbortSignal) => Promise<string>;

export type ListenState = "idle" | "listening" | "hearing" | "transcribing" | "stopped";

export interface Utterance {
  text: string;
  pcm: Float32Array;
  sec: number;
  /** This utterance cut the character off. */
  bargeIn: boolean;
  /** Text the phantom filter dropped, with the reason. */
  dropped?: string;
}

export interface ListenerOptions {
  vad: VadSource;
  transcribe?: Transcriber;
  /** Microphone rate; 16000 skips decimation. Default 48000. */
  inputRate?: number;
  machine?: VadOptions;
  /** Run the phantom filter on transcripts. Default true. */
  filter?: boolean;
  onUtterance?(u: Utterance): void;
  onBargeIn?(): void;
  onState?(s: ListenState): void;
  /** Per frame probability, for a meter. */
  onProb?(p: number): void;
  onError?(e: unknown): void;
}

export class Listener {
  readonly machine: VadMachine;
  private readonly o: ListenerOptions;
  private readonly dec: StreamDecimator | null;
  private carry = new Float32Array(0);
  private chain: Promise<void> = Promise.resolve();
  private stateNow: ListenState = "idle";
  private barged = false;
  private running = false;

  constructor(o: ListenerOptions) {
    this.o = o;
    this.machine = new VadMachine(o.machine);
    const rate = o.inputRate ?? 48000;
    const f = Math.round(rate / 16000);
    this.dec = f > 1 ? new StreamDecimator(lowpassTaps(7000 / rate, 41), f) : null;
  }

  get state(): ListenState {
    return this.stateNow;
  }

  private set(s: ListenState): void {
    if (s === this.stateNow) return;
    this.stateNow = s;
    this.o.onState?.(s);
  }

  start(): void {
    this.running = true;
    this.set("listening");
  }

  stop(): void {
    this.running = false;
    this.machine.reset();
    this.o.vad.reset?.();
    this.carry = new Float32Array(0);
    this.set("stopped");
  }

  /** Tell the listener the character started or stopped talking (speak's onSpeaking). */
  setTalking(b: boolean): void {
    this.machine.setTalking(b);
  }

  /** Feed a microphone block. Processing is serialized; await `idle()` to wait for it. */
  push(block: Float32Array): void {
    if (!this.running) return;
    const x = this.dec ? this.dec.process(block) : block;
    const all = new Float32Array(this.carry.length + x.length);
    all.set(this.carry);
    all.set(x, this.carry.length);
    const n = this.machine.frame;
    let off = 0;
    const frames: Float32Array[] = [];
    for (; off + n <= all.length; off += n) frames.push(all.slice(off, off + n));
    this.carry = all.slice(off);
    if (!frames.length) return;
    this.chain = this.chain.then(() => this.frames(frames)).catch((e) => this.o.onError?.(e));
  }

  /** Resolves when every pushed block has been processed and transcribed. */
  idle(): Promise<void> {
    return this.chain;
  }

  /** End any utterance in progress (for push to talk release). */
  flush(): Promise<void> {
    this.chain = this.chain.then(async () => {
      const ev = this.machine.flush();
      if (ev?.type === "end") await this.utter(ev.audio, ev.speech);
    });
    return this.chain;
  }

  private async frames(frames: Float32Array[]): Promise<void> {
    for (const f of frames) {
      if (!this.running) return;
      const p = await this.o.vad.prob(f);
      this.o.onProb?.(p);
      for (const ev of this.machine.process(p, f)) {
        if (ev.type === "start") this.set("hearing");
        else if (ev.type === "confirmed" && ev.talking) {
          this.barged = true;
          this.o.onBargeIn?.();
        } else if (ev.type === "misfire") {
          this.barged = false;
          this.set("listening");
        } else if (ev.type === "end") await this.utter(ev.audio, ev.speech);
      }
    }
  }

  private async utter(audio: Float32Array, speech: [number, number][]): Promise<void> {
    const bargeIn = this.barged;
    this.barged = false;
    const sec = audio.length / 16000;
    if (!this.o.transcribe) {
      this.o.onUtterance?.({ text: "", pcm: audio, sec, bargeIn });
      this.set("listening");
      return;
    }
    this.set("transcribing");
    const text = (await this.o.transcribe(audio)).trim();
    const u: Utterance = { text, pcm: audio, sec, bargeIn };
    if (this.o.filter !== false && text) {
      const r = cleanup([{ start: 0, end: sec, text }], speech);
      if (!r.kept.length) {
        u.dropped = `${r.dropped[0]?.why ?? "empty"}: ${text}`;
        u.text = "";
      }
    }
    this.o.onUtterance?.(u);
    if (this.running) this.set("listening");
  }
}

export function createListener(o: ListenerOptions): Listener {
  return new Listener(o);
}

/**
 * A transcriber over the models hub and @hackbuild/transcribe's records
 * (Whisper, weights MIT; Moonshine, see its record). The call runs under
 * hub.run, so a webgpu model takes the gpu lock.
 */
export function hubTranscriber(hub: Hub, o: { model?: string; language?: string; schedule?: RunOptions } = {}): Transcriber {
  return async (pcm, signal) => {
    const m = await hub.use<Asr>(o.model ? { id: o.model } : "transcribe", signal ? { signal } : {});
    try {
      const english = m.record.notes?.some((n) => /english only/.test(n)) ?? false;
      const call: Record<string, unknown> = { task: "transcribe" };
      if (o.language && o.language !== "auto" && !english) call.language = o.language;
      const out = await hub.run(m, (asr) => asr(pcm, call), { ...(o.schedule ?? {}), ...(signal ? { signal } : {}) });
      return out.text ?? (out.chunks ?? []).map((c) => c.text ?? "").join("");
    } finally {
      hub.release(m);
    }
  };
}

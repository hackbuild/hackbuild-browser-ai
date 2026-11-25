/**
 * The listener: microphone blocks at any rate are decimated to 16 kHz,
 * framed for the VAD, and each utterance goes to a transcriber, then
 * through the phantom text filter of @hackbuild/transcribe. Speech that
 * clears the stricter bar while the character talks calls onBargeIn,
 * which should stop the voice.
 */

import type { Hub, RunOptions } from "@hackbuild/models";
import { cleanup, toSixteenK, type Asr } from "@hackbuild/transcribe";
import { VadMachine, type VadOptions, type VadSource } from "./vad.js";
import { stablePrefix, type Interim } from "./interim.js";

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
  /** Microphone rate; any rate is brought to 16 kHz. Default 48000. */
  inputRate?: number;
  machine?: VadOptions;
  /** Drop an utterance that began while the character talked, for when barge in is off. Default false. */
  dropWhileTalking?: boolean;
  /** With dropWhileTalking, also drop one that began within this many ms after the voice stopped (audio time). Default 0. */
  gateMs?: number;
  /**
   * Interim text while the person speaks: the growing utterance window is
   * decoded again every `everySec` of new audio (default 0.8) once it holds
   * `minSec` (default 0.5), at most one decode in flight. Needs onInterim
   * and a transcriber; `transcribe` here overrides the final one, for a
   * smaller model.
   */
  interim?: { everySec?: number; minSec?: number; transcribe?: Transcriber };
  /** Words heard so far; results for an utterance that already ended are dropped. */
  onInterim?(i: Interim): void;
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
  private readonly dec: ReturnType<typeof toSixteenK>;
  private carry = new Float32Array(0);
  private chain: Promise<void> = Promise.resolve();
  private stateNow: ListenState = "idle";
  private barged = false;
  private overVoice = false;
  private running = false;
  /** 16 kHz samples processed, the audio clock. */
  private clock = 0;
  private talkEnd = -Infinity;
  private utt = 0;
  private lastDecode = 0;
  private prevInterim = "";
  private inFlight: Promise<void> | null = null;

  constructor(o: ListenerOptions) {
    this.o = o;
    this.machine = new VadMachine(o.machine);
    this.dec = toSixteenK(o.inputRate ?? 48000);
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
    if (this.machine.isTalking && !b) this.talkEnd = this.clock;
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
    return this.chain.then(() => this.inFlight ?? undefined);
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
      this.clock += f.length;
      for (const ev of this.machine.process(p, f)) {
        if (ev.type === "start") {
          this.overVoice = this.machine.isTalking || this.clock - this.talkEnd < ((this.o.gateMs ?? 0) * 16000) / 1000;
          this.utt++;
          this.lastDecode = 0;
          this.prevInterim = "";
          this.set("hearing");
        }
        else if (ev.type === "confirmed" && ev.talking) {
          this.barged = true;
          this.o.onBargeIn?.();
        } else if (ev.type === "misfire") {
          this.barged = false;
          this.utt++;
          this.set("listening");
        } else if (ev.type === "end") {
          this.utt++;
          await this.utter(ev.audio, ev.speech);
        }
      }
      this.maybeInterim();
    }
  }

  /** Decode the growing window again when enough new audio came in and no decode is running. */
  private maybeInterim(): void {
    const t = this.o.interim?.transcribe ?? this.o.transcribe;
    if (!this.o.onInterim || !t || this.inFlight || !this.machine.inSpeech) return;
    if (this.overVoice && this.o.dropWhileTalking) return;
    const audio = this.machine.current;
    if (!audio) return;
    const every = (this.o.interim?.everySec ?? 0.8) * 16000;
    if (audio.length < (this.o.interim?.minSec ?? 0.5) * 16000 || audio.length - this.lastDecode < every) return;
    this.lastDecode = audio.length;
    const id = this.utt;
    this.inFlight = t(audio)
      .then((raw) => {
        const text = raw.trim();
        if (id !== this.utt || !this.running || !text) return;
        this.o.onInterim?.({ text, stable: stablePrefix(this.prevInterim, text), t: audio.length / 16000 });
        this.prevInterim = text;
      })
      .catch((e) => this.o.onError?.(e))
      .finally(() => {
        this.inFlight = null;
      });
  }

  private async utter(audio: Float32Array, speech: [number, number][]): Promise<void> {
    const bargeIn = this.barged;
    this.barged = false;
    const over = this.overVoice;
    this.overVoice = false;
    const sec = audio.length / 16000;
    if (over && this.o.dropWhileTalking) {
      if (this.running) this.set("listening");
      return;
    }
    if (!this.o.transcribe) {
      this.o.onUtterance?.({ text: "", pcm: audio, sec, bargeIn });
      this.set("listening");
      return;
    }
    this.set("transcribing");
    let text: string;
    try {
      text = (await this.o.transcribe(audio)).trim();
    } catch (e) {
      // a failed transcription must not leave the state at "transcribing"
      if (this.running) this.set("listening");
      throw e;
    }
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

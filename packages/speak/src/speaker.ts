/**
 * The speaker: takes a reply as it streams, cuts it into segments, runs
 * them through the first engine that works, plays PCM gapless on one
 * player, and reports progress as offsets in the caller's text when the
 * voice reaches them. Segment N+1 is synthesized while N plays. A
 * watchdog moves to the next engine when one goes quiet. A bounded cache
 * of recent clips makes a replay instant.
 */

import { GaplessPlayer, type AnalyserLike, type AudioContextLike, type PlayerOptions } from "./player.js";
import { estimateWordTimes, SegmentCutter, speakable, type CutterOptions, type Segment, type SpeakableOptions } from "./text.js";
import { renderSpeech, type RenderedSpeech } from "./render.js";
import type { Engine, EngineStatus, PcmChunk, PcmEngine, Timed, VoiceConfig } from "./types.js";

export interface Progress {
  utterance: number;
  /** Offset in the utterance's input text. */
  offset: number;
  kind: "segment" | "word" | "end";
  /** Word times guessed from text length, not reported by the engine. */
  estimated: boolean;
}

/** A word or phoneme placed on the audio clock, for lip sync. */
export interface TimedEvent {
  utterance: number;
  kind: "word" | "phoneme";
  start: number;
  end: number;
  /** AudioContext times; for a native engine the boundary time with no end known (t1 = t0). */
  t0: number;
  t1: number;
  phoneme?: string;
  estimated: boolean;
}

export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

export interface SpeakerOptions {
  ctx: AudioContextLike;
  /** Tried in order; a failed engine is skipped until resetEngines(). */
  engines: Engine[];
  voice?: VoiceConfig;
  /** Per voice settings by engine id, merged over `voice`. */
  voices?: Record<string, VoiceConfig>;
  /** No audio from an engine for this long moves to the next engine. Default 45000 ms. */
  watchdogMs?: number;
  cutter?: CutterOptions;
  speakable?: SpeakableOptions;
  player?: PlayerOptions;
  /** Cache size in samples. Default 3 minutes at 24 kHz. 0 turns it off. */
  cacheSamples?: number;
  timers?: Timers;
  /** Call tick() every this many ms. Default 25; 0 means the caller calls tick() (per frame or in tests). */
  tickMs?: number;
  onProgress?(p: Progress): void;
  onTimed?(t: TimedEvent): void;
  /** A segment starts on an engine; `cached` is true when its audio is a replay from the PCM cache. */
  onSegment?(s: Segment & { utterance: number; engine: string; cached: boolean }): void;
  onSpeaking?(speaking: boolean): void;
  onStatus?(s: EngineStatus): void;
}

interface Cue {
  time: number;
  fire(): void;
}

const defaultTimers: Timers = { setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>) };

class Watchdog extends Error {}

export class Speaker {
  readonly player: GaplessPlayer;
  private readonly o: SpeakerOptions;
  private readonly timers: Timers;
  private readonly cutter: SegmentCutter;
  private readonly failed = new Set<string>();
  private readonly loaded = new Set<string>();
  private queue: { seg: Segment; utt: number; input: string }[] = [];
  private cues: Cue[] = [];
  private utt = 0;
  private uttText = "";
  private uttFinal = true;
  private abort = new AbortController();
  private pumping = false;
  private nativeBusy = false;
  private speakingNow = false;
  private waiters: (() => void)[] = [];
  private nativeLevelUntil = 0;
  private interval: unknown = null;
  private readonly cache = new Map<string, { chunks: PcmChunk[]; n: number }>();
  private cacheN = 0;
  private current: string | null = null;

  constructor(o: SpeakerOptions) {
    this.o = o;
    this.timers = o.timers ?? defaultTimers;
    this.player = new GaplessPlayer(o.ctx, o.player);
    this.cutter = new SegmentCutter(o.cutter);
  }

  /** The single analyser every PCM engine plays through. */
  get analyser(): AnalyserLike {
    return this.player.analyser;
  }
  get speaking(): boolean {
    return this.speakingNow;
  }
  /** The engine that spoke last. */
  get engine(): string | null {
    return this.current;
  }
  get utterance(): number {
    return this.utt;
  }

  /** Feed the visible reply so far. After `final`, the next feed starts a new utterance. */
  feed(textSoFar: string, final = false): number {
    if (this.uttFinal) {
      this.utt++;
      this.cutter.reset();
      this.uttFinal = false;
    }
    this.uttText = textSoFar;
    for (const seg of this.cutter.take(textSoFar, final)) this.queue.push({ seg, utt: this.utt, input: textSoFar });
    if (final) this.uttFinal = true;
    void this.pump();
    return this.utt;
  }

  /** Speak a whole text; resolves when its audio has played or it was stopped. */
  say(text: string): Promise<void> {
    if (!this.uttFinal) this.feed(this.uttText, true);
    this.feed(text, true);
    return this.done();
  }

  /** Resolves when nothing is queued, synthesizing or playing. */
  done(): Promise<void> {
    if (!this.busy()) return Promise.resolve();
    return new Promise((r) => this.waiters.push(r));
  }

  stop(): void {
    this.abort.abort();
    this.abort = new AbortController();
    this.queue = [];
    this.cues = [];
    this.player.stop();
    for (const e of this.o.engines) if (e.kind === "native") e.stop();
    this.uttFinal = true;
    this.setSpeaking(false);
    this.flushWaiters();
  }

  /**
   * Render a whole text offline on the speaker's engine chain, with its
   * voice settings, for "save wav". Engines marked failed are skipped;
   * native engines are skipped since they give no samples.
   */
  render(text: string, signal?: AbortSignal): Promise<RenderedSpeech> {
    const o = this.o;
    return renderSpeech(
      o.engines.filter((e) => !this.failed.has(e.id)),
      text,
      {
        ...(o.voice ? { voice: o.voice } : {}),
        ...(o.voices ? { voices: o.voices } : {}),
        ...(o.speakable ? { speakable: o.speakable } : {}),
        ...(o.cutter ? { cutter: o.cutter } : {}),
        ...(signal ? { signal } : {}),
        onSkip: (engine, reason) => o.onStatus?.({ engine, kind: "failed", text: `${engine}: ${reason}` }),
      },
    );
  }

  /** Clear failure marks so every engine is tried again. */
  resetEngines(): void {
    this.failed.clear();
  }

  /** Output level for lip sync: analyser RMS for PCM engines, a boundary pulse for a native one (estimated). */
  level(): number {
    if (this.nativeBusy) return this.o.ctx.currentTime < this.nativeLevelUntil ? 0.3 : 0.05;
    return this.player.level();
  }

  /** Fire cues whose time has come and settle the speaking state. Runs on a timer unless tickMs is 0. */
  tick(): void {
    const now = this.o.ctx.currentTime;
    if (this.cues.length) {
      const due = this.cues.filter((c) => c.time <= now);
      if (due.length) {
        this.cues = this.cues.filter((c) => c.time > now);
        for (const c of due) c.fire();
      }
    }
    if (this.speakingNow && !this.busy()) {
      this.setSpeaking(false);
      this.flushWaiters();
    } else if (!this.busy()) this.flushWaiters();
  }

  dispose(): void {
    this.stop();
    if (this.interval !== null) this.timers.clearTimeout(this.interval);
    this.interval = null;
  }

  private busy(): boolean {
    return this.pumping || this.nativeBusy || this.queue.length > 0 || this.cues.length > 0 || this.o.ctx.currentTime < this.player.endTime;
  }

  private flushWaiters(): void {
    const w = this.waiters;
    this.waiters = [];
    for (const r of w) r();
  }

  private setSpeaking(b: boolean): void {
    if (b === this.speakingNow) return;
    this.speakingNow = b;
    this.o.onSpeaking?.(b);
    if (b) this.startTicker();
  }

  private startTicker(): void {
    const ms = this.o.tickMs ?? 25;
    if (ms <= 0 || this.interval !== null) return;
    const loop = () => {
      this.interval = null;
      this.tick();
      if (this.busy()) this.interval = this.timers.setTimeout(loop, ms);
    };
    this.interval = this.timers.setTimeout(loop, ms);
  }

  private cfg(id: string): VoiceConfig {
    return { ...(this.o.voice ?? {}), ...(this.o.voices?.[id] ?? {}) };
  }

  private async ensure(e: Engine): Promise<boolean> {
    if (this.failed.has(e.id)) return false;
    if (this.loaded.has(e.id)) return true;
    try {
      this.o.onStatus?.({ engine: e.id, kind: "loading", text: `loading ${e.id}` });
      await e.load({ signal: this.abort.signal, onStatus: (s) => this.o.onStatus?.(s) });
      this.loaded.add(e.id);
      return true;
    } catch (err) {
      this.fail(e, err);
      return false;
    }
  }

  private fail(e: Engine, err: unknown): void {
    this.failed.add(e.id);
    const kind = err instanceof Watchdog ? "watchdog" : "failed";
    this.o.onStatus?.({ engine: e.id, kind, text: `${e.id}: ${err instanceof Error ? err.message : String(err)}` });
  }

  private async pump(): Promise<void> {
    if (this.pumping) return;
    this.pumping = true;
    try {
      while (this.queue.length) {
        const job = this.queue.shift()!;
        const signal = this.abort.signal;
        let spoken = false;
        for (const e of this.o.engines) {
          if (signal.aborted) break;
          if (!(await this.ensure(e))) continue;
          try {
            if (e.kind === "pcm") await this.runPcm(e, job.seg, job.utt, signal);
            else await this.runNative(e, job.seg, job.utt, signal);
            spoken = true;
            break;
          } catch (err) {
            if (signal.aborted) break;
            this.fail(e, err);
          }
        }
        if (!spoken && !signal.aborted) this.o.onStatus?.({ engine: "none", kind: "failed", text: "no voice engine could speak this segment" });
      }
    } finally {
      this.pumping = false;
      if (this.o.tickMs === 0 || this.interval === null) this.tick();
    }
  }

  private progress(p: Progress): void {
    this.o.onProgress?.(p);
  }

  private async *chunksOf(e: PcmEngine, text: string, cfg: VoiceConfig, signal: AbortSignal, info: { cached: boolean }): AsyncGenerator<PcmChunk> {
    const key = `${e.id}|${cfg.voice ?? ""}|${cfg.rate ?? 1}|${text}`;
    const hit = this.cache.get(key);
    info.cached = !!hit;
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      yield* hit.chunks;
      return;
    }
    const engineAbort = new AbortController();
    const onAbort = () => engineAbort.abort();
    // a listener added to an already aborted signal never fires
    if (signal.aborted) engineAbort.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
    const it = e.synth(text, cfg, engineAbort.signal)[Symbol.asyncIterator]();
    const got: PcmChunk[] = [];
    let n = 0;
    const ms = this.o.watchdogMs ?? 45000;
    try {
      for (;;) {
        let h: unknown;
        const timeout = new Promise<never>((_, rej) => {
          h = this.timers.setTimeout(() => rej(new Watchdog(`no audio for ${ms / 1000} s`)), ms);
        });
        let r: IteratorResult<PcmChunk>;
        try {
          r = await Promise.race([it.next(), timeout]);
        } catch (err) {
          engineAbort.abort();
          throw err;
        } finally {
          this.timers.clearTimeout(h);
        }
        if (r.done) break;
        got.push(r.value);
        n += r.value.samples.length;
        yield r.value;
      }
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
    const cap = this.o.cacheSamples ?? 3 * 60 * 24000;
    if (cap > 0 && n <= cap && !signal.aborted) {
      this.cache.set(key, { chunks: got, n });
      this.cacheN += n;
      for (const [k, v] of this.cache) {
        if (this.cacheN <= cap) break;
        this.cache.delete(k);
        this.cacheN -= v.n;
      }
    }
  }

  private async runPcm(e: PcmEngine, seg: Segment, utt: number, signal: AbortSignal): Promise<void> {
    const sp = speakable(seg.text, this.o.speakable);
    if (!sp.text) return;
    const at = (i: number) => seg.start + sp.map[Math.min(i, sp.map.length - 1)]!;
    const cfg = this.cfg(e.id);
    let segStart = -1;
    let segEnd = -1;
    let reported = false;
    let first = true;
    let pending: PcmChunk | null = null;
    const info = { cached: false };
    const place = (c: PcmChunk, last: boolean) => {
      const span = this.player.schedule(c.samples, c.sampleRate, { in: first, out: last });
      if (first) {
        segStart = span.start;
        this.current = e.id;
        this.o.onSegment?.({ ...seg, utterance: utt, engine: e.id, cached: info.cached });
        // speaking starts when the audio clock reaches the chunk, not when it is scheduled
        this.cue(span.start, () => {
          this.progress({ utterance: utt, offset: seg.start, kind: "segment", estimated: false });
          this.setSpeaking(true);
        });
        this.startTicker();
      }
      first = false;
      segEnd = span.end;
      for (const [kind, list] of [["word", c.words], ["phoneme", c.phonemes]] as const) {
        for (const w of list ?? []) {
          reported ||= kind === "word";
          this.placeTimed(utt, kind, w, span.start, at, false);
        }
      }
    };
    // hold one chunk back so the last one gets its fade out
    for await (const c of this.chunksOf(e, sp.text, cfg, signal, info)) {
      if (signal.aborted) return;
      if (pending) place(pending, false);
      pending = c;
    }
    if (signal.aborted) return;
    if (pending) place(pending, true);
    if (segStart < 0) return;
    if (!reported) for (const w of estimateWordTimes(sp.text, segEnd - segStart)) this.placeTimed(utt, "word", w, segStart, at, true);
    this.cue(segEnd, () => this.progress({ utterance: utt, offset: seg.end, kind: "end", estimated: false }));
  }

  private placeTimed(utt: number, kind: "word" | "phoneme", w: Timed, base: number, at: (i: number) => number, estimated: boolean): void {
    const ev: TimedEvent = { utterance: utt, kind, start: at(w.start), end: at(w.end), t0: base + w.t0, t1: base + w.t1, estimated };
    if (w.phoneme !== undefined) ev.phoneme = w.phoneme;
    this.o.onTimed?.(ev);
    if (kind === "word") this.cue(ev.t0, () => this.progress({ utterance: utt, offset: ev.start, kind: "word", estimated }));
  }

  private cue(time: number, fire: () => void): void {
    this.cues.push({ time, fire });
    this.cues.sort((a, b) => a.time - b.time);
  }

  private async runNative(e: Extract<Engine, { kind: "native" }>, seg: Segment, utt: number, signal: AbortSignal): Promise<void> {
    // let queued PCM audio finish first
    while (!signal.aborted && this.o.ctx.currentTime < this.player.endTime) {
      await new Promise<void>((r) => this.timers.setTimeout(r, Math.max(10, (this.player.endTime - this.o.ctx.currentTime) * 1000)));
      this.tick();
    }
    if (signal.aborted) return;
    const sp = speakable(seg.text, this.o.speakable);
    if (!sp.text) return;
    const at = (i: number) => seg.start + sp.map[Math.min(i, sp.map.length - 1)]!;
    this.nativeBusy = true;
    this.current = e.id;
    this.o.onSegment?.({ ...seg, utterance: utt, engine: e.id, cached: false });
    // speaking starts when the platform reports audio (onstart, or the first word boundary);
    // a native engine that reports neither never sets it, so its time to first audio is unknown
    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      this.setSpeaking(true);
    };
    this.progress({ utterance: utt, offset: seg.start, kind: "segment", estimated: false });
    try {
      await e.speak(
        sp.text,
        this.cfg(e.id),
        {
          onStart: start,
          onBoundary: (ci, len) => {
            start();
            const t = this.o.ctx.currentTime;
            this.nativeLevelUntil = t + 0.15;
            const end = len !== undefined ? ci + len : (/[\p{L}\p{N}'’]+/u.exec(sp.text.slice(ci))?.[0].length ?? 0) + ci;
            this.o.onTimed?.({ utterance: utt, kind: "word", start: at(ci), end: at(end), t0: t, t1: t, estimated: false });
            this.progress({ utterance: utt, offset: at(ci), kind: "word", estimated: false });
          },
        },
        signal,
      );
      if (!signal.aborted) this.progress({ utterance: utt, offset: seg.end, kind: "end", estimated: false });
    } finally {
      this.nativeBusy = false;
    }
  }
}

export function createSpeaker(o: SpeakerOptions): Speaker {
  return new Speaker(o);
}

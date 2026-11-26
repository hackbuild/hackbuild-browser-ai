/**
 * The state behind VoiceClone: lines spoken one after another through a
 * loaded voice engine, handed to whatever plays them (a character stage
 * moves a mouth on the word times), and the voice clone of an engine that
 * clones (pocket) from an audio file or seconds of mic, kept as a wav.
 * Framework free; the mic and audio decoding need a browser.
 */

import { prepareClone, renderSpeech, renderedBuffer, renderedWav, toMono, type Engine, type PocketEngine, type VoiceConfig } from "@hackbuild/speak";

/** True when the engine clones a voice from reference audio. */
export const canClone = (e: unknown): e is PocketEngine => !!e && typeof (e as PocketEngine).cloneVoice === "function";

/** One line ready to play: the text, and for a rendering engine the audio with its word and phoneme times. */
export interface SpokenLine {
  text: string;
  audio?: AudioBuffer;
  words?: readonly { t0: number; t1: number; start?: number; end?: number; text?: string }[];
  phonemes?: readonly { t0: number; t1: number; phoneme?: string }[];
}

/** Options of `speaker`. */
export interface SpeakerOptions {
  /** Plays one line; resolves when it is over. A character stage's `say` fits. With none, the line is dropped after `onLine`. */
  play?: (line: SpokenLine) => Promise<void>;
  /** Stops what `play` is playing. */
  halt?: () => void;
  /** Each line as it starts, for a caption. */
  onLine?: (text: string) => void;
  /** The voice config each line uses; a clone sets its own. */
  config?: () => VoiceConfig;
}

/** Spoken lines in order, and the clone. */
export interface Speaker {
  /** Queues a line; resolves when it has been said or dropped. */
  say(text: string): Promise<void>;
  stop(): void;
  /** Clones from an audio file; resolves to seconds of reference used. */
  cloneFile(file: Blob): Promise<number>;
  /** Records `seconds` of mic and clones from it; `onTick` gets the seconds left. */
  cloneMic(seconds: number, onTick?: (left: number) => void): Promise<number>;
  /** The prepared reference as a wav, or null with no clone. */
  cloneWav(): Blob | null;
  clearClone(): void;
  readonly cloned: boolean;
  subscribe(fn: () => void): () => void;
}

/** Pocket takes its reference at this rate (vendor). */
const RATE = 24000;

/** A speaker over the engine `engine()` returns at each line (null: text only, timed by `play`). */
export function speaker(engine: () => Engine | null, o: SpeakerOptions = {}): Speaker {
  let ac: AudioContext | null = null;
  let chain: Promise<void> = Promise.resolve();
  let ctl = new AbortController();
  let ref: Float32Array | null = null;
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  const audio = () => (ac ??= new AudioContext());
  const config = (): VoiceConfig => (ref ? { voice: "custom" } : o.config?.() ?? {});

  const speak = async (text: string, signal: AbortSignal) => {
    if (signal.aborted) return;
    o.onLine?.(text);
    const e = engine();
    const play = o.play ?? (async () => undefined);
    if (!e) return void (await play({ text }));
    if (e.kind === "native") {
      void e.speak(text, config(), { onBoundary: () => undefined }, signal);
      return void (await play({ text }));
    }
    const r = await renderSpeech(e, text, { voice: config(), signal });
    if (signal.aborted) return;
    await play({ text, audio: renderedBuffer(audio(), r), words: r.words, phonemes: r.phonemes });
  };

  const decode = async (blob: Blob) => {
    const buf = await audio().decodeAudioData(await blob.arrayBuffer());
    const chans = Array.from({ length: buf.numberOfChannels }, (_, i) => buf.getChannelData(i));
    return { samples: toMono(chans), rate: buf.sampleRate };
  };
  const clone = async (samples: Float32Array, rate: number) => {
    const e = engine();
    if (!canClone(e)) throw new Error("this voice cannot clone. load pocket in the voice list first.");
    const next = prepareClone(samples, rate);
    await e.cloneVoice(next, RATE);
    ref = next;
    emit();
    return ref.length / RATE;
  };

  return {
    get cloned() {
      return !!ref;
    },
    subscribe(fn) {
      subs.add(fn);
      return () => subs.delete(fn);
    },
    say(text) {
      const signal = ctl.signal;
      chain = chain.then(() => speak(text, signal)).catch(() => undefined);
      return chain;
    },
    stop() {
      ctl.abort();
      ctl = new AbortController();
      chain = Promise.resolve();
      o.halt?.();
    },
    async cloneFile(file) {
      const { samples, rate } = await decode(file);
      return clone(samples, rate);
    },
    async cloneMic(seconds, onTick) {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        const rec = new MediaRecorder(media);
        const parts: Blob[] = [];
        rec.ondataavailable = (ev) => parts.push(ev.data);
        const done = new Promise<void>((ok) => (rec.onstop = () => ok()));
        rec.start();
        for (let left = seconds; left > 0; left--) {
          onTick?.(left);
          await new Promise((r) => setTimeout(r, 1000));
        }
        rec.stop();
        await done;
        const { samples, rate } = await decode(new Blob(parts, { type: rec.mimeType }));
        return await clone(samples, rate);
      } finally {
        media.getTracks().forEach((t) => t.stop());
      }
    },
    cloneWav() {
      if (!ref) return null;
      return renderedWav({ samples: ref, sampleRate: RATE, duration: ref.length / RATE, engine: "clone", words: [], phonemes: [] } as never);
    },
    clearClone() {
      ref = null;
      emit();
    },
  };
}

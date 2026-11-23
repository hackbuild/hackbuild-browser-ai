/** Engine contracts. A PCM engine yields audio for the shared player; a native engine plays itself. */

export interface VoiceConfig {
  voice?: string;
  /** 1 is the engine's normal speed. */
  rate?: number;
  pitch?: number;
}

/** A word or phoneme with its span in the text the engine was given and its time from the start of that text's audio, in seconds. */
export interface Timed {
  start: number;
  end: number;
  t0: number;
  t1: number;
  /** A phoneme symbol when the engine reports phonemes. */
  phoneme?: string;
}

export interface PcmChunk {
  samples: Float32Array;
  sampleRate: number;
  /** Timings inside this chunk, times relative to the chunk start. */
  words?: Timed[];
  phonemes?: Timed[];
}

export interface EngineStatus {
  engine: string;
  kind: "loading" | "ready" | "failed" | "patch-missed" | "watchdog" | "licence";
  text: string;
  progress?: number;
}

export interface LoadContext {
  signal?: AbortSignal;
  onStatus?: (s: EngineStatus) => void;
}

export interface PcmEngine {
  readonly kind: "pcm";
  readonly id: string;
  /** Weight licence, stated on first load. */
  readonly licence: string;
  load(ctx: LoadContext): Promise<void>;
  synth(text: string, cfg: VoiceConfig, signal: AbortSignal): AsyncIterable<PcmChunk>;
  voices?(): string[];
  dispose?(): void;
}

export interface NativeEngine {
  readonly kind: "native";
  readonly id: string;
  readonly licence: string;
  load(ctx: LoadContext): Promise<void>;
  /**
   * Speak and resolve when done. onBoundary gets character offsets in `text`;
   * onStart fires when the platform says audio started, when it says so.
   */
  speak(text: string, cfg: VoiceConfig, hooks: { onBoundary(charIndex: number, charLength?: number): void; onStart?(): void }, signal: AbortSignal): Promise<void>;
  stop(): void;
  voices?(): string[];
}

export type Engine = PcmEngine | NativeEngine;

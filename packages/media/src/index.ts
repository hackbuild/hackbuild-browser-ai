/**
 * Media helpers (SCRIBE, JIG): decode a file's audio track at a target
 * rate through an OfflineAudioContext, pick keyframes by scene change from
 * small luminance histograms, and record a canvas or stream with the first
 * MIME type the browser supports. Browser objects are injected so tests
 * and workers can pass their own.
 */

export interface DecodedAudio {
  sampleRate: number;
  channels: Float32Array[];
  duration: number;
}

interface AudioBufferLike {
  sampleRate: number;
  duration: number;
  numberOfChannels: number;
  length: number;
  getChannelData(c: number): Float32Array;
}

export interface OfflineCtxLike {
  decodeAudioData(b: ArrayBuffer): Promise<AudioBufferLike>;
  createBufferSource(): { buffer: AudioBufferLike | null; connect(d: unknown): void; start(): void };
  destination: unknown;
  startRendering(): Promise<AudioBufferLike>;
}

export type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineCtxLike;

/** Decode and resample with the browser's decoder (SCRIBE decode). Names the failure when the browser refuses the container. */
export async function decodeAudio(data: ArrayBuffer | Blob, sampleRate = 16000, Ctx?: OfflineCtor): Promise<DecodedAudio> {
  const C = Ctx ?? ((globalThis as { OfflineAudioContext?: OfflineCtor }).OfflineAudioContext as OfflineCtor | undefined);
  if (!C) throw new Error("no OfflineAudioContext here. decode on the page, not in a worker.");
  const ab = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  let buf: AudioBufferLike;
  try {
    buf = await new C(1, 1, sampleRate).decodeAudioData(ab);
  } catch (e) {
    throw new Error(`this browser will not decode the audio track (${e instanceof Error ? e.message : String(e)}). if it plays in a video tag it should decode; mkv and avi usually will not.`);
  }
  if (buf.sampleRate !== sampleRate) {
    const n = Math.max(1, Math.ceil(buf.duration * sampleRate));
    const oc = new C(buf.numberOfChannels, n, sampleRate);
    const s = oc.createBufferSource();
    s.buffer = buf;
    s.connect(oc.destination);
    s.start();
    buf = await oc.startRendering();
  }
  return { sampleRate: buf.sampleRate, duration: buf.duration, channels: Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c).slice()) };
}

/** A 32 bin luminance histogram of RGBA pixels, normalized to sum 1. */
export function lumaHistogram(rgba: ArrayLike<number>, bins = 32): Float32Array {
  const h = new Float32Array(bins);
  const n = Math.floor(rgba.length / 4);
  for (let i = 0; i < n; i++) {
    const y = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!;
    h[Math.min(bins - 1, Math.floor((y / 256) * bins))]! += 1;
  }
  for (let i = 0; i < bins; i++) h[i]! /= Math.max(1, n);
  return h;
}

/** Half the L1 distance of two normalized histograms: 0 same, 1 disjoint. */
export function histDistance(a: Float32Array, b: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i]! - b[i]!);
  return s / 2;
}

/**
 * Keyframes from sampled frames: the first frame, every frame whose
 * histogram moved more than `threshold` from the last keyframe, and at
 * least one every `maxGap` seconds; at most `max` frames, the biggest
 * changes kept.
 */
export function pickKeyframes(frames: readonly { t: number; hist: Float32Array }[], o: { threshold?: number; maxGap?: number; max?: number } = {}): number[] {
  const thr = o.threshold ?? 0.3;
  const gap = o.maxGap ?? Infinity;
  const keep: { i: number; score: number }[] = [];
  let last: { t: number; hist: Float32Array } | null = null;
  frames.forEach((f, i) => {
    if (!last) {
      keep.push({ i, score: Infinity });
      last = f;
      return;
    }
    const d = histDistance(last.hist, f.hist);
    if (d > thr || f.t - last.t >= gap) {
      keep.push({ i, score: d });
      last = f;
    }
  });
  const max = o.max ?? Infinity;
  return keep.length <= max
    ? keep.map((k) => k.i)
    : keep
        .sort((a, b) => b.score - a.score)
        .slice(0, max)
        .map((k) => k.i)
        .sort((a, b) => a - b);
}

/** Sample times for a video of `duration` seconds every `step` seconds, inside the clip. */
export function sampleTimes(duration: number, step = 1): number[] {
  const out: number[] = [];
  for (let t = Math.min(0.05, duration / 2); t < duration; t += step) out.push(+t.toFixed(3));
  return out;
}

export const RECORDER_TYPES = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4;codecs=avc1,mp4a", "video/mp4"];

/** The first type the recorder supports, or "" for the browser default. */
export function pickMime(isSupported: (t: string) => boolean = (t) => (globalThis as { MediaRecorder?: { isTypeSupported(t: string): boolean } }).MediaRecorder?.isTypeSupported(t) ?? false, types = RECORDER_TYPES): string {
  return types.find((t) => isSupported(t)) ?? "";
}

interface RecorderLike {
  start(timeslice?: number): void;
  stop(): void;
  ondataavailable: ((e: { data: Blob }) => void) | null;
  onstop: (() => void) | null;
  readonly mimeType?: string;
}

/** Record a MediaStream (canvas.captureStream() plus audio tracks) until `stop()`; resolves the Blob. */
export function record(
  stream: unknown,
  o: { mimeType?: string; bitsPerSecond?: number; Recorder?: new (s: unknown, opts: Record<string, unknown>) => RecorderLike; timeslice?: number } = {},
): { stop(): Promise<Blob>; mimeType: string } {
  const R = o.Recorder ?? ((globalThis as { MediaRecorder?: new (s: unknown, opts: Record<string, unknown>) => RecorderLike }).MediaRecorder as never);
  if (!R) throw new Error("no MediaRecorder in this browser. recording is off.");
  const mimeType = o.mimeType ?? pickMime();
  const rec = new R(stream, { ...(mimeType ? { mimeType } : {}), ...(o.bitsPerSecond ? { videoBitsPerSecond: o.bitsPerSecond } : {}) });
  const parts: Blob[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) parts.push(e.data);
  };
  const done = new Promise<Blob>((r) => (rec.onstop = () => r(new Blob(parts, { type: mimeType || rec.mimeType || "video/webm" }))));
  rec.start(o.timeslice ?? 1000);
  return {
    mimeType,
    stop: () => {
      rec.stop();
      return done;
    },
  };
}

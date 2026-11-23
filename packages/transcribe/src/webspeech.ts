/**
 * Web Speech recognition as a zero download path (Chrome sends audio to
 * its own service; say so in the UI). Final results become segments with
 * times from the clock, since the API gives none.
 */

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((ev: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
}

export interface WebSpeechOptions {
  lang?: string;
  interim?: boolean;
  /** Constructor; default globalThis.SpeechRecognition or webkitSpeechRecognition. */
  Recognition?: new () => SpeechRecognitionLike;
  now?: () => number;
  onSegment: (s: { start: number; end: number; text: string; final: boolean }) => void;
  onError?: (error: string) => void;
}

export function webSpeechAvailable(g: Record<string, unknown> = globalThis as unknown as Record<string, unknown>): boolean {
  return typeof (g.SpeechRecognition ?? g.webkitSpeechRecognition) === "function";
}

export function webSpeech(o: WebSpeechOptions): { start(): void; stop(): void } {
  const g = globalThis as unknown as Record<string, unknown>;
  const R = o.Recognition ?? ((g.SpeechRecognition ?? g.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined);
  if (!R) throw new Error("no web speech recognition in this browser. use a whisper model.");
  const now = o.now ?? (() => Date.now());
  const rec = new R();
  rec.lang = o.lang ?? "en-US";
  rec.continuous = true;
  rec.interimResults = o.interim ?? false;
  let t0 = 0;
  let lastEnd = 0;
  let running = false;
  rec.onresult = (ev) => {
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      const text = (r[0]?.transcript ?? "").trim();
      if (!text) continue;
      const end = (now() - t0) / 1000;
      o.onSegment({ start: lastEnd, end, text, final: r.isFinal });
      if (r.isFinal) lastEnd = end;
    }
  };
  rec.onerror = (ev) => {
    // a refused or missing microphone ends for good; restarting on end would loop
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") running = false;
    o.onError?.(ev.error);
  };
  rec.onend = () => {
    if (running) rec.start();
  };
  return {
    start() {
      t0 = now();
      lastEnd = 0;
      running = true;
      rec.start();
    },
    stop() {
      running = false;
      rec.stop();
    },
  };
}

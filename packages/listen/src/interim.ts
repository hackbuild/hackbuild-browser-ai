/**
 * Interim text while the person speaks: the typed event both engines
 * emit, the stable word prefix, a self hearing gate, the system
 * recognizer engine, and `dictate`, which writes interim words into an
 * input and commits them on the final.
 */

import type { SpeechRecognitionLike } from "@hackbuild/transcribe";

/** Words heard so far in the utterance in progress; replaced by the next one, never appended. */
export interface Interim {
  /** The whole hypothesis so far. */
  text: string;
  /** Leading words unchanged since the previous hypothesis of this utterance. */
  stable: string;
  /** Seconds since the utterance started (audio time on the window path, clock time on the system recognizer). */
  t: number;
}

/** The leading words two hypotheses share, compared without case or punctuation. */
export function stablePrefix(prev: string, next: string): string {
  const a = prev.trim().split(/\s+/).filter(Boolean);
  const b = next.trim().split(/\s+/).filter(Boolean);
  const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  let n = 0;
  while (n < a.length && n < b.length && norm(a[n]!) === norm(b[n]!)) n++;
  return b.slice(0, n).join(" ");
}

/** Closed while the character speaks and for `tailMs` after, so it does not hear itself. */
export interface SelfGate {
  setSpeaking(b: boolean): void;
  readonly open: boolean;
}

/** Makes a SelfGate that closes while the character speaks and for `tailMs` after (default 400 ms). */
export function selfGate(o: { tailMs?: number; now?: () => number } = {}): SelfGate {
  const tail = o.tailMs ?? 400;
  const now = o.now ?? (() => Date.now());
  let speaking = false;
  let endedAt = -Infinity;
  return {
    setSpeaking(b) {
      if (speaking && !b) endedAt = now();
      speaking = b;
    },
    get open() {
      return !speaking && now() - endedAt >= tail;
    },
  };
}

/** The system recognizer's state: off, listening, unsupported or denied. */
export type SpeechEngineState = "off" | "listening" | "unsupported" | "denied";

/** Language, recognizer constructor, self gate, restart delay and callbacks for speechEngine. */
export interface SpeechEngineOptions {
  lang?: string;
  /** Constructor; default globalThis.SpeechRecognition or webkitSpeechRecognition. */
  Recognition?: new () => SpeechRecognitionLike;
  now?: () => number;
  /** Results that arrive while this gate is closed are dropped. */
  gate?: SelfGate;
  /** Delay before restarting after the recognizer ends on its own. Default 150 ms. */
  restartMs?: number;
  onInterim?(i: Interim): void;
  onFinal?(text: string): void;
  onState?(s: SpeechEngineState): void;
  onError?(error: string): void;
}

/** The system recognizer with start, stop and its state. */
export interface SpeechEngine {
  start(): void;
  stop(): void;
  readonly state: SpeechEngineState;
}

/**
 * The browser's system recognizer with interim results (Chrome sends the
 * audio to its own service; say so in the UI). With no recognizer the
 * engine reports "unsupported"; a refused microphone reports "denied".
 */
export function speechEngine(o: SpeechEngineOptions = {}): SpeechEngine {
  const g = globalThis as unknown as Record<string, unknown>;
  const R = o.Recognition ?? ((g.SpeechRecognition ?? g.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined);
  const now = o.now ?? (() => Date.now());
  let state: SpeechEngineState = R ? "off" : "unsupported";
  const set = (s: SpeechEngineState) => {
    if (s === state) return;
    state = s;
    o.onState?.(s);
  };
  if (!R) return { start: () => o.onState?.("unsupported"), stop() {}, get state() { return state; } };
  const rec = new R();
  rec.lang = o.lang ?? "en-US";
  rec.continuous = true;
  rec.interimResults = true;
  let running = false;
  let prev = "";
  let t0 = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  rec.onresult = (ev) => {
    const gated = o.gate && !o.gate.open;
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i]!;
      const text = (r[0]?.transcript ?? "").trim();
      if (r.isFinal) {
        prev = "";
        if (!gated && text) o.onFinal?.(text);
      } else if (text) interim += (interim ? " " : "") + text;
    }
    if (gated || !interim) return;
    if (!prev) t0 = now();
    o.onInterim?.({ text: interim, stable: stablePrefix(prev, interim), t: (now() - t0) / 1000 });
    prev = interim;
  };
  rec.onerror = (ev) => {
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed" || ev.error === "audio-capture") {
      running = false;
      set("denied");
    }
    o.onError?.(ev.error);
  };
  rec.onend = () => {
    prev = "";
    if (running) timer = setTimeout(() => running && rec.start(), o.restartMs ?? 150);
    else if (state === "listening") set("off");
  };
  return {
    start() {
      running = true;
      prev = "";
      rec.start();
      set("listening");
    },
    stop() {
      running = false;
      clearTimeout(timer);
      rec.stop();
      set("off");
    },
    get state() {
      return state;
    },
  };
}

/** Anything with a text value: an input, a textarea, or a plain object in tests. */
export interface DictateTarget {
  value: string;
  dispatchEvent?(e: Event): boolean;
}

/** Writes interim words into a text field and commits or cancels them. */
export interface Dictation {
  /** Show interim words after what the person had typed. */
  interim(i: Interim): void;
  /** Commit the final text; an empty final restores what was there. Returns the new value. */
  final(text: string): string;
  /** Drop interim words and restore what was there. */
  cancel(): void;
  /** Interim words are on screen. */
  readonly active: boolean;
}

/**
 * Write interim text into an input and commit it on the final. Typed text
 * before the first interim word is kept; each write fires an input event
 * so a framework binding sees it. `onCommit` gets the value after a
 * non empty final, for a hands free send.
 */
export function dictate(target: DictateTarget, o: { onCommit?(value: string): void } = {}): Dictation {
  let base: string | null = null;
  const join = (b: string, t: string) => (!b || !t || /\s$/.test(b) ? b + t : `${b} ${t}`);
  const write = (v: string) => {
    target.value = v;
    if (target.dispatchEvent && typeof Event === "function") target.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    interim(i) {
      if (base === null) base = target.value;
      write(join(base, i.text));
    },
    final(text) {
      const b = base ?? target.value;
      base = null;
      const v = join(b, text.trim());
      write(v);
      if (text.trim()) o.onCommit?.(v);
      return v;
    },
    cancel() {
      if (base !== null) write(base);
      base = null;
    },
    get active() {
      return base !== null;
    },
  };
}

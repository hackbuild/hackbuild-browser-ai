/**
 * The state behind TranscribeDrop and TranscriptView, after the earlier
 * transcription tool: drop files, they queue as channels, run one at a
 * time, and each becomes a transcript with timestamps that a person can
 * edit (with undo) and export as txt, srt, vtt or json. The engine is a
 * function the page passes, so a stub runs the view with no weights.
 */

import { asJson, asSrt, asTxt, asVtt, baseName, type Dropped, type Seg } from "@hackbuild/transcribe";
import { stripMeta, type StripFigure, type StripStatus } from "@virgilvox/hackbuild-ui/vanilla";

/** What a transcriber returns: segments, dropped lines, duration, language and model. */
export interface RunResult {
  segments: Seg[];
  dropped?: Dropped[];
  /** Seconds of audio. */
  duration?: number;
  language?: string;
  model?: string;
}

/** What a transcriber gets: an abort signal and a progress callback. */
export interface RunContext {
  signal: AbortSignal;
  /** 0 to 1. */
  onProgress: (fraction: number) => void;
}

/** Turns one file into a transcript. A page wires @hackbuild/transcribe here; a stub needs none. */
export type Transcriber = (file: Blob & { name: string }, ctx: RunContext) => Promise<RunResult>;

/**
 * One file in a transcribe queue: name, size, status, progress, segments, dropped lines and the
 * error if it failed.
 */
export interface Channel {
  id: number;
  name: string;
  size: number;
  status: StripStatus;
  /** 0 to 100 while running. */
  pct: number;
  segments: Seg[];
  dropped: Dropped[];
  duration?: number;
  language?: string;
  model?: string;
  error?: string;
  meta: StripFigure[];
}

/** A transcript export format: txt, srt, vtt or json. */
export type ExportKind = "txt" | "srt" | "vtt" | "json";

/** What a transcribe queue shows: channels, the selected one, whether it runs, and undo state. */
export interface QueueSnapshot {
  channels: readonly Channel[];
  selected: number | null;
  running: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

/**
 * A transcribe queue: add files, start and stop, select, edit lines with undo, and export a channel
 * as txt, srt, vtt or json.
 */
export interface TranscribeQueue {
  snapshot(): QueueSnapshot;
  subscribe(fn: (s: QueueSnapshot) => void): () => void;
  /** Queue files; starts the run unless `autostart` is off. */
  add(files: Iterable<Blob & { name: string }>): void;
  start(): Promise<void>;
  stop(): void;
  remove(id: number): void;
  clear(): void;
  select(id: number): void;
  /** Change one line's text or speaker; one undo step. */
  edit(id: number, index: number, patch: { text?: string; speaker?: string }): void;
  undo(): void;
  redo(): void;
  /** One channel as a file: its name, text and media type. */
  exportAs(kind: ExportKind, id?: number): { name: string; text: string; type: string } | null;
  setTranscriber(t: Transcriber): void;
}

const TYPES: Record<ExportKind, string> = { txt: "text/plain", srt: "application/x-subrip", vtt: "text/vtt", json: "application/json" };

/** Creates a transcribe queue that runs each file through `run`, one at a time. */
export function transcribeQueue(o: { run: Transcriber; autostart?: boolean }): TranscribeQueue {
  let run = o.run;
  let channels: Channel[] = [];
  const files = new Map<number, Blob & { name: string }>();
  let selected: number | null = null;
  let running = false;
  let ac: AbortController | null = null;
  let seq = 0;
  const undo: { id: number; segments: Seg[] }[] = [];
  const redo: { id: number; segments: Seg[] }[] = [];
  const subs = new Set<(s: QueueSnapshot) => void>();
  const snap = (): QueueSnapshot => ({ channels, selected, running, canUndo: undo.length > 0, canRedo: redo.length > 0 });
  const emit = () => {
    const s = snap();
    for (const fn of subs) fn(s);
  };
  const patch = (id: number, p: Partial<Channel>) => {
    channels = channels.map((c) => (c.id === id ? { ...c, ...p } : c));
    emit();
  };
  const metaOf = (c: Channel) => stripMeta({ size: c.size, ...(c.duration ? { duration: c.duration } : {}), ...(c.status === "done" ? { lines: c.segments.length } : {}) });

  const q: TranscribeQueue = {
    snapshot: snap,
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
      return () => subs.delete(fn);
    },
    add(list) {
      for (const f of list) {
        const id = ++seq;
        files.set(id, f);
        const c: Channel = { id, name: f.name, size: f.size, status: "queued", pct: 0, segments: [], dropped: [], meta: [] };
        c.meta = metaOf(c);
        channels = [...channels, c];
        if (selected === null) selected = id;
      }
      emit();
      if (o.autostart !== false) void q.start();
    },
    async start() {
      if (running) return;
      running = true;
      emit();
      for (;;) {
        const next = channels.find((c) => c.status === "queued");
        if (!next || !running) break;
        const file = files.get(next.id)!;
        ac = new AbortController();
        patch(next.id, { status: "working", pct: 0 });
        try {
          const r = await run(file, { signal: ac.signal, onProgress: (f) => patch(next.id, { pct: Math.round(Math.min(1, Math.max(0, f)) * 100) }) });
          const c = channels.find((x) => x.id === next.id);
          if (!c) continue;
          const done: Channel = { ...c, status: r.segments.length ? "done" : "empty", pct: 100, segments: r.segments, dropped: r.dropped ?? [] };
          if (r.duration !== undefined) done.duration = r.duration;
          if (r.language) done.language = r.language;
          if (r.model) done.model = r.model;
          done.meta = metaOf(done);
          patch(next.id, done);
          if (selected === null || channels.find((x) => x.id === selected)?.status !== "done") selected = next.id;
        } catch (e) {
          const stopped = ac.signal.aborted;
          patch(next.id, stopped ? { status: "queued", pct: 0 } : { status: "failed", error: e instanceof Error ? e.message : String(e) });
          if (stopped) break;
        }
      }
      running = false;
      ac = null;
      emit();
    },
    stop() {
      running = false;
      ac?.abort();
      emit();
    },
    remove(id) {
      if (channels.find((c) => c.id === id)?.status === "working") ac?.abort();
      channels = channels.filter((c) => c.id !== id);
      files.delete(id);
      if (selected === id) selected = channels[0]?.id ?? null;
      emit();
    },
    clear() {
      q.stop();
      channels = [];
      files.clear();
      selected = null;
      undo.length = 0;
      redo.length = 0;
      emit();
    },
    select(id) {
      selected = id;
      emit();
    },
    edit(id, index, p) {
      const c = channels.find((x) => x.id === id);
      const seg = c?.segments[index];
      if (!c || !seg) return;
      const next: Seg = { ...seg, edited: true };
      if (p.text !== undefined) next.text = p.text;
      if (p.speaker !== undefined) {
        if (p.speaker) next.speaker = p.speaker;
        else delete next.speaker;
      }
      if (next.text === seg.text && next.speaker === seg.speaker) return;
      undo.push({ id, segments: c.segments });
      redo.length = 0;
      patch(id, { segments: c.segments.map((s, i) => (i === index ? next : s)) });
    },
    undo() {
      const u = undo.pop();
      const c = u && channels.find((x) => x.id === u.id);
      if (!u || !c) return emit();
      redo.push({ id: u.id, segments: c.segments });
      patch(u.id, { segments: u.segments });
    },
    redo() {
      const r = redo.pop();
      const c = r && channels.find((x) => x.id === r.id);
      if (!r || !c) return emit();
      undo.push({ id: r.id, segments: c.segments });
      patch(r.id, { segments: r.segments });
    },
    exportAs(kind, id = selected ?? -1) {
      const c = channels.find((x) => x.id === id);
      if (!c || !c.segments.length) return null;
      const text =
        kind === "txt"
          ? asTxt(c.segments)
          : kind === "srt"
            ? asSrt(c.segments)
            : kind === "vtt"
              ? asVtt(c.segments)
              : asJson({ source: c.name, segments: c.segments, dropped: c.dropped, model: c.model ?? "unknown", language: c.language ?? "unknown", ...(c.duration !== undefined ? { duration: c.duration } : {}) });
      return { name: `${baseName(c.name)}.${kind}`, text, type: TYPES[kind] };
    },
    setTranscriber(t) {
      run = t;
    },
  };
  return q;
}

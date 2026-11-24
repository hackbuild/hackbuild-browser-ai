/**
 * One conversation over a streaming engine: send, stop, redo, edit,
 * remove, speak again, restore and clear, with the reply fed through an
 * optional director (cue tags out of the visible text) and speaker, and
 * memory and camera lines kept on the turn they were recalled for.
 * Framework free: state changes come out as events.
 */

import { buildMessages, type HistoryOptions } from "./history.js";
import { createSession, migrateSession, type ChatSession, type SessionMessage } from "./session.js";
import { createChatStore, type ChatSink, type ChatStore } from "./store.js";
import type { ChatMessage, ConverseEngine, DirectorLike, RecordedCue, ReplyStats, SpeakerLike, Timers, ToolCall } from "./types.js";

export interface ConverseOptions {
  engine: ConverseEngine;
  /** Clock in ms for message times and new sessions. */
  now: () => number;
  /** New message ids. Default a counter on the clock. */
  makeId?: () => string;
  /** Session id to restore and save under. Default "chat". */
  id?: string;
  system?: string;
  /** An assistant line shown first in a new conversation; it never goes to the engine. */
  greeting?: string;
  /** Options passed to every `engine.stream` call, e.g. maxTokens. */
  streamOptions?: Record<string, unknown>;
  /** Keep at most this many messages in a request; never fewer than 2. */
  historyLimit?: number;
  director?: DirectorLike;
  speaker?: SpeakerLike;
  /** Fires a recorded cue when a message is spoken again. */
  replayCue?: (cue: RecordedCue) => void;
  /** Recall for a user turn; the lines are kept on that turn. */
  memory?: { recall(text: string): Promise<{ id: string; text: string }[]> | { id: string; text: string }[] };
  /** What the camera sees now, one line, or nothing. */
  seen?: () => string | null | undefined;
  sink?: ChatSink;
  timers?: Timers;
  debounceMs?: number;
}

export type ConverseEvent =
  | { type: "change"; session: ChatSession }
  | { type: "text"; id: string; text: string }
  | { type: "think"; id: string; text: string }
  | { type: "done"; message: SessionMessage }
  | { type: "error"; message: SessionMessage; error: unknown }
  | { type: "busy"; busy: boolean };

export interface Conversation {
  readonly session: ChatSession;
  readonly busy: boolean;
  on(fn: (e: ConverseEvent) => void): () => void;
  /** Load the stored session (or start one with the greeting); saves start after this resolves. */
  restore(): Promise<ChatSession>;
  /** Add a user turn and stream the reply. Resolves with the reply, or null when it was empty or aborted before a word. */
  send(text: string): Promise<SessionMessage | null>;
  /** Abort the reply and the voice. */
  stop(): void;
  /** Drop the last reply and ask again. */
  redo(): Promise<SessionMessage | null>;
  /** Change a turn and drop everything after it; a changed user turn is answered again. */
  edit(id: string, text: string): Promise<SessionMessage | null>;
  remove(id: string): void;
  /** Speak a message again, replaying its recorded cues; false when there is no speaker or no such message. */
  speak(id: string): boolean;
  /** Speech reached this offset of the visible text; call it from the speaker's progress. */
  reached(offset: number): void;
  /** Start over: no messages, the greeting again. */
  clear(): void;
  /** Evaluate the current request into the engine's prefix cache. */
  prewarm(): Promise<boolean>;
  /** The request the next reply would send. */
  request(): ChatMessage[];
  /** Write a waiting save now. */
  flush(): Promise<void>;
}

const isAbort = (e: unknown, signal: AbortSignal) => signal.aborted || (e instanceof Error && e.name === "AbortError");

export function createConversation(o: ConverseOptions): Conversation {
  let n = 0;
  const makeId = o.makeId ?? (() => `m${o.now().toString(36)}${(n++).toString(36)}`);
  const id = o.id ?? "chat";
  const listeners = new Set<(e: ConverseEvent) => void>();
  const store: ChatStore | null = o.sink ? createChatStore(o.sink, { ...(o.timers ? { timers: o.timers } : {}), ...(o.debounceMs !== undefined ? { debounceMs: o.debounceMs } : {}) }) : null;
  const history: HistoryOptions = { memory: !!o.memory, seen: !!o.seen, ...(o.historyLimit !== undefined ? { limit: o.historyLimit } : {}) };
  let session = fresh();
  let ctrl: AbortController | null = null;
  let running: Promise<unknown> = Promise.resolve();
  let replay: { left: RecordedCue[] } | null = null;

  function fresh(): ChatSession {
    const s = createSession({ id, now: o.now(), ...(o.system !== undefined ? { system: o.system } : {}) });
    if (o.greeting) s.messages.push({ id: makeId(), role: "assistant", content: o.greeting, at: o.now() });
    return s;
  }
  const emit = (e: ConverseEvent) => {
    for (const fn of listeners) fn(e);
  };
  const changed = () => {
    session.updated = o.now();
    store?.save(session);
    emit({ type: "change", session });
  };
  const find = (mid: string) => session.messages.findIndex((m) => m.id === mid);

  async function reply(): Promise<SessionMessage | null> {
    const c = new AbortController();
    ctrl = c;
    replay = null;
    emit({ type: "busy", busy: true });
    const req = buildMessages(session, history);
    const msg: SessionMessage = { id: makeId(), role: "assistant", content: "", at: o.now() };
    session.messages.push(msg);
    changed();
    o.director?.begin();
    let raw = "";
    let think = "";
    let stats: ReplyStats | undefined;
    let calls: ToolCall[] = [];
    let error: unknown;
    let failed = false;
    try {
      for await (const ev of o.engine.stream(req, { ...o.streamOptions, signal: c.signal })) {
        if (ev.type === "text") {
          raw += ev.text;
          msg.content += o.director ? o.director.feed(ev.text).text : ev.text;
          msg.raw = raw;
          o.speaker?.feed(msg.content, false);
          emit({ type: "text", id: msg.id, text: msg.content });
        } else if (ev.type === "think") {
          think += ev.text;
          msg.think = think;
          emit({ type: "think", id: msg.id, text: think });
        } else if (ev.type === "tool") calls.push(...ev.calls);
        else {
          if (ev.result.stats) stats = ev.result.stats;
          if (ev.result.toolCalls?.length) calls = ev.result.toolCalls;
        }
      }
    } catch (e) {
      if (!isAbort(e, c.signal)) {
        failed = true;
        error = e;
      }
    }
    if (o.director) msg.content += o.director.finish().text;
    if (ctrl === c) ctrl = null;
    if (raw && raw !== msg.content) msg.raw = raw;
    else delete msg.raw;
    if (stats) msg.stats = stats;
    if (calls.length) msg.toolCalls = calls;
    if (failed) {
      msg.error = (error instanceof Error ? error.message : String(error)) || "the engine stopped";
      changed();
      emit({ type: "busy", busy: false });
      emit({ type: "error", message: msg, error });
      return msg;
    }
    if (!msg.content.trim() && !calls.length) {
      session.messages.splice(find(msg.id), 1);
      changed();
      emit({ type: "busy", busy: false });
      return null;
    }
    if (o.director) {
      msg.cues = o.director.record();
      // with no voice the cues the speech never reaches fire now
      if (!o.speaker && !c.signal.aborted) o.director.reached(msg.content.length);
    }
    if (o.speaker && !c.signal.aborted) o.speaker.feed(msg.content, true);
    changed();
    emit({ type: "busy", busy: false });
    emit({ type: "done", message: msg });
    return msg;
  }

  const queue = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = running.then(fn, fn);
    running = next.catch(() => undefined);
    return next;
  };

  const conv: Conversation = {
    get session() {
      return session;
    },
    get busy() {
      return ctrl !== null;
    },
    on(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async restore() {
      const raw = o.sink ? await o.sink.load(id) : null;
      if (raw) {
        session = migrateSession(raw, { id, now: o.now() });
        if (o.system !== undefined) session.system = o.system;
      } else session = fresh();
      store?.markRestored();
      emit({ type: "change", session });
      return session;
    },
    send(text) {
      conv.stop();
      return queue(async () => {
        const m: SessionMessage = { id: makeId(), role: "user", content: text, at: o.now() };
        const seen = o.seen?.();
        if (seen) m.seen = seen;
        if (o.memory) {
          const r = await o.memory.recall(text);
          if (r.length) m.recalled = r.map((x) => ({ id: x.id, text: x.text }));
        }
        session.messages.push(m);
        changed();
        return reply();
      });
    },
    stop() {
      ctrl?.abort();
      o.speaker?.stop();
      replay = null;
    },
    redo() {
      conv.stop();
      return queue(async () => {
        const last = session.messages.length - 1;
        if (last >= 0 && session.messages[last]!.role === "assistant") session.messages.splice(last, 1);
        if (!session.messages.some((m) => m.role === "user")) return null;
        changed();
        return reply();
      });
    },
    edit(mid, text) {
      conv.stop();
      return queue(async () => {
        const i = find(mid);
        if (i < 0) return null;
        const m = session.messages[i]!;
        m.content = text;
        delete m.raw;
        m.edited = true;
        session.messages.length = i + 1;
        changed();
        return m.role === "user" ? reply() : null;
      });
    },
    remove(mid) {
      const i = find(mid);
      if (i < 0) return;
      session.messages.splice(i, 1);
      changed();
    },
    speak(mid) {
      const m = session.messages.find((x) => x.id === mid);
      if (!m || !o.speaker) return false;
      o.speaker.stop();
      const rec = m.cues as { cues?: RecordedCue[] } | undefined;
      if (rec && Array.isArray(rec.cues)) {
        replay = { left: [...rec.cues].sort((a, b) => a.at - b.at) };
        o.speaker.feed(m.content, true);
      } else if (o.director && m.role === "assistant") {
        // no record: run the raw reply through the director again
        replay = null;
        o.director.begin();
        let text = o.director.feed(m.raw ?? m.content).text;
        text += o.director.finish().text;
        o.speaker.feed(text, true);
      } else o.speaker.feed(m.content, true);
      return true;
    },
    reached(offset) {
      if (replay) {
        const due = replay.left.filter((c) => c.at <= offset);
        replay.left = replay.left.filter((c) => c.at > offset);
        for (const c of due) o.replayCue?.(c);
        return;
      }
      o.director?.reached(offset);
    },
    clear() {
      conv.stop();
      session = fresh();
      changed();
    },
    async prewarm() {
      return o.engine.prewarm ? o.engine.prewarm(buildMessages(session, history)) : false;
    },
    request: () => buildMessages(session, history),
    flush: () => store?.flush() ?? Promise.resolve(),
  };
  return conv;
}

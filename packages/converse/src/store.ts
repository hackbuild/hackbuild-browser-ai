/**
 * A debounced save of one session to a sink. Nothing is saved until the
 * stored session has loaded, and a reply still waiting for its first word
 * is left out of every save.
 */

import type { ChatSession, SessionMessage } from "./session.js";
import type { Timers } from "./types.js";

/** Where sessions live; the suite backs it with its document store. */
export interface ChatSink {
  load(id: string): Promise<unknown>;
  save(session: ChatSession): Promise<void>;
}

/** Debounce between a change and its save, in ms (vendor, from an earlier build). */
export const SAVE_DEBOUNCE_MS = 600;

const defaultTimers: Timers = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
};

/** A message worth saving: anything but an assistant reply with no text, no think, no tool call and no error yet. */
export function savable(m: SessionMessage): boolean {
  return !(m.role === "assistant" && !m.content && !m.raw && !m.think && !m.toolCalls?.length && m.error === undefined);
}

/** A debounced saver of one session; it drops saves until `markRestored()` is called. */
export interface ChatStore {
  /** False until `restored()` is called; saves before that are dropped. */
  readonly restored: boolean;
  markRestored(): void;
  /** Schedule a save of this session. */
  save(session: ChatSession): void;
  /** Save now if a save is waiting. */
  flush(): Promise<void>;
}

/** Make a store that saves to `sink` 600 ms after the last change, leaving out replies still waiting for their first word. */
export function createChatStore(sink: ChatSink, o: { debounceMs?: number; timers?: Timers; onError?: (e: unknown) => void } = {}): ChatStore {
  const timers = o.timers ?? defaultTimers;
  const ms = o.debounceMs ?? SAVE_DEBOUNCE_MS;
  let restored = false;
  let waiting: ChatSession | null = null;
  let handle: unknown = null;
  const write = async () => {
    handle = null;
    const s = waiting;
    waiting = null;
    if (!s) return;
    try {
      await sink.save({ ...s, messages: s.messages.filter(savable) });
    } catch (e) {
      o.onError?.(e);
    }
  };
  return {
    get restored() {
      return restored;
    },
    markRestored() {
      restored = true;
    },
    save(session) {
      if (!restored) return;
      waiting = session;
      if (handle !== null) timers.clearTimeout(handle);
      handle = timers.setTimeout(() => void write(), ms);
    },
    async flush() {
      if (handle !== null) timers.clearTimeout(handle);
      await write();
    },
  };
}

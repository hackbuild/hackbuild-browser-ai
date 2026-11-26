/**
 * The state behind ChatPane and Composer, after the earlier chat tools: a
 * thread of turns, one live reply streamed from a @hackbuild/chat engine
 * with its reasoning kept apart for the think fold, the memory each reply
 * used, stop, regenerate, and a markdown export. Framework free.
 */

import type { ChatEngine, ChatMessage } from "@hackbuild/chat";
import { statsText } from "@virgilvox/hackbuild-ui/vanilla";

/** A memory recalled for a reply, with its label and score. */
export interface MemoryUsed {
  label: string;
  /** 0 to 1, shown beside the label. */
  score?: number;
}

/** One chat turn: role, text, reasoning, time, whether it is done, memory used, stats and a note. */
export interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  /** Reasoning, shown in a fold under the reply. */
  think: string;
  at: number;
  done: boolean;
  /** Memory recalled for this reply. */
  mem?: MemoryUsed[];
  /** "31.2 tok/s, first word 0.64 s, 44 tok (measured)". */
  stats?: string;
  /** "stopped", "failed: ...". */
  note?: string;
}

/** What a thread shows: its turns, whether a reply streams, and whether an engine is set. */
export interface ThreadSnapshot {
  turns: readonly Turn[];
  busy: boolean;
  /** An engine is set; without one a reply says how to get one. */
  ready: boolean;
}

/**
 * Options for `chatThread` and `chatList`: engine, system prompt, memory recall, the no engine
 * reply, clock and reply token cap.
 */
export interface ThreadOptions {
  engine?: ChatEngine | null;
  system?: string;
  /** Memory for a message; its hits ride along in the system prompt and show under the reply. */
  recall?: (query: string) => Promise<MemoryUsed[]>;
  /** What a reply says with no engine. */
  noEngine?: string;
  now?: () => number;
  /** Reply token cap. */
  maxTokens?: number;
}

/** A chat thread: send, stop, regenerate, remove and clear turns, set the engine, and export as markdown. */
export interface ChatThread {
  snapshot(): ThreadSnapshot;
  subscribe(fn: (s: ThreadSnapshot) => void): () => void;
  send(text: string): Promise<void>;
  stop(): void;
  /** Drop the last reply and ask again. */
  regenerate(): Promise<void>;
  remove(id: number): void;
  clear(): void;
  setEngine(engine: ChatEngine | null): void;
  /** The thread as markdown, for an export. */
  markdown(title?: string): string;
}

/** What a reply says when no chat engine is set. */
export const NO_ENGINE = "this needs a model. pick one in the bar and load it.";

/** Creates a chat thread that streams replies from an engine, with optional memory recall per message. */
export function chatThread(o: ThreadOptions = {}): ChatThread {
  let engine = o.engine ?? null;
  const now = o.now ?? (() => Date.now());
  let turns: Turn[] = [];
  let busy = false;
  let ac: AbortController | null = null;
  let seq = 0;
  const subs = new Set<(s: ThreadSnapshot) => void>();
  const snap = (): ThreadSnapshot => ({ turns, busy, ready: !!engine });
  const emit = () => {
    const s = snap();
    for (const fn of subs) fn(s);
  };
  const patch = (id: number, p: Partial<Turn>) => {
    turns = turns.map((t) => (t.id === id ? { ...t, ...p } : t));
    emit();
  };

  async function reply(): Promise<void> {
    const lastUser = [...turns].reverse().find((t) => t.role === "user");
    const live: Turn = { id: ++seq, role: "assistant", text: "", think: "", at: now(), done: false };
    turns = [...turns, live];
    busy = true;
    emit();
    if (!engine) {
      patch(live.id, { text: o.noEngine ?? NO_ENGINE, done: true });
      busy = false;
      emit();
      return;
    }
    ac = new AbortController();
    const signal = ac.signal;
    let mem: MemoryUsed[] = [];
    try {
      if (o.recall && lastUser) mem = await o.recall(lastUser.text);
      if (mem.length) patch(live.id, { mem });
      const sys = [o.system, mem.length ? `things you remember:\n${mem.map((m) => `- ${m.label}`).join("\n")}` : ""].filter(Boolean).join("\n\n");
      const history: ChatMessage[] = [
        ...(sys ? [{ role: "system" as const, content: sys }] : []),
        ...turns.filter((t) => t.id !== live.id && t.text).map((t) => ({ role: t.role, content: t.text })),
      ];
      let text = "";
      let think = "";
      const it = engine.stream(history, { signal, ...(o.maxTokens ? { maxTokens: o.maxTokens } : {}) });
      for (;;) {
        const step = await it.next();
        if (step.done) {
          const s = step.value?.stats;
          const stats = s ? statsText({ tokPerSec: s.tokensPerSecond, firstMs: s.firstTokenMs, tokens: s.tokens, source: s.tokensSource }) : "";
          patch(live.id, { done: true, ...(stats ? { stats } : {}) });
          break;
        }
        const ev = step.value;
        if (ev.type === "text") text += ev.text;
        else if (ev.type === "think") think += ev.text;
        else continue;
        patch(live.id, { text, think });
      }
    } catch (e) {
      const stopped = signal.aborted;
      patch(live.id, { done: true, note: stopped ? "stopped" : `failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      busy = false;
      ac = null;
      emit();
    }
  }

  return {
    snapshot: snap,
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
      return () => subs.delete(fn);
    },
    async send(text) {
      const t = text.trim();
      if (!t || busy) return;
      turns = [...turns, { id: ++seq, role: "user", text: t, think: "", at: now(), done: true }];
      await reply();
    },
    stop() {
      ac?.abort();
    },
    async regenerate() {
      if (busy) return;
      const last = turns[turns.length - 1];
      if (last?.role === "assistant") turns = turns.slice(0, -1);
      if (turns[turns.length - 1]?.role !== "user") return emit();
      await reply();
    },
    remove(id) {
      turns = turns.filter((t) => t.id !== id);
      emit();
    },
    clear() {
      ac?.abort();
      turns = [];
      emit();
    },
    setEngine(e) {
      engine = e;
      emit();
    },
    markdown(title = "chat") {
      const lines = [`# ${title}`, ""];
      for (const t of turns) lines.push(`## ${t.role === "user" ? "you" : "reply"}`, "", t.text, "");
      return lines.join("\n");
    },
  };
}

/** One chat in a chat list: id, title, last update and turn count. */
export interface ChatListItem {
  id: string;
  title: string;
  updated: number;
  count: number;
}

/** The chats of a list, newest first, and the id of the open one. */
export interface ChatListSnapshot {
  items: readonly ChatListItem[];
  current: string;
}

/**
 * Several chats: a list with the newest first, one
 * open. `thread` always speaks for the open chat, so a pane and a composer
 * bound to it follow a switch.
 */
export interface ChatList {
  readonly thread: ChatThread;
  snapshot(): ChatListSnapshot;
  subscribe(fn: (s: ChatListSnapshot) => void): () => void;
  create(): string;
  open(id: string): void;
  rename(id: string, title: string): void;
  remove(id: string): void;
  setEngine(engine: ChatEngine | null): void;
}

/**
 * Creates a list of chat threads, newest first, with one open; its `thread` always speaks for the
 * open chat.
 */
export function chatList(o: ThreadOptions = {}): ChatList {
  const now = o.now ?? (() => Date.now());
  let engine = o.engine ?? null;
  let seq = 0;
  const chats = new Map<string, { t: ChatThread; title: string; updated: number; named: boolean }>();
  let current = "";
  const subs = new Set<(s: ChatListSnapshot) => void>();
  const threadSubs = new Set<(s: ThreadSnapshot) => void>();
  let offCurrent: (() => void) | null = null;
  const snap = (): ChatListSnapshot => ({
    items: [...chats].map(([id, c]) => ({ id, title: c.title, updated: c.updated, count: c.t.snapshot().turns.length })).sort((a, b) => b.updated - a.updated),
    current,
  });
  const emit = () => {
    const s = snap();
    for (const fn of subs) fn(s);
  };
  const follow = () => {
    offCurrent?.();
    const c = chats.get(current)!;
    offCurrent = c.t.subscribe((s) => {
      const first = s.turns.find((t) => t.role === "user");
      if (first && !c.named) c.title = first.text.length > 40 ? `${first.text.slice(0, 37)}...` : first.text;
      if (s.turns.length) c.updated = now();
      for (const fn of threadSubs) fn(s);
      emit();
    });
  };
  const list: ChatList = {
    thread: {
      snapshot: () => chats.get(current)!.t.snapshot(),
      subscribe(fn) {
        threadSubs.add(fn);
        fn(chats.get(current)!.t.snapshot());
        return () => threadSubs.delete(fn);
      },
      send: (text) => chats.get(current)!.t.send(text),
      stop: () => chats.get(current)!.t.stop(),
      regenerate: () => chats.get(current)!.t.regenerate(),
      remove: (id) => chats.get(current)!.t.remove(id),
      clear: () => chats.get(current)!.t.clear(),
      setEngine: (e) => list.setEngine(e),
      markdown: (title) => chats.get(current)!.t.markdown(title ?? chats.get(current)!.title),
    },
    snapshot: snap,
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
      return () => subs.delete(fn);
    },
    create() {
      const id = `chat-${++seq}`;
      chats.set(id, { t: chatThread({ ...o, engine }), title: "new chat", updated: now(), named: false });
      current = id;
      follow();
      return id;
    },
    open(id) {
      if (!chats.has(id) || id === current) return;
      chats.get(current)?.t.stop();
      current = id;
      follow();
    },
    rename(id, title) {
      const c = chats.get(id);
      if (!c || !title.trim()) return;
      c.title = title.trim();
      c.named = true;
      emit();
    },
    remove(id) {
      chats.get(id)?.t.stop();
      chats.delete(id);
      if (!chats.size) return void list.create();
      if (id === current) {
        current = snap().items[0]!.id;
        follow();
      } else emit();
    },
    setEngine(e) {
      engine = e;
      for (const c of chats.values()) c.t.setEngine(e);
    },
  };
  list.create();
  return list;
}

/** Tokens the next request carries, by source, for a context meter: about 4 characters a token (inferred). */
export function contextSegments(s: ThreadSnapshot, system = ""): { key: string; label: string; tokens: number }[] {
  const tok = (t: string) => Math.ceil(t.length / 4);
  const mem = s.turns.flatMap((t) => t.mem ?? []).reduce((n, m) => n + tok(m.label), 0);
  return [
    { key: "system", label: "persona", tokens: tok(system) },
    { key: "memory", label: "memory", tokens: mem },
    { key: "chat", label: "chat", tokens: s.turns.reduce((n, t) => n + tok(t.text), 0) },
  ];
}

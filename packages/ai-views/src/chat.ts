/**
 * The state behind ChatPane and Composer, after the earlier chat tools: a
 * thread of turns, one live reply streamed from a @hackbuild/chat engine
 * with its reasoning kept apart for the think fold, the memory each reply
 * used, stop, regenerate, and a markdown export. Framework free.
 */

import type { ChatEngine, ChatMessage } from "@hackbuild/chat";
import { statsText } from "@virgilvox/hackbuild-ui/vanilla";

export interface MemoryUsed {
  label: string;
  /** 0 to 1, shown beside the label. */
  score?: number;
}

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

export interface ThreadSnapshot {
  turns: readonly Turn[];
  busy: boolean;
  /** An engine is set; without one a reply says how to get one. */
  ready: boolean;
}

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

export const NO_ENGINE = "this needs a model. pick one in the bar and load it.";

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

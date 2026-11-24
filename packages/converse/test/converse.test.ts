import { describe, expect, it } from "vitest";
import { scripted } from "@hackbuild/chat";
import { RECALL_NOTE } from "@hackbuild/memory";
import {
  buildMessages,
  createChatStore,
  createConversation,
  createSession,
  exportSession,
  importSession,
  SEEN_NOTE,
  type ChatSession,
  type ConverseEngine,
  type DirectorLike,
  type EngineEvent,
  type RecordedCue,
  type Timers,
} from "@hackbuild/converse";

let t = 1000;
const now = () => t++;

/** A director that strips [name] tags, records each at its visible offset and fires them when speech reaches them. */
function tagDirector() {
  const fired: { name: string; at: number }[] = [];
  let vis = 0;
  let buf = "";
  let cues: RecordedCue[] = [];
  let left: RecordedCue[] = [];
  const d: DirectorLike = {
    begin() {
      vis = 0;
      buf = "";
      cues = [];
      left = [];
    },
    feed(chunk) {
      buf += chunk;
      let out = "";
      for (;;) {
        const open = buf.indexOf("[");
        if (open < 0) {
          out += buf;
          buf = "";
          break;
        }
        const close = buf.indexOf("]", open);
        if (close < 0) {
          out += buf.slice(0, open);
          buf = buf.slice(open);
          break;
        }
        out += buf.slice(0, open);
        const cue = { at: vis + out.length, kind: "gesture", name: buf.slice(open + 1, close) };
        cues.push(cue);
        left.push(cue);
        buf = buf.slice(close + 1);
      }
      vis += out.length;
      return { text: out };
    },
    finish() {
      const out = buf;
      buf = "";
      vis += out.length;
      return { text: out };
    },
    reached(offset) {
      const due = left.filter((c) => c.at <= offset);
      left = left.filter((c) => c.at > offset);
      for (const c of due) fired.push({ name: c.name, at: c.at });
      return due;
    },
    record: () => ({ cues: [...cues] }),
  };
  return { d, fired };
}

/** Manual timers so debounced saves run only when the test says. */
function manualTimers() {
  const due: { fn: () => void; ms: number }[] = [];
  const timers: Timers = {
    setTimeout(fn, ms) {
      const h = { fn, ms };
      due.push(h);
      return h;
    },
    clearTimeout(h) {
      const i = due.indexOf(h as never);
      if (i >= 0) due.splice(i, 1);
    },
  };
  return { timers, run: () => due.splice(0).forEach((h) => h.fn()), due };
}

function memorySink(initial: unknown = null) {
  const saved: ChatSession[] = [];
  let load: () => Promise<unknown> = async () => initial;
  return {
    saved,
    hold(p: Promise<unknown>) {
      load = () => p;
    },
    sink: { load: () => load(), save: async (s: ChatSession) => void saved.push(structuredClone(s)) },
  };
}

describe("history rules", () => {
  it("leaves a wordless reply out of the next request", async () => {
    const engine = scripted({ replies: ["...", "fine, and you"] });
    const c = createConversation({ engine, now });
    await c.send("hi");
    expect(c.session.messages.at(-1)!.content).toBe("...");
    await c.send("how are you");
    const sent = engine.calls[1]!.messages;
    expect(sent.map((m) => m.role)).toEqual(["user", "user"]);
    expect(sent.some((m) => m.content === "...")).toBe(false);
  });

  it("drops a leading greeting so the request starts with the user turn", async () => {
    const engine = scripted({ replies: ["hello back"] });
    const c = createConversation({ engine, now, system: "be brief", greeting: "hi, what are we doing" });
    await c.send("a walk");
    expect(c.session.messages[0]!.content).toBe("hi, what are we doing");
    expect(engine.calls[0]!.messages.map((m) => m.role)).toEqual(["system", "user"]);
  });

  it("sends the raw tagged reply back and shows the stripped one", async () => {
    const { d } = tagDirector();
    const engine = scripted({ replies: ["[wave] hi there", "ok"] });
    const c = createConversation({ engine, now, director: d });
    await c.send("hello");
    const reply = c.session.messages.at(-1)!;
    expect(reply.content).toBe(" hi there");
    expect(reply.raw).toBe("[wave] hi there");
    await c.send("again");
    expect(engine.calls[1]!.messages.find((m) => m.role === "assistant")!.content).toBe("[wave] hi there");
  });

  it("caps history with a floor of 2 and starts at a user turn", () => {
    const s = createSession({ id: "s", now: 0 });
    s.messages = ["a", "b", "c", "d", "e"].map((x, i) => ({ id: x, role: i % 2 ? "assistant" : "user", content: x }));
    expect(buildMessages(s, { limit: 2 }).map((m) => m.content)).toEqual(["c", "d", "e"]);
    expect(buildMessages(s, { limit: 0 }).map((m) => m.content)).toEqual(["c", "d", "e"]);
    expect(buildMessages(s, { limit: 1 }).map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(buildMessages(s, { limit: 4 }).map((m) => m.content)).toEqual(["a", "b", "c", "d", "e"]);
  });
});

describe("turns", () => {
  it("removes an empty reply and keeps a failed one with its flag", async () => {
    const empty = createConversation({ engine: scripted({ replies: [""] }), now });
    expect(await empty.send("hi")).toBeNull();
    expect(empty.session.messages.map((m) => m.role)).toEqual(["user"]);

    const broken: ConverseEngine = {
      async *stream() {
        yield { type: "text", text: "half" } as EngineEvent;
        throw new Error("the engine closed");
      },
    };
    const c = createConversation({ engine: broken, now });
    const errors: unknown[] = [];
    c.on((e) => e.type === "error" && errors.push(e.error));
    const m = await c.send("hi");
    expect(m).toMatchObject({ role: "assistant", content: "half", error: "the engine closed" });
    expect(errors).toHaveLength(1);
    expect(c.request().map((x) => x.role)).toEqual(["user"]);
  });

  it("an abort leaves no error and no empty reply", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const slow: ConverseEngine = {
      async *stream(_m, opts) {
        yield { type: "text", text: "partial" } as EngineEvent;
        await gate;
        if (opts?.signal?.aborted) {
          yield { type: "done", result: { text: "partial", finish: "abort" } } as EngineEvent;
          return;
        }
        yield { type: "text", text: " rest" } as EngineEvent;
      },
    };
    const c = createConversation({ engine: slow, now });
    const p = c.send("go");
    await new Promise((r) => setTimeout(r, 0));
    expect(c.busy).toBe(true);
    c.stop();
    release();
    const m = await p;
    expect(m!.error).toBeUndefined();
    expect(m!.content).toBe("partial");
    expect(c.busy).toBe(false);

    const quiet: ConverseEngine = {
      async *stream(_m, opts) {
        await new Promise((r) => opts!.signal!.addEventListener("abort", r));
        const e = new Error("aborted");
        e.name = "AbortError";
        throw e;
      },
    };
    const q = createConversation({ engine: quiet, now });
    const qp = q.send("go");
    await new Promise((r) => setTimeout(r, 0));
    q.stop();
    expect(await qp).toBeNull();
    expect(q.session.messages.map((x) => x.role)).toEqual(["user"]);
  });

  it("redo drops the last reply and asks again", async () => {
    const engine = scripted({ replies: ["first", "second"] });
    const c = createConversation({ engine, now });
    await c.send("q");
    await c.redo();
    expect(c.session.messages.map((m) => m.content)).toEqual(["q", "second"]);
    expect(engine.calls[1]!.messages.map((m) => m.content)).toEqual(["q"]);
  });

  it("edit truncates after the edited turn and answers it again", async () => {
    const engine = scripted({ replies: ["one", "two", "three"] });
    const c = createConversation({ engine, now });
    await c.send("a");
    await c.send("b");
    const first = c.session.messages[0]!.id;
    await c.edit(first, "a, changed");
    expect(c.session.messages.map((m) => m.content)).toEqual(["a, changed", "three"]);
    expect(c.session.messages[0]!.edited).toBe(true);
  });

  it("passes stats and tool calls from the result", async () => {
    const engine: ConverseEngine = {
      async *stream() {
        yield { type: "tool", calls: [{ name: "look", arguments: "{}" }] } as EngineEvent;
        yield { type: "done", result: { text: "", finish: "tool", stats: { tokens: 3, tokensSource: "measured", tokensPerSecond: null, firstTokenMs: 5, totalMs: 9 } } } as EngineEvent;
      },
    };
    const c = createConversation({ engine, now });
    const m = await c.send("what is there");
    expect(m!.toolCalls).toEqual([{ name: "look", arguments: "{}" }]);
    expect(m!.stats!.tokens).toBe(3);
  });
});

describe("saving", () => {
  it("saves nothing before restore resolves, then debounces", async () => {
    const { timers, run } = manualTimers();
    const store = memorySink();
    let open!: (v: unknown) => void;
    store.hold(new Promise((r) => (open = r)));
    const c = createConversation({ engine: scripted({ replies: ["hey"] }), now, sink: store.sink, timers });
    const restoring = c.restore();
    await c.send("early");
    run();
    await c.flush();
    expect(store.saved).toHaveLength(0);
    const old = createSession({ id: "chat", now: 1, title: "kept" });
    old.messages.push({ id: "u1", role: "user", content: "from before" });
    open(JSON.parse(exportSession(old)));
    await restoring;
    expect(c.session.title).toBe("kept");
    await c.send("later");
    expect(store.saved).toHaveLength(0);
    run();
    await Promise.resolve();
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]!.messages.map((m) => m.content)).toEqual(["from before", "later", "hey"]);
  });

  it("never saves a reply still waiting for its first word", async () => {
    const store = memorySink();
    const { timers } = manualTimers();
    const s = createChatStore(store.sink, { timers });
    s.markRestored();
    const session = createSession({ id: "x", now: 0 });
    session.messages.push({ id: "u", role: "user", content: "hi" }, { id: "a", role: "assistant", content: "" });
    s.save(session);
    await s.flush();
    expect(store.saved[0]!.messages.map((m) => m.id)).toEqual(["u"]);
  });
});

describe("cues and voice", () => {
  it("fires the cues at the end when there is no speaker", async () => {
    const { d, fired } = tagDirector();
    const c = createConversation({ engine: scripted({ replies: ["hi [wave] there [nod]"] }), now, director: d });
    await c.send("hello");
    expect(fired.map((f) => f.name)).toEqual(["wave", "nod"]);
  });

  it("speaks a message again and replays its cues at the same offsets", async () => {
    const { d, fired } = tagDirector();
    const fed: [string, boolean | undefined][] = [];
    const speaker = { feed: (text: string, final?: boolean) => fed.push([text, final]), stop: () => undefined };
    const replayed: RecordedCue[] = [];
    const c = createConversation({ engine: scripted({ replies: ["hi [wave] there"] }), now, director: d, speaker, replayCue: (cue) => replayed.push(cue) });
    const m = (await c.send("hello"))!;
    expect(fed.at(-1)).toEqual(["hi  there", true]);
    c.reached(3);
    expect(fired).toEqual([{ name: "wave", at: 3 }]);
    expect(c.speak(m.id)).toBe(true);
    c.reached(2);
    expect(replayed).toHaveLength(0);
    c.reached(9);
    expect(replayed).toEqual([{ at: 3, kind: "gesture", name: "wave" }]);
  });
});

describe("memory and seen lines", () => {
  it("puts lines under the turn they were recalled for and keeps the system text byte equal", async () => {
    const engine = scripted({ replies: ["sure", "ok"] });
    let seen: string | null = "a red mug on the desk";
    const c = createConversation({
      engine,
      now,
      system: "you are a dog",
      memory: { recall: (text) => (text.includes("walk") ? [{ id: "n1", text: "likes the park" }] : []) },
      seen: () => seen,
    });
    await c.send("walk time");
    seen = null;
    await c.send("thanks");
    const [a, b] = [engine.calls[0]!.messages, engine.calls[1]!.messages];
    expect(a[0]!.content).toBe(`you are a dog\n\n${RECALL_NOTE}\n\n${SEEN_NOTE}`);
    expect(b[0]!.content).toBe(a[0]!.content);
    expect(a[1]!.content).toBe("walk time\n[memory] likes the park\n[seen] a red mug on the desk");
    expect(b[1]!.content).toBe(a[1]!.content);
    expect(b[3]!.content).toBe("thanks");
    expect(c.session.messages[0]!.recalled).toEqual([{ id: "n1", text: "likes the park" }]);
  });
});

describe("session schema", () => {
  it("round trips and reads an unversioned export", () => {
    const s = createSession({ id: "s1", now: 5, system: "sys" });
    s.messages.push({ id: "a", role: "user", content: "hi", recalled: [{ id: "n", text: "t" }], seen: "x" });
    expect(importSession(exportSession(s))).toEqual(s);
    const old = importSession({ messages: [{ role: "user", text: "plain" }] }, { id: "f", now: 9 });
    expect(old).toMatchObject({ id: "f", version: 1, messages: [{ id: "m1", role: "user", content: "plain" }] });
  });
});

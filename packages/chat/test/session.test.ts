import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  createEngine,
  createSession,
  exportSession,
  importSession,
  scriptedDriver,
  SessionError,
  SESSION_VERSION,
  sessionMessages,
  sessionToMarkdown,
  type Driver,
  type DriverEvent,
} from "@hackbuild/chat";
import { webllmCache, webllmPhase } from "@hackbuild/chat/webllm";
import { wllamaDriver, type WllamaLike } from "@hackbuild/chat/wllama";

/** A driver that yields events on a fake clock: each event moves the clock by `step` ms. */
function clocked(events: DriverEvent[], step: number) {
  let t = 1000;
  const now = () => t;
  const driver: Driver = {
    id: "clocked",
    provider: "test",
    caps: { schema: false, tools: false, systemRole: true, stop: false },
    async *stream() {
      for (const e of events) {
        t += step;
        yield e;
      }
    },
  };
  return { driver, now, tick: (ms: number) => (t += ms) };
}

describe("reply stats", () => {
  it("counts chunks as inferred tokens and times them on the injected clock", async () => {
    const c = clocked(
      [
        { type: "text", text: "a" },
        { type: "text", text: "b" },
        { type: "text", text: "c" },
        { type: "done", finish: "stop" },
      ],
      100,
    );
    const r = await createEngine(c.driver, { now: c.now }).complete([{ role: "user", content: "hi" }]);
    // first chunk at +100, last event at +400: decode 300 ms for 3 tokens (computed)
    expect(r.stats).toEqual({ tokens: 3, tokensSource: "inferred", firstTokenMs: 100, tokensPerSecond: 10, totalMs: 400 });
  });

  it("takes tokens from the runtime's usage when it reports one", async () => {
    const c = clocked(
      [
        { type: "think", text: "x" },
        { type: "text", text: "yes" },
        { type: "done", finish: "stop", usage: { input: 9, output: 6 } },
      ],
      50,
    );
    const r = await createEngine(c.driver, { now: c.now }).complete([{ role: "user", content: "hi" }]);
    expect(r.stats.tokens).toBe(6);
    expect(r.stats.tokensSource).toBe("measured");
    expect(r.stats.firstTokenMs).toBe(50);
    expect(r.stats.tokensPerSecond).toBe(60);
  });

  it("firstTokenMs is null for an empty reply", async () => {
    const c = clocked([{ type: "done", finish: "stop" }], 30);
    const r = await createEngine(c.driver, { now: c.now }).complete([{ role: "user", content: "hi" }]);
    expect(r.stats).toMatchObject({ tokens: 0, firstTokenMs: null, tokensPerSecond: null, totalMs: 30 });
  });
});

describe("prewarm", () => {
  it("a driver without a prefix cache makes no call", async () => {
    const e = createEngine(scriptedDriver({ replies: ["x"] }));
    expect(await e.prewarm!([{ role: "system", content: "s" }])).toBe(false);
  });

  it("wllama runs a zero token completion with the prompt cache on", async () => {
    const calls: Record<string, unknown>[] = [];
    const wl: WllamaLike = {
      async createChatCompletion(o) {
        calls.push(o);
        return (async function* () {})();
      },
      async loadModel() {},
      getLoadedContextInfo: () => ({}),
    };
    const e = createEngine(wllamaDriver({ wllama: wl }), { quirks: { systemRole: false } });
    expect(await e.prewarm!([{ role: "system", content: "persona" }, { role: "user", content: "hi" }])).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ max_tokens: 0, cache_prompt: true, stream: true });
    // the same normalization as a send, so the cached prefix matches
    expect(calls[0]!.messages).toEqual([{ role: "user", content: "persona\n\nhi" }]);
    await expect(createEngine(wllamaDriver({ wllama: wl, cachePrompt: false })).prewarm!([])).resolves.toBe(false);
  });
});

describe("session schema", () => {
  const base = () => {
    const s = createSession({ id: "c1", now: 5, system: "be brief", model: { id: "smollm2-360m-instruct", provider: "tjs" } });
    s.messages.push(
      { id: "a", role: "user", content: "hello", at: 6 },
      { id: "b", role: "assistant", content: "hi", raw: "<smile> hi", stats: { tokens: 2, tokensSource: "inferred", tokensPerSecond: 20, firstTokenMs: 300, totalMs: 400 }, recalled: [{ id: "m9", text: "likes tea" }] },
      { id: "c", role: "assistant", content: "", error: "reply stopped: the engine closed. press redo." },
    );
    return s;
  };

  it("round trips through export and import", () => {
    const s = base();
    const back = importSession(exportSession(s));
    expect(back).toEqual(s);
    expect(back.version).toBe(SESSION_VERSION);
  });

  it("history sends raw replies and leaves out failed and empty ones", () => {
    const s = base();
    s.messages.push({ id: "d", role: "assistant", content: "  " });
    expect(sessionMessages(s)).toEqual([
      { role: "system", content: "be brief" },
      { role: "user", content: "hello" },
      { role: "assistant", content: "<smile> hi" },
    ]);
  });

  it("reads an unversioned export with messages, fills ids and drops unknown fields", () => {
    const old = { exported: 77, characterName: "ada", systemPrompt: "s", model: "m", params: { temperature: 0.7, junk: {} }, messages: [{ role: "user", content: "q", extra: 1 }, { role: "assistant", text: "a" }] };
    const s = importSession(JSON.stringify(old), { id: "new" });
    expect(s).toMatchObject({ id: "new", title: "ada", created: 77, system: "s", model: { id: "m" }, params: { temperature: 0.7 } });
    expect(s.messages).toEqual([
      { id: "m1", role: "user", content: "q" },
      { id: "m2", role: "assistant", content: "a" },
    ]);
  });

  it("refuses bad files with a lowercase reason", () => {
    expect(() => importSession("{nope")).toThrow(/^not a chat session: the file is not json/);
    expect(() => importSession({ messages: [{ role: "robot", content: "x" }] })).toThrow("message 1 has no known role");
    expect(() => importSession({ version: 9, messages: [] })).toThrow(/version 9/);
    expect(() => importSession({ kind: "other", messages: [] })).toThrow(SessionError);
    expect(() => importSession([])).toThrow(/no object/);
  });

  it("writes markdown with a section per message", () => {
    const md = sessionToMarkdown(base());
    expect(md.startsWith("# new chat\n\nmodel: smollm2-360m-instruct")).toBe(true);
    expect(md).toContain("## assistant\n\n(failed: reply stopped: the engine closed. press redo.)");
  });
});

describe("webllm", () => {
  it("maps progress text to phases", () => {
    expect(webllmPhase({ progress: 0.18, text: "Fetching param cache[3/24]: 412MB fetched. 18% completed" })).toEqual({ phase: "fetch", fraction: 0.18, file: "3 of 24" });
    expect(webllmPhase({ progress: 0.5, text: "Loading model from cache[12/24]: 1000MB loaded." }).phase).toBe("fetch");
    expect(webllmPhase({ progress: 0.21, text: "Loading GPU shader modules[12/56]: 21% completed" }).phase).toBe("compile");
    expect(webllmPhase({ progress: 0.9, text: "Finish loading on WebGPU - apple" })).toEqual({ phase: "ready", fraction: 1 });
  });

  async function seed(idb: IDBFactory, name: string, rows: { url: string; data: unknown }[]) {
    await new Promise<void>((res, rej) => {
      const r = idb.open(name, 1);
      r.onupgradeneeded = () => r.result.createObjectStore("urls", { keyPath: "url" });
      r.onerror = () => rej(r.error);
      r.onsuccess = () => {
        const tx = r.result.transaction(["urls"], "readwrite");
        for (const row of rows) tx.objectStore("urls").put(row);
        tx.oncomplete = () => (r.result.close(), res());
      };
    });
  }

  const list = [
    { model: "https://huggingface.co/mlc-ai/A-MLC", model_id: "A-MLC", model_lib: "https://x.test/a.wasm" },
    { model: "https://huggingface.co/mlc-ai/B-MLC", model_id: "B-MLC", model_lib: "https://x.test/a.wasm" },
    { model: "https://huggingface.co/mlc-ai/C-MLC/resolve/main/", model_id: "C-MLC", model_lib: "https://x.test/c.wasm" },
  ];

  it("lists, measures and evicts per model from the 0.2.84 layout", async () => {
    const idb = new IDBFactory();
    const A = "https://huggingface.co/mlc-ai/A-MLC/resolve/main/";
    const B = "https://huggingface.co/mlc-ai/B-MLC/resolve/main/";
    await seed(idb, "webllm/model", [
      { url: `${A}params_shard_0.bin`, data: new ArrayBuffer(1000) },
      { url: `${A}tokenizer.json`, data: new ArrayBuffer(50) },
      { url: `${B}params_shard_0.bin`, data: new ArrayBuffer(300) },
    ]);
    await seed(idb, "webllm/config", [{ url: `${A}mlc-chat-config.json`, data: { a: 1 } }]);
    await seed(idb, "webllm/wasm", [{ url: "https://x.test/a.wasm", data: new ArrayBuffer(20) }]);
    const c = webllmCache({ modelList: list, indexedDB: idb });
    const rows = await c.list();
    expect(rows.map((r) => [r.modelId, r.bytes, r.files])).toEqual([
      ["A-MLC", 1000 + 50 + 7 + 20, 4],
      ["B-MLC", 320, 2],
    ]);
    expect(await c.has("A-MLC")).toBe(true);
    expect(await c.has("C-MLC")).toBe(false);
    await c.evict("A-MLC");
    expect(await c.has("A-MLC")).toBe(false);
    // the wasm B still uses stays
    expect((await c.list()).map((r) => [r.modelId, r.bytes])).toEqual([["B-MLC", 320]]);
    await c.evict("B-MLC");
    expect(await c.bytes()).toBe(0);
  });

  it("creates no database when webllm never ran", async () => {
    const idb = new IDBFactory();
    const c = webllmCache({ modelList: list, indexedDB: idb });
    expect(await c.list()).toEqual([]);
    expect(await c.bytes()).toBe(0);
    await c.evict("A-MLC");
    expect((await idb.databases()).map((d) => d.name)).toEqual([]);
  });
});


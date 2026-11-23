import { describe, expect, it } from "vitest";
import { maskKey, normalizeMessages, scripted, splitThink, stripMarkers, ThinkSplitter, type ChatEvent } from "@hackbuild/chat";

describe("normalizeMessages", () => {
  const msgs = [
    { role: "assistant" as const, content: "hi, I'm here" },
    { role: "system" as const, content: "you are terse" },
    { role: "user" as const, content: "one" },
    { role: "user" as const, content: "two" },
    { role: "assistant" as const, content: "ok" },
    { role: "tool" as const, name: "look", content: "a mug" },
  ];

  it("merges the system prompt into the first user turn for gemma", () => {
    expect(normalizeMessages(msgs, { systemRole: false })).toEqual([
      { role: "user", content: "you are terse\n\none\n\ntwo" },
      { role: "assistant", content: "ok" },
      { role: "user", content: "[look result]\na mug" },
    ]);
  });

  it("keeps a system role and joins nothing by default", () => {
    const out = normalizeMessages(msgs);
    expect(out[0]).toEqual({ role: "system", content: "you are terse" });
    expect(out.length).toBe(6);
  });

  it("strict alternation drops leading assistant turns and joins same roles", () => {
    const out = normalizeMessages(msgs, { strictAlternation: true });
    expect(out.map((m) => m.role)).toEqual(["system", "user", "assistant", "user"]);
  });

  it("adds a user turn when gemma history has none", () => {
    expect(normalizeMessages([{ role: "system", content: "s" }], { systemRole: false })).toEqual([{ role: "user", content: "s" }]);
  });
});

describe("think splitting", () => {
  it("splits closed, unclosed and differently named blocks", () => {
    expect(splitThink("<think>plan</think>Hello")).toEqual({ text: "Hello", think: "plan" });
    expect(splitThink("Sure.<reasoning>why</reasoning> Done")).toEqual({ text: "Sure. Done", think: "why" });
    expect(splitThink("<thinking>never closes")).toEqual({ text: "", think: "never closes" });
    expect(splitThink("a < b and c > d")).toEqual({ text: "a < b and c > d", think: "" });
  });

  it("never shows half a tag while streaming one character at a time", () => {
    const sp = new ThinkSplitter();
    const src = "Hi <think>secret plan</think>there<|im_end|>";
    let text = "";
    let think = "";
    for (const c of src) {
      const r = sp.push(c);
      text += r.text;
      think += r.think;
      expect(text).not.toMatch(/<t|<\/|secret|<\|/);
    }
    const e = sp.end();
    text += e.text;
    expect(text).toBe("Hi there");
    expect(think).toBe("secret plan");
  });

  it("strips leaked control markers", () => {
    expect(stripMarkers("<|channel|>final<|message|>hello<|end|>")).toBe("hello");
    expect(stripMarkers("<start_of_turn>model\nhey<end_of_turn>")).toBe("hey");
  });

  it("masks keys to four and four", () => {
    expect(maskKey("sk-abcdefghijklmnop1234")).toBe("sk-a...1234");
    expect(maskKey("short")).toBe("*****");
  });
});

async function collect(g: AsyncGenerator<ChatEvent>) {
  const ev: ChatEvent[] = [];
  for await (const e of g) ev.push(e);
  return ev;
}

describe("engine", () => {
  it("streams visible text and think separately", async () => {
    const chat = scripted({ replies: ["<think>count</think>one two"], chunk: 3 });
    const ev = await collect(chat.stream([{ role: "user", content: "go" }]));
    const text = ev.filter((e) => e.type === "text").map((e) => (e as { text: string }).text).join("");
    const think = ev.filter((e) => e.type === "think").map((e) => (e as { text: string }).text).join("");
    expect(text).toBe("one two");
    expect(think).toBe("count");
    const done = ev[ev.length - 1]!;
    expect(done.type).toBe("done");
  });

  it("cuts at a stop string split across chunks and never emits it", async () => {
    const chat = scripted({ replies: ["ACTION: look\nTHOUGHT: more"], chunk: 3 });
    const pieces: string[] = [];
    for await (const e of chat.stream([{ role: "user", content: "x" }], { stop: ["\nTHOUGHT:"] })) if (e.type === "text") pieces.push(e.text);
    expect(pieces.join("")).toBe("ACTION: look");
  });

  it("falls back from a refused schema to free text and remembers", async () => {
    const chat = scripted({ replies: ['{"say":"hi"}'], refuseSchema: "xgrammar could not compile the json schema" });
    const schema = { type: "object", properties: { say: { type: "string" } } };
    const r = await chat.complete([{ role: "system", content: "be brief" }, { role: "user", content: "hi" }], { schema });
    expect(r.text).toBe('{"say":"hi"}');
    expect(r.schemaFallback).toBe(true);
    expect(chat.calls.length).toBe(2);
    expect(chat.calls[0]!.schema).toEqual(schema);
    expect(chat.calls[1]!.schema).toBeUndefined();
    expect(chat.calls[1]!.messages[0]!.content).toContain("matches this JSON Schema");
    await chat.complete([{ role: "user", content: "again" }], { schema });
    expect(chat.calls.length).toBe(3);
    expect(chat.calls[2]!.schema).toBeUndefined();
  });

  it("puts the schema in the prompt for a driver with no schema support", async () => {
    const chat = scripted({ replies: ["{}"], schema: false, systemRole: false });
    const r = await chat.complete([{ role: "system", content: "s" }, { role: "user", content: "u" }], { schema: { type: "object" } });
    expect(r.schemaFallback).toBe(true);
    expect(chat.calls[0]!.messages).toEqual([{ role: "user", content: expect.stringContaining("JSON Schema") }]);
  });

  it("passes the repetition penalty quirk and stops on abort", async () => {
    const chat = scripted({ replies: ["a long reply that keeps going"], chunk: 1, quirks: { repetitionPenalty: 1.1 } });
    const ac = new AbortController();
    let n = 0;
    const g = chat.stream([{ role: "user", content: "x" }], { signal: ac.signal });
    let result;
    for (;;) {
      const r = await g.next();
      if (r.done) {
        result = r.value;
        break;
      }
      if (r.value.type === "text" && ++n === 3) ac.abort();
    }
    expect(result.finish).toBe("abort");
    expect(result.text.length).toBeLessThan(6);
    expect(chat.calls[0]!.repetitionPenalty).toBe(1.1);
  });

  it("rethrows errors that are not about the schema", async () => {
    const chat = scripted({ replies: ["x"], refuseSchema: "device lost" });
    await expect(chat.complete([{ role: "user", content: "x" }], { schema: { type: "object" } })).rejects.toThrow("device lost");
  });
});

describe("loose schema fallback", () => {
  it("tries the loose schema before free text", async () => {
    const strict = { anyOf: [{ type: "object", properties: { a: { const: 1 } } }] };
    const loose = { type: "object" };
    const chat = scripted({ replies: (req) => (req.schema === strict ? "" : "{}") });
    const refuse = scripted({ replies: ["{}"], refuseSchema: "grammar compile failed" });
    const r = await refuse.complete([{ role: "user", content: "x" }], { schema: strict, fallbackSchemas: [loose] });
    expect(refuse.calls.map((c) => c.schema)).toEqual([strict, loose, undefined]);
    expect(r.schemaIndex).toBe(-1);
    const ok = await chat.complete([{ role: "user", content: "x" }], { schema: strict, fallbackSchemas: [loose] });
    expect(ok.schemaIndex).toBe(0);
  });
});

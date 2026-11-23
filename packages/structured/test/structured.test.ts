import { describe, expect, it } from "vitest";
import { createEngine, scripted, type Driver, type DriverRequest, type ToolSpec } from "@hackbuild/chat";
import {
  buildAgentSchema,
  buildLooseAgentSchema,
  call,
  createGuards,
  createTagParser,
  fingerprint,
  grabCode,
  keywordActions,
  looksLikeGarbage,
  parseAction,
  parseLines,
  parseLooseJSON,
  parseToolDecision,
  pickMode,
  repairJSON,
  resolveValue,
  sanitizeSchema,
  type Tag,
} from "@hackbuild/structured";

const tools: ToolSpec[] = [
  {
    name: "look",
    description: "look at a thing",
    parameters: { type: "object", title: "Look", properties: { target: { type: "string", minLength: 1, pattern: "^\\w+$" } }, required: ["target"] },
  },
  { name: "pick_up", description: "pick up a thing", parameters: { type: "object", properties: { item: { type: "string" }, from: { type: "string" } } } },
];

describe("schemas", () => {
  it("strips keywords xgrammar refuses, keeps property names, adds a root type", () => {
    const s = sanitizeSchema({
      $schema: "x",
      properties: { title: { type: "string", maxLength: 4 }, pattern: { type: "array", minItems: 1, items: { type: "number", multipleOf: 2, default: 0 } } },
    });
    expect(s).toEqual({ properties: { title: { type: "string" }, pattern: { type: "array", items: { type: "number" } } }, type: "object" });
  });

  it("builds one strict variant per tool plus respond_to_user, and a loose schema", () => {
    const strict = buildAgentSchema(tools) as { anyOf: { properties: { tool_call: { properties: { name: { enum: string[] }; arguments: unknown } } } }[] };
    expect(strict.anyOf.map((v) => v.properties.tool_call.properties.name.enum)).toEqual([["look"], ["pick_up"], ["respond_to_user"]]);
    expect(JSON.stringify(strict)).not.toMatch(/minLength|pattern|"title"/);
    const loose = buildLooseAgentSchema(tools) as { properties: { tool_call: { properties: { name: { enum: string[] }; arguments: unknown } } } };
    expect(loose.properties.tool_call.properties.name.enum).toEqual(["look", "pick_up", "respond_to_user"]);
    expect(loose.properties.tool_call.properties.arguments).toEqual({ type: "object" });
  });
});

describe("json repair", () => {
  it("handles fences, think blocks, trailing commas and unclosed values", () => {
    expect(JSON.parse(repairJSON('<think>hm</think>```json\n{"a": [1, 2,], "b": "x",}\n```'))).toEqual({ a: [1, 2], b: "x" });
    expect(JSON.parse(repairJSON('{"say": "hello there'))).toEqual({ say: "hello there" });
    expect(JSON.parse(repairJSON('{"a": {"b": [1, {"c": 2'))).toEqual({ a: { b: [1, { c: 2 }] } });
    expect(JSON.parse(repairJSON('{"k":'))).toEqual({ k: null });
    expect(JSON.parse(repairJSON('{"code": "line1\nline2"}'))).toEqual({ code: "line1\nline2" });
  });

  it("finds the largest object that parses inside prose", () => {
    expect(parseLooseJSON('Sure! here: {"say":"hi","done":true} hope that helps}')).toEqual({ say: "hi", done: true });
    expect(parseLooseJSON("no json at all")).toBeNull();
  });

  it("reads tool decisions in the shapes small models drift to", () => {
    expect(parseToolDecision('{"thought":"t","tool_call":{"name":"look","arguments":"{\\"target\\":\\"mug\\"}"}}')).toEqual({ thought: "t", name: "look", args: { target: "mug" } });
    expect(parseToolDecision({ tool: "look", args: { target: "mug" } })).toEqual({ thought: "", name: "look", args: { target: "mug" } });
    expect(parseToolDecision({ name: "look", arguments: "mug" })).toEqual({ thought: "", name: "look", args: { value: "mug" } });
    expect(parseToolDecision({ say: "hi" })).toBeNull();
  });
});

describe("guards", () => {
  it("stops after three parse failures", () => {
    const g = createGuards();
    expect([g.parseFail(), g.parseFail(), g.parseFail()]).toEqual([null, null, "parse-fails"]);
    expect(g.stopped).toBe("parse-fails");
  });

  it("stops when one call repeats three times in the last six", () => {
    const g = createGuards();
    const seq = [["look", { target: "Mug" }], ["pick_up", {}], ["look", { target: "mug " }], ["look", { target: "box" }], ["look", { target: "mug" }]] as const;
    const out = seq.map(([n, a]) => g.call(n, a));
    expect(out).toEqual([null, null, null, null, "repeat"]);
    expect(fingerprint("x", { b: 1, a: 2 })).toBe(fingerprint("x", { a: 2, b: 1 }));
  });

  it("stops after two garbage replies in a row", () => {
    const g = createGuards();
    expect(looksLikeGarbage('{"}{"]:,,"')).toBe(true);
    expect(looksLikeGarbage("hahahahahahahahaha")).toBe(true);
    expect(looksLikeGarbage("The mug is on the shelf.")).toBe(false);
    expect([g.reply('{"]}'), g.reply("fine words"), g.reply("{{{}}}"), g.reply("[[:,]]")]).toEqual([null, null, null, "garbage"]);
  });

  it("caps pushbacks at three", () => {
    const g = createGuards();
    expect([g.pushback(), g.pushback(), g.pushback(), g.pushback()]).toEqual([null, null, null, "pushbacks"]);
  });
});

describe("tag parser", () => {
  const grammar = {
    keys: { mood: ["happy", "sad", "surprised"], gesture: ["wave", "nod", "shrug"], action: null },
    synonyms: { grin: "happy", smiles: "happy", "waves hello": "wave" },
    lineKeys: ["gesture"],
  };

  it("reads keyed, plain and line tags and strips them from speech", () => {
    const p = createTagParser(grammar);
    const r = p.parse("Hello [mood: grin] there *waves hello* friend (smiles warmly). [ACTION: sit down]\ngesture: nod\nbye");
    expect(r.tags.map((t) => `${t.key}=${t.value}`)).toEqual(["mood=happy", "gesture=wave", "mood=happy", "action=sit down", "gesture=nod"]);
    expect(r.text).toBe("Hello there friend . \nbye");
  });

  it("fires tags while streaming with offsets into the spoken text, one character at a time", () => {
    const p = createTagParser(grammar);
    const src = "I am [mood:sad] so tired *shrug* ok";
    let text = "";
    const tags: Tag[] = [];
    for (const ch of src) {
      const r = p.feed(ch);
      text += r.text;
      tags.push(...r.tags);
      expect(text).not.toMatch(/[[*]/);
    }
    const e = p.end();
    text += e.text;
    tags.push(...e.tags);
    expect(text).toBe("I am so tired ok");
    expect(tags.map((t) => [t.value, text.slice(0, t.at)])).toEqual([
      ["sad", "I am "],
      ["shrug", "I am so tired "],
    ]);
  });

  it("leaves markdown bold, unknown parentheses and an unclosed bracket as text", () => {
    const p = createTagParser(grammar);
    expect(p.strip("this is **bold** (see above) and [unclosed")).toBe("this is **bold** (see above) and [unclosed");
  });

  it("resolves exact, synonym, substring, then token overlap", () => {
    const vocab = ["happy", "very angry", "wave"];
    expect(resolveValue("Happy", vocab)).toBe("happy");
    expect(resolveValue("grin", vocab, { grin: "happy" })).toBe("happy");
    expect(resolveValue("waves", vocab)).toBe("wave");
    expect(resolveValue("angry face", vocab)).toBe("very angry");
    expect(resolveValue("zebra", vocab)).toBeNull();
  });
});

describe("lines", () => {
  it("reads multi line values and prefers fenced code", () => {
    const text = "THOUGHT: write the page\nACTION: write\nPATH: index.html\nCODE:\n```html\n<p>hi</p>\n```\nextra";
    const v = parseLines(text, { tags: ["THOUGHT", "ACTION", "PATH", "CODE"] });
    expect(v).toMatchObject({ THOUGHT: "write the page", ACTION: "write", PATH: "index.html" });
    expect(grabCode(v.CODE!)).toEqual({ code: "<p>hi</p>", lang: "html" });
    expect(parseLines("**Thought:** a\n- action: b", { tags: ["Thought", "Action"] })).toEqual({ Thought: "a", Action: "b" });
  });

  it("parses action forms and matches known names", () => {
    expect(parseAction("pick_up(red mug, table)", ["pick_up"])).toEqual({ name: "pick_up", args: ["red mug", "table"], raw: "pick_up(red mug, table)" });
    expect(parseAction("Pick-Up mug", ["pick_up"])!.name).toBe("pick_up");
    expect(parseAction('["look", "mug"]')).toMatchObject({ name: "look", args: ["mug"] });
    expect(parseAction("fly away", ["look"])).toBeNull();
  });

  it("falls back to keywords with caps", () => {
    expect(keywordActions("go forward, forward, forward, forward, forward then turn left", { forward: "move", left: "turn_left" })).toEqual(["move", "move", "move", "move", "turn_left"]);
  });
});

function toolDriver(reply: (req: DriverRequest) => { text?: string; calls?: { name: string; arguments: string }[] }): Driver & { calls: DriverRequest[] } {
  const calls: DriverRequest[] = [];
  return {
    id: "fake-tools",
    provider: "stub",
    caps: { schema: false, tools: true, systemRole: true, stop: false },
    calls,
    async *stream(req) {
      calls.push(req);
      const r = reply(req);
      if (r.text) yield { type: "text", text: r.text };
      if (r.calls) yield { type: "tool", calls: r.calls };
      yield { type: "done", finish: "stop" };
    },
  };
}

describe("call", () => {
  it("auto picks the mode from engine caps and quirks", () => {
    expect(pickMode(scripted({ replies: [""] }))).toBe("constrained");
    expect(pickMode(scripted({ replies: [""], schema: false }), { toolCallTags: true })).toBe("prompt");
    expect(pickMode(scripted({ replies: [""], schema: false }))).toBe("lines");
    expect(pickMode(createEngine(toolDriver(() => ({}))), { nativeTools: true })).toBe("native");
  });

  it("constrained: strict schema first, loose after a grammar refusal", async () => {
    let n = 0;
    const chat = scripted({
      replies: (req) => {
        n++;
        if (req.schema && "anyOf" in req.schema) throw new Error("xgrammar: could not compile schema");
        return '{"thought":"see it","tool_call":{"name":"look","arguments":{"target":"mug"}}}';
      },
    });
    const d = await call(chat, [{ role: "user", content: "what is that" }], { tools });
    expect(d).toMatchObject({ mode: "constrained", fallback: "loose", thought: "see it", tool: { name: "look", args: { target: "mug" } } });
    expect(n).toBe(2);
  });

  it("constrained: respond_to_user carries the message", async () => {
    const chat = scripted({ replies: ['{"thought":"","tool_call":{"name":"respond_to_user","arguments":{"message":"hi there"}}}'] });
    const d = await call(chat, [{ role: "user", content: "hi" }], { tools });
    expect(d.tool).toEqual({ name: "respond_to_user", args: { message: "hi there" } });
    expect(d.say).toBe("hi there");
  });

  it("prompt mode reads Hermes tool_call tags, closed or not", async () => {
    const chat = scripted({ replies: ['<tool_call>{"name": "pick_up", "arguments": {"item": "mug"}}', "just words"], schema: false });
    const d = await call(chat, [{ role: "user", content: "grab it" }], { tools, mode: "prompt" });
    expect(d.tool).toEqual({ name: "pick_up", args: { item: "mug" } });
    expect(chat.calls[0]!.messages[0]!.content).toContain("<tools>");
    const d2 = await call(chat, [{ role: "user", content: "hi" }], { tools, mode: "prompt" });
    expect(d2.tool).toEqual({ name: "respond_to_user", args: { message: "just words" } });
  });

  it("native mode uses the runtime's tool calls", async () => {
    const chat = createEngine(toolDriver(() => ({ calls: [{ name: "look", arguments: '{"target":"door"}' }] })));
    const d = await call(chat, [{ role: "user", content: "x" }], { tools, mode: "native" });
    expect(d.tool).toEqual({ name: "look", args: { target: "door" } });
  });

  it("tags mode maps [tool: argument] to the first argument and keeps the prose", async () => {
    const chat = scripted({ replies: ["Let me see. [look: the box]"], schema: false });
    const d = await call(chat, [{ role: "user", content: "x" }], { tools, mode: "tags" });
    expect(d.tool).toEqual({ name: "look", args: { target: "the box" } });
    expect(d.say).toBe("Let me see.");
  });

  it("lines mode stops after the action and maps positional arguments", async () => {
    const chat = scripted({ replies: ["THOUGHT: grab it\nACTION: pick_up(mug, shelf)\nTHOUGHT: then more"], schema: false });
    const d = await call(chat, [{ role: "user", content: "x" }], { tools, mode: "lines" });
    expect(d.tool).toEqual({ name: "pick_up", args: { item: "mug", from: "shelf" } });
    expect(d.thought).toBe("grab it");
    expect(chat.calls[0]!.stop).toContain("\nTHOUGHT:");
  });

  it("guards count failures and repeats across calls", async () => {
    const guards = createGuards();
    const bad = scripted({ replies: ["ACTION: dance()"], schema: false });
    const stops: (string | null)[] = [];
    for (let i = 0; i < 3; i++) stops.push((await call(bad, [{ role: "user", content: "x" }], { tools, mode: "lines", guards })).stop);
    expect(stops).toEqual([null, null, "parse-fails"]);
    const g2 = createGuards();
    const loop = scripted({ replies: ['{"thought":"","tool_call":{"name":"look","arguments":{"target":"mug"}}}'] });
    const s2: (string | null)[] = [];
    for (let i = 0; i < 3; i++) s2.push((await call(loop, [{ role: "user", content: "x" }], { tools, guards: g2 })).stop);
    expect(s2).toEqual([null, null, "repeat"]);
  });
});

describe("loose json on long replies", () => {
  it("stays linear on a code reply and on brace runs", () => {
    const code = "function f(a) { if (a) { return {x: 1}; } }\n".repeat(200);
    let t0 = performance.now();
    expect(parseLooseJSON("here is code:\n" + code)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(150);
    t0 = performance.now();
    expect(parseLooseJSON("{a}".repeat(1500))).toBeNull();
    expect(performance.now() - t0).toBeLessThan(150);
  });
  it("still finds the last object after prose and a brace inside a string", () => {
    expect(parseLooseJSON('first {nope} then {"a": "x}y", "b": {"c": 1}} done')).toEqual({ a: "x}y", b: { c: 1 } });
  });
});

describe("tag offsets after parse", () => {
  it("point into the trimmed, collapsed text", () => {
    const p = createTagParser({ keys: { mood: ["happy"] } });
    const r = p.parse("   hi   [mood: happy] there");
    expect(r.text).toBe("hi there");
    // the tag sat in a space run that collapsed to one space; either side of it is the same place
    expect([2, 3]).toContain(r.tags[0]!.at);
  });
});

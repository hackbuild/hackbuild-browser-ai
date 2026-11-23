import { describe, expect, test, vi } from "vitest";
import { scripted } from "@hackbuild/chat";
import {
  createAgent,
  createRegistry,
  Goals,
  parsePlan,
  PlanCache,
  Reflex,
  SayStream,
  storageSink,
  ToolError,
  clauses,
  type AgentEvent,
  type Tool,
} from "@hackbuild/agent";

function world() {
  const log: string[] = [];
  const floor = new Set(["mug", "ball"]);
  const broken = new Set<string>();
  const tools: Tool[] = [
    {
      name: "pick_up",
      description: "pick up a thing",
      parameters: { type: "object", properties: { thing: { type: "string" } }, required: ["thing"] },
      run([t]) {
        if (broken.has(t!)) throw new ToolError(`the ${t} slips out of my hand.`);
        log.push(`pick_up ${t}`);
        floor.delete(t!);
        return `holding ${t}`;
      },
    },
    { name: "go_to", description: "walk somewhere", parameters: { type: "object", properties: { place: { type: "string", enum: ["table", "shelf", "door"] } }, required: ["place"] }, run: ([p]) => void log.push(`go_to ${p}`) },
    { name: "wave", description: "wave", run: () => void log.push("wave") },
  ];
  return { log, floor, broken, tools };
}

describe("plan parsing", () => {
  const names = ["pick_up", "go_to", "wave"];
  test("the contract shape", () => {
    const p = parsePlan('{"think":"t","say":"ok","do":[["go_to","table"],["pick_up","mug"]],"done":false}', names);
    expect(p.do).toEqual([{ tool: "go_to", args: ["table"] }, { tool: "pick_up", args: ["mug"] }]);
    expect(p).toMatchObject({ say: "ok", done: false, from: "json" });
  });
  test("drifted shapes", () => {
    expect(parsePlan('<think>x</think>{"say":"","actions":[{"tool":"pick_up","args":{"thing":"mug"}}]}', names).do).toEqual([{ tool: "pick_up", args: ["mug"] }]);
    expect(parsePlan('{"do":["pick_up(mug)", "go to(shelf)"]}', names).do).toEqual([{ tool: "pick_up", args: ["mug"] }, { tool: "go_to", args: ["shelf"] }]);
    expect(parsePlan('{"do":["pick_up","mug"]}', names).do).toEqual([{ tool: "pick_up", args: ["mug"] }]);
    expect(parsePlan('{"do":[{"name":"fly","arguments":[]}, ["wave"]]}', names)).toMatchObject({ do: [{ tool: "wave", args: [] }], unknown: ["fly"] });
    expect(parsePlan('noise {"say":"hi","do":[],"done":true} trailing', names).say).toBe("hi");
  });
  test("caps steps and falls back to speech", () => {
    const many = JSON.stringify({ do: Array.from({ length: 9 }, () => ["wave"]) });
    expect(parsePlan(many, names, 4).do.length).toBe(4);
    expect(parsePlan("sure, I can do that.", names)).toMatchObject({ say: "sure, I can do that.", do: [], done: true, from: "text" });
  });
  test("say streams ahead of the closing brace", () => {
    const s = new SayStream();
    const parts = ['{"think":"a","sa', 'y": "hel', 'lo \\"you\\"\\n', 'and \\u00e9', 'nd", "do": [', "]}"].map((c) => s.push(c));
    expect(parts.join("")).toBe('hello "you"\nand énd');
    expect(parts[1]).toBe("hel");
    expect(s.closed).toBe(true);
  });
});

describe("registry", () => {
  const w = world();
  const reg = createRegistry(w.tools);
  test("checks arguments against the schema in first person", async () => {
    expect(reg.check({ tool: "go_to", args: ["moon"] })).toBe("i cannot go to moon: place is one of table, shelf, door.");
    expect(reg.check({ tool: "pick_up", args: [] })).toContain("pick_up needs thing");
    expect(reg.check({ tool: "fly", args: [] })).toContain("i do not know how to fly");
    w.broken.add("vase");
    const r = await reg.run({ tool: "pick_up", args: ["vase"] }, { signal: new AbortController().signal, heard: null });
    expect(r).toMatchObject({ ok: false, text: "the vase slips out of my hand." });
    expect(reg.describe()).toContain("- go_to(place: table | shelf | door): walk somewhere");
    expect(reg.specs()[0]!.name).toBe("pick_up");
  });
});

describe("reflex", () => {
  test("clauses and rules", () => {
    expect(clauses("Please go to the table, then pick up the mug and wave.")).toEqual(["go to the table", "pick up the mug", "wave"]);
    const r = new Reflex()
      .add(/^go to (?:the )?(\w+)/, (m) => [{ tool: "go_to", args: [m[1]!] }])
      .add(/^pick up (?:the )?(.+)/, (m) => [{ tool: "pick_up", args: [m[1]!] }])
      .add(/^wave/, [{ tool: "wave", args: [] }]);
    expect(r.parse("go to the table, then pick up the mug and sing")).toEqual({
      steps: [
        { tool: "go_to", args: ["table"] },
        { tool: "pick_up", args: ["mug"] },
      ],
      missed: ["sing"],
    });
    expect(r.parse("sing")).toBeNull();
  });
});

describe("model turn", () => {
  test("runs steps, streams say early, ends on done, caches the plan", async () => {
    const w = world();
    const brain = scripted({ replies: ['{"think":"","say":"getting the mug for you","do":[["go_to","table"],["pick_up","mug"]],"done":true}'], chunk: 6 });
    const says: string[] = [];
    const a = createAgent({ tools: w.tools, brain, soul: "you are a helper.", onSay: (t, f) => says.push(f ? "|" : t), now: () => 0 });
    const r = await a.handle("bring the mug over", "heard");
    expect(r.ended).toBe("done");
    expect(w.log).toEqual(["go_to table", "pick_up mug"]);
    expect(says.filter((s) => s !== "|").length).toBeGreaterThan(2);
    expect(says.filter((s) => s !== "|").join("")).toBe("getting the mug for you");
    expect(says[says.length - 1]).toBe("|");
    expect(brain.calls[0]!.schema).toBeDefined();
    expect(brain.calls[0]!.messages[0]!.content).toContain("HOW A TURN WORKS");
    expect(brain.calls[0]!.messages[1]!.content).toContain('THE PERSON SAID: "bring the mug over"');
    // the same request again runs from the cache with no model call
    w.log.length = 0;
    const r2 = await a.handle("Bring the mug over.", "heard");
    expect(r2.ended).toBe("cache");
    expect(brain.calls.length).toBe(1);
    expect(a.cost).toMatchObject({ modelCalls: 1, cacheHits: 1 });
  });

  test("a failing cached plan is evicted", async () => {
    const w = world();
    const brain = scripted({ replies: ['{"say":"","do":[["pick_up","ball"]],"done":true}'] });
    const a = createAgent({ tools: w.tools, brain, soul: "s" });
    await a.handle("grab ball");
    expect(a.cache.length).toBe(1);
    w.broken.add("ball");
    await a.handle("grab ball");
    expect(a.cache.get("grab ball")).toBeNull();
  });

  test("results come back as DONE THIS TURN, failures in first person", async () => {
    const w = world();
    w.broken.add("mug");
    const brain = scripted({ replies: ['{"say":"","do":[["pick_up","mug"]],"done":false}', '{"say":"it keeps slipping","do":[],"done":true}'] });
    const a = createAgent({ tools: w.tools, brain, soul: "s" });
    const r = await a.handle("pick up the mug");
    expect(r.ended).toBe("done");
    expect(brain.calls[1]!.messages[1]!.content).toContain("- pick_up mug: FAILED, the mug slips out of my hand.");
    expect(r.said).toEqual(["it keeps slipping"]);
  });

  test("empty plan twice ends the turn and the first switches hints on", async () => {
    const w = world();
    const brain = scripted({ replies: ['{"say":"","do":[],"done":false}'] });
    const ev: AgentEvent[] = [];
    const reflex = new Reflex().add(/wave/, [{ tool: "wave", args: [] }]);
    const a = createAgent({ tools: w.tools, brain, soul: "s", reflex, onEvent: (e) => ev.push(e) });
    const r = await a.handle("wave at me");
    expect(r.ended).toBe("empty");
    expect(r.calls).toBe(2);
    expect(brain.calls[1]!.messages[1]!.content).toContain("HINT, a simple way to do the next part: wave");
    expect(ev.some((e) => e.type === "hint")).toBe(true);
  });

  test("the same failing plan twice ends the turn", async () => {
    const w = world();
    w.broken.add("mug");
    const brain = scripted({ replies: ['{"say":"","do":[["pick_up","mug"]],"done":false}'] });
    const r = await createAgent({ tools: w.tools, brain, soul: "s" }).handle("pick up the mug");
    expect(r.ended).toBe("repeat");
    expect(r.calls).toBe(2);
  });

  test("five failures end the turn; two switch hints on and coach the goal", async () => {
    const w = world();
    let n = 0;
    const brain = scripted({ replies: () => `{"say":"","do":[["go_to","nowhere${n++}"]],"done":false}` });
    const goals = new Goals();
    const ev: AgentEvent[] = [];
    const a = createAgent({ tools: w.tools, brain, soul: "s", goals, onEvent: (e) => ev.push(e) });
    const r = await a.handle("find the keys");
    expect(r.ended).toBe("failures");
    expect(r.calls).toBe(5);
    expect(r.goal?.coach).toBe(true);
    expect(ev.some((e) => e.type === "goal" && e.change === "coach")).toBe(true);
  });

  test("steps running out on a heard request become a custom goal", async () => {
    const w = world();
    const brain = scripted({ replies: ['{"say":"","do":[["wave"]],"done":false}'] });
    const goals = new Goals();
    const a = createAgent({ tools: w.tools, brain, soul: "s", goals, steps: 2, guards: { repeat: { count: 9, window: 9 } } });
    const r = await a.handle("keep waving");
    expect(r.ended).toBe("steps");
    expect(goals.active()).toMatchObject({ kind: "custom", text: "keep waving" });
  });

  test("schema refused, the reply still parses from free text", async () => {
    const w = world();
    const brain = scripted({ replies: ['Sure. {"say":"ok","do":[["wave"]],"done":true}'], refuseSchema: "unsupported schema" });
    const r = await createAgent({ tools: w.tools, brain, soul: "s" }).handle("wave");
    expect(r.ended).toBe("done");
    expect(w.log).toEqual(["wave"]);
  });

  test("garbage replies trip the guard", async () => {
    const w = world();
    const brain = scripted({ replies: ["ha".repeat(40)] });
    const r = await createAgent({ tools: w.tools, brain, soul: "s" }).handle("hello");
    expect(r).toMatchObject({ ended: "guard", calls: 2, said: [] });
  });

  test("memory recall goes in, episodes and lessons go out", async () => {
    const w = world();
    w.broken.add("vase");
    const wrote: string[] = [];
    const brain = scripted({ replies: ['{"say":"","do":[["pick_up","vase"]],"done":false}', '{"say":"","do":[["pick_up","vase"]],"done":false}', '{"say":"","do":[],"done":true}'] });
    const goals = new Goals();
    const a = createAgent({
      tools: w.tools,
      brain,
      soul: "s",
      goals,
      guards: { repeat: { count: 9, window: 9 } },
      memory: { recall: () => ["the vase is fragile"], write: (k, t) => void wrote.push(`${k}: ${t}`) },
    });
    await a.handle("collect the vase");
    expect(brain.calls[0]!.messages[1]!.content).toContain("YOU REMEMBER\n- the vase is fragile");
    expect(wrote.some((x) => x.startsWith("lesson: vase:"))).toBe(true);
    expect(wrote.some((x) => x.startsWith('episode: they said "collect the vase"'))).toBe(true);
    expect(goals.active()!.skip).toEqual(["vase"]);
  });

  test("context budget keeps high priorities", () => {
    const a = createAgent({ tools: [], soul: "s", budgetTokens: 60 });
    const ctx = a.context({
      heard: "hi",
      why: "heard",
      goal: null,
      hint: "",
      done: [],
      recalled: ["x".repeat(400)],
      perception: { sections: [{ name: "options", priority: 9, text: "YOU CAN DO NOW\n- wave" }, { name: "map", priority: 6, text: "MAP\n" + "y".repeat(300) }] },
    });
    expect(ctx.kept).toEqual(["options"]);
    expect(ctx.dropped).toEqual(["map", "recall"]);
  });
});

describe("no model: reflex brain and goal planners", () => {
  test("reflex runs a request, unknown requests get one line", async () => {
    const w = world();
    const reflex = new Reflex().add(/^wave/, [{ tool: "wave", args: [] }]);
    const says: string[] = [];
    const a = createAgent({ tools: w.tools, soul: "s", reflex, onSay: (t) => says.push(t) });
    expect((await a.handle("wave")).ended).toBe("reflex");
    expect(a.cost.reflexHits).toBe(1);
    expect((await a.handle("sing")).ended).toBe("no-brain");
    expect(says[0]).toBe("i do not know how to do that yet.");
  });

  test("tidy goal by planner, persisted, reported once", async () => {
    const w = world();
    const store = new Map<string, string>();
    const sink = storageSink({ getItem: (k) => store.get(k) ?? null, setItem: (k, v) => void store.set(k, v) });
    const goals = new Goals<{ floor: Set<string> }>({ sink, now: () => 1000 }).planner("tidy", (g, s) => {
      const next = [...s.floor].find((x) => !g.skip.includes(x));
      return next ? { steps: [{ tool: "pick_up", args: [next] }] } : { done: `tidied, ${g.skip.length} skipped` };
    });
    const a = createAgent({ tools: w.tools, soul: "s", goals, perceive: () => ({ state: { floor: w.floor } }) });
    await a.handle("tidy up the room");
    expect(goals.active()).toMatchObject({ kind: "tidy", target: "room" });
    w.broken.add("mug");
    for (let i = 0; i < 5; i++) await a.handle("", "goal");
    expect(goals.list()[0]!.status).toBe("done");
    expect(goals.list()[0]!.skip).toEqual(["mug"]);
    const rep = await a.handle("", "report");
    expect(rep.said).toEqual(["tidy up the room: tidied, 1 skipped."]);
    expect((await a.handle("", "report")).said).toEqual([]);
    const again = new Goals({ sink });
    await again.load();
    expect(again.list()[0]).toMatchObject({ kind: "tidy", status: "done", reported: true });
  });

  test("a reflex goal is blocked after seven tries without progress", async () => {
    const w = world();
    w.broken.add("ball");
    const goals = new Goals<null>().planner("fetch", (g) => ({ steps: [{ tool: "pick_up", args: [g.target ?? ""] }] }));
    const a = createAgent<null>({ tools: w.tools, soul: "s", goals, perceive: () => ({ state: null }) });
    await goals.add("fetch", "ball", "fetch the ball");
    for (let i = 0; i < 7; i++) await a.handle("", "goal");
    expect(goals.list()[0]!.status).toBe("blocked");
  });

  test("free ticks pick an idle plan by the injected rng", async () => {
    const w = world();
    const a = createAgent({ tools: w.tools, soul: "s", idle: [[{ tool: "wave", args: [] }], [{ tool: "go_to", args: ["door"] }]], rng: () => 0.9 });
    await a.handle("", "free");
    expect(w.log).toEqual(["go_to door"]);
  });
});

describe("goals and cache", () => {
  test("parse kinds", () => {
    const g = new Goals();
    expect(g.parse("Please bring me the red mug.")).toEqual({ kind: "fetch", target: "red mug" });
    expect(g.parse("where is my phone?")).toEqual({ kind: "find", target: "phone" });
    expect(g.parse("look around")).toEqual({ kind: "explore", target: null });
    expect(g.parse("hello")).toBeNull();
  });
  test("cache holds 60 and normalizes", () => {
    const c = new PlanCache(60);
    for (let i = 0; i < 70; i++) c.set(`do ${i}`, [{ tool: "wave", args: [] }]);
    expect(c.length).toBe(60);
    expect(c.get("do 5")).toBeNull();
    expect(c.get("Do 69?")).not.toBeNull();
  });
});

describe("overlapping turns", () => {
  test("cancel reaches the newer turn after the older one finishes", async () => {
    const gates: (() => void)[] = [];
    const seen: AbortSignal[] = [];
    const tools: Tool[] = [
      {
        name: "wait",
        description: "wait",
        run: (_a, ctx) => {
          seen.push(ctx.signal);
          return new Promise<void>((r) => gates.push(r));
        },
      },
    ];
    const brain = scripted({ replies: ['{"say":"","do":[["wait"]],"done":true}', '{"say":"","do":[["wait"]],"done":true}'] });
    const a = createAgent({ tools, brain, soul: "s" });
    const tA = a.handle("first");
    await vi.waitFor(() => expect(gates.length).toBe(1));
    const tB = a.handle("second");
    await vi.waitFor(() => expect(gates.length).toBe(2));
    gates[0]!();
    await tA;
    a.cancel();
    expect(seen[1]!.aborted).toBe(true);
    gates[1]!();
    await tB;
  });
  test("a plan holds at most maxActions steps", async () => {
    const w = world();
    const brain = scripted({ replies: ['{"say":"","do":[["wave"],["wave"],["wave"],["wave"],["wave"]],"done":true}'] });
    await createAgent({ tools: w.tools, brain, soul: "s", maxActions: 3 }).handle("wave a lot");
    expect(w.log.filter((x) => x === "wave").length).toBe(3);
  });
});


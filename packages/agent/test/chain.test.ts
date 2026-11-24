import { describe, expect, test } from "vitest";
import { scripted } from "@hackbuild/chat";
import { createPlannerChain, dropLine, Reflex } from "@hackbuild/agent";

const tools = ["go_to", "pick_up"];
const reflex = new Reflex().add(/^get the (\w+)$/, (m) => [{ tool: "pick_up", args: [m[1]!] }]);
const good = '{"think": "", "say": "on it", "do": [["go_to", "table"]], "done": false}';

describe("planner chain", () => {
  test("the model plans when it returns a valid plan", async () => {
    const c = createPlannerChain({ tools, model: scripted({ replies: [good] }), reflex, now: () => 5 });
    const r = await c.plan({ text: "get the mug" });
    expect(r).toMatchObject({ tier: "model", drops: [] });
    expect(r!.plan.do).toEqual([{ tool: "go_to", args: ["table"] }]);
  });

  test("no valid plan three times steps down to scripted, recording the reason and the last reply", async () => {
    const brain = scripted({ replies: ["{}", "flying now", '{"do": [["fly", "away"]]}'] });
    const c = createPlannerChain({ tools, model: brain, scripted: scripted({ replies: [good] }), reflex, now: () => 7 });
    const r = await c.plan({ text: "get the mug" });
    expect(brain.calls.length).toBe(3);
    expect(r!.tier).toBe("scripted");
    expect(r!.drops).toEqual([{ from: "model", to: "scripted", reason: "invalid", detail: "3 replies held no valid plan", tries: 3, raw: '{"do": [["fly", "away"]]}', at: 7 }]);
    expect(dropLine(r!.drops[0]!)).toBe("the brain returned no valid plan three times. the scripted planner took over.");
  });

  test("with no scripted planner, reflexes take over and the absent tier is recorded too", async () => {
    const c = createPlannerChain({ tools, model: scripted({ replies: ["nonsense"] }), reflex });
    const r = await c.plan({ text: "get the mug" });
    expect(r!.tier).toBe("reflex");
    expect(r!.plan.do).toEqual([{ tool: "pick_up", args: ["mug"] }]);
    expect(r!.drops.map((d) => [d.from, d.reason, d.to])).toEqual([
      ["model", "invalid", "reflex"],
      ["scripted", "absent", "reflex"],
    ]);
    expect(dropLine(r!.drops[0]!)).toBe("the brain returned no valid plan three times. reflexes took over.");
  });

  test("an error drops at once; loading and no brain are reasons of their own", async () => {
    const c = createPlannerChain({ tools, model: { ...scripted({ replies: [good] }), complete: async () => Promise.reject(new Error("out of gpu memory")) }, scripted: scripted({ replies: [good] }) });
    const r = await c.plan({ text: "x" });
    expect(r!.drops[0]).toMatchObject({ reason: "error", detail: "out of gpu memory", tries: 1, to: "scripted" });
    let loading = true;
    const c2 = createPlannerChain({ tools, getModel: () => scripted({ replies: [good] }), loading: () => loading, reflex });
    expect((await c2.plan({ text: "get the cup" }))!.drops[0]).toMatchObject({ from: "model", reason: "loading" });
    loading = false;
    expect((await c2.plan({ text: "get the cup" }))!.tier).toBe("model");
    const c3 = createPlannerChain({ tools, reflex });
    const r3 = await c3.plan({ text: "get the cup" });
    expect(dropLine(r3!.drops[0]!)).toBe("no brain loaded. reflexes took over.");
    expect(c3.log.length).toBe(2);
  });

  test("nothing left: null with every reason kept for the inspector", async () => {
    const c = createPlannerChain({ tools, reflex });
    expect(await c.plan({ text: "sing a song" })).toBeNull();
    expect(c.lastDrops.map((d) => d.reason)).toEqual(["absent", "absent", "no-match"]);
    expect(dropLine(c.lastDrops[2]!)).toBe("reflexes had no rule for that. nothing was left to plan.");
  });

  test("a plan function works as a tier", async () => {
    const c = createPlannerChain({ tools, model: null, scripted: (req) => (req.text === "hi" ? '{"say": "hello"}' : null), reflex });
    expect((await c.plan({ text: "hi" }))!.plan.say).toBe("hello");
    const r = await c.plan({ text: "get the mug" });
    expect(r!.tier).toBe("reflex");
    expect(r!.drops.map((d) => d.reason)).toEqual(["absent", "invalid"]);
  });
});

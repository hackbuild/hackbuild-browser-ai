import { describe, expect, test } from "vitest";
import { budget, CoreMemory, expandQuery, hashedEmbedder, injectRecall, jaccard, RecallConversation, RECALL_NOTE, select, fingerprint } from "@hackbuild/memory";

describe("budget", () => {
  test("keeps fixed lines and adds sections by priority while they fit", () => {
    const a = budget({
      budgetTokens: 10,
      estimate: (s) => s.length,
      fixed: ["ab"],
      sections: [
        { name: "low", priority: 1, text: "xx" },
        { name: "big", priority: 9, text: "123456789" },
        { name: "mid", priority: 5, text: "yyyy" },
      ],
    });
    expect(a.kept).toEqual(["mid", "low"]);
    expect(a.dropped).toEqual(["big"]);
    expect(a.usedTokens).toBe(8);
    expect(a.text).toBe("ab\n\nyyyy\n\nxx");
  });
});

describe("select", () => {
  test("caps per section, drops near duplicates, trims at a word", () => {
    const out = select(
      [
        { text: "the mug is on the shelf", section: "a" },
        { text: "the mug is on the shelf now", section: "b" },
        { text: "dog sleeps by the door", section: "a" },
        { text: "a third from section a", section: "a" },
        { text: "rain on the window all morning long", section: "c" },
      ],
      { k: 4, maxChars: 60 },
    );
    expect(out[0]).toBe("the mug is on the shelf");
    expect(out[1]).toBe("dog sleeps by the door");
    expect(out.length).toBe(3);
    expect(out.join("").length).toBeLessThanOrEqual(60);
    expect(out[2]).toBe("rain on the");
    expect(jaccard("a b", "a b")).toBe(1);
  });

  test("expands short queries with the previous turn", () => {
    expect(expandQuery("why?", "tell me about the bakery job")).toBe("tell me about the bakery job why?");
    expect(expandQuery("x".repeat(50), "prev")).toBe("x".repeat(50));
  });
});

describe("prefix stable injection", () => {
  const ser = (ms: { role: string; content: string }[]) => ms.map((m) => `<${m.role}>${m.content}`).join("");

  test("a later prompt starts with every byte of the earlier one", () => {
    const c = new RecallConversation("you are a dog.");
    const p1 = c.user("hi, remember me?", ["they work at a bakery"]);
    c.assistant("yes, the bakery.");
    const p2 = c.user("what do I do?", ["they like rye"]);
    expect(ser(p2).startsWith(ser(p1))).toBe(true);
    expect(p1[0]!.content.endsWith(RECALL_NOTE)).toBe(true);
    expect(p2[3]!.content).toBe("what do I do?\n[memory] they like rye");
  });

  test("injectRecall changes only the system note and the last user message", () => {
    const msgs = [
      { role: "system" as const, content: "sys" },
      { role: "user" as const, content: "one" },
      { role: "assistant" as const, content: "two" },
      { role: "user" as const, content: "three" },
    ];
    const a = injectRecall(msgs, ["fact\nwith newline"]);
    expect(a[1]).toEqual(msgs[1]);
    expect(a[3]!.content).toBe("three\n[memory] fact with newline");
    const b = injectRecall(a.slice(0, 3), []);
    expect(b[0]!.content).toBe(a[0]!.content);
    expect(msgs[3]!.content).toBe("three");
    expect(injectRecall([{ role: "user", content: "x" }], [])[0]).toEqual({ role: "system", content: RECALL_NOTE });
  });
});

describe("core memory", () => {
  test("dedupes on the first 40 characters and evicts the oldest past 700", () => {
    const c = new CoreMemory();
    expect(c.append("their name is Sam")).toBe(true);
    expect(c.append("Their name is Sam.")).toBe(false);
    for (let i = 0; i < 20; i++) c.append(`fact number ${i} ${"x".repeat(40)}`);
    expect(c.text().length).toBeLessThanOrEqual(700);
    expect(c.lines[0]).not.toBe("their name is Sam");
    expect(c.remove("number 19")).toBe(true);
  });
});

describe("hashed embedder", () => {
  test("unit vectors, shared words score higher", async () => {
    const e = hashedEmbedder(64);
    const [a, b, c] = await e.embed(["the red ball rolled", "a red ball", "taxes due in april"]);
    const dot = (x: Float32Array, y: Float32Array) => x.reduce((s, v, i) => s + v * y[i]!, 0);
    expect(dot(a!, a!)).toBeCloseTo(1, 5);
    expect(dot(a!, b!)).toBeGreaterThan(dot(a!, c!));
    expect(e.id).toBe("hash-ngram-64-v1");
    expect(fingerprint(["a"], e.id)).not.toBe(fingerprint(["b"], e.id));
  });
});

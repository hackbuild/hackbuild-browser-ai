import { describe, expect, it } from "vitest";
import { scripted } from "@hackbuild/chat";
import { chatList, personaRack, transcribeQueue, voiceRow } from "@hackbuild/ai-views";

describe("chat studio state", () => {
  it("sends sampling and a trimmed history, calls onReply, and dumps and restores chats", async () => {
    const seen: unknown[] = [];
    const engine = scripted({ replies: ["one", "two", "three"] });
    const stream = engine.stream.bind(engine);
    engine.stream = (m, o) => (seen.push({ n: m.length, t: o?.temperature }), stream(m, o));
    const said: string[] = [];
    const list = chatList({ engine, system: () => "be brief", stream: () => ({ temperature: 0.3 }), history: () => 0, onReply: (_t, s) => said.push(s) });
    await list.thread.send("a");
    await list.thread.send("b");
    expect(seen).toEqual([{ n: 2, t: 0.3 }, { n: 2, t: 0.3 }]);
    expect(said).toEqual(["a", "b"]);
    const data = list.dump();
    const other = chatList({});
    other.restore(data);
    expect(other.thread.snapshot().turns.map((t) => t.text)).toEqual(["a", "one", "b", "two"]);
    expect(() => other.restore({ format: "x" } as never)).toThrow();
  });

  it("persona: profile first, rules dropped first under a small budget", () => {
    const r = personaRack({ persona: { name: "a", profile: "p".repeat(40), notes: "n".repeat(40), rules: "r".repeat(400) } });
    const s = r.system([{ label: "the bench is in the garage" }], 40);
    expect(s.text.startsWith("p")).toBe(true);
    expect(s.dropped).toContain("rules");
    r.save("mine");
    expect(r.snapshot().presets.map((p) => p.label)).toEqual(["mine"]);
  });

  it("voice: auto speak only when on", async () => {
    const spoke: string[] = [];
    const engine = { kind: "native" as const, id: "t", licence: "t", load: async () => undefined, speak: async (t: string) => void spoke.push(t), stop: () => undefined, voices: () => ["a"] };
    const v = voiceRow(engine);
    v.reply("hi");
    v.set({ auto: true });
    v.reply("there");
    await new Promise((r) => setTimeout(r, 0));
    expect(spoke).toEqual(["there"]);
  });

  it("queue: run options reach the transcriber, stats feed the readout, zip carries a manifest", async () => {
    let got: unknown;
    const stats = { dur: 3, noiseDb: -60, speechDb: -20, snrDb: 40, gainDb: 2, density: 0.5, thrDb: -54, loudDb: -10, reels: 1, wall: 1, rtf: 3, forced: false };
    const q = transcribeQueue({ autostart: false, options: () => ({ channel: "L", targetDb: -20 }), run: async (_f, c) => ((got = c.options), { segments: [{ start: 0, end: 1, text: "sit." }], duration: 3, stats, model: "m", language: "en" }) });
    q.add([Object.assign(new Blob(["x"]), { name: "a.wav" })]);
    await q.start();
    expect(got).toEqual({ channel: "L", targetDb: -20 });
    expect(q.snapshot().channels[0]!.meta.some((m) => m.label === "snr")).toBe(true);
    const z = q.zip({ date: new Date(0) })!;
    expect(z.manifest.files[0]!.outputs).toEqual(["a.txt", "a.srt", "a.vtt", "a.json"]);
    expect(z.data[0]).toBe(0x50);
  });
});

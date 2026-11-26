import { describe, expect, it } from "vitest";
import { canClone, speaker } from "../src/speaker.js";

describe("speaker", () => {
  it("plays lines in order with no engine, and stop drops the queue", async () => {
    const said: string[] = [];
    const lines: string[] = [];
    const sp = speaker(() => null, { play: async (l) => void said.push(l.text), onLine: (t) => lines.push(t) });
    void sp.say("one");
    await sp.say("two");
    expect(said).toEqual(["one", "two"]);
    expect(lines).toEqual(["one", "two"]);
    sp.stop();
    expect(sp.cloned).toBe(false);
    expect(sp.cloneWav()).toBeNull();
  });
  it("knows a cloning engine by its cloneVoice", () => {
    expect(canClone({ cloneVoice: () => undefined })).toBe(true);
    expect(canClone({ kind: "native" })).toBe(false);
    expect(canClone(null)).toBe(false);
  });
  it("reports a line that fails and goes on with the next", async () => {
    const errs: string[] = [];
    const said: string[] = [];
    const sp = speaker(() => null, { play: async (l) => { if (l.text === "bad") throw new Error("no audio"); said.push(l.text); }, onError: (e, t) => errs.push(`${t}: ${(e as Error).message}`) });
    await sp.say("bad");
    await sp.say("good");
    expect(errs).toEqual(["bad: no audio"]);
    expect(said).toEqual(["good"]);
  });
});

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
});

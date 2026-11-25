import { describe, expect, test, vi } from "vitest";
import { createListener, dictate, energyVad, selfGate, speechEngine, stablePrefix, type Interim, type Utterance } from "@hackbuild/listen";
import type { SpeechRecognitionLike } from "@hackbuild/transcribe";

function tone(sec: number, amp: number, rate = 16000): Float32Array {
  return new Float32Array(Math.round(sec * rate)).map((_, i) => amp * Math.sin((2 * Math.PI * 300 * i) / rate));
}
async function feed(l: ReturnType<typeof createListener>, parts: Float32Array[]) {
  for (const p of parts) for (let i = 0; i < p.length; i += 2048) l.push(p.subarray(i, i + 2048));
  await l.idle();
}

/** A stub engine: words by how much audio it was given, one word per 0.4 s. */
const WORDS = "put the mug on the shelf by the window please".split(" ");
const stubAsr = (calls: number[]) => async (pcm: Float32Array) => {
  calls.push(pcm.length);
  return WORDS.slice(0, Math.max(1, Math.floor(pcm.length / 6400))).join(" ");
};

test("stable prefix is the shared leading words", () => {
  expect(stablePrefix("", "put the")).toBe("");
  expect(stablePrefix("put the mug", "Put the mud on")).toBe("Put the");
  expect(stablePrefix("put the,", "put the mug")).toBe("put the");
});

describe("window path", () => {
  test("the growing window is decoded again, throttled, and the final follows", async () => {
    const calls: number[] = [];
    const seen: Interim[] = [];
    const got: Utterance[] = [];
    const l = createListener({
      vad: energyVad(),
      inputRate: 16000,
      transcribe: async () => "put the mug on the shelf",
      interim: { transcribe: stubAsr(calls), everySec: 0.5 },
      onInterim: (i) => seen.push(i),
      onUtterance: (u) => got.push(u),
    });
    l.start();
    await feed(l, [tone(1, 0.0005), tone(2.4, 0.3), tone(1, 0.0005)]);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    // each decode had at least 0.5 s more audio than the one before
    for (let i = 1; i < calls.length; i++) expect(calls[i]! - calls[i - 1]!).toBeGreaterThanOrEqual(8000);
    for (let i = 1; i < seen.length; i++) {
      expect(seen[i]!.t).toBeGreaterThan(seen[i - 1]!.t);
      expect(seen[i]!.text.startsWith(seen[i]!.stable)).toBe(true);
    }
    expect(seen.at(-1)!.stable.length).toBeGreaterThan(0);
    expect(got.map((u) => u.text)).toEqual(["put the mug on the shelf"]);
  });

  test("a decode that lands after the end is dropped", async () => {
    const seen: Interim[] = [];
    let release: (() => void) | undefined;
    const slow = (pcm: Float32Array) => new Promise<string>((r) => (release = () => r(`${pcm.length}`)));
    const l = createListener({ vad: energyVad(), inputRate: 16000, transcribe: async () => "done", interim: { transcribe: slow }, onInterim: (i) => seen.push(i) });
    l.start();
    for (const p of [tone(1, 0.0005), tone(1, 0.3), tone(1, 0.0005)]) for (let i = 0; i < p.length; i += 2048) l.push(p.subarray(i, i + 2048));
    await new Promise((r) => setTimeout(r, 20));
    expect(release).toBeDefined();
    release?.();
    await l.idle();
    expect(seen).toEqual([]);
  });

  test("no interim and no final for speech in the gate after the voice stops", async () => {
    const seen: Interim[] = [];
    const got: Utterance[] = [];
    const l = createListener({ vad: energyVad(), inputRate: 16000, dropWhileTalking: true, gateMs: 2000, transcribe: async () => "echo", onInterim: (i) => seen.push(i), onUtterance: (u) => got.push(u) });
    l.start();
    await feed(l, [tone(1, 0.0005)]);
    l.setTalking(true);
    l.setTalking(false);
    await feed(l, [tone(1.2, 0.3), tone(1, 0.0005)]);
    expect(seen).toEqual([]);
    expect(got).toEqual([]);
    // past the gate it is heard again
    await feed(l, [tone(2, 0.0005), tone(1.2, 0.3), tone(1, 0.0005)]);
    expect(got.map((u) => u.text)).toEqual(["echo"]);
    expect(seen.length).toBeGreaterThan(0);
  });
});

type Ev = Parameters<NonNullable<SpeechRecognitionLike["onresult"]>>[0];
class FakeRec implements SpeechRecognitionLike {
  static last: FakeRec;
  lang = "";
  continuous = false;
  interimResults = false;
  starts = 0;
  onresult: SpeechRecognitionLike["onresult"] = null;
  onerror: SpeechRecognitionLike["onerror"] = null;
  onend: SpeechRecognitionLike["onend"] = null;
  constructor() {
    FakeRec.last = this;
  }
  start() {
    this.starts++;
  }
  stop() {}
  say(parts: [string, boolean][]) {
    const results = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
    this.onresult?.({ resultIndex: 0, results } as Ev);
  }
}

describe("system recognizer", () => {
  test("interim results join, carry a stable prefix, and the final commits", () => {
    let clock = 0;
    const seen: Interim[] = [];
    const finals: string[] = [];
    const e = speechEngine({ Recognition: FakeRec, now: () => clock, onInterim: (i) => seen.push(i), onFinal: (t) => finals.push(t) });
    e.start();
    expect(FakeRec.last.interimResults).toBe(true);
    FakeRec.last.say([["put the", false]]);
    clock = 600;
    FakeRec.last.say([["put the mug", false], [" on", false]]);
    FakeRec.last.say([["put the mug on the shelf", true]]);
    expect(seen).toEqual([
      { text: "put the", stable: "", t: 0 },
      { text: "put the mug on", stable: "put the", t: 0.6 },
    ]);
    expect(finals).toEqual(["put the mug on the shelf"]);
  });

  test("results are dropped while the gate is closed", () => {
    let clock = 0;
    const gate = selfGate({ tailMs: 400, now: () => clock });
    const seen: Interim[] = [];
    const finals: string[] = [];
    speechEngine({ Recognition: FakeRec, gate, onInterim: (i) => seen.push(i), onFinal: (t) => finals.push(t) }).start();
    gate.setSpeaking(true);
    FakeRec.last.say([["hello there", true]]);
    gate.setSpeaking(false);
    clock = 300;
    FakeRec.last.say([["there", false]]);
    clock = 800;
    FakeRec.last.say([["hi", true]]);
    expect(seen).toEqual([]);
    expect(finals).toEqual(["hi"]);
  });

  test("it restarts after 150 ms, reports denied, and unsupported with no recognizer", () => {
    vi.useFakeTimers();
    const states: string[] = [];
    const e = speechEngine({ Recognition: FakeRec, onState: (s) => states.push(s) });
    e.start();
    FakeRec.last.onend?.();
    vi.advanceTimersByTime(149);
    expect(FakeRec.last.starts).toBe(1);
    vi.advanceTimersByTime(1);
    expect(FakeRec.last.starts).toBe(2);
    FakeRec.last.onerror?.({ error: "not-allowed" });
    FakeRec.last.onend?.();
    vi.advanceTimersByTime(500);
    expect(FakeRec.last.starts).toBe(2);
    expect(states).toEqual(["listening", "denied"]);
    vi.useRealTimers();
    const g = globalThis as Record<string, unknown>;
    if (!g.SpeechRecognition && !g.webkitSpeechRecognition) expect(speechEngine().state).toBe("unsupported");
  });
});

describe("dictate", () => {
  test("interim words follow typed text and the final commits", () => {
    const box = { value: "note:" };
    const sent: string[] = [];
    const d = dictate(box, { onCommit: (v) => sent.push(v) });
    d.interim({ text: "buy", stable: "", t: 0 });
    expect(box.value).toBe("note: buy");
    d.interim({ text: "buy milk", stable: "buy", t: 0.5 });
    expect(box.value).toBe("note: buy milk");
    expect(d.active).toBe(true);
    expect(d.final("buy milk and eggs")).toBe("note: buy milk and eggs");
    expect(d.active).toBe(false);
    expect(sent).toEqual(["note: buy milk and eggs"]);
  });

  test("cancel and an empty final restore what was typed, and input events fire", () => {
    let events = 0;
    const box = { value: "", dispatchEvent: () => (events++, true) };
    const d = dictate(box);
    d.interim({ text: "uh", stable: "", t: 0 });
    d.cancel();
    expect(box.value).toBe("");
    d.interim({ text: "um", stable: "", t: 0 });
    d.final("");
    expect(box.value).toBe("");
    expect(events).toBe(4);
  });
});

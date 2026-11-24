import { describe, expect, it } from "vitest";
import {
  SignalTracker,
  SeenNotes,
  describePerception,
  rawFromLandmarks,
  reactionsFor,
  gazeTarget,
  wantsLook,
  VISION_RECORDS,
  type RawFace,
  type RawFrame,
  type Landmarks,
} from "@hackbuild/vision";

const face = (o: Partial<RawFace> = {}): RawFace => ({ x: 0.5, y: 0.5, yaw: 0, pitch: 0, smile: 0, surprise: 0, frown: 0, ...o });
const frame = (f: RawFace | null, hands: RawFrame["hands"] = null): RawFrame => ({ face: f, hands });

/** Feed frames every `step` ms from `t0` to `t1`; returns all events with their times. */
function run(t: SignalTracker, t0: number, t1: number, f: (now: number) => RawFrame, step = 50) {
  const out: { at: number; type: string; gesture?: string }[] = [];
  for (let now = t0; now <= t1; now += step) for (const e of t.feed(f(now), now)) out.push({ at: now, ...e });
  return out;
}

describe("signal tracker", () => {
  it("a single noisy frame fires nothing but the first arrival", () => {
    const t = new SignalTracker();
    run(t, 0, 3000, () => frame(face()));
    const ev = run(t, 3050, 3050, () => frame(face({ smile: 1 })));
    ev.push(...run(t, 3100, 4000, () => frame(face())));
    expect(ev).toEqual([]);
  });

  it("a smile held over 0.55 fires once and not again within 10 s", () => {
    const t = new SignalTracker();
    run(t, 0, 1000, () => frame(face()));
    const first = run(t, 1050, 4000, () => frame(face({ smile: 0.9 })));
    expect(first.filter((e) => e.type === "smiled")).toHaveLength(1);
    // drop the smile, smile again inside the cooldown
    run(t, 4050, 6000, () => frame(face()));
    const again = run(t, 6050, 9000, () => frame(face({ smile: 0.9 })));
    expect(again).toEqual([]);
    run(t, 9050, 11000, () => frame(face()));
    const later = run(t, 11050, 14000, () => frame(face({ smile: 0.9 })));
    expect(later.filter((e) => e.type === "smiled")).toHaveLength(1);
  });

  it("keeps presence through a short loss, says left after 8 s, arrived only after 20 s away", () => {
    const t = new SignalTracker();
    expect(run(t, 0, 0, () => frame(face()))).toEqual([{ at: 0, type: "arrived" }]);
    run(t, 50, 2000, () => frame(null));
    expect(t.perception.present).toBe(true);
    const gone = run(t, 2050, 9000, () => frame(null));
    expect(t.perception.present).toBe(false);
    expect(gone.map((e) => e.type)).toEqual(["left"]);
    expect(gone[0]!.at).toBeGreaterThan(8000);
    // back after 10 s away: no arrival
    expect(run(t, 10000, 10000, () => frame(face()))).toEqual([]);
    run(t, 10050, 15000, () => frame(null));
    // back after more than 20 s away
    expect(run(t, 36000, 36000, () => frame(face())).map((e) => e.type)).toEqual(["arrived"]);
  });

  it("two wrist reversals inside 1.5 s above the face give a wave; a low hand gives none", () => {
    const swing = (now: number) => (Math.floor(now / 300) % 2 ? 0.4 : 0.6);
    const t = new SignalTracker();
    const ev = run(t, 0, 1400, (now) => frame(face(), [{ x: swing(now), y: 0.3, gesture: null, score: 0 }]));
    expect(ev.filter((e) => e.type === "gesture").map((e) => e.gesture)).toEqual(["wave"]);
    const low = new SignalTracker();
    const ev2 = run(low, 0, 1400, (now) => frame(face(), [{ x: swing(now), y: 0.95, gesture: null, score: 0 }]));
    expect(ev2.filter((e) => e.type === "gesture")).toEqual([]);
  });

  it("a canned gesture under a 0.6 score is ignored; a held one fires once per 4 s", () => {
    const t = new SignalTracker();
    const weak = run(t, 0, 1000, () => frame(face(), [{ x: 0.5, y: 0.3, gesture: "Thumb_Up", score: 0.5 }]));
    expect(weak.filter((e) => e.type === "gesture")).toEqual([]);
    const strong = run(t, 1050, 4500, () => frame(face(), [{ x: 0.5, y: 0.3, gesture: "Thumb_Up", score: 0.9 }]));
    expect(strong.filter((e) => e.type === "gesture")).toEqual([{ at: 1400, type: "gesture", gesture: "thumbs_up" }]);
  });

  it("runs on faces alone: null hands leave the gesture state alone", () => {
    const t = new SignalTracker();
    run(t, 0, 500, () => frame(face({ x: 0.25, y: 0.5 })));
    expect(t.perception.gesture).toBeNull();
    expect(t.perception.face!.x).toBeGreaterThan(0.4);
  });
});

describe("raw frames from landmarks", () => {
  it("reads a 478 point face with blendshapes and gesture recognizer hands", () => {
    const pts: [number, number, number][] = Array.from({ length: 478 }, () => [0.5, 0.5, 0]);
    pts[234] = [0.4, 0.5, 0];
    pts[454] = [0.6, 0.5, 0];
    pts[10] = [0.5, 0.35, 0];
    pts[152] = [0.5, 0.65, 0];
    pts[1] = [0.55, 0.5, 0];
    const f: Landmarks = { points: [pts], blendshapes: [{ mouthSmileLeft: 0.8, mouthSmileRight: 0.6 }], source: "face-landmarker" };
    const h: Landmarks = { points: [[[0.3, 0.2, 0]]], gestures: [{ name: "Victory", score: 0.8 }], source: "gesture-recognizer" };
    const r = rawFromLandmarks(f, h);
    expect(r.face!.x).toBeCloseTo(0.5);
    expect(r.face!.yaw).toBeCloseTo(0.25);
    expect(r.face!.smile).toBeCloseTo(0.7);
    expect(r.face!.frown).toBe(0);
    expect(r.hands).toEqual([{ x: 0.3, y: 0.2, gesture: "Victory", score: 0.8 }]);
    expect(rawFromLandmarks(null).hands).toBeNull();
  });

  it("registers an optional gesture recognizer record with its licence as recorded", () => {
    const r = VISION_RECORDS.find((x) => x.id === "gesture-recognizer")!;
    expect(r.provides).toEqual(["landmarks.gesture"]);
    expect(r.commercial).toBe("unknown");
  });
});

describe("seen notes", () => {
  const p = { present: true, face: { x: 0, y: 0 }, facing: true, smile: 0.8, surprise: 0, frown: 0, gesture: "wave" as const };

  it("describes in lowercase and returns null when nothing changed", () => {
    expect(describePerception(p)).toBe("you are here, looking at me, smiling, waving");
    const n = new SeenNotes();
    expect(n.next(p)).toBe("you are here, looking at me, smiling, waving");
    expect(n.next(p)).toBeNull();
    expect(n.next(p, "A Red Mug")).toBe("you are here, looking at me, smiling, waving; i can see: a red mug");
    expect(n.next({ ...p, present: false })).toBe("you are not in view");
  });

  it("looks on demand for questions about what the camera shows", () => {
    expect(wantsLook("what am I holding")).toBe(true);
    expect(wantsLook("tell me a story")).toBe(false);
  });

  it("reactions draw their chance from the injected rng; gaze is clamped", () => {
    expect(reactionsFor({ type: "smiled" }, () => 0.9)).toEqual([]);
    expect(reactionsFor({ type: "smiled" }, () => 0.1)).toEqual([{ on: "smiled", kind: "mood", name: "happy", delayMs: 600, chance: 0.7 }]);
    expect(reactionsFor({ type: "gesture", gesture: "victory" }, () => 0).map((r) => r.name)).toEqual(["peace"]);
    expect(gazeTarget({ ...p, face: { x: 0.9, y: -0.5 } })).toEqual({ x: 1, y: -0.65 });
  });
});

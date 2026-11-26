/**
 * Perception signals: raw per frame face and hand readings become steady
 * signals (present, facing, smile, surprise, frown, gesture) and a few
 * discrete events (arrived, left, smiled, gesture). Everything is smoothed
 * or held for a moment, so one noisy frame never fires a reaction.
 *
 * `SignalTracker.feed(raw, now)` is pure apart from its own state: the
 * clock comes in with each frame. `rawFromLandmarks` builds a frame from
 * the `landmarks` results of this package (face points plus blendshapes,
 * and optional hands from the gesture recognizer or the hand landmarker).
 * Hands are optional; the tracker runs on faces alone.
 *
 * `SeenNotes` turns the signals into one short lowercase line for a
 * language model, written only when it changed. Frames never leave the
 * tab: only these signals and the text made from them do.
 *
 * Thresholds below are vendor figures from earlier builds; none was
 * measured here.
 */

import type { Landmarks } from "./types.js";

/** The hand gestures the tracker reports: a wave from wrist motion, and the canned recognizer gestures by name. */
export type HandGesture = "wave" | "thumbs_up" | "thumbs_down" | "open_palm" | "victory" | "pointing_up" | "fist" | "love";

/** Steady signals for one moment: present, where the face is, facing, smile, surprise and frown strengths, and the held gesture. */
export interface Perception {
  present: boolean;
  /** The face in the viewer's frame, -1 to 1 on both axes: +x the character's left (the person's right), +y up. Null when no face is seen. */
  face: { x: number; y: number } | null;
  /** Facing the screen rather than turned away. */
  facing: boolean;
  /** Expression strengths, 0 to 1, smoothed. */
  smile: number;
  surprise: number;
  frown: number;
  gesture: HandGesture | null;
}

/** A discrete perception event: someone arrived, left, smiled, or made a gesture. */
export type PerceptionEvent = { type: "arrived" } | { type: "left" } | { type: "smiled" } | { type: "gesture"; gesture: HandGesture };

/** One face reading before smoothing. Image coordinates are 0 to 1 in the raw (unmirrored) camera frame. */
export interface RawFace {
  x: number;
  y: number;
  /** Head turn and tilt as the nose offset from the face centre, in face widths and heights; near zero when facing the camera. */
  yaw: number;
  pitch: number;
  smile: number;
  surprise: number;
  frown: number;
}

/** One hand reading before smoothing: wrist position, the recognizer's canned label and its score. */
export interface RawHand {
  /** Wrist position. */
  x: number;
  y: number;
  /** The recognizer's canned label (Open_Palm, Thumb_Up, ...), if any. */
  gesture: string | null;
  score: number;
}

/** One frame's readings for {@link SignalTracker}: the face, and the hands when they were checked. */
export interface RawFrame {
  face: RawFace | null;
  /** Null on frames where hands were not checked. */
  hands: RawHand[] | null;
}

// all vendor
const PRESENT_GRACE_MS = 2500;
const LEFT_AFTER_MS = 8000;
const ARRIVE_AFTER_ABSENCE_MS = 20000;
const SMILE_ON = 0.55;
const SMILE_OFF = 0.3;
const SMILE_HOLD_MS = 500;
const SMILE_COOLDOWN_MS = 10000;
const GESTURE_HOLD_MS = 350;
const GESTURE_COOLDOWN_MS = 4000;
const GESTURE_MIN_SCORE = 0.6;
const WAVE_WINDOW_MS = 1500;
const WAVE_SWING = 0.035;
const WAVE_REVERSALS = 2;
const EASE = 0.35;
const FACING_YAW = 0.22;
const FACING_PITCH = 0.3;

/** Canned recognizer labels to gesture names. */
export const CANNED_GESTURES: Readonly<Record<string, HandGesture>> = {
  Open_Palm: "open_palm",
  Thumb_Up: "thumbs_up",
  Thumb_Down: "thumbs_down",
  Victory: "victory",
  Pointing_Up: "pointing_up",
  Closed_Fist: "fist",
  ILoveYou: "love",
};

const absent = (): Perception => ({ present: false, face: null, facing: false, smile: 0, surprise: 0, frown: 0, gesture: null });

/** Turns raw face and hand frames into steady signals and discrete events, smoothed or held so one noisy frame never fires a reaction. */
export class SignalTracker {
  private p: Perception = absent();
  private lastSeen = -Infinity;
  private absentSince = -Infinity;
  private announced = false;
  private smileSince: number | null = null;
  private smiling = false;
  private lastSmile = -Infinity;
  private held: { gesture: HandGesture; since: number } | null = null;
  private lastGesture = new Map<HandGesture, number>();
  private wrist: { x: number; t: number }[] = [];

  get perception(): Perception {
    return this.p;
  }

  /** Feed one frame; returns the events it fired, usually none. */
  feed(raw: RawFrame, now: number): PerceptionEvent[] {
    const events: PerceptionEvent[] = [];
    this.trackFace(raw.face, now, events);
    if (raw.hands) this.trackHands(raw.hands, now, events);
    this.p = { ...this.p };
    return events;
  }

  reset(): void {
    this.p = absent();
    this.lastSeen = this.absentSince = this.lastSmile = -Infinity;
    this.announced = this.smiling = false;
    this.smileSince = null;
    this.held = null;
    this.lastGesture.clear();
    this.wrist = [];
  }

  private trackFace(f: RawFace | null, now: number, events: PerceptionEvent[]): void {
    const p = this.p;
    if (f) {
      if (!p.present && now - this.absentSince > ARRIVE_AFTER_ABSENCE_MS) events.push({ type: "arrived" });
      this.lastSeen = now;
      p.present = true;
      this.announced = true;
      // the person's right side shows on the image left, which is the character's left too
      const x = (0.5 - f.x) * 2;
      const y = (0.5 - f.y) * 2;
      p.face = p.face ? { x: p.face.x + (x - p.face.x) * EASE, y: p.face.y + (y - p.face.y) * EASE } : { x, y };
      p.facing = Math.abs(f.yaw) < FACING_YAW && Math.abs(f.pitch) < FACING_PITCH;
      p.smile += (f.smile - p.smile) * EASE;
      p.surprise += (f.surprise - p.surprise) * EASE;
      p.frown += (f.frown - p.frown) * EASE;
    } else if (p.present && now - this.lastSeen > PRESENT_GRACE_MS) {
      p.present = false;
      p.face = null;
      p.facing = false;
      p.smile = p.surprise = p.frown = 0;
      this.absentSince = this.lastSeen;
    }
    if (!p.present && this.announced && now - this.lastSeen > LEFT_AFTER_MS) {
      this.announced = false;
      events.push({ type: "left" });
    }
    this.trackSmile(now, events);
  }

  private trackSmile(now: number, events: PerceptionEvent[]): void {
    const s = this.p.smile;
    if (s < SMILE_OFF) {
      this.smiling = false;
      this.smileSince = null;
      return;
    }
    if (s < SMILE_ON || this.smiling) return;
    this.smileSince ??= now;
    if (now - this.smileSince >= SMILE_HOLD_MS && now - this.lastSmile > SMILE_COOLDOWN_MS) {
      this.smiling = true;
      this.lastSmile = now;
      events.push({ type: "smiled" });
    }
  }

  private trackHands(hands: RawHand[], now: number, events: PerceptionEvent[]): void {
    // the highest hand counts
    const hand = hands.reduce<RawHand | null>((best, h) => (!best || h.y < best.y ? h : best), null);
    const label = hand && hand.score >= GESTURE_MIN_SCORE && hand.gesture ? (CANNED_GESTURES[hand.gesture] ?? null) : null;
    const wave = hand ? this.waving(hand, now) : false;
    if (!hand) this.wrist = [];
    const g: HandGesture | null = wave ? "wave" : label;
    this.p.gesture = g;
    if (!g) {
      this.held = null;
      return;
    }
    if (this.held?.gesture !== g) this.held = { gesture: g, since: now };
    const hold = g === "wave" ? 0 : GESTURE_HOLD_MS;
    if (now - this.held.since >= hold && now - (this.lastGesture.get(g) ?? -Infinity) > GESTURE_COOLDOWN_MS) {
      this.lastGesture.set(g, now);
      events.push({ type: "gesture", gesture: g });
    }
  }

  // A raised hand swinging side to side: the wrist reverses a few times
  // inside the window, each swing wider than a small margin.
  private waving(hand: RawHand, now: number): boolean {
    const faceY = this.p.face ? 0.5 - this.p.face.y / 2 : 0.5;
    if (hand.y > faceY + 0.25) {
      this.wrist = [];
      return false;
    }
    this.wrist.push({ x: hand.x, t: now });
    while (this.wrist.length && now - this.wrist[0]!.t > WAVE_WINDOW_MS) this.wrist.shift();
    let reversals = 0;
    let dir = 0;
    let anchor = this.wrist[0]?.x ?? hand.x;
    for (const { x } of this.wrist) {
      const d = x - anchor;
      if (Math.abs(d) < WAVE_SWING) continue;
      const s = Math.sign(d);
      if (dir && s !== dir) reversals++;
      dir = s;
      anchor = x;
    }
    return reversals >= WAVE_REVERSALS;
  }
}

const mean = (b: Record<string, number>, ...names: string[]): number => names.reduce((n, k) => n + (b[k] ?? 0), 0) / names.length;

/** Face point indices: nose tip, left cheek, right cheek, top, chin. MediaPipe 478 points, then the 68 point layout (brow middle as the top). */
const LAYOUTS: { min: number; nose: number; left: number; right: number; top: number[]; chin: number }[] = [
  { min: 455, nose: 1, left: 234, right: 454, top: [10], chin: 152 },
  { min: 68, nose: 30, left: 0, right: 16, top: [19, 24], chin: 8 },
];

/** One raw face from a face landmark result, or null. Expressions read 0 without blendshapes. */
export function rawFace(lm: Landmarks, index = 0): RawFace | null {
  const pts = lm.points[index];
  if (!pts?.length) return null;
  const b = lm.blendshapes?.[index] ?? {};
  const smile = mean(b, "mouthSmileLeft", "mouthSmileRight");
  const surprise = Math.max(mean(b, "browInnerUp"), mean(b, "eyeWideLeft", "eyeWideRight"), mean(b, "jawOpen") * 0.7);
  // brows come down when smiling or squinting too, so they count toward a frown only without a smile
  const frown = Math.max(mean(b, "mouthFrownLeft", "mouthFrownRight"), mean(b, "browDownLeft", "browDownRight") * 0.7) * (1 - smile);
  const L = LAYOUTS.find((l) => pts.length >= l.min && pts.length <= (l.min === 68 ? 68 : Infinity));
  if (!L) {
    let x0 = 1, x1 = 0, y0 = 1, y1 = 0;
    for (const [x, y] of pts) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
    }
    // no layout known: the box centre, and a head pose that cannot be read counts as facing
    return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, yaw: 0, pitch: 0, smile, surprise, frown };
  }
  const p = (i: number) => pts[i]!;
  const left = p(L.left);
  const right = p(L.right);
  const top = L.top.map(p).reduce((a, q) => [a[0] + q[0] / L.top.length, a[1] + q[1] / L.top.length, 0] as [number, number, number], [0, 0, 0] as [number, number, number]);
  const chin = p(L.chin);
  const nose = p(L.nose);
  const w = Math.abs(right[0] - left[0]) || 1e-3;
  const h = Math.abs(chin[1] - top[1]) || 1e-3;
  const cx = (left[0] + right[0]) / 2;
  const cy = (top[1] + chin[1]) / 2;
  return { x: cx, y: cy, yaw: (nose[0] - cx) / w, pitch: (nose[1] - cy) / h, smile, surprise, frown };
}

/** Raw hands from a gesture recognizer or hand landmarker result: the wrist (point 0) and the top gesture. */
export function rawHands(lm: Landmarks): RawHand[] {
  return lm.points.flatMap((pts, i) => {
    const w = pts[0];
    if (!w) return [];
    const g = lm.gestures?.[i] ?? null;
    return [{ x: w[0], y: w[1], gesture: g?.name ?? null, score: g?.score ?? 0 }];
  });
}

/** A tracker frame from `landmarks` results. Leave `hands` out on frames where hands were not checked. */
export function rawFromLandmarks(face: Landmarks | null | undefined, hands?: Landmarks | null): RawFrame {
  return { face: face ? rawFace(face) : null, hands: hands ? rawHands(hands) : null };
}

const GESTURE_WORDS: Record<HandGesture, string> = {
  wave: "waving",
  thumbs_up: "giving a thumbs up",
  thumbs_down: "giving a thumbs down",
  open_palm: "holding up an open hand",
  victory: "making a peace sign",
  pointing_up: "pointing up",
  fist: "making a fist",
  love: "making a love you sign",
};

/** Perception as one short lowercase line for a language model. */
export function describePerception(p: Perception): string {
  if (!p.present) return "you are not in view";
  const parts = ["you are here", p.facing ? "looking at me" : "looking away"];
  // vendor thresholds
  if (p.smile > 0.5) parts.push("smiling");
  else if (p.surprise > 0.55) parts.push("looking surprised");
  else if (p.frown > 0.5) parts.push("frowning");
  if (p.gesture) parts.push(GESTURE_WORDS[p.gesture]);
  return parts.join(", ");
}

/**
 * The seen note for a turn: null when nothing changed since the last note,
 * so a chat about anything else is not padded with the same observation.
 * A caption from an on demand look is always included.
 */
export class SeenNotes {
  private last = "";

  next(p: Perception, caption?: string | null): string | null {
    const now = describePerception(p);
    if (!caption && now === this.last) return null;
    this.last = now;
    return caption ? `${now}; i can see: ${caption.trim().toLowerCase()}` : now;
  }

  reset(): void {
    this.last = "";
  }
}

/** Questions that call for an on demand look rather than the steady signals. Replace it to suit a persona. */
export const LOOK_PATTERN = /\b(what (am i|is this|'?s this|do you see|can you see)|can you see|do you see|look at (this|me|my)|what('?s| is) in my hand|holding|wearing|show(ing)? you)\b/i;

/** True when a message asks the character to look, by {@link LOOK_PATTERN} or the pattern you pass. */
export const wantsLook = (text: string, pattern: RegExp = LOOK_PATTERN): boolean => pattern.test(text);

/** One reaction to a perception event: a mood or a gesture by common name, after a delay, with a chance. */
export interface Reaction {
  on: PerceptionEvent["type"];
  gesture?: HandGesture;
  kind: "mood" | "gesture";
  name: string;
  delayMs?: number;
  chance?: number;
}

/** Default reactions (vendor): greet on arrival, smile back after 600 ms at 0.7 chance, answer waves and a few gestures. */
export const DEFAULT_REACTIONS: readonly Reaction[] = [
  { on: "arrived", kind: "mood", name: "happy" },
  { on: "arrived", kind: "gesture", name: "wave" },
  { on: "smiled", kind: "mood", name: "happy", delayMs: 600, chance: 0.7 },
  { on: "gesture", gesture: "wave", kind: "gesture", name: "wave" },
  { on: "gesture", gesture: "thumbs_up", kind: "mood", name: "happy" },
  { on: "gesture", gesture: "thumbs_down", kind: "mood", name: "sad" },
  { on: "gesture", gesture: "victory", kind: "gesture", name: "peace" },
  { on: "gesture", gesture: "love", kind: "mood", name: "love" },
];

/** The reactions an event calls for. A chance is drawn once per reaction from the injected `rng`. */
export function reactionsFor(e: PerceptionEvent, rng: () => number, table: readonly Reaction[] = DEFAULT_REACTIONS): Reaction[] {
  return table.filter((r) => r.on === e.type && (e.type !== "gesture" || r.gesture === e.gesture) && (r.chance === undefined || rng() < r.chance));
}

/** Where the character should look, -1 to 1, with a gain (vendor 1.3) so small head moves read; null when nobody is in view. */
export function gazeTarget(p: Perception, gain = 1.3): { x: number; y: number } | null {
  const clamp = (v: number) => Math.max(-1, Math.min(1, v));
  return p.face ? { x: clamp(p.face.x * gain), y: clamp(p.face.y * gain) } : null;
}

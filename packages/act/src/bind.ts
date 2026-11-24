/**
 * The binder: turns an avatar's own expression list and clip library into
 * the three name lists `buildVocabulary` takes, plus a map from each
 * vocabulary name back to the clips that realize it.
 *
 * Clip classes. Each clip sorts into one of nine classes through ordered
 * rules over its folder and file name, then motion analysis tags; a user
 * tag naming a class wins. Gesture, dance and reaction clips become
 * gestures; posture clips become postures; idle and talk clips are loops
 * and never enter the vocabulary; locomotion, action and odd clips are
 * left out, so a reply never sets off a walk away or "chop wood" during
 * speech (vendor: earlier builds fixed exactly that with these classes).
 *
 * Names. A clip whose name says what it is decides alone; analysis tags
 * only place clips with opaque names (analysis sees the head dip in "sits
 * down" and calls it a nod). With more clips than the name cap, the kinds
 * of movement come first, most common first, then plain names of clips
 * no bucket holds.
 *
 * Analysis tags come from the caller as strings (for instance from
 * `analyzeMotion` in the motion libraries); this package imports nothing
 * from motion.
 */

import type { Embedder } from "@hackbuild/memory";
import { cosine } from "./resolve.js";
import type { AvatarActs } from "./vocab.js";
import { MOTION_WORDS, POSTURE_WORDS, bucketOf, bucketsOf, meaningfulWords, nameTokens } from "./words.js";

export type ClipClass = "idle" | "talk" | "gesture" | "posture" | "dance" | "reaction" | "locomotion" | "action" | "odd";

export const CLIP_CLASSES: readonly ClipClass[] = ["idle", "talk", "gesture", "posture", "dance", "reaction", "locomotion", "action", "odd"];

/** Classes a reply may set off on its own. Locomotion, action and odd clips stay for playing by hand. */
export const CUE_CLASSES: ReadonlySet<ClipClass> = new Set<ClipClass>(["idle", "talk", "gesture", "posture", "dance", "reaction"]);

export interface ClipRule {
  cls: ClipClass;
  /** Tested against "folder name" in lowercase words. */
  re: RegExp;
}

/**
 * The eight rules, first match wins, narrow rules first. Data: an app adds
 * rules in front for its own library. From earlier builds (vendor).
 */
export const CLIP_RULES: readonly ClipRule[] = [
  // clips that look wrong as everyday motion: stylized walks of life, ones that wander off, fragments of a longer move
  { cls: "odd", re: /\b(drunk|robot|teapot|heavyset|beat chest|balance|monk|old|zombie|lean on rail|idle still|idle shifting|waiting|pacing|high five|shake hands|curtsey|mope|peekaboo|jump (start|midair|land))\b/ },
  { cls: "locomotion", re: /\b(locomotion|walk|walking|jog|jogging|run|running|sprint|crawl|strafe|roll|swim|climb)\b/ },
  { cls: "action", re: /\b(action|exercise|jumping jacks|sun salutation|warm up|chop|harvest|plant|water plants|open chest|pick up|push|pull|throw|carry|carrying|eat|drink|phone|punch|kick|sword|attack|shoot|fixing|driving)\b/ },
  { cls: "reaction", re: /\b(reaction|fall|falling|fall down|hit|hurt|death|die|dying|stagger|knockdown)\b/ },
  { cls: "talk", re: /\b(talk|talking|storytelling|explaining|conversation)\b/ },
  { cls: "posture", re: /\b(sit|sitting|seat|seated|lie|lying|kneel|kneeling|crouch|crouching|get up|lay)\b/ },
  { cls: "dance", re: /\b(dance|dancing|charleston|samba|hip hop|twerk)\b/ },
  { cls: "idle", re: /\b(idle|stand|standing|breathing)\b/ },
];

export interface ClipInfo {
  /** Unique id the app maps back to a file or a clip. */
  id: string;
  name: string;
  folder?: string;
  /** Description, when the library has one; used for matching. */
  description?: string;
  /** Motion analysis tags, such as "walk" or "nod". */
  tags?: readonly string[];
  /** Tags a person set; a class name here wins. */
  userTags?: readonly string[];
  /** A single held pose rather than a moving clip. */
  pose?: boolean;
}

const classText = (c: Pick<ClipInfo, "name" | "folder">) => nameTokens(`${c.folder ?? ""} ${c.name}`).join(" ");

/** The class of one clip. */
export function classifyClip(c: Pick<ClipInfo, "name" | "folder" | "tags" | "userTags">, rules: readonly ClipRule[] = CLIP_RULES): ClipClass {
  const chosen = c.userTags?.find((t): t is ClipClass => (CLIP_CLASSES as readonly string[]).includes(t));
  if (chosen) return chosen;
  const text = classText(c);
  for (const r of rules) if (r.re.test(text)) return r.cls;
  // a clip that travels is a walk, whatever it is called
  const tags = c.userTags?.length ? c.userTags : (c.tags ?? []);
  if (tags.includes("walk")) return "locomotion";
  return "gesture";
}

export interface BoundClip extends ClipInfo {
  cls: ClipClass;
  /** Word table buckets this clip is placed in. */
  buckets: string[];
  /** The name shown to the model for it. */
  label: string;
}

export interface ActBinding {
  /** Lists for `buildVocabulary`. */
  acts: Required<AvatarActs>;
  /** Lowercase vocabulary name to the clips that realize it. */
  clips: Record<string, BoundClip[]>;
  /** Every clip with its class. */
  all: BoundClip[];
  /** Loops: idle and talk clips. */
  loops: { idle: BoundClip[]; talk: BoundClip[] };
  /** Clips kept out of replies (locomotion, action, odd). */
  manual: BoundClip[];
}

export interface BindOptions {
  /** Names per kind shown to the model. Default 14. */
  max?: number;
  rules?: readonly ClipRule[];
  /** Extra word buckets (for instance `OPTIONAL_BUCKETS`). */
  buckets?: Readonly<Record<string, readonly string[]>>;
}

/** Postures and whole body actions in the word tables, plus extra buckets. */
const motionTable = (extra?: BindOptions["buckets"]) => (extra ? { ...MOTION_WORDS, ...extra } : MOTION_WORDS);

function place(c: ClipInfo, table: Readonly<Record<string, readonly string[]>>): string[] {
  const words = [...new Set([...meaningfulWords(c.description || c.name), ...(c.userTags?.length ? c.userTags : (c.tags ?? [])).flatMap(meaningfulWords)])];
  // a name that says what the clip is decides alone
  const named = bucketsOf(table, [c.description || c.name]);
  return named.length ? named : bucketsOf(table, [c.description || c.name, ...words]);
}

const plainLabel = (c: ClipInfo, buckets: string[]): string => {
  const n = c.description || c.name;
  if (/^[a-z][a-z ]{1,24}$/i.test(n)) return n.toLowerCase();
  return buckets[0] ?? meaningfulWords(n).slice(0, 2).join(" ");
};

/**
 * Bind an avatar's expressions and clips to `act`. Expressions pass
 * through as moods. Clip names in the vocabulary are word table buckets
 * where a clip falls in one, else its plain label.
 */
export function bindActs(input: { expressions?: readonly string[]; clips?: readonly ClipInfo[] }, o: BindOptions = {}): ActBinding {
  const max = o.max ?? 14;
  const table = motionTable(o.buckets);
  const all: BoundClip[] = (input.clips ?? []).map((c) => {
    const cls = classifyClip(c, o.rules ?? CLIP_RULES);
    const buckets = place(c, table);
    return { ...c, cls, buckets, label: plainLabel(c, buckets) };
  });
  const clips: Record<string, BoundClip[]> = Object.create(null) as Record<string, BoundClip[]>;
  const add = (name: string, c: BoundClip) => {
    const k = name.toLowerCase();
    if (k) (clips[k] ??= []).includes(c) || clips[k]!.push(c);
  };
  const isPosture = (c: BoundClip) => c.cls === "posture" || (c.cls === "gesture" && c.buckets.some((b) => Object.hasOwn(POSTURE_WORDS, b)));
  const cue = all.filter((c) => c.cls === "gesture" || c.cls === "dance" || c.cls === "reaction" || c.cls === "posture");
  const names = (pool: BoundClip[]): string[] => {
    const out: string[] = [];
    const push = (n: string) => {
      const l = n.toLowerCase();
      if (l && !out.includes(l) && out.length < max) out.push(l);
    };
    // kinds of movement first, most common first; then plain names of clips no bucket holds
    const count = new Map<string, number>();
    for (const c of pool) for (const b of c.buckets) count.set(b, (count.get(b) ?? 0) + 1);
    for (const [b] of [...count].sort((a, z) => z[1] - a[1])) push(b);
    for (const c of pool) if (!c.buckets.length) push(c.label);
    return out;
  };
  const postures = cue.filter(isPosture);
  const gestures = cue.filter((c) => !isPosture(c));
  for (const c of cue) {
    for (const b of c.buckets) add(b, c);
    add(c.label, c);
  }
  return {
    acts: { expressions: [...new Set(input.expressions ?? [])], gestures: names(gestures), postures: names(postures) },
    clips,
    all,
    loops: { idle: all.filter((c) => c.cls === "idle"), talk: all.filter((c) => c.cls === "talk") },
    manual: all.filter((c) => !CUE_CLASSES.has(c.cls)),
  };
}

/** A clip named for the thing ("Sitting 1" for sit) beats one that only carries it as a tag by this much (vendor). */
export const NAMED_BONUS = 0.15;

/** A pose picked by a cue relaxes back after this many seconds (vendor). */
export const CUE_POSE_SECONDS = 6;

const describeClip = (c: BoundClip) => [c.label, ...meaningfulWords(c.name), ...(c.tags ?? []), ...c.buckets].join(" ");

/**
 * The clip for a resolved name that best fits what was said, or null when
 * the avatar has no clip for it. Without an embedder the draw is from the
 * clips named for the thing, through the injected `rng`; with one, the
 * sentence picks by meaning plus the named bonus.
 */
export async function pickClip(binding: ActBinding, name: string, sentence: string, o: { rng: () => number; embedder?: Embedder; buckets?: BindOptions["buckets"] }): Promise<BoundClip | null> {
  const key = name.trim().toLowerCase();
  const cands = Object.hasOwn(binding.clips, key) ? binding.clips[key]! : [];
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0]!;
  const table = motionTable(o.buckets);
  const bucket = Object.hasOwn(table, key) ? key : bucketOf(table, key);
  const syns = bucket ? [bucket, ...(table[bucket] ?? [])] : [key];
  const named = (c: BoundClip) => meaningfulWords(c.description || c.name).some((w) => syns.some((s) => w.startsWith(s)));
  if (!o.embedder) {
    const pool = cands.filter(named);
    const from = pool.length ? pool : cands;
    return from[Math.min(from.length - 1, Math.floor(o.rng() * from.length))]!;
  }
  const [q, ...vs] = await o.embedder.embed([sentence || name, ...cands.map(describeClip)]);
  let best = cands[0]!;
  let top = -Infinity;
  cands.forEach((c, i) => {
    const s = cosine(q!, vs[i]!) + (named(c) ? NAMED_BONUS : 0);
    if (s > top) [best, top] = [c, s];
  });
  return best;
}

const SEATED = /\b(sit|sitting|seated|lie|lying|kneel|kneeling)\b/;

/**
 * The loop to stand in while talking: a talk clip named as a standing
 * idle. Storytelling and explaining clips travel or slide their feet and
 * seated ones wait for postures, so only those qualify; null when the
 * library has none.
 */
export function talkingLoop(clips: readonly BoundClip[]): BoundClip | null {
  return clips.find((c) => c.cls === "talk" && !c.pose && /\bidle\b/.test(classText(c)) && !SEATED.test(classText(c))) ?? null;
}

const CALM = /\b(neutral|breathing|calm|relaxed|behind back)\b/;

/** The idle loop: a standing idle clip, calm names first; null when the library has none. */
export function idleLoop(clips: readonly BoundClip[]): BoundClip | null {
  const standing = clips.filter((c) => c.cls === "idle" && !c.pose && !SEATED.test(classText(c)));
  return standing.find((c) => CALM.test(classText(c))) ?? standing[0] ?? null;
}

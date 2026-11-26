/**
 * The action vocabulary of one avatar: the moods, gestures and postures it
 * can realize, plus an alias table from words a model reaches for (smile,
 * grin, waves hello) to those names. Names outside the avatar's own lists
 * never enter the vocabulary, so a prompt or grammar built from it asks
 * only for moves the body can make.
 */

import { ACTION_WORDS, EMOTION_WORDS, GESTURE_WORDS, POSTURE_WORDS, aliasesFrom } from "./words.js";

/** The three kinds of act: a mood on the face, a one shot gesture, or a posture the body holds. */
export type ActKind = "mood" | "gesture" | "posture";
/** The act kinds in order: mood, gesture, posture. */
export const KINDS: readonly ActKind[] = ["mood", "gesture", "posture"];

/** The moods, gestures and postures one avatar can realize, with an alias table from other words to those names. */
export interface ActVocabulary {
  moods: string[];
  gestures: string[];
  postures: string[];
  /** Lowercase word or phrase to a name in one of the three lists. */
  aliases: Record<string, string>;
}

/** What an avatar can realize: expression presets, gesture clips and posture clips. */
export interface AvatarActs {
  expressions?: readonly string[];
  gestures?: readonly string[];
  postures?: readonly string[];
}

/**
 * Common words for the usual names: the hand table below, then every word
 * of the word tables (hand entries win). Only entries whose target the
 * avatar has are kept.
 */
export const DEFAULT_ALIASES: Readonly<Record<string, string>> = {
  ...aliasesFrom(EMOTION_WORDS, GESTURE_WORDS, POSTURE_WORDS, ACTION_WORDS),
  smile: "happy",
  smiles: "happy",
  grin: "happy",
  grins: "happy",
  laugh: "happy",
  laughs: "happy",
  giggle: "happy",
  beam: "happy",
  joy: "happy",
  glad: "happy",
  cheerful: "happy",
  frown: "sad",
  cry: "sad",
  cries: "sad",
  tear: "sad",
  sigh: "sad",
  upset: "sad",
  mad: "angry",
  furious: "angry",
  annoyed: "angry",
  scowl: "angry",
  gasp: "surprised",
  shocked: "surprised",
  surprise: "surprised",
  startled: "surprised",
  calm: "relaxed",
  content: "relaxed",
  serene: "relaxed",
  hello: "wave",
  "waves hello": "wave",
  greet: "wave",
  bye: "wave",
  agree: "nod",
  nods: "nod",
  "shakes head": "shake",
  "shake head": "shake",
  shrugs: "shrug",
  bows: "bow",
  points: "point",
  "sit down": "sit",
  sits: "sit",
  "stand up": "stand",
  stands: "stand",
  "lie down": "lie",
  "lies down": "lie",
};

/** Moods with no preset on many avatars, and the near relative to show instead. */
export const MOOD_RELATIVES: Readonly<Record<string, string>> = {
  love: "happy",
  excited: "happy",
  amused: "happy",
  proud: "happy",
  smug: "happy",
  fear: "surprised",
  scared: "surprised",
  confused: "surprised",
  disgust: "angry",
  worried: "sad",
  lonely: "sad",
  bored: "relaxed",
  sleepy: "relaxed",
};

const uniq = (xs: readonly string[] = []): string[] => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

/**
 * Build a vocabulary from what the avatar can do. `aliases` adds to or
 * overrides the defaults; an alias whose target the avatar lacks is
 * dropped, and a missing mood falls back to its near relative when the
 * avatar has that relative.
 */
export function buildVocabulary(avatar: AvatarActs, opts: { aliases?: Record<string, string>; defaults?: boolean } = {}): ActVocabulary {
  const moods = uniq(avatar.expressions);
  const gestures = uniq(avatar.gestures);
  const postures = uniq(avatar.postures);
  const names = new Map<string, string>();
  for (const n of [...moods, ...gestures, ...postures]) names.set(n.toLowerCase(), n);
  const aliases: Record<string, string> = Object.create(null) as Record<string, string>;
  const table: Record<string, string> = { ...(opts.defaults === false ? {} : { ...MOOD_RELATIVES, ...DEFAULT_ALIASES }), ...(opts.aliases ?? {}) };
  for (const [word, target] of Object.entries(table)) {
    const w = word.toLowerCase().trim();
    if (names.has(w)) continue; // a real name is never shadowed by an alias
    let t = target.toLowerCase();
    if (!names.has(t) && Object.hasOwn(MOOD_RELATIVES, t)) t = MOOD_RELATIVES[t]!;
    const hit = names.get(t);
    if (hit) aliases[w] = hit;
  }
  return { moods, gestures, postures, aliases };
}

/** The kind of a vocabulary name, ignoring case, or null when the avatar has no such name. */
export function kindOf(v: ActVocabulary, name: string): ActKind | null {
  const n = name.toLowerCase();
  if (v.moods.some((x) => x.toLowerCase() === n)) return "mood";
  if (v.gestures.some((x) => x.toLowerCase() === n)) return "gesture";
  if (v.postures.some((x) => x.toLowerCase() === n)) return "posture";
  return null;
}

/** The vocabulary's names of one kind. */
export function namesOf(v: ActVocabulary, kind: ActKind): string[] {
  return kind === "mood" ? v.moods : kind === "gesture" ? v.gestures : v.postures;
}

/** Every surface form (names and alias words), longest first. */
export function surfaceForms(v: ActVocabulary): string[] {
  return uniq([...v.moods, ...v.gestures, ...v.postures, ...Object.keys(v.aliases)]).sort((a, b) => b.length - a.length);
}

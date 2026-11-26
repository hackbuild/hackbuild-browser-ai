/**
 * Word tables: buckets of words that name one mood, gesture, posture or
 * whole body action, so "joyful", "grinning" or a clip called "Greeting"
 * land on the same name however the model or the file phrases it. 256
 * words in 38 buckets (computed), carried over from earlier builds.
 *
 * The buckets feed `DEFAULT_ALIASES` (every bucket) and `DEFAULT_KEYWORDS`
 * (moods and conversational gestures only: postures and actions never
 * come from speech). `hug`, `kiss` and `flirt` sit in `OPTIONAL_BUCKETS`
 * and are in neither default; an app opts in by passing them.
 */

/** Bucket name to the words that name it. */
export type WordTable = Readonly<Record<string, readonly string[]>>;

/** Mood buckets: the words that name each of eleven moods, from happy to excited. */
export const EMOTION_WORDS: WordTable = {
  happy: ["happy", "joy", "joyful", "glad", "smile", "smiling", "grin", "grinning", "cheerful", "delight", "delighted", "pleased", "fun"],
  sad: ["sad", "sorrow", "unhappy", "depressed", "cry", "crying", "tear", "tears", "gloomy", "upset", "disappointed", "hurt", "lonely", "frown", "frowning"],
  angry: ["angry", "anger", "mad", "annoyed", "irritated", "rage", "furious", "pout", "pouting", "frustrated", "cross", "grumpy"],
  surprised: ["surprised", "surprise", "shock", "shocked", "wow", "astonished", "amazed", "startled", "gasp", "whoa"],
  relaxed: ["relaxed", "relax", "calm", "chill", "serene", "peaceful", "sleepy", "soft", "gentle", "warm", "mellow", "cozy"],
  neutral: ["neutral", "normal", "default", "plain", "rest", "blank"],
  fear: ["fear", "afraid", "scared", "nervous", "anxious", "worried", "panic", "frightened"],
  disgust: ["disgust", "disgusted", "ew", "gross", "displeased"],
  love: ["love", "heart", "adore", "affection", "blush", "blushing", "shy", "smitten", "flustered"],
  smug: ["smug", "smirk", "smirking", "confident", "proud", "cocky", "teasing"],
  excited: ["excited", "excite", "hype", "hyped", "eager", "thrilled", "yay"],
};

/** Conversational gestures: small moves that fit a sentence, so inference may fire them. */
export const GESTURE_WORDS: WordTable = {
  wave: ["wave", "waving", "hi", "hello", "hey", "greet", "greeting", "bye", "goodbye", "welcome"],
  nod: ["nod", "nodding", "yes", "yeah", "agree", "okay", "ok", "sure", "understood", "right", "mhm"],
  shake: ["shake", "no", "nope", "disagree", "deny", "refuse", "nah"],
  bow: ["bow", "bowing", "thanks", "thank", "apology", "apologize", "sorry", "respect"],
  point: ["point", "pointing", "look", "there", "show", "indicate"],
  cheer: ["cheer", "cheering", "celebrate", "celebration", "hooray", "woohoo", "win", "victory", "congrats", "congratulations"],
  shrug: ["shrug", "shrugging", "dunno", "whatever", "unsure", "maybe", "idk"],
  think: ["think", "thinking", "hmm", "ponder", "wonder", "wondering", "consider", "curious"],
  laugh: ["laugh", "laughing", "lol", "haha", "funny", "giggle", "hehe"],
  peace: ["peace", "vsign"],
  clap: ["clap", "clapping", "applaud", "applause", "bravo"],
  facepalm: ["facepalm", "ugh", "sigh"],
};

/** Buckets left out of the defaults; the owner of an app decides whether to turn them on. */
export const OPTIONAL_BUCKETS: WordTable = {
  hug: ["hug", "hugging", "embrace", "cuddle", "cuddling"],
  kiss: ["kiss", "kissing", "smooch"],
  flirt: ["flirt", "flirty", "flirting", "seductive", "sexy", "tease", "wink"],
};

/** Postures change how the body rests: only an explicit tag takes one, never a word in passing ("i won't lie"). */
export const POSTURE_WORDS: WordTable = {
  sit: ["sit", "sitting", "seated", "chair", "bench", "couch"],
  lie: ["lie", "lying", "laying", "bed", "sleep", "sleeping", "nap"],
  kneel: ["kneel", "kneeling"],
  lean: ["lean", "leaning", "bent", "bend"],
  squat: ["squat", "crouch", "crouching"],
};

/** Whole body moves and stances, also explicit only. */
export const ACTION_WORDS: WordTable = {
  dance: ["dance", "dancing", "groove", "party"],
  spin: ["spin", "spinning", "twirl", "turn"],
  jump: ["jump", "jumping", "hop", "leap"],
  stretch: ["stretch", "stretching", "tired", "yawn"],
  pose: ["pose", "posing", "model", "showoff", "show"],
  shoot: ["shoot", "bang", "finger", "gun"],
  idle: ["idle", "stand", "standing", "wait", "waiting", "breathe"],
};

/** Everything a motion can be named for: gestures, postures and actions. */
export const MOTION_WORDS: WordTable = { ...GESTURE_WORDS, ...POSTURE_WORDS, ...ACTION_WORDS };

/** "HairRibbon_02" to ["hair", "ribbon", "02"]; "IdleHappyWave01" to ["idle", "happy", "wave", "01"]. */
export function nameTokens(s: string): string[] {
  return String(s)
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/([a-zA-Z])(\d)/g, "$1 $2")
    .replace(/(\d)([a-zA-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}

/** Tokens that say nothing about what a clip does. */
const NOISE = new Set([
  "anim", "anims", "animation", "animations", "motion", "motions", "clip", "clips", "take", "mixamo", "com", "vrma", "vmd", "vpd",
  "bvh", "fbx", "glb", "unity", "pack", "motionpack", "the", "a", "an", "and", "of", "to", "with", "in", "on", "for",
  "v", "ver", "version", "copy", "final", "new", "test", "untitled", "armature", "rig", "root", "loop", "inplace",
]);

/** Meaningful words of a name: no numbers, no format noise, no one letter fragments. */
export function meaningfulWords(s: string): string[] {
  return nameTokens(s).filter((t) => t.length > 1 && !/^\d+$/.test(t) && !NOISE.has(t));
}

// Forms of a word to look up: itself and a few inflections stripped, never shorter than three letters.
function forms(t: string): string[] {
  const out = [t];
  const add = (s: string) => {
    if (s.length >= 3 && !out.includes(s)) out.push(s);
  };
  for (const suf of ["s", "es", "ed", "ing", "ly"]) {
    if (!t.endsWith(suf)) continue;
    const stem = t.slice(0, -suf.length);
    add(stem);
    if (suf === "ed" || suf === "ing") {
      add(stem + "e");
      if (/([b-df-hj-np-tv-z])\1$/.test(stem)) add(stem.slice(0, -1));
    }
  }
  return out;
}

/** The bucket a word or phrase names, whole words only: "across" is not "cross", "understand" is not "stand". */
export function bucketOf(table: WordTable, text: string): string | null {
  for (const t of nameTokens(text)) {
    for (const f of forms(t)) {
      if (Object.hasOwn(table, f)) return f;
      for (const c of Object.keys(table)) if (table[c]!.includes(f)) return c;
    }
  }
  return null;
}

/** Every bucket a list of phrases touches. */
export function bucketsOf(table: WordTable, phrases: readonly string[]): string[] {
  const out = new Set<string>();
  for (const p of phrases) {
    const c = bucketOf(table, p);
    if (c) out.add(c);
  }
  return [...out];
}

/** Word to bucket name over several tables; the first table that holds a word wins. */
export function aliasesFrom(...tables: WordTable[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const t of tables) for (const [name, ws] of Object.entries(t)) for (const w of ws) if (w !== name && !Object.hasOwn(out, w)) out[w] = name;
  return out;
}

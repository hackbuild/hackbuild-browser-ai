/**
 * Character Card V2 (`chara_card_v2`) and V3 (`chara_card_v3`, spec
 * version 3.0) shapes, after the published specifications, and the
 * profile extension this package keeps at `data.extensions.hackbuild`.
 */

/** The avatar file kinds a profile can name: vrm, glb, fbx, mmd or live2d. */
export type AvatarKind = "vrm" | "glb" | "fbx" | "mmd" | "live2d";

/** What a card needs to drive a body and a voice. Version 1. */
export interface Profile {
  version: number;
  avatar: {
    /** A URL or an `embeded://` CHARX path. */
    uri: string;
    /** A CHARX asset path when the body ships inside the archive. */
    asset: string;
    kind: AvatarKind;
    /** Mood name to the avatar's expression or morph name. */
    expressions: Record<string, string>;
    /** Wardrobe part name to shown or hidden. */
    wardrobe: Record<string, boolean>;
  };
  voice: {
    /** Speech engine id, for example "kokoro", "pocket" or "system". */
    engine: string;
    voiceId: string;
    /** 0.25 to 4. */
    rate: number;
    /** 0 to 2. */
    pitch: number;
    /** A reference clip the caller supplies (CHARX path or URL). Never bundled by this package. */
    cloneRef: string;
  };
  /** Action vocabulary, names the avatar can realize. */
  actions: { moods: string[]; gestures: string[]; postures: string[]; aliases: Record<string, string> };
  behavior: { gaze: boolean; blink: boolean; breath: boolean; idle: boolean; ambientGestures: boolean };
  memory: { enabled: boolean };
  /**
   * Present only on a locked character: the password verifier its sealed
   * memory and files open with. Made by makeLock in
   * "@hackbuild/memory/seal". Holds no password. There is no recovery.
   */
  lock?: Lock;
}

/** A lock record: PBKDF2 SHA-256 settings and a verifier, base64 fields. */
export interface Lock {
  algo: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  hash: string;
}

/** One lorebook entry: the keys that activate it, the text it adds, and its ordering and matching settings. */
export interface LoreEntry {
  keys: string[];
  content: string;
  extensions: Record<string, unknown>;
  enabled: boolean;
  insertion_order: number;
  case_sensitive?: boolean;
  /** V3: keys are regular expressions, written as `/source/flags` or bare. */
  use_regex?: boolean;
  constant?: boolean;
  name?: string;
  priority?: number;
  id?: number | string;
  comment?: string;
  selective?: boolean;
  secondary_keys?: string[];
  position?: "before_char" | "after_char";
}

/** A lorebook: its entries plus optional scan depth, token budget and recursion settings. */
export interface CharacterBook {
  name?: string;
  description?: string;
  scan_depth?: number;
  token_budget?: number;
  recursive_scanning?: boolean;
  extensions: Record<string, unknown>;
  entries: LoreEntry[];
}

/** The `data` object of a V2 card: name, persona text, greetings, lorebook, tags and extensions. */
export interface CardDataV2 {
  name: string;
  description: string;
  personality: string;
  scenario: string;
  first_mes: string;
  mes_example: string;
  creator_notes: string;
  system_prompt: string;
  post_history_instructions: string;
  alternate_greetings: string[];
  character_book?: CharacterBook;
  tags: string[];
  creator: string;
  character_version: string;
  extensions: Record<string, unknown> & { hackbuild?: Profile };
}

/** A Character Card V2, `spec` set to `chara_card_v2`. */
export interface CardV2 {
  spec: "chara_card_v2";
  spec_version: "2.0";
  data: CardDataV2;
}

/** One entry of a V3 card's `assets` list: its type, where it lives, a name and a file extension. */
export interface CardAsset {
  /** icon, background, user_icon, emotion, or x_ followed by a custom name. */
  type: string;
  /** `embeded://path` inside a CHARX, `ccdefault:`, a URL or a data URL. */
  uri: string;
  name: string;
  ext: string;
}

/** The `data` object of a V3 card: the V2 fields plus group greetings, assets, nickname, sources and dates. */
export interface CardDataV3 extends CardDataV2 {
  group_only_greetings: string[];
  assets?: CardAsset[];
  nickname?: string;
  creator_notes_multilingual?: Record<string, string>;
  source?: string[];
  /** Unix seconds. */
  creation_date?: number;
  modification_date?: number;
}

/** A Character Card V3, `spec` set to `chara_card_v3` and `spec_version` 3.0. */
export interface CardV3 {
  spec: "chara_card_v3";
  spec_version: "3.0";
  data: CardDataV3;
}

/** A V2 or V3 card. */
export type Card = CardV2 | CardV3;

/** What `CharacterCore.read` returns: the detected format, where the card came from, its spec, the card as stored and the CHARX files beside it. */
export interface ReadResult {
  format: "png" | "charx" | "json";
  /** "ccv3" or "chara" for PNG, "card.json" for CHARX, "json". */
  source: string;
  spec: "chara_card_v3" | "chara_card_v2" | "v1" | "unknown";
  /** As stored; call `upgrade` for V3. */
  card: Record<string, unknown>;
  /** CHARX files other than card.json. */
  assets: { name: string; size: number }[];
}

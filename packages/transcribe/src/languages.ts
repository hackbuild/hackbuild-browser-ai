/**
 * The language list bound to the model (as the earlier transcription tool
 * did): auto detect plus 19 languages for a multilingual model; english
 * only, locked, for an english only one. A record counts as english only
 * when a note says so or its repo id ends in `.en`, so a custom repo typed
 * by hand is caught too.
 */

import type { ModelRecord } from "@hackbuild/models";

/** A language for the select: a Whisper code or "auto", and a lowercase name. */
export interface Language {
  /** Whisper language code, or "auto". */
  code: string;
  /** Lowercase name for a select. */
  name: string;
}

/** The earlier transcription tool's list, in its order, after auto detect. */
export const WHISPER_LANGUAGES: readonly Language[] = [
  { code: "auto", name: "auto detect" },
  { code: "en", name: "english" },
  { code: "es", name: "spanish" },
  { code: "fr", name: "french" },
  { code: "de", name: "german" },
  { code: "it", name: "italian" },
  { code: "pt", name: "portuguese" },
  { code: "nl", name: "dutch" },
  { code: "ru", name: "russian" },
  { code: "uk", name: "ukrainian" },
  { code: "pl", name: "polish" },
  { code: "sv", name: "swedish" },
  { code: "tr", name: "turkish" },
  { code: "ar", name: "arabic" },
  { code: "hi", name: "hindi" },
  { code: "ja", name: "japanese" },
  { code: "ko", name: "korean" },
  { code: "zh", name: "chinese" },
  { code: "vi", name: "vietnamese" },
  { code: "id", name: "indonesian" },
];

const ENGLISH: Language = { code: "en", name: "english" };

/** True for a record or repo id that only takes english: a note says so, or the id ends in `.en`. */
export function englishOnly(model: Pick<ModelRecord, "notes" | "source"> | string): boolean {
  const id = typeof model === "string" ? model : (model.source.modelId ?? model.source.repo ?? "");
  if (/\.en$/i.test(id.split(/[@:]/)[0]!.trim())) return true;
  return typeof model !== "string" && (model.notes?.some((n) => /english only/i.test(n)) ?? false);
}

/** What a language select offers for a model, whether it is locked, its value and the reason. */
export interface LanguageChoice {
  options: readonly Language[];
  /** The select is disabled and forced to english. */
  locked: boolean;
  /** The value to show: the wanted code when allowed, else the first allowed. */
  value: string;
  /** Why the select is locked, as ui copy; empty when it is not. */
  reason: string;
}

/** The language select for a model: what it may offer and what to show. */
export function languagesFor(model: Pick<ModelRecord, "notes" | "source" | "label" | "id"> | string, wanted = "auto"): LanguageChoice {
  if (englishOnly(model)) {
    const name = typeof model === "string" ? model : (model.label ?? model.id);
    return { options: [ENGLISH], locked: true, value: "en", reason: `${name} is english only. pick a multilingual model for other languages.` };
  }
  const hit = WHISPER_LANGUAGES.find((l) => l.code === wanted);
  return { options: WHISPER_LANGUAGES, locked: false, value: hit ? hit.code : "auto", reason: "" };
}

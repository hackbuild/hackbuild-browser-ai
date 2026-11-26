/**
 * What the model is told and, where the runtime takes one, the grammar
 * that holds it to the vocabulary. The prompt block lists short category
 * names only, so it stays near 60 to 80 tokens however large the clip
 * library is (inferred from the names, at 3.6 characters per token).
 * The grammar allows tags only with names the avatar can realize and
 * requires spoken text, so a reply of bare tags cannot pass.
 */

import type { ActVocabulary } from "./vocab.js";

/** Options for `promptBlock`: the reply style and how many names of each kind to list. */
export interface PromptOptions {
  /** "tags": [name] inline in speech. "json": a say field plus mood, gesture, posture. */
  style?: "tags" | "json";
  /** Names listed per kind at most. Defaults 10 moods, 14 gestures, 6 postures. */
  max?: { moods?: number; gestures?: number; postures?: number };
}

/** The system prompt lines that tell the model which tags it may use, in the tags or json style. */
export function promptBlock(v: ActVocabulary, o: PromptOptions = {}): string {
  const m = v.moods.slice(0, o.max?.moods ?? 10);
  const g = v.gestures.slice(0, o.max?.gestures ?? 14);
  const p = v.postures.slice(0, o.max?.postures ?? 6);
  const lines: string[] = [];
  if (o.style === "json") {
    lines.push('Reply as JSON: {"say": what you speak, "mood": optional, "gesture": optional, "posture": optional}.');
  } else {
    lines.push("You can act while you speak. Put a tag in square brackets where it happens, like [happy] or [happy, wave].");
  }
  if (m.length) lines.push(`moods: ${m.join(", ")}`);
  if (g.length) lines.push(`gestures: ${g.join(", ")}`);
  if (p.length) lines.push(`postures, only when asked: ${p.join(", ")}`);
  lines.push("Always say something; tags never stand alone.");
  return lines.join("\n");
}

const gbnfString = (s: string): string => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * A GBNF grammar (llama.cpp and wllama) or a JSON Schema (WebLLM XGrammar,
 * remote json_schema) for replies that use only this vocabulary.
 */
export function grammar(v: ActVocabulary, format: "gbnf" | "json-schema"): string {
  const names = [...v.moods, ...v.gestures, ...v.postures];
  if (format === "json-schema") {
    const props: Record<string, unknown> = { say: { type: "string", minLength: 1 } };
    if (v.moods.length) props.mood = { type: "string", enum: v.moods };
    if (v.gestures.length) props.gesture = { type: "string", enum: v.gestures };
    if (v.postures.length) props.posture = { type: "string", enum: v.postures };
    return JSON.stringify({ type: "object", properties: props, required: ["say"], additionalProperties: false });
  }
  const rules = [
    "root ::= (tag sp)* words (sp? tag | words)*",
    "words ::= [^\\[\\]\\n] [^\\[\\]]*",
    "sp ::= \" \"?",
  ];
  if (names.length) {
    rules.push('tag ::= "[" name ("," " "? name)? "]"');
    rules.push(`name ::= ${names.map(gbnfString).join(" | ")}`);
  } else {
    rules[0] = "root ::= words";
  }
  return rules.join("\n") + "\n";
}

/** Cues from a JSON reply in the json style: all sit at offset 0 of the say text. */
export function cuesFromJson(obj: unknown): { say: string; names: { kind: "mood" | "gesture" | "posture"; name: string }[] } {
  const o = (obj && typeof obj === "object" ? obj : {}) as Record<string, unknown>;
  const names: { kind: "mood" | "gesture" | "posture"; name: string }[] = [];
  for (const k of ["mood", "gesture", "posture"] as const) if (typeof o[k] === "string" && o[k]) names.push({ kind: k, name: o[k] as string });
  return { say: typeof o.say === "string" ? o.say : "", names };
}

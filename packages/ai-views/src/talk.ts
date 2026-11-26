/**
 * The state behind PersonaRack and VoiceRow: a persona in three parts fitted
 * to a token budget with presets, and spoken replies over a native voice.
 * Framework free.
 */

import { budget } from "@hackbuild/memory";
import type { NativeEngine } from "@hackbuild/speak";
import type { MemoryUsed } from "./chat.js";

/** A persona in three parts, highest priority first, with its name and first line. */
export interface Persona {
  name: string;
  /** Who you are and how to answer: always sent. */
  profile: string;
  /** Extra notes: dropped before the profile when the request runs out of room. */
  notes: string;
  /** Extra rules: dropped first. */
  rules: string;
  first?: string;
}

/** A named persona a person can load in one press. */
export interface PersonaPresetX {
  label: string;
  persona: Persona;
}

/** The persona state: the current persona, presets, and the system prompt fitted to a budget. */
export interface PersonaRack {
  snapshot(): { persona: Persona; presets: readonly PersonaPresetX[]; on: number; builtIn: number };
  subscribe(fn: (s: ReturnType<PersonaRack["snapshot"]>) => void): () => void;
  set(p: Partial<Persona>): void;
  load(i: number): void;
  save(label: string): void;
  removePreset(i: number): void;
  /**
   * The system prompt: profile, memory, notes, rules, in that priority, fitted
   * to `budgetTokens` (about 4 characters a token, inferred); the lowest go
   * first. Returns the text and the parts dropped.
   */
  system(mem?: readonly MemoryUsed[], budgetTokens?: number): { text: string; dropped: string[] };
}

const blank = (): Persona => ({ name: "assistant", profile: "", notes: "", rules: "" });

/** Creates a persona rack with built in presets and any saved ones; `onSave` keeps the saved ones. */
export function personaRack(o: { presets?: readonly PersonaPresetX[]; saved?: readonly PersonaPresetX[]; persona?: Persona; onSave?: (saved: PersonaPresetX[]) => void } = {}): PersonaRack {
  const builtIn = [...(o.presets ?? [])];
  let saved = [...(o.saved ?? [])];
  let persona = { ...blank(), ...(o.persona ?? builtIn[0]?.persona ?? {}) };
  let on = o.persona ? -1 : builtIn.length ? 0 : -1;
  const subs = new Set<(s: ReturnType<PersonaRack["snapshot"]>) => void>();
  const all = () => [...builtIn, ...saved];
  const snap = () => ({ persona, presets: all(), on, builtIn: builtIn.length });
  const emit = () => subs.forEach((f) => f(snap()));
  return {
    snapshot: snap,
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
      return () => subs.delete(fn);
    },
    set(p) {
      persona = { ...persona, ...p };
      on = -1;
      emit();
    },
    load(i) {
      const p = all()[i];
      if (!p) return;
      persona = { ...blank(), ...p.persona };
      on = i;
      emit();
    },
    save(label) {
      const name = label.trim() || persona.name || "preset";
      saved = [...saved.filter((s) => s.label !== name), { label: name, persona: { ...persona } }];
      on = builtIn.length + saved.length - 1;
      o.onSave?.(saved);
      emit();
    },
    removePreset(i) {
      const j = i - builtIn.length;
      if (j < 0 || j >= saved.length) return;
      saved = saved.filter((_, k) => k !== j);
      if (on === i) on = -1;
      o.onSave?.(saved);
      emit();
    },
    system(mem = [], budgetTokens = 3000) {
      const sections = [
        { name: "profile", priority: 40, text: persona.profile.trim() },
        { name: "memory", priority: 30, text: mem.length ? `things you remember:\n${mem.map((m) => `- ${m.label}`).join("\n")}` : "" },
        { name: "notes", priority: 20, text: persona.notes.trim() ? `notes:\n${persona.notes.trim()}` : "" },
        { name: "rules", priority: 10, text: persona.rules.trim() ? `rules:\n${persona.rules.trim()}` : "" },
      ].filter((s) => s.text);
      const a = budget({ budgetTokens, sections });
      // the profile stays even when it alone is over budget
      const text = a.kept.includes("profile") || !persona.profile.trim() ? a.text : [persona.profile.trim(), a.text].filter(Boolean).join("\n\n");
      return { text, dropped: a.dropped };
    },
  };
}

/** Spoken replies: auto speak, the voice, rate and pitch, speak and stop. */
export interface VoiceRow {
  snapshot(): { auto: boolean; voice: string; rate: number; pitch: number; voices: string[]; speaking: boolean; error: string };
  subscribe(fn: (s: ReturnType<VoiceRow["snapshot"]>) => void): () => void;
  set(p: Partial<{ auto: boolean; voice: string; rate: number; pitch: number }>): void;
  speak(text: string): Promise<void>;
  stop(): void;
  /** Speaks `text` when auto speak is on: hand it to a chat thread's onReply. */
  reply(text: string): void;
}

/** Creates the voice state over a native engine (`webSpeechEngine()` of @hackbuild/speak). */
export function voiceRow(engine: NativeEngine, o: { auto?: boolean; voice?: string; rate?: number; pitch?: number; onChange?: (s: { auto: boolean; voice: string; rate: number; pitch: number }) => void } = {}): VoiceRow {
  let s = { auto: o.auto ?? false, voice: o.voice ?? "", rate: o.rate ?? 1, pitch: o.pitch ?? 1, speaking: false, error: "" };
  let ac: AbortController | null = null;
  const subs = new Set<(x: ReturnType<VoiceRow["snapshot"]>) => void>();
  const snap = () => ({ ...s, voices: engine.voices?.() ?? [] });
  const emit = () => subs.forEach((f) => f(snap()));
  const g = globalThis as { speechSynthesis?: { addEventListener?(t: string, f: () => void): void } };
  g.speechSynthesis?.addEventListener?.("voiceschanged", emit);
  const row: VoiceRow = {
    snapshot: snap,
    subscribe(fn) {
      subs.add(fn);
      fn(snap());
      return () => subs.delete(fn);
    },
    set(p) {
      s = { ...s, ...p };
      o.onChange?.({ auto: s.auto, voice: s.voice, rate: s.rate, pitch: s.pitch });
      emit();
    },
    async speak(text) {
      row.stop();
      const mine = (ac = new AbortController());
      s = { ...s, speaking: true, error: "" };
      emit();
      try {
        await engine.load({ signal: mine.signal } as never);
        await engine.speak(text, { ...(s.voice ? { voice: s.voice } : {}), rate: s.rate, pitch: s.pitch }, { onBoundary: () => undefined }, mine.signal);
      } catch (e) {
        if (!mine.signal.aborted) s = { ...s, error: e instanceof Error ? e.message : String(e) };
      } finally {
        if (ac === mine) {
          ac = null;
          s = { ...s, speaking: false };
          emit();
        }
      }
    },
    stop() {
      ac?.abort();
      engine.stop();
    },
    reply(text) {
      if (s.auto && text.trim()) void row.speak(text);
    },
  };
  return row;
}


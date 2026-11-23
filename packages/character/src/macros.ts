/** Pure helpers over card text: macros and lorebook matching. */

import type { CharacterBook, Card, LoreEntry, Profile } from "./types.js";

/** Replace {{char}} and {{user}} (any case) and the older <BOT> and <USER>. */
export function fillMacros(text: string, names: { char: string; user: string }): string {
  return text.replace(/\{\{\s*(char|user)\s*\}\}|<(BOT|USER)>/gi, (_m, a: string | undefined, b: string | undefined) => {
    const k = (a ?? b ?? "").toLowerCase();
    return k === "user" ? names.user : names.char;
  });
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function keyMatcher(key: string, e: LoreEntry): RegExp | null {
  const flags = e.case_sensitive ? "" : "i";
  if (e.use_regex) {
    const m = /^\/(.+)\/([a-z]*)$/s.exec(key);
    try {
      return m ? new RegExp(m[1]!, [...new Set(m[2]! + flags)].join("")) : new RegExp(key, flags);
    } catch {
      return null;
    }
  }
  const k = key.trim();
  return k ? new RegExp(escapeRe(k), flags) : null;
}

const anyKey = (keys: readonly string[] | undefined, text: string, e: LoreEntry) => (keys ?? []).some((k) => keyMatcher(k, e)?.test(text) ?? false);

export interface LoreOptions {
  /** Stop adding entries once their content passes this many characters. */
  budgetChars?: number;
}

/**
 * Entries a passage of recent chat activates: enabled entries that are
 * constant or whose keys appear (substring, or regex when use_regex),
 * and for selective entries also a secondary key. Ordered by
 * insertion_order, then by priority, highest first, for ties.
 */
export function activeLore(book: CharacterBook | undefined, text: string, o: LoreOptions = {}): LoreEntry[] {
  if (!book) return [];
  const hits = book.entries.filter((e) => {
    if (e.enabled === false) return false;
    if (e.constant) return true;
    if (!anyKey(e.keys, text, e)) return false;
    return !e.selective || !e.secondary_keys?.length || anyKey(e.secondary_keys, text, e);
  });
  hits.sort((a, b) => a.insertion_order - b.insertion_order || (b.priority ?? 0) - (a.priority ?? 0));
  if (o.budgetChars === undefined) return hits;
  const out: LoreEntry[] = [];
  let used = 0;
  for (const e of hits) {
    if (used + e.content.length > o.budgetChars) break;
    used += e.content.length;
    out.push(e);
  }
  return out;
}

/** The profile extension as stored, or null. Run `migrate` before trusting its shape. */
export function profileOf(card: Card | Record<string, unknown>): Profile | null {
  const data = (card as { data?: { extensions?: { hackbuild?: unknown } } }).data;
  const p = data?.extensions?.hackbuild;
  return p && typeof p === "object" ? (p as Profile) : null;
}

/**
 * Plan cache: a heard request that worked is stored by its normalized
 * text, so the same request later runs with no model call. 60 entries,
 * least recently used dropped first; a failure on a cached plan evicts it.
 */

import type { Step } from "./tools.js";

/** A request in the form the plan cache keys on: lowercase, punctuation and polite openers removed, spaces collapsed. */
export const normalizeRequest = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\b(please|could you|can you|would you)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** A least recently used cache of plans that worked, keyed by normalized request text. */
export class PlanCache {
  private m = new Map<string, Step[]>();
  constructor(readonly size = 60) {}
  get(text: string): Step[] | null {
    const k = normalizeRequest(text);
    const v = this.m.get(k);
    if (!v) return null;
    this.m.delete(k);
    this.m.set(k, v);
    return v.map((s) => ({ tool: s.tool, args: [...s.args] }));
  }
  set(text: string, steps: Step[]): void {
    const k = normalizeRequest(text);
    if (!k) return;
    this.m.delete(k);
    this.m.set(k, steps.map((s) => ({ tool: s.tool, args: [...s.args] })));
    while (this.m.size > this.size) this.m.delete(this.m.keys().next().value!);
  }
  evict(text: string): void {
    this.m.delete(normalizeRequest(text));
  }
  get length(): number {
    return this.m.size;
  }
}

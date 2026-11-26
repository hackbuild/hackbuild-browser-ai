/**
 * The reflex brain: a request is split into clauses on commas, "then" and
 * "and", and each clause runs through regex rules that map it to steps.
 * It is the whole brain at tier 0, the first try in reflex mode, and the
 * source of hints for small models in hints mode.
 */

import type { Step } from "./tools.js";

/** A reflex rule's plan: steps from the regex match and the clause, or null to let the next rule try. */
export type ReflexPlan = (m: RegExpExecArray, clause: string) => Step[] | null;

/** What `Reflex.parse` returns: the steps mapped and the clauses no rule mapped. */
export interface ReflexResult {
  steps: Step[];
  /** Clauses no rule mapped. */
  missed: string[];
}

/** Split a request into lowercase clauses on commas, semicolons, "then" and "and", with polite words removed. */
export function clauses(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.?!]+$/g, "")
    .split(/\s*(?:,|;|\bthen\b|\band then\b|\band\b)\s*/)
    .map((s) => s.trim().replace(/^(please|could you|can you|would you)\s+/, "").replace(/\s+please$/, ""))
    .filter(Boolean);
}

/** The reflex brain: regex rules that map each clause of a request to steps, with no model. */
export class Reflex {
  private rules: { re: RegExp; plan: ReflexPlan }[] = [];

  /** Add a rule. The first matching rule per clause wins. */
  add(re: RegExp, plan: ReflexPlan | Step[]): this {
    this.rules.push({ re, plan: Array.isArray(plan) ? () => plan.map((s) => ({ tool: s.tool, args: [...s.args] })) : plan });
    return this;
  }

  /** Steps for one clause, or null. */
  clause(c: string): Step[] | null {
    for (const r of this.rules) {
      const m = r.re.exec(c);
      if (m) {
        const s = r.plan(m, c);
        if (s) return s;
      }
    }
    return null;
  }

  /** Map a request. null when no clause mapped at all. */
  parse(text: string): ReflexResult | null {
    const steps: Step[] = [];
    const missed: string[] = [];
    for (const c of clauses(text)) {
      const s = this.clause(c);
      if (s) steps.push(...s);
      else missed.push(c);
    }
    return steps.length ? { steps, missed } : null;
  }

  get size(): number {
    return this.rules.length;
  }
}

/**
 * Persistent goals. A goal has a kind (explore, find, fetch, collect,
 * tidy, custom, or any kind the host adds), an optional target, and a
 * planner per kind that needs no model: given the host's state it returns
 * the next steps, done, or failed. The same planner run dry (`peek`)
 * gives hints to a model and detects completion.
 *
 * Bookkeeping: an object that fails twice goes on the goal's skip list
 * and yields a lesson; a goal is blocked after 7 tries without a model or
 * 5 tries without progress with one; when a goal ends the person is told
 * once (`takeReports`). Goals are kept through an injected sink, at most
 * 24, oldest ended ones dropped first.
 */

import type { Step } from "./tools.js";

export type GoalKind = "explore" | "find" | "fetch" | "collect" | "tidy" | "custom" | (string & {});

export interface Goal {
  id: string;
  kind: GoalKind;
  target: string | null;
  /** The request as heard. */
  text: string;
  status: "active" | "done" | "blocked" | "failed";
  tries: number;
  /** Tries in a row without progress. */
  stale: number;
  /** Failures per object. */
  fails: Record<string, number>;
  skip: string[];
  /** Hints are switched on for this goal (after two failures in a turn). */
  coach: boolean;
  reported: boolean;
  note: string;
  created: number;
  updated: number;
}

export type GoalStep = { steps: Step[] } | { done: string } | { failed: string };
export type Planner<S> = (goal: Goal, state: S) => GoalStep;

export interface GoalSink {
  load(): Goal[] | null | Promise<Goal[] | null>;
  save(goals: Goal[]): void | Promise<void>;
}

/** A sink over a string key value store (localStorage, or a Map in tests). */
export function storageSink(store: { getItem(k: string): string | null; setItem(k: string, v: string): void }, key = "hackbuild-agent-goals"): GoalSink {
  return {
    load() {
      try {
        const s = store.getItem(key);
        const v = s ? (JSON.parse(s) as { ver: number; goals: Goal[] }) : null;
        return v && v.ver === 1 && Array.isArray(v.goals) ? v.goals : null;
      } catch {
        return null;
      }
    },
    save(goals) {
      store.setItem(key, JSON.stringify({ ver: 1, goals }));
    },
  };
}

export const GOAL_PATTERNS: readonly [GoalKind, RegExp][] = [
  ["tidy", /\b(?:tidy|clean)(?:\s+up)?(?:\s+(?:the\s+)?(.+))?$/],
  ["collect", /\b(?:collect|gather)\s+(?:up\s+)?(?:all\s+)?(?:the\s+|my\s+)?(.+)$/],
  ["fetch", /\b(?:bring|fetch|get)\s+(?:me\s+)?(?:the\s+|my\s+|a\s+)?(.+?)(?:\s+to me|\s+here)?$/],
  ["find", /\b(?:find|look for|search for|where is|where's)\s+(?:the\s+|my\s+|a\s+)?(.+)$/],
  ["explore", /\b(?:explore|look around|wander)(?:\s+(?:the\s+)?(.+))?$/],
];

export interface GoalsOptions<S> {
  sink?: GoalSink;
  planners?: Record<string, Planner<S>>;
  max?: number;
  /** Tries before a goal is blocked: without a model, and without progress with one. Defaults 7 and 5. */
  maxTries?: { reflex?: number; model?: number };
  /** Failures before an object is skipped. Default 2. */
  skipAfter?: number;
  now?: () => number;
}

export class Goals<S = unknown> {
  private goals: Goal[] = [];
  private seq = 0;
  private readonly o: GoalsOptions<S>;
  private readonly planners: Record<string, Planner<S>>;
  constructor(o: GoalsOptions<S> = {}) {
    this.o = o;
    this.planners = { ...(o.planners ?? {}) };
  }

  private now(): number {
    return this.o.now ? this.o.now() : Date.now();
  }

  async load(): Promise<void> {
    const g = (await this.o.sink?.load()) ?? null;
    if (g) this.goals = g;
    this.seq = this.goals.length;
  }

  private async save(): Promise<void> {
    const max = this.o.max ?? 24;
    while (this.goals.length > max) {
      const i = this.goals.findIndex((g) => g.status !== "active");
      this.goals.splice(i >= 0 ? i : 0, 1);
    }
    await this.o.sink?.save(this.goals.map((g) => ({ ...g, fails: { ...g.fails }, skip: [...g.skip] })));
  }

  planner(kind: GoalKind, fn: Planner<S>): this {
    this.planners[kind] = fn;
    return this;
  }

  /** Read a goal out of a request, or null. */
  parse(text: string): { kind: GoalKind; target: string | null } | null {
    const t = text.toLowerCase().trim().replace(/[.?!]+$/, "");
    for (const [kind, re] of GOAL_PATTERNS) {
      const m = re.exec(t);
      if (m) return { kind, target: m[1]?.trim() || null };
    }
    return null;
  }

  async add(kind: GoalKind, target: string | null, text: string): Promise<Goal> {
    const t = this.now();
    // a new goal replaces an active one of the same kind and target
    for (const g of this.goals) if (g.status === "active" && g.kind === kind && g.target === target) g.status = "failed";
    const g: Goal = { id: `g${t.toString(36)}-${(this.seq++).toString(36)}`, kind, target, text, status: "active", tries: 0, stale: 0, fails: {}, skip: [], coach: false, reported: false, note: "", created: t, updated: t };
    this.goals.push(g);
    await this.save();
    return g;
  }

  active(): Goal | null {
    for (let i = this.goals.length - 1; i >= 0; i--) if (this.goals[i]!.status === "active") return this.goals[i]!;
    return null;
  }

  list(): readonly Goal[] {
    return this.goals;
  }

  /** The planner run dry: the next steps, done or failed, with no side effect. null when the kind has no planner. */
  peek(goal: Goal, state: S): GoalStep | null {
    const p = this.planners[goal.kind];
    return p ? p(goal, state) : null;
  }

  /** Record one try. Returns true when the goal is now blocked. */
  async tried(goal: Goal, progress: boolean, by: "reflex" | "model"): Promise<boolean> {
    goal.tries++;
    goal.stale = progress ? 0 : goal.stale + 1;
    goal.updated = this.now();
    const lim = by === "reflex" ? (this.o.maxTries?.reflex ?? 7) : (this.o.maxTries?.model ?? 5);
    const blocked = by === "reflex" ? goal.tries >= lim && !progress : goal.stale >= lim;
    if (blocked) {
      goal.status = "blocked";
      goal.note = `blocked after ${goal.tries} tries`;
    }
    await this.save();
    return blocked;
  }

  /** Record a failure on an object. Returns a lesson when the object goes on the skip list. */
  async failed(goal: Goal, object: string, why: string): Promise<string | null> {
    const k = object.toLowerCase();
    goal.fails[k] = (goal.fails[k] ?? 0) + 1;
    let lesson: string | null = null;
    if (goal.fails[k] >= (this.o.skipAfter ?? 2) && !goal.skip.includes(k)) {
      goal.skip.push(k);
      lesson = `${k}: ${why}. i skip it for now.`;
    }
    await this.save();
    return lesson;
  }

  async end(goal: Goal, status: "done" | "blocked" | "failed", note: string): Promise<void> {
    goal.status = status;
    goal.note = note;
    goal.updated = this.now();
    await this.save();
  }

  async coach(goal: Goal): Promise<void> {
    goal.coach = true;
    await this.save();
  }

  /** Goals that ended and have not been reported; each is returned once. */
  async takeReports(): Promise<Goal[]> {
    const out = this.goals.filter((g) => g.status !== "active" && !g.reported);
    for (const g of out) g.reported = true;
    if (out.length) await this.save();
    return out;
  }
}

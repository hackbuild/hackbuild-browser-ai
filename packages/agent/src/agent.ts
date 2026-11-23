/**
 * The agent turn: perceive, recall, decide, act, reflect.
 *
 *   perceive  the host returns prompt sections with priorities and its state
 *   recall    memory lines for the request or the goal
 *   decide    plan cache, then the reflex brain or the model with forced JSON
 *   act       up to `maxActions` steps per call, in order, stopping at the first failure
 *   reflect   an episode per turn, a lesson per skipped object, goal bookkeeping
 *
 * Escalation inside a turn: an empty plan switches hints on the first time
 * and ends the turn the second; two failures switch hints on and mark the
 * goal for coaching; five failures, or the same failing plan twice, end
 * the turn. When steps run out on a heard request, it becomes a custom
 * goal and carries on later.
 *
 * Modes: "model" lets the model decide; "hints" adds the reflex brain's or
 * the goal planner's dry run as a hint line on every call (for the
 * smallest models); "reflex" runs the rules first and asks the model only
 * for what they cannot map. With no model the reflex brain and goal
 * planners are the whole agent.
 */

import type { ChatEngine, ChatMessage } from "@hackbuild/chat";
import { budget, estimateTokens, type Section } from "@hackbuild/memory";
import { createGuards, fingerprint, looksLikeGarbage, type GuardOptions } from "@hackbuild/structured";
import { PlanCache, normalizeRequest } from "./cache.js";
import type { Goal, Goals, GoalStep } from "./goals.js";
import { loosePlanSchema, parsePlan, planSchema, SayStream, type Plan } from "./plan.js";
import type { Reflex } from "./reflex.js";
import { createRegistry, stepText, type Registry, type Step, type StepResult, type Tool } from "./tools.js";

export type Rng = () => number;
export type Why = "heard" | "goal" | "free" | "report";

export interface AgentMemory {
  recall(query: string): string[] | Promise<string[]>;
  write(kind: "episode" | "lesson", text: string): void | Promise<void>;
}

export interface Perception<S> {
  /** Ranked sections: YOU CAN DO NOW (9), I SEE NOW (8), RULES (7), MAP (6) and so on. */
  sections?: Section[];
  /** Lines that always go in, like HANDS and posture. */
  fixed?: string[];
  /** Host state handed to goal planners. */
  state?: S;
}

export interface AgentOptions<S> {
  tools: readonly Tool[];
  brain?: ChatEngine | null;
  mode?: "model" | "hints" | "reflex";
  soul: string;
  /** Body rules and anything else that belongs in the system message. */
  body?: string;
  perceive?: () => Perception<S> | Promise<Perception<S>>;
  memory?: AgentMemory;
  reflex?: Reflex;
  goals?: Goals<S>;
  /** Context budget in tokens. Default 1000. */
  budgetTokens?: number;
  estimate?: (s: string) => number;
  /** Model calls per heard turn. Default 6. */
  steps?: number;
  /** Model calls per goal turn. Default 14. */
  goalSteps?: number;
  /** Steps per model call. Default 3. */
  maxActions?: number;
  maxTokens?: number;
  temperature?: number;
  guards?: GuardOptions;
  /** Plan cache entries. Default 60. */
  cacheSize?: number;
  /** Things to do on a free tick with no model; one is picked by `rng`. */
  idle?: Step[][];
  now?: () => number;
  rng?: Rng;
  /** Say text as soon as it is readable, ahead of the JSON closing. `text` is the new piece only; final true, with empty text, ends each say. */
  onSay?: (text: string, final: boolean) => void;
  onEvent?: (e: AgentEvent) => void;
}

export type AgentEvent =
  | { type: "plan"; plan: Plan; via: "model" | "reflex" | "cache" | "planner" }
  | { type: "step"; result: StepResult }
  | { type: "hint"; text: string }
  | { type: "goal"; goal: Goal; change: "added" | "done" | "blocked" | "failed" | "coach" }
  | { type: "end"; result: TurnResult };

export type Ended = "done" | "empty" | "failures" | "repeat" | "steps" | "guard" | "aborted" | "reflex" | "cache" | "planner" | "no-brain";

export interface TurnResult {
  why: Why;
  ended: Ended;
  said: string[];
  results: StepResult[];
  calls: number;
  goal: Goal | null;
}

export interface Cost {
  modelCalls: number;
  reflexHits: number;
  cacheHits: number;
  lastPromptTokens: number;
  lastReplyMs: number;
}

const CONTRACT = [
  "HOW A TURN WORKS",
  "Reply with one JSON object and nothing else:",
  '{"think": "short private note", "say": "what you say out loud, or empty", "do": [["tool", "argument"]], "done": true or false}',
  "do holds at most three steps; they run in order and stop at the first failure. You then see DONE THIS TURN and plan again.",
  "Set done to true when the request is handled or there is nothing to do.",
  'Example: {"think": "mug is on the table", "say": "getting it", "do": [["go_to", "table"], ["pick_up", "mug"]], "done": false}',
].join("\n");

export class Agent<S = unknown> {
  readonly tools: Registry;
  readonly cache: PlanCache;
  readonly cost: Cost = { modelCalls: 0, reflexHits: 0, cacheHits: 0, lastPromptTokens: 0, lastReplyMs: 0 };
  private readonly o: AgentOptions<S>;
  private lessons: string[] = [];
  private recent: string[] = [];
  private busy: AbortController | null = null;

  constructor(o: AgentOptions<S>) {
    this.o = o;
    this.tools = createRegistry(o.tools);
    this.cache = new PlanCache(o.cacheSize ?? 60);
  }

  private now(): number {
    return this.o.now ? this.o.now() : Date.now();
  }

  /** Stop the running turn; tools see the signal. */
  cancel(): void {
    this.busy?.abort();
  }

  /** The system message: soul, body, tools, the turn contract. */
  system(): string {
    return [this.o.soul, this.o.body ?? "", `TOOLS\n${this.tools.describe()}`, CONTRACT].filter(Boolean).join("\n\n");
  }

  /** A hint for the next part: the goal planner run dry, else the reflex brain. */
  hint(heard: string | null, goal: Goal | null, state: S | undefined): string {
    if (goal && this.o.goals && state !== undefined) {
      const p = this.o.goals.peek(goal, state);
      if (p && "steps" in p && p.steps.length) return p.steps.map(stepText).join(", then ");
    }
    if (heard && this.o.reflex) {
      const r = this.o.reflex.parse(heard);
      if (r) return r.steps.map(stepText).join(", then ");
    }
    return "";
  }

  /** Budgeted user message for one model call. */
  context(p: { heard: string | null; why: Why; goal: Goal | null; hint: string; done: StepResult[]; perception: Perception<S>; recalled: string[] }): { text: string; kept: string[]; dropped: string[] } {
    const fixed: string[] = [];
    if (p.heard) fixed.push(`THE PERSON SAID: "${p.heard}"`);
    else if (p.why === "free") fixed.push("NOBODY SPOKE. Do one small thing you feel like doing.");
    else fixed.push("NOBODY SPOKE.");
    fixed.push(...(p.perception.fixed ?? []));
    if (p.goal) fixed.push(`GOAL (try ${p.goal.tries + 1}): ${p.goal.text}${p.goal.skip.length ? `. skipping: ${p.goal.skip.join(", ")}` : ""}`);
    if (p.hint) fixed.push(`HINT, a simple way to do the next part: ${p.hint}`);
    if (p.done.length) fixed.push(`DONE THIS TURN\n${p.done.map((r) => `- ${stepText(r.step)}: ${r.ok ? r.text : `FAILED, ${r.text}`}`).join("\n")}`);
    const sections: Section[] = [...(p.perception.sections ?? [])];
    if (this.lessons.length) sections.push({ name: "lessons", priority: 7, text: `LESSONS\n${this.lessons.slice(-6).map((l) => `- ${l}`).join("\n")}` });
    if (p.recalled.length) sections.push({ name: "recall", priority: 5, text: `YOU REMEMBER\n${p.recalled.map((l) => `- ${l}`).join("\n")}` });
    if (this.recent.length) sections.push({ name: "recent", priority: 3, text: `LAST TURNS\n${this.recent.slice(-6).join("\n")}` });
    const a = budget({ budgetTokens: this.o.budgetTokens ?? 1000, fixed, sections, ...(this.o.estimate ? { estimate: this.o.estimate } : {}) });
    return { text: a.text, kept: a.kept, dropped: a.dropped };
  }

  private async runSteps(steps: Step[], heard: string | null, signal: AbortSignal, goal: Goal | null, out: StepResult[]): Promise<{ ok: boolean; failed: StepResult | null }> {
    for (const s of steps) {
      if (signal.aborted) return { ok: false, failed: null };
      const r = await this.tools.run(s, { signal, heard });
      out.push(r);
      this.o.onEvent?.({ type: "step", result: r });
      if (!r.ok) {
        if (goal && this.o.goals) {
          const tool = this.tools.get(s.tool);
          const obj = tool?.target ? tool.target(s.args) : (s.args[0] ?? null);
          if (obj) {
            const lesson = await this.o.goals.failed(goal, obj, r.text);
            if (lesson) await this.learn(lesson);
          }
        }
        return { ok: false, failed: r };
      }
    }
    return { ok: true, failed: null };
  }

  private async learn(lesson: string): Promise<void> {
    this.lessons.push(lesson);
    if (this.lessons.length > 24) this.lessons.shift();
    await this.o.memory?.write("lesson", lesson);
  }

  private say(text: string, said: string[]): void {
    const t = text.trim();
    if (!t) return;
    said.push(t);
  }

  private async decide(messages: ChatMessage[], signal: AbortSignal): Promise<{ plan: Plan; raw: string }> {
    const brain = this.o.brain!;
    const maxA = this.o.maxActions ?? 3;
    const t0 = this.now();
    this.cost.modelCalls++;
    this.cost.lastPromptTokens = messages.reduce((n, m) => n + estimateTokens(m.content), 0);
    const ss = new SayStream();
    let raw = "";
    let streamed = false;
    const gen = brain.stream(messages, {
      schema: planSchema(this.tools.names, maxA),
      fallbackSchemas: [loosePlanSchema(maxA)],
      maxTokens: this.o.maxTokens ?? 320,
      ...(this.o.temperature !== undefined ? { temperature: this.o.temperature } : {}),
      signal,
      think: "drop",
    });
    for (;;) {
      const n = await gen.next();
      if (n.done) break;
      if (n.value.type === "text") {
        raw += n.value.text;
        const s = ss.push(n.value.text);
        if (s) {
          streamed = true;
          this.o.onSay?.(s, false);
        }
      }
    }
    this.cost.lastReplyMs = this.now() - t0;
    const plan = parsePlan(raw, this.tools.names, maxA);
    if (!streamed && plan.say) this.o.onSay?.(plan.say, false);
    if (streamed || plan.say) this.o.onSay?.("", true);
    return { plan, raw };
  }

  /** One turn. `text` is what was heard for "heard"; ignored otherwise. */
  async handle(text: string, why: Why = "heard"): Promise<TurnResult> {
    this.busy?.abort();
    const ctl = new AbortController();
    this.busy = ctl;
    const signal = ctl.signal;
    const o = this.o;
    const perception: Perception<S> = (await o.perceive?.()) ?? {};
    const state = perception.state;
    const heard = why === "heard" ? text.trim() : null;
    const said: string[] = [];
    const results: StepResult[] = [];
    let calls = 0;
    let goal: Goal | null = null;

    if (why === "report") return this.finishTurn({ why, ended: "done", said: await this.report(said), results, calls, goal }, heard, signal);

    if (heard && o.goals) {
      const g = o.goals.parse(heard);
      if (g) {
        goal = await o.goals.add(g.kind, g.target, heard);
        o.onEvent?.({ type: "goal", goal, change: "added" });
      }
    } else if (why === "goal" && o.goals) goal = o.goals.active();
    if (why === "goal" && !goal) return this.finishTurn({ why, ended: "done", said, results, calls, goal }, heard, signal);

    // plan cache: a heard request that worked before runs again with no model call
    if (heard) {
      const cached = this.cache.get(heard);
      if (cached) {
        o.onEvent?.({ type: "plan", plan: { think: "", say: "", do: cached, done: true, from: "json", unknown: [] }, via: "cache" });
        const r = await this.runSteps(cached, heard, signal, goal, results);
        if (r.ok) {
          this.cost.cacheHits++;
          return this.finishTurn({ why, ended: "cache", said, results, calls, goal }, heard, signal);
        }
        this.cache.evict(heard);
      }
    }

    const mode = o.mode ?? "model";
    if (mode === "reflex" || !o.brain) {
      if (goal && why === "goal" && state !== undefined && o.goals) {
        const p = o.goals.peek(goal, state);
        if (p) return this.plannerTurn(goal, p, why, said, results, heard, signal);
      }
      if (heard && o.reflex) {
        const r = o.reflex.parse(heard);
        if (r && (!r.missed.length || !o.brain)) {
          this.cost.reflexHits++;
          o.onEvent?.({ type: "plan", plan: { think: "", say: "", do: r.steps, done: true, from: "json", unknown: [] }, via: "reflex" });
          const ran = await this.runSteps(r.steps, heard, signal, goal, results);
          if (ran.ok && !r.missed.length) this.cache.set(heard, r.steps);
          if (goal && state !== undefined && o.goals) {
            const p = o.goals.peek(goal, state);
            if (p && "done" in p) await this.endGoal(goal, "done", p.done);
          }
          return this.finishTurn({ why, ended: "reflex", said, results, calls, goal }, heard, signal);
        }
      }
      if (why === "free" && o.idle?.length) {
        const pick = o.idle[Math.min(o.idle.length - 1, Math.floor((o.rng ?? (() => 0))() * o.idle.length))]!;
        await this.runSteps(pick, null, signal, null, results);
        return this.finishTurn({ why, ended: "reflex", said, results, calls, goal }, heard, signal);
      }
      if (!o.brain) {
        if (heard) {
          this.say("i do not know how to do that yet.", said);
          o.onSay?.("i do not know how to do that yet.", false);
          o.onSay?.("", true);
        }
        return this.finishTurn({ why, ended: "no-brain", said, results, calls, goal }, heard, signal);
      }
    }

    // the model loop
    const recalled = o.memory ? await o.memory.recall(heard ?? goal?.text ?? "") : [];
    const guards = createGuards(o.guards);
    const maxSteps = why === "goal" ? (o.goalSteps ?? 14) : why === "heard" ? (o.steps ?? 6) : why === "free" ? 3 : 1;
    let hints = mode === "hints" || (goal?.coach ?? false);
    let empty = 0;
    let failures = 0;
    const failedPlans = new Set<string>();
    let ended: Ended = "steps";
    let progress = false;
    const system = this.system();
    while (calls < maxSteps) {
      if (signal.aborted) {
        ended = "aborted";
        break;
      }
      const hint = hints ? this.hint(heard, goal, state) : "";
      if (hint) o.onEvent?.({ type: "hint", text: hint });
      const ctx = this.context({ heard, why, goal, hint, done: results, perception, recalled });
      calls++;
      const { plan, raw } = await this.decide(
        [
          { role: "system", content: system },
          { role: "user", content: ctx.text },
        ],
        signal,
      );
      o.onEvent?.({ type: "plan", plan, via: "model" });
      // the garbage guard reads speech; JSON punctuation in a plan is expected
      const speech = plan.from === "text" ? raw : plan.say;
      if (speech.trim() && looksLikeGarbage(speech)) {
        // never spoken; the guard ends the turn on the second in a row
        if (guards.reply(speech)) {
          ended = "guard";
          break;
        }
        continue;
      }
      guards.reply(speech || "ok");
      if (plan.from === "text" && /[{[]/.test(raw) && guards.parseFail()) {
        ended = "guard";
        break;
      }
      this.say(plan.say, said);
      if (!plan.do.length && !plan.say) {
        empty++;
        if (empty >= 2) {
          ended = "empty";
          break;
        }
        hints = true;
        continue;
      }
      let repeat = false;
      for (const s of plan.do) if (guards.call(s.tool, s.args)) repeat = true;
      const ran = await this.runSteps(plan.do, heard, signal, goal, results);
      if (ran.ok && plan.do.length) progress = true;
      if (!ran.ok && ran.failed) {
        failures++;
        const fp = plan.do.map((s) => fingerprint(s.tool, s.args)).join("|");
        if (failedPlans.has(fp)) {
          ended = "repeat";
          break;
        }
        failedPlans.add(fp);
        if (failures >= 2 && !hints) {
          hints = true;
          if (goal && o.goals) {
            await o.goals.coach(goal);
            o.onEvent?.({ type: "goal", goal, change: "coach" });
          }
        }
        if (failures >= 5) {
          ended = "failures";
          break;
        }
        continue;
      }
      if (repeat || guards.stopped) {
        ended = "guard";
        break;
      }
      if (goal && state !== undefined && o.goals) {
        const p = o.goals.peek(goal, state);
        if (p && "done" in p) {
          await this.endGoal(goal, "done", p.done);
          ended = "done";
          break;
        }
      }
      if (plan.done) {
        ended = "done";
        break;
      }
    }

    if (heard && ended === "done" && failures === 0) {
      const steps = results.filter((r) => r.ok).map((r) => r.step);
      if (steps.length && steps.length <= 6) this.cache.set(heard, steps);
    }
    if (goal && goal.status === "active" && o.goals) {
      const blocked = await o.goals.tried(goal, progress, "model");
      if (blocked) o.onEvent?.({ type: "goal", goal, change: "blocked" });
    }
    if (ended === "steps" && heard && o.goals && !goal) {
      goal = await o.goals.add("custom", null, heard);
      o.onEvent?.({ type: "goal", goal, change: "added" });
    }
    return this.finishTurn({ why, ended, said, results, calls, goal }, heard, signal);
  }

  private async plannerTurn(goal: Goal, p: GoalStep, why: Why, said: string[], results: StepResult[], heard: string | null, signal: AbortSignal): Promise<TurnResult> {
    if ("done" in p) {
      await this.endGoal(goal, "done", p.done);
      return this.finishTurn({ why, ended: "planner", said, results, calls: 0, goal }, heard, signal);
    }
    if ("failed" in p) {
      await this.endGoal(goal, "failed", p.failed);
      return this.finishTurn({ why, ended: "planner", said, results, calls: 0, goal }, heard, signal);
    }
    this.o.onEvent?.({ type: "plan", plan: { think: "", say: "", do: p.steps, done: false, from: "json", unknown: [] }, via: "planner" });
    const r = await this.runSteps(p.steps, heard, signal, goal, results);
    const blocked = await this.o.goals!.tried(goal, r.ok, "reflex");
    if (blocked) this.o.onEvent?.({ type: "goal", goal, change: "blocked" });
    return this.finishTurn({ why, ended: "planner", said, results, calls: 0, goal }, heard, signal);
  }

  private async endGoal(goal: Goal, status: "done" | "failed" | "blocked", note: string): Promise<void> {
    await this.o.goals!.end(goal, status, note);
    this.o.onEvent?.({ type: "goal", goal, change: status });
  }

  /** Tell the person once about each goal that ended: one sentence from the model, or the planner's note. */
  private async report(said: string[]): Promise<string[]> {
    const ended = (await this.o.goals?.takeReports()) ?? [];
    for (const g of ended) {
      let line = `${g.text}: ${g.note || g.status}.`;
      if (this.o.brain) {
        this.cost.modelCalls++;
        const r = await this.o.brain.complete(
          [
            { role: "system", content: this.o.soul },
            { role: "user", content: `In one short sentence, tell the person how this went. Goal: ${g.text}. Outcome: ${g.status}, ${g.note || "no note"}.` },
          ],
          { maxTokens: 60, think: "drop" },
        );
        if (r.text.trim()) line = r.text.trim();
      }
      this.say(line, said);
      this.o.onSay?.(line, false);
      this.o.onSay?.("", true);
    }
    return said;
  }

  private async finishTurn(r: TurnResult, heard: string | null, signal: AbortSignal): Promise<TurnResult> {
    const did = r.results.filter((x) => x.ok).map((x) => stepText(x.step));
    const failed = r.results.filter((x) => !x.ok).map((x) => `${stepText(x.step)} (${x.text})`);
    const parts: string[] = [];
    if (heard) parts.push(`they said "${heard}"`);
    if (did.length) parts.push(`i did ${did.join(", ")}`);
    if (failed.length) parts.push(`failed ${failed.join(", ")}`);
    if (r.said.length) parts.push(`i said "${r.said.join(" ")}"`);
    if (parts.length) {
      const line = parts.join("; ");
      this.recent.push(line);
      if (this.recent.length > 12) this.recent.shift();
      await this.o.memory?.write("episode", line);
    }
    // only this turn's own controller is cleared; a newer turn keeps cancel()
    if (this.busy?.signal === signal) this.busy = null;
    this.o.onEvent?.({ type: "end", result: r });
    return r;
  }
}

export function createAgent<S = unknown>(o: AgentOptions<S>): Agent<S> {
  return new Agent(o);
}

export { normalizeRequest };

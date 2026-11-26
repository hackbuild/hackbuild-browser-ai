/**
 * The planner fallback chain: the model planner first, then a scripted
 * planner, then the reflex brain. Each step down is recorded with its
 * reason (no brain, still loading, an error, no valid plan after N tries,
 * no answer at all, no rule matched), so an inspector can say why the agent is on the tier
 * it is on and show the last reply that failed.
 *
 * A tier is skipped when it is not configured; that is recorded too. The
 * model and scripted tiers take a chat engine (the scripted tier is
 * usually `scripted` from `@hackbuild/chat`, which needs no download) or
 * a function. A plan is valid when it parsed as JSON and holds a known
 * step or something to say.
 */

import type { ChatEngine, ChatMessage } from "@hackbuild/chat";
import { loosePlanSchema, parsePlan, planSchema, type Plan } from "./plan.js";
import type { Reflex } from "./reflex.js";

/** A planner tier: the model, a scripted planner, or the reflex brain. */
export type Tier = "model" | "scripted" | "reflex";
/** The planner tiers in the order the chain tries them. */
export const TIERS: readonly Tier[] = ["model", "scripted", "reflex"];

/**
 * Why a tier dropped. `invalid`: it replied, but no reply held a valid plan.
 * `no-answer`: every reply was empty (a plan function returned null, or a
 * scripted engine had nothing for the request).
 */
export type DropReason = "absent" | "loading" | "error" | "invalid" | "no-answer" | "aborted" | "no-match";

/** One step down the chain. */
export interface Drop {
  from: Tier;
  /** The tier tried next, or null when none was left. */
  to: Tier | null;
  reason: DropReason;
  /** Plain detail: the error message, or how many replies failed. */
  detail: string;
  /** Model calls spent on this tier before it dropped. */
  tries: number;
  /** The last raw reply that failed, for the inspector. */
  raw?: string;
  at: number;
}

/** A request to the planner chain: what the person said, the messages for the model tiers, and an abort signal. */
export interface ChainRequest {
  /** What the person said; the reflex tier reads this. */
  text: string;
  /** Messages for the model and scripted tiers. Default: one user message with `text`. */
  messages?: ChatMessage[];
  signal?: AbortSignal;
}

/** What the chain planned: the plan, the tier that made it, the raw reply and the drops on the way. */
export interface ChainResult {
  plan: Plan;
  tier: Tier;
  raw: string;
  drops: Drop[];
}

/** A planner by function: a plan, raw text to parse, or null for none. */
export type PlanFn = (req: ChainRequest) => Plan | string | null | Promise<Plan | string | null>;

/** Options for `createPlannerChain`: tool names, the three tiers, tries, generation settings, the clock and the drop log size. */
export interface ChainOptions {
  tools: readonly string[];
  /** The model planner. */
  model?: ChatEngine | PlanFn | null;
  /** Read the model planner at each call instead, for a brain that loads or changes later. */
  getModel?: () => ChatEngine | PlanFn | null;
  /** True while the model is still loading; the chain steps down with reason "loading". */
  loading?: () => boolean;
  scripted?: ChatEngine | PlanFn | null;
  reflex?: Reflex | null;
  /** Model calls before the model tier drops for invalid plans. Default 3. */
  tries?: number;
  maxActions?: number;
  maxTokens?: number;
  temperature?: number;
  now?: () => number;
  /** Drops kept in `log`. Default 50. */
  keep?: number;
  onDrop?: (d: Drop) => void;
}

/** Plans a request down the tiers, keeping a log of every drop. */
export interface PlannerChain {
  plan(req: ChainRequest): Promise<ChainResult | null>;
  /** Every drop so far, oldest first. */
  readonly log: readonly Drop[];
  /** The last result, or null when no tier planned. */
  readonly last: ChainResult | null;
  /** The drops of the last call. */
  readonly lastDrops: readonly Drop[];
  clear(): void;
}

const isEngine = (x: unknown): x is ChatEngine => !!x && typeof x === "object" && typeof (x as ChatEngine).stream === "function";

/** A plan counts when it parsed as an object and holds a known step or something to say; an empty object does not. */
export function validPlan(p: Plan): boolean {
  return p.from === "json" && (p.do.length > 0 || p.say.trim().length > 0);
}

const TIER_WORD: Record<Tier, string> = { model: "the brain", scripted: "the scripted planner", reflex: "reflexes" };

/** One lowercase line for the inspector or the room's status strip. */
export function dropLine(d: Drop): string {
  const who = TIER_WORD[d.from];
  const next = d.to ? ` ${TIER_WORD[d.to]} took over.` : " nothing was left to plan.";
  const why: Record<DropReason, string> = {
    absent: d.from === "model" ? "no brain loaded." : `${who} is not set up.`,
    loading: `${who} is still loading.`,
    error: `${who} failed: ${d.detail}.`,
    invalid: `${who} returned no valid plan ${d.tries === 1 ? "once" : d.tries === 2 ? "twice" : d.tries === 3 ? "three times" : `${d.tries} times`}.`,
    "no-answer": `${who} had no answer for that.`,
    aborted: `${who} was stopped.`,
    "no-match": `${who} had no rule for that.`,
  };
  return `${why[d.reason].replace(/\.\.$/, ".")}${next}`;
}

/** Make a planner chain that tries the model planner, then the scripted planner, then the reflex brain. */
export function createPlannerChain(o: ChainOptions): PlannerChain {
  const log: Drop[] = [];
  let last: ChainResult | null = null;
  let lastDrops: Drop[] = [];
  const now = () => (o.now ? o.now() : Date.now());
  const maxA = o.maxActions ?? 3;

  const modelOf = (): ChatEngine | PlanFn | null => (o.getModel ? o.getModel() : (o.model ?? null));

  async function ask(src: ChatEngine | PlanFn, req: ChainRequest): Promise<{ plan: Plan; raw: string }> {
    if (!isEngine(src)) {
      const r = await src(req);
      if (r === null) return { plan: { think: "", say: "", do: [], done: false, from: "text", unknown: [] }, raw: "" };
      if (typeof r === "string") return { plan: parsePlan(r, o.tools, maxA), raw: r };
      return { plan: r, raw: JSON.stringify(r) };
    }
    const messages = req.messages ?? [{ role: "user", content: req.text }];
    const r = await src.complete(messages, {
      schema: planSchema(o.tools, maxA),
      fallbackSchemas: [loosePlanSchema(maxA)],
      maxTokens: o.maxTokens ?? 320,
      ...(o.temperature !== undefined ? { temperature: o.temperature } : {}),
      ...(req.signal ? { signal: req.signal } : {}),
      think: "drop",
    });
    return { plan: parsePlan(r.text, o.tools, maxA), raw: r.text };
  }

  return {
    get log() {
      return log;
    },
    get last() {
      return last;
    },
    get lastDrops() {
      return lastDrops;
    },
    clear() {
      log.length = 0;
      last = null;
      lastDrops = [];
    },
    async plan(req) {
      const drops: Drop[] = [];
      const drop = (from: Tier, reason: DropReason, detail: string, tries: number, raw?: string) => {
        const i = TIERS.indexOf(from);
        const d: Drop = { from, to: TIERS[i + 1] ?? null, reason, detail, tries, at: now(), ...(raw !== undefined ? { raw } : {}) };
        drops.push(d);
        log.push(d);
        if (log.length > (o.keep ?? 50)) log.shift();
        o.onDrop?.(d);
      };
      const finish = (r: ChainResult | null) => {
        // `to` names the next tier that was actually tried (absent ones are passed over), or null
        for (let i = 0; i < drops.length; i++) {
          const next = drops.slice(i + 1).find((d) => d.reason !== "absent");
          drops[i]!.to = next ? next.from : (r?.tier ?? null);
        }
        lastDrops = drops;
        last = r;
        return r;
      };

      for (const tier of ["model", "scripted"] as const) {
        if (req.signal?.aborted) {
          drop(tier, "aborted", "the request was cancelled", 0);
          return finish(null);
        }
        if (tier === "model" && o.loading?.()) {
          drop(tier, "loading", "still loading", 0);
          continue;
        }
        const src = tier === "model" ? modelOf() : (o.scripted ?? null);
        if (!src) {
          drop(tier, "absent", "not set up", 0);
          continue;
        }
        const tries = tier === "model" ? Math.max(1, o.tries ?? 3) : 1;
        let raw = "";
        let n = 0;
        let failed: string | null = null;
        let answered = false;
        for (; n < tries; ) {
          n++;
          try {
            const r = await ask(src, req);
            raw = r.raw;
            if (raw.trim()) answered = true;
            if (validPlan(r.plan)) return finish({ plan: r.plan, tier, raw, drops });
          } catch (e) {
            if (req.signal?.aborted) {
              drop(tier, "aborted", "the request was cancelled", n, raw);
              return finish(null);
            }
            failed = e instanceof Error ? e.message : String(e);
            break;
          }
        }
        if (failed !== null) drop(tier, "error", failed, n, raw);
        else if (!answered) drop(tier, "no-answer", `${n} ${n === 1 ? "call" : "calls"} returned nothing`, n, raw);
        else drop(tier, "invalid", `${n} replies held no valid plan`, n, raw);
      }

      if (!o.reflex) {
        drop("reflex", "absent", "not set up", 0);
        return finish(null);
      }
      const r = o.reflex.parse(req.text);
      if (!r) {
        drop("reflex", "no-match", "no rule matched", 0);
        return finish(null);
      }
      return finish({ plan: { think: "", say: "", do: r.steps, done: true, from: "json", unknown: [] }, tier: "reflex", raw: "", drops });
    },
  };
}

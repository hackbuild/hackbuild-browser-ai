/**
 * The tool surface the model and the reflex brain share. Each tool has a
 * JSON Schema for its arguments; the model writes arguments positionally
 * (`["pick_up", "red mug"]`) and they map onto the schema's properties in
 * order. Expected failures throw ToolError with a first person sentence,
 * because that sentence is what the model reads next step.
 */

import type { JsonSchema, ToolSpec } from "@hackbuild/chat";

/** One action: a tool name and its positional arguments. */
export interface Step {
  tool: string;
  args: string[];
}

/** What a tool's `run` receives besides its arguments: the turn's abort signal and the text heard. */
export interface ToolContext {
  signal: AbortSignal;
  /** Text the agent heard this turn, if any. */
  heard: string | null;
}

/** A tool the agent can call: name, description, an argument schema and `run`. */
export interface Tool {
  name: string;
  description: string;
  /** Object schema; properties in order are the positional arguments. */
  parameters?: JsonSchema;
  /** The object the step acts on, for goal skip lists. Default: the first argument. */
  target?(args: string[]): string | null;
  run(args: string[], ctx: ToolContext): Promise<string | void> | string | void;
}

/** A failure written for the model, in first person: "that is 1.4 m away. i walk closer first." */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolError";
  }
}

/** The result of one step: the step, whether it worked, and the text the model reads next. */
export interface StepResult {
  step: Step;
  ok: boolean;
  /** What the tool returned, or the sentence the model reads on failure. */
  text: string;
}

/** The agent's tools by name, with prompt lines, chat tool specs, argument checks and a runner. */
export interface Registry {
  readonly names: string[];
  get(name: string): Tool | undefined;
  /** Lines for the system prompt: `name(arg, arg): description`. */
  describe(): string;
  /** chat ToolSpec list, for native tool runtimes. */
  specs(): ToolSpec[];
  /** Check a step against its schema; returns the first person complaint or null. */
  check(step: Step): string | null;
  run(step: Step, ctx: ToolContext): Promise<StepResult>;
}

interface Prop {
  name: string;
  type?: string;
  enum?: string[];
}

function propsOf(t: Tool): { props: Prop[]; required: number } {
  const p = (t.parameters ?? {}) as { properties?: Record<string, { type?: string; enum?: unknown[] }>; required?: string[] };
  const props = Object.entries(p.properties ?? {}).map(([name, s]) => {
    const out: Prop = { name };
    if (s.type) out.type = s.type;
    if (Array.isArray(s.enum)) out.enum = s.enum.map(String);
    return out;
  });
  const req = new Set(p.required ?? []);
  let required = 0;
  props.forEach((x, i) => {
    if (req.has(x.name)) required = i + 1;
  });
  return { props, required };
}

/** Make a registry over a list of tools. */
export function createRegistry(tools: readonly Tool[]): Registry {
  const map = new Map(tools.map((t) => [t.name, t]));
  const reg: Registry = {
    names: tools.map((t) => t.name),
    get: (n) => map.get(n),
    describe() {
      return tools
        .map((t) => {
          const { props } = propsOf(t);
          const args = props.map((p) => (p.enum ? `${p.name}: ${p.enum.join(" | ")}` : p.name)).join(", ");
          return `- ${t.name}(${args}): ${t.description}`;
        })
        .join("\n");
    },
    specs: () => tools.map((t) => ({ name: t.name, description: t.description, parameters: t.parameters ?? { type: "object", properties: {} } })),
    check(step) {
      const t = map.get(step.tool);
      if (!t) return `i do not know how to ${step.tool.replace(/_/g, " ")}. i can: ${reg.names.join(", ")}.`;
      const { props, required } = propsOf(t);
      if (step.args.length < required) return `${t.name} needs ${props.slice(0, required).map((p) => p.name).join(" and ")}; i was given ${step.args.length ? step.args.join(", ") : "nothing"}.`;
      for (let i = 0; i < Math.min(props.length, step.args.length); i++) {
        const p = props[i]!;
        const a = step.args[i]!;
        if (p.enum && !p.enum.some((e) => e.toLowerCase() === a.toLowerCase())) return `i cannot ${t.name.replace(/_/g, " ")} ${a}: ${p.name} is one of ${p.enum.join(", ")}.`;
        if (p.type === "number" && !Number.isFinite(Number(a))) return `${p.name} for ${t.name} is a number; i was given ${a}.`;
      }
      return null;
    },
    async run(step, ctx) {
      const bad = reg.check(step);
      if (bad) return { step, ok: false, text: bad };
      try {
        const r = await map.get(step.tool)!.run(step.args, ctx);
        return { step, ok: true, text: typeof r === "string" && r ? r : "done" };
      } catch (e) {
        if (e instanceof ToolError) return { step, ok: false, text: e.message };
        if (ctx.signal.aborted) return { step, ok: false, text: "i was stopped." };
        return { step, ok: false, text: `${step.tool} failed: ${e instanceof Error ? e.message : String(e)}` };
      }
    },
  };
  return reg;
}

/** A step as one line of text: the tool name and its arguments. */
export const stepText = (s: Step): string => (s.args.length ? `${s.tool} ${s.args.join(", ")}` : s.tool);

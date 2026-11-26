/**
 * The model's turn contract: `{"think", "say", "do": [["tool", "arg"]], "done"}`.
 * Asked for with a JSON Schema (tool names as an enum, `do` capped at 3
 * items of 1 to 3 strings), then a looser schema with any strings, then
 * free text read by a tolerant parser. The parser accepts `do` or
 * `actions`, items as arrays, `{tool|name|action, args|arguments|parameters}`
 * objects or `"tool(a, b)"` strings, keeps known tools only and at most
 * `maxActions`; when nothing parses, the text becomes `say` with done set.
 */

import { stripThink, type JsonSchema } from "@hackbuild/chat";
import { parseLooseJSON } from "@hackbuild/structured";
import type { Step } from "./tools.js";

/** A parsed model turn: think, say, the steps to run, done, where it came from and the tools dropped as unknown. */
export interface Plan {
  think: string;
  say: string;
  do: Step[];
  done: boolean;
  /** "json" when an object parsed, "text" when the reply was taken as speech. */
  from: "json" | "text";
  /** Steps dropped because the tool is unknown. */
  unknown: string[];
}

/** The JSON Schema of the turn contract, with tool names as an enum and `do` capped at `maxActions` steps. */
export function planSchema(tools: readonly string[], maxActions = 3): JsonSchema {
  return {
    type: "object",
    properties: {
      think: { type: "string" },
      say: { type: "string" },
      do: {
        type: "array",
        maxItems: maxActions,
        items: { type: "array", minItems: 1, maxItems: 3, prefixItems: [{ type: "string", enum: [...tools] }], items: { type: "string" } },
      },
      done: { type: "boolean" },
    },
    required: ["say", "do", "done"],
  };
}

/** The looser schema: any strings in `do`, for runtimes that refuse enums or prefixItems. */
export function loosePlanSchema(maxActions = 3): JsonSchema {
  return {
    type: "object",
    properties: {
      think: { type: "string" },
      say: { type: "string" },
      do: { type: "array", maxItems: maxActions, items: { type: "array", items: { type: "string" } } },
      done: { type: "boolean" },
    },
    required: ["say", "do"],
  };
}

const str = (x: unknown): string => (typeof x === "string" ? x : typeof x === "number" || typeof x === "boolean" ? String(x) : "");

function argList(a: unknown): string[] {
  if (Array.isArray(a)) return a.map(str).filter((s) => s !== "");
  if (a && typeof a === "object") return Object.values(a as Record<string, unknown>).map(str).filter((s) => s !== "");
  const s = str(a).trim();
  return s ? [s] : [];
}

function stepOf(item: unknown): Step | null {
  if (Array.isArray(item)) {
    const [t, ...rest] = item;
    const tool = str(t).trim();
    return tool ? { tool, args: rest.flatMap(argList) } : null;
  }
  if (item && typeof item === "object") {
    const o = item as Record<string, unknown>;
    const tool = str(o.tool ?? o.name ?? o.action ?? o.function).trim();
    if (!tool) return null;
    return { tool, args: argList(o.args ?? o.arguments ?? o.parameters ?? o.arg ?? o.target ?? []) };
  }
  const s = str(item).trim();
  if (!s) return null;
  const m = /^([\w.][\w. -]*?)\s*\((.*)\)\s*$/s.exec(s);
  if (m) return { tool: m[1]!, args: m[2]!.split(",").map((x) => x.trim().replace(/^["']|["']$/g, "")).filter(Boolean) };
  const [tool, ...rest] = s.split(/\s+/);
  return { tool: tool!, args: rest.length ? [rest.join(" ")] : [] };
}

const canon = (s: string) => s.toLowerCase().replace(/[\s-]+/g, "_");

/** Parse a model reply into a `Plan`, tolerating drifted shapes; text that does not parse becomes `say` with done set. */
export function parsePlan(raw: string, tools: readonly string[], maxActions = 4): Plan {
  const known = new Map(tools.map((t) => [canon(t), t]));
  const v = parseLooseJSON(raw);
  if (!v || typeof v !== "object" || Array.isArray(v)) {
    const say = stripThink(raw).replace(/```[\s\S]*?```/g, "").trim();
    return { think: "", say, do: [], done: true, from: "text", unknown: [] };
  }
  const o = v as Record<string, unknown>;
  const list = o.do ?? o.actions ?? o.plan ?? o.steps ?? o.action ?? [];
  let items: unknown[] = Array.isArray(list) ? list : [list];
  // a single step written flat: ["pick_up", "mug"]
  const flat = items.length > 1 && items.every((x) => typeof x === "string" && !x.includes("("));
  if (flat && known.has(canon(items[0] as string)) && !known.has(canon(items[1] as string))) items = [items];
  const steps: Step[] = [];
  const unknown: string[] = [];
  for (const it of items as unknown[]) {
    const s = stepOf(it);
    if (!s) continue;
    const name = known.get(canon(s.tool));
    if (!name) unknown.push(s.tool);
    else if (steps.length < maxActions) steps.push({ tool: name, args: s.args });
  }
  const say = str(o.say ?? o.speak ?? o.reply ?? o.message ?? o.response).trim();
  const done = typeof o.done === "boolean" ? o.done : steps.length === 0;
  return { think: str(o.think ?? o.thought ?? o.reasoning).trim(), say, do: steps, done, from: "json", unknown };
}

/**
 * Pulls the `say` string out of a JSON reply while it streams, so speech
 * starts before the object closes. `push(chunk)` returns the newly readable
 * part of the say text (escapes decoded).
 */
export class SayStream {
  private buf = "";
  private pos = -1;
  private ended = false;
  private esc = false;
  private uni = "";
  push(chunk: string): string {
    if (this.ended) return "";
    this.buf += chunk;
    if (this.pos < 0) {
      const m = /"(?:say|speak|reply)"\s*:\s*"/.exec(this.buf);
      if (!m) return "";
      this.pos = m.index + m[0].length;
    }
    let out = "";
    while (this.pos < this.buf.length) {
      const ch = this.buf[this.pos]!;
      if (this.uni) {
        this.uni += ch;
        this.pos++;
        if (this.uni.length === 5) {
          out += String.fromCharCode(parseInt(this.uni.slice(1), 16));
          this.uni = "";
        }
        continue;
      }
      if (this.esc) {
        this.esc = false;
        this.pos++;
        if (ch === "u") this.uni = "u";
        else out += ch === "n" ? "\n" : ch === "t" ? "\t" : ch === "r" ? "" : ch;
        continue;
      }
      if (ch === "\\") {
        this.esc = true;
        this.pos++;
        continue;
      }
      if (ch === '"') {
        this.ended = true;
        break;
      }
      out += ch;
      this.pos++;
    }
    return out;
  }
  get closed(): boolean {
    return this.ended;
  }
}

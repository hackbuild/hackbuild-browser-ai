/**
 * Schemas for grammar constrained decoding. XGrammar (WebLLM) and
 * llama.cpp grammars refuse some JSON Schema keywords, so the sanitizer
 * strips them recursively. The agent
 * schema is a root anyOf with one strict variant per tool plus a
 * respond_to_user pseudo tool; the loose schema allows any tool name and
 * any arguments object, for runtimes that cannot compile the strict one.
 */

import type { JsonSchema, ToolSpec } from "@hackbuild/chat";

/** The JSON Schema keywords `sanitizeSchema` removes, because grammar compilers refuse them. */
export const STRIPPED_KEYWORDS = [
  "minItems",
  "maxItems",
  "multipleOf",
  "$schema",
  "$id",
  "examples",
  "default",
  "title",
  "minLength",
  "maxLength",
  "pattern",
] as const;

/** The name of the pseudo tool a model calls to answer the user in words. */
export const RESPOND = "respond_to_user";

/** Copy a schema without the keywords grammar compilers refuse, keeping property names, and add a root `type: "object"` when the root has no type. */
export function sanitizeSchema(schema: JsonSchema, opts: { strip?: readonly string[] } = {}): JsonSchema {
  const strip = new Set(opts.strip ?? STRIPPED_KEYWORDS);
  const walk = (v: unknown, key: string | null): unknown => {
    if (Array.isArray(v)) return v.map((x) => walk(x, null));
    if (!v || typeof v !== "object") return v;
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
      // under "properties" every key is a property name, not a keyword
      if (key !== "properties" && strip.has(k)) continue;
      out[k] = walk(x, k);
    }
    return out;
  };
  const out = walk(schema, null) as JsonSchema;
  if (!("type" in out) && !("anyOf" in out) && !("oneOf" in out) && !("$ref" in out)) out.type = "object";
  return out;
}

/** Whether the agent schemas add the `respond_to_user` pseudo tool and ask for a thought first. */
export interface AgentSchemaOptions {
  /** Add the respond_to_user pseudo tool. Default true. */
  respond?: boolean;
  /** Ask for a short thought first. Default true. */
  thought?: boolean;
}

function respondTool(): ToolSpec {
  return {
    name: RESPOND,
    description: "Reply to the user in plain words.",
    parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"] },
  };
}

/** The tool list with `respond_to_user` added at the end, unless it is there already or `on` is false. */
export function withRespond(tools: readonly ToolSpec[], on = true): ToolSpec[] {
  return on && !tools.some((t) => t.name === RESPOND) ? [...tools, respondTool()] : [...tools];
}

/** Root anyOf, one variant per tool: { thought, tool_call: { name: enum[one], arguments } }. */
export function buildAgentSchema(tools: readonly ToolSpec[], o: AgentSchemaOptions = {}): JsonSchema {
  const all = withRespond(tools, o.respond !== false);
  const thought = o.thought !== false;
  return sanitizeSchema({
    anyOf: all.map((t) => ({
      type: "object",
      properties: {
        ...(thought ? { thought: { type: "string" } } : {}),
        tool_call: {
          type: "object",
          properties: { name: { type: "string", enum: [t.name] }, arguments: t.parameters },
          required: ["name", "arguments"],
        },
      },
      required: thought ? ["thought", "tool_call"] : ["tool_call"],
    })),
  });
}

/** One variant with an enum over every tool name and arguments of any object. */
export function buildLooseAgentSchema(tools: readonly ToolSpec[], o: AgentSchemaOptions = {}): JsonSchema {
  const all = withRespond(tools, o.respond !== false);
  const thought = o.thought !== false;
  return {
    type: "object",
    properties: {
      ...(thought ? { thought: { type: "string" } } : {}),
      tool_call: {
        type: "object",
        properties: { name: { type: "string", enum: all.map((t) => t.name) }, arguments: { type: "object" } },
        required: ["name", "arguments"],
      },
    },
    required: thought ? ["thought", "tool_call"] : ["tool_call"],
  };
}

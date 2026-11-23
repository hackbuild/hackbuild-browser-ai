/**
 * One tool decision from a chat engine, in the mode that suits the runtime:
 *
 *   constrained  grammar constrained JSON with a strict per tool anyOf, then the
 *                loose schema, then free text parsed tolerantly (as earlier builds did)
 *   prompt       Hermes and Qwen `<tool_call>{...}</tool_call>` prompt format
 *   native       the runtime's own tools (WebLLM Hermes builds, remote APIs)
 *   tags         `[tool: argument]` inline in prose (BonziBuddy style tool grammar)
 *   lines        THOUGHT: / ACTION: lines (as earlier builds did), good for code and multi line values
 *
 * "auto" picks constrained when the engine takes schemas, native when the
 * quirks say so, prompt for tool call tag models, else lines. Whatever the
 * mode, a reply with no tool becomes respond_to_user with the text.
 */

import { stripThink, type ChatEngine, type ChatMessage, type JsonSchema, type StreamOptions, type ToolSpec } from "@hackbuild/chat";
import type { Guards, StopReason } from "./guards.js";
import { parseLooseJSON, parseToolDecision } from "./json.js";
import { parseAction, parseLines } from "./lines.js";
import { buildAgentSchema, buildLooseAgentSchema, RESPOND } from "./schema.js";
import { createTagParser } from "./tags.js";

export type Mode = "constrained" | "prompt" | "native" | "tags" | "lines";

export interface CallQuirks {
  nativeTools?: boolean;
  toolCallTags?: boolean;
  maxTokensAction?: number;
}

export interface CallOptions {
  tools: readonly ToolSpec[];
  mode?: Mode | "auto";
  quirks?: CallQuirks;
  guards?: Guards;
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
  /** Add the respond_to_user pseudo tool. Default true. */
  respond?: boolean;
}

export interface Decision {
  mode: Mode;
  thought: string;
  /** The tool to run; respond_to_user carries { message }. null when nothing usable came back. */
  tool: { name: string; args: Record<string, unknown> } | null;
  /** Text meant for the user (respond_to_user message, or prose around tags). */
  say: string;
  raw: string;
  /** "loose" when the strict schema was refused, "text" when free text was parsed. */
  fallback: "none" | "loose" | "text";
  /** A guard that tripped on this call. */
  stop: StopReason | null;
}

export function pickMode(chat: ChatEngine, q: CallQuirks = {}): Mode {
  if (q.nativeTools && chat.caps.tools) return "native";
  if (chat.caps.schema) return "constrained";
  if (q.toolCallTags) return "prompt";
  return "lines";
}

function describeTools(tools: readonly ToolSpec[]): string {
  return tools.map((t) => `- ${t.name}: ${t.description ?? ""} arguments ${JSON.stringify(t.parameters)}`).join("\n");
}

function withSystem(msgs: readonly ChatMessage[], text: string): ChatMessage[] {
  const out = msgs.map((m) => ({ ...m }));
  const sys = out.find((m) => m.role === "system");
  if (sys) sys.content = `${sys.content}\n\n${text}`;
  else out.unshift({ role: "system", content: text });
  return out;
}

export function hermesToolPrompt(tools: readonly ToolSpec[]): string {
  const list = tools.map((t) => ({ type: "function", function: { name: t.name, description: t.description ?? "", parameters: t.parameters } }));
  return [
    "You may call one function to help with the request. The functions are inside <tools></tools>:",
    `<tools>${JSON.stringify(list)}</tools>`,
    'To call a function, reply with <tool_call>{"name": <function name>, "arguments": <arguments object>}</tool_call> and nothing else.',
    "To answer the user directly, reply in plain words with no tool_call.",
  ].join("\n");
}

const LINES_PROMPT = (tools: readonly ToolSpec[]) =>
  [
    "Reply in this format and nothing else:",
    "THOUGHT: one short sentence",
    "ACTION: tool_name(argument, argument)",
    "Leave out the ACTION line to answer the user; then write the answer after THOUGHT on a line starting ANSWER:",
    "Tools:",
    describeTools(tools),
  ].join("\n");

const TAGS_PROMPT = (tools: readonly ToolSpec[]) =>
  [`To act, write [tool: argument] inside your reply, for example [${tools[0]?.name ?? "look"}: mug]. Tools:`, describeTools(tools)].join("\n");

function firstArgName(t: ToolSpec | undefined): string {
  const props = (t?.parameters as { properties?: Record<string, unknown>; required?: string[] } | undefined) ?? {};
  return props.required?.[0] ?? Object.keys(props.properties ?? {})[0] ?? "value";
}

function argsFromPositional(t: ToolSpec | undefined, args: string[]): Record<string, unknown> {
  const props = (t?.parameters as { properties?: Record<string, unknown> } | undefined)?.properties ?? {};
  const names = Object.keys(props);
  if (!names.length) return args.length ? { value: args.join(", ") } : {};
  const out: Record<string, unknown> = {};
  args.forEach((a, i) => {
    const n = names[i];
    if (n) out[n] = a;
  });
  return out;
}

export async function call(chat: ChatEngine, messages: readonly ChatMessage[], o: CallOptions): Promise<Decision> {
  const respond = o.respond !== false;
  const mode: Mode = !o.mode || o.mode === "auto" ? pickMode(chat, o.quirks) : o.mode;
  const known = o.tools.map((t) => t.name);
  const byName = (n: string) => o.tools.find((t) => t.name === n);
  const base: StreamOptions = { maxTokens: o.maxTokens ?? o.quirks?.maxTokensAction ?? 512 };
  if (o.temperature !== undefined) base.temperature = o.temperature;
  if (o.signal) base.signal = o.signal;

  const finish = (d: Omit<Decision, "stop" | "mode">): Decision => {
    let stop: StopReason | null = null;
    if (o.guards) {
      if (!d.tool) stop = o.guards.parseFail();
      else if (d.tool.name === RESPOND) stop = o.guards.reply(String(d.tool.args.message ?? ""));
      else stop = o.guards.call(d.tool.name, d.tool.args);
    }
    return { ...d, mode, stop };
  };
  const respondWith = (text: string) => (respond ? { name: RESPOND, args: { message: text } } : null);

  if (mode === "constrained") {
    const strict: JsonSchema = buildAgentSchema(o.tools, { respond });
    const loose: JsonSchema = buildLooseAgentSchema(o.tools, { respond });
    const r = await chat.complete(messages, { ...base, schema: strict, fallbackSchemas: [loose] });
    const fallback = r.schemaIndex === 1 ? "loose" : r.schemaIndex === -1 ? "text" : "none";
    const d = parseToolDecision(r.text);
    if (d && (known.includes(d.name) || d.name === RESPOND)) {
      return finish({ thought: d.thought, tool: { name: d.name, args: d.args }, say: d.name === RESPOND ? String(d.args.message ?? "") : "", raw: r.text, fallback });
    }
    const v = parseLooseJSON(r.text) as Record<string, unknown> | null;
    const say = v && typeof v.say === "string" ? v.say : fallback === "text" && !v ? stripThink(r.text) : "";
    return finish({ thought: "", tool: say ? respondWith(say) : null, say, raw: r.text, fallback });
  }

  if (mode === "native") {
    const r = await chat.complete(messages, { ...base, tools: [...o.tools] });
    const c = r.toolCalls[0];
    if (c) {
      const d = parseToolDecision({ name: c.name, arguments: c.arguments });
      if (d && known.includes(d.name)) return finish({ thought: "", tool: { name: d.name, args: d.args }, say: r.text, raw: r.text, fallback: "none" });
    }
    return finish({ thought: "", tool: r.text.trim() ? respondWith(r.text.trim()) : null, say: r.text.trim(), raw: r.text, fallback: "none" });
  }

  if (mode === "prompt") {
    const r = await chat.complete(withSystem(messages, hermesToolPrompt(o.tools)), base);
    const m = /<tool_call>\s*([\s\S]*?)(?:<\/tool_call>|$)/.exec(r.text);
    if (m) {
      const d = parseToolDecision(m[1]!);
      if (d && known.includes(d.name)) return finish({ thought: "", tool: { name: d.name, args: d.args }, say: "", raw: r.text, fallback: "none" });
      return finish({ thought: "", tool: null, say: "", raw: r.text, fallback: "none" });
    }
    const text = r.text.trim();
    return finish({ thought: "", tool: text ? respondWith(text) : null, say: text, raw: r.text, fallback: "none" });
  }

  if (mode === "tags") {
    const r = await chat.complete(withSystem(messages, TAGS_PROMPT(o.tools)), base);
    const parser = createTagParser({ keys: Object.fromEntries(known.map((k) => [k, null])), plain: false });
    const p = parser.parse(r.text);
    const t = p.tags[0];
    if (t) {
      const spec = byName(t.key);
      return finish({ thought: "", tool: { name: t.key, args: { [firstArgName(spec)]: t.value } }, say: p.text, raw: r.text, fallback: "none" });
    }
    return finish({ thought: "", tool: p.text ? respondWith(p.text) : null, say: p.text, raw: r.text, fallback: "none" });
  }

  // lines: stop once the action line is complete
  const r = await chat.complete(withSystem(messages, LINES_PROMPT(o.tools)), { ...base, stop: ["\nTHOUGHT:", "\nOBSERVATION:"] });
  const v = parseLines(r.text, { tags: ["THOUGHT", "ACTION", "ANSWER"] });
  if (v.ACTION) {
    const a = parseAction(v.ACTION, known);
    if (a) return finish({ thought: v.THOUGHT ?? "", tool: { name: a.name, args: argsFromPositional(byName(a.name), a.args) }, say: "", raw: r.text, fallback: "none" });
    return finish({ thought: v.THOUGHT ?? "", tool: null, say: "", raw: r.text, fallback: "none" });
  }
  const answer = (v.ANSWER ?? (Object.keys(v).length ? "" : stripThink(r.text))).trim();
  return finish({ thought: v.THOUGHT ?? "", tool: answer ? respondWith(answer) : null, say: answer, raw: r.text, fallback: "none" });
}

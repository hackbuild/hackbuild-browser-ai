/**
 * Getting JSON back from small models: strip think blocks and fences,
 * repair trailing commas and unclosed strings or brackets, and when that
 * fails take the largest object that parses, scanning closing braces from
 * the end.
 */

import { stripThink } from "@hackbuild/chat";

function stripFences(s: string): string {
  const m = /```(?:json|JSON)?\s*\n?([\s\S]*?)(?:```|$)/.exec(s);
  return m ? m[1]! : s;
}

/** Close what the model left open and drop trailing commas. Returns text that may parse. */
export function repairJSON(raw: string): string {
  let s = stripFences(stripThink(raw)).trim();
  const start = s.search(/[{[]/);
  if (start > 0) s = s.slice(start);
  let out = "";
  const stack: string[] = [];
  let inStr = false;
  let esc = false;
  for (const ch of s) {
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      else if (ch === "\n") {
        out += "\\n";
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (stack[stack.length - 1] === ch) stack.pop();
      else continue;
      if (!stack.length) {
        out += ch;
        break;
      }
    }
    out += ch;
  }
  if (inStr) out += '"';
  out = out.replace(/,\s*$/, "");
  while (stack.length) {
    out = out.replace(/,\s*$/, "").replace(/:\s*$/, ": null");
    out += stack.pop();
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/**
 * Balanced `{...}` spans in one pass, skipping braces inside double quoted
 * strings. Each span is [start, end] inclusive.
 */
function braceSpans(text: string): [number, number][] {
  const spans: [number, number][] = [];
  const open: number[] = [];
  let inStr = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === '"') inStr = false;
    } else if (ch === '"' && open.length) inStr = true;
    else if (ch === "{") open.push(i);
    else if (ch === "}" && open.length) spans.push([open.pop()!, i]);
  }
  return spans;
}

/** Span parse attempts per call, so a long code reply stays fast. */
const MAX_ATTEMPTS = 64;

/**
 * Parse after repair; then the balanced `{...}` spans, the one that ends
 * last and starts first tried first, at most 64 of them. null when nothing
 * parses.
 */
export function parseLooseJSON(raw: string): unknown {
  const text = stripFences(stripThink(raw));
  try {
    return JSON.parse(text.trim());
  } catch {
    /* repair next */
  }
  try {
    return JSON.parse(repairJSON(text));
  } catch {
    /* scan next */
  }
  const spans = braceSpans(text).sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  for (const [st, end] of spans.slice(0, MAX_ATTEMPTS)) {
    try {
      return JSON.parse(text.slice(st, end + 1));
    } catch {
      /* next span */
    }
  }
  return null;
}

/** A tool choice read from model JSON: the thought, the tool name and its arguments object. */
export interface ToolDecision {
  thought: string;
  name: string;
  args: Record<string, unknown>;
}

/**
 * Read `{ thought, tool_call: { name, arguments } }` and the shapes small
 * models drift to: arguments as a JSON string (double encoded), `tool` or
 * `action` for the name, `args` or `parameters` for the arguments, and a
 * flat `{ name, arguments }`.
 */
export function parseToolDecision(raw: string | unknown): ToolDecision | null {
  const v = typeof raw === "string" ? parseLooseJSON(raw) : raw;
  if (!v || typeof v !== "object") return null;
  const o = v as Record<string, unknown>;
  const call = (o.tool_call ?? o.toolCall ?? o.call ?? o) as Record<string, unknown>;
  if (!call || typeof call !== "object") return null;
  const name = call.name ?? call.tool ?? call.action ?? call.function;
  if (typeof name !== "string" || !name) return null;
  let args: unknown = call.arguments ?? call.args ?? call.parameters ?? call.input ?? {};
  for (let i = 0; i < 2 && typeof args === "string"; i++) {
    try {
      args = JSON.parse(args);
    } catch {
      args = { value: args };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) args = { value: args };
  const thought = typeof o.thought === "string" ? o.thought : typeof o.think === "string" ? o.think : "";
  return { thought, name, args: args as Record<string, unknown> };
}

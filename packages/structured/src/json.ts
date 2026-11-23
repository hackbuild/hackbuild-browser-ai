/**
 * Getting JSON back from small models: strip think blocks and fences,
 * repair trailing commas and unclosed strings or brackets (satchel
 * repairJSON), and when that fails take the largest object that parses,
 * scanning closing braces from the end (ARBOR tolerant parser).
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

/** Parse after repair; then the largest object found by scanning `}` from the end. null when nothing parses. */
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
  for (let end = text.lastIndexOf("}"); end >= 0; end = text.lastIndexOf("}", end - 1)) {
    for (let st = text.indexOf("{"); st >= 0 && st < end; st = text.indexOf("{", st + 1)) {
      try {
        return JSON.parse(text.slice(st, end + 1));
      } catch {
        /* keep scanning */
      }
    }
  }
  return null;
}

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

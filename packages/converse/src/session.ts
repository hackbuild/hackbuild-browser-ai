/**
 * The chat session schema: one versioned JSON shape for save, export and
 * import (`.hbchat.json`). Reading picks each known field by default and
 * drops the rest, so a file from an older or newer version, or a plain
 * `{ messages: [{ role, content }] }` export, still loads. Ids and times
 * come from the caller; nothing here reads a clock.
 */

import type { ChatMessage, ReplyStats, Role, ToolCall } from "./types.js";

/** The `kind` field of every chat session file. */
export const SESSION_KIND = "hackbuild.chat";
/** The session schema version this build writes and the newest it reads. */
export const SESSION_VERSION = 1;

/** One stored message: visible text, the raw reply, think text, error, stats, seen and recalled lines, cues and tool calls. */
export interface SessionMessage {
  id: string;
  role: Role;
  /** Visible text. */
  content: string;
  /** The reply as the model wrote it, tags and all; this is what goes back into history. */
  raw?: string;
  think?: string;
  /** The reply failed with this line; the message stays, flagged. */
  error?: string;
  stats?: ReplyStats;
  /** What the camera saw when the turn was sent. */
  seen?: string;
  /** Memories recalled for this turn, by id, so "memory used (n)" can link to them. */
  recalled?: { id: string; text: string }[];
  /** Cue marks recorded while the reply was spoken, for replay. */
  cues?: unknown;
  toolCalls?: ToolCall[];
  edited?: boolean;
  /** Time the message was made, in the caller's clock (ms). */
  at?: number;
}

/** A saved chat in the `.hbchat.json` shape: id, title, times, model, system text, settings and messages. */
export interface ChatSession {
  kind: typeof SESSION_KIND;
  version: typeof SESSION_VERSION;
  id: string;
  title: string;
  created: number;
  updated: number;
  model?: { id: string; provider?: string };
  system?: string;
  /** Sampling and context settings as they were set. */
  params?: Record<string, number | string | boolean>;
  messages: SessionMessage[];
}

/** The error a session read throws, with a lowercase reason such as `not a chat session: no messages list`. */
export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SessionError";
  }
}

const ROLES: readonly Role[] = ["system", "user", "assistant", "tool"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** Make an empty session with the id and time you give; the title defaults to `new chat`. */
export function createSession(o: { id: string; now: number; title?: string; system?: string; model?: { id: string; provider?: string } }): ChatSession {
  const s: ChatSession = { kind: SESSION_KIND, version: SESSION_VERSION, id: o.id, title: o.title ?? "new chat", created: o.now, updated: o.now, messages: [] };
  if (o.system !== undefined) s.system = o.system;
  if (o.model) s.model = { ...o.model };
  return s;
}

function readStats(v: unknown): ReplyStats | undefined {
  if (!isObj(v)) return undefined;
  const tokens = num(v.tokens);
  const totalMs = num(v.totalMs);
  if (tokens === undefined || totalMs === undefined) return undefined;
  return {
    tokens,
    tokensSource: v.tokensSource === "measured" ? "measured" : "inferred",
    tokensPerSecond: num(v.tokensPerSecond) ?? null,
    firstTokenMs: num(v.firstTokenMs) ?? null,
    totalMs,
  };
}

function readMessage(v: unknown, i: number): SessionMessage {
  if (!isObj(v)) throw new SessionError(`message ${i + 1} is not an object`);
  const role = v.role as Role;
  if (!ROLES.includes(role)) throw new SessionError(`message ${i + 1} has no known role`);
  const content = str(v.content) ?? str(v.text);
  if (content === undefined) throw new SessionError(`message ${i + 1} has no text`);
  const m: SessionMessage = { id: str(v.id) ?? `m${i + 1}`, role, content };
  for (const k of ["raw", "think", "error", "seen"] as const) {
    const s = str(v[k]);
    if (s !== undefined) m[k] = s;
  }
  const stats = readStats(v.stats);
  if (stats) m.stats = stats;
  if (Array.isArray(v.recalled)) m.recalled = v.recalled.filter(isObj).map((r) => ({ id: String(r.id ?? ""), text: String(r.text ?? "") }));
  if (v.cues !== undefined) m.cues = v.cues;
  if (Array.isArray(v.toolCalls)) {
    m.toolCalls = v.toolCalls.filter(isObj).map((t) => {
      const c: ToolCall = { name: String(t.name ?? ""), arguments: typeof t.arguments === "string" ? t.arguments : JSON.stringify(t.arguments ?? {}) };
      if (typeof t.id === "string") c.id = t.id;
      return c;
    });
  }
  if (v.edited === true) m.edited = true;
  const at = num(v.at);
  if (at !== undefined) m.at = at;
  return m;
}

/**
 * Bring any accepted shape to the current version: a versioned session,
 * or an unversioned export holding a `messages` array. Unknown fields are
 * dropped; a missing id, title or time is filled from `fill`.
 */
export function migrateSession(raw: unknown, fill: { id?: string; now?: number } = {}): ChatSession {
  if (!isObj(raw)) throw new SessionError("not a chat session: the file holds no object");
  const version = num(raw.version) ?? 0;
  if (version > SESSION_VERSION) throw new SessionError(`not a chat session this build reads: version ${version}, newest known ${SESSION_VERSION}`);
  if (raw.kind !== undefined && raw.kind !== SESSION_KIND) throw new SessionError(`not a chat session: kind ${String(raw.kind)}`);
  if (!Array.isArray(raw.messages)) throw new SessionError("not a chat session: no messages list");
  const now = fill.now ?? 0;
  const created = num(raw.created) ?? num(raw.exported) ?? now;
  const s = createSession({ id: str(raw.id) ?? fill.id ?? "imported", now: created, title: str(raw.title) ?? str(raw.name) ?? str(raw.characterName) ?? "imported chat" });
  s.updated = num(raw.updated) ?? created;
  const system = str(raw.system) ?? str(raw.systemPrompt);
  if (system !== undefined) s.system = system;
  const model = isObj(raw.model) ? str(raw.model.id) : str(raw.model);
  if (model) s.model = isObj(raw.model) && str(raw.model.provider) ? { id: model, provider: str(raw.model.provider)! } : { id: model };
  if (isObj(raw.params)) {
    const p: Record<string, number | string | boolean> = {};
    for (const [k, v] of Object.entries(raw.params)) if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") p[k] = v;
    s.params = p;
  }
  s.messages = raw.messages.map(readMessage);
  return s;
}

/** The session as `.hbchat.json` text. */
export function exportSession(s: ChatSession): string {
  return JSON.stringify(s, null, 2) + "\n";
}

/** Read `.hbchat.json` text (or a parsed object) into the current version. Throws SessionError with a lowercase reason. */
export function importSession(input: string | unknown, fill: { id?: string; now?: number } = {}): ChatSession {
  let raw = input;
  if (typeof input === "string") {
    try {
      raw = JSON.parse(input);
    } catch (e) {
      throw new SessionError(`not a chat session: the file is not json (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  return migrateSession(raw, fill);
}

/**
 * The messages to send an engine: the system text first, raw replies in
 * place of their stripped text, and failed or empty replies left out.
 */
export function sessionMessages(s: ChatSession): ChatMessage[] {
  const out: ChatMessage[] = [];
  if (s.system) out.push({ role: "system", content: s.system });
  for (const m of s.messages) {
    if (m.error !== undefined) continue;
    const content = m.role === "assistant" ? (m.raw ?? m.content) : m.content;
    if (m.role === "assistant" && !content.trim() && !m.toolCalls?.length) continue;
    const c: ChatMessage = { role: m.role, content };
    if (m.toolCalls?.length) c.toolCalls = m.toolCalls;
    out.push(c);
  }
  return out;
}

/** The session as markdown: a title line, then one section per message. */
export function sessionToMarkdown(s: ChatSession): string {
  const lines = [`# ${s.title}`, ""];
  if (s.model) lines.push(`model: ${s.model.id}`, "");
  if (s.system) lines.push("## system", "", s.system, "");
  for (const m of s.messages) {
    lines.push(`## ${m.role}`, "", m.content || (m.error ? `(failed: ${m.error})` : "(empty)"), "");
  }
  return lines.join("\n");
}

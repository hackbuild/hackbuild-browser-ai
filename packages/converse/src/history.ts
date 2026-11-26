/**
 * The request a turn sends: the session's messages after four history
 * rules, with memory and seen lines under the user turn they belong to.
 * The system text and its fixed notes do not change between turns, so a
 * runtime prefix cache keeps matching.
 */

import { RECALL_NOTE, withRecall } from "@hackbuild/memory";
import type { ChatSession, SessionMessage } from "./session.js";
import type { ChatMessage } from "./types.js";

/** The fixed line added to the system text when seen lines are on; it tells the model what `[seen]` lines mean. */
export const SEEN_NOTE = "Lines that start with [seen] under a user message say what the camera showed when the person wrote it. Use them when they fit.";
/** The tag in front of each recalled memory line under a user turn. */
export const MEMORY_TAG = "[memory]";
/** The tag in front of the camera line under a user turn. */
export const SEEN_TAG = "[seen]";
/** Small models copy replies with no letter or digit, so those stay out of history. */
const WORDY = /[\p{L}\p{N}]/u;

/** What `buildMessages` applies: a message cap, and whether memory and seen notes and lines go in. */
export interface HistoryOptions {
  /** Keep at most this many messages after the system text; never fewer than 2. Default all. */
  limit?: number;
  /** Add the memory note to the system text and recalled lines under their turns. */
  memory?: boolean;
  /** Add the seen note to the system text and seen lines under their turns. */
  seen?: boolean;
}

/** True for a message that goes back to the engine. */
export function kept(m: SessionMessage): boolean {
  if (m.error !== undefined) return false;
  if (m.role !== "assistant") return true;
  if (m.toolCalls?.length) return true;
  return WORDY.test(m.raw ?? m.content);
}

/**
 * The messages to send: failed, empty and wordless replies out, a leading
 * assistant greeting out, the raw tagged reply in place of the visible
 * one, the cap applied at a user turn, then the notes and lines.
 */
export function buildMessages(s: Pick<ChatSession, "system" | "messages">, o: HistoryOptions = {}): ChatMessage[] {
  let rows = s.messages.filter(kept);
  const firstUser = rows.findIndex((m) => m.role === "user");
  rows = firstUser < 0 ? [] : rows.slice(firstUser);
  if (o.limit !== undefined && rows.length > Math.max(2, o.limit)) {
    let start = rows.length - Math.max(2, o.limit);
    // reach back to the user turn a cut reply answers, so roles alternate
    while (start > 0 && rows[start]!.role !== "user") start--;
    rows = rows.slice(start);
  }
  const notes = [s.system ?? "", o.memory ? RECALL_NOTE : "", o.seen ? SEEN_NOTE : ""].filter(Boolean);
  const out: ChatMessage[] = notes.length ? [{ role: "system", content: notes.join("\n\n") }] : [];
  for (const m of rows) {
    let content = m.role === "assistant" ? (m.raw ?? m.content) : m.content;
    if (m.role === "user") {
      if (o.memory && m.recalled?.length) content = withRecall(content, m.recalled.map((r) => r.text), MEMORY_TAG);
      if (o.seen && m.seen) content = withRecall(content, [m.seen], SEEN_TAG);
    }
    const c: ChatMessage = { role: m.role, content };
    if (m.toolCalls?.length) c.toolCalls = m.toolCalls;
    out.push(c);
  }
  return out;
}

/**
 * The shapes the conversation core reads. They match `@hackbuild/chat`
 * structurally, so a `ChatEngine` passes as a `ConverseEngine` with no
 * import between the two packages.
 */

export type Role = "system" | "user" | "assistant" | "tool";

/** One tool call a model asked for: the tool name and its arguments as a JSON string. */
export interface ToolCall {
  name: string;
  /** Arguments as the model wrote them (a JSON string). */
  arguments: string;
  id?: string;
}

/** One message of a request: role, text, and the tool calls or tool result id when there are any. */
export interface ChatMessage {
  role: Role;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ToolCall[];
}

/** Timing of one reply, from the engine's clock. */
export interface ReplyStats {
  tokens: number;
  tokensSource: "measured" | "inferred";
  tokensPerSecond: number | null;
  firstTokenMs: number | null;
  totalMs: number;
}

/** What the engine yields: visible text and think text apart, tool calls, then the result. */
export type EngineEvent =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; calls: ToolCall[] }
  | { type: "done"; result: { text: string; finish: string; toolCalls?: ToolCall[]; stats?: ReplyStats } };

/** The engine a conversation streams from: a `stream` of events per request, and an optional `prewarm` that fills the prefix cache. */
export interface ConverseEngine {
  stream(messages: readonly ChatMessage[], opts?: { signal?: AbortSignal }): AsyncIterable<EngineEvent>;
  prewarm?(messages: readonly ChatMessage[], opts?: { signal?: AbortSignal }): Promise<boolean>;
}

/** A cue as `@hackbuild/act` records it for replay: the visible text offset, the kind and the name. */
export interface RecordedCue {
  at: number;
  kind: string;
  name: string;
}

/** The part of an `@hackbuild/act` Director the turn loop drives. */
export interface DirectorLike {
  begin(): void;
  /** Raw model text in, visible text of this chunk out. */
  feed(chunk: string): { text: string };
  finish(): { text: string };
  /** Speech reached this offset of the visible text; fires the cues due. */
  reached(offset: number): unknown;
  record(): { cues: RecordedCue[] };
}

/** The part of an `@hackbuild/speak` Speaker the turn loop drives. */
export interface SpeakerLike {
  /** Feed the visible reply so far; `final` closes the utterance. */
  feed(textSoFar: string, final?: boolean): unknown;
  stop(): void;
}

/** The timer pair the store debounces with; pass your own in tests. */
export interface Timers {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(h: unknown): void;
}

/** One streaming chat interface over every runtime. */

export type Role = "system" | "user" | "assistant" | "tool";

/** One turn of a conversation: a role, its text, and for tool turns the tool name, call id or calls. */
export interface ChatMessage {
  role: Role;
  content: string;
  /** Tool name for role "tool". */
  name?: string;
  /** For role "tool": the id of the call this result answers (OpenAI `tool_call_id`). */
  toolCallId?: string;
  /** For role "assistant": the tool calls the model made in this turn, echoed back to native tool APIs. */
  toolCalls?: ToolCall[];
}

/** JSON Schema as a plain object. */
export type JsonSchema = Record<string, unknown>;

/** A tool the model may call: its name, a description and a JSON Schema for its arguments. */
export interface ToolSpec {
  name: string;
  description?: string;
  parameters: JsonSchema;
}

/** A tool call the model made, with its arguments as the JSON string the model wrote. */
export interface ToolCall {
  name: string;
  /** Arguments as the model wrote them (a JSON string). */
  arguments: string;
  id?: string;
}

/** Options for one reply: sampling, stop strings, schema and fallbacks, tools, an abort signal and what to do with think blocks. */
export interface StreamOptions {
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  /** Cut the reply at the first of these strings. */
  stop?: string[];
  /** Ask for JSON matching this schema. Falls back to free text with the schema in the prompt when the runtime refuses it. */
  schema?: JsonSchema;
  /** Looser schemas tried in order when the runtime refuses `schema` before free text. */
  fallbackSchemas?: JsonSchema[];
  /** Native tools; only engines with caps.tools use them. */
  tools?: ToolSpec[];
  signal?: AbortSignal;
  /** Keep think blocks in `think` events (default) or drop them. Visible text never holds them. */
  think?: "emit" | "drop";
}

/** Why a reply ended. */
export type Finish = "stop" | "length" | "abort" | "tool" | "refusal" | "error";

/** What a driver yields. Drivers do not strip think tags; the engine does. */
export type DriverEvent =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; calls: ToolCall[] }
  | { type: "done"; finish: Finish; usage?: { input?: number; output?: number } };

/** The request an engine hands its driver after normalizing messages and options. */
export interface DriverRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  minP?: number;
  repetitionPenalty?: number;
  stop?: string[];
  schema?: JsonSchema;
  tools?: ToolSpec[];
  signal?: AbortSignal;
}

/** Timing of one reply, from the engine's clock. */
export interface ReplyStats {
  /** Output tokens: from the runtime's usage when it reports one, else one per streamed chunk. */
  tokens: number;
  /** "measured" when tokens came from the runtime's usage; "inferred" when counted from stream chunks. */
  tokensSource: "measured" | "inferred";
  /** Output tokens per second after the first token; null when the reply was empty or took no time. */
  tokensPerSecond: number | null;
  /** Time from the request to the first token, text or think; null for an empty reply. */
  firstTokenMs: number | null;
  /** Time from the request to the end of the reply. */
  totalMs: number;
}

/** What a runtime supports: constrained output, native tools, a system role and stop strings. */
export interface DriverCaps {
  /** Grammar or schema constrained output. */
  schema: boolean;
  tools: boolean;
  /** The runtime takes a system role (Gemma 3 templates do not). */
  systemRole: boolean;
  /** The runtime handles stop strings itself. The engine cuts too, either way. */
  stop: boolean;
}

/** A runtime adapter. Each optional runtime lives behind a subpath export. */
export interface Driver {
  readonly id: string;
  readonly provider: string;
  readonly caps: DriverCaps;
  stream(req: DriverRequest): AsyncIterable<DriverEvent>;
  /** Evaluate the prompt into the runtime's prefix cache with no output. Drivers with no prefix cache leave it out. */
  prewarm?(req: DriverRequest): Promise<void>;
  dispose?(): Promise<void> | void;
}

/** Events the engine yields to callers: visible text and think text are separate. */
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; calls: ToolCall[] }
  | { type: "done"; result: ChatResult };

/** A finished reply: visible text, think text, finish reason, tool calls, schema fallback state, usage and timing stats. */
export interface ChatResult {
  text: string;
  think: string;
  finish: Finish;
  toolCalls: ToolCall[];
  /** The schema was refused and the reply came as free text with the schema in the prompt. */
  schemaFallback: boolean;
  /** Index of the schema the runtime took: 0 for `schema`, 1 and up for `fallbackSchemas`, -1 for none. */
  schemaIndex: number;
  usage?: { input?: number; output?: number };
  stats: ReplyStats;
}

/** A chat engine over one runtime, with the same stream, complete, prewarm and dispose calls for every runtime. */
export interface ChatEngine {
  readonly id: string;
  readonly provider: string;
  readonly caps: DriverCaps;
  stream(messages: readonly ChatMessage[], opts?: StreamOptions): AsyncGenerator<ChatEvent, ChatResult>;
  complete(messages: readonly ChatMessage[], opts?: StreamOptions): Promise<ChatResult>;
  /**
   * Evaluate the system prompt and history before the first send, so the
   * first reply starts sooner. Resolves true when the driver ran it, false
   * when it has no prefix cache and nothing was called.
   */
  prewarm?(messages: readonly ChatMessage[], opts?: Pick<StreamOptions, "signal">): Promise<boolean>;
  dispose(): Promise<void>;
}

/** An error from a chat engine, with a `code` (schema, http, runtime, load, abort or unavailable) and the HTTP status when there is one. */
export class ChatError extends Error {
  readonly code: "schema" | "http" | "runtime" | "load" | "abort" | "unavailable";
  readonly status: number | undefined;
  constructor(code: ChatError["code"], message: string, status?: number) {
    super(message);
    this.name = "ChatError";
    this.code = code;
    this.status = status;
  }
}

/** One streaming chat interface over every runtime. */

export type Role = "system" | "user" | "assistant" | "tool";

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

export interface ToolSpec {
  name: string;
  description?: string;
  parameters: JsonSchema;
}

export interface ToolCall {
  name: string;
  /** Arguments as the model wrote them (a JSON string). */
  arguments: string;
  id?: string;
}

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
  /** Looser schemas tried in order when the runtime refuses `schema` (as earlier builds did), before free text. */
  fallbackSchemas?: JsonSchema[];
  /** Native tools; only engines with caps.tools use them. */
  tools?: ToolSpec[];
  signal?: AbortSignal;
  /** Keep think blocks in `think` events (default) or drop them. Visible text never holds them. */
  think?: "emit" | "drop";
}

export type Finish = "stop" | "length" | "abort" | "tool" | "refusal" | "error";

/** What a driver yields. Drivers do not strip think tags; the engine does. */
export type DriverEvent =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; calls: ToolCall[] }
  | { type: "done"; finish: Finish; usage?: { input?: number; output?: number } };

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
  dispose?(): Promise<void> | void;
}

/** Events the engine yields to callers: visible text and think text are separate. */
export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "think"; text: string }
  | { type: "tool"; calls: ToolCall[] }
  | { type: "done"; result: ChatResult };

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
}

export interface ChatEngine {
  readonly id: string;
  readonly provider: string;
  readonly caps: DriverCaps;
  stream(messages: readonly ChatMessage[], opts?: StreamOptions): AsyncGenerator<ChatEvent, ChatResult>;
  complete(messages: readonly ChatMessage[], opts?: StreamOptions): Promise<ChatResult>;
  dispose(): Promise<void>;
}

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

/**
 * Chrome built in Prompt API (`LanguageModel`) engine. Chrome downloads
 * its model on first use under Chrome's terms and the Google Generative AI
 * Prohibited Use Policy. A session is created per request from the
 * history, so the engine stays stateless like the others. JSON Schema goes
 * in `responseConstraint`.
 */

import { createEngine, type EngineOptions } from "./engine.js";
import { ChatError, type ChatEngine, type Driver, type DriverEvent, type DriverRequest } from "./types.js";

export interface LanguageModelSession {
  promptStreaming(input: string, opts?: { responseConstraint?: unknown; signal?: AbortSignal }): AsyncIterable<string> | ReadableStream<string>;
  destroy?(): void;
}

export interface LanguageModelStatic {
  availability(opts?: Record<string, unknown>): Promise<"unavailable" | "downloadable" | "downloading" | "available">;
  create(opts?: Record<string, unknown>): Promise<LanguageModelSession>;
}

export function getLanguageModel(g: unknown = globalThis): LanguageModelStatic | null {
  const lm = (g as { LanguageModel?: LanguageModelStatic }).LanguageModel;
  return lm && typeof lm.create === "function" ? lm : null;
}

async function* chunksOf(s: AsyncIterable<string> | ReadableStream<string>): AsyncGenerator<string> {
  if (Symbol.asyncIterator in s) {
    yield* s as AsyncIterable<string>;
    return;
  }
  const r = (s as ReadableStream<string>).getReader();
  for (;;) {
    const { done, value } = await r.read();
    if (done) return;
    yield value;
  }
}

export interface PromptApiOptions {
  LanguageModel?: LanguageModelStatic;
  onDownload?: (fraction: number) => void;
  /** Languages of the text in and out. Default ["en"]; Chrome warns when none is given. */
  languages?: string[];
}

/** The expected input and output languages, as availability() and create() take them. */
export function promptLanguages(languages: readonly string[] = ["en"]): Record<string, unknown> {
  const io = [{ type: "text", languages: [...languages] }];
  return { expectedInputs: io, expectedOutputs: io };
}

export function promptApiDriver(o: PromptApiOptions = {}): Driver {
  const lm = o.LanguageModel ?? getLanguageModel();
  return {
    id: "prompt-api",
    provider: "prompt-api",
    caps: { schema: true, tools: false, systemRole: true, stop: false },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      if (!lm) throw new ChatError("unavailable", "no LanguageModel in this browser. the built in model needs chrome 148 or later.");
      const langs = promptLanguages(o.languages);
      const state = await lm.availability(langs);
      if (state === "unavailable") throw new ChatError("unavailable", "the built in model is unavailable on this device.");
      const msgs = req.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content }));
      let lastUser = -1;
      for (let i = msgs.length - 1; i >= 0; i--) if (msgs[i]!.role === "user") {
        lastUser = i;
        break;
      }
      const input = lastUser >= 0 ? msgs[lastUser]!.content : "";
      const initialPrompts = msgs.filter((_, i) => i !== lastUser);
      const copts: Record<string, unknown> = { initialPrompts, ...langs };
      if (req.signal) copts.signal = req.signal;
      if (o.onDownload) {
        const cb = o.onDownload;
        copts.monitor = (m: EventTarget) => m.addEventListener("downloadprogress", (e) => cb((e as unknown as { loaded: number }).loaded));
      }
      const session = await lm.create(copts);
      try {
        const popts: { responseConstraint?: unknown; signal?: AbortSignal } = {};
        if (req.schema) popts.responseConstraint = req.schema;
        if (req.signal) popts.signal = req.signal;
        let acc = "";
        for await (const chunk of chunksOf(session.promptStreaming(input, popts))) {
          // early Chrome builds streamed the whole text so far; later ones stream deltas
          const delta = acc && chunk.startsWith(acc) ? chunk.slice(acc.length) : chunk;
          acc = acc && chunk.startsWith(acc) ? chunk : acc + chunk;
          if (delta) yield { type: "text", text: delta };
        }
      } catch (e) {
        if (req.signal?.aborted) {
          yield { type: "done", finish: "abort" };
          return;
        }
        throw e;
      } finally {
        session.destroy?.();
      }
      yield { type: "done", finish: "stop" };
    },
  };
}

export function promptApi(o: PromptApiOptions & EngineOptions = {}): ChatEngine {
  return createEngine(promptApiDriver(o), o);
}

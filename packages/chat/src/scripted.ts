/**
 * A scripted driver with no model: replies come from a list or a function
 * and stream in small pieces. It backs `?stub` pages, the hub's stub
 * provider, and tests in this and other packages.
 */

import { createEngine, type EngineOptions } from "./engine.js";
import { ChatError, type ChatEngine, type Driver, type DriverEvent, type DriverRequest } from "./types.js";

/** Options for a scripted engine: the replies or a function of the request, chunk size, a schema refusal message and caps. */
export interface ScriptedOptions extends EngineOptions {
  /** Replies in order (the last one repeats), or a function of the request. */
  replies: readonly string[] | ((req: DriverRequest, call: number) => string);
  /** Characters per streamed piece. Default 4. */
  chunk?: number;
  /** Reject a request that carries a schema with this message (to exercise the fallback). */
  refuseSchema?: string;
  schema?: boolean;
  systemRole?: boolean;
  id?: string;
}

/** A driver with no model that streams fixed replies in small pieces and records each request in `calls`. */
export function scriptedDriver(o: ScriptedOptions): Driver & { calls: DriverRequest[] } {
  const calls: DriverRequest[] = [];
  return {
    id: o.id ?? "scripted",
    provider: "stub",
    caps: { schema: o.schema ?? true, tools: false, systemRole: o.systemRole ?? true, stop: false },
    calls,
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      calls.push(req);
      if (req.schema && o.refuseSchema) throw new ChatError("runtime", o.refuseSchema);
      const n = calls.length - 1;
      const text = typeof o.replies === "function" ? o.replies(req, n) : (o.replies[Math.min(n, o.replies.length - 1)] ?? "");
      const step = o.chunk ?? 4;
      for (let i = 0; i < text.length; i += step) {
        if (req.signal?.aborted) {
          yield { type: "done", finish: "abort" };
          return;
        }
        await Promise.resolve();
        yield { type: "text", text: text.slice(i, i + step) };
      }
      yield { type: "done", finish: "stop" };
    },
  };
}

/** An engine over `scriptedDriver`, for stub pages and tests. */
export function scripted(o: ScriptedOptions): ChatEngine & { calls: DriverRequest[] } {
  const d = scriptedDriver(o);
  return Object.assign(createEngine(d, o), { calls: d.calls });
}

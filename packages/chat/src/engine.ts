/**
 * The engine wraps a driver with the rules every runtime needs:
 * role normalization from quirks, think block splitting, stop strings cut
 * on the client, and the schema fallback (ARBOR `$W`: the first schema
 * refusal turns schemas off for this engine and the schema moves into the
 * prompt as text).
 */

import { normalizeMessages, ThinkSplitter } from "./text.js";
import { ChatError, type ChatEngine, type ChatEvent, type ChatMessage, type ChatResult, type Driver, type DriverRequest, type Finish, type JsonSchema, type StreamOptions, type ToolCall } from "./types.js";

export interface EngineQuirks {
  systemRole?: boolean;
  strictAlternation?: boolean;
  repetitionPenalty?: number;
}

export interface EngineOptions {
  quirks?: EngineQuirks;
  /** Default max tokens. 512. */
  maxTokens?: number;
  /** Start with schemas off (a runtime known to reject them). */
  noSchema?: boolean;
}

const SCHEMA_ERR = /grammar|schema|response_format|json_schema|xgrammar|responseConstraint|constraint/i;

export function isSchemaError(e: unknown, sentSchema: boolean): boolean {
  if (!sentSchema) return false;
  if (e instanceof ChatError && e.code === "schema") return true;
  if (e instanceof ChatError && e.code === "http" && e.status === 400) return true;
  return e instanceof Error && SCHEMA_ERR.test(e.message);
}

export function schemaInstruction(schema: JsonSchema): string {
  return `Reply with one JSON object that matches this JSON Schema, and nothing else:\n${JSON.stringify(schema)}`;
}

function withInstruction(msgs: ChatMessage[], text: string): ChatMessage[] {
  const out = msgs.map((m) => ({ ...m }));
  const sys = out.find((m) => m.role === "system");
  if (sys) sys.content = `${sys.content}\n\n${text}`;
  else out.unshift({ role: "system", content: text });
  return out;
}

export function createEngine(driver: Driver, opts: EngineOptions = {}): ChatEngine {
  let noSchema = opts.noSchema ?? !driver.caps.schema;
  const quirks = opts.quirks ?? {};

  async function* run(messages: readonly ChatMessage[], o: StreamOptions = {}): AsyncGenerator<ChatEvent, ChatResult> {
    const systemRole = (quirks.systemRole ?? true) && driver.caps.systemRole;
    const base = normalizeMessages(messages, { systemRole: true, toolAsUser: !driver.caps.tools });
    let schemaFallback = false;
    let useSchema = !!o.schema && !noSchema;
    if (o.schema && !useSchema) schemaFallback = true;

    for (let attempt = 0; attempt < 2; attempt++) {
      let msgs = base;
      if (o.schema && !useSchema) msgs = withInstruction(msgs, schemaInstruction(o.schema));
      msgs = normalizeMessages(msgs, { systemRole, strictAlternation: quirks.strictAlternation ?? false, toolAsUser: !driver.caps.tools });
      const req: DriverRequest = { messages: msgs, maxTokens: o.maxTokens ?? opts.maxTokens ?? 512 };
      if (o.temperature !== undefined) req.temperature = o.temperature;
      if (o.topP !== undefined) req.topP = o.topP;
      if (o.topK !== undefined) req.topK = o.topK;
      if (o.minP !== undefined) req.minP = o.minP;
      const rp = o.repetitionPenalty ?? quirks.repetitionPenalty;
      if (rp !== undefined) req.repetitionPenalty = rp;
      if (o.stop?.length) req.stop = o.stop;
      if (useSchema && o.schema) req.schema = o.schema;
      if (o.tools?.length && driver.caps.tools) req.tools = o.tools;
      if (o.signal) req.signal = o.signal;

      const split = new ThinkSplitter();
      const stops = o.stop ?? [];
      const hold = stops.reduce((a, s) => Math.max(a, s.length - 1), 0);
      let text = "";
      let think = "";
      let pending = "";
      let finish: Finish = "stop";
      const calls: ToolCall[] = [];
      let usage: ChatResult["usage"];
      let emitted = false;
      let stopped = false;

      const visible = function* (chunk: string, final: boolean): Generator<ChatEvent> {
        pending += chunk;
        if (stops.length) {
          let cut = -1;
          for (const s of stops) {
            const i = pending.indexOf(s);
            if (i >= 0 && (cut < 0 || i < cut)) cut = i;
          }
          if (cut >= 0) {
            pending = pending.slice(0, cut);
            stopped = true;
          }
        }
        const out = stopped || final ? pending : pending.slice(0, Math.max(0, pending.length - hold));
        pending = pending.slice(out.length);
        if (out) {
          text += out;
          emitted = true;
          yield { type: "text", text: out };
        }
      };

      const it = driver.stream(req)[Symbol.asyncIterator]();
      try {
        for (;;) {
          if (o.signal?.aborted) {
            finish = "abort";
            break;
          }
          const n = await it.next();
          if (n.done) break;
          const ev = n.value;
          if (ev.type === "text") {
            const s = split.push(ev.text);
            if (s.think) {
              think += s.think;
              if (o.think !== "drop") {
                emitted = true;
                yield { type: "think", text: s.think };
              }
            }
            if (s.text) yield* visible(s.text, false);
            if (stopped) {
              finish = "stop";
              break;
            }
          } else if (ev.type === "think") {
            think += ev.text;
            if (o.think !== "drop") {
              emitted = true;
              yield { type: "think", text: ev.text };
            }
          } else if (ev.type === "tool") {
            calls.push(...ev.calls);
            emitted = true;
            yield { type: "tool", calls: ev.calls };
          } else {
            finish = ev.finish;
            if (ev.usage) usage = ev.usage;
          }
        }
      } catch (e) {
        await it.return?.(undefined);
        if (o.signal?.aborted || (e instanceof Error && e.name === "AbortError")) {
          finish = "abort";
        } else if (!emitted && attempt === 0 && isSchemaError(e, useSchema)) {
          noSchema = true;
          useSchema = false;
          schemaFallback = true;
          continue;
        } else throw e;
      }
      if (stopped || finish === "abort") await it.return?.(undefined);
      if (!stopped) {
        const end = split.end();
        if (end.think) {
          think += end.think;
          if (o.think !== "drop") yield { type: "think", text: end.think };
        }
        yield* visible(end.text, true);
      }
      const result: ChatResult = { text, think, finish: calls.length && finish === "stop" ? "tool" : finish, toolCalls: calls, schemaFallback };
      if (usage) result.usage = usage;
      yield { type: "done", result };
      return result;
    }
    throw new ChatError("schema", "schema fallback did not settle");
  }

  return {
    id: driver.id,
    provider: driver.provider,
    caps: driver.caps,
    stream: run,
    async complete(messages, o) {
      const g = run(messages, o);
      for (;;) {
        const n = await g.next();
        if (n.done) return n.value;
      }
    },
    async dispose() {
      await driver.dispose?.();
    },
  };
}

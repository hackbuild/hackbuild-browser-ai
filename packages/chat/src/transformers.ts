/**
 * transformers.js (ONNX) engine for tiny chat models (SmolLM2 135M and
 * 360M, Gemma 3 270M). Written against @huggingface/transformers 4.3.x;
 * the module is passed in, so the runtime is an optional peer. Stopping
 * uses InterruptableStoppingCriteria, text arrives through TextStreamer
 * (localchat). Model weights keep each model's licence (SmolLM2 Apache-2.0,
 * Gemma 3 under the Gemma Terms of Use).
 */

import { createEngine, type EngineOptions } from "./engine.js";
import type { ChatEngine, Driver, DriverEvent, DriverRequest } from "./types.js";
import { Channel } from "./util.js";

/** The @huggingface/transformers version this file is written against. */
export const TRANSFORMERS_VERSION = "4.3.2";

/** The parts of a transformers.js text generation pipeline this driver uses. */
export interface TextGenerationLike {
  (messages: { role: string; content: string }[], opts: Record<string, unknown>): Promise<unknown>;
  tokenizer: unknown;
  dispose?(): Promise<void>;
}

/** The parts of the @huggingface/transformers module the loader uses. */
export interface TransformersModule {
  pipeline(task: "text-generation", model: string, opts?: Record<string, unknown>): Promise<TextGenerationLike>;
  TextStreamer: new (tokenizer: unknown, opts: { skip_prompt?: boolean; skip_special_tokens?: boolean; callback_function?: (t: string) => void }) => unknown;
  InterruptableStoppingCriteria: new () => { interrupt(): void; reset?(): void };
}

/** Options for `transformersDriver`: the module's streamer and stopping classes, a built pipeline, an id and the system role quirk. */
export interface TransformersDriverOptions {
  module: Pick<TransformersModule, "TextStreamer" | "InterruptableStoppingCriteria">;
  generator: TextGenerationLike;
  id?: string;
  /** Gemma 3 templates have no system role. */
  systemRole?: boolean;
}

/** A driver over a transformers.js text generation pipeline that streams through TextStreamer and stops on abort. */
export function transformersDriver(o: TransformersDriverOptions): Driver {
  return {
    id: `tjs:${o.id ?? "model"}`,
    provider: "tjs",
    caps: { schema: false, tools: false, systemRole: o.systemRole ?? true, stop: false },
    async *stream(req: DriverRequest): AsyncGenerator<DriverEvent> {
      const ch = new Channel<string>();
      const stopper = new o.module.InterruptableStoppingCriteria();
      const streamer = new o.module.TextStreamer(o.generator.tokenizer, { skip_prompt: true, skip_special_tokens: true, callback_function: (t) => ch.push(t) });
      const onAbort = () => stopper.interrupt();
      req.signal?.addEventListener("abort", onAbort);
      const gen: Record<string, unknown> = {
        max_new_tokens: req.maxTokens,
        do_sample: req.temperature !== undefined && req.temperature > 0,
        streamer,
        stopping_criteria: stopper,
      };
      if (req.temperature !== undefined) gen.temperature = req.temperature;
      if (req.topP !== undefined) gen.top_p = req.topP;
      if (req.topK !== undefined) gen.top_k = req.topK;
      if (req.repetitionPenalty !== undefined) gen.repetition_penalty = req.repetitionPenalty;
      const run = o.generator(req.messages.map((m) => ({ role: m.role === "tool" ? "user" : m.role, content: m.content })), gen).then(
        () => ch.close(),
        (e: unknown) => ch.fail(e),
      );
      try {
        for await (const t of ch) {
          yield { type: "text", text: t };
        }
        await run;
      } finally {
        req.signal?.removeEventListener("abort", onAbort);
        stopper.interrupt();
      }
      yield { type: "done", finish: req.signal?.aborted ? "abort" : "stop" };
    },
    async dispose() {
      await o.generator.dispose?.();
    },
  };
}

/** Options for `loadTransformers`: the module, model id, device, dtype and a progress callback. */
export interface LoadTransformersOptions extends EngineOptions {
  module: TransformersModule;
  modelId: string;
  device?: string;
  dtype?: string | Record<string, string>;
  onProgress?: (p: unknown) => void;
}

/** Builds a transformers.js text generation pipeline for a model id and wraps it in an engine. */
export async function loadTransformers(o: LoadTransformersOptions): Promise<ChatEngine> {
  const popts: Record<string, unknown> = {};
  if (o.device) popts.device = o.device;
  if (o.dtype) popts.dtype = o.dtype;
  if (o.onProgress) popts.progress_callback = o.onProgress;
  const generator = await o.module.pipeline("text-generation", o.modelId, popts);
  const d: TransformersDriverOptions = { module: o.module, generator, id: o.modelId };
  if (o.quirks?.systemRole !== undefined) d.systemRole = o.quirks.systemRole;
  return createEngine(transformersDriver(d), o);
}

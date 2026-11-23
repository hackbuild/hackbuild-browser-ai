import { importEsm, probe } from "@hackbuild/ai-env";
import { maskKey, type ChatEngine, type ChatMessage } from "@hackbuild/chat";
import { getLanguageModel, promptApi, promptLanguages } from "@hackbuild/chat/prompt-api";
import { anthropicMessages, openaiCompatible } from "@hackbuild/chat/remote";
import { loadTransformers as loadTjsChat } from "@hackbuild/chat/transformers";
import { loadWebLLM, type WebLLMModule } from "@hackbuild/chat/webllm";
import { loadWllama, wllamaUrls } from "@hackbuild/chat/wllama";
import { loadTransformers } from "@hackbuild/devices";
import { openWeightStore } from "@hackbuild/weights";
import { $, auto, check, finish, quantile, readout, result, status } from "../shared/ui.js";

const r = result("chat");
const webllmUrl = (v: string) => [`https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${v}/+esm`, `https://esm.run/@mlc-ai/web-llm@${v}`];
const QWEN_GGUF = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const ENGINES: Record<string, string> = {
  webllm: "webllm 0.2.84, qwen2.5 0.5b instruct q4f16, weights Apache-2.0, 290 MB (vendor, repo file sizes)",
  tjs: "transformers.js 4.3.2, smollm2 360m instruct q4f16, weights Apache-2.0, about 260 MB (inferred)",
  wllama: "wllama 4.0.0, qwen2.5 0.5b instruct q4_k_m gguf, weights Apache-2.0, 491 MB (vendor)",
  prompt: "chrome prompt api, built in model under the chrome built in ai terms",
  openai: "openai compatible server at a url you give (ollama, llama.cpp)",
  anthropic: "anthropic messages api with your key",
};
$("#controls").innerHTML = `
<label class="hb-ctl">engine <select class="hb-select" id="engine">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
<input class="hb-input" id="url" type="url" placeholder="server url, for openai compatible" value="http://localhost:11434/v1" aria-label="server url">
<input class="hb-input" id="model" type="text" placeholder="remote model name" value="qwen2.5:0.5b" aria-label="remote model name, its weight licence is the model card's (qwen2.5 0.5b: Apache-2.0); a hosted api is under its provider's terms" style="flex:0 1 12em">
<input class="hb-input" id="key" type="password" placeholder="api key: stays in this tab, never stored" aria-label="api key" autocomplete="off">
<span class="pg-note" id="keyv"></span>
<button class="hb-btn" type="button" id="load">load</button>
<input class="hb-input" id="msg" type="text" value="Name three things to pack for a rainy hike, one line each." aria-label="message">
<button class="hb-btn hb-btn-2" type="button" id="send" disabled>send</button>
<button class="hb-btn hb-btn-2" type="button" id="stop" disabled>stop</button>`;
// the reply streams into one model turn of a hackbuild-ui chat log
const box = document.createElement("section");
box.className = "hb-chat pg-out";
box.setAttribute("aria-label", "reply");
box.innerHTML = `<div class="hb-chat-log" role="log" aria-live="polite"><div class="hb-msg pg-reply"><span class="hb-msg-who">reply</span></div></div>`;
const out = document.createElement("div");
out.className = "hb-msg-text";
box.querySelector(".hb-msg")!.append(out);
$("#status").before(box);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));
$("#key").addEventListener("input", () => ($("#keyv").textContent = ($("#key") as HTMLInputElement).value ? maskKey(($("#key") as HTMLInputElement).value) : ""));

const env = await probe();
if (!env.webgpu) for (const k of ["webllm", "tjs"]) {
  const o = $(`#engine option[value='${k}']`) as HTMLOptionElement;
  o.disabled = true;
  o.textContent += ". no webgpu adapter.";
}
const lm = getLanguageModel();
const promptState = lm ? await lm.availability(promptLanguages()).catch(() => "unavailable" as const) : "unavailable";
if (promptState !== "available") {
  const o = $("#engine option[value='prompt']") as HTMLOptionElement;
  o.disabled = true;
  o.textContent += `. the built in model is ${lm ? promptState : "absent"} here.`;
}
show({ "prompt api": lm ? promptState : "absent" });

let engine: ChatEngine | null = null;
let ac: AbortController | null = null;
const tjs = loadTransformers();

async function load(kind: string, version = "0.2.84"): Promise<{ engine: ChatEngine; ms: number; ctx?: number }> {
  status(`loading ${ENGINES[kind]}. weights download from hugging face on first use.`);
  const t = performance.now();
  let e: ChatEngine;
  let ctx: number | undefined;
  if (kind === "webllm") {
    const module = await importEsm<WebLLMModule>(webllmUrl(version));
    const w = await loadWebLLM({ module, modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", contextWindow: 4096, onProgress: (p) => status(`webllm ${version}: ${p.text}`) });
    ctx = w.contextWindow;
    e = w;
  } else if (kind === "tjs") {
    e = await loadTjsChat({ module: (await tjs()) as never, modelId: "HuggingFaceTB/SmolLM2-360M-Instruct", device: "webgpu", dtype: "q4f16" });
  } else if (kind === "wllama") {
    const store = await openWeightStore({ onNotice: (l) => status(l) });
    const gguf = await store.get({ url: QWEN_GGUF, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" }, { onProgress: (p) => status(`gguf ${(p.loaded / 1e6).toFixed(0)} MB`) });
    e = await loadWllama({ module: await importEsm(wllamaUrls().esm), blobs: [gguf] });
  } else if (kind === "prompt") e = promptApi();
  else if (kind === "openai") {
    const key = ($("#key") as HTMLInputElement).value;
    const base = ($("#url") as HTMLInputElement).value;
    // llama.cpp and ollama take repeat_penalty; api.openai.com rejects it
    e = openaiCompatible({ base, model: ($("#model") as HTMLInputElement).value, llamaParams: !/api\.openai\.com/.test(base), ...(key ? { apiKey: key } : {}) });
  } else e = anthropicMessages({ apiKey: ($("#key") as HTMLInputElement).value, model: ($("#model") as HTMLInputElement).value || "claude-haiku-4-5" });
  const ms = performance.now() - t;
  engine = e;
  ($("#send") as HTMLButtonElement).disabled = false;
  show({ engine: e.id, "load ms (measured)": Math.round(ms), ...(ctx ? { "context window (computed by the ladder)": ctx } : {}) });
  status(`${e.id} loaded. weights licence in the engine list.`, "ok");
  return ctx === undefined ? { engine: e, ms } : { engine: e, ms, ctx };
}

async function send(e: ChatEngine, text: string, o: { maxTokens?: number; stopAfterMs?: number; schema?: Record<string, unknown> } = {}) {
  const msgs: ChatMessage[] = [{ role: "system", content: "You answer briefly." }, { role: "user", content: text }];
  ac = new AbortController();
  ($("#stop") as HTMLButtonElement).disabled = false;
  out.textContent = "";
  const t = performance.now();
  let first = 0;
  let chunks = 0;
  const gaps: number[] = [];
  let lastT = t;
  if (o.stopAfterMs) setTimeout(() => ac?.abort(), o.stopAfterMs);
  const it = e.stream(msgs, { maxTokens: o.maxTokens ?? 200, signal: ac.signal, ...(o.schema ? { schema: o.schema } : {}) });
  let res: Awaited<ReturnType<ChatEngine["complete"]>> | null = null;
  let abortedAt = 0;
  ac.signal.addEventListener("abort", () => (abortedAt = performance.now()));
  for (;;) {
    const x = await it.next();
    if (x.done) {
      res = x.value;
      break;
    }
    const ev = x.value;
    if (ev.type === "text") {
      const now = performance.now();
      if (!first) first = now - t;
      else gaps.push(now - lastT);
      lastT = now;
      chunks++;
      out.textContent += ev.text;
    }
    if (ev.type === "done") res = ev.result;
  }
  const total = performance.now() - t;
  ($("#stop") as HTMLButtonElement).disabled = true;
  const tokens = res?.usage?.output ?? chunks;
  const genMs = total - first;
  const stats = {
    ttft: first,
    tokens,
    tps: genMs > 0 ? ((tokens - 1) * 1000) / genMs : 0,
    gapP95: quantile(gaps, 0.95),
    finish: res?.finish ?? "unknown",
    text: res?.text ?? out.textContent,
    stopMs: abortedAt ? performance.now() - abortedAt : 0,
    schemaFallback: res?.schemaFallback ?? false,
  };
  show({ "time to first token ms (measured)": Math.round(stats.ttft), "tokens (measured)": tokens, "tokens per s (measured)": stats.tps.toFixed(1), finish: stats.finish });
  return stats;
}

$("#load").addEventListener("click", () => void load(($("#engine") as HTMLSelectElement).value).catch((e) => status(`load failed: ${(e as Error).message}`, "bad")));
$("#send").addEventListener("click", () => engine && void send(engine, ($("#msg") as HTMLInputElement).value).catch((e) => status(`reply failed: ${(e as Error).message}`, "bad")));
$("#stop").addEventListener("click", () => ac?.abort());
status(env.webgpu ? "pick an engine and load it." : "no webgpu adapter. webllm and transformers.js chat are off; wllama runs on wasm.", env.webgpu ? "info" : "warn");

if (auto) {
  const n = r.numbers;
  const SCHEMA = { type: "object", properties: { items: { type: "array", items: { type: "string" } } }, required: ["items"] };
  for (const v of ["0.2.84", "0.2.89"]) {
    const id = `#11 chat: webllm ${v} stream, json schema, context ladder`;
    try {
      const l = await load("webllm", v);
      n[`webllm ${v} load ms (measured)`] = Math.round(l.ms);
      n[`webllm ${v} context window (computed)`] = l.ctx ?? 0;
      const s = await send(l.engine, "Name three things to pack for a rainy hike, one line each.");
      n[`webllm ${v} time to first token ms (measured)`] = Math.round(s.ttft);
      n[`webllm ${v} tokens per s (measured)`] = Math.round(s.tps * 10) / 10;
      const j = await send(l.engine, "List three hiking items as JSON.", { schema: SCHEMA, maxTokens: 120 });
      let parsed = false;
      try {
        parsed = Array.isArray(JSON.parse(j.text).items);
      } catch {
        /* parsed stays false */
      }
      n[`webllm ${v} schema reply parses`] = String(parsed);
      n[`webllm ${v} schema fallback`] = String(j.schemaFallback);
      await l.engine.dispose();
      check(r, id, s.tokens > 3 && parsed ? "pass" : "fail", parsed ? `stream and schema; ladder settled at ${l.ctx}` : `schema reply did not parse: ${j.text.slice(0, 120)}`);
    } catch (e) {
      check(r, id, "fail", (e as Error).message.slice(0, 300));
    }
  }
  try {
    const l = await load("tjs");
    n["smollm2 load ms (measured)"] = Math.round(l.ms);
    const s = await send(l.engine, "Write a short paragraph about rain.", { maxTokens: 120 });
    n["smollm2 time to first token ms (measured)"] = Math.round(s.ttft);
    n["smollm2 tokens per s (measured)"] = Math.round(s.tps * 10) / 10;
    const i = await send(l.engine, "Write a long story about a lighthouse keeper.", { maxTokens: 400, stopAfterMs: 1500 });
    n["smollm2 stop to end ms (measured)"] = Math.round(i.stopMs);
    n["smollm2 finish after stop"] = i.finish;
    await l.engine.dispose();
    check(r, "#13 chat: transformers.js smollm2 360m streaming and interrupt", s.tokens > 3 && i.finish === "abort" ? "pass" : "fail", `interrupt finish ${i.finish}, ${Math.round(i.stopMs)} ms from stop to end`);
  } catch (e) {
    check(r, "#13 chat: transformers.js smollm2 360m streaming and interrupt", "fail", (e as Error).message.slice(0, 300));
  }
  check(r, "#12 chat: wllama 4.0.0 and 3.8.1 with a gguf from the store", "not run", "the q4_k_m gguf is 491 MB (vendor), over this pass's download limit; the page loads it on request");
  check(r, "#14 chat: prompt api in chrome with responseConstraint", "not run", `LanguageModel is ${lm ? `present, availability ${promptState}` : "absent"}; the built in model download was not started`);
  check(r, "#15 chat: openai compatible stream from a local server", "not run", "needs a local ollama or llama.cpp server");
  check(r, "#16 chat: anthropic messages api from a page", "not run", "needs an api key");
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}

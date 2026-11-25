import { importEsm, probe } from "@hackbuild/ai-env";
import { define, type ChatPanelElement, type DownloadBarElement, type StatusPillsElement } from "@hackbuild/ai-elements";
import { scripted, type ChatEngine, type ChatMessage } from "@hackbuild/chat";
import { getLanguageModel, promptApi, promptLanguages } from "@hackbuild/chat/prompt-api";
import { anthropicMessages, openaiCompatible } from "@hackbuild/chat/remote";
import { loadTransformers as loadTjsChat } from "@hackbuild/chat/transformers";
import { loadWebLLM, type WebLLMModule } from "@hackbuild/chat/webllm";
import { loadWllama, wllamaUrls } from "@hackbuild/chat/wllama";
import { loadTransformers } from "@hackbuild/devices";
import { openWeightStore } from "@hackbuild/weights";
import { $, auto, check, finish, fixture, quantile, readout, result, status } from "../shared/ui.js";

const r = result("chat");
define();
const webllmUrl = (v: string) => [`https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@${v}/+esm`, `https://esm.run/@mlc-ai/web-llm@${v}`];
const SCRIPT = ["a rain shell, a warm layer, a dry pair of socks. this reply is scripted; load a model engine for a real one.", "this page answers from a script until you load a model engine."];
const QWEN_GGUF = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const ENGINES: Record<string, string> = {
  scripted: "scripted replies, no model and no download",
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
<input class="hb-input" id="model" type="text" placeholder="remote model name" value="qwen2.5:0.5b" aria-label="remote model name, its weight licence is the model card's (qwen2.5 0.5b: Apache-2.0); a hosted api is under its provider's terms">
<button class="hb-btn" type="button" id="load">load</button>`;
// the five ai-elements: state pills, the gguf download bar and the chat panel; the key field shows for a remote engine
const box = document.createElement("section");
box.className = "hb-panel";
box.setAttribute("aria-label", "chat");
box.innerHTML = `<h2 class="hb-panel-hd-inst">chat</h2><hb-status-pills id="pills"></hb-status-pills><hb-download-bar id="bar" hidden></hb-download-bar><hb-chat-panel id="chat"></hb-chat-panel>`;
$("#status").before(box);
const pills = $("#pills") as StatusPillsElement;
const bar = $("#bar") as DownloadBarElement;
const chat = $("#chat") as ChatPanelElement;
chat.system = "You answer briefly.";
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));
const pick = $("#engine") as HTMLSelectElement;
const remote = () => pick.value === "openai" || pick.value === "anthropic";
const fields = () => {
  for (const id of ["#url", "#model"]) $(id).hidden = !remote();
  chat.keyField = remote();
};
pick.addEventListener("change", fields);
fields();

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

const tjs = loadTransformers();

async function load(kind: string, version = "0.2.84"): Promise<{ engine: ChatEngine; ms: number; ctx?: number }> {
  status(kind === "scripted" ? "scripted replies. nothing downloads." : `loading ${ENGINES[kind]}. weights download from hugging face on first use.`);
  pills.update({ id: "engine", kind: "loading", text: `${kind} loading` });
  const t = performance.now();
  let e: ChatEngine;
  let ctx: number | undefined;
  if (kind === "scripted") e = scripted({ replies: SCRIPT, chunk: 3 });
  else if (kind === "webllm") {
    const module = await importEsm<WebLLMModule>(webllmUrl(version));
    const w = await loadWebLLM({ module, modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", contextWindow: 4096, onProgress: (p) => status(`webllm ${version}: ${p.text}`) });
    ctx = w.contextWindow;
    e = w;
  } else if (kind === "tjs") {
    e = await loadTjsChat({ module: (await tjs()) as never, modelId: "HuggingFaceTB/SmolLM2-360M-Instruct", device: "webgpu", dtype: "q4f16" });
  } else if (kind === "wllama") {
    const store = await openWeightStore({ onNotice: (l) => status(l) });
    bar.hidden = false;
    const gguf = await store.get({ url: QWEN_GGUF, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" }, { onProgress: (p) => (bar.progress = p) });
    bar.state = "done";
    e = await loadWllama({ module: await importEsm(wllamaUrls().esm), blobs: [gguf] });
  } else if (kind === "prompt") e = promptApi();
  else if (kind === "openai") {
    const key = chat.apiKey;
    const base = ($("#url") as HTMLInputElement).value;
    // llama.cpp and ollama take repeat_penalty; api.openai.com rejects it
    e = openaiCompatible({ base, model: ($("#model") as HTMLInputElement).value, llamaParams: !/api\.openai\.com/.test(base), ...(key ? { apiKey: key } : {}) });
  } else e = anthropicMessages({ apiKey: chat.apiKey, model: ($("#model") as HTMLInputElement).value || "claude-haiku-4-5" });
  const ms = performance.now() - t;
  chat.engine = metered(e);
  pills.update({ id: "engine", kind: "ready", text: `${e.id} ready` });
  show({ engine: e.id, "load ms (measured)": Math.round(ms), ...(ctx ? { "context window (computed by the ladder)": ctx } : {}) });
  status(kind === "scripted" ? "scripted replies loaded. type below; pick a model engine and load it for real replies." : `${e.id} loaded. weights licence in the engine list.`, "ok");
  return ctx === undefined ? { engine: e, ms } : { engine: e, ms, ctx };
}

interface Stats {
  ttft: number;
  tokens: number;
  tps: number;
  gapP95: number;
  finish: string;
  text: string;
  stopMs: number;
  schemaFallback: boolean;
}

/** The engine the chat panel streams from, timed: first token, tokens per second and the gap p95 go to the readout. */
function metered(e: ChatEngine, extra: { maxTokens?: number; schema?: Record<string, unknown> } = {}, done?: (s: Stats) => void): ChatEngine {
  const stream = async function* (msgs: ChatMessage[], o: Parameters<ChatEngine["stream"]>[1] = {}) {
    const t = performance.now();
    let first = 0;
    let chunks = 0;
    let text = "";
    const gaps: number[] = [];
    let lastT = t;
    let abortedAt = 0;
    o.signal?.addEventListener("abort", () => (abortedAt = performance.now()));
    const it = e.stream(msgs, { maxTokens: 200, ...o, ...(extra.maxTokens ? { maxTokens: extra.maxTokens } : {}), ...(extra.schema ? { schema: extra.schema } : {}) });
    let res: Awaited<ReturnType<ChatEngine["complete"]>> | null = null;
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
        text += ev.text;
      }
      if (ev.type === "done") res = ev.result;
      yield ev;
    }
    const total = performance.now() - t;
    const tokens = res?.usage?.output ?? chunks;
    const genMs = total - first;
    const s: Stats = {
      ttft: first,
      tokens,
      tps: genMs > 0 ? ((tokens - 1) * 1000) / genMs : 0,
      gapP95: quantile(gaps, 0.95),
      finish: res?.finish ?? "unknown",
      text: res?.text ?? text,
      stopMs: abortedAt ? performance.now() - abortedAt : 0,
      schemaFallback: res?.schemaFallback ?? false,
    };
    show({ "time to first token ms (measured)": Math.round(s.ttft), "tokens (measured)": tokens, "tokens per s (measured)": s.tps.toFixed(1), finish: s.finish });
    done?.(s);
    return res!;
  };
  return { ...e, id: e.id, provider: e.provider, caps: e.caps, stream } as ChatEngine;
}

/** One turn through the panel with a fresh transcript, for the checks: system plus one user turn. */
async function send(e: ChatEngine, text: string, o: { maxTokens?: number; stopAfterMs?: number; schema?: Record<string, unknown> } = {}): Promise<Stats> {
  chat.clear();
  let stats: Stats | null = null;
  chat.engine = metered(e, o, (s) => (stats = s));
  if (o.stopAfterMs) setTimeout(() => chat.stop(), o.stopAfterMs);
  await chat.send(text);
  chat.engine = metered(e);
  if (!stats) throw new Error("the reply ended with no result");
  return stats;
}

$("#load").addEventListener("click", () => void load(pick.value).catch((e) => (status(`load failed: ${(e as Error).message}`, "bad"), pills.update({ id: "engine", kind: "failed", text: "load failed" }))));
// the stage that needs no download: scripted replies are loaded at the start
await load("scripted");
fixture("replies come from a script until you load a model engine.");
if (!env.webgpu) status("no webgpu adapter. webllm and transformers.js chat are off; wllama runs on wasm. scripted replies are loaded.", "warn");

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

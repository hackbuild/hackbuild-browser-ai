import { importEsm, probe } from "@hackbuild/ai-env";
import { define } from "@hackbuild/ai-elements";
import { scripted, type ChatEngine } from "@hackbuild/chat";
import { loadWebLLM, type WebLLMModule } from "@hackbuild/chat/webllm";
import { EMBED_RECORDS } from "@hackbuild/embed";
import { hashedEmbedder, loadCore, open } from "@hackbuild/memory";
import { MEMORY_WASM_BASE64 } from "@hackbuild/memory/inline";
import { CATALOG } from "@hackbuild/models";
import { TRANSCRIBE_RECORDS } from "@hackbuild/transcribe";
import { VISION_RECORDS } from "@hackbuild/vision";
import { openWeightStore } from "@hackbuild/weights";
import { $, FrameTimer, auto, check, finish, frames, readout, result, status } from "../shared/ui.js";

const r = result("ai-elements");
define();
$("#controls").innerHTML = `
<label>theme <select id="theme"><option value="">system</option><option value="light">light</option><option value="dark">dark</option></select></label>
<button id="dl">download a 23 MB file into the bar</button>
<button id="stream">stream 500 scripted tokens into the chat panel</button>
<button id="real">stream from qwen2.5 0.5b on webllm</button>`;
const main = $("main");
const wrap = document.createElement("div");
wrap.style.cssText = "display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(min(100%,460px),1fr));margin-bottom:16px";
wrap.innerHTML = `
<section><h2 style="font-size:14px">model picker</h2><div style="max-height:420px;overflow:auto"><hb-model-picker id="picker"></hb-model-picker></div></section>
<section><h2 style="font-size:14px">download bar</h2><hb-download-bar id="bar"></hb-download-bar>
<h2 style="font-size:14px">status pills</h2><hb-status-pills id="pills"></hb-status-pills>
<h2 style="font-size:14px">memory inspector</h2><hb-memory-inspector id="insp"></hb-memory-inspector></section>
<section style="grid-column:1/-1"><h2 style="font-size:14px">chat panel</h2><hb-chat-panel id="chat"></hb-chat-panel></section>`;
main.insertBefore(wrap, $("#controls"));
const els = ["#picker", "#bar", "#pills", "#insp", "#chat"].map((s) => $(s));
$("#theme").addEventListener("change", () => {
  const v = ($("#theme") as HTMLSelectElement).value;
  for (const e of els) v ? e.setAttribute("data-theme", v) : e.removeAttribute("data-theme");
});
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));
type El = HTMLElement & Record<string, unknown> & { update?(s: unknown): void; streamText(src: AsyncIterable<string>): Promise<void> };
const picker = $("#picker") as El;
const bar = $("#bar") as El;
const pills = $("#pills") as El;
const insp = $("#insp") as El;
const chat = $("#chat") as El;

const env = await probe();
picker.env = env;
picker.records = [...CATALOG, ...VISION_RECORDS, ...TRANSCRIBE_RECORDS, ...EMBED_RECORDS];
picker.addEventListener("hb-pick", (e) => status(`picked ${(e as CustomEvent).detail.id}. this page does not load it.`));
pills.pills = [
  { engine: "kokoro", kind: "ready", text: "kokoro ready" },
  { engine: "whisper-base.en", kind: "loading", text: "whisper loading" },
  { id: "depth", busy: 2 },
  { engine: "pocket", kind: "patch-missed", text: "pocket tts patch missed" },
  { engine: "webllm", kind: "watchdog", text: "no audio for 45 s" },
];

const core = await loadCore({ base64: MEMORY_WASM_BASE64 });
const mem = await open("ai-elements-example", { core, embed: hashedEmbedder() });
if (!(await mem.recall("mug", { k: 1 })).hits.length) {
  for (const [t, kind] of [["the mug goes on the shelf", "rule"], ["they asked for the red ball", "episode"], ["the shelf is above the sink", "fact"], ["rain is expected on friday", "note"]] as const) await mem.add(t, { kind });
}
insp.recall = await mem.recall("where does the mug go", { k: 3, score: "linear" });

async function download(): Promise<number> {
  const store = await openWeightStore({ backends: ["memory"] });
  bar.state = "running";
  const t = performance.now();
  const b = await store.get({ url: "https://huggingface.co/Xenova/all-MiniLM-L6-v2/resolve/main/onnx/model_quantized.onnx", licence: "Apache-2.0" }, { onProgress: (p) => (bar.progress = p) });
  bar.state = "done";
  status(`downloaded ${(b.size / 1e6).toFixed(1)} MB, weights Apache-2.0 (all-MiniLM-L6-v2).`, "ok");
  return performance.now() - t;
}

const timer = new FrameTimer();
let sampling = false;
const tick = (now: number) => {
  if (sampling) timer.tick(now);
  requestAnimationFrame(tick);
};
requestAnimationFrame(tick);

async function measure(engine: ChatEngine, prompt: string): Promise<{ tokens: number; ms: number; frame: ReturnType<FrameTimer["stats"]> }> {
  chat.engine = engine;
  timer.reset();
  sampling = true;
  const t = performance.now();
  let tokens = 0;
  const done = new Promise<void>((res) => chat.addEventListener("hb-reply", () => res(), { once: true }));
  const counter = { stream: engine.stream.bind(engine) };
  chat.engine = {
    ...engine,
    id: engine.id,
    provider: engine.provider,
    caps: engine.caps,
    stream: async function* (m: Parameters<ChatEngine["stream"]>[0], o?: Parameters<ChatEngine["stream"]>[1]) {
      const it = counter.stream(m, { ...(o ?? {}), maxTokens: 500 });
      for (;;) {
        const x = await it.next();
        if (x.done) return x.value;
        if (x.value.type === "text") tokens++;
        yield x.value;
      }
    },
  } as ChatEngine;
  await (chat as unknown as { send(t: string): Promise<void> }).send(prompt);
  await Promise.race([done, frames(2)]);
  sampling = false;
  const ms = performance.now() - t;
  const frame = timer.stats();
  show({ "streamed chunks (measured)": tokens, "stream ms (measured)": Math.round(ms), "frame ms p50 while streaming (measured)": frame.frameMsP50.toFixed(1), "frame ms p95 while streaming (measured)": frame.frameMsP95.toFixed(1) });
  return { tokens, ms, frame };
}

const LONG = Array.from({ length: 500 }, (_, i) => ["the ", "kettle ", "clicks, ", "pour ", "slowly. "][i % 5]).join("");
const scriptedEngine = () => scripted({ replies: [LONG], chunk: 6 });
async function webllm(): Promise<ChatEngine> {
  const module = await importEsm<WebLLMModule>(["https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.84/+esm"]);
  status("qwen2.5 0.5b instruct q4f16 on webllm, weights Apache-2.0, about 280 MB (inferred).");
  return loadWebLLM({ module, modelId: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", contextWindow: 4096, onProgress: (p) => status(`webllm: ${p.text}`) });
}
$("#dl").addEventListener("click", () => void download().catch((e) => ((bar.error = (e as Error).message), (bar.state = "failed"))));
$("#stream").addEventListener("click", () => void measure(scriptedEngine(), "say it"));
$("#real").addEventListener("click", () => void webllm().then((e) => measure(e, "Write a long story about a lighthouse keeper.")).catch((e) => status(`webllm failed: ${(e as Error).message}`, "bad")));
status(env.webgpu ? "each element is live. the chat panel answers from a scripted engine until you load a model." : "no webgpu adapter. the webllm button is off.", "info");
if (!env.webgpu) ($("#real") as HTMLButtonElement).disabled = true;

if (auto) {
  const n = r.numbers;
  try {
    n["23 MB download ms (measured)"] = Math.round(await download());
  } catch (e) {
    r.notes.push(`download: ${(e as Error).message}`);
  }
  const idle = (timer.reset(), (sampling = true), await frames(120), (sampling = false), timer.stats());
  n["idle frame ms p95 (measured)"] = Math.round(idle.frameMsP95 * 10) / 10;
  const s = await measure(scriptedEngine(), "say it");
  n["scripted chunks (measured)"] = s.tokens;
  n["scripted 534 chunk stream ms (measured)"] = Math.round(s.ms);
  try {
    const e = await webllm();
    const x = await measure(e, "Write a long story about a lighthouse keeper.");
    n["webllm tokens streamed (measured)"] = x.tokens;
    n["webllm stream ms (measured)"] = Math.round(x.ms);
    n["webllm frame ms p50 / p95 while streaming (measured)"] = `${x.frame.frameMsP50.toFixed(1)} / ${x.frame.frameMsP95.toFixed(1)}`;
    await e.dispose();
    check(r, "#56 ai-elements: chat panel streaming qwen2.5 0.5b for 500 tokens, repaint cost", x.tokens >= 100 ? "pass" : "fail", `${x.tokens} tokens; frame ms p95 ${x.frame.frameMsP95.toFixed(1)} while streaming against ${idle.frameMsP95.toFixed(1)} idle`);
  } catch (e) {
    check(r, "#56 ai-elements: chat panel streaming qwen2.5 0.5b for 500 tokens, repaint cost", "fail", (e as Error).message.slice(0, 300));
  }
  check(r, "#55 ai-elements: a person looks at each element in chrome and safari, light and dark, with a screen reader", "not run", "needs a person, safari and a screen reader; the screenshot is in .local/shots for the owner");
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}

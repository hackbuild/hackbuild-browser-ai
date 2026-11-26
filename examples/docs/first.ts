import { importEsm } from "@hackbuild/ai-env";
import { loadWllama, wllamaUrls } from "@hackbuild/chat/wllama";
import { openWeightStore } from "@hackbuild/weights";

const store = await openWeightStore();
const url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const gguf = await store.get({ url, key: "gguf:qwen2.5-0.5b/q4_k_m", licence: "Apache-2.0" });
const chat = await loadWllama({ module: await importEsm(wllamaUrls().esm), blobs: [gguf] });

for await (const ev of chat.stream([{ role: "user", content: "say hello in five words" }])) {
  if (ev.type === "text") document.body.append(ev.text);
}

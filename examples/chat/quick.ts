import { importEsm } from "@hackbuild/ai-env";
import type { ChatMessage } from "@hackbuild/chat";
import { loadWllama, wllamaUrls, type WllamaModule } from "@hackbuild/chat/wllama";
import { openWeightStore } from "@hackbuild/weights";

// Qwen2.5 0.5B Instruct q4_k_m GGUF, weights Apache-2.0, cached by the weight store
const store = await openWeightStore();
const url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
const gguf = await store.get({ url, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" });

// the runtime is passed in, never bundled
const chat = await loadWllama({ module: await importEsm<WllamaModule>(wllamaUrls().esm), blobs: [gguf] });

// stream a reply; visible text never holds think blocks or control markers
const messages: ChatMessage[] = [{ role: "system", content: "answer in one line." }, { role: "user", content: "what should I pack for rain?" }];
for await (const ev of chat.stream(messages, { maxTokens: 120 })) {
  if (ev.type === "text") console.log(ev.text);
  if (ev.type === "done") console.log(ev.result.stats.tokensPerSecond, "tokens per second");
}

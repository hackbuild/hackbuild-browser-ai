import { importEsm } from "@hackbuild/ai-env";
import type { ChatMessage } from "@hackbuild/chat";
import { loadWllama, wllamaUrls, type WllamaModule } from "@hackbuild/chat/wllama";
import { CATALOG, pinnedBase } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// Qwen2.5 0.5B Instruct q4_k_m GGUF; the record names the weight licence, the store caches the file
const rec = CATALOG.find((r) => r.id === "qwen2.5-0.5b-instruct-gguf")!;
const url = pinnedBase(rec.source.repo!) + rec.source.file!;
const gguf = await (await openWeightStore()).get({ url, licence: rec.licence });

// the runtime is passed in, never bundled
const chat = await loadWllama({ module: await importEsm<WllamaModule>(wllamaUrls().esm), blobs: [gguf] });

// stream a reply; visible text never holds think blocks or control markers
const messages: ChatMessage[] = [{ role: "system", content: "answer in one line." }, { role: "user", content: "what should I pack for rain?" }];
for await (const ev of chat.stream(messages, { maxTokens: 120 })) {
  if (ev.type === "text") console.log(ev.text);
  if (ev.type === "done") console.log(ev.result.stats.tokensPerSecond, "tokens per second");
}

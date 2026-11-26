import { importEsm } from "@hackbuild/ai-env";
import { ALL_RECORDS, chatThread, useModelPick, weightsLoader } from "@hackbuild/ai-views";
import { mountChatPane, mountComposer, mountModelSelect } from "@hackbuild/ai-views/elements";
import { loadWllama, wllamaUrls, type WllamaModule } from "@hackbuild/chat/wllama";
import { openWeightStore } from "@hackbuild/weights";

// a chat picker over the GGUF rows, files through the weight store; Qwen2.5 0.5B Instruct weights are Apache-2.0
const fetchFiles = weightsLoader(await openWeightStore());
const wllama = await importEsm<WllamaModule>(wllamaUrls().esm); // the runtime is passed in, never bundled
const thread = chatThread({ system: "answer in one line." });
const pick = useModelPick("chat", {
  records: ALL_RECORDS.filter((r) => r.provider === "wllama"), chosen: "qwen2.5-0.5b-instruct-gguf",
  loader: async (rec, ctx) => thread.setEngine(await loadWllama({ module: wllama, blobs: [...((await fetchFiles(rec, ctx)) as Map<string, Blob>).values()] })),
});

// the picker, the turns and the composer, drawn with the page's hackbuild-ui stylesheet
mountModelSelect(document.querySelector<HTMLElement>("#model")!, pick);
mountChatPane(document.querySelector<HTMLElement>("#chat")!, thread);
mountComposer(document.querySelector<HTMLElement>("#composer")!, thread);

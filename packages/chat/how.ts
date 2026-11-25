// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/chat"],
  what: `one streaming chat interface over webllm, wllama, transformers.js, the chrome prompt api, openai compatible endpoints and the anthropic messages api. role normalization, think block stripping and a schema to free text fallback are applied the same way for every runtime.`,
  how: [
    `each runtime is an optional peer behind its own subpath (\`/webllm\`, \`/wllama\`, \`/transformers\`, \`/prompt-api\`, \`/remote\`), and no file imports a runtime: you pass the module in, so a page that uses only the remote engine never loads webllm.`,
    `every engine streams the same events. think blocks come out as \`think\` events, leaked chatml, llama 3 and gemma markers are removed, and stop strings are cut on the client, also across chunk edges.`,
    `a schema goes to each runtime in its own form. the first refusal turns schemas off for that engine and moves the schema into the system prompt as text; \`result.schemaFallback\` says so.`,
    `every result carries \`stats\`: tokens, time to first token and tokens per second, each with its source word.`,
  ],
  install: "npm install @hackbuild/chat",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/chat`,
  code: `import { loadWllama, wllamaUrls } from "@hackbuild/chat/wllama";
import { importEsm } from "@hackbuild/ai-env";
import { openWeightStore } from "@hackbuild/weights";

const store = await openWeightStore();
const gguf = await store.get({ url, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" });
const chat = await loadWllama({ module: await importEsm(wllamaUrls().esm), blobs: [gguf] });

for await (const ev of chat.stream(messages, { maxTokens: 220, stop: ["\\nUSER:"] })) {
  if (ev.type === "text") show(ev.text);       // never holds think blocks or control markers
  if (ev.type === "think") trace(ev.text);
}
const { text, schemaFallback } = await chat.complete(messages, { schema });`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/chat/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/chat" },
};
export default how;

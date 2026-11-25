// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/ai-env"],
  what: `capability probe and file:// safe loading of es modules and workers, for pages that run models in the tab.`,
  how: [
    `every field comes from calling the api: \`requestAdapter()\`, \`adapter.features.has("shader-f16")\`, \`crossOriginIsolated\`, \`navigator.storage.getDirectory()\`, \`caches.open()\`. a call that does not settle in \`timeoutMs\` (default 3000) counts as absent.`,
    `\`threads\` is 1 unless the page is cross origin isolated, then \`min(4, hardwareConcurrency)\`; 4 is the cap the transcription build used (inferred as safe, not measured here).`,
    `opfs is reported false on file:// without calling it; chrome refuses it there and the weights store moves to indexeddb parts.`,
  ],
  install: "npm install @hackbuild/ai-env",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/ai-env`,
  code: `import { probe } from "@hackbuild/ai-env";

const env = await probe();
// { webgpu, f16, adapter, maxBufferBytes, isolated, protocol, opfs,
//   cacheStorage, indexedDB, threads, deviceMemoryGB, promptApi, notes }`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/ai-env/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/ai-env" },
};
export default how;

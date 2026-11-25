// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/models"],
  what: `model registry records with device and dtype ladders, quirks and weight licences, and a hub that routes a capability request to a record, loads it under a memory budget, and runs gpu work one job at a time.`,
  how: [
    `\`licence\` is required; \`createRegistry\` refuses a record without one.`,
    `\`ladderFor(record, env)\` drops rungs the device cannot run: a webgpu rung without an adapter, an f16 dtype (also inside per sub graph dtypes) without \`shader-f16\`, a prompt api rung without \`LanguageModel\`.`,
    `\`ortLadder()\` is the onnxruntime-web walk from the transcription build: webgpu plus wasm at optimization basic, all, disabled, then wasm alone. pair it with \`store.once(ref)\` from \`@hackbuild/weights\` so every attempt reads one download.`,
  ],
  install: "npm install @hackbuild/models",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/models`,
  code: `import { createHub, createRegistry, CATALOG } from "@hackbuild/models";

const hub = createHub({ registry: createRegistry(CATALOG), env: await probe(), budgetMB: 4000 });
hub.provide("tjs", async ({ record, rung }) => pipeline(task, record.source.modelId, { device: rung.device, dtype: rung.dtype }));
const depth = await hub.use("depth");                 // routed, ladder walked, cached
const map = await hub.run(depth, (pipe) => pipe(image)); // webgpu models take the gpu lock
hub.release(depth);`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/models/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/models" },
};
export default how;

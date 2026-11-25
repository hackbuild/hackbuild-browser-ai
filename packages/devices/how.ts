// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/devices"],
  what: `provider ladders for onnxruntime-web and transformers.js, and the two factories every model package plugs into the \`@hackbuild/models\` hub. the runtimes are pinned (transformers.js 4.3.2 and onnxruntime-web 1.27.0, both apache-2.0) and imported only when a model loads.`,
  how: [
    `\`tjsProvider\` configures the runtime once: no local models, the browser cache on (off on file://, or a \`transformersCache\` from \`@hackbuild/weights\` as the custom cache), wasm threads from the probe, the proxy worker off, the wasm cache off. the default loader is \`pipeline(task, modelId, { device, dtype, progress_callback })\`, with the task from \`TJS_TASKS\` or \`rung.options.task\`. a package registers its own loader for a capability with \`tjs.loader("vision.caption", fn)\`.`,
    `\`ortProvider\` reads graph bytes once through \`store.once\`, then builds a session per rung from the same bytes. files that do not end in \`.onnx\` are passed as \`externalData\`. the value is \`{ ort, sessions, session, rung, dispose }\`.`,
    `the walk and error names (\`walkLadder\`, \`classifyError\`) are the models package's and are re-exported here.`,
  ],
  install: "npm install @hackbuild/devices",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/devices`,
  code: `import { createHub, createRegistry } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";
import { tjsProvider, ortProvider, loadTransformers, loadOrt, ortWasmPaths } from "@hackbuild/devices";

const tjs = tjsProvider({ runtime: loadTransformers() });
const ort = ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() });
hub.provide("tjs", tjs.factory);
hub.provide("ort", ort.factory);`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/devices/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/devices" },
};
export default how;

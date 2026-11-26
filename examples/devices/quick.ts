import { probe } from "@hackbuild/ai-env";
import { humanError, LADDERS, loadOrt, loadTransformers, ortProvider, ortWasmPaths, tjsProvider } from "@hackbuild/devices";
import { createHub } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// one hub per page; one provider per runtime, each runtime imported at run time from a pinned url
const hub = createHub({ env: await probe() });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() }).factory);

// a record walks its ladder: webgpu fp16, webgpu fp32, wasm q8, wasm fp32
const source = { modelId: "onnx-community/depth-anything-v2-small" }; // weights Apache-2.0
hub.registry.add({ id: "depth", provides: ["depth"], provider: "tjs", source, sizeMB: 100, sizeSource: "inferred", ladder: LADDERS.depth(), licence: "Apache-2.0", commercial: true });

// load it; a failure becomes one lowercase line naming it and what still works
const line = await hub.use("depth").then((l) => `loaded on ${l.rung.device}`, (e) => humanError(e));
console.log(line);

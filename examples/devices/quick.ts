import { probe } from "@hackbuild/ai-env";
import { humanError, LADDERS, loadOrt, loadTransformers, ortProvider, ortWasmPaths, tjsProvider } from "@hackbuild/devices";
import { CATALOG, createHub } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// one hub per page; one provider per runtime, each runtime imported at run time from a pinned url
const hub = createHub({ env: await probe() });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore(), wasmPaths: ortWasmPaths() }).factory);

// a catalog record on the depth ladder: webgpu fp16, webgpu fp32, wasm q8, wasm fp32
const rec = { ...CATALOG.find((r) => r.id === "depth-anything-v2-small")!, ladder: LADDERS.depth() };
hub.registry.add(rec);
console.log("weight licence", rec.licence); // from the record

// load it; a failure becomes one lowercase line naming it and what still works
const line = await hub.use("depth").then((l) => `loaded on ${l.rung.device}`, (e) => humanError(e));
console.log(line);

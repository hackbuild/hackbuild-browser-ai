import { probe } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { CATALOG, createHub, createRegistry, fitOf, pinnedSha } from "@hackbuild/models";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// what fits this machine, before any download
const env = await probe();
for (const r of CATALOG) console.log(r.id, fitOf(r, env).reason);

// a hub over the catalogue; transformers.js is imported at run time, its files go through the weight store
const cache = transformersCache(await openWeightStore(), { licenceFor: (u) => (u.includes("/depth-anything-v2-small/") ? "Apache-2.0" : null), sha256For: pinnedSha });
const hub = createHub({ registry: createRegistry(CATALOG), env, budgetMB: 4000 });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache }).factory);

// depth-anything-v2-small, weights Apache-2.0: routed by capability, ladder walked, loaded once
hub.onLoad((e) => console.log(e.id, e.phase, e.fraction));
const depth = await hub.use<(image: string) => Promise<unknown>>("depth");
console.log("runs on", depth.rung.device, "after", depth.failures.length, "failed rungs");
console.log(await hub.run(depth, (pipe) => pipe("https://example.com/room.jpg")));
hub.release(depth);

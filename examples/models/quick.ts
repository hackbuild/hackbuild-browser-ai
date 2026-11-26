import { probe } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { CATALOG, createHub, createRegistry, fitOf, pinnedSha } from "@hackbuild/models";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// what fits this machine, before any download
const env = await probe();
for (const r of CATALOG) console.log(r.id, fitOf(r, env).reason);
// transformers.js is imported at run time; its files go through the weight store under each record's licence
const licenceFor = (url: string) => CATALOG.find((r) => r.source?.repo && url.includes(`/${r.source.repo}/`))?.licence ?? null;
const cache = transformersCache(await openWeightStore(), { licenceFor, sha256For: pinnedSha });
const hub = createHub({ registry: createRegistry(CATALOG), env, budgetMB: 4000 });
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache }).factory);
// depth-anything-v2-small, weights Apache-2.0, on a picked photo: routed by capability, ladder walked, loaded once
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const depth = await hub.use<(image: string) => Promise<unknown>>("depth");
  console.log("runs on", depth.rung.device, await hub.run(depth, (pipe) => pipe(URL.createObjectURL(input.files![0]!))));
  hub.release(depth);
};

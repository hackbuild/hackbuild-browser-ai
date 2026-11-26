import { importEsm, probe, spawnWorker } from "@hackbuild/ai-env";

// what this tab can do, measured by calling each API
const env = await probe();
console.log(env.webgpu ? "webgpu" : "wasm", env.threads, "threads", env.protocol);
for (const note of env.notes) console.log(note);

// a runtime from a CDN, patched and imported from a Blob URL when the page is a file
const wllama = await importEsm(["https://cdn.jsdelivr.net/npm/@wllama/wllama@3.8.1/esm/index.js"], {
  onAttempt: (a) => console.log(a.via, a.ok ? "ok" : a.error),
});
console.log(Object.keys(wllama as object).length, "exports");

// a worker from source text: a module Blob first, then a classic Blob
const { worker, rung } = await spawnWorker("self.onmessage = (e) => self.postMessage(e.data * 2);");
worker.addEventListener("message", (e) => console.log(rung, "worker says", e.data));
worker.postMessage(21);

import { openWeightStore, WeightError } from "@hackbuild/weights";

// one store over opfs, indexeddb parts, cache storage or memory, the first that opens
const store = await openWeightStore();
console.log("stored in", store.backend.name, (await store.estimate()).quota, "bytes of quota");

// Qwen2.5 0.5B Instruct q4_k_m GGUF, weights Apache-2.0; an interrupted download resumes on the next get
const url = "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf";
try {
  const gguf = await store.get({ url, key: "gguf:Qwen/Qwen2.5-0.5B-Instruct-GGUF/q4_k_m", licence: "Apache-2.0" }, {
    onProgress: (p) => console.log(p.fraction === null ? `${(p.loaded / 1e6).toFixed(0)} MB` : `${(p.fraction * 100).toFixed(0)}%`),
  });
  console.log(gguf.size, "bytes, cached for the next visit");
} catch (e) {
  // code is http, sha256, quota, abort or range
  if (e instanceof WeightError) console.log(e.code, e.message);
}

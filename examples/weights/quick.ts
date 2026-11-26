import { CATALOG, pinnedBase, pinnedSha } from "@hackbuild/models";
import { openWeightStore, WeightError } from "@hackbuild/weights";

// one store over opfs, indexeddb parts, cache storage or memory, the first that opens
const store = await openWeightStore();
console.log("stored in", store.backend.name, (await store.estimate()).quota, "bytes of quota");

// Qwen2.5 0.5B Instruct q4_k_m GGUF: the record names the repo, the file and the weight licence (Apache-2.0)
const rec = CATALOG.find((r) => r.id === "qwen2.5-0.5b-instruct-gguf")!;
const url = pinnedBase(rec.source!.repo!) + rec.source!.file!;
const sha256 = pinnedSha(url);
try {
  // an interrupted download resumes on the next get; the bytes are checked against the pinned sha-256
  const ref = { url, key: `gguf:${rec.id}`, licence: rec.licence, ...(sha256 ? { sha256 } : {}) };
  const gguf = await store.get(ref, { onProgress: (p) => console.log(p.fraction === null ? `${(p.loaded / 1e6).toFixed(0)} MB` : `${(p.fraction * 100).toFixed(0)}%`) });
  console.log(gguf.size, "bytes, cached for the next visit");
} catch (e) {
  // code is http, sha256, quota, abort or range
  if (e instanceof WeightError) console.log(e.code, e.message);
}

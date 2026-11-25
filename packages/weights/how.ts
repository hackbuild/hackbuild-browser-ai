// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/weights"],
  what: `one store for model weights over opfs, cache storage, indexeddb parts and memory, with resumable range downloads, a streaming sha-256, progress that works without a content-length, and one fetch shared by many session attempts.`,
  how: [
    `\`auto\` picks the first of opfs, idb, cache, memory that opens; on file:// opfs and cache are left out (as earlier builds did). a backend that throws on its first read is skipped.`,
    `every backend stores numbered parts of \`partBytes\` (default 128 mb, the earlier builds size) plus a meta record written after each part. an interrupted download keeps its parts. the next \`get\` sends \`Range: bytes=<kept>-\` with \`If-Range\` (etag, else last-modified); a 206 continues, a 200 starts over, a \`Content-Range\` that starts elsewhere is refused.`,
    `the sha-256 is computed as bytes arrive (parts are re-read on resume). a mismatch removes the parts and throws \`WeightError\` code \`sha256\`.`,
  ],
  install: "npm install @hackbuild/weights",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/weights`,
  code: `import { openWeightStore } from "@hackbuild/weights";

const store = await openWeightStore();          // backends: "auto"
const blob = await store.get(
  { url, key: "gguf:org/model.gguf", licence: "Apache-2.0", sha256 },
  { onProgress: ({ loaded, total }) => bar(loaded, total) },  // total null: count MB
);
const bytes = await store.once(ref);            // same Uint8Array for every ORT session attempt
await store.put({ key: "local:model.onnx", licence: "MIT" }, file);  // a File the user dropped`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/weights/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/weights" },
};
export default how;

// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/embed"],
  what: `sentence embedders that satisfy the \`Embedder\` contract of @hackbuild/memory (\`{ id, dim, embed(texts) }\`): a model2vec style static embedder in plain typescript, and a transformers.js adapter for minilm and other sentence models. both give an id that is a stable fingerprint of the model and settings, so memory re-embeds only when the vectors would change.`,
  how: [
    `tokenizer: tokenizer.json with a wordpiece or wordlevel model, or a vocab.txt. the bertnormalizer steps run in the library order (clean text, pad cjk ideographs, strip accents, lowercase), then whitespace and punctuation splitting, then greedy longest match with \`##\` continuations; a word with no full cover is one unknown token. unigram and bpe models are refused with a message.`,
    `embedding: no special tokens, unknown tokens dropped, at most 512 tokens, mean of the rows (weighted by a \`weights\` tensor and remapped by a \`mapping\` tensor when the file has them), l2 normalized unless config.json says \`"normalize": false\`. an empty result is a zero vector.`,
    `weights: safetensors with f32, f16 or bf16 floats; f16 and bf16 widen to float32.`,
  ],
  install: "npm install @hackbuild/embed",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/embed`,
  code: `import { loadStaticEmbedder, staticEmbedder } from "@hackbuild/embed";

// minishlab/potion-base-8M, weights MIT; the base URL is yours to choose
const e = await loadStaticEmbedder("https://huggingface.co/minishlab/potion-base-8M/resolve/main/", { name: "potion-base-8M" });
// or from bytes you already hold (a File, the weights store)
const e2 = staticEmbedder({ tokenizer: tokenizerJsonText, weights: safetensorsBytes, config: configJsonText });
e.embedOne("the mug goes on the shelf"); // Float32Array, L2 normalized`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/embed/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/embed" },
};
export default how;

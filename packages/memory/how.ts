// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/memory"],
  what: `memory for agents and characters that run in a browser tab. a rust core (\`crates/memory\`, compiled to wasm32 with simd128) does bm25 plus flat cosine search fused by reciprocal rank, two scorers, kind decay, strengthening on recall and near duplicate merge. the ts package on top keeps items in indexeddb, caches vectors per embedder, assembles a token budgeted context and injects recall without breaking a cached prompt prefix.`,
  how: [
    `items carry id, scope, kind, created and last use (hours), importance, arousal, valence, novelty, uses, weight, an optional place and an optional vector. kinds: episode, gist, lesson, fact, rule, lore, doc, note.`,
    `bm25 with k1 1.4 and b 0.75 (the defaults of earlier builds), statistics over the admitted scope and kinds only. the tokenizer lowercases, splits on anything not a letter or digit, drops stop words and strips ing, ed, es and s.`,
    `cosine over float32 vectors. the wasm build runs the dot product on f32x4 lanes; the native build keeps four scalar lanes in the same order, and neither fuses a multiply and add, so the two give the same bits. exp and ln are written out in the crate for the same reason: the platform libm differs between targets.`,
    `sealing at rest: \`sealedSink(sink, key)\` seals item text and metadata, vectors (a vector leaks its text) and kv values with aes-gcm before the inner sink stores them; only ids, key names and sizes stay readable. the key comes from \`@hackbuild/memory/seal\`: \`makeLock\` or \`deriveKey\` run pbkdf2 sha-256 (210,000 iterations) once per session and cache the key, then every write takes a fresh salt and iv. a sealed store keeps no keyword index; open rebuilds it in memory once the key is given. there is no recovery: a lost password means the sealed memory is gone.`,
  ],
  install: "npm install @hackbuild/memory",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/memory`,
  code: `import { loadCore, open, hashedEmbedder, RecallConversation } from "@hackbuild/memory";
import { MEMORY_WASM_BASE64 } from "@hackbuild/memory/inline";

const core = await loadCore({ base64: MEMORY_WASM_BASE64 }); // or { url } or { bytes }
const mem = await open("dog-1", { core, embed: hashedEmbedder(), scopes: ["self", "shared"] });

await mem.add("the mug goes on the shelf", { kind: "rule" });
await mem.add("they asked for the red ball", { kind: "episode", arousal: 0.4 });

const r = await mem.recall("where does the mug go", { k: 6, score: "linear" });
r.hits;   // items with score and terms
r.trace;  // every fused candidate: bm25 rank, vector rank, rrf, rel, rec, imp, ret, score

const ctx = await mem.assemble({ budgetTokens: 1000, query: "mug", recent: ["user: tidy up"] });
ctx.text; ctx.kept; ctx.dropped;

const talk = new RecallConversation("you are a dog.");
const prompt = talk.user("where is my mug?", ctx.recalled);

// sealed at rest: there is no recovery if the password is lost
import { makeLock, deriveKey, sealedSink } from "@hackbuild/memory/seal";
import { indexedDbSink } from "@hackbuild/memory";
const { lock } = await makeLock(password);          // store lock beside the data
const key = await deriveKey(password, lock);        // once per session, throws on a wrong password
const locked = await open("dog-1", { core, sink: sealedSink(await indexedDbSink("dog-1"), key) });`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/memory/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/memory" },
};
export default how;

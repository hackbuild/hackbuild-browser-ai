import { loadCore, open, hashedEmbedder, RecallConversation } from "@hackbuild/memory";
import { MEMORY_WASM_BASE64 } from "@hackbuild/memory/inline";

// load the wasm core from inlined base64, or pass { url } or { bytes }
const core = await loadCore({ base64: MEMORY_WASM_BASE64 });

// one memory per agent, kept in IndexedDB; the hashed embedder downloads nothing
const mem = await open("dog-1", { core, embed: hashedEmbedder(), scopes: ["self", "shared"] });
await mem.add("the mug goes on the shelf", { kind: "rule" });
await mem.add("they asked for the red ball", { kind: "episode", arousal: 0.4 });

// recall with the trace of every fused candidate
const r = await mem.recall("where does the mug go", { k: 6, score: "linear" });
console.log(r.hits.map((h) => h.item.text), r.trace.length);

// fit recall and recent turns into a token budget, then build the next prompt
const ctx = await mem.assemble({ budgetTokens: 1000, query: "mug", recent: ["user: tidy up"] });
const talk = new RecallConversation("you are a dog.");
console.log(talk.user("where is my mug?", ctx.recalled));

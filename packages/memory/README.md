# @hackbuild/memory

Give an agent or character in a browser tab a memory you can add to, recall from and fit into a prompt, with a wasm core and IndexedDB storage.

[![npm](https://img.shields.io/npm/v/@hackbuild/memory)](https://www.npmjs.com/package/@hackbuild/memory) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 14.0 kB measured](https://img.shields.io/badge/gzip-14.0%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Recalls by BM25 plus cosine search fused by reciprocal rank in a Rust core compiled to wasm32 with SIMD128, with two scorers, kind decay, strengthening on recall and near duplicate merge.
- Keeps items in IndexedDB, one database per memory, and caches vectors per embedder.
- Assembles a context into a token budget and injects recall without changing earlier messages, so a cached prompt prefix stays reusable.
- Explains every recall: per candidate ranks, score parts and per term BM25 weights.
- Seals text, metadata, vectors and values at rest under a password through the `./seal` subpath.

## Install

```sh
npm install @hackbuild/memory
```

No dependencies and no peers. The wasm core ships in the package; load it from `@hackbuild/memory/memory.wasm` by URL, as bytes, or inlined base64 from `@hackbuild/memory/inline`.

| subpath | what it adds |
|---|---|
| `.` | the core loader, `open`, `Memory`, assembly and trace |
| `./inline` | `MEMORY_WASM_BASE64`, the wasm as base64 |
| `./seal` | password sealing and `sealedSink` |
| `./memory.wasm` | the wasm file |

## Quick start

```ts
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
```

## Live example

The suite's memory view runs on this package: [hackbuild-suite memory](https://hackbuild.github.io/hackbuild-suite/#/chat/memory). The package page is at [hackbuild-browser-ai/memory](https://hackbuild.github.io/hackbuild-browser-ai/memory/).

## Concepts

### items and kinds

Items carry id, scope, kind, created and last use (hours), importance, arousal, valence, novelty, uses, weight, an optional place and an optional vector. Kinds are episode, gist, lesson, fact, rule, lore, doc and note.

### the core

BM25 runs with k1 1.4 and b 0.75, with statistics over the admitted scope and kinds only. The tokenizer lowercases, splits on anything not a letter or digit, drops stop words and strips ing, ed, es and s.

Cosine runs over float32 vectors. The wasm build runs the dot product on f32x4 lanes; the native build keeps four scalar lanes in the same order, and neither fuses a multiply and add, so the two give the same bits. exp and ln are written out in the crate for the same reason: the platform libm differs between targets.

Reciprocal rank fusion uses k 60 over the BM25 top `cand` and the cosine top `cand` above a floor of 0.12.

The wasm surface is plain `extern "C"` over linear memory with no bindgen and no threads, so it loads from file:// as bytes or inlined base64. Rebuild it with `npm run build:wasm -w @hackbuild/memory`; the crate is `crates/memory`.

| file | size | build |
|---|---|---|
| `wasm/memory.wasm` | 95 908 bytes (measured) | opt-level s, stripped |

### scorers

Linear: rel is the min max normalized fused rank, rec is exp(-age / 72 h), and final = 0.55 rel + 0.20 rec + 0.25 importance. The 72 h is a time constant; the half-life is ln 2 times it.

Organic: 0.6 sim + 0.18 retention + 0.06 emotion + 0.05 novelty + place + mood + recent use, with retention exp(-age / (4 + 30 imp + 20 emo + 8 min(5, uses)) h) and place 0.08 exp(-d / 2.5).

Both scores are multiplied by the item weight, which recall raises by 0.02 per hit up to 1.2, along with one more use.

### decay and merge

Kind half-lives in hours: episode 6, gist 96, lesson 240, fact and note 720, rule, lore and doc never. Each use lengthens the half-life by 50 percent. `decay(floor)` drops items whose retention is under the floor.

A new text equal in tokens within 60 s, or at cosine 0.93 or more, in the same kind and scope strengthens the old item instead of adding one. `mergeNear(0.95)` folds stored duplicates into the older.

### storage

`open(id, { core, embed, sink, indexedDB, scopes, now })`. The default sink is one IndexedDB database per id (`hackbuild-memory:<id>`, stores items, vectors, kv). When IndexedDB fails, the memory runs on a Map and `status.notes` says so. `export()` gives JSON without vectors; `import()` re-embeds. The clock is injected (`now`); nothing in the package calls Math.random.

### embedders

The contract is `{ id, dim, embed(texts) }`. Vectors are cached under the embedder id, so a model change re-embeds every item once. With no embedder, or after one throws, recall is keyword only and `status.mode` says `keyword`. `hashedEmbedder()` is a zero download unigram plus bigram hash (384 dims) that matches shared words only. For real recall, wrap Xenova/all-MiniLM-L6-v2 (weights Apache-2.0) or BAAI/bge-small-en-v1.5 (weights MIT) running in transformers.js; [@hackbuild/embed](../embed/README.md) does that wrapping.

### assembling context

A query under 45 characters gets the previous user turn in front (`previous`). `assemble` puts core facts at priority 10, caller sections, a summary at 6, recalled lines at 5 and recent turns at 3 into a token budget, with tokens estimated as characters over `CHARS_PER_TOKEN`, a ratio never measured on a tokenizer. `select` caps recalled lines at k 3, 1800 characters, 2 per section, and drops a line within Jaccard 0.55 of one already picked.

### prefix stable injection

`injectRecall` and `RecallConversation` add a fixed note to the system message and put recalled lines under the latest user message only. Earlier messages never change, so a runtime that keeps the previous prompt's KV cache reuses all of it.

### core memory and consolidation

Core memory holds pinned facts, 700 characters at most, oldest evicted; a duplicate is one with the same first 40 letters and digits. `consolidate({ keep: 14, min: 22, summarize })` folds old episodes into one gist; without a summarizer the gist is a word count summary.

### the inspector

```ts
const t = await mem.explain("where does the mug go");   // no strengthening
// t.how, t.terms [{ term, df, idf }], t.rows [{ rank, used, score, weight, parts, terms, ... }]
const last = mem.trace(recallFromTheLastReply);          // the same object for a past recall
await mem.edit(id, { text: "the mug goes on the top shelf" });
const report = await mem.compact();                      // decay, merge near duplicates, fold episodes
const u = await mem.usage();                             // counts, bytes (computed estimate), browser estimate
await mem.persist();                                     // asks the browser to keep the origin's storage
await mem.addExchange(userTurn, reply);                  // null under 3 meaningful words
await mem.recall(q, { skipSaid: userTurnsInView });
```

Each trace row's `parts` times its `weight` is the core's score, and its per term BM25 contributions add up to the core's `bm25`. Both are recomputed in TypeScript from the core's formulas and a port of its tokenizer, and a test holds them equal. `edit` embeds new text again and drops every cached vector of the old text.

### sealed at rest

```ts
import { makeLock, deriveKey, seal, sealedSink } from "@hackbuild/memory/seal";
const { lock } = await makeLock(password);         // keep lock beside the data
const key = await deriveKey(password, lock);       // once per session; wrong password throws
const mem = await open(id, { core, sink: sealedSink(await indexedDbSink(id), key) });
const file = await seal(key, workspaceJson, "file:workspace.json");
```

There is no recovery. A lost password means the sealed data is gone.

The lock record is `{ algo: "pbkdf2-sha256", iterations, salt, hash }`, base64. PBKDF2 SHA-256 at 210,000 iterations gives a master once per derivation; HKDF SHA-256 splits it into the stored verifier and, with a fresh 16 byte salt on every write, an AES-GCM 256 key. Every write also takes a fresh 12 byte iv. `verifyLock` compares in constant time. `deriveKey` caches the key per lock for the page's life (`cachedKey`, `forgetKey`). It uses Web Crypto only, so it needs a secure origin.

The envelope is `HBS1`, salt 16, iv 12, ciphertext, tag 16, so a sealed blob is 48 bytes longer than its input. The optional context string is bound as additional data, so a blob moved to another item or file does not open.

`sealedSink` seals item text and metadata, vectors and kv values. The inner sink still sees item ids, vector and kv key names, the embedder id and sizes. The keyword index is never stored; `open` rebuilds it in memory from the opened items. A plain row in a sealed store throws: to lock an existing memory, export it and import it into a sealed one.

## API overview

| export | what it does |
|---|---|
| [`loadCore`](../../docs/api/memory/index.md#loadcore) | instantiate the wasm core from a URL, bytes or base64 |
| [`open`](../../docs/api/memory/index.md#open) | open or create one memory by id |
| [`Memory`](../../docs/api/memory/index.md#memory) | add, recall, assemble, explain, edit, compact, export and import |
| [`hashedEmbedder`](../../docs/api/memory/index.md#hashedembedder) | a zero download hash embedder, 384 dims |
| [`indexedDbSink`](../../docs/api/memory/index.md#indexeddbsink) | the IndexedDB store; `memorySink` is the Map one |
| [`assembleSections`](../../docs/api/memory/index.md#assemblesections) | fit core facts, sections, recall and recent turns into a budget |
| [`injectRecall`](../../docs/api/memory/index.md#injectrecall) | add recalled lines without changing earlier messages |
| [`RecallConversation`](../../docs/api/memory/index.md#recallconversation) | a message history that injects recall each user turn |
| [`CoreMemory`](../../docs/api/memory/index.md#corememory) | pinned facts, 700 characters at most |
| [`howScored`](../../docs/api/memory/index.md#howscored) | one sentence on how a recall scored its candidates |
| [`makeLock`](../../docs/api/memory/seal.md#makelock) | make the lock record for a password |
| [`deriveKey`](../../docs/api/memory/seal.md#derivekey) | the sealing key for a password and lock |
| [`seal`](../../docs/api/memory/seal.md#seal) | seal a value under a key and context; `open` opens it |
| [`sealedSink`](../../docs/api/memory/seal.md#sealedsink) | wrap a sink so everything it stores is sealed |
| [`SealError`](../../docs/api/memory/seal.md#sealerror) | the sealing error, with a code |

The full reference is in [docs/api/memory](../../docs/api/memory/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| core | WebAssembly with SIMD128 | yes (inferred) | 16.4 and later (inferred) | yes (inferred) | yes (inferred) |
| storage | IndexedDB | yes (unknown, not run) | yes (unknown, not run) | yes (unknown, not run) | yes (unknown, not run) |
| `./seal` | Web Crypto on a secure origin | yes (inferred) | yes (inferred) | yes (inferred) | yes (inferred) |
| WebGPU, threads | not used | no | no | no | no |

No WebGPU and no wasm threads, so the core loads from file:// as bytes or base64. Where IndexedDB fails, as some private windows may make it, the memory runs on a Map until the page closes and `status.notes` says so. Without an embedder, recall is keyword only. `status.simd` reports whether the core runs SIMD.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `memory core: fetch <url> returned <status>` | the wasm URL did not load | check the URL, or load from bytes or `MEMORY_WASM_BASE64` |
| `memory: no indexeddb in this context` | `indexedDbSink` called where there is no IndexedDB | pass `indexedDB`, or use `memorySink` |
| `indexeddb failed (...). memory lasts until the page closes.` (a status note) | opening the database failed | expect a Map that empties on close; say so to the user |
| `no embedder. recall is keyword only.` (a status note) | no embedder passed | pass an embedder for semantic recall |
| `embedder failed (...). recall is keyword only.` (a status note) | the embedder threw | check the model load; recall keeps working on keywords |
| `memory: unknown kind ...` | `edit` or `import` got a kind outside the eight | use episode, gist, lesson, fact, rule, lore, doc or note |
| `memory: an edit cannot empty the text. forget the memory instead.` | `edit` with empty text | forget the item instead |
| `memory: not a hackbuild-memory version 1 export` | `import` got other JSON | pass what `export()` gave |
| `seal: no web crypto in this context. sealing needs a secure origin.` | http page or no Web Crypto | serve over https or localhost |
| `seal: the lock record is not one this version reads.` | a changed or foreign lock record | use the lock `makeLock` gave |
| `seal: empty password.` | empty password | ask for a password |
| `seal: wrong password. there is no recovery.` | wrong password | ask again; a lost password cannot be recovered |
| `seal: not a sealed envelope.` | the bytes are not sealed | pass what `seal` or `sealBytes` gave |
| `seal: the envelope does not open. wrong key, or it was changed.` | wrong key, a changed byte, or another context | use the same key and context it was sealed with |
| `memory: item <id> is not sealed. ...` | a plain row in a sealed store | export the plain memory and import it into the sealed one |

Every `seal:` error is a `SealError` with a `code`: wrong-password, bad-lock, bad-envelope or rejected.

## Works with

- [@hackbuild/embed](../embed/README.md) gives embedders that fit the `{ id, dim, embed }` contract.
- [@hackbuild/converse](../converse/README.md) keeps chat history and can hand turns to a memory.
- [@hackbuild/chat](../chat/README.md) runs the model the assembled prompt goes to.
- [@hackbuild/agent](../agent/README.md) and [@hackbuild/act](../act/README.md) use a memory for their agents.
- [@hackbuild/ai-views](../ai-views/README.md) has a memory inspector view.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. The package bundles no weights. The embedders named above carry their own weight licences: Xenova/all-MiniLM-L6-v2 Apache-2.0, BAAI/bge-small-en-v1.5 MIT.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `cargo test -p hackbuild-memory` with rustc 1.95 native, 14 unit tests and 1 parity fixture; `cargo clippy --workspace --all-targets -D warnings` and `cargo fmt --check`; clippy for the wasm32 target with rustc 1.92 | passes, 15 tests; clippy and fmt pass |
| 2026-11-22 | `npx vitest run packages/memory` in Node 22.18.0 with fake-indexeddb 6.2.8 standing in for IndexedDB | passes, 44 tests |
| 2026-11-22 | native and wasm parity: the wasm build (rustc 1.92, simd128 on, `hm_simd` returns 1) against the native build for every hit term of 12 seeded queries over 48 seeded items and for 8 exp and ln samples (`test/parity.test.ts` against `crates/memory/tests/parity.json`) | same bits |
| 2026-11-22 | exp and ln against the host libm, in the crate tests | agree to 2e-15 relative (computed) |
| 2026-11-23 | the wasm core from file:// through the iife build, in Chrome 150 on an Apple M1, one automated pass nobody looked at | pass |
| 2026-11-24 | `npx vitest run packages/memory`: the trace parity for the linear and organic scorers, per term BM25 against the core, edit one, exchange notes and the skip of turns in view, compaction and the usage line with an injected storage manager | passes 57 tests |
| 2026-11-24 | `test/seal.test.ts`: round trip, a wrong password rejects, two seals of one value differ in bytes, a tampered byte or another context rejects, `verifyLock` true and false, the cached key, and a sealed sink whose inner rows hold none of the text | passes, 11 tests |
| 2026-11-24 | PBKDF2 SHA-256 at 210,000 iterations in Node 22.18.0 on this Mac, 5 runs | 57 to 59 ms (measured) |

### Not verified by anything

- Sealing in a real browser; only Node 22.18.0 Web Crypto ran.
- The cost of one key derivation in a browser; only Node was timed.
- `usage` and `persist` against a real browser's storage manager.
- IndexedDB in a real browser, quota errors and private windows.
- Loading from file:// in Safari, Firefox or on a phone.
- Recall quality with a real embedder (MiniLM, bge-small); only the hashed
  embedder and fakes ran.
- Speed: no timing was taken; brute force is expected to suit hundreds to
  a few thousand items, an estimate nobody has measured.
- Prefix reuse in a real runtime's KV cache; the test checks only that the
  prompt bytes grow at the end.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 14,008 bytes | 14,708 bytes |
| `wasm/memory.wasm` | 41,134 bytes | 43,190 bytes |
| `dist/single/index.iife.js` (single file build) | 14,272 bytes | 14,985 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

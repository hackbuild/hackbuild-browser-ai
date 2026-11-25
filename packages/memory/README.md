# @hackbuild/memory

Memory for agents and characters that run in a browser tab. A Rust core
(`crates/memory`, compiled to wasm32 with SIMD128) does BM25 plus flat
cosine search fused by reciprocal rank, two scorers, kind decay,
strengthening on recall and near duplicate merge. The TS package on top
keeps items in IndexedDB, caches vectors per embedder, assembles a token
budgeted context and injects recall without breaking a cached prompt
prefix. Code MIT; this README CC-BY-4.0 with the code samples also MIT.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/memory

## Use

    import { loadCore, open, hashedEmbedder, RecallConversation } from "@hackbuild/memory";
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

## Core (crates/memory)

- Items carry id, scope, kind, created and last use (hours), importance,
  arousal, valence, novelty, uses, weight, an optional place and an
  optional vector. Kinds: episode, gist, lesson, fact, rule, lore, doc,
  note.
- BM25 with k1 1.4 and b 0.75 (the defaults of earlier builds),
  statistics over the admitted scope and kinds only. The tokenizer
  lowercases, splits on anything not a letter or digit, drops stop words
  and strips ing, ed, es and s.
- Cosine over float32 vectors. The wasm build runs the dot product on
  f32x4 lanes; the native build keeps four scalar lanes in the same order,
  and neither fuses a multiply and add, so the two give the same bits.
  exp and ln are written out in the crate for the same reason: the
  platform libm differs between targets.
- Reciprocal rank fusion with k 60 over the BM25 top `cand` and the cosine
  top `cand` above a floor of 0.12.
- Linear scorer: rel is the min max normalized fused rank, rec is
  exp(-age / 72 h), final = 0.55 rel + 0.20 rec + 0.25 importance. The
  72 h is a time constant; the half-life is 0.693 of it (computed).
- Organic scorer: 0.6 sim + 0.18 retention + 0.06 emotion + 0.05 novelty
  + place + mood + recent use, with retention exp(-age / (4 + 30 imp + 20
  emo + 8 min(5, uses)) h) and place 0.08 exp(-d / 2.5).
- Both scores are multiplied by the item weight, which recall raises by
  0.02 per hit up to 1.2, along with one more use.
- Kind half-lives in hours: episode 6, gist 96, lesson 240, fact and note
  720, rule, lore and doc never; each use lengthens the half-life by 50
  percent. `decay(floor)` drops items whose retention is under the floor.
- Merge: a new text equal in tokens within 60 s, or at cosine 0.93 or
  more, in the same kind and scope strengthens the old item instead of
  adding one. `mergeNear(0.95)` folds stored duplicates into the older.
- The wasm surface is plain `extern "C"` over linear memory with no
  bindgen and no threads, so it loads from file:// as bytes or inlined
  base64. `wasm/memory.wasm` is 95 908 bytes (measured, opt-level s,
  stripped). Rebuild with `npm run build:wasm -w @hackbuild/memory`.

## Package

- `open(id, { core, embed, sink, indexedDB, scopes, now })`. The default
  sink is one IndexedDB database per id (`hackbuild-memory:<id>`, stores
  items, vectors, kv); when IndexedDB fails the memory runs on a Map and
  `status.notes` says so.
- Embedder contract: `{ id, dim, embed(texts) }`. Vectors are cached under
  the embedder id, so a model change re-embeds every item once. With no
  embedder, or after one throws, recall is keyword only and `status.mode`
  says `keyword`. `hashedEmbedder()` is a zero download unigram plus bigram
  hash (384 dims) that matches shared words only. Real choices:
  Xenova/all-MiniLM-L6-v2 (weights Apache-2.0) or BAAI/bge-small-en-v1.5
  (weights MIT) through transformers.js, wrapped by the caller.
- Query expansion: a query under 45 characters gets the previous user turn
  in front (`previous`).
- `assemble` puts core facts at priority 10, caller sections, a summary at
  6, recalled lines at 5 and recent turns at 3 into a token budget, with
  tokens estimated as characters / 3.6 (inferred from earlier builds,
  not measured on a tokenizer). `select` caps recalled lines at k 3, 1800
  characters, 2 per section, and drops a line within Jaccard 0.55 of one
  already picked.
- Prefix stable injection: `injectRecall` and `RecallConversation` add a
  fixed note to the system message and recalled lines under the latest
  user message only. Earlier messages never change, so a runtime that
  keeps the previous prompt's KV cache reuses all of it.
- Core memory: pinned facts, 700 characters at most, oldest evicted, a
  duplicate is one with the same first 40 letters and digits.
- `consolidate({ keep: 14, min: 22, summarize })` folds old episodes into
  one gist; without a summarizer the gist is a word count summary.
- `export()` gives JSON without vectors; `import()` re-embeds.
- The clock is injected (`now`); nothing in the package calls Math.random.

## Sealed at rest

    import { makeLock, deriveKey, seal, sealedSink } from "@hackbuild/memory/seal";
    const { lock } = await makeLock(password);         // keep lock beside the data
    const key = await deriveKey(password, lock);       // once per session; wrong password throws
    const mem = await open(id, { core, sink: sealedSink(await indexedDbSink(id), key) });
    const file = await seal(key, workspaceJson, "file:workspace.json");

- There is no recovery. A lost password means the sealed data is gone.
- Lock record: `{ algo: "pbkdf2-sha256", iterations, salt, hash }`,
  base64. PBKDF2 SHA-256 at 210,000 iterations gives a master once per
  derivation; HKDF SHA-256 splits it into the stored verifier and, with a
  fresh 16 byte salt on every write, an AES-GCM 256 key; every write
  also takes a fresh 12 byte iv. `verifyLock` compares in constant time.
  `deriveKey` caches the key per lock for the page's life (`cachedKey`,
  `forgetKey`). Web Crypto only, so it needs a secure origin.
- Envelope: `HBS1`, salt 16, iv 12, ciphertext, tag 16, 48 bytes over
  the input (computed). The optional context string is bound as
  additional data, so a blob moved to another item or file does not open.
- `sealedSink` seals item text and metadata, vectors and kv values.
  The inner sink still sees item ids, vector and kv key names, the
  embedder id and sizes. The keyword index is never stored; `open`
  rebuilds it in memory from the opened items. A plain row in a sealed
  store throws: to lock an existing memory, export it and import it into
  a sealed one.

## Inspector calls

    const t = await mem.explain("where does the mug go");   // no strengthening
    // t.how, t.terms [{ term, df, idf }], t.rows [{ rank, used, score, weight, parts, terms, ... }]
    const last = mem.trace(recallFromTheLastReply);          // the same object for a past recall
    await mem.edit(id, { text: "the mug goes on the top shelf" });
    const report = await mem.compact();                      // decay, merge near duplicates, fold episodes
    const u = await mem.usage();                             // counts, bytes (computed estimate), browser estimate
    await mem.persist();                                     // asks the browser to keep the origin's storage
    await mem.addExchange(userTurn, reply);                  // null under 3 meaningful words
    await mem.recall(q, { skipSaid: userTurnsInView });

Each trace row's `parts` times its `weight` is the core's score, and its
per term BM25 contributions add up to the core's `bm25`; both are
recomputed in TypeScript from the core's formulas and a port of its
tokenizer, and a test holds them equal. `edit` embeds new text again and
drops every cached vector of the old text.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-memory` passes, 15 tests (14 unit, 1
  parity fixture), with rustc 1.95 native; `cargo clippy --workspace
  --all-targets -D warnings` and `cargo fmt --check` pass, and clippy
  passes for the wasm32 target with rustc 1.92.
- 2026-11-22: `npx vitest run packages/memory` passes, 44 tests, in Node
  22.18.0 with fake-indexeddb 6.2.8 standing in for IndexedDB.
- 2026-11-22: native and wasm parity: the wasm build (rustc 1.92, simd128
  on, `hm_simd` returns 1) gives the same bits as the native build for
  every hit term of 12 seeded queries over 48 seeded items and for 8 exp
  and ln samples (`test/parity.test.ts` against
  `crates/memory/tests/parity.json`).
- exp and ln agree with the host libm to 2e-15 relative (computed in the
  crate tests).

- 2026-11-24: `npx vitest run packages/memory` passes 57 tests, the trace
  parity for the linear and organic scorers, per term BM25 against the
  core, edit one, exchange notes and the skip of turns in view,
  compaction and the usage line with an injected storage manager
  included.

- 2026-11-24: `test/seal.test.ts`, 11 tests: round trip, a wrong
  password rejects, two seals of one value differ in bytes, a tampered
  byte or another context rejects, `verifyLock` true and false, the
  cached key, and a sealed sink whose inner rows hold none of the text.

### Not verified by anything

- Sealing in a real browser; only Node 22.18.0 Web Crypto ran.
- The cost of one key derivation in a browser. In Node 22.18.0 on this
  Mac, PBKDF2 SHA-256 at 210,000 iterations took 57 to 59 ms over 5 runs
  (measured, 2026-11-24).

- `usage` and `persist` against a real browser's storage manager.

- IndexedDB in a real browser, quota errors and private windows.
- Loading from file:// in a real page.
- Recall quality with a real embedder (MiniLM, bge-small); only the hashed
  embedder and fakes ran.
- Speed: no timing was taken; brute force is expected to suit hundreds to
  a few thousand items (inferred, not measured).
- Prefix reuse in a real runtime's KV cache; the test checks only that the
  prompt bytes grow at the end.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 13,709 bytes | 14,394 bytes |
| `wasm/memory.wasm` | 41,134 bytes | 43,190 bytes |
| `dist/single/index.iife.js` (single file build) | 13,960 bytes | 14,658 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

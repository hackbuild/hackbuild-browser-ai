# @hackbuild/act

Let a language model act while it speaks: mood, gesture and posture tags in its reply fire when the voice reaches them, limited to names your avatar can realize.

[![npm](https://img.shields.io/npm/v/@hackbuild/act)](https://www.npmjs.com/package/@hackbuild/act) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 13.8 kB measured](https://img.shields.io/badge/gzip-13.8%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Takes tags such as `[happy]`, `*waves*`, `[mood: sad]` and `[happy, wave]` out of a streamed reply and hands speech the visible text.
- Holds each cue until speech reports the character offset where the tag sat, then fires it.
- Keeps names to the avatar's own moods (expression presets), gestures (one shot clips) and postures (held clips), with a strict resolver and an alias table.
- Writes the prompt block and a GBNF grammar or JSON Schema that hold a model to that vocabulary.
- Binds an avatar's expression list and clip library to the vocabulary, and infers a mood or gesture for untagged sentences in hybrid mode.

## Install

```sh
npm install @hackbuild/act
```

It depends on `@hackbuild/structured` for the streaming tag parser. `@hackbuild/memory` is an optional peer: install it when you pass an embedder for the embedding steps of the resolver, the inferrer or `pickClip`. No model ships here, and the package imports no speech engine.

## Quick start

```ts
import { buildVocabulary, createDirector, grammar, promptBlock } from "@hackbuild/act";

// the names this avatar can realize
const vocab = buildVocabulary({ expressions: ["happy", "sad", "surprised"], gestures: ["wave", "nod"], postures: ["sit"] });

// add the tag list to the system prompt; pass the grammar where the runtime takes one
const system = `You are Ada.\n\n${promptBlock(vocab)}`;
const gbnf = grammar(vocab, "gbnf");
console.log(system, gbnf);

// strip tags from the streamed reply and fire each cue when the voice reaches it
const director = createDirector({ vocab, mode: "hybrid", fire: (cue) => console.log(cue.kind, cue.name, "at", cue.at) });
director.begin();
let spoken = "";
for (const chunk of ["[happy] Hello there, ", "*waves* nice to ", "see you."]) spoken += director.feed(chunk).text;
spoken += director.finish().text;

// speech reports character offsets in the visible text it was given
director.reached(spoken.length);
```

## Live example

The package page explains the tag protocol and the install: [hackbuild-browser-ai/act](https://hackbuild.github.io/hackbuild-browser-ai/act/).

## Concepts

### the contract with speech

The text `feed` and `finish` return is what speech is given. Speech reports progress as character offsets in that same text: at each segment start, at each word timestamp and at segment end. `reached(offset)` fires every pending cue whose offset is at or before it. A cue placed behind the voice (the model was slower than speech) fires at once. The package does not import a speech engine.

### the vocabulary

`buildVocabulary(avatar)` keeps only names the avatar has. The alias table (smile, grin, laugh to happy; waves hello to wave; sit down to sit, and so on) keeps an entry only when its target exists. A missing mood falls back to a near relative (love to happy, fear to surprised) when the avatar has the relative. An alias never shadows a real name.

### the resolver

Exact name, then alias, then whole word overlap with light stemming (every word of the name must appear), then, with an embedder, the nearest name at cosine 0.55 or more. No substring matching: "walks across the room" does not become a cross gesture and "I won't lie" does not lie down. A kind of move the avatar has no clip for resolves to nothing. A tag of one kind naming another kind crosses over only on an exact name or alias.

### moods, gestures and postures

Moods are sticky and decay with a time constant of 12 s; the same mood again while it still shows (weight over 0.15) is suppressed. Gestures are one shot with a 2.5 s cooldown. Postures persist until another posture and come only from explicit tags. These three numbers are defaults chosen for the package (inferred, not measured); `moodDecayMs`, `moodFloor` and `gestureCooldownMs` change them. The clock is injected (`now`); nothing calls Math.random.

### tag parsing

Parsing rides on the streaming tag parser of `@hackbuild/structured` (every tag form it accepts), with keys `mood`, `gesture`, `posture` and `act`. Each tag is resolved again here with the strict resolver; plain tags that resolve to nothing are stage directions and are dropped from speech; parentheticals that name nothing stay. The embedding step runs for keyed tags; plain tags stay lexical.

### hybrid mode

A sentence with no tag runs through the inferrer. Keywords first, whole words and stemmed, after removing weak phrases ("i think", "no worries", "you're welcome"); with an embedder the best label must reach 0.32 and beat the runner up by 0.07. Moods and gestures only. Mode `"tags"` fires explicit tags only, and `"off"` strips tags and fires nothing.

### prompt and grammar

`promptBlock` lists at most 10 moods, 14 gestures and 6 postures, about 60 to 80 tokens (computed at 3.6 characters per token). `grammar(v, "gbnf")` allows only the vocabulary's names inside brackets and requires words, so a reply of bare tags does not pass; `grammar(v, "json-schema")` gives `{ say, mood, gesture, posture }` with enums. `director.json(obj)` places the cues of a JSON reply at offset 0.

### replay and history

`director.record()` lists which cue fired at which offset; `replay(record, fire)` fires them again when the reply is spoken again. Keep the raw tagged reply in the chat history. With tags stripped from history, 1B and 2B models stopped tagging by the third turn in the builds this protocol was drawn from (measured there, not here): the model copies its own earlier replies.

### binding an avatar's own clips

`bindActs` turns an expression list and a clip library into the three lists `buildVocabulary` takes, plus a map from each name back to its clips.

```ts
import { bindActs, buildVocabulary, createResolver, pickClip, talkingLoop, idleLoop } from "@hackbuild/act";

const binding = bindActs({ expressions: avatar.expressions, clips: library.map((c) => ({ id: c.id, name: c.name, folder: c.folder, tags: c.analysisTags })) });
const vocab = buildVocabulary(binding.acts);
const r = createResolver(vocab).resolve(tag);
const clip = r && r.kind !== "mood" ? await pickClip(binding, r.name, sentence, { rng }) : null;   // null: no clip for it, do nothing
const idle = idleLoop(binding.all);
const talk = talkingLoop(binding.all);
```

`classifyClip` sorts a clip into idle, talk, gesture, posture, dance, reaction, locomotion, action or odd through eight ordered rules (`CLIP_RULES`, data an app can extend) over folder and name, then a `walk` analysis tag; a user tag naming a class wins. Gesture, dance and reaction clips become gestures, posture clips postures, idle and talk clips loops; locomotion, action and odd clips stay out of replies. A clip name that says what it is decides alone ("sits down" with a nod analysis tag binds to sit); tags place only opaque names. Past the cap (default 14) the kinds of movement come first, most common first. Analysis tags come from you as strings; this package imports nothing from the motion libraries.

`pickClip` prefers a clip named for the thing: without an embedder the draw keeps to named clips through the injected rng; with one, named clips get a bonus. A cued pose relaxes back after a few seconds.

| constant | value |
|---|---|
| `NAMED_BONUS` | 0.15 (vendor) |
| `CUE_POSE_SECONDS` | 6 s (vendor) |

### word tables

256 words in 38 buckets (computed) feed `DEFAULT_ALIASES` and, for moods and conversational gestures only, `DEFAULT_KEYWORDS`. `hug`, `kiss` and `flirt` are in `OPTIONAL_BUCKETS`, off by default; pass them as `buckets` and as aliases to turn them on. `WEAK_WORDS` (28 single words, computed) are skipped by the keyword step beside `WEAK_PHRASES`.

## API overview

| export | what it does |
|---|---|
| [`buildVocabulary`](../../docs/api/act/README.md#buildvocabulary) | the moods, gestures, postures and aliases an avatar can realize |
| [`createDirector`](../../docs/api/act/README.md#createdirector) | strip tags from a streamed reply and fire cues at speech offsets |
| [`promptBlock`](../../docs/api/act/README.md#promptblock) | the prompt lines that list the tags a model may use |
| [`grammar`](../../docs/api/act/README.md#grammar) | a GBNF grammar or JSON Schema held to the vocabulary |
| [`createResolver`](../../docs/api/act/README.md#createresolver) | resolve a name a model wrote to a vocabulary name |
| [`createInferrer`](../../docs/api/act/README.md#createinferrer) | a mood or gesture for an untagged sentence |
| [`replay`](../../docs/api/act/README.md#replay) | fire a recorded reply's cues again at the same offsets |
| [`bindActs`](../../docs/api/act/README.md#bindacts) | bind an expression list and clip library to the vocabulary |
| [`pickClip`](../../docs/api/act/README.md#pickclip) | the clip to play for a resolved name |
| [`classifyClip`](../../docs/api/act/README.md#classifyclip) | the class of one clip |
| [`idleLoop`](../../docs/api/act/README.md#idleloop) and [`talkingLoop`](../../docs/api/act/README.md#talkingloop) | the idle and talking loop clips |
| [`DEFAULT_ALIASES`](../../docs/api/act/README.md#default_aliases) | the default word to name table |

The full reference is in [docs/api/act](../../docs/api/act/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| director, resolver, prompt, grammar | nothing | yes | yes | yes | yes |
| embedding steps | the embedder you pass | depends on it | depends on it | depends on it | depends on it |

Plain TypeScript with no WebGPU, no wasm and no browser objects; it also runs in Node and in a worker. The GBNF grammar needs a runtime that takes GBNF (wllama, llama.cpp) and the JSON Schema one that takes a schema (WebLLM XGrammar, remote json_schema); neither was compiled by a runtime here.

## Errors and troubleshooting

The package throws no errors of its own; a tag it cannot place is dropped or suppressed instead.

| message | cause | what to do |
|---|---|---|
| no cue fires | speech never calls `reached`, or reports offsets in other text | call `reached(offset)` with offsets into the text `feed` and `finish` returned |
| `onSuppressed` with `repeat` | the same mood still shows, or the same posture is held | expected; lower `moodFloor` or `moodDecayMs` to allow repeats sooner |
| `onSuppressed` with `cooldown` | a gesture inside `gestureCooldownMs` of the last | expected; lower `gestureCooldownMs` |
| a tag vanishes from speech and fires nothing | it named nothing the avatar has, so it was read as a stage direction | add the word as an alias, or add a clip for it |
| the model stops tagging after a few turns | tags were stripped from the chat history | keep the raw tagged reply in history |
| a posture never comes from speech | postures fire only from explicit tags | expected; ask the model to tag it |

## Works with

- [@hackbuild/character](../character/README.md) carries the per avatar `actions` vocabulary in its profile.
- [@hackbuild/structured](../structured/README.md) supplies the streaming tag parser this package resolves.
- [@hackbuild/chat](../chat/README.md) streams the reply you pass to `feed`.
- [@hackbuild/speak](../speak/README.md) speaks the visible text and reports the offsets for `reached`.
- [@hackbuild/memory](../memory/README.md) supplies the `Embedder` type for the embedding steps.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/act` passes, 22 tests, in Node
  22.18.0, with fake embedders: streaming placement across chunk
  boundaries, firing by offset, `[happy, wave]`, keyed tags, stage
  directions, suppression and cooldown, posture persistence, mood decay,
  hybrid inference, json style, replay, the grammar text and the JSON
  Schema.

- 2026-11-24: `npx vitest run packages/act` passes, 32 tests, in Node
  22.18.0: clip class rule order, binding by name over analysis tags,
  loops kept out of the vocabulary, the name cap, whole word matching,
  the named bonus, and the optional buckets left out.

### Not verified by anything

- The binder on a real clip library: only synthetic names ran.

- The GBNF grammar in wllama or llama.cpp, and the JSON Schema in WebLLM
  XGrammar: not compiled by a runtime.
- How often 0.5B to 4B models tag with this prompt block, with and without
  the grammar.
- Inference quality with a real embedder (a static model2vec table or
  MiniLM); only fakes ran.
- Timing against a real voice: cue offsets against word timestamps from a
  real engine, and the feel of the cooldown and decay defaults on an
  avatar, looked at by a person.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 13,779 bytes | 14,467 bytes |
| `dist/single/index.iife.js` (single file build) | 14,638 bytes | 15,369 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights; an embedder you pass carries its own weight licence.

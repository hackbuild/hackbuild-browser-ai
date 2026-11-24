# @hackbuild/act

A speech timeline action grammar for characters driven by a language
model. Tags the model places in its reply (`[happy]`, `*waves*`,
`[mood: sad]`, `[happy, wave]`) are taken out of the spoken text and fire
when the voice reaches the spot where they sat. Names are limited to what
the avatar can realize: moods (expression presets), gestures (one shot
clips) and postures (held clips). Code MIT; this README CC-BY-4.0 with the
code samples also MIT. No model ships here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/act

## Use

    import { buildVocabulary, createDirector, promptBlock, grammar } from "@hackbuild/act";

    const vocab = buildVocabulary({
      expressions: ["happy", "sad", "angry", "surprised", "relaxed"],
      gestures: ["wave", "nod", "shrug"],
      postures: ["sit", "stand"],
    });
    const system = `${persona}\n\n${promptBlock(vocab)}`;   // short category names only
    const gbnf = grammar(vocab, "gbnf");                    // or "json-schema"

    const director = createDirector({ vocab, mode: "hybrid", fire: (cue) => avatar.play(cue) });
    director.begin();
    for await (const ev of chat.stream(messages, { signal })) {
      if (ev.type === "text") voice.feed(director.feed(ev.text).text);
    }
    voice.feed(director.finish().text, true);
    voice.onProgress = (offset) => director.reached(offset);
    history.push({ role: "assistant", content: rawReply });   // keep the tags

## Bind to an avatar's own clips

`bindActs` turns an expression list and a clip library into the three
lists `buildVocabulary` takes, plus a map from each name back to its
clips.

    import { bindActs, buildVocabulary, createResolver, pickClip, talkingLoop, idleLoop } from "@hackbuild/act";

    const binding = bindActs({ expressions: avatar.expressions, clips: library.map((c) => ({ id: c.id, name: c.name, folder: c.folder, tags: c.analysisTags })) });
    const vocab = buildVocabulary(binding.acts);
    const r = createResolver(vocab).resolve(tag);
    const clip = r && r.kind !== "mood" ? await pickClip(binding, r.name, sentence, { rng }) : null;   // null: no clip for it, do nothing
    const idle = idleLoop(binding.all);
    const talk = talkingLoop(binding.all);

- Classes: `classifyClip` sorts a clip into idle, talk, gesture, posture,
  dance, reaction, locomotion, action or odd through eight ordered rules
  (`CLIP_RULES`, data an app can extend) over folder and name, then a
  `walk` analysis tag; a user tag naming a class wins. Gesture, dance and
  reaction clips become gestures, posture clips postures, idle and talk
  clips loops; locomotion, action and odd clips stay out of replies.
- Names: a clip name that says what it is decides alone ("sits down" with
  a nod analysis tag binds to sit); tags place only opaque names. Past the
  cap (default 14) the kinds of movement come first, most common first.
- `pickClip` prefers a clip named for the thing: without an embedder the
  draw keeps to named clips through the injected rng; with one, named
  clips get a 0.15 bonus (vendor). A cued pose relaxes after 6 s
  (`CUE_POSE_SECONDS`, vendor).
- Word tables: 256 words in 38 buckets (computed) feed `DEFAULT_ALIASES`
  and, for moods and conversational gestures only, `DEFAULT_KEYWORDS`.
  `hug`, `kiss` and `flirt` are in `OPTIONAL_BUCKETS`, off by default;
  pass them as `buckets` and as aliases to turn them on. `WEAK_WORDS` (28
  single words, computed) are skipped by the keyword step beside
  `WEAK_PHRASES`.

## Contract with speech

The text `feed` and `finish` return is what speech is given. Speech
reports progress as character offsets in that same text: at each segment
start, at each word timestamp and at segment end. `reached(offset)` fires
every pending cue whose offset is at or before it. A cue placed behind the
voice (the model was slower than speech) fires at once. The package does
not import a speech engine.

## Behaviour

- Vocabulary: `buildVocabulary(avatar)` keeps only names the avatar has.
  The alias table (smile, grin, laugh to happy; waves hello to wave; sit
  down to sit, and so on) keeps an entry only when its target exists. A
  missing mood falls back to a near relative (love to happy, fear to
  surprised) when the avatar has the relative. An alias never shadows a
  real name.
- Resolver: exact name, then alias, then whole word overlap with light
  stemming (every word of the name must appear), then, with an embedder,
  the nearest name at cosine 0.55 or more. No substring matching: "walks
  across the room" does not become a cross gesture and "I won't lie" does
  not lie down. A kind of move the avatar has no clip for resolves to
  nothing. A tag of one kind naming another kind crosses over only on an
  exact name or alias.
- Kinds: moods are sticky and decay with a time constant of 12 s; the
  same mood again while it still shows (weight over 0.15) is suppressed.
  Gestures are one shot with a 2.5 s cooldown. Postures persist until
  another posture and come only from explicit tags. These three numbers
  are defaults chosen for the package (inferred, not measured).
- Hybrid mode: a sentence with no tag runs through the inferrer. Keywords
  first, whole words and stemmed, after removing weak phrases ("i think",
  "no worries", "you're welcome"); with an embedder the best label must
  reach 0.32 and beat the runner up by 0.07. Moods and gestures only.
- Parsing rides on the streaming tag parser of `@hackbuild/structured`
  (every tag form it accepts), with keys `mood`, `gesture`, `posture` and
  `act`. Each tag is resolved again here with the strict resolver; plain
  tags that resolve to nothing are stage directions and are dropped from
  speech; parentheticals that name nothing stay. The embedding step runs
  for keyed tags; plain tags stay lexical.
- Prompt: `promptBlock` lists at most 10 moods, 14 gestures and 6
  postures, about 60 to 80 tokens (computed at 3.6 characters per token).
- Grammar: `grammar(v, "gbnf")` allows only the vocabulary's names inside
  brackets and requires words, so a reply of bare tags does not pass;
  `grammar(v, "json-schema")` gives `{ say, mood, gesture, posture }` with
  enums. `director.json(obj)` places the cues of a JSON reply at offset 0.
- Replay: `director.record()` lists which cue fired at which offset;
  `replay(record, fire)` fires them again when the reply is spoken again.
- History: keep the raw tagged reply in the chat history. With tags
  stripped from history, 1B and 2B models stopped tagging by the third
  turn in the builds this protocol was drawn from (measured there, not
  here): the model copies its own earlier replies.
- The clock is injected (`now`); nothing calls Math.random.

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
| `dist/index.js` (main entry, imports external) | 13,478 bytes | 14,151 bytes |
| `dist/single/index.iife.js` (single file build) | 14,268 bytes | 14,981 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

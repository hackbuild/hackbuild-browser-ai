# @hackbuild/converse

The conversation core: one turn loop over a streaming chat engine, the
history rules small models need, stop, redo, edit and remove, memory and
camera lines kept on the turn they belong to, cue replay when a reply is
spoken again, and the versioned chat session schema with a debounced
store. Framework free; state changes come out as events. Code MIT; this
README CC-BY-4.0 with the code samples also MIT.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/converse

## Use

    import { scripted } from "@hackbuild/chat";
    import { createConversation } from "@hackbuild/converse";

    const conv = createConversation({
      engine: scripted({ replies: ["[wave] hi"] }), // any ChatEngine
      now: () => Date.now(),
      system: "you are a dog",
      greeting: "woof. what are we doing",
      director,                                     // createDirector from @hackbuild/act, optional
      speaker,                                      // a Speaker from @hackbuild/speak, optional
      memory: { recall: (text) => recallLines(text) },
      seen: () => cameraNote(),
      sink: { load: (id) => docs.get(id), save: (s) => docs.put(s.id, s) },
    });
    conv.on((e) => render(e));                      // change, text, think, done, error, busy
    await conv.restore();
    await conv.send("walk time");
    // new Speaker({ ..., onProgress: (p) => conv.reached(p.offset) })

The engine, director and speaker are taken by shape (`ConverseEngine`,
`DirectorLike`, `SpeakerLike`), so this package imports none of chat, act
or speak; a `ChatEngine`, an act `Director` and a speak `Speaker` fit.

## Rules a turn keeps

- A reply with no letter or digit stays out of the next request: small
  models copy it.
- A leading assistant greeting is shown and never sent, so the request
  starts with a user turn.
- The raw reply, tags and all, goes back into history; the visible text
  is the director's output. With tags stripped, small models stop
  tagging within a few turns (vendor, from an earlier build).
- `historyLimit` keeps the newest messages, never fewer than 2, and
  reaches back to the user turn a kept reply answers.
- Memory and seen lines sit under the user turn they were recalled for,
  one tagged line each (`[memory]`, `[seen]`); the system text gains one
  fixed note for each, so it stays byte equal across turns and a prefix
  cache keeps matching.
- An empty reply is removed. A failed reply stays with `error` and is
  left out of the next request. An abort is neither: a partial reply is
  kept, an empty one removed.
- With no speaker, the cues the voice never reached fire when the reply
  ends. `speak(id)` replays the recorded cues through `replayCue` at the
  same offsets; a reply with no record runs through the director again.

## Session schema and store

`createSession`, `importSession`, `exportSession`, `migrateSession`,
`sessionMessages` and `sessionToMarkdown` hold the `.hbchat.json` shape
(version 1). They moved here from `@hackbuild/chat`, which re-exports
them for one version. `createChatStore(sink, { debounceMs, timers })`
saves nothing until `markRestored()`, waits 600 ms (vendor, from an
earlier build) after the last change, and leaves out a reply still
waiting for its first word. The conversation drives the store when given
a `sink`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-24: `npx vitest run packages/converse` passes, 15 tests, in
  Node 22.18.0, with the scripted engine of `@hackbuild/chat` and fake
  directors, speakers and sinks: a wordless reply absent from the next
  request, the greeting left out, the raw tagged reply sent back, the cap
  with its floor, an empty reply removed and a failed one kept with its
  flag, an abort with and without a partial reply, redo, edit, stats and
  tool calls, no save before restore, no save of a pending empty reply,
  cues fired at the end with no speaker, cues replayed at the same
  offsets, memory and seen lines under their turn with the system text
  byte equal, and a session round trip.
- A `ChatEngine` type checks as a `ConverseEngine` (tsc on the test file).

### Not verified by anything

- The loop against a real model, a real act director with its embedder,
  or a real voice; only the scripted engine and fakes ran.
- Whether the history rules change how often 0.5B to 4B models tag.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,598 bytes | 5,877 bytes |
| `dist/single/index.iife.js` (single file build) | 5,678 bytes | 5,961 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

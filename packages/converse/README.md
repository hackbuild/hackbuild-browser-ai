# @hackbuild/converse

Run a conversation over a streaming chat engine with the history rules small models need, and save it as a versioned chat session.

[![npm](https://img.shields.io/npm/v/@hackbuild/converse)](https://www.npmjs.com/package/@hackbuild/converse) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 5.9 kB measured](https://img.shields.io/badge/gzip-5.9%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Runs one turn loop over any streaming engine: send, stop, redo, edit, remove, speak again, restore and clear, with state changes as events.
- Keeps the history rules small models need: wordless and failed replies out, the greeting never sent, the raw tagged reply sent back, a message cap.
- Keeps memory and camera lines on the user turn they were recalled for, with a system text that stays byte equal across turns.
- Drives an optional director and speaker, and replays recorded cues when a reply is spoken again.
- Reads and writes the versioned `.hbchat.json` session schema and saves it through a debounced store.

## Install

```sh
npm install @hackbuild/converse @hackbuild/chat
```

It depends on `@hackbuild/memory`, which installs with it. No peers. The engine, director and speaker are taken by shape, so it imports none of `@hackbuild/chat`, `@hackbuild/act` or `@hackbuild/speak`; install the ones you use. The quick start uses the scripted engine of `@hackbuild/chat`.

## Quick start

```ts
import { scripted } from "@hackbuild/chat";
import { createConversation, exportSession } from "@hackbuild/converse";

// any ChatEngine from @hackbuild/chat fits; the scripted one runs no model
const engine = scripted({ replies: ["[wave] hi, ready for a walk"] });

// one conversation with a system text and a greeting that is never sent
const conv = createConversation({ engine, now: () => Date.now(), system: "you are a dog", greeting: "woof. what are we doing" });

// stream the reply text as it arrives
conv.on((e) => {
  if (e.type === "text") console.log("so far:", e.text);
});

// send a turn, then look at the next request and the saved session
const reply = await conv.send("walk time");
console.log("reply:", reply?.content, "next request:", conv.request().length, "messages");
console.log(exportSession(conv.session));
```

## Live example

The suite chat screen is the example for this package: [hackbuild-suite chat](https://hackbuild.github.io/hackbuild-suite/#/chat/chat). The package page is at [hackbuild-browser-ai/converse](https://hackbuild.github.io/hackbuild-browser-ai/converse/).

## Concepts

### engines, directors and speakers by shape

The engine, director and speaker are taken by shape (`ConverseEngine`, `DirectorLike`, `SpeakerLike`), so this package imports none of chat, act or speak. A `ChatEngine`, an act `Director` and a speak `Speaker` fit. Wire the speaker's progress back with `reached`:

```ts
// new Speaker({ ..., onProgress: (p) => conv.reached(p.offset) })
```

`createConversation` also takes `memory: { recall(text) }`, `seen: () => line`, `sink: { load, save }`, `historyLimit`, `streamOptions` and `replayCue`. Events are `change`, `text`, `think`, `done`, `error` and `busy`.

### the rules a turn keeps

- A reply with no letter or digit stays out of the next request: small models copy it.
- A leading assistant greeting is shown and never sent, so the request starts with a user turn.
- The raw reply, tags and all, goes back into history; the visible text is the director's output. With tags stripped, small models stop tagging within a few turns.
- `historyLimit` keeps the newest messages, never fewer than 2, and reaches back to the user turn a kept reply answers.
- An empty reply is removed. A failed reply stays with `error` and is left out of the next request. An abort is neither: a partial reply is kept, an empty one removed.

### memory and seen lines

Memory and seen lines sit under the user turn they were recalled for, one tagged line each (`[memory]`, `[seen]`). The system text gains one fixed note for each, so it stays byte equal across turns and a runtime prefix cache keeps matching. `buildMessages` applies these rules and the cap; `request()` shows the request the next reply would send.

### cue replay

With no speaker, the cues the voice never reached fire when the reply ends. `speak(id)` replays the recorded cues through `replayCue` at the same offsets; a reply with no record runs through the director again.

### the session schema

`createSession`, `importSession`, `exportSession`, `migrateSession`, `sessionMessages` and `sessionToMarkdown` hold the `.hbchat.json` shape (version 1). Reading keeps each known field and drops the rest, so an older file or a plain `{ messages: [{ role, content }] }` export still loads. Ids and times come from the caller; nothing here reads a clock. These moved here from `@hackbuild/chat`, which re-exports them for one version.

### the store

`createChatStore(sink, { debounceMs, timers })` saves nothing until `markRestored()`, waits `SAVE_DEBOUNCE_MS` after the last change, and leaves out a reply still waiting for its first word. The conversation drives the store when given a `sink`, and `restore()` marks it restored.

## API overview

| export | what it does |
|---|---|
| [`createConversation`](../../docs/api/converse/README.md#createconversation) | a conversation over a streaming engine, with events |
| [`buildMessages`](../../docs/api/converse/README.md#buildmessages) | the request a session sends, after the history rules |
| [`createSession`](../../docs/api/converse/README.md#createsession) | an empty session |
| [`importSession`](../../docs/api/converse/README.md#importsession) | read `.hbchat.json` text into the current version |
| [`exportSession`](../../docs/api/converse/README.md#exportsession) | a session as `.hbchat.json` text |
| [`migrateSession`](../../docs/api/converse/README.md#migratesession) | bring an older or plain export to the current version |
| [`sessionMessages`](../../docs/api/converse/README.md#sessionmessages) | a session's messages for an engine, without the history cap |
| [`sessionToMarkdown`](../../docs/api/converse/README.md#sessiontomarkdown) | a session as markdown |
| [`createChatStore`](../../docs/api/converse/README.md#createchatstore) | a debounced save of one session to a sink |
| [`SessionError`](../../docs/api/converse/README.md#sessionerror) | the error a session read throws |

The full reference is in [docs/api/converse](../../docs/api/converse/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| turn loop, history, session schema | nothing | yes | yes | yes | yes |
| reply speed | the engine you pass | engine | engine | engine | engine |

No WebGPU and no wasm in this package; it runs in a page, a worker or Node. What runs the model, and so what the browser needs, is the engine you pass.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `not a chat session: the file is not json (...)` | `importSession` got text that does not parse | check the file is a `.hbchat.json` export |
| `not a chat session: the file holds no object` | the JSON is an array or a value | pass the session object |
| `not a chat session: no messages list` | the object has no `messages` array | export the chat again, or wrap the messages as `{ messages: [...] }` |
| `not a chat session: kind ...` | `kind` is set to something other than `hackbuild.chat` | open the file with the tool that wrote it |
| `not a chat session this build reads: version ..., newest known 1` | the file is from a newer build | update `@hackbuild/converse` |
| `message N is not an object`, `message N has no known role`, `message N has no text` | one message is malformed | fix or drop that message; roles are system, user, assistant and tool |
| `the engine stopped` (on a reply's `error`) | the engine threw with no message | look at the `error` event; the reply stays flagged and out of the next request |

All of these are `SessionError` except the last, which is set on the failed reply.

## Works with

- [@hackbuild/chat](../chat/README.md) gives the `ChatEngine` the conversation streams from.
- [@hackbuild/memory](../memory/README.md) supplies the recall note and the lines kept under each turn.
- [@hackbuild/act](../act/README.md) gives the director that takes cue tags out of the visible text.
- [@hackbuild/speak](../speak/README.md) gives the speaker whose progress calls `reached`.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-24 | `npx vitest run packages/converse` in Node 22.18.0, with the scripted engine of `@hackbuild/chat` and fake directors, speakers and sinks: a wordless reply absent from the next request, the greeting left out, the raw tagged reply sent back, the cap with its floor, an empty reply removed and a failed one kept with its flag, an abort with and without a partial reply, redo, edit, stats and tool calls, no save before restore, no save of a pending empty reply, cues fired at the end with no speaker, cues replayed at the same offsets, memory and seen lines under their turn with the system text byte equal, and a session round trip | passes, 15 tests |
| 2026-11-24 | a `ChatEngine` type checks as a `ConverseEngine` (tsc on the test file) | passes |

### Not verified by anything

- The loop against a real model, a real act director with its embedder,
  or a real voice; only the scripted engine and fakes ran.
- Whether the history rules change how often 0.5B to 4B models tag.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 5,851 bytes | 6,143 bytes |
| `dist/single/index.iife.js` (single file build) | 5,988 bytes | 6,287 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

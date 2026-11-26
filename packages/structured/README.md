# @hackbuild/structured

Get a tool decision or tagged text out of a small model in the tab, in the format that model and runtime can keep to.

[![npm](https://img.shields.io/npm/v/@hackbuild/structured)](https://www.npmjs.com/package/@hackbuild/structured) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 9.4 kB measured](https://img.shields.io/badge/gzip-9.4%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Asks a `@hackbuild/chat` engine for one tool decision in five modes: constrained JSON, a Hermes prompt, native tools, inline tags, or THOUGHT and ACTION lines.
- Sanitizes JSON Schemas for grammar mode and falls back from a strict schema to a loose one, then to free text.
- Repairs broken JSON and reads the tool call shapes small models drift to.
- Stops a run on repeated parse failures, loops, garbage replies or too many pushbacks.
- Parses inline tags from a stream with their offsets in the visible text, and reads line tagged formats.

## Install

```sh
npm install @hackbuild/structured @hackbuild/chat
```

It depends on `@hackbuild/chat`, which installs with it. No peers; the runtime that runs the model is the one your chat engine loads.

## Quick start

```ts
import { scripted } from "@hackbuild/chat";
import { call, createGuards } from "@hackbuild/structured";

// any ChatEngine from @hackbuild/chat fits; the scripted one runs no model and takes schemas
const chat = scripted({ replies: ['{"thought": "it is dark", "tool_call": {"name": "lamp", "arguments": {"state": "on"}}}'] });
const tools = [{ name: "lamp", description: "switch the lamp", parameters: { type: "object", properties: { state: { type: "string" } } } }];

// guards stop a run after repeated parse failures, loops or garbage
const guards = createGuards();

// one tool decision; "auto" picks constrained JSON for an engine that takes schemas
const d = await call(chat, [{ role: "user", content: "it is dark in here" }], { tools, mode: "auto", guards });
console.log(d.mode, d.tool?.name, d.tool?.args, d.say, d.stop);
```

## Live example

The package page is at [hackbuild-browser-ai/structured](https://hackbuild.github.io/hackbuild-browser-ai/structured/).

## Concepts

### modes

| mode | what the model writes | from |
|---|---|---|
| constrained | JSON under a strict per tool `anyOf`; the loose schema after a grammar refusal; tolerant parse of free text after that | grammar constrained decoding (XGrammar, llama.cpp grammars) |
| prompt | `<tool_call>{"name", "arguments"}</tool_call>` after a `<tools>` system block | Hermes and Qwen format |
| native | the runtime's own tool calls, `tool_choice: "auto"` | WebLLM Hermes builds, remote APIs |
| tags | `[tool: argument]` inside prose | the BonziBuddy style tool grammar |
| lines | `THOUGHT:` and `ACTION: tool(a, b)`, cut at the next THOUGHT | the ReAct format |

`auto` takes native when the quirks say the runtime has tools, constrained when the engine takes schemas, prompt for tool call tag models, else lines. A reply with no tool becomes `respond_to_user` with the text. The `Decision` holds `{ mode, thought, tool: { name, args } | null, say, raw, fallback: "none" | "loose" | "text", stop }`.

### schemas for grammar mode

`sanitizeSchema` strips `minItems, maxItems, multipleOf, $schema, $id, examples, default, title, minLength, maxLength, pattern` recursively (property names are kept) and adds a root `type: "object"`. `buildAgentSchema` and `buildLooseAgentSchema` give the strict and loose agent schemas, each with the `respond_to_user` pseudo tool.

### json repair

`repairJSON` handles think blocks, fences, trailing commas, raw newlines in strings, unclosed strings and brackets. `parseLooseJSON` falls back to the largest object that parses. `parseToolDecision` reads double encoded arguments and the `tool`, `action`, `args`, `parameters` spellings.

### guards

`createGuards()` defaults to 3 parse failures, the same call 3 times in the last 6, 2 garbage replies in a row, and 3 pushbacks. `looksLikeGarbage` flags a JSON character ratio over .18 or a short run repeated six times; `fingerprint` is the name plus arguments, keys sorted, strings trimmed and lowercased. Pass the same guards to every `call` in a run.

### inline tags

`createTagParser({ keys, synonyms, lineKeys })`: `.feed(chunk)` returns visible text and the tags completed in it, each with its offset in the visible text, so a voice timeline can fire a tag when speech reaches it; `.strip(text)` gives speakable text. It reads keyed `[key:value]`, plain `*x*`, `(x)`, `[x]`, `{x}` and CJK brackets, and `key: value` lines. Values resolve exact, synonym, substring, then token overlap. Markdown bold, unresolved parentheses and unclosed brackets stay as text.

### line formats

`parseLines` reads `NAME:` tag lines whose values run to the next tag line, so code with raw newlines fits. `grabCode` takes the fenced body first. `parseAction` reads `name(a, b)`, `name a` and `["name", "a"]`. `keywordActions` maps words to actions, at most 6 actions, each at most 4 times, the vision sandbox caps.

## API overview

| export | what it does |
|---|---|
| [`call`](../../docs/api/structured/README.md#call) | one tool decision from a chat engine |
| [`pickMode`](../../docs/api/structured/README.md#pickmode) | the mode `auto` uses for an engine |
| [`hermesToolPrompt`](../../docs/api/structured/README.md#hermestoolprompt) | the Hermes and Qwen tool system text |
| [`sanitizeSchema`](../../docs/api/structured/README.md#sanitizeschema) | a schema without the keywords grammars refuse |
| [`buildAgentSchema`](../../docs/api/structured/README.md#buildagentschema) | the strict per tool agent schema |
| [`buildLooseAgentSchema`](../../docs/api/structured/README.md#buildlooseagentschema) | the loose agent schema |
| [`repairJSON`](../../docs/api/structured/README.md#repairjson) | close what the model left open |
| [`parseLooseJSON`](../../docs/api/structured/README.md#parseloosejson) | parse after repair, else the largest object |
| [`parseToolDecision`](../../docs/api/structured/README.md#parsetooldecision) | a tool choice from the shapes models write |
| [`createGuards`](../../docs/api/structured/README.md#createguards) | loop, garbage and parse failure guards |
| [`createTagParser`](../../docs/api/structured/README.md#createtagparser) | a streaming inline tag parser |
| [`parseLines`](../../docs/api/structured/README.md#parselines) | values of `NAME:` tag lines |
| [`parseAction`](../../docs/api/structured/README.md#parseaction) | a tool name and arguments from an ACTION value |

The full reference is in [docs/api/structured](../../docs/api/structured/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| parsers, guards, schemas | nothing | yes | yes | yes | yes |
| `call` | the engine you pass | engine | engine | engine | engine |
| constrained mode | an engine that takes schemas | engine | engine | engine | engine |

No WebGPU and no wasm in this package. Whether grammar mode works depends on the engine: `pickMode` reads `chat.caps.schema` and `chat.caps.tools` and falls back to prompt or lines.

## Errors and troubleshooting

This package throws no errors of its own; an engine error from `call` comes from `@hackbuild/chat`. A bad reply comes back in the `Decision`:

| message | cause | what to do |
|---|---|---|
| `stop: "parse-fails"` | 3 replies in a run held no tool the parser read | try another mode, or a larger model |
| `stop: "repeat"` | the same call 3 times in the last 6 | end the run, or tell the model the result already came back |
| `stop: "garbage"` | 2 replies in a row were mostly JSON punctuation or one repeated run | end the run and reset the guards |
| `stop: "pushbacks"` | more than 3 pushbacks | end the run |
| `fallback: "loose"` | the runtime refused the strict schema | expected on some grammars; the loose schema allows any tool name |
| `fallback: "text"` | both schemas were refused and free text was parsed | use prompt or lines mode for this engine |
| `tool: null` | nothing usable came back | count it as a parse failure and ask again |

## Works with

- [@hackbuild/chat](../chat/README.md) gives the engine `call` asks; its `caps` drive `pickMode`.
- [@hackbuild/act](../act/README.md) and [@hackbuild/converse](../converse/README.md) work with tagged replies of the kind `createTagParser` reads.
- [@hackbuild/agent](../agent/README.md) runs tool loops on decisions like these.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/structured` under Node 22.18.0 with scripted engines: sanitizer and both agent schemas, JSON repair cases, largest object scan, tool decision shapes, every guard, the tag parser on whole text and one character at a time with offsets, resolution order, line parsing with markdown decoration, action forms, keyword caps, mode choice, and each of the five modes including the strict to loose fallback and guards across calls | passes 24 tests |

### Not verified by anything

- Any real model. Not run: whether XGrammar in WebLLM compiles the
  sanitized strict anyOf for a given tool list, how often a 0.5B to 4B model
  stays inside each mode, and which mode works best per model; those need a
  browser run with weights.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 9,352 bytes | 9,819 bytes |
| `dist/single/index.iife.js` (single file build) | 9,825 bytes | 10,316 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

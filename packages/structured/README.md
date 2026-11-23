# @hackbuild/structured

Structured output for small models in the tab: five ways to get a tool
decision out of a `@hackbuild/chat` engine, the schema sanitizer and loose
fallback for grammar mode, JSON repair, loop and garbage guards, a
streaming inline tag parser and line tagged formats. Code MIT; this README
CC-BY-4.0 with the code samples also MIT.

    npm install @hackbuild/structured

## One decision

    import { call, createGuards } from "@hackbuild/structured";

    const guards = createGuards();                   // parse fails 3, repeat 3 of 6, garbage 2, pushbacks 3
    const d = await call(chat, messages, { tools, mode: "auto", quirks: record.quirks, guards });
    // { mode, thought, tool: { name, args } | null, say, raw, fallback: "none" | "loose" | "text", stop }

| mode | what the model writes | from |
|---|---|---|
| constrained | JSON under a strict per tool `anyOf`; the loose schema after a grammar refusal; tolerant parse of free text after that | satchel-chat |
| prompt | `<tool_call>{"name", "arguments"}</tool_call>` after a `<tools>` system block | Hermes and Qwen format |
| native | the runtime's own tool calls, `tool_choice: "auto"` | WebLLM Hermes builds, remote APIs |
| tags | `[tool: argument]` inside prose | companion and BonziBuddy grammar |
| lines | `THOUGHT:` and `ACTION: tool(a, b)`, cut at the next THOUGHT | SHIM |

`auto` takes native when the quirks say the runtime has tools, constrained
when the engine takes schemas, prompt for tool call tag models, else lines.
A reply with no tool becomes `respond_to_user` with the text.

## Parts

- `sanitizeSchema` strips `minItems, maxItems, multipleOf, $schema, $id,
  examples, default, title, minLength, maxLength, pattern` recursively
  (property names are kept) and adds a root `type: "object"`.
- `buildAgentSchema` and `buildLooseAgentSchema` give the strict and loose
  agent schemas, each with the `respond_to_user` pseudo tool.
- `repairJSON` handles think blocks, fences, trailing commas, raw newlines
  in strings, unclosed strings and brackets. `parseLooseJSON` falls back to
  the largest object that parses. `parseToolDecision` reads double encoded
  arguments and the `tool`, `action`, `args`, `parameters` spellings.
- `createGuards` with `looksLikeGarbage` (JSON character ratio over .18, or
  a short run repeated six times) and `fingerprint` (name plus arguments,
  keys sorted, strings trimmed and lowercased).
- `createTagParser({ keys, synonyms, lineKeys })`: `.feed(chunk)` returns
  visible text and the tags completed in it, each with its offset in the
  visible text; `.strip(text)` gives speakable text. Keyed `[key:value]`,
  plain `*x*`, `(x)`, `[x]`, `{x}` and CJK brackets, and `key: value` lines.
  Values resolve exact, synonym, substring, then token overlap. Markdown
  bold, unresolved parentheses and unclosed brackets stay as text.
- `parseLines`, `grabCode` (fenced body first), `parseAction` for
  `name(a, b)`, `name a`, `["name", "a"]`, and `keywordActions` (at most 6
  actions, each at most 4 times, the vision sandbox caps).

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/structured` passes 24 tests under
  Node 22.18.0 with scripted engines: sanitizer and both agent schemas,
  JSON repair cases, largest object scan, tool decision shapes, every
  guard, the tag parser on whole text and one character at a time with
  offsets, resolution order, line parsing with markdown decoration, action
  forms, keyword caps, mode choice, and each of the five modes including
  the strict to loose fallback and guards across calls.

### Not verified by anything

- Any real model. Not run: whether XGrammar in WebLLM compiles the
  sanitized strict anyOf for a given tool list, how often a 0.5B to 4B model
  stays inside each mode, and which mode works best per model; those need a
  browser run with weights and are listed for the phase C agent package.

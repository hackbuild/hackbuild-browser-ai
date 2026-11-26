# @hackbuild/agent

Run an agent turn sized for small models in a browser tab: perceive, recall, decide, act and reflect, over tools you give it.

[![npm](https://img.shields.io/npm/v/@hackbuild/agent)](https://www.npmjs.com/package/@hackbuild/agent) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 12.5 kB measured](https://img.shields.io/badge/gzip-12.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Runs a tool loop on a forced JSON turn contract, stepping down to a looser schema and then free text, with guards from `@hackbuild/structured`.
- Gives you a reflex brain of regex rules that works with no model and also writes hints for the smallest models.
- Keeps persistent goals with planners that need no model, skip lists, blocking and one report per ended goal.
- Builds a token budgeted context from ranked sections and memory, and caches plans that worked.
- Chains planners (model, scripted, reflex) and records why each one stepped down.

## Install

```sh
npm install @hackbuild/agent
```

It depends on `@hackbuild/chat`, `@hackbuild/structured` and `@hackbuild/memory`, which install with it; there are no peers. No model ships here: the brain is a chat engine you create with `@hackbuild/chat`, or none.

## Quick start

```ts
import { createAgent, Reflex, ToolError, type Tool } from "@hackbuild/agent";

// tools the agent can call; a ToolError is read back to the model in first person
const tools: Tool[] = [
  { name: "go_to", description: "walk to a place", parameters: { type: "object", properties: { place: { type: "string", enum: ["table", "shelf"] } }, required: ["place"] }, run: ([place]) => `at the ${place}` },
  { name: "pick_up", description: "pick up a thing", parameters: { type: "object", properties: { thing: { type: "string" } }, required: ["thing"] }, run: ([thing]) => {
    if (thing !== "mug") throw new ToolError(`i do not see a ${thing} here.`);
  } },
];

// rules that map a clause to steps with no model
const reflex = new Reflex().add(/^go to (?:the )?(\w+)/, (m) => [{ tool: "go_to", args: [m[1]!] }]).add(/^pick up (?:the )?(.+)/, (m) => [{ tool: "pick_up", args: [m[1]!] }]);

// brain: pass a ChatEngine from @hackbuild/chat for model turns; null runs the reflex brain alone
const agent = createAgent({ tools, brain: null, mode: "reflex", soul: "You are a helpful robot.", reflex, onSay: (text) => console.log(text) });

// one heard turn: how it ended, each step's result, and the running cost
const turn = await agent.handle("go to the table, then pick up the mug", "heard");
console.log(turn.ended, turn.results.map((r) => `${r.step.tool}: ${r.text}`), agent.cost);
```

## Live example

The package page explains the turn and the install: [hackbuild-browser-ai/agent](https://hackbuild.github.io/hackbuild-browser-ai/agent/).

## Concepts

### the turn contract

The model replies `{"think", "say", "do": [["tool", "arg"]], "done"}`. It is asked for with a JSON Schema (tool names as an enum in the first slot, `do` capped at 3 items of 1 to 3 strings), then a looser schema with any strings, then free text; the chat engine walks that ladder. The tolerant parser strips think blocks, takes the largest object that parses, accepts `do`, `actions`, `plan` or `steps`, items as arrays, objects with `tool|name|action` and `args|arguments|parameters`, or `"tool(a, b)"` strings, keeps known tools only and at most 4. When nothing parses the text becomes `say` with `done` set.

### say streams

`onSay` gets the say text as soon as it is readable in the JSON, ahead of the closing brace, so speech starts while the plan is still being written. Each call carries the new piece only; a call with `final` true and empty text ends each say.

### tools and steps

Steps run in order and stop at the first failure. Results go back to the model as `DONE THIS TURN`; a `ToolError` message is read verbatim, so write it in first person. Arguments are written positionally and map onto the schema's properties in order; they are checked against the tool's schema (required count, enums, numbers) with a first person complaint.

### escalation

Per turn: an empty plan switches hints on the first time and ends the turn the second; two failures switch hints on and mark the goal for coaching; five failures, or the same failing plan twice, end the turn; garbage replies are never spoken and two in a row end the turn; a call repeated 3 times in the last 6 ends it. When the 6 model calls of a heard turn run out, the request becomes a custom goal.

### modes

`model` lets the model decide. `hints` adds `HINT, a simple way to do the next part` to every call, from the goal planner or the reflex brain run dry. `reflex` runs the rules first and gives the model only requests they cannot map. With no model, the reflex brain and goal planners are the whole agent; free ticks pick an `idle` plan with the injected Rng.

### context

The system message holds the soul, body rules, the tool list and the turn contract. The user message holds fixed lines (what was heard, the host's fixed lines, the goal, the hint, done this turn) and then ranked sections added while they fit the budget: the host's sections, LESSONS at 7, YOU REMEMBER at 5, LAST TURNS at 3. This is `budget()` from `@hackbuild/memory`.

| setting | default |
|---|---|
| `budgetTokens` | 1000 tokens at 3.6 characters per token (inferred) |
| `steps` (model calls per heard turn) | 6 |
| `goalSteps` (model calls per goal turn) | 14 |
| `maxActions` (steps per model call) | 3 |
| `cacheSize` | 60 |

### plan cache

A heard request that ended done with no failures and at most 6 steps is stored by normalized text, 60 entries, least recently used dropped first; a failure on a cached plan evicts it.

### goals

Kinds explore, find, fetch, collect, tidy and custom are read from the request, plus any kind with a planner. A planner returns the next steps, done or failed from the host's state; run dry (`peek`) it gives hints to a model and detects completion. An object that fails twice goes on the goal's skip list and becomes a lesson; a goal is blocked after 7 tries with no model or 5 tries without progress with one; an ended goal is reported once (`handle("", "report")`). Goals persist through a sink as `{ ver: 1, goals }`, at most 24, oldest ended ones dropped first; `storageSink(localStorage)` is one.

### reflect

Each turn writes an episode line to memory and to LAST TURNS; lessons go to memory and to LESSONS. The clock and Rng are injected; nothing calls Math.random.

### the planner fallback chain

`createPlannerChain` tries the model planner, then a scripted planner, then the reflex brain, and records each step down with its reason: `absent`, `loading`, `error`, `invalid` (no valid plan after `tries` model calls, default 3), `no-answer` (every reply empty, as when the scripted planner has nothing for the request), `aborted` or `no-match`. `dropLine` turns a drop into the line a room shows.

```ts
import { createPlannerChain, dropLine, Reflex } from "@hackbuild/agent";
import { scripted } from "@hackbuild/chat";

const chain = createPlannerChain({
  tools: registry.names,
  getModel: () => brain,                 // null until a brain loads
  loading: () => brainLoading,
  scripted: scripted({ replies: cannedPlans }),
  reflex,
});
const r = await chain.plan({ text: heard, messages });
if (r) await run(r.plan.do);
for (const d of chain.lastDrops) inspector.push(dropLine(d), d.raw);
// "the brain returned no valid plan three times. reflexes took over."
```

`chain.log` keeps the last 50 drops for the mind tab; each drop carries the tier it left, the tier that took over, the tries spent and the last raw reply.

## API overview

| export | what it does |
|---|---|
| [`createAgent`](../../docs/api/agent/README.md#createagent) | make an agent from tools, a brain, a soul and options |
| [`Agent`](../../docs/api/agent/README.md#agent) | runs turns with `handle`, stops one with `cancel`, counts `cost` |
| [`ToolError`](../../docs/api/agent/README.md#toolerror) | a tool failure the model reads verbatim |
| [`Reflex`](../../docs/api/agent/README.md#reflex) | regex rules that map clauses to steps with no model |
| [`Goals`](../../docs/api/agent/README.md#goals) | persistent goals with planners, skip lists and reports |
| [`storageSink`](../../docs/api/agent/README.md#storagesink) | keep goals in localStorage or any string store |
| [`createPlannerChain`](../../docs/api/agent/README.md#createplannerchain) | model, scripted, then reflex planning with a drop log |
| [`dropLine`](../../docs/api/agent/README.md#dropline) | one line saying why a tier dropped |
| [`parsePlan`](../../docs/api/agent/README.md#parseplan) | read a model reply into a plan, tolerating drift |
| [`planSchema`](../../docs/api/agent/README.md#planschema) | the JSON Schema of the turn contract |
| [`PlanCache`](../../docs/api/agent/README.md#plancache) | plans that worked, by normalized request |
| [`createRegistry`](../../docs/api/agent/README.md#createregistry) | tools by name with prompt lines, checks and a runner |

The full reference is in [docs/api/agent](../../docs/api/agent/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| reflex brain, goals, cache, chain | nothing | yes | yes | yes | yes |
| model turns | the chat engine you pass | depends on it | depends on it | depends on it | depends on it |
| `storageSink(localStorage)` | localStorage | yes | yes | yes | yes |

The agent itself is plain TypeScript with no WebGPU and no wasm; it also runs in Node and in a worker. Schema support differs between runtimes: `prefixItems` support differs between WebLLM XGrammar, wllama json_schema and remote json_schema endpoints (unknown which accept it), and the looser schema and free text are the fallback.

## Errors and troubleshooting

The agent throws no errors of its own; failures come back as step results the model reads, as `TurnResult.ended`, or as chain drops.

| message | cause | what to do |
|---|---|---|
| `i do not know how to <tool>. i can: <tools>.` | the plan named a tool the registry lacks | expected for drifted replies; check the tool names in the prompt |
| `<tool> needs <args>; i was given <args>.` | fewer arguments than the schema requires | expected; the model reads it and tries again |
| `i cannot <tool> <arg>: <param> is one of <values>.` | an argument outside the enum | expected; check the enum matches what the host offers |
| `<param> for <tool> is a number; i was given <arg>.` | a non numeric argument for a number | expected; the model reads it and tries again |
| `<tool> failed: <message>` | a tool threw an error that is not a `ToolError` | throw `ToolError` with a first person sentence for expected failures |
| `i was stopped.` | the turn was cancelled during a step | expected after `cancel()` |
| `i do not know how to do that yet.` (turn ends `no-brain`) | `brain: null`, and no rule, cache entry or planner mapped the request | add a reflex rule, or pass a chat engine as the brain |
| `the brain returned no valid plan three times. reflexes took over.` | the model tier of the chain gave no valid plan in `tries` calls | try a larger model, the looser schema, or hints mode |
| `no brain loaded.` | the chain's model tier is absent | expected until `getModel` returns an engine |

## Works with

- [@hackbuild/chat](../chat/README.md) supplies the brain, the JSON Schema ladder and `scripted` for the chain's scripted tier.
- [@hackbuild/structured](../structured/README.md) supplies the loose JSON parser and the garbage and repeat guards.
- [@hackbuild/memory](../memory/README.md) supplies `budget()` for the context and can back `AgentMemory`.
- [@hackbuild/character](../character/README.md) can supply the soul from a character card.
- [@hackbuild/act](../act/README.md) can turn the say text into timed moods and gestures on an avatar.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package loads no model and no weights; the brain you pass carries its own weight licence (for instance Qwen2.5 Instruct, Apache-2.0; Gemma 3, Gemma terms).

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `npx vitest run packages/agent` in Node 22.18.0 with scripted chat engines and fake tools: the contract and drifted shapes, say streaming across chunks with escapes, schema refusal falling back to free text, each escalation rule, the garbage guard, the plan cache and eviction, memory in and out, the context budget, reflex only turns, a tidy goal by planner with a skip list, persistence and a single report, blocking after 7 tries, idle picks | passes, 23 tests |
| 2026-11-24 | `npx vitest run packages/agent`; the planner chain with scripted engines: a valid model plan, three invalid replies stepping down to scripted, reflexes taking over with the absent tier recorded, an error, loading, no brain, nothing left, and a plan function as a tier | passes, 31 tests |

### Not verified by anything

- The planner chain in a room with a real brain.
- Any real model: how often 0.5B to 4B models (Qwen2.5 0.5B and 1.5B
  Instruct, Apache-2.0; Gemma 3 1B, Gemma terms) return a usable plan
  under the schema, the looser schema and free text.
- The schema in WebLLM XGrammar, wllama json_schema and remote
  json_schema endpoints; `prefixItems` support differs between them.
- Hints mode helping small models: not measured.
- Time to first spoken word with `onSay` against a real voice.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 12,542 bytes | 13,169 bytes |
| `dist/single/index.iife.js` (single file build) | 14,488 bytes | 15,212 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

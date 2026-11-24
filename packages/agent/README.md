# @hackbuild/agent

An agent turn sized for small models in a browser tab: perceive, recall,
decide, act, reflect. A tool loop with forced JSON and fallbacks, guards
from `@hackbuild/structured`, a reflex brain that works with no model and
also writes hints for the smallest ones, persistent goals with planners
that need no model, a token budgeted context and a plan cache. Code MIT;
this README CC-BY-4.0 with the code samples also MIT. No model ships here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/agent

## Use

    import { createAgent, Reflex, Goals, storageSink, ToolError } from "@hackbuild/agent";

    const tools = [
      { name: "go_to", description: "walk to a place",
        parameters: { type: "object", properties: { place: { type: "string", enum: ["table", "shelf"] } }, required: ["place"] },
        run: async ([place]) => { await body.walk(place); } },
      { name: "pick_up", description: "pick up a thing",
        parameters: { type: "object", properties: { thing: { type: "string" } }, required: ["thing"] },
        run: async ([thing]) => {
          if (body.dist(thing) > 0.6) throw new ToolError(`that is ${body.dist(thing).toFixed(1)} m away. i walk closer first.`);
          await body.grab(thing);
        } },
    ];
    const reflex = new Reflex().add(/^pick up (?:the )?(.+)/, (m) => [{ tool: "pick_up", args: [m[1]] }]);
    const goals = new Goals({ sink: storageSink(localStorage) }).planner("tidy", (goal, state) => nextTidyStep(goal, state));
    await goals.load();

    let sayText = ""; // onSay sends new pieces; voice.feed takes the text so far
    const agent = createAgent({
      tools, brain: chatEngine /* or null for reflex only */, mode: "model", soul,
      reflex, goals, memory: { recall: (q) => recallLines(q), write: (kind, text) => mem.add(text, { kind }) },
      perceive: () => ({ sections: [{ name: "options", priority: 9, text: "YOU CAN DO NOW\n..." }], state }),
      onSay: (piece, final) => {
        sayText += piece;
        voice.feed(sayText, final);
        if (final) sayText = "";
      },
    });
    const turn = await agent.handle("put the mug on the shelf", "heard");
    turn.ended;   // done, empty, failures, repeat, steps, guard, aborted, reflex, cache, planner, no-brain
    agent.cost;   // model calls, reflex hits, cache hits, last prompt tokens, last reply ms

## The turn

- Contract: `{"think", "say", "do": [["tool", "arg"]], "done"}`. Asked for
  with a JSON Schema (tool names as an enum in the first slot, `do` capped
  at 3 items of 1 to 3 strings), then a looser schema with any strings,
  then free text; the chat engine walks that ladder. The tolerant parser
  strips think blocks, takes the largest object that parses, accepts `do`,
  `actions`, `plan` or `steps`, items as arrays, objects with
  `tool|name|action` and `args|arguments|parameters`, or `"tool(a, b)"`
  strings, keeps known tools only and at most 4. When nothing parses the
  text becomes `say` with `done` set.
- `say` streams: `onSay` gets the say text as soon as it is readable in
  the JSON, ahead of the closing brace, so speech starts while the plan
  is still being written.
- Steps run in order and stop at the first failure. Results go back to
  the model as `DONE THIS TURN`; a `ToolError` message is read verbatim,
  so write it in first person. Arguments are checked against the tool's
  schema (required count, enums, numbers) with a first person complaint.
- Escalation per turn: an empty plan switches hints on the first time and
  ends the turn the second; two failures switch hints on and mark the goal
  for coaching; five failures, or the same failing plan twice, end the
  turn; garbage replies are never spoken and two in a row end the turn;
  a call repeated 3 times in the last 6 ends it. When the 6 model calls
  of a heard turn run out, the request becomes a custom goal.
- Modes: `model`; `hints`, where every call carries `HINT, a simple way to
  do the next part` from the goal planner or the reflex brain run dry;
  `reflex`, where the rules run first and the model gets only requests
  they cannot map. With no model, the reflex brain and goal planners are
  the whole agent; free ticks pick an `idle` plan with the injected Rng.
- Context: the system message holds the soul, body rules, the tool list
  and the turn contract. The user message holds fixed lines (what was
  heard, the host's fixed lines, the goal, the hint, done this turn) and
  then ranked sections added while they fit the budget (default 1000
  tokens at 3.6 characters per token, inferred from earlier builds):
  the host's sections, LESSONS at 7, YOU REMEMBER at 5, LAST TURNS at 3.
  This is `budget()` from `@hackbuild/memory`.
- Plan cache: a heard request that ended done with no failures and at
  most 6 steps is stored by normalized text, 60 entries; a failure on a
  cached plan evicts it.
- Goals: kinds explore, find, fetch, collect, tidy and custom read from
  the request, plus any kind with a planner. An object that fails twice
  goes on the goal's skip list and becomes a lesson; a goal is blocked
  after 7 tries with no model or 5 tries without progress with one; an
  ended goal is reported once (`handle("", "report")`). Goals persist
  through a sink as `{ ver: 1, goals }`, at most 24.
- Reflect: each turn writes an episode line to memory and to LAST TURNS;
  lessons go to memory and to LESSONS.
- Clock and Rng are injected; nothing calls Math.random.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/agent` passes, 23 tests, in Node
  22.18.0, with scripted chat engines and fake tools: the contract and
  drifted shapes, say streaming across chunks with escapes, schema
  refusal falling back to free text, each escalation rule, the garbage
  guard, the plan cache and eviction, memory in and out, the context
  budget, reflex only turns, a tidy goal by planner with a skip list,
  persistence and a single report, blocking after 7 tries, idle picks.

### Not verified by anything

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
| `dist/index.js` (main entry, imports external) | 10,395 bytes | 10,914 bytes |
| `dist/single/index.iife.js` (single file build) | 12,329 bytes | 12,945 bytes |

Measured 2026-11-23 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

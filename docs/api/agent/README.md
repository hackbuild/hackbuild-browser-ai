# @hackbuild/agent

## Classes

### Agent

Runs agent turns: perceive, recall, decide, act and reflect, over the tools, brain, reflex brain and goals it was given.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-s"></a> `S` | `unknown` |

#### Constructors

##### Constructor

```ts
new Agent<S>(o): Agent<S>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`AgentOptions`](#agentoptions)\<`S`\> |

###### Returns

[`Agent`](#agent)\<`S`\>

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-cache"></a> `cache` | `readonly` | [`PlanCache`](#plancache) |
| <a id="property-cost"></a> `cost` | `readonly` | [`Cost`](#cost) |
| <a id="property-tools"></a> `tools` | `readonly` | [`Registry`](#registry) |

#### Methods

##### cancel()

```ts
cancel(): void;
```

Stop the running turn; tools see the signal.

###### Returns

`void`

##### context()

```ts
context(p): object;
```

Budgeted user message for one model call.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | \{ `done`: [`StepResult`](#stepresult)[]; `goal`: [`Goal`](#goal) \| `null`; `heard`: `string` \| `null`; `hint`: `string`; `perception`: [`Perception`](#perception)\<`S`\>; `recalled`: `string`[]; `why`: [`Why`](#why); \} |
| `p.done` | [`StepResult`](#stepresult)[] |
| `p.goal` | [`Goal`](#goal) \| `null` |
| `p.heard` | `string` \| `null` |
| `p.hint` | `string` |
| `p.perception` | [`Perception`](#perception)\<`S`\> |
| `p.recalled` | `string`[] |
| `p.why` | [`Why`](#why) |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `dropped` | `string`[] |
| `kept` | `string`[] |
| `text` | `string` |

##### handle()

```ts
handle(text, why?): Promise<TurnResult>;
```

One turn. `text` is what was heard for "heard"; ignored otherwise.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `why?` | [`Why`](#why) | `"heard"` |

###### Returns

`Promise`\<[`TurnResult`](#turnresult)\>

##### hint()

```ts
hint(
   heard, 
   goal, 
   state
): string;
```

A hint for the next part: the goal planner run dry, else the reflex brain.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `heard` | `string` \| `null` |
| `goal` | [`Goal`](#goal) \| `null` |
| `state` | `S` \| `undefined` |

###### Returns

`string`

##### system()

```ts
system(): string;
```

The system message: soul, body, tools, the turn contract.

###### Returns

`string`

***

### Goals

Persistent goals with a planner per kind, skip lists, blocking and one report per ended goal.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-s-1"></a> `S` | `unknown` |

#### Constructors

##### Constructor

```ts
new Goals<S>(o?): Goals<S>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o?` | [`GoalsOptions`](#goalsoptions)\<`S`\> |

###### Returns

[`Goals`](#goals)\<`S`\>

#### Methods

##### active()

```ts
active(): Goal | null;
```

###### Returns

[`Goal`](#goal) \| `null`

##### add()

```ts
add(
   kind, 
   target, 
   text
): Promise<Goal>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | [`GoalKind`](#goalkind) |
| `target` | `string` \| `null` |
| `text` | `string` |

###### Returns

`Promise`\<[`Goal`](#goal)\>

##### coach()

```ts
coach(goal): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |

###### Returns

`Promise`\<`void`\>

##### end()

```ts
end(
   goal, 
   status, 
   note
): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |
| `status` | `"done"` \| `"blocked"` \| `"failed"` |
| `note` | `string` |

###### Returns

`Promise`\<`void`\>

##### failed()

```ts
failed(
   goal, 
   object, 
   why
): Promise<string | null>;
```

Record a failure on an object. Returns a lesson when the object goes on the skip list.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |
| `object` | `string` |
| `why` | `string` |

###### Returns

`Promise`\<`string` \| `null`\>

##### list()

```ts
list(): readonly Goal[];
```

###### Returns

readonly [`Goal`](#goal)[]

##### load()

```ts
load(): Promise<void>;
```

###### Returns

`Promise`\<`void`\>

##### parse()

```ts
parse(text): 
  | {
  kind: GoalKind;
  target: string | null;
}
  | null;
```

Read a goal out of a request, or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

  \| \{
  `kind`: [`GoalKind`](#goalkind);
  `target`: `string` \| `null`;
\}
  \| `null`

##### peek()

```ts
peek(goal, state): GoalStep | null;
```

The planner run dry: the next steps, done or failed, with no side effect. null when the kind has no planner.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |
| `state` | `S` |

###### Returns

[`GoalStep`](#goalstep) \| `null`

##### planner()

```ts
planner(kind, fn): this;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | [`GoalKind`](#goalkind) |
| `fn` | [`Planner`](#planner-1)\<`S`\> |

###### Returns

`this`

##### takeReports()

```ts
takeReports(): Promise<Goal[]>;
```

Goals that ended and have not been reported; each is returned once.

###### Returns

`Promise`\<[`Goal`](#goal)[]\>

##### tried()

```ts
tried(
   goal, 
   progress, 
   by
): Promise<boolean>;
```

Record one try. Returns true when the goal is now blocked.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |
| `progress` | `boolean` |
| `by` | `"reflex"` \| `"model"` |

###### Returns

`Promise`\<`boolean`\>

***

### PlanCache

A least recently used cache of plans that worked, keyed by normalized request text.

#### Constructors

##### Constructor

```ts
new PlanCache(size?): PlanCache;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `size?` | `number` | `60` |

###### Returns

[`PlanCache`](#plancache)

#### Properties

| Property | Modifier | Type | Default value |
| ------ | ------ | ------ | ------ |
| <a id="property-size"></a> `size` | `readonly` | `number` | `60` |

#### Accessors

##### length

###### Get Signature

```ts
get length(): number;
```

###### Returns

`number`

#### Methods

##### evict()

```ts
evict(text): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

`void`

##### get()

```ts
get(text): Step[] | null;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

[`Step`](#step)[] \| `null`

##### set()

```ts
set(text, steps): void;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `steps` | [`Step`](#step)[] |

###### Returns

`void`

***

### Reflex

The reflex brain: regex rules that map each clause of a request to steps, with no model.

#### Constructors

##### Constructor

```ts
new Reflex(): Reflex;
```

###### Returns

[`Reflex`](#reflex)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### add()

```ts
add(re, plan): this;
```

Add a rule. The first matching rule per clause wins.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `re` | `RegExp` |
| `plan` | [`Step`](#step)[] \| [`ReflexPlan`](#reflexplan) |

###### Returns

`this`

##### clause()

```ts
clause(c): Step[] | null;
```

Steps for one clause, or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | `string` |

###### Returns

[`Step`](#step)[] \| `null`

##### parse()

```ts
parse(text): ReflexResult | null;
```

Map a request. null when no clause mapped at all.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

###### Returns

[`ReflexResult`](#reflexresult) \| `null`

***

### SayStream

Pulls the `say` string out of a JSON reply while it streams, so speech
starts before the object closes. `push(chunk)` returns the newly readable
part of the say text (escapes decoded).

#### Constructors

##### Constructor

```ts
new SayStream(): SayStream;
```

###### Returns

[`SayStream`](#saystream)

#### Accessors

##### closed

###### Get Signature

```ts
get closed(): boolean;
```

###### Returns

`boolean`

#### Methods

##### push()

```ts
push(chunk): string;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `chunk` | `string` |

###### Returns

`string`

***

### ToolError

A failure written for the model, in first person: "that is 1.4 m away. i walk closer first."

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new ToolError(message): ToolError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |

###### Returns

[`ToolError`](#toolerror)

###### Overrides

`Error.constructor`

## Interfaces

### AgentMemory

The memory the agent reads and writes: `recall` returns lines for a query, `write` stores an episode or a lesson.

#### Methods

##### recall()

```ts
recall(query): string[] | Promise<string[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |

###### Returns

`string`[] \| `Promise`\<`string`[]\>

##### write()

```ts
write(kind, text): void | Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `kind` | `"episode"` \| `"lesson"` |
| `text` | `string` |

###### Returns

`void` \| `Promise`\<`void`\>

***

### AgentOptions

Options for `createAgent`: tools, brain, mode, soul, perception, memory, reflex, goals, budgets, clock, rng and callbacks.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s-2"></a> `S` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-body"></a> `body?` | `string` | Body rules and anything else that belongs in the system message. |
| <a id="property-brain"></a> `brain?` | `ChatEngine` \| `null` | - |
| <a id="property-budgettokens"></a> `budgetTokens?` | `number` | Context budget in tokens. Default 1000. |
| <a id="property-cachesize"></a> `cacheSize?` | `number` | Plan cache entries. Default 60. |
| <a id="property-estimate"></a> `estimate?` | (`s`) => `number` | - |
| <a id="property-goals"></a> `goals?` | [`Goals`](#goals)\<`S`\> | - |
| <a id="property-goalsteps"></a> `goalSteps?` | `number` | Model calls per goal turn. Default 14. |
| <a id="property-guards"></a> `guards?` | `GuardOptions` | - |
| <a id="property-idle"></a> `idle?` | [`Step`](#step)[][] | Things to do on a free tick with no model; one is picked by `rng`. |
| <a id="property-maxactions"></a> `maxActions?` | `number` | Steps per model call. Default 3. |
| <a id="property-maxtokens"></a> `maxTokens?` | `number` | - |
| <a id="property-memory"></a> `memory?` | [`AgentMemory`](#agentmemory) | - |
| <a id="property-mode"></a> `mode?` | `"reflex"` \| `"model"` \| `"hints"` | - |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onevent"></a> `onEvent?` | (`e`) => `void` | - |
| <a id="property-onsay"></a> `onSay?` | (`text`, `final`) => `void` | Say text as soon as it is readable, ahead of the JSON closing. `text` is the new piece only; final true, with empty text, ends each say. |
| <a id="property-perceive"></a> `perceive?` | () => \| [`Perception`](#perception)\<`S`\> \| `Promise`\<[`Perception`](#perception)\<`S`\>\> | - |
| <a id="property-reflex"></a> `reflex?` | [`Reflex`](#reflex) | - |
| <a id="property-rng"></a> `rng?` | [`Rng`](#rng) | - |
| <a id="property-soul"></a> `soul` | `string` | - |
| <a id="property-steps"></a> `steps?` | `number` | Model calls per heard turn. Default 6. |
| <a id="property-temperature"></a> `temperature?` | `number` | - |
| <a id="property-tools-1"></a> `tools` | readonly [`Tool`](#tool)[] | - |

***

### ChainOptions

Options for `createPlannerChain`: tool names, the three tiers, tries, generation settings, the clock and the drop log size.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-getmodel"></a> `getModel?` | () => `ChatEngine` \| [`PlanFn`](#planfn) \| `null` | Read the model planner at each call instead, for a brain that loads or changes later. |
| <a id="property-keep"></a> `keep?` | `number` | Drops kept in `log`. Default 50. |
| <a id="property-loading"></a> `loading?` | () => `boolean` | True while the model is still loading; the chain steps down with reason "loading". |
| <a id="property-maxactions-1"></a> `maxActions?` | `number` | - |
| <a id="property-maxtokens-1"></a> `maxTokens?` | `number` | - |
| <a id="property-model"></a> `model?` | `ChatEngine` \| [`PlanFn`](#planfn) \| `null` | The model planner. |
| <a id="property-now-1"></a> `now?` | () => `number` | - |
| <a id="property-ondrop"></a> `onDrop?` | (`d`) => `void` | - |
| <a id="property-reflex-1"></a> `reflex?` | [`Reflex`](#reflex) \| `null` | - |
| <a id="property-scripted"></a> `scripted?` | `ChatEngine` \| [`PlanFn`](#planfn) \| `null` | - |
| <a id="property-temperature-1"></a> `temperature?` | `number` | - |
| <a id="property-tools-2"></a> `tools` | readonly `string`[] | - |
| <a id="property-tries"></a> `tries?` | `number` | Model calls before the model tier drops for invalid plans. Default 3. |

***

### ChainRequest

A request to the planner chain: what the person said, the messages for the model tiers, and an abort signal.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-messages"></a> `messages?` | `ChatMessage`[] | Messages for the model and scripted tiers. Default: one user message with `text`. |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |
| <a id="property-text"></a> `text` | `string` | What the person said; the reflex tier reads this. |

***

### ChainResult

What the chain planned: the plan, the tier that made it, the raw reply and the drops on the way.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-drops"></a> `drops` | [`Drop`](#drop)[] |
| <a id="property-plan"></a> `plan` | [`Plan`](#plan) |
| <a id="property-raw"></a> `raw` | `string` |
| <a id="property-tier"></a> `tier` | [`Tier`](#tier) |

***

### Cost

Running counts for the agent: model calls, reflex and cache hits, the last prompt's tokens and the last reply's time in ms.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-cachehits"></a> `cacheHits` | `number` |
| <a id="property-lastprompttokens"></a> `lastPromptTokens` | `number` |
| <a id="property-lastreplyms"></a> `lastReplyMs` | `number` |
| <a id="property-modelcalls"></a> `modelCalls` | `number` |
| <a id="property-reflexhits"></a> `reflexHits` | `number` |

***

### Drop

One step down the chain.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | `number` | - |
| <a id="property-detail"></a> `detail` | `string` | Plain detail: the error message, or how many replies failed. |
| <a id="property-from"></a> `from` | [`Tier`](#tier) | - |
| <a id="property-raw-1"></a> `raw?` | `string` | The last raw reply that failed, for the inspector. |
| <a id="property-reason"></a> `reason` | [`DropReason`](#dropreason) | - |
| <a id="property-to"></a> `to` | [`Tier`](#tier) \| `null` | The tier tried next, or null when none was left. |
| <a id="property-tries-1"></a> `tries` | `number` | Model calls spent on this tier before it dropped. |

***

### Goal

A persistent goal: kind, target, status, tries, per object failures, skip list and timestamps.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-coach"></a> `coach` | `boolean` | Hints are switched on for this goal (after two failures in a turn). |
| <a id="property-created"></a> `created` | `number` | - |
| <a id="property-fails"></a> `fails` | `Record`\<`string`, `number`\> | Failures per object. |
| <a id="property-id"></a> `id` | `string` | - |
| <a id="property-kind"></a> `kind` | [`GoalKind`](#goalkind) | - |
| <a id="property-note"></a> `note` | `string` | - |
| <a id="property-reported"></a> `reported` | `boolean` | - |
| <a id="property-skip"></a> `skip` | `string`[] | - |
| <a id="property-stale"></a> `stale` | `number` | Tries in a row without progress. |
| <a id="property-status"></a> `status` | `"active"` \| `"done"` \| `"blocked"` \| `"failed"` | - |
| <a id="property-target"></a> `target` | `string` \| `null` | - |
| <a id="property-text-1"></a> `text` | `string` | The request as heard. |
| <a id="property-tries-2"></a> `tries` | `number` | - |
| <a id="property-updated"></a> `updated` | `number` | - |

***

### GoalSink

Where goals are loaded from and saved to.

#### Methods

##### load()

```ts
load(): Goal[] | Promise<Goal[] | null> | null;
```

###### Returns

[`Goal`](#goal)[] \| `Promise`\<[`Goal`](#goal)[] \| `null`\> \| `null`

##### save()

```ts
save(goals): void | Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `goals` | [`Goal`](#goal)[] |

###### Returns

`void` \| `Promise`\<`void`\>

***

### GoalsOptions

Options for `Goals`: sink, planners, the goal cap, tries before blocking, failures before skipping, and the clock.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s-3"></a> `S` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-max"></a> `max?` | `number` | - |
| <a id="property-maxtries"></a> `maxTries?` | `object` | Tries before a goal is blocked: without a model, and without progress with one. Defaults 7 and 5. |
| `maxTries.model?` | `number` | - |
| `maxTries.reflex?` | `number` | - |
| <a id="property-now-2"></a> `now?` | () => `number` | - |
| <a id="property-planners"></a> `planners?` | `Record`\<`string`, [`Planner`](#planner-1)\<`S`\>\> | - |
| <a id="property-sink"></a> `sink?` | [`GoalSink`](#goalsink) | - |
| <a id="property-skipafter"></a> `skipAfter?` | `number` | Failures before an object is skipped. Default 2. |

***

### Perception

What the host returns each turn: ranked prompt sections, fixed lines and the state goal planners read.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s-4"></a> `S` |

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-fixed"></a> `fixed?` | `string`[] | Lines that always go in, like HANDS and posture. |
| <a id="property-sections"></a> `sections?` | `Section`[] | Ranked sections: YOU CAN DO NOW (9), I SEE NOW (8), RULES (7), MAP (6) and so on. |
| <a id="property-state"></a> `state?` | `S` | Host state handed to goal planners. |

***

### Plan

A parsed model turn: think, say, the steps to run, done, where it came from and the tools dropped as unknown.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-do"></a> `do` | [`Step`](#step)[] | - |
| <a id="property-done"></a> `done` | `boolean` | - |
| <a id="property-from-1"></a> `from` | `"json"` \| `"text"` | "json" when an object parsed, "text" when the reply was taken as speech. |
| <a id="property-say"></a> `say` | `string` | - |
| <a id="property-think"></a> `think` | `string` | - |
| <a id="property-unknown"></a> `unknown` | `string`[] | Steps dropped because the tool is unknown. |

***

### PlannerChain

Plans a request down the tiers, keeping a log of every drop.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-last"></a> `last` | `readonly` | [`ChainResult`](#chainresult) \| `null` | The last result, or null when no tier planned. |
| <a id="property-lastdrops"></a> `lastDrops` | `readonly` | readonly [`Drop`](#drop)[] | The drops of the last call. |
| <a id="property-log"></a> `log` | `readonly` | readonly [`Drop`](#drop)[] | Every drop so far, oldest first. |

#### Methods

##### clear()

```ts
clear(): void;
```

###### Returns

`void`

##### plan()

```ts
plan(req): Promise<ChainResult | null>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`ChainRequest`](#chainrequest) |

###### Returns

`Promise`\<[`ChainResult`](#chainresult) \| `null`\>

***

### ReflexResult

What `Reflex.parse` returns: the steps mapped and the clauses no rule mapped.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-missed"></a> `missed` | `string`[] | Clauses no rule mapped. |
| <a id="property-steps-1"></a> `steps` | [`Step`](#step)[] | - |

***

### Registry

The agent's tools by name, with prompt lines, chat tool specs, argument checks and a runner.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-names"></a> `names` | `readonly` | `string`[] |

#### Methods

##### check()

```ts
check(step): string | null;
```

Check a step against its schema; returns the first person complaint or null.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `step` | [`Step`](#step) |

###### Returns

`string` \| `null`

##### describe()

```ts
describe(): string;
```

Lines for the system prompt: `name(arg, arg): description`.

###### Returns

`string`

##### get()

```ts
get(name): Tool | undefined;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |

###### Returns

[`Tool`](#tool) \| `undefined`

##### run()

```ts
run(step, ctx): Promise<StepResult>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `step` | [`Step`](#step) |
| `ctx` | [`ToolContext`](#toolcontext) |

###### Returns

`Promise`\<[`StepResult`](#stepresult)\>

##### specs()

```ts
specs(): ToolSpec[];
```

chat ToolSpec list, for native tool runtimes.

###### Returns

`ToolSpec`[]

***

### Step

One action: a tool name and its positional arguments.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-args"></a> `args` | `string`[] |
| <a id="property-tool"></a> `tool` | `string` |

***

### StepResult

The result of one step: the step, whether it worked, and the text the model reads next.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-ok"></a> `ok` | `boolean` | - |
| <a id="property-step"></a> `step` | [`Step`](#step) | - |
| <a id="property-text-2"></a> `text` | `string` | What the tool returned, or the sentence the model reads on failure. |

***

### Tool

A tool the agent can call: name, description, an argument schema and `run`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-description"></a> `description` | `string` | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-parameters"></a> `parameters?` | `JsonSchema` | Object schema; properties in order are the positional arguments. |

#### Methods

##### run()

```ts
run(args, ctx): string | void | Promise<string | void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | `string`[] |
| `ctx` | [`ToolContext`](#toolcontext) |

###### Returns

`string` \| `void` \| `Promise`\<`string` \| `void`\>

##### target()?

```ts
target?(args): string | null;
```

The object the step acts on, for goal skip lists. Default: the first argument.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | `string`[] |

###### Returns

`string` \| `null`

***

### ToolContext

What a tool's `run` receives besides its arguments: the turn's abort signal and the text heard.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-heard"></a> `heard` | `string` \| `null` | Text the agent heard this turn, if any. |
| <a id="property-signal-1"></a> `signal` | `AbortSignal` | - |

***

### TurnResult

What `handle` returns: why the turn ran, how it ended, what was said, the step results, the model calls and the goal.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-calls"></a> `calls` | `number` |
| <a id="property-ended"></a> `ended` | [`Ended`](#ended) |
| <a id="property-goal"></a> `goal` | [`Goal`](#goal) \| `null` |
| <a id="property-results"></a> `results` | [`StepResult`](#stepresult)[] |
| <a id="property-said"></a> `said` | `string`[] |
| <a id="property-why"></a> `why` | [`Why`](#why) |

## Type Aliases

### AgentEvent

```ts
type AgentEvent = 
  | {
  plan: Plan;
  type: "plan";
  via: "model" | "reflex" | "cache" | "planner";
}
  | {
  result: StepResult;
  type: "step";
}
  | {
  text: string;
  type: "hint";
}
  | {
  change: "added" | "done" | "blocked" | "failed" | "coach";
  goal: Goal;
  type: "goal";
}
  | {
  result: TurnResult;
  type: "end";
};
```

An event `onEvent` receives during a turn: a plan, a step result, a hint, a goal change or the turn's end.

***

### DropReason

```ts
type DropReason = 
  | "absent"
  | "loading"
  | "error"
  | "invalid"
  | "no-answer"
  | "aborted"
  | "no-match";
```

Why a tier dropped. `invalid`: it replied, but no reply held a valid plan.
`no-answer`: every reply was empty (a plan function returned null, or a
scripted engine had nothing for the request).

***

### Ended

```ts
type Ended = 
  | "done"
  | "empty"
  | "failures"
  | "repeat"
  | "steps"
  | "guard"
  | "aborted"
  | "reflex"
  | "cache"
  | "planner"
  | "no-brain";
```

Why a turn ended: done, an escalation rule, a guard, an abort, or the source that planned it with no model.

***

### GoalKind

```ts
type GoalKind = 
  | "explore"
  | "find"
  | "fetch"
  | "collect"
  | "tidy"
  | "custom"
  | string & object;
```

A goal kind: explore, find, fetch, collect, tidy, custom, or any kind the host adds a planner for.

***

### GoalStep

```ts
type GoalStep = 
  | {
  steps: Step[];
}
  | {
  done: string;
}
  | {
  failed: string;
};
```

What a goal planner returns: the next steps, done with a note, or failed with a note.

***

### PlanFn

```ts
type PlanFn = (req) => 
  | Plan
  | string
  | null
| Promise<Plan | string | null>;
```

A planner by function: a plan, raw text to parse, or null for none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | [`ChainRequest`](#chainrequest) |

#### Returns

  \| [`Plan`](#plan)
  \| `string`
  \| `null`
  \| `Promise`\<[`Plan`](#plan) \| `string` \| `null`\>

***

### Planner

```ts
type Planner<S> = (goal, state) => GoalStep;
```

A goal planner that needs no model: given the goal and the host's state, it returns the next `GoalStep`.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-s-5"></a> `S` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `goal` | [`Goal`](#goal) |
| `state` | `S` |

#### Returns

[`GoalStep`](#goalstep)

***

### ReflexPlan

```ts
type ReflexPlan = (m, clause) => Step[] | null;
```

A reflex rule's plan: steps from the regex match and the clause, or null to let the next rule try.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | `RegExpExecArray` |
| `clause` | `string` |

#### Returns

[`Step`](#step)[] \| `null`

***

### Rng

```ts
type Rng = () => number;
```

A random number source returning 0 to 1, injected so turns repeat under a seed.

#### Returns

`number`

***

### Tier

```ts
type Tier = "model" | "scripted" | "reflex";
```

A planner tier: the model, a scripted planner, or the reflex brain.

***

### Why

```ts
type Why = "heard" | "goal" | "free" | "report";
```

Why a turn runs: something was heard, a goal is active, a free tick, or a goal report.

## Variables

### GOAL\_PATTERNS

```ts
const GOAL_PATTERNS: readonly [GoalKind, RegExp][];
```

The patterns that read a goal kind and target from a request, tried in order.

***

### TIERS

```ts
const TIERS: readonly Tier[];
```

The planner tiers in the order the chain tries them.

## Functions

### clauses()

```ts
function clauses(text): string[];
```

Split a request into lowercase clauses on commas, semicolons, "then" and "and", with polite words removed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |

#### Returns

`string`[]

***

### createAgent()

```ts
function createAgent<S>(o): Agent<S>;
```

Make an `Agent` from its options.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-s-6"></a> `S` | `unknown` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`AgentOptions`](#agentoptions)\<`S`\> |

#### Returns

[`Agent`](#agent)\<`S`\>

***

### createPlannerChain()

```ts
function createPlannerChain(o): PlannerChain;
```

Make a planner chain that tries the model planner, then the scripted planner, then the reflex brain.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`ChainOptions`](#chainoptions) |

#### Returns

[`PlannerChain`](#plannerchain)

***

### createRegistry()

```ts
function createRegistry(tools): Registry;
```

Make a registry over a list of tools.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `tools` | readonly [`Tool`](#tool)[] |

#### Returns

[`Registry`](#registry)

***

### dropLine()

```ts
function dropLine(d): string;
```

One lowercase line for the inspector or the room's status strip.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `d` | [`Drop`](#drop) |

#### Returns

`string`

***

### loosePlanSchema()

```ts
function loosePlanSchema(maxActions?): JsonSchema;
```

The looser schema: any strings in `do`, for runtimes that refuse enums or prefixItems.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `maxActions?` | `number` | `3` |

#### Returns

`JsonSchema`

***

### normalizeRequest()

```ts
function normalizeRequest(s): string;
```

A request in the form the plan cache keys on: lowercase, punctuation and polite openers removed, spaces collapsed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`

***

### parsePlan()

```ts
function parsePlan(
   raw, 
   tools, 
   maxActions?
): Plan;
```

Parse a model reply into a `Plan`, tolerating drifted shapes; text that does not parse becomes `say` with done set.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `raw` | `string` | `undefined` |
| `tools` | readonly `string`[] | `undefined` |
| `maxActions?` | `number` | `4` |

#### Returns

[`Plan`](#plan)

***

### planSchema()

```ts
function planSchema(tools, maxActions?): JsonSchema;
```

The JSON Schema of the turn contract, with tool names as an enum and `do` capped at `maxActions` steps.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `tools` | readonly `string`[] | `undefined` |
| `maxActions?` | `number` | `3` |

#### Returns

`JsonSchema`

***

### stepText()

```ts
function stepText(s): string;
```

A step as one line of text: the tool name and its arguments.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | [`Step`](#step) |

#### Returns

`string`

***

### storageSink()

```ts
function storageSink(store, key?): GoalSink;
```

A sink over a string key value store (localStorage, or a Map in tests).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `store` | \{ `getItem`(`k`): `string` \| `null`; `setItem`(`k`, `v`): `void`; \} | `undefined` |
| `store.getItem` | (`k`) => `string` \| `null` | `undefined` |
| `store.setItem` | (`k`, `v`) => `void` | `undefined` |
| `key?` | `string` | `"hackbuild-agent-goals"` |

#### Returns

[`GoalSink`](#goalsink)

***

### validPlan()

```ts
function validPlan(p): boolean;
```

A plan counts when it parsed as an object and holds a known step or something to say; an empty object does not.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | [`Plan`](#plan) |

#### Returns

`boolean`

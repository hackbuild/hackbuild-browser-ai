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

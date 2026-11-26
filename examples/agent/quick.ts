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

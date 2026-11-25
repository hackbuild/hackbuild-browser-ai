// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/agent"],
  what: `an agent turn sized for small models in a browser tab: perceive, recall, decide, act, reflect. a tool loop with forced json and fallbacks, guards from \`@hackbuild/structured\`, a reflex brain that works with no model and also writes hints for the smallest ones, persistent goals with planners that need no model, a token budgeted context and a plan cache. no model ships here.`,
  how: [
    `the model answers in one small contract: \`{"think", "say", "do": [["tool", "arg"]], "done"}\`. it is asked for with a strict json schema, then a looser one, then free text, and a tolerant parser takes whatever comes back; when nothing parses the text becomes \`say\`.`,
    `\`say\` streams: \`onSay\` gets the say text as soon as it is readable in the json, so speech starts while the plan is still being written.`,
    `steps run in order and stop at the first failure. results go back to the model as \`DONE THIS TURN\`, and arguments are checked against the tool schema with a first person complaint.`,
  ],
  install: "npm install @hackbuild/agent",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/agent`,
  code: `import { createAgent, Reflex, Goals, storageSink, ToolError } from "@hackbuild/agent";

const tools = [
  { name: "go_to", description: "walk to a place",
    parameters: { type: "object", properties: { place: { type: "string", enum: ["table", "shelf"] } }, required: ["place"] },
    run: async ([place]) => { await body.walk(place); } },
  { name: "pick_up", description: "pick up a thing",
    parameters: { type: "object", properties: { thing: { type: "string" } }, required: ["thing"] },
    run: async ([thing]) => {
      if (body.dist(thing) > 0.6) throw new ToolError(\`that is \${body.dist(thing).toFixed(1)} m away. i walk closer first.\`);
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
  perceive: () => ({ sections: [{ name: "options", priority: 9, text: "YOU CAN DO NOW\\n..." }], state }),
  onSay: (piece, final) => {
    sayText += piece;
    voice.feed(sayText, final);
    if (final) sayText = "";
  },
});
const turn = await agent.handle("put the mug on the shelf", "heard");
turn.ended;   // done, empty, failures, repeat, steps, guard, aborted, reflex, cache, planner, no-brain
agent.cost;   // model calls, reflex hits, cache hits, last prompt tokens, last reply ms`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/agent/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/agent" },
};
export default how;

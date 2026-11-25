// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/structured"],
  what: `structured output for small models in the tab: five ways to get a tool decision out of a \`@hackbuild/chat\` engine, the schema sanitizer and loose fallback for grammar mode, json repair, loop and garbage guards, a streaming inline tag parser and line tagged formats.`,
  how: [
    `\`auto\` takes native when the quirks say the runtime has tools, constrained when the engine takes schemas, prompt for tool call tag models, else lines. a reply with no tool becomes \`respond_to_user\` with the text.`,
    `\`sanitizeSchema\` strips \`minItems, maxItems, multipleOf, $schema, $id, examples, default, title, minLength, maxLength, pattern\` recursively (property names are kept) and adds a root \`type: "object"\`.`,
    `\`buildAgentSchema\` and \`buildLooseAgentSchema\` give the strict and loose agent schemas, each with the \`respond_to_user\` pseudo tool.`,
  ],
  install: "npm install @hackbuild/structured",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/structured`,
  code: `import { call, createGuards } from "@hackbuild/structured";

const guards = createGuards();                   // parse fails 3, repeat 3 of 6, garbage 2, pushbacks 3
const d = await call(chat, messages, { tools, mode: "auto", quirks: record.quirks, guards });
// { mode, thought, tool: { name, args } | null, say, raw, fallback: "none" | "loose" | "text", stop }`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/structured/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/structured" },
};
export default how;

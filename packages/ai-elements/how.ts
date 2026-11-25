// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/ai-elements", "@hackbuild/ai-views"],
  what: `deprecated. use @hackbuild/ai-views. this package re-exports its custom elements and notes the deprecation once when the page calls \`define()\`.`,
  how: [`\`define("hb")\` registers the ai-views elements as \`<hb-model-select>\`, \`<hb-chat-pane>\` and the rest, in light dom, drawn with the page's hackbuild-ui stylesheet.`],
  install: "npm install @hackbuild/ai-views",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/ai-views`,
  code: `import { define } from "@hackbuild/ai-views/elements";
define();   // <model-select job="chat">, <chat-pane>, <chat-composer for="...">, ...`,
  links: { source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/ai-views" },
};
export default how;

// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/ai-elements"],
  what: `deprecated: use @hackbuild/ai-views. web components for pages that run models in a tab: a model picker, a download bar, status pills, a chat panel and a memory inspector. no framework, shadow dom styled with the hack.build design system (hackbuild-ui), theming through its css custom properties, icons as inline svg. nothing registers on import; the page calls \`define()\`.`,
  how: [
    `model picker: the hackbuild-ui model list markup and its vanilla \`modelList\` behaviour, a search field, groups and one radio per row. each row carries \`fitOf\` from @hackbuild/models as { fit, ok, reason }; a row that does not fit is off with the reason, for example "no webgpu adapter here." rows show size with measured, vendor, inferred or unknown, the fit chip, and the licence as recorded.`,
    `download bar: percent and mb when the total is known, mb counted with an indeterminate bar when it is not, a resuming state, cancel and resume events, and a failed state that names the error. the moving bar stops under reduced motion.`,
    `status pills: loading, ready, busy, failed (including a watchdog trip) and patch missed, each with its state dot. busy and loading blink ink, so a row of pills never spends the one pink of the view.`,
  ],
  install: "npm install @hackbuild/ai-elements",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/ai-elements`,
  code: `import { define } from "@hackbuild/ai-elements";
define();            // hb-model-picker, hb-download-bar, hb-status-pills, hb-chat-panel, hb-memory-inspector
// define("my") gives my-model-picker and so on

const picker = document.querySelector("hb-model-picker");
picker.env = await probe();                         // @hackbuild/ai-env
picker.records = hub.registry.list();               // each shows size with its source word and the weight licence
picker.addEventListener("hb-pick", (e) => load(e.detail.id));

bar.progress = p;                                   // @hackbuild/weights Progress; null total shows an indeterminate bar
bar.addEventListener("hb-cancel", ...); bar.addEventListener("hb-resume", ...);

pills.update(status);                               // speak EngineStatus, hub status, or { id, kind, text }

chat.engine = engine;                               // @hackbuild/chat ChatEngine; or chat.streamText(asyncIterable)
chat.keyField = true;                               // the key stays in this element; shown as its first and last 4 characters
chat.addEventListener("hb-reply", (e) => speaker.say(e.detail.text));

inspector.recall = await mem.recall(query);         // @hackbuild/memory Recall: one row per fused candidate`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/ai-elements/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/ai-elements" },
};
export default how;

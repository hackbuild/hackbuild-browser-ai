// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/ai-views", "@hackbuild/models", "@hackbuild/chat", "@hackbuild/transcribe", "@hackbuild/vision"],
  what: `views that bind the browser ai packages to hackbuild-ui: a model picker per job, a chat pane and composer, a drop first transcriber, a mask studio, a frame view and a camera feed. each ships as a vue component and a custom element.`,
  how: [
    `model picker: \`useModelPick(job)\` turns the records that do a job into picker rows fitted to this machine (size, gpu memory, where it runs, a speed word, a verdict, the uncensored and non commercial marks, the reason a row does not fit) and loads through @hackbuild/weights with progress. hackbuild-ui draws the closed line, the bar chip and the sheet; the view writes every word.`,
    `chat: a thread streams from a @hackbuild/chat engine, keeps the reasoning in a fold, shows the memory each reply used, and offers copy and redo on the last reply. send is the one pink action and turns into stop while a reply streams.`,
    `transcribe: the drop zone becomes the transcript. files queue and run one at a time; lines carry their time, edit in place with undo, and export as txt, srt, vtt and json once there is text.`,
    `masks and frames: the mask studio adds a click segment model and segment everything to the hackbuild-ui mask editor's wand, brush and lasso, with undo, zoom and png exports. the frame view draws boxes, landmarks and a caption over a frame; the camera feed hands frames to the page.`,
  ],
  install: "npm install @hackbuild/ai-views",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/ai-views`,
  code: `import { define } from "@hackbuild/ai-views/elements";
define();
// <model-select job="chat" variant="chip"></model-select>
// <chat-pane id="chat"></chat-pane><chat-composer for="chat"></chat-composer>
document.querySelector("chat-pane").engine = engine;   // a @hackbuild/chat engine

// or in vue
import { ModelSelect, ChatPane, Composer } from "@hackbuild/ai-views/vue";`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/views/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/ai-views" },
};
export default how;

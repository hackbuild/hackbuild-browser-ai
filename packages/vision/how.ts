// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/vision"],
  what: `perception through the \`@hackbuild/models\` hub: depth, detection, segmentation, face, hand and pose landmarks with a fallback chain, and captions and questions through small vlms, plus a webcam loop helper and a result cache.`,
  how: [
    `every task is a capability on the \`@hackbuild/models\` hub with a fallback chain of records, so a call names what it wants (depth, detect, segment, face, hand, pose, caption) and the hub picks a model this device can run.`,
    `every call takes \`schedule\` (passed to \`hub.run\`: \`minIntervalMs\`, \`idleOnly\`, \`frameBudgetMs\`) and \`size\` or \`maxMB\` to route to a smaller model, so a rendering page keeps its frames.`,
    `\`depthWorker\` runs depth anything v2 small (apache-2.0) in a dedicated worker, so pre and post processing and the readback leave the page thread. the yolo decoder is written from the published output layouts and is never registered by default; \`detectAt(hub, image, "n" | "s" | "m")\` opts in to a yolov10 size (agpl-3.0).`,
    `\`segmentEverything\` decodes fastsam prototype masks with a class agnostic nms into instances; \`@hackbuild/vision/select\` re-exports the hackbuild-ui wand, flood, lasso, polygon, rectangle and ellipse rasterisers; \`edgeMask\`, \`autoThresholdMask\` and \`clusterMask\` need no model; \`exportInstances\` writes cutout and mask pngs plus a json of boxes.`,
  ],
  install: "npm install @hackbuild/vision",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/vision`,
  code: `import { createHub, stubFactory } from "@hackbuild/models";
import { tjsProvider, loadTransformers } from "@hackbuild/devices";
import { attachVision, mediapipeProvider, loadTasksVision, visionStubs, depth, detect, landmarks, caption } from "@hackbuild/vision";

const tjs = tjsProvider({ runtime: loadTransformers() });
const hub = createHub({ env, stub: new URLSearchParams(location.search).has("stub") });
attachVision(hub, tjs);                    // records plus transformers.js loaders
hub.provide("tjs", tjs.factory);
hub.provide("mediapipe", mediapipeProvider({ runtime: loadTasksVision() }));
hub.provide("stub", stubFactory(visionStubs()));

const map = await depth(hub, imageOrCanvas);           // 0 to 1, larger is nearer, plus the raw range
const boxes = await detect(hub, video, { scoreThreshold: 0.4 });
const face = await landmarks(hub, "face", video);      // falls through the chain, face.failures says what failed
const line = await caption(hub, frame);                // serialized on the vlm chain`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/vision/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/vision" },
};
export default how;

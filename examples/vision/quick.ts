import { probe } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { createHub } from "@hackbuild/models";
import { attachVision, caption, depth, detect, loadTasksVision, mediapipeProvider } from "@hackbuild/vision";

// one hub; transformers.js and MediaPipe tasks-vision load at run time from pinned urls
const tjs = tjsProvider({ runtime: loadTransformers() });
const hub = createHub({ env: await probe() });
attachVision(hub, tjs); // the vision records plus the transformers.js loaders
hub.provide("tjs", tjs.factory);
hub.provide("mediapipe", mediapipeProvider({ runtime: loadTasksVision() }));

// each call loads its model on first use, runs it under the gpu lock, and releases it
const video = document.querySelector("video")!;
const map = await depth(hub, video); // Depth Anything V2 small, weights Apache-2.0
const boxes = await detect(hub, video, { scoreThreshold: 0.4 }); // MediaPipe EfficientDet lite0, Apache-2.0
const line = await caption(hub, video); // SmolVLM 256M, Apache-2.0
console.log(map.width, map.height, boxes.map((b) => b.label), line);

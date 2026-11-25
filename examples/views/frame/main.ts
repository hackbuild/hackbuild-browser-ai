// FrameView over the drawn sample or the camera, with a stub that knows the
// sample: the rail picks what to find, look runs it.
import { boxWords, labelColour, useModelPick, type FrameResults } from "@hackbuild/ai-views";
import { define, type CameraFeed, type FrameView, type ModelSelectElement } from "@hackbuild/ai-views/elements";
import { INSTANCE_COLOURS, layout } from "@virgilvox/hackbuild-ui/vanilla";
import { FIXTURE_ENV, SAMPLE_THINGS, exposeSample, sampleCanvas, stubLoader } from "../fixtures.js";

define();
(document.getElementById("chip") as ModelSelectElement).pick = useModelPick("detect", { env: FIXTURE_ENV, loader: stubLoader });
(document.getElementById("eyes") as ModelSelectElement).pick = useModelPick("vision", { env: FIXTURE_ENV, loader: stubLoader });
const view = (document.getElementById("frame") as unknown as { view: FrameView }).view;
const feed = (document.getElementById("cam") as unknown as { feed: CameraFeed }).feed;
let tool = "boxes";
let framed = false;
const camBtn = document.getElementById("camera") as HTMLButtonElement;
const sampleBtn = document.getElementById("sample") as HTMLButtonElement;
const lookBtn = document.getElementById("look") as HTMLButtonElement;

const stubLook = (): FrameResults => {
  if (tool === "caption") return { caption: "a red cup on a table beside a blue ball.", tag: "1 caption" };
  if (tool === "points") {
    const pts = [{ x: 330, y: 260 }, { x: 470, y: 260 }, { x: 470, y: 410 }, { x: 330, y: 410 }];
    return { landmarks: [{ points: pts, edges: [[0, 1], [1, 2], [2, 3], [3, 0]], label: "cup corners" }] };
  }
  return { boxes: SAMPLE_THINGS };
};
const look = () => {
  const r = feed.live ? {} : stubLook();
  view.setResults(r);
  document.getElementById("found")!.innerHTML = r.boxes?.length
    ? `<div class="hb-inst"><ul class="hb-inst-list">${r.boxes.map((b) => `<li class="hb-inst-row" style="--hb-inst-c:${labelColour(b.label, INSTANCE_COLOURS)}"><span class="hb-inst-pick"><span class="hb-inst-sw"></span><span class="hb-inst-name">${boxWords(b)}</span></span></li>`).join("")}</ul></div>`
    : `<p class="hb-lay-empty-note">${r.caption ?? (r.landmarks?.length ? `${r.landmarks[0]!.points.length} points` : "nothing found.")}</p>`;
};
// the pink moves to look once there is a frame
const pinkOnLook = () => {
  camBtn.classList.toggle("hb-btn-go", !framed);
  lookBtn.hidden = !framed;
  lookBtn.classList.toggle("hb-btn-go", framed);
};
const sample = async () => {
  if (feed.live) feed.stop();
  await view.setSource(sampleCanvas());
  framed = true;
  pinkOnLook();
  look();
};
layout(document.getElementById("lay")!, { onTool: (t) => ((tool = t), framed && look()) });
camBtn.addEventListener("click", () => void (feed.live ? feed.stop() : feed.start()));
sampleBtn.addEventListener("click", () => void sample());
lookBtn.addEventListener("click", look);
feed.subscribe((s) => {
  camBtn.textContent = s.live ? "stop camera" : "start camera";
  document.getElementById("camstate")!.textContent = s.error || (s.live ? "camera on, 4 frames a second to the models." : "camera off.");
  if (s.live) {
    framed = true;
    pinkOnLook();
  }
});
exposeSample(sample);

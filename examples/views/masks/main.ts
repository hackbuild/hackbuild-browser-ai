// MaskStudio with stub models that know the drawn sample: a press inside a
// shape cuts that shape; find every object returns both.
import { useModelPick } from "@hackbuild/ai-views";
import { define, type MaskModels, type MaskStudio, type ModelSelectElement } from "@hackbuild/ai-views/elements";
import { layout } from "@virgilvox/hackbuild-ui/vanilla";
import { FIXTURE_ENV, SAMPLE_THINGS, exposeSample, sampleCanvas, sampleMask, stubLoader } from "../fixtures.js";

const inside = (t: (typeof SAMPLE_THINGS)[number], x: number, y: number) =>
  t.label === "ball" ? (x - (t.x + t.w / 2)) ** 2 + (y - (t.y + t.h / 2)) ** 2 <= (t.w / 2) ** 2 : x >= t.x && x < t.x + t.w && y >= t.y && y < t.y + t.h;
const models: MaskModels = {
  segment: async (img, p) => {
    const t = SAMPLE_THINGS.find((s) => inside(s, p.x, p.y));
    return t ? sampleMask(img.width, img.height, (x, y) => inside(t, x, y)) : null;
  },
  everything: async (img) => SAMPLE_THINGS.map((t) => ({ label: t.label, score: t.score, mask: sampleMask(img.width, img.height, (x, y) => inside(t, x, y)) })),
};

define();
(document.getElementById("chip") as ModelSelectElement).pick = useModelPick("masks", { env: FIXTURE_ENV, loader: stubLoader });
const el = document.getElementById("studio") as unknown as HTMLElement & { studio: MaskStudio; models: MaskModels };
el.models = models;
const sample = () => el.studio.setImage(sampleCanvas());
// the smoke's check: every hand tool, the cut, the mask tools, a saved mask and the exports, on the sample
async function check(): Promise<boolean> {
  const st = el.studio;
  for (const t of ["eraser", "polygon", "rect", "ellipse", "flood", "pan", "wand", "brush", "lasso", "point"] as const) {
    st.setTool(t);
    if (st.state().tool !== t) return false;
  }
  await st.cutAt(400, 330);
  const cup = st.state().coverage;
  st.expand();
  const grown = st.state().coverage;
  st.shrink();
  st.smooth();
  st.save("cup");
  st.undo();
  st.restore(st.state().saved[0]!.id);
  const img = st.mask("matte");
  const blob = await st.exportAs("cutout");
  const inverse = await st.exportAs("inverse");
  // found objects: find, hide, merge, delete; the views; a mask set from outside
  await st.everything();
  const n = st.state().found.length;
  const objects = st.state().view === "instances";
  st.showFound(0, false);
  st.mergeFound();
  const merged = st.state().found.filter((f) => f.on).length === n - 1;
  st.removeFound(0);
  st.setView("mask");
  const masked = st.state().view === "mask";
  st.clearFound();
  st.setMask(new Uint8Array(800 * 600).fill(255));
  const full = st.state().coverage > 0.99;
  st.setContiguous(false);
  return cup > 0.04 && grown > cup && st.state().saved.length === 1 && img?.width === 800 && !!blob && blob.size > 0 && !!inverse && n >= 2 && objects && merged && masked && full && !st.state().contiguous && st.state().found.length === 0;
}
el.addEventListener("sample", () => void sample());
layout(document.getElementById("lay")!);
exposeSample(sample);
// the smoke runs this after the sample; the screen gate only loads the sample
(window as unknown as { hbMaskCheck: () => Promise<boolean> }).hbMaskCheck = check;

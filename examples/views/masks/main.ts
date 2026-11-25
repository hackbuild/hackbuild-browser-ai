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
el.addEventListener("sample", () => void sample());
layout(document.getElementById("lay")!);
exposeSample(sample);

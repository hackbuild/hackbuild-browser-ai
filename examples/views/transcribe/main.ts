// TranscribeDrop over a stub transcriber: any file becomes four fixed
// lines after a moving progress. Exports, edit and undo work for real.
import { useModelPick, type Transcriber } from "@hackbuild/ai-views";
import { define, type ModelSelectElement } from "@hackbuild/ai-views/elements";
import { layout } from "@virgilvox/hackbuild-ui/vanilla";
import type { TranscribeQueue } from "@hackbuild/ai-views";
import { FIXTURE_ENV, exposeSample, stubLoader } from "../fixtures.js";

const LINES = ["pixel, sit. good dog.", "now the red ball, the one under the bench.", "he goes left every time, so the gate is fine there.", "drop it. drop it. good."];
const stub: Transcriber = (_file, ctx) =>
  new Promise((ok) => {
    let f = 0;
    const t = setInterval(() => {
      f += 0.25;
      ctx.onProgress(f);
      if (f >= 1) {
        clearInterval(t);
        ok({ segments: LINES.map((text, i) => ({ start: i * 4.2, end: i * 4.2 + 3.6, text })), duration: 17, language: "en", model: "fixture" });
      }
    }, 150);
  });

define();
const pick = useModelPick("transcribe", { env: FIXTURE_ENV, loader: stubLoader, chosen: "whisper-base.en" });
(document.getElementById("chip") as ModelSelectElement).pick = pick;
(document.getElementById("line") as ModelSelectElement).pick = pick;
const drop = document.getElementById("drop") as unknown as HTMLElement & { queue: TranscribeQueue; transcriber: Transcriber; pick(): void };
drop.transcriber = stub;
const sample = () => drop.queue.add([Object.assign(new Blob([new Uint8Array(32000)], { type: "audio/wav" }), { name: "walk with pixel.wav" })]);
drop.addEventListener("sample", sample);
document.getElementById("add")!.addEventListener("click", () => drop.pick());
drop.queue.subscribe((s) => {
  document.getElementById("verbs")!.style.display = s.channels.length ? "" : "none";
  document.getElementById("none")!.hidden = s.channels.some((c) => c.segments.length);
});
layout(document.getElementById("lay")!);
exposeSample(async () => {
  sample();
  await new Promise((r) => setTimeout(r, 900));
});

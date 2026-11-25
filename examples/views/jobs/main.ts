// <model-jobs> on the gate: presets with their totals fill the three lines,
// the gate's pink button loads every chosen model through the stub loader.
import { define } from "@hackbuild/ai-views/elements";
import type { JobsPick, Loader, PickPreset } from "@hackbuild/ai-views";
import type { Env } from "@hackbuild/ai-env";
import { layout } from "@virgilvox/hackbuild-ui/vanilla";
import { FIXTURE_ENV, exposeSample, stubLoader } from "../fixtures.js";

const PRESETS: PickPreset[] = [
  { id: "light", label: "light", picks: { chat: "smollm2-360m-instruct", transcribe: "whisper-tiny.en", voice: "web-speech" } },
  { id: "standard", label: "standard", picks: { chat: "llama-3.2-1b-instruct-mlc", transcribe: "whisper-base", voice: "kokoro-82m" } },
  { id: "heavy", label: "heavy", picks: { chat: "hermes-3-llama-3.2-3b-mlc", transcribe: "whisper-small.en", voice: "kokoro-82m" } },
];

define();
const el = document.getElementById("jobs") as unknown as HTMLElement & { env: Env; loader: Loader; presets: PickPreset[]; jobs: JobsPick };
el.env = FIXTURE_ENV;
el.loader = stubLoader;
el.presets = PRESETS;
const go = document.getElementById("go") as HTMLButtonElement;
const jobs = el.jobs;
const draw = () => {
  const all = jobs.all();
  const lines = jobs.lines();
  const loading = lines.some((l) => l.row?.state === "loading");
  go.textContent = loading ? "loading" : all.label;
  go.setAttribute("aria-busy", String(loading));
  if (lines.every((l) => l.row?.state === "loaded")) {
    document.getElementById("gate")!.hidden = true;
    document.getElementById("verbs")!.hidden = false;
    document.getElementById("awake")!.textContent = "awake";
    document.getElementById("awake-note")!.textContent = `${lines.map((l) => l.row?.name).join(", ")}. fixture: nothing was downloaded.`;
  }
};
jobs.subscribe(draw);
draw();
layout(document.getElementById("lay")!, { onGo: () => void jobs.loadAll() });
document.getElementById("talk")!.addEventListener("click", () => location.assign("../chat/"));
exposeSample(async () => {
  jobs.applyPreset("light");
  await jobs.loadAll();
});

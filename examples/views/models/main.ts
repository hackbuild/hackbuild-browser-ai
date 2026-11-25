// ModelSelect through its Vue component on the gate layout: the card's one
// line opens the sheet; the gate's pink button names the size and loads.
import { createApp } from "vue";
import { useModelPick } from "@hackbuild/ai-views";
import { gateWords } from "@hackbuild/ai-views/elements";
import { ModelSelect } from "@hackbuild/ai-views/vue";
import { layout } from "@virgilvox/hackbuild-ui/vanilla";
import { FIXTURE_ENV, exposeSample, stubLoader } from "../fixtures.js";

const pick = useModelPick("chat", { env: FIXTURE_ENV, loader: stubLoader, chosen: "hermes-3-llama-3.2-3b-mlc" });
const lay = document.getElementById("lay")!;
const go = document.getElementById("go") as HTMLButtonElement;
layout(lay, { onGo: () => void pick.load() });
createApp(ModelSelect, { pick, go: false }).mount("#select");
pick.subscribe((s) => {
  go.textContent = gateWords(s.row);
  go.setAttribute("aria-busy", String(s.row?.state === "loading"));
  if (s.row?.state === "loaded") {
    document.getElementById("gate")!.hidden = true;
    document.getElementById("verbs")!.style.display = "";
    document.getElementById("awake")!.textContent = "awake";
    document.getElementById("awake-note")!.textContent = `${s.row.name} is loaded. fixture: nothing was downloaded.`;
  }
});
document.getElementById("again")!.addEventListener("click", () => {
  document.getElementById("gate")!.hidden = false;
  document.getElementById("verbs")!.style.display = "none";
  document.querySelector<HTMLElement>("#select .hb-msel-line")?.click();
});
document.getElementById("talk")!.addEventListener("click", () => location.assign("../chat/"));
exposeSample(() => pick.load());

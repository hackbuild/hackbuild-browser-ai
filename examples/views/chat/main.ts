// ChatPane and Composer on a scripted engine, with a recall stub that
// feeds both the memory used fold and the memory inspector.
import { scripted } from "@hackbuild/chat";
import { chatThread, useModelPick, type MemoryUsed } from "@hackbuild/ai-views";
import { define, type ModelSelectElement } from "@hackbuild/ai-views/elements";
import { layout } from "@virgilvox/hackbuild-ui/vanilla";
import { FIXTURE_ENV, exposeSample, stubLoader } from "../fixtures.js";

const MEMORY = ["bench: the laser cutter is booked on tuesdays", "bio: you print in petg, not pla", "projects: the dog collar needs a buckle"];
const engine = scripted({
  replies: ["<think>they asked what i can do. keep it short and say what runs where.</think>i can answer, draft and plan with you. the model runs in this tab, and i use what memory finds when it helps."],
  chunk: 6,
});
const recallFor = async (q: string): Promise<MemoryUsed[]> => {
  const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 2);
  const hits = MEMORY.map((m, i) => ({ label: m, score: 0.9 - i * 0.17, hit: words.some((w) => m.includes(w)) || i === 0 }));
  const used = hits.filter((h) => h.hit).map(({ label, score }) => ({ label, score }));
  (document.getElementById("mem") as unknown as { recall: unknown }).recall = {
    query: q,
    mode: "hybrid",
    hits: used.map((_, i) => ({ item: { id: i } })),
    trace: hits.map((h, i) => ({ id: i, kind: "note", text: h.label, bm25: h.hit ? 1.2 : 0, bm25Rank: h.hit ? i : -1, cos: h.score, vecRank: i, rrf: 0.03 - i * 0.005, score: h.score })),
  };
  return used;
};

define();
const pick = useModelPick("chat", { env: FIXTURE_ENV, loader: stubLoader, chosen: "hermes-3-llama-3.2-3b-mlc" });
(document.getElementById("chip") as ModelSelectElement).pick = pick;
(document.getElementById("line") as ModelSelectElement).pick = pick;
const thread = chatThread({ recall: recallFor, system: (document.getElementById("persona") as HTMLTextAreaElement).value });
(document.getElementById("chat") as unknown as { thread: typeof thread }).thread = thread;
pick.subscribe((s) => thread.setEngine(s.row?.state === "loaded" ? engine : null));
layout(document.getElementById("lay")!);
exposeSample(async () => {
  await pick.load();
  await thread.send("what can you do for the bench?");
});

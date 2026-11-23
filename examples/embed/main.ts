import { loadTransformers } from "@hackbuild/devices";
import { cosine, loadStaticEmbedder, miniLM, type Embedder } from "@hackbuild/embed";
import { $, auto, check, finish, readout, result, status } from "../shared/ui.js";

const r = result("embed");
// the 20 sentences the browser check compares; the same list is in docs/browser-checks.md notes
export const SENTENCES = [
  "the mug goes on the shelf",
  "put the cup on the top shelf",
  "the dog sleeps by the door",
  "a puppy naps near the entrance",
  "turn the oven to 200 degrees",
  "preheat the stove",
  "the train leaves at nine",
  "our flight departs in the morning",
  "she plays the violin",
  "he practices cello every night",
  "water boils at sea level",
  "ice melts in the sun",
  "the printer is out of filament",
  "load more plastic into the 3d printer",
  "rain is expected tomorrow",
  "bring an umbrella for the storm",
  "the battery is almost empty",
  "charge the phone overnight",
  "a red fox crossed the road",
  "a car stopped at the light",
];

const MODELS = {
  potion: { label: "potion-base-8M, static, weights MIT", url: "https://huggingface.co/minishlab/potion-base-8M/resolve/main/" },
  minilm: { label: "all-MiniLM-L6-v2, transformers.js, weights Apache-2.0", id: "Xenova/all-MiniLM-L6-v2" },
  bge: { label: "bge-small-en-v1.5, transformers.js, weights MIT", id: "Xenova/bge-small-en-v1.5" },
};
$("#controls").innerHTML = `
<label class="hb-ctl">model <select class="hb-select" id="model">
<option value="potion">${MODELS.potion.label}</option>
<option value="minilm">${MODELS.minilm.label}</option>
<option value="bge">${MODELS.bge.label}</option></select></label>
<label class="hb-ctl">device <select class="hb-select" id="device"><option value="wasm:q8">wasm q8</option><option value="webgpu:fp32">webgpu fp32</option></select></label>
<button class="hb-btn" type="button" id="load">load</button>
<input class="hb-input" id="q" type="text" value="where do cups go" aria-label="query">
<button class="hb-btn hb-btn-2" type="button" id="search" disabled>search</button>`;
const pre = document.createElement("pre");
pre.style.cssText = "white-space:pre-wrap;margin:0 0 16px";
$("main").append(pre);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

let current: { e: Embedder; vecs: Float32Array[] } | null = null;
const tjs = loadTransformers();

async function load(which: keyof typeof MODELS, device: string): Promise<{ e: Embedder; loadMs: number; ms20: number; vecs: Float32Array[] }> {
  const m = MODELS[which];
  status(`loading ${m.label}. downloads from hugging face on first use.`);
  const t = performance.now();
  let e: Embedder;
  if (which === "potion") e = await loadStaticEmbedder(MODELS.potion.url, { name: "potion-base-8M" });
  else {
    const [dev, dtype] = device.split(":") as [string, string];
    const o: Record<string, string> = { modelId: (m as { id: string }).id, device: dev, dtype };
    if (which === "bge") o.pooling = "cls";
    e = await miniLM((await tjs()) as never, o);
  }
  const loadMs = performance.now() - t;
  await e.embed([SENTENCES[0]!]);
  const t2 = performance.now();
  const vecs = await e.embed(SENTENCES);
  const ms20 = performance.now() - t2;
  current = { e, vecs };
  ($("#search") as HTMLButtonElement).disabled = false;
  show({ model: m.label, id: e.id, "dim (vendor)": e.dim, "load ms (measured)": Math.round(loadMs), "20 sentences ms (measured)": ms20.toFixed(1) });
  status(`${m.label} loaded. weights licence ${m.label.split("weights ")[1]}.`, "ok");
  search();
  return { e, loadMs, ms20, vecs };
}

function search(): void {
  if (!current) return;
  const q = ($("#q") as HTMLInputElement).value;
  void current.e.embed([q]).then(([v]) => {
    const scored = SENTENCES.map((s, i) => ({ s, c: cosine(v!, current!.vecs[i]!) })).sort((a, b) => b.c - a.c);
    pre.textContent = scored.slice(0, 5).map((x) => `${x.c.toFixed(3)}  ${x.s}`).join("\n");
  });
}

/** pairs (0,1), (2,3) ... are paraphrases; the check counts how often a sentence's nearest other sentence is its pair */
function pairHits(vecs: Float32Array[]): number {
  let hits = 0;
  for (let i = 0; i < vecs.length; i++) {
    let best = -1;
    let bc = -2;
    for (let j = 0; j < vecs.length; j++) {
      if (j === i) continue;
      const c = cosine(vecs[i]!, vecs[j]!);
      if (c > bc) {
        bc = c;
        best = j;
      }
    }
    if (best === (i ^ 1)) hits++;
  }
  return hits;
}

$("#load").addEventListener("click", () => void load(($("#model") as HTMLSelectElement).value as keyof typeof MODELS, ($("#device") as HTMLSelectElement).value).catch((e) => status(`load failed: ${(e as Error).message}`, "bad")));
$("#search").addEventListener("click", search);
status("pick a model and load it. potion is about 30 MB (inferred), minilm q8 about 23 MB (inferred).");

if (auto) {
  const fail: string[] = [];
  try {
    const p = await load("potion", "wasm:q8");
    r.numbers["potion load ms (measured)"] = Math.round(p.loadMs);
    r.numbers["potion 20 sentences ms (measured)"] = Math.round(p.ms20 * 10) / 10;
    r.numbers["potion pair hits of 20 (measured)"] = pairHits(p.vecs);
    r.notes.push(`vectors: ${JSON.stringify(p.vecs.map((v) => Array.from(v, (x) => Math.round(x * 1e6) / 1e6)))}`);
    check(r, "#40 embed: potion-base-8M from its repo, vectors against python model2vec", "pass", "browser half; the python comparison is recorded beside this row in docs/browser-checks.md");
  } catch (e) {
    fail.push("potion");
    check(r, "#40 embed: potion-base-8M from its repo, vectors against python model2vec", "fail", (e as Error).message);
  }
  for (const [which, dev] of [["minilm", "wasm:q8"], ["minilm", "webgpu:fp32"], ["bge", "wasm:q8"], ["bge", "webgpu:fp32"]] as const) {
    try {
      const x = await load(which, dev);
      r.numbers[`${which} ${dev} load ms (measured)`] = Math.round(x.loadMs);
      r.numbers[`${which} ${dev} 20 sentences ms (measured)`] = Math.round(x.ms20 * 10) / 10;
      r.numbers[`${which} ${dev} pair hits of 20 (measured)`] = pairHits(x.vecs);
    } catch (e) {
      fail.push(`${which} ${dev}: ${(e as Error).message.slice(0, 160)}`);
    }
  }
  const tj = fail.filter((f) => !f.startsWith("potion"));
  check(r, "#41 embed: minilm and bge-small through transformers.js on wasm q8 and webgpu fp32", tj.length ? "fail" : "pass", tj.join("; "));
  finish(r, fail.length ? "fail" : "pass");
}

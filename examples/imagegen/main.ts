import { probe } from "@hackbuild/ai-env";
import { loadOrt, loadTransformers, ortWasmPaths } from "@hackbuild/devices";
import { generate, IMAGEGEN_RECORDS, type Sessions } from "@hackbuild/imagegen";
import { openWeightStore } from "@hackbuild/weights";
import { $, auto, check, finish, mb, readout, result, status } from "../shared/ui.js";

const r = result("imagegen");
const rec = IMAGEGEN_RECORDS[0]!;
// file sizes from the hugging face repo listing on 2026-11-23 (vendor)
const FILES = [
  { path: "text_encoder/model.onnx", mb: 681 },
  { path: "unet/model.onnx", mb: 1733 },
  { path: "vae_decoder/model.onnx", mb: 99 },
];
$("#controls").innerHTML = `
<input id="base" type="url" value="https://huggingface.co/${rec.source.repo}/resolve/main/" aria-label="weights base url">
<button id="load">download and load, ${FILES.reduce((a, f) => a + f.mb, 0)} MB (vendor)</button>
<input id="prompt" type="text" value="a ceramic mug on a wooden shelf, soft light" aria-label="prompt">
<label>steps <select id="steps"><option>1</option><option>2</option><option>4</option></select></label>
<label>seed <input id="seed" type="number" value="42" style="width:6em"></label>
<button id="go" disabled>generate</button>`;
const canvas = document.createElement("canvas");
canvas.width = canvas.height = 512;
canvas.style.cssText = "height:100%;width:auto;display:block;margin:0 auto";
$("#stage").append(canvas);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

const env = await probe();
show({ weights: rec.licence, "download (vendor)": `${FILES.reduce((a, f) => a + f.mb, 0)} MB in 3 graphs`, tokenizer: "Xenova/clip-vit-base-patch16, weights MIT" });
if (!env.webgpu) {
  ($("#load") as HTMLButtonElement).disabled = true;
  status("no webgpu adapter. sd-turbo needs it; this page has no wasm path.", "bad");
} else status(`sd-turbo weights are under the ${rec.licence}. read it before you download.`, "warn");

let sessions: Sessions | null = null;
const ortP = loadOrt();
const tjsP = loadTransformers();
let tokenize: ((p: string) => Promise<ArrayLike<number | bigint>>) | null = null;

async function load(): Promise<void> {
  const ort = (await ortP()) as never as { env: { wasm: { wasmPaths: string } }; InferenceSession: { create(b: Uint8Array, o: Record<string, unknown>): Promise<unknown> } };
  ort.env.wasm.wasmPaths = ortWasmPaths();
  const store = await openWeightStore({ onNotice: (l) => status(l, "warn") });
  const base = ($("#base") as HTMLInputElement).value.replace(/\/?$/, "/");
  const made: unknown[] = [];
  for (const f of FILES) {
    const blob = await store.get({ url: base + f.path, key: `sd-turbo:${f.path}`, licence: rec.licence }, { onProgress: (p) => status(`${f.path}: ${mb(p.loaded)}${p.total ? ` of ${mb(p.total)}` : ""}`) });
    made.push(await ort.InferenceSession.create(new Uint8Array(await blob.arrayBuffer()), { executionProviders: ["webgpu"] }));
  }
  sessions = { textEncoder: made[0], unet: made[1], vaeDecoder: made[2] } as Sessions;
  const tjs = (await tjsP()) as never as { AutoTokenizer: { from_pretrained(id: string): Promise<(p: string, o: Record<string, unknown>) => Promise<{ input_ids: { data: ArrayLike<number | bigint> } }>> } };
  const clip = await tjs.AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch16");
  tokenize = async (p) => (await clip(p, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data;
  ($("#go") as HTMLButtonElement).disabled = false;
  status("sd-turbo loaded.", "ok");
}

async function draw(): Promise<void> {
  if (!sessions || !tokenize) return;
  const t = performance.now();
  const ms: number[] = [];
  const img = await generate((await ortP()) as never, sessions, tokenize as never, {
    prompt: ($("#prompt") as HTMLInputElement).value,
    steps: Number(($("#steps") as HTMLSelectElement).value),
    seed: Number(($("#seed") as HTMLInputElement).value),
    onStep: (p) => p.stage === "denoise" && ms.push(p.ms),
  });
  canvas.width = img.width;
  canvas.height = img.height;
  canvas.getContext("2d")!.putImageData(new ImageData(img.rgba as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);
  show({ "image ms (measured)": Math.round(performance.now() - t), "unet step ms (measured)": ms.map((x) => Math.round(x)).join(", ") });
}

$("#load").addEventListener("click", () => void load().catch((e) => status(`load failed: ${(e as Error).message}`, "bad")));
$("#go").addEventListener("click", () => void draw().catch((e) => status(`generation failed: ${(e as Error).message}`, "bad")));

if (auto) {
  check(r, "#54 imagegen: sd-turbo on onnxruntime-web webgpu, graph names, images, time per step", "not run", "the three graphs are 2,513 MB (vendor), over this pass's download limit; the repo listing has the three graph paths the record names");
  finish(r, "not run", "download over the limit");
}

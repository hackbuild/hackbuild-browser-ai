import { probe } from "@hackbuild/ai-env";
import { loadOrt, loadTransformers, ortProvider } from "@hackbuild/devices";
import { attachImagegen, loadImagegen, type ClipTokenize } from "@hackbuild/imagegen";
import { createHub } from "@hackbuild/models";
import { openWeightStore } from "@hackbuild/weights";

// a hub with the ort provider: onnxruntime-web loads from a pinned url, the weight store caches the graphs
const hub = createHub({ env: await probe() });
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore() }).factory);
attachImagegen(hub);

// sd-turbo; gen.record.licence names its weight licence (Stability AI, no commercial use)
const gen = await loadImagegen(hub, { id: "sd-turbo" });

// the CLIP tokenizer (weights MIT) through transformers.js, 77 ids
type Tok = { from_pretrained(id: string): Promise<(p: string, o: object) => Promise<{ input_ids: { data: ArrayLike<number> } }>> };
const clip = await ((await loadTransformers()()).AutoTokenizer as Tok).from_pretrained(gen.form.tokenizer);
const tokenize: ClipTokenize = async (p) => (await clip(p, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data;
const img = await gen.generate(tokenize, { prompt: "a ceramic mug on a wooden shelf", seed: 42 }); // seeded, on webgpu
document.querySelector("canvas")!.getContext("2d")!.putImageData(new ImageData(img.rgba as Uint8ClampedArray<ArrayBuffer>, img.width, img.height), 0, 0);

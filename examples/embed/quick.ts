import { staticEmbedder, VectorIndex } from "@hackbuild/embed";
import { openWeightStore } from "@hackbuild/weights";

// potion-base-8M, weights MIT, fetched once and cached by the weight store
const base = "https://huggingface.co/minishlab/potion-base-8M/resolve/main/";
const store = await openWeightStore();
const get = (file: string) => store.once({ url: base + file, licence: "MIT" });
const dec = new TextDecoder();
const e = staticEmbedder({ name: "potion-base-8M", tokenizer: dec.decode(await get("tokenizer.json")), weights: await get("model.safetensors"), config: dec.decode(await get("config.json")) });

// embed a few notes and keep them in an index
const notes = ["the mug goes on the shelf", "water the plants on friday", "the router password is on the fridge"];
const index = new VectorIndex<string>();
(await e.embed(notes)).forEach((v, i) => index.add(notes[i]!, v));

// the two closest notes at cosine 0.1 or above, best first
console.log(e.id, index.search(e.embedOne("where is the cup"), 2, 0.1));

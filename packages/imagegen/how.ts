// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/imagegen"],
  what: `text to image in a tab with sd-turbo on onnxruntime-web: clip ids into the text encoder, a seeded euler loop over the unet on trailing timesteps, and the vae decoder to rgba. the default onnx export, \`schmuell/sd-turbo-ort-web\`, carries the stability ai non-commercial research community license, so it allows no commercial use. upstream \`stabilityai/sd-turbo\` moved to the stability ai community license in july 2024; to use that licence, point the record at an export made from the current upstream weights and check its licence before use.`,
  how: [
    `the three graphs (\`text_encoder\`, \`unet\`, \`vae_decoder\`) come through the shared weight store once, keyed by their folder. every graph call runs under \`hub.run\`, so the gpu lock and frame budget apply.`,
    `each record carries a \`form\`: the fields a model takes. \`applyForm\` fills the defaults, clamps steps and guidance, drops fields the model does not take, and refuses a size its graphs do not accept with a \`FormError\` whose message is the copy.`,
    `in stub mode, \`stubFactory({ imagegen: () => stubImagegenModel() })\` gives a grey image with no weights.`,
  ],
  install: "npm install @hackbuild/imagegen",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/imagegen`,
  code: `import { generate, IMAGEGEN_RECORDS } from "@hackbuild/imagegen";

// sessions from your own bytes (the weights store), webgpu execution provider
const sessions = {
  textEncoder: await ort.InferenceSession.create(te, { executionProviders: ["webgpu"] }),
  unet: await ort.InferenceSession.create(unet, { executionProviders: ["webgpu"] }),
  vaeDecoder: await ort.InferenceSession.create(vae, { executionProviders: ["webgpu"] }),
};
const clip = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch16"); // CLIP tokenizer, MIT
const tokenize = async (p) => (await clip(p, { padding: "max_length", max_length: 77, truncation: true })).input_ids.data;

const img = await generate(ort, sessions, tokenize, {
  prompt: "a ceramic mug on a wooden shelf",
  steps: 1,
  seed: 42,
  run: (fn) => hub.exclusive("gpu", fn), // share the gpu with a chat or vision model
});
ctx2d.putImageData(new ImageData(img.rgba, img.width, img.height), 0, 0);`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/imagegen/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/imagegen" },
};
export default how;

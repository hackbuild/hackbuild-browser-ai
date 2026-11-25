// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/biosignal"],
  what: `eeg in a tab, from earlier builds: zero phase filters, shrunk covariances and a riemannian tangent space classifier with leak free cross validation, in a rust core built for wasm32 with simd128 (\`crates/biosignal\`).`,
  how: [
    `filters: high pass and low pass biquads run forward then backward, plus a notch and its harmonic (q 30).`,
    `covariance shrunk toward its mean eigenvalue (0.08 by default); the reference is the log-euclidean mean per band; tangent vectors take the upper triangle with off diagonals times sqrt 2; multinomial logistic regression on standardized features with adam and l2 (the earlier biosignal build's 0.05, 150 epochs, 0.14).`,
    `cross validation folds by trial so windows from one trial never sit on both sides; the reference is fitted on the training fold only. \`byTrial: false\` reports the leaky window level number for comparison.`,
  ],
  install: "npm install @hackbuild/biosignal",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/biosignal`,
  code: `import { loadBiosignal, epochsFromEvents } from "@hackbuild/biosignal";
import { BIOSIGNAL_WASM_BASE64 } from "@hackbuild/biosignal/inline";

const bs = await loadBiosignal({ base64: BIOSIGNAL_WASM_BASE64 });
const epochs = epochsFromEvents(channels, events, 256, 4, 64);  // 4 windows per trial
const bands = [{ lo: 8, hi: 12 }, { lo: 13, hi: 30 }];
const acc = bs.crossValidate(epochs, bands, 256, { classes: 2 }, 0.08, 50);  // folds hold whole trials
const model = bs.train(epochs, bands, 256, { classes: 2 }, 0.08, 50);
const json = model.toJSON();                                    // reload with bs.load(json)`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/biosignal/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/biosignal" },
};
export default how;

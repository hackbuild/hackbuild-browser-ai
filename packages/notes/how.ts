// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/notes"],
  what: `audio to notes, from earlier builds: a basic pitch runner that frames windows by hand, a note decoder and refinement, a drum onset detector, tempo and grid fit on the \`@hackbuild/audio-dsp\` wasm core, and midi out.`,
  how: [
    `model: \`basic-pitch\`, spotify's basic pitch graph from \`@spotify/basic-pitch@1.0.1\` (apache-2.0), on the tfjs webgl backend in batches of 4 with \`WEBGL_SIZE_UPLOAD_UNIFORM\` set to 0, else the cpu backend in batches of 1.`,
    `windows of 43844 samples on a 36164 hop, 15 frames trimmed each end, only the frames and onsets outputs read.`,
    `\`decodeNotes\` is written here from the published output description (onset peaks, frame posteriors over a threshold, short gaps bridged); it is not the basic-pitch library's decoder.`,
  ],
  install: "npm install @hackbuild/notes",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/notes`,
  code: `import { attachNotes, tfjsPitchProvider, runPitch, decodeNotes, refineNotes, DETAILS, drumNotes, estimateTempo, writeMidi } from "@hackbuild/notes";
attachNotes(hub);
hub.provide("tfjs", tfjsPitchProvider({ runtime: async () => tf }));   // one shared tfjs 3.21.0
const m = await hub.use("notes");
const post = await hub.run(m, (pitch) => runPitch(pitch, mono22050, { onProgress }));
const notes = refineNotes(decodeNotes(post.frames, post.onsets, DETAILS.normal), DETAILS.normal);
const drums = drumNotes(dsp, drumStem, 44100);
const { bpm } = estimateTempo(dsp, mix, 44100);
const mid = writeMidi([{ name: "bass", notes, program: 33 }, { name: "kit", notes: drums, drums: true }], bpm);`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/notes/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/notes" },
};
export default how;

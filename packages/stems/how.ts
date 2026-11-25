// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/stems"],
  what: `stem separation in a tab: htdemucs on onnxruntime-web through the models hub, an own overlap add runner, and a realtime factor readout. from an earlier august build.`,
  how: [
    `htdemucs runs on onnxruntime-web through the models hub; the ort provider comes from \`@hackbuild/devices\`.`,
    `the runner cuts the song into segments of 343980 samples at 44.1 khz and joins them by overlap add with linear crossfades, then reports the realtime factor.`,
    `pass \`schedule\` to keep a rendering page smooth. separate first, then hand a stem to transcribe or notes.`,
  ],
  install: "npm install @hackbuild/stems",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/stems`,
  code: `import { attachStems, separate, stemsStubs } from "@hackbuild/stems";
attachStems(hub);                       // records; the ort provider comes from @hackbuild/devices
const { stems, rtf } = await separate(hub, left44k, right44k, { model: "htdemucs-fast", onProgress });
// stems.drums, stems.bass, stems.other, stems.vocals: { left, right }`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/stems/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/stems" },
};
export default how;

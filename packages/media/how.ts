// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/media"],
  what: `media in a tab, from earlier builds: decode a file's audio to a target rate, pick keyframes by scene change, and record a canvas or stream.`,
  how: [
    `\`decodeAudio\` uses the browser's decoder through an offlineaudiocontext and resamples by rendering; it names the failure when the container is refused (mkv and avi usually are). pages cannot fetch youtube audio (cors); that needs an extension or a proxy.`,
    `\`pickKeyframes\` keeps the first frame, each frame whose 32 bin luma histogram moved more than the threshold from the last keyframe, one per \`maxGap\` seconds, and the biggest changes under a cap.`,
    `\`record\` tries vp9, vp8, plain webm, then mp4 with \`MediaRecorder\`.`,
  ],
  install: "npm install @hackbuild/media",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/media`,
  code: `import { decodeAudio, lumaHistogram, pickKeyframes, record } from "@hackbuild/media";
const { channels } = await decodeAudio(file, 16000);          // for transcribe; 44100 for stems
const keys = pickKeyframes(frames.map((f) => ({ t: f.t, hist: lumaHistogram(f.rgba) })), { threshold: 0.3, maxGap: 10, max: 12 });
const rec = record(canvas.captureStream(30));                 // first supported webm or mp4 type
const blob = await rec.stop();`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/media/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/media" },
};
export default how;

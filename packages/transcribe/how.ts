// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/transcribe"],
  what: `speech to text in a tab: the quiet speech front end, silence reel packing with a source map back to file time, whisper and moonshine records for the models hub, the phantom text filter, the earlier live captioner live segmenter and a web speech adapter.`,
  how: [
    `the quiet speech front end cleans a file before any model sees it: dc block, high pass, a noise floor and a gain toward -20 dbfs, then reels of at most 26 s cut on the quietest frame, each denoised, levelled and limited.`,
    `one asr call per reel goes through \`hub.run\`; times are mapped back to the file through the source map, and the phantom text filter drops the lines small whisper models invent in silence.`,
    `live mode segments the mic (squelch after 500 ms of closed gate, or every 8 s). \`webSpeech({ onSegment })\` wraps the browser recognizer; chrome sends that audio to its service, so tell the user.`,
  ],
  install: "npm install @hackbuild/transcribe",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/transcribe`,
  code: `import { createHub, stubFactory } from "@hackbuild/models";
import { tjsProvider, loadTransformers } from "@hackbuild/devices";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { attachTranscribe, transcribe, transcribeStubs, defaultTranscribeId } from "@hackbuild/transcribe";

const hub = createHub({ env, stub: new URLSearchParams(location.search).has("stub") });
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
hub.provide("stub", stubFactory(transcribeStubs()));
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const out = await transcribe(hub, dsp, pcm16k, { model: defaultTranscribeId(env.webgpu), language: "en" });
// out.segments, out.dropped (with the reason), out.stats (levels in dB, computed)`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/transcribe/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/transcribe" },
};
export default how;

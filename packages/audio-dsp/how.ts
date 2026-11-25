// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/audio-dsp"],
  what: `speech and music dsp for the browser: a rust core built for wasm32 with simd128 (\`crates/audio-dsp\`) and ts around it for the gate, overlap add and file writers. no model and no weights here.`,
  how: [
    `the kernels live in a rust crate built for wasm32 with simd128: dc blocker, biquads, frame levels, a minimum statistics noise floor, spectral subtraction from a noise print, a lookahead limiter, resampling, stft magnitudes, onset picking, tempo by autocorrelation and lpc formants.`,
    `the ts side wraps the gate, overlap add and the file writers around the core.`,
    `every kernel copies its input into wasm memory and returns a new \`Float32Array\`. sin, cos, exp, ln and atan2 are written out in the crate, so the native and wasm builds give the same bits.`,
  ],
  install: "npm install @hackbuild/audio-dsp",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/audio-dsp`,
  code: `import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 }); // or { url } or { bytes }
const clean = dsp.biquad(dsp.biquad(dsp.dcBlock(pcm), "highpass", 80, 16000), "highpass", 80, 16000);
const db = dsp.frameDb(clean);                    // 25 ms frames, 10 ms hop at 16 kHz
const floor = dsp.noiseFloor(db);                 // median of 1.5 s minima
const noise = dsp.noiseSpectrum(clean, db, floor);
const quiet = noise ? dsp.denoise(clean, noise, 1.8, 0.08) : clean;
const safe = dsp.limit(quiet, 0.891, 16000);`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/audio-dsp/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/audio-dsp" },
};
export default how;

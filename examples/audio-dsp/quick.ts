import { encodeWav, gate, gateThreshold, loadDsp, toSrt } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

// the wasm core, inlined; { url } or { bytes } load it from elsewhere
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const pcm = new Float32Array(16000 * 10); // 10 s of 16 kHz mono

// clean the wire: dc block, 80 Hz high pass, denoise from a noise print, limit
const clean = dsp.biquad(dsp.dcBlock(pcm), "highpass", 80, 16000);
const db = dsp.frameDb(clean); // 25 ms frames on a 10 ms hop
const floor = dsp.noiseFloor(db);
const noise = dsp.noiseSpectrum(clean, db, floor);
const safe = dsp.limit(noise ? dsp.denoise(clean, noise, 1.8, 0.08) : clean, 0.891, 16000);

// speech regions 6 dB over the floor, then a WAV and an srt of them
const regions = gate(db, gateThreshold(floor, dsp.percentile(db, 0.95)), safe.length);
const wav = encodeWav([safe], 16000);
console.log(wav.length, "bytes", toSrt(regions.map(([a, b]) => ({ start: a / 16000, end: b / 16000, text: "speech" }))));

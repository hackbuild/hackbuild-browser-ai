import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { $, auto, check, finish, readout, result, status } from "../shared/ui.js";

const r = result("audio-dsp");
const SR = 16000;
$("#controls").innerHTML = `
<label>bpm <input id="bpm" type="number" min="60" max="200" value="120" style="width:5em"></label>
<label>noise <input id="noise" type="range" min="0" max="0.3" step="0.01" value="0.08"></label>
<button id="make">make a click track</button>
<button id="play">play it</button>
<button id="bench">time the kernels on 10 minutes</button>`;
const canvas = document.createElement("canvas");
$("#stage").append(canvas);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

status("loading the inlined dsp wasm.");
const t0 = performance.now();
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const loadMs = Math.round(performance.now() - t0);
show({ "wasm load ms (measured)": loadMs });
r.numbers["wasm load ms (measured)"] = loadMs;

// a seeded stream for the noise; the library takes rngs injected
let seed = 1;
const rand = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296) * 2 - 1;

function clicks(bpm: number, seconds: number, noise: number): Float32Array {
  const x = new Float32Array(seconds * SR);
  const step = (60 / bpm) * SR;
  for (let t = 0.25 * SR; t < x.length; t += step) {
    for (let k = 0; k < 400 && t + k < x.length; k++) x[Math.floor(t) + k]! += Math.sin((2 * Math.PI * 1200 * k) / SR) * Math.exp(-k / 60) * 0.8;
  }
  for (let i = 0; i < x.length; i++) x[i]! += rand() * noise;
  return x;
}

let clip: Float32Array = new Float32Array(0);
function analyse(): { bpm: number; ms: number } {
  const bpm = Number(($("#bpm") as HTMLInputElement).value);
  clip = clicks(bpm, 8, Number(($("#noise") as HTMLInputElement).value));
  const t = performance.now();
  const clean = dsp.biquad(dsp.dcBlock(clip), "highpass", 80, SR);
  const { mag, frames, bins } = dsp.stftMag(clean, 512, 160);
  const env = dsp.envelopeRms(clean, 160);
  const tempo = dsp.estimateTempo(env, SR / 160);
  const ms = performance.now() - t;
  draw(mag, frames, bins);
  show({ "set bpm": bpm, "estimated bpm (computed)": tempo.bpm.toFixed(2), "8 s analysis ms (measured)": ms.toFixed(1) });
  return { bpm: tempo.bpm, ms };
}

function draw(mag: Float32Array, frames: number, bins: number): void {
  const w = (canvas.width = canvas.clientWidth || 960);
  const h = (canvas.height = canvas.clientHeight || 540);
  const g = canvas.getContext("2d")!;
  const img = g.createImageData(w, h);
  let peak = 1e-9;
  for (const v of mag) peak = Math.max(peak, v);
  for (let x = 0; x < w; x++) {
    const f = Math.floor((x / w) * frames);
    for (let y = 0; y < h; y++) {
      const b = Math.floor(((h - 1 - y) / h) * bins);
      const v = Math.max(0, 1 + Math.log10(mag[f * bins + b]! / peak + 1e-6) / 4);
      const o = (y * w + x) * 4;
      img.data[o] = 30 + v * 200;
      img.data[o + 1] = 40 + v * 160;
      img.data[o + 2] = 60 + v * 60;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function bench(): Record<string, number> {
  status("timing every kernel on 10 minutes of seeded 16 khz audio.");
  const n = 600 * SR;
  const out: Record<string, number> = {};
  const time = (name: string, fn: () => unknown) => {
    const t = performance.now();
    fn();
    out[`${name} ms on 10 min (measured)`] = Math.round(performance.now() - t);
  };
  let x: Float32Array = new Float32Array(0);
  time("synth", () => (x = dsp.synth(7, n, SR)));
  let y = x;
  time("dc block", () => (y = dsp.dcBlock(x)));
  time("biquad highpass", () => (y = dsp.biquad(y, "highpass", 80, SR)));
  let db: Float32Array = new Float32Array(0);
  time("frame db", () => (db = dsp.frameDb(y)));
  let floor = 0;
  time("noise floor", () => (floor = dsp.noiseFloor(db)));
  let noise: Float32Array | null = null;
  time("noise print", () => (noise = dsp.noiseSpectrum(y, db, floor)));
  if (noise) time("spectral subtraction", () => (y = dsp.denoise(y, noise!, 1.8, 0.08)));
  time("limiter", () => (y = dsp.limit(y, 0.891, SR)));
  time("resample 16 to 48 khz sinc", () => dsp.resample(y, SR, 48000));
  time("stft 1024", () => dsp.stftMag(y, 1024, 256));
  show(out);
  status("kernels timed.", "ok");
  return out;
}

$("#make").addEventListener("click", () => void analyse());
$("#bench").addEventListener("click", () => void bench());
$("#play").addEventListener("click", () => {
  if (!clip.length) analyse();
  const ctx = new AudioContext();
  const b = ctx.createBuffer(1, clip.length, SR);
  b.copyToChannel(clip as Float32Array<ArrayBuffer>, 0);
  const s = ctx.createBufferSource();
  s.buffer = b;
  s.connect(ctx.destination);
  s.start();
});

const a = analyse();
status("click track analysed. change the bpm or noise and make another.", "ok");
if (auto) {
  r.numbers["click track bpm error (computed)"] = Math.round(Math.abs(a.bpm - 120) * 1000) / 1000;
  const b = bench();
  Object.assign(r.numbers, b);
  const total = Object.values(b).reduce((s, v) => s + v, 0);
  r.numbers["all kernels ms on 10 min (measured)"] = total;
  const ok = Math.abs(a.bpm - 120) < 1 && total > 0;
  check(r, "#26 audio-dsp: inlined wasm core and kernel speed on 10 minutes of 16 khz", ok ? "pass" : "fail", ok ? "kernel times over http in chrome; the iife wasm core loads from file:// (row 23), but these kernel times were not taken from file://; safari not run" : `tempo ${a.bpm.toFixed(2)} for a 120 bpm track`);
  finish(r, ok ? "pass" : "fail");
}

import { probe } from "@hackbuild/ai-env";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { loadTransformers, runtimeLoader, tjsProvider } from "@hackbuild/devices";
import { createHub, createRegistry, type Hub } from "@hackbuild/models";
import { kokoroEngine } from "@hackbuild/speak";
import { attachTranscribe, transcribe } from "@hackbuild/transcribe";
import { $, auto, check, finish, onDrop, readout, result, status } from "../shared/ui.js";

const r = result("transcribe");
const MODELS: Record<string, string> = {
  "whisper-base.en": "whisper base.en, weights MIT, about 90 MB (inferred)",
  "whisper-tiny.en": "whisper tiny.en, weights MIT, about 40 MB (inferred)",
  "whisper-small.en": "whisper small.en, weights MIT, about 250 MB (inferred)",
  "whisper-large-v3-turbo": "whisper large v3 turbo, weights MIT, about 900 MB (inferred), webgpu",
};
$("#controls").innerHTML = `
<label class="hb-ctl">model <select class="hb-select" id="model">${Object.entries(MODELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join("")}</select></label>
<label class="hb-ctl">device <select class="hb-select" id="dev"><option value="gpu">webgpu if present</option><option value="cpu">wasm only</option></select></label>
<span class="hb-dropzone" id="drop">drop an audio file <input id="file" type="file" accept="audio/*,video/*"></span>
<button class="hb-btn" type="button" id="rt">speak a sentence with kokoro and transcribe it</button>
<button class="hb-btn hb-btn-2" type="button" id="mic" disabled title="the live microphone path is in @hackbuild/listen; this page does not open the microphone">microphone: not on this page</button>`;
const out = document.createElement("pre");
out.style.cssText = "white-space:pre-wrap;margin:0 0 16px";
$("main").append(out);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

status("loading the dsp core and probing webgpu.");
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const env = await probe();
const tjs = tjsProvider({ runtime: loadTransformers() });
const hubOf = (e: typeof env): Hub => {
  const h = createHub({ registry: createRegistry(), env: e });
  attachTranscribe(h);
  h.provide("tjs", tjs.factory);
  return h;
};
const hubs = { gpu: hubOf(env), cpu: hubOf({ ...env, webgpu: false, f16: false }) };
if (!env.webgpu) {
  ($("#dev") as HTMLSelectElement).value = "cpu";
  ($("#dev") as HTMLSelectElement).disabled = true;
  ($("#model option[value='whisper-large-v3-turbo']") as HTMLOptionElement).disabled = true;
}
status(env.webgpu ? "drop a file or run the round trip. weights download from hugging face on first use." : "no webgpu adapter. whisper runs on wasm.", env.webgpu ? "ok" : "warn");

async function run(pcm16k: Float32Array, model: string, which: "gpu" | "cpu"): Promise<{ text: string; ms: number; loadMs: number; rung: string; rtf: number }> {
  status(`${MODELS[model]}. loading.`);
  const h = hubs[which];
  const t = performance.now();
  const l = await h.use({ id: model });
  const rung = `${l.rung.device} ${JSON.stringify(l.rung.dtype ?? "")}`;
  h.release(l);
  const loadMs = performance.now() - t;
  const t2 = performance.now();
  const tr = await transcribe(h, dsp, pcm16k, { model, language: "en" });
  const ms = performance.now() - t2;
  const text = tr.segments.map((s) => s.text).join(" ").trim();
  out.textContent = tr.segments.map((s) => `${s.start.toFixed(2)} to ${s.end.toFixed(2)}  ${s.text}`).join("\n") || "no speech found.";
  show({ model, rung, "load ms (measured)": Math.round(loadMs), "transcribe ms (measured)": Math.round(ms), "audio s (measured)": tr.stats.dur.toFixed(2), "realtime factor (measured)": tr.stats.rtf.toFixed(3), "snr db (computed)": tr.stats.snrDb.toFixed(1), dropped: tr.dropped.length });
  status("transcribed.", "ok");
  return { text, ms, loadMs, rung, rtf: tr.stats.rtf };
}

const KOKORO = runtimeLoader<never>(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]);
async function speech(text: string): Promise<Float32Array> {
  status("kokoro 82m on wasm q8, weights apache-2.0, phonemizer espeak ng gpl-3.0-or-later, speaking the test sentence.");
  const k = kokoroEngine({ runtime: KOKORO, device: "wasm", allowGplPhonemizer: true });
  await k.load({});
  const parts: Float32Array[] = [];
  let rate = 24000;
  for await (const c of k.synth(text, {}, new AbortController().signal)) {
    parts.push(c.samples);
    rate = c.sampleRate;
  }
  const n = parts.reduce((a, p) => a + p.length, 0);
  const all = new Float32Array(n + rate);
  let o = rate / 2;
  for (const p of parts) {
    all.set(p, o);
    o += p.length;
  }
  return dsp.resample(all, rate, 16000);
}

async function decode(file: File): Promise<Float32Array> {
  const buf = await file.arrayBuffer();
  const ac = new OfflineAudioContext(1, 16000, 16000);
  const audio = await ac.decodeAudioData(buf);
  const off = new OfflineAudioContext(1, Math.ceil(audio.duration * 16000), 16000);
  const src = off.createBufferSource();
  src.buffer = audio;
  src.connect(off.destination);
  src.start();
  return (await off.startRendering()).getChannelData(0);
}

const words = (s: string) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, " ").split(/\s+/).filter(Boolean);
function wer(ref: string, hyp: string): number {
  const a = words(ref);
  const b = words(hyp);
  const d = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return a.length ? d[a.length]![b.length]! / a.length : 0;
}

const SENTENCE = "The library opens at nine in the morning, and the printer on the second floor is out of paper.";
const dev = () => ($("#dev") as HTMLSelectElement).value as "gpu" | "cpu";
onDrop($("#drop"), (f) => void decode(f[0]!).then((pcm) => run(pcm, ($("#model") as HTMLSelectElement).value, dev())).catch((e) => status(`could not read that file: ${(e as Error).message}`, "bad")), $("#file") as HTMLInputElement);
$("#rt").addEventListener("click", () =>
  void speech(SENTENCE)
    .then((pcm) => run(pcm, ($("#model") as HTMLSelectElement).value, dev()))
    .then((x) => show({ "word error rate against the spoken text (computed)": wer(SENTENCE, x.text).toFixed(3) }))
    .catch((e) => status(`round trip failed: ${(e as Error).message}`, "bad")),
);

if (auto) {
  const n = r.numbers;
  try {
    const t = performance.now();
    const pcm = await speech(SENTENCE);
    n["kokoro wasm synth ms incl. load (measured)"] = Math.round(performance.now() - t);
    for (const which of ["cpu", "gpu"] as const) {
      const x = await run(pcm, "whisper-base.en", which);
      const w = wer(SENTENCE, x.text);
      n[`whisper-base.en ${which === "cpu" ? "wasm" : "webgpu"} rung`] = x.rung;
      n[`whisper-base.en ${x.rung.split(" ")[0]} load ms (measured)`] = Math.round(x.loadMs);
      n[`whisper-base.en ${x.rung.split(" ")[0]} transcribe ms (measured)`] = Math.round(x.ms);
      n[`whisper-base.en ${x.rung.split(" ")[0]} realtime factor (measured)`] = Math.round(x.rtf * 1000) / 1000;
      n[`whisper-base.en ${x.rung.split(" ")[0]} word error rate (computed)`] = Math.round(w * 1000) / 1000;
      n[`whisper-base.en ${x.rung.split(" ")[0]} text`] = x.text;
    }
    const ws = Object.entries(n).filter(([k]) => k.includes("word error rate")).map(([, v]) => Number(v));
    const ok = ws.length === 2 && ws.every((w) => w <= 0.15);
    check(r, "transcribe: whisper-base.en round trip on kokoro speech, wasm and webgpu", ok ? "pass" : "fail", `word error rates ${ws.join(", ")}`);
  } catch (e) {
    check(r, "transcribe: whisper-base.en round trip on kokoro speech, wasm and webgpu", "fail", (e as Error).message.slice(0, 300));
  }
  check(r, "#27 transcribe: large v3 turbo and base.en over a 10 minute file against the earlier transcription tool", "not run", "large v3 turbo is about 900 MB (inferred), over this pass's download limit; no 10 minute test recording or the earlier transcription tool output here");
  check(r, "#28 transcribe: live segmenter on a microphone and web speech in chrome", "not run", "needs a microphone");
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}

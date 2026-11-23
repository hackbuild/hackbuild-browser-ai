import { runtimeLoader } from "@hackbuild/devices";
import { bellowsEngine, createSpeaker, kokoroEngine, renderSpeechFrom, webSpeechEngine, type BellowsParts, type Engine, type Speaker } from "@hackbuild/speak";
import { $, auto, check, finish, readout, result, sleep, status } from "../shared/ui.js";

const r = result("speak");
const KOKORO = runtimeLoader<never>(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]);
// bellowsjs 0.5.0 and bellows-voice 0.7.3 (MIT, no weights) from the npm CDN; 0.8.0 with renderSpeech is not on npm yet
const BELLOWS = async () => {
  const [bellows, voice, engine] = await Promise.all([
    runtimeLoader<BellowsParts["bellows"]>(["https://cdn.jsdelivr.net/npm/bellowsjs@0.5.0/+esm"])(),
    runtimeLoader<BellowsParts["voice"]>(["https://cdn.jsdelivr.net/npm/bellows-voice@0.7.3/+esm"])(),
    runtimeLoader<BellowsParts["engine"]>(["https://cdn.jsdelivr.net/npm/bellows-voice@0.7.3/dist/engine.js/+esm"])(),
  ]);
  return renderSpeechFrom({ bellows, voice, engine });
};
// the page's seeded rng (mulberry32), drawn once by the engine for its seed
let seedState = 20261123;
const rng = () => {
  seedState = (seedState + 0x6d2b79f5) | 0;
  let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ENGINES: Record<string, { label: string; make: () => Engine }> = {
  "kokoro-wasm": { label: "kokoro 82m on wasm q8, weights Apache-2.0, about 92 MB (inferred)", make: () => kokoroEngine({ runtime: KOKORO, device: "wasm" }) },
  "kokoro-webgpu": { label: "kokoro 82m on webgpu fp32, weights Apache-2.0, about 326 MB (inferred)", make: () => kokoroEngine({ runtime: KOKORO, device: "webgpu" }) },
  bellows: { label: "bellows voice, a physical model of the vocal tract, no weights, code MIT, renders on this thread", make: () => bellowsEngine({ runtime: BELLOWS, rng }) },
  system: { label: "the system voice (web speech)", make: () => webSpeechEngine() },
};
$("#controls").innerHTML = `
<label>engine <select id="engine">${Object.entries(ENGINES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join("")}</select></label>
<input id="text" type="text" value="The kettle is on. Pour the water when it clicks, then wait three minutes." aria-label="text">
<button id="say">say it</button>
<button id="stop">stop</button>`;
const canvas = document.createElement("canvas");
$("#stage").append(canvas);
const words = document.createElement("p");
$("main").append(words);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));
if (!("gpu" in navigator)) ($("#engine option[value='kokoro-webgpu']") as HTMLOptionElement).disabled = true;

const ctx = new AudioContext({ sampleRate: 24000 });
const speakers = new Map<string, Speaker>();
let t0 = 0;
let firstAudio = 0;
let boundaries = 0;
let segments = 0;

function speaker(key: string): Speaker {
  let s = speakers.get(key);
  if (s) return s;
  s = createSpeaker({
    ctx: ctx as never,
    engines: [ENGINES[key]!.make()],
    onStatus: (e) => status(`${e.engine}: ${e.text}${e.progress !== undefined ? ` ${Math.round(e.progress)}%` : ""}`, e.kind === "failed" || e.kind === "watchdog" ? "bad" : "info"),
    onSpeaking: (b) => {
      if (b && !firstAudio) firstAudio = performance.now() - t0;
    },
    onSegment: () => segments++,
    onTimed: (t) => {
      boundaries++;
      const text = ($("#text") as HTMLInputElement).value;
      words.textContent = `${text.slice(0, t.start)}[${text.slice(t.start, t.end)}]${text.slice(t.end)}${t.estimated ? " (word times estimated)" : ""}`;
    },
  });
  speakers.set(key, s);
  return s;
}

async function say(key: string, text: string): Promise<{ ttfa: number; total: number; boundaries: number; segments: number; engine: string }> {
  await ctx.resume();
  const s = speaker(key);
  firstAudio = 0;
  boundaries = 0;
  segments = 0;
  t0 = performance.now();
  await s.say(text);
  const total = performance.now() - t0;
  const out = { ttfa: firstAudio, total, boundaries, segments, engine: s.engine ?? "none" };
  show({ engine: out.engine, "time to first audio ms": out.ttfa ? `${Math.round(out.ttfa)} (measured)` : "unknown, the engine reported no audio start", "say to done ms (measured)": Math.round(total), "word boundaries (measured)": boundaries });
  status(`${out.engine} finished.`, "ok");
  return out;
}

function meter() {
  const g = canvas.getContext("2d")!;
  const w = (canvas.width = canvas.clientWidth);
  const h = (canvas.height = canvas.clientHeight);
  const s = speakers.get(($("#engine") as HTMLSelectElement).value);
  const lv = s ? s.level() : 0;
  g.clearRect(0, 0, w, h);
  g.fillStyle = getComputedStyle(document.body).getPropertyValue("--accent");
  g.fillRect(0, h * (1 - Math.min(1, lv * 3)), w, h);
  requestAnimationFrame(meter);
}
requestAnimationFrame(meter);

$("#say").addEventListener("click", () => void say(($("#engine") as HTMLSelectElement).value, ($("#text") as HTMLInputElement).value).catch((e) => status(`speech failed: ${(e as Error).message}`, "bad")));
$("#stop").addEventListener("click", () => speakers.forEach((s) => s.stop()));
status("pick an engine and press say it. kokoro downloads from hugging face on first use.");

if (auto) {
  const n = r.numbers;
  const lines = ["The kettle is on.", "Pour the water when it clicks, then wait three minutes before you lift the bag."];
  const kokoro: string[] = [];
  for (const key of ["kokoro-wasm", "kokoro-webgpu"]) {
    try {
      const cold = await say(key, lines[0]!);
      const warm = await say(key, lines[1]!);
      n[`${key} engine`] = cold.engine;
      n[`${key} cold time to first audio ms (measured)`] = Math.round(cold.ttfa);
      n[`${key} warm time to first audio ms (measured)`] = Math.round(warm.ttfa);
      n[`${key} warm say to done ms (measured)`] = Math.round(warm.total);
      if (cold.engine !== "kokoro" || !cold.ttfa) kokoro.push(`${key}: engine ${cold.engine}, first audio ${cold.ttfa}`);
    } catch (e) {
      kokoro.push(`${key}: ${(e as Error).message.slice(0, 200)}`);
    }
  }
  check(r, "#42 speak: kokoro 82m on webgpu fp32 and wasm q8, time to first audio", kokoro.length ? "fail" : "pass", kokoro.length ? kokoro.join("; ") : "time measured; joins not listened to by a person");
  try {
    const voices = speechSynthesis.getVoices().length || (await sleep(500), speechSynthesis.getVoices().length);
    const x = await say("system", lines[1]!);
    n["web speech voices (measured)"] = voices;
    n["web speech word boundaries (measured)"] = x.boundaries;
    n["web speech time to first audio ms"] = x.ttfa ? `${Math.round(x.ttfa)} (measured)` : "unknown, no onstart or boundary before the end";
    check(r, "#44 speak: web speech boundaries and the chain falling to it", x.boundaries > 0 ? "pass" : "fail", `chrome only, ${x.boundaries} boundaries; safari and firefox not run; the fall through is covered by unit tests only`);
  } catch (e) {
    check(r, "#44 speak: web speech boundaries and the chain falling to it", "fail", (e as Error).message);
  }
  try {
    const cold = await say("bellows", lines[0]!);
    const warm = await say("bellows", lines[1]!);
    n["bellows engine"] = cold.engine;
    n["bellows cold time to first audio ms (measured)"] = Math.round(cold.ttfa);
    n["bellows warm time to first audio ms (measured)"] = Math.round(warm.ttfa);
    n["bellows warm say to done ms (measured)"] = Math.round(warm.total);
    n["bellows phoneme events (measured)"] = warm.boundaries;
    const ok = cold.engine === "bellows" && cold.ttfa > 0 && warm.boundaries > 0;
    check(r, "#57 speak: bellows voice through the speaker, time to first audio and phoneme times", ok ? "pass" : "fail", ok ? "bellows-voice 0.7.3 on bellowsjs 0.5.0 rendered on the main thread; not listened to by a person" : `engine ${cold.engine}, first audio ${cold.ttfa}, ${warm.boundaries} timed events`);
  } catch (e) {
    check(r, "#57 speak: bellows voice through the speaker, time to first audio and phoneme times", "fail", (e as Error).message.slice(0, 200));
  }
  check(r, "#43 speak: pocket tts worker patches", "not run", "needs the community browser build's base url; no reference voice is used");
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}

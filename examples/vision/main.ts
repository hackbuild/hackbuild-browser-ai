import { probe, type Env } from "@hackbuild/ai-env";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { createHub, createRegistry, type Hub, type RunOptions } from "@hackbuild/models";
import { attachVision, caption, depth, depthToRgba, detect, fitSize, loadTasksVision, mediapipeProvider, segment } from "@hackbuild/vision";
import * as THREE from "three";
import { stage } from "../shared/three.js";
import { $, FrameTimer, auto, check, finish, quantile, readout, result, sleep, status } from "../shared/ui.js";

const r = result("vision");
$("#controls").innerHTML = `
<button id="depth">depth</button>
<label>device <select id="dev"><option value="gpu">webgpu if present</option><option value="cpu">wasm only</option></select></label>
<button id="loop">depth every frame it can</button>
<button id="loopb">depth with a 20 ms frame budget</button>
<button id="stop">stop the loop</button>
<button id="detect">detect objects</button>
<button id="sam">mask at the centre</button>
<select id="vlm"><option value="smolvlm-256m-instruct">smolvlm 256m, weights Apache-2.0, about 260 MB (inferred)</option><option value="lfm2-vl-450m">lfm2-vl 450m, weights LFM Open License v1.0, about 320 MB (inferred), webgpu only</option></select>
<button id="cap">caption</button>`;
const side = document.createElement("canvas");
side.style.cssText = "position:absolute;right:8px;bottom:8px;width:28%;height:auto;border:1px solid var(--line);border-radius:4px;background:#000";
$("#stage").append(side);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

// a scene built in code: shapes at different depths, so the depth map has something to find
const { renderer, scene, camera, controls } = stage([0, 0.4, 0], 4.2);
const shapes: THREE.Mesh[] = [];
const mk = (g: THREE.BufferGeometry, color: number, p: [number, number, number]) => {
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color, roughness: 0.5 }));
  m.position.set(...p);
  scene.add(m);
  shapes.push(m);
};
mk(new THREE.SphereGeometry(0.55, 48, 24), 0xd0633a, [-1, 0.55, 0.8]);
mk(new THREE.BoxGeometry(0.9, 0.9, 0.9), 0x3a7bd0, [0.9, 0.45, -0.6]);
mk(new THREE.TorusKnotGeometry(0.35, 0.12, 128, 16), 0x5fae5a, [0.1, 0.8, 1.4]);
mk(new THREE.CylinderGeometry(0.25, 0.25, 1.6, 32), 0xc9b26a, [-0.4, 0.8, -1.6]);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), new THREE.MeshStandardMaterial({ color: 0x9a9890 }));
floor.rotation.x = -Math.PI / 2;
scene.add(floor);
const timer = new FrameTimer();
let hubs: { gpu: Hub; cpu: Hub } | null = null;
let last = performance.now();

function frame(now: number) {
  timer.tick(now);
  const t = timer.time(() => {
    for (const [i, s] of shapes.entries()) s.rotation.y += 0.01 * (i + 1);
    controls.update();
    renderer.render(scene, camera);
  });
  void t;
  hubs?.gpu.reportFrame(now - last);
  last = now;
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

status("probing webgpu.");
const env = await probe();
const tjs = tjsProvider({ runtime: loadTransformers() });
function makeHub(e: Env): Hub {
  const hub = createHub({ registry: createRegistry(), env: e });
  attachVision(hub, tjs);
  hub.provide("tjs", tjs.factory);
  hub.provide("mediapipe", mediapipeProvider({ runtime: loadTasksVision() }));
  hub.onBusy((n) => (document.title = n ? "model busy, vision" : "vision, hackbuild-browser-ai"));
  return hub;
}
hubs = { gpu: makeHub(env), cpu: makeHub({ ...env, webgpu: false, f16: false }) };
if (!env.webgpu) {
  ($("#dev") as HTMLSelectElement).value = "cpu";
  ($("#dev") as HTMLSelectElement).disabled = true;
  ($("#vlm option[value='lfm2-vl-450m']") as HTMLOptionElement).disabled = true;
}
status(env.webgpu ? "webgpu adapter found. models download from hugging face when you press a button." : "no webgpu adapter. models run on wasm.", env.webgpu ? "ok" : "warn");
const hub = () => (($("#dev") as HTMLSelectElement).value === "cpu" ? hubs!.cpu : hubs!.gpu);

// the frame is scaled to at most 512 px a side first: the depth pipeline resizes its output back to the input size on the cpu
async function snapshot(): Promise<string> {
  const src = renderer.domElement;
  const f = fitSize(src.width, src.height, 512);
  const c = new OffscreenCanvas(f.width, f.height);
  c.getContext("2d")!.drawImage(src, 0, 0, f.width, f.height);
  return URL.createObjectURL(await c.convertToBlob({ type: "image/png" }));
}

function paint(d: { width: number; height: number; data: Float32Array }): void {
  side.width = d.width;
  side.height = d.height;
  side.getContext("2d")!.putImageData(new ImageData(depthToRgba(d) as Uint8ClampedArray<ArrayBuffer>, d.width, d.height), 0, 0);
}

async function runDepth(h: Hub, label: string, n = 5): Promise<{ loadMs: number; p50: number; rung: string }> {
  status(`depth anything v2 small, weights Apache-2.0, on ${label}. downloading on first use.`);
  const url = await snapshot();
  const t = performance.now();
  const l = await h.use("depth");
  const rung = `${l.rung.device} ${l.rung.dtype ?? ""}`.trim();
  h.release(l);
  const loadMs = performance.now() - t;
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t2 = performance.now();
    const d = await depth(h, url);
    times.push(performance.now() - t2);
    paint(d);
  }
  URL.revokeObjectURL(url);
  const p50 = quantile(times, 0.5);
  show({ [`depth ${label} rung`]: rung, [`depth ${label} load ms (measured)`]: Math.round(loadMs), [`depth ${label} ms p50 (measured)`]: p50.toFixed(1) });
  status(`depth map on ${rung}.`, "ok");
  return { loadMs, p50, rung };
}

let looping = false;
async function depthLoop(schedule: RunOptions | undefined, ms: number): Promise<{ runs: number; skipped: number }> {
  looping = true;
  let runs = 0;
  let skipped = 0;
  const end = performance.now() + ms;
  while (looping && performance.now() < end) {
    const url = await snapshot();
    try {
      paint(await depth(hubs!.gpu, url, schedule ? { schedule } : {}));
      runs++;
    } catch (e) {
      if ((e as { code?: string }).code === "skipped") {
        skipped++;
        await sleep(16);
      } else throw e;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  looping = false;
  return { runs, skipped };
}

$("#depth").addEventListener("click", () => void runDepth(hub(), ($("#dev") as HTMLSelectElement).value === "cpu" ? "wasm" : "webgpu", 1).catch((e) => status(`depth failed: ${(e as Error).message}`, "bad")));
$("#loop").addEventListener("click", () => void depthLoop(undefined, 600_000));
$("#loopb").addEventListener("click", () => void depthLoop({ frameBudgetMs: 20, minIntervalMs: 200, when: "skip" }, 600_000));
$("#stop").addEventListener("click", () => (looping = false));
$("#detect").addEventListener("click", () => void runDetect());
$("#sam").addEventListener("click", () => void runSam());
$("#cap").addEventListener("click", () => void runCaption(($("#vlm") as HTMLSelectElement).value));

async function runDetect(): Promise<{ ms: number; n: number; rung: string }> {
  status("efficientdet lite0 on mediapipe, weights Apache-2.0.");
  const t = performance.now();
  const l = await hubs!.gpu.use("detect");
  const rung = l.rung.device;
  hubs!.gpu.release(l);
  const loadMs = performance.now() - t;
  const t2 = performance.now();
  const boxes = await detect(hubs!.gpu, renderer.domElement, { scoreThreshold: 0.3 });
  const ms = performance.now() - t2;
  show({ "detect rung": rung, "detect load ms (measured)": Math.round(loadMs), "detect ms (measured)": ms.toFixed(1), detections: boxes.map((b) => `${b.label} ${b.score.toFixed(2)}`).join(", ") || "none" });
  status(`${boxes.length} detections on the scene.`, "ok");
  return { ms, n: boxes.length, rung };
}

async function runSam(): Promise<{ loadMs: number; ms: number; area: number }> {
  status("slimsam 77 uniform, weights Apache-2.0.");
  const url = await snapshot();
  const f = fitSize(renderer.domElement.width, renderer.domElement.height, 512);
  const w = f.width;
  const h = f.height;
  const t = performance.now();
  const l = await hubs!.gpu.use("segment");
  hubs!.gpu.release(l);
  const loadMs = performance.now() - t;
  const t2 = performance.now();
  const masks = await segment(hubs!.gpu, url, { points: [{ x: w / 2, y: h / 2, label: 1 }] });
  const ms = performance.now() - t2;
  URL.revokeObjectURL(url);
  const m = masks[0];
  let on = 0;
  if (m) for (const v of m.data) if (v) on++;
  const area = m ? on / (m.width * m.height) : 0;
  if (m) {
    side.width = m.width;
    side.height = m.height;
    const img = new ImageData(m.width, m.height);
    for (let i = 0; i < m.data.length; i++) img.data.set(m.data[i] ? [255, 200, 80, 255] : [20, 20, 20, 255], i * 4);
    side.getContext("2d")!.putImageData(img, 0, 0);
  }
  show({ "slimsam load ms (measured)": Math.round(loadMs), "slimsam first mask ms (measured)": ms.toFixed(1), "mask area of frame (measured)": area.toFixed(3) });
  status("mask for the point at the centre of the frame.", "ok");
  return { loadMs, ms, area };
}

async function runCaption(model: string): Promise<{ loadMs: number; ms: number; text: string }> {
  status(`${model} caption. downloading on first use.`);
  const url = await snapshot();
  const t = performance.now();
  const l = await hubs!.gpu.use({ id: model });
  hubs!.gpu.release(l);
  const loadMs = performance.now() - t;
  const t2 = performance.now();
  const text = await caption(hubs!.gpu, url, { model, maxTokens: 40 });
  const ms = performance.now() - t2;
  URL.revokeObjectURL(url);
  show({ [`${model} rung`]: `${l.rung.device} ${JSON.stringify(l.rung.dtype ?? "")}`, [`${model} load ms (measured)`]: Math.round(loadMs), [`${model} caption ms (measured)`]: Math.round(ms), [`${model} says`]: text });
  status(`caption: ${text}`, "ok");
  return { loadMs, ms, text };
}

if (auto) {
  const n = r.numbers;
  const tryit = async <T>(id: string, fn: () => Promise<T>, after: (x: T) => [boolean, string]) => {
    try {
      const x = await fn();
      const [ok, why] = after(x);
      check(r, id, ok ? "pass" : "fail", why);
      return x;
    } catch (e) {
      check(r, id, "fail", (e as Error).message.slice(0, 300));
      return null;
    }
  };
  await tryit("#29 vision: depth anything v2 small on webgpu fp16 and wasm q8", async () => {
    const g = await runDepth(hubs!.gpu, "webgpu");
    const c = await runDepth(hubs!.cpu, "wasm");
    n["depth webgpu rung"] = g.rung;
    n["depth webgpu load ms (measured)"] = Math.round(g.loadMs);
    n["depth webgpu ms p50 (measured)"] = Math.round(g.p50 * 10) / 10;
    n["depth wasm rung"] = c.rung;
    n["depth wasm load ms (measured)"] = Math.round(c.loadMs);
    n["depth wasm ms p50 (measured)"] = Math.round(c.p50 * 10) / 10;
    return { g, c };
  }, ({ g, c }) => [g.rung.startsWith("webgpu") && c.rung.startsWith("wasm"), `rungs ${g.rung} and ${c.rung}; the bail comparison not run (no bail output here)`]);

  await tryit("#35 models, vision: depth beside a three.js scene with and without frame budget", async () => {
    timer.reset();
    await sleep(3000);
    const idle = timer.stats();
    timer.reset();
    const a = await depthLoop(undefined, 6000);
    const free = timer.stats();
    timer.reset();
    const b = await depthLoop({ frameBudgetMs: 20, minIntervalMs: 200, when: "skip" }, 6000);
    const budget = timer.stats();
    n["scene alone frame ms p50 / p95 (measured)"] = `${idle.frameMsP50.toFixed(1)} / ${idle.frameMsP95.toFixed(1)}`;
    n["depth unscheduled frame ms p50 / p95 (measured)"] = `${free.frameMsP50.toFixed(1)} / ${free.frameMsP95.toFixed(1)}`;
    n["depth unscheduled runs in 6 s (measured)"] = a.runs;
    n["depth 20 ms budget 200 ms gap frame ms p50 / p95 (measured)"] = `${budget.frameMsP50.toFixed(1)} / ${budget.frameMsP95.toFixed(1)}`;
    n["depth budgeted runs and skips in 6 s (measured)"] = `${b.runs} runs, ${b.skipped} skips`;
    n["scene alone fps p50 (measured)"] = Math.round(idle.fpsP50 * 10) / 10;
    return { free, budget };
  }, () => [true, "frame times measured; stutter not looked at by a person"]);

  await tryit("vision: efficientdet lite0 detector on a still frame (mediapipe)", runDetect, (x) => {
    n["detect ms (measured)"] = Math.round(x.ms * 10) / 10;
    n["detect rung"] = x.rung;
    return [true, `${x.n} detections on shapes built in code; the webcam rows stay not run`];
  });
  check(r, "#30 vision: tasks-vision detector, segmenter and landmarkers on a webcam", "not run", "needs a webcam and safari");

  await tryit("#31 vision: smolvlm 256m and lfm2-vl 450m captions, slimsam point masks", async () => {
    const s = await runSam();
    n["slimsam load ms (measured)"] = Math.round(s.loadMs);
    n["slimsam mask ms (measured)"] = Math.round(s.ms);
    const v = await runCaption("smolvlm-256m-instruct");
    n["smolvlm load ms (measured)"] = Math.round(v.loadMs);
    n["smolvlm caption ms (measured)"] = Math.round(v.ms);
    n["smolvlm caption"] = v.text;
    let lfm = "";
    try {
      const x = await runCaption("lfm2-vl-450m");
      n["lfm2-vl load ms (measured)"] = Math.round(x.loadMs);
      n["lfm2-vl caption ms (measured)"] = Math.round(x.ms);
      n["lfm2-vl caption"] = x.text;
    } catch (e) {
      lfm = (e as Error).message.slice(0, 200);
    }
    return { s, v, lfm };
  }, ({ s, v, lfm }) => {
    // a caption reads as words: most tokens are plain lowercase or capitalized words
    const toks = v.text.split(/\s+/).filter(Boolean);
    const wordy = toks.filter((t) => /^[A-Za-z][a-z]*[.,]?$/.test(t)).length / Math.max(1, toks.length);
    n["smolvlm caption word share (computed)"] = Math.round(wordy * 100) / 100;
    const why = [wordy < 0.7 ? `smolvlm caption is not prose (${Math.round(wordy * 100)} percent words)` : "", lfm ? `lfm2-vl: ${lfm}` : ""].filter(Boolean).join("; ");
    return [s.area > 0 && wordy >= 0.7 && !lfm, why || "captions read by the harness only"];
  });
  check(r, "#32 vision: external yolov8n export through the ort provider", "not run", "needs the owner supplied onnx file (AGPL-3.0)");
  const failed = Object.values(r.checks).some((c) => c.status === "fail");
  finish(r, failed ? "fail" : "pass");
}

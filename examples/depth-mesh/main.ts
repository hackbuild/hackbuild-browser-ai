import { bounds, fitToPrint, loadDepthMesh, openEdges, toStl, volume, type Mesh } from "@hackbuild/depth-mesh";
import { DEPTH_MESH_WASM_BASE64 } from "@hackbuild/depth-mesh/inline";
import * as THREE from "three";
import { geometry, stage } from "../shared/three.js";
import { $, FrameTimer, auto, check, finish, frames, onDrop, readout, result, status } from "../shared/ui.js";

const r = result("depth-mesh");
$("#controls").innerHTML = `
<label class="hb-ctl">base mm <input class="hb-input" id="base" inputmode="decimal" type="number" step="0.1" value="0.4"></label>
<label class="hb-ctl">height mm <input class="hb-input" id="height" inputmode="decimal" type="number" step="0.1" value="2.4"></label>
<label class="hb-ctl">gamma <input class="hb-input" id="gamma" inputmode="decimal" type="number" step="0.1" value="1.2"></label>
<label class="hb-ctl">background cut <input class="hb-input" id="bgcut" inputmode="decimal" type="number" step="0.02" value="0.1"></label>
<button class="hb-btn" type="button" id="relief">relief</button>
<button class="hb-btn hb-btn-2" type="button" id="carve">carve a box on a turntable</button>
<button class="hb-btn hb-btn-2" type="button" id="stl" disabled>download stl</button>
<span class="hb-dropzone" id="drop">drop a grayscale depth map (white is near) <input id="file" type="file" accept="image/*"></span>`;
const num = (id: string) => Number(($(id) as HTMLInputElement).value);
const rows: Record<string, string | number> = {};
const show = (o: Record<string, string | number>) => readout(Object.assign(rows, o));

status("loading the inlined depth-mesh wasm.");
const dm = await loadDepthMesh({ base64: DEPTH_MESH_WASM_BASE64 });
const { renderer, scene, camera, controls } = stage([0, 0, 0], 70);
const mat = new THREE.MeshStandardMaterial({ color: 0xc8b89a, roughness: 0.7, metalness: 0, flatShading: false });
let shown: THREE.Mesh | null = null;
let last: Mesh | null = null;
const timer = new FrameTimer();

const W = 256;
let depth = { data: dm.synthDepth(W, W), w: W, h: W };

function put(m: Mesh, label: string): void {
  last = m;
  if (shown) {
    scene.remove(shown);
    shown.geometry.dispose();
  }
  const b = bounds(m.positions);
  shown = new THREE.Mesh(geometry(m.positions, m.indices), mat);
  shown.position.set(-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, -(b.min[2] + b.max[2]) / 2);
  const holder = new THREE.Group();
  holder.add(shown);
  if (label === "relief") holder.rotation.x = -Math.PI / 2;
  scene.clear();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x555555, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(30, 60, 40);
  scene.add(sun, holder);
  ($("#stl") as HTMLButtonElement).disabled = false;
}

function relief(): { tris: number; open: number; ms: number } {
  const t = performance.now();
  const h = dm.relief(depth.data, { base: num("#base"), height: num("#height"), gamma: num("#gamma"), bgcut: num("#bgcut") });
  dm.healPinches(h, depth.w, depth.h);
  const m = dm.heightfieldMesh(h, depth.w, depth.h, 50 / depth.w);
  const ms = performance.now() - t;
  const open = openEdges(m.indices);
  put(m, "relief");
  show({
    source: depth.w === W && depth.h === W ? "seeded synthetic depth" : "your depth map",
    "triangles (computed)": m.indices.length / 3,
    "open edges (computed)": open,
    "volume mm3 (computed)": Math.round(volume(m)),
    "relief ms (measured)": ms.toFixed(1),
  });
  status(open ? "the relief has open edges. it will not slice as a solid." : "the relief is closed. download the stl to slice it.", open ? "bad" : "ok");
  return { tris: m.indices.length / 3, open, ms };
}

function carve(): { ratio: number; open: number; ms: number } {
  const t0 = { width: 160, height: 160, focal: 220, dist: 3 };
  const angles: number[] = [];
  const masks: Uint8Array[] = [];
  const ext: [number, number, number] = [0.5, 0.35, 0.25];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    angles.push(a);
    masks.push(dm.morphOpen(dm.synthBox(a, ext, t0), t0.width, t0.height));
  }
  const t = performance.now();
  const hull = dm.carve(masks, angles, { ...t0, half: 0.7 }, 64, 1);
  const ms = performance.now() - t;
  const v = volume(hull);
  const ratio = v / (8 * ext[0] * ext[1] * ext[2]);
  const open = openEdges(hull.indices);
  put(fitToPrint(hull, 40), "carve");
  show({
    source: "24 seeded silhouettes of a box",
    "triangles (computed)": hull.indices.length / 3,
    "open edges (computed)": open,
    "hull to box volume (computed)": ratio.toFixed(3),
    "carve ms (measured)": ms.toFixed(1),
  });
  status("carved hull of a box seen from 24 turntable angles.", "ok");
  return { ratio, open, ms };
}

onDrop($("#drop"), async (files) => {
  const bmp = await createImageBitmap(files[0]!);
  const s = Math.min(1, 512 / Math.max(bmp.width, bmp.height));
  const w = Math.max(2, Math.round(bmp.width * s));
  const h = Math.max(2, Math.round(bmp.height * s));
  const c = new OffscreenCanvas(w, h);
  const g = c.getContext("2d")!;
  g.drawImage(bmp, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let i = 0; i < data.length; i++) data[i] = px[i * 4]! / 255;
  depth = { data, w, h };
  relief();
}, $("#file") as HTMLInputElement);
$("#relief").addEventListener("click", () => void relief());
$("#carve").addEventListener("click", () => void carve());
$("#stl").addEventListener("click", () => {
  if (!last) return;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([toStl(fitToPrint(last, 50)) as Uint8Array<ArrayBuffer>], { type: "model/stl" }));
  a.download = "relief.stl";
  a.click();
});

function frame(now: number) {
  timer.tick(now);
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
const first = relief();

if (auto) {
  r.numbers["relief triangles 256 px (computed)"] = first.tris;
  r.numbers["relief ms 256 px (measured)"] = Math.round(first.ms * 10) / 10;
  r.numbers["relief open edges (computed)"] = first.open;
  await frames(60);
  const c = carve();
  r.numbers["carve ms 24 views 64 cubed (measured)"] = Math.round(c.ms * 10) / 10;
  r.numbers["carve hull to box volume (computed)"] = Math.round(c.ratio * 1000) / 1000;
  timer.reset();
  await frames(180);
  Object.assign(r.numbers, timer.numbers());
  const ok = first.open === 0 && c.open === 0 && c.ratio > 0.9 && c.ratio < 1.5;
  check(r, "depth-mesh: closed relief and turntable carve in the browser", ok ? "pass" : "fail", ok ? "synthetic depth and silhouettes" : `relief open ${first.open}, carve open ${c.open}, volume ratio ${c.ratio.toFixed(3)}`);
  check(r, "#33 depth-mesh: a relief from a depth map, sliced and printed", "not run", "needs a depth anything map of a photo, a slicer and a printer; the stl downloads from this page");
  check(r, "#34 depth-mesh: a turntable carve from a webcam", "not run", "needs a webcam, a turntable and a person looking");
  finish(r, ok ? "pass" : "fail");
}

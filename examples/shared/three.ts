// A small three.js stage in #stage: renderer, camera, orbit controls, lights.
// The canvas sits in the class layer's .hb-viewport-host on a lit stage.
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { stageFrame } from "./ui.js";

export interface Stage {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: OrbitControls;
}

export function stage(target: [number, number, number] = [0, 0, 0], distance = 2): Stage {
  const host = stageFrame("lit", true);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  host.append(renderer.domElement);
  const scene = new THREE.Scene();
  // the light scene the checks were measured on; the dark branch went with the dark palette
  scene.background = new THREE.Color(0xffffff);
  const camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.01, 500);
  camera.position.set(target[0] + distance * 0.6, target[1] + distance * 0.5, target[2] + distance);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...target);
  controls.update();
  scene.add(new THREE.HemisphereLight(0xffffff, 0xb0aca0, 2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.8);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const fit = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(fit).observe(host);
  fit();
  return { renderer, scene, camera, controls };
}

/** A three geometry from flat positions and indices, with normals. */
export function geometry(positions: Float32Array, indices?: Uint32Array): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (indices) g.setIndex(new THREE.BufferAttribute(indices, 1));
  g.computeVertexNormals();
  return g;
}

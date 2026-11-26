# @hackbuild/depth-mesh

Turn a depth map, a photo or turntable silhouettes into a closed solid you can print, with a Rust wasm core that runs in your tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/depth-mesh)](https://www.npmjs.com/package/@hackbuild/depth-mesh) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 8.5 kB measured](https://img.shields.io/badge/gzip-8.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Turns a photo into a closed relief solid in one call, with height from depth, brightness or an inflated silhouette.
- Turns a depth map into a point cloud and tracks frames against a voxel model with point to plane ICP.
- Carves a hull from turntable silhouettes and meshes it with surface nets.
- Exports binary STL, OBJ and binary PLY, and checks bounds, open edges and volume.

## Install

```sh
npm install @hackbuild/depth-mesh
```

No dependencies and no peers. The wasm core ships in the package as `wasm/depth-mesh.wasm` and as base64 in the `@hackbuild/depth-mesh/inline` subpath. Depth maps come from [@hackbuild/vision](../vision/README.md) (Depth Anything V2 small, Apache-2.0) or any other source; install it only if you want the depth source.

## Quick start

```ts
import { loadDepthMesh, openEdges, photoRelief, toStl } from "@hackbuild/depth-mesh";
import { DEPTH_MESH_WASM_BASE64 } from "@hackbuild/depth-mesh/inline";

// the wasm core, inlined so nothing is fetched
const dm = await loadDepthMesh({ base64: DEPTH_MESH_WASM_BASE64 });

// a photo drawn on a canvas; brightness needs no model
const canvas = document.querySelector("canvas")!;
const image = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);

// a 30 mm wide relief, 0.24 to 2.4 mm high, as a closed solid
const r = await photoRelief(dm, image, { source: "brightness", width: 30, base: 0.24, height: 2.4 });
for (const [level, text] of r.notes) console.log(level, text);
console.log("open edges", openEdges(r.mesh.indices)); // 0 for a closed solid

// a binary STL in mm, ready for a slicer
const stl = toStl(r.mesh);
const url = URL.createObjectURL(new Blob([stl as BlobPart], { type: "model/stl" }));
console.log("relief.stl", stl.length, "bytes at", url);
```

## Live example

The relief tool in the suite runs this package: [hackbuild-suite relief](https://hackbuild.github.io/hackbuild-suite/#/image/relief). The demo page turns a depth map into a relief solid and carves silhouettes on a turntable into a hull, with STL out: [hackbuild-browser-ai/depth-mesh](https://hackbuild.github.io/hackbuild-browser-ai/depth-mesh/).

## Concepts

### the core comes from a url, bytes or base64

`loadDepthMesh` takes `{ url }`, `{ bytes }` or `{ base64 }`. The `@hackbuild/depth-mesh/inline` subpath exports `DEPTH_MESH_WASM_BASE64`; `@hackbuild/depth-mesh/depth-mesh.wasm` is the same core as a file. The core is built from `crates/depth-mesh` for wasm32 with SIMD128, from an earlier scan bench (point clouds, point to plane ICP, silhouette carving, surface nets) and an earlier relief bench (relief heightfields and their closed solids). Inputs are copied into wasm memory and results copied out. Rebuild the wasm and the inlined base64 with `npm run build:wasm -w @hackbuild/depth-mesh`.

### photo to relief

`photoRelief(dm, rgba, options)` takes a photo's RGBA pixels and a height source and returns the closed relief solid, the heights, the cell size and status notes, as the earlier relief bench did. `HEIGHT_SOURCES` names the sources in the bench's height from order: `depth` (Depth Anything, needs a model or a stored map), `brightness`, and `inflate` (a silhouette domed by its distance to the outline). The last two need no model.

Options are the bench's: `width` (mm), `base` and `height` (the relief range, mm), `gamma`, `bgcut` (depth and brightness), `smooth` (mm), `invert`, `threshold` (inflate), plus a relief `mask` (a segmentation mask works), the `erase` and `restore` brush masks (restore wins), `keepLargest` and `cells` (grid columns, default the photo width up to 256). Masks of any size are resampled. The mesh is in mm, centred, with image up on +y.

```ts
import { depth } from "@hackbuild/vision";
import { photoRelief, toStl } from "@hackbuild/depth-mesh";

const r = await photoRelief(dm, ctx.getImageData(0, 0, w, h), {
  source: "depth",
  depth: saved ?? (() => depth(hub, canvas)),       // a stored map skips the model
  width: 30, base: 0.24, height: 2.4, bgcut: 0.25, smooth: 0.3,
  erase, restore,
});
store(r.depth);                                      // keep the map with the design
download("relief.stl", toStl(r.mesh));               // mm, centred, image up is +y
```

When depth fails or no map is given, the call uses brightness and `r.notes` says why; `r.source` is the source used. `brightnessHeight`, `inflateHeight` and `depthHeight` are the sources on their own.

### relief heights

`relief` normalizes depth (0 to 1, larger nearer) over the region or a mask, cuts the background, applies gamma and keeps a floor of 0.12 mm, as earlier builds did. `healPinches` fills corner to corner pinches. `heightfieldMesh` splits each top quad on its shorter diagonal and closes the walls and the bottom.

```ts
const h = dm.relief(map.data, { base: 0.4, height: 2.4, gamma: 1.2, bgcut: 0.1 });
dm.healPinches(h, map.width, map.height);
const relief = dm.heightfieldMesh(h, map.width, map.height, 0.25);
```

### scanning by depth

`cloud` maps depth to Z = near + (1 - d)(far - near), with the camera looking down -Z. Normals come from the grid neighbours and face the camera; fliers at depth edges are dropped. `model(voxel).icp` runs two stages (2 maxDist, then maxDist), a 27 voxel nearest neighbour search, normal agreement, a 6 by 6 solve and a Rodrigues update. `trackGood` is the earlier scan bench's accept test: enough inliers, low error and no jump.

```ts
const model = dm.model(0.01);
const cloud = dm.cloud(map.data, map.width, map.height, { near: 0.3, far: 1.2, focal: 500, stride: 2 });
const r = model.icp(cloud, pose);
if (trackGood(r, pose, cloud.count)) model.integrate(cloud, (pose = r.pose));
```

### scanning by silhouettes

`carve` keeps a voxel when it projects inside every mask, then blurs and meshes with surface nets. `morphOpen` cleans masks first. Silhouettes come from a turntable, as earlier builds did.

```ts
const hull = dm.carve(masks, angles, { width, height, focal, dist, half }, 64, 1);
const stl = toStl(fitToPrint(hull, 40));
```

### export and checks

`toStl` writes binary STL, `toObj` OBJ text, `toPly` and `cloudToPly` binary PLY. `fitToPrint` centres a mesh and scales its longest side to a size in mm. `bounds`, `openEdges` (0 for a closed surface) and `volume` (positive when faces wind outward) are the checks a slicer cares about.

## API overview

| export | what it does |
|---|---|
| [`loadDepthMesh`](../../docs/api/depth-mesh/README.md#loaddepthmesh) | instantiate the wasm core |
| [`DepthMesh`](../../docs/api/depth-mesh/README.md#depthmesh) | cloud, relief, heightfield solid, surface nets, carving and voxel models |
| [`photoRelief`](../../docs/api/depth-mesh/README.md#photorelief) | a photo to a closed relief solid in one call |
| [`HEIGHT_SOURCES`](../../docs/api/depth-mesh/README.md#height_sources) | the three height sources in the bench's order |
| [`RELIEF_DEFAULTS`](../../docs/api/depth-mesh/README.md#relief_defaults) | the default relief settings |
| [`brightnessHeight`](../../docs/api/depth-mesh/README.md#brightnessheight) | brightness per cell and coverage |
| [`inflateHeight`](../../docs/api/depth-mesh/README.md#inflateheight) | an inflated silhouette per cell |
| [`depthHeight`](../../docs/api/depth-mesh/README.md#depthheight) | a depth map resampled to the relief grid |
| [`VoxelModel`](../../docs/api/depth-mesh/README.md#voxelmodel) | a scan's voxel model with ICP and integration |
| [`trackGood`](../../docs/api/depth-mesh/README.md#trackgood) | accept or reject a tracked frame |
| [`toStl`](../../docs/api/depth-mesh/README.md#tostl) | binary STL |
| [`toObj`](../../docs/api/depth-mesh/README.md#toobj) | OBJ text |
| [`toPly`](../../docs/api/depth-mesh/README.md#toply) | binary PLY of a mesh or points |
| [`cloudToPly`](../../docs/api/depth-mesh/README.md#cloudtoply) | binary PLY of a point cloud |
| [`fitToPrint`](../../docs/api/depth-mesh/README.md#fittoprint) | centre and scale so the longest side is a size in mm |
| [`bounds`](../../docs/api/depth-mesh/README.md#bounds) | axis aligned bounds of positions |
| [`openEdges`](../../docs/api/depth-mesh/README.md#openedges) | edges not shared by exactly two triangles |
| [`volume`](../../docs/api/depth-mesh/README.md#volume) | signed volume of a closed mesh |

The full reference is in [docs/api/depth-mesh](../../docs/api/depth-mesh/README.md).

## Models and weights

| model | id | size | licence | loads from |
|---|---|---|---|---|
| Depth Anything V2 small (through @hackbuild/vision, optional) | `onnx-community/depth-anything-v2-small` | about 100 MB (inferred) | Apache-2.0 | the Hugging Face hub, through @hackbuild/vision |

This package loads no model and bundles no weights. The `depth` source takes a depth map you pass or a call that makes one; @hackbuild/vision runs the model and @hackbuild/weights caches its weights. `brightness` and `inflate` need no model.

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| wasm core | WebAssembly with SIMD128 | yes (inferred) | yes (inferred) | yes (inferred) | unknown |
| threads | none | not used | not used | not used | not used |
| WebGPU | none here | not used | not used | not used | not used |

The core is single threaded and runs from file://. There is no scalar fallback build; a browser without wasm SIMD128 cannot instantiate it (inferred). Speed in a browser is unknown; no timing was taken. It also runs in Node 22, where the tests run it.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `cloud: grid size W x H must be positive integers` (and other calls) | a width, height or grid size is 0, negative or fractional | pass whole positive sizes |
| `cloud: N values for a W x H grid, which needs M` | the array is shorter than the grid | pass width times height values (dx times dy times dz for fields) |
| `relief: mask has N cells, values have M` | the relief mask is another size | make the mask the same size as the values, or pass it to `photoRelief`, which resamples |
| `carve: N masks but M angles` | masks and angles differ in count | pass one angle per mask |
| `photoRelief: N bytes for a W x H RGBA image` | the image is empty or its data is short | pass ImageData or RGBA with width times height times 4 bytes |
| `depth failed: ... using brightness; inflate also works with no model` (a note, not a throw) | no depth map, or the depth call threw | pass a stored map or a working depth call; the relief falls back to brightness |
| `no relief: every cell was cut. lower the background cut or clear the erase brush` (a note) | background cut, mask or erase removed every cell | lower `bgcut` or clear the brushes |
| `depth-mesh wasm: http 404 for ...` | the wasm URL did not load | serve `wasm/depth-mesh.wasm`, or pass `{ base64: DEPTH_MESH_WASM_BASE64 }` |

## Works with

- [@hackbuild/vision](../vision/README.md) makes the depth map (Depth Anything V2 small) and segmentation masks for the relief `mask`.
- [@hackbuild/weights](../weights/README.md) caches the depth model's weights that vision loads.
- [@hackbuild/media](../media/README.md) records the canvas you preview the solid on.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-depth-mesh` passes 8 tests (6
  unit, 2 integration) under rustc 1.95: a closed sphere from surface
  nets, ICP recovering a known small motion on a bumpy surface and
  returning a perturbed sphere cloud to identity, carving a box from 12
  silhouettes to within a voxel or two of its height, relief heights and
  a closed 2 by 2 solid. `cargo clippy -D warnings` passes natively and
  for wasm32; `cargo fmt --check` passes.
- 2026-11-22: `npx vitest run packages/depth-mesh` passes 4 tests under
  Node 22.18.0, including native and wasm parity: the wasm build (simd128
  on) gives the same bits as the native build for the depth fixture,
  cloud, relief heights and mesh, surface nets, voxel model size, the ICP
  pose, inliers and error, carving masks and mesh, and Rodrigues. The
  carved hull and the relief solid have no open edges; volumes are
  positive and near the box's.

- 2026-11-24: `npx vitest run packages/depth-mesh` passes 12 tests: the
  three named sources; brightness from a ramp; the inflate dome highest
  in the middle of a disc, and inverted; depth through a call, resampled,
  kept on the result, inverted; the fallback to brightness with its
  note; background cut, relief mask, erase and restore; keep largest;
  closed solids (0 open edges, computed) and an STL of the right length.

### Not verified by anything

- `photoRelief` on a real photo with a real Depth Anything map, and its
  speed; the inflate blur matches the bench's canvas blur only in
  approach (a gaussian of half the smoothing radius before the
  threshold).
- Any real depth map or webcam scan; ICP drift over a real sequence;
  carving with real turntable silhouettes and a real focal length.
- Printing: no STL from here was sliced or printed.
- Speed in a browser: no timing was taken.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 8,508 bytes | 8,933 bytes |
| `wasm/depth-mesh.wasm` | 23,546 bytes | 24,723 bytes |
| `dist/single/index.iife.js` (single file build) | 8,394 bytes | 8,813 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package bundles no weights; Depth Anything V2 small, loaded through @hackbuild/vision, is Apache-2.0.

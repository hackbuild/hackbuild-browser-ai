# @hackbuild/depth-mesh

Turn a depth map, a photo or turntable silhouettes into a closed solid you can print, with a Rust wasm core that runs in your tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/depth-mesh)](https://www.npmjs.com/package/@hackbuild/depth-mesh) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 8.5 kB measured](https://img.shields.io/badge/gzip-8.5%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

Browser status: no model run of this package has been verified in a real browser yet.

## What it does

- Turns a photo into a closed relief solid in one call, with height from depth, brightness or an inflated silhouette.
- Turns a depth map into a point cloud and tracks frames against a voxel model with point to plane ICP.
- Carves a hull from turntable silhouettes and meshes it with surface nets.
- Exports binary STL, OBJ and binary PLY, and checks bounds, open edges and volume.
- Writes multi colour 3MF in the Orca and Bambu dialect, with a colour per height band or per mask.
- Renders a GLB's depth at a chosen pose into the same depth map the photo path takes.

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
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;

input.onchange = async () => {
  // the chosen photo's pixels; brightness needs no model
  const bitmap = await createImageBitmap(input.files![0]!);
  const ctx = new OffscreenCanvas(bitmap.width, bitmap.height).getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0);
  // a 30 mm wide relief, 0.24 to 2.4 mm high, as a closed solid
  const r = await photoRelief(dm, ctx.getImageData(0, 0, bitmap.width, bitmap.height), { source: "brightness", width: 30, base: 0.24, height: 2.4 });
  console.log("open edges", openEdges(r.mesh.indices), r.notes); // 0 for a closed solid
  // a binary STL in mm, ready for a slicer
  const stl = toStl(r.mesh);
  const url = URL.createObjectURL(new Blob([stl as BlobPart], { type: "model/stl" }));
  console.log("relief.stl", stl.length, "bytes at", url);
};
```

## Live example

The relief tool in the suite runs this package: [hackbuild-suite relief](https://hackbuild.github.io/hackbuild-suite/#/image/relief). The demo page turns a depth map into a relief solid and carves silhouettes on a turntable into a hull, with STL out: [hackbuild-browser-ai/depth-mesh](https://hackbuild.github.io/hackbuild-browser-ai/depth-mesh/).

## Concepts

### the core comes from a url, bytes or base64

`loadDepthMesh` takes `{ url }`, `{ bytes }` or `{ base64 }`. The `@hackbuild/depth-mesh/inline` subpath exports `DEPTH_MESH_WASM_BASE64`; `@hackbuild/depth-mesh/depth-mesh.wasm` is the same core as a file. The core is built from `crates/depth-mesh` for wasm32 with SIMD128 and covers point clouds, point to plane ICP, silhouette carving, surface nets, relief heightfields and their closed solids. Inputs are copied into wasm memory and results copied out. Rebuild the wasm and the inlined base64 with `npm run build:wasm -w @hackbuild/depth-mesh`.

### photo to relief

`photoRelief(dm, rgba, options)` takes a photo's RGBA pixels and a height source and returns the closed relief solid, the heights, the cell size and status notes. `HEIGHT_SOURCES` names the sources in the order a height source select shows them: `depth` (Depth Anything, needs a model or a stored map), `brightness`, and `inflate` (a silhouette domed by its distance to the outline). The last two need no model.

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

`relief` normalizes depth (0 to 1, larger nearer) over the region or a mask, cuts the background, applies gamma and keeps a floor of 0.12 mm. `healPinches` fills corner to corner pinches. `heightfieldMesh` splits each top quad on its shorter diagonal and closes the walls and the bottom.

```ts
const h = dm.relief(map.data, { base: 0.4, height: 2.4, gamma: 1.2, bgcut: 0.1 });
dm.healPinches(h, map.width, map.height);
const relief = dm.heightfieldMesh(h, map.width, map.height, 0.25);
```

### scanning by depth

`cloud` maps depth to Z = near + (1 - d)(far - near), with the camera looking down -Z. Normals come from the grid neighbours and face the camera; fliers at depth edges are dropped. `model(voxel).icp` runs two stages (2 maxDist, then maxDist), a 27 voxel nearest neighbour search, normal agreement, a 6 by 6 solve and a Rodrigues update. `trackGood` is the accept test for a tracked frame: enough inliers, low error and no jump.

```ts
const model = dm.model(0.01);
const cloud = dm.cloud(map.data, map.width, map.height, { near: 0.3, far: 1.2, focal: 500, stride: 2 });
const r = model.icp(cloud, pose);
if (trackGood(r, pose, cloud.count)) model.integrate(cloud, (pose = r.pose));
```

### scanning by silhouettes

`carve` keeps a voxel when it projects inside every mask, then blurs and meshes with surface nets. `morphOpen` cleans masks first. Silhouettes come from a turntable.

```ts
const hull = dm.carve(masks, angles, { width, height, focal, dist, half }, 64, 1);
const stl = toStl(fitToPrint(hull, 40));
```

### export and checks

`toStl` writes binary STL, `toObj` OBJ text, `toPly` and `cloudToPly` binary PLY. `fitToPrint` centres a mesh and scales its longest side to a size in mm. `bounds`, `openEdges` (0 for a closed surface) and `volume` (positive when faces wind outward) are the checks a slicer cares about.

### multi colour 3mf

`toThreeMf(objects, filaments, options)` writes a 3MF that OrcaSlicer, Bambu Studio and Flash Studio open as one object of coloured parts: each part carries its own extruder in `Metadata/model_settings.config`, the object carries the first part's, and `Metadata/project_settings.config` holds one colour, type and preset name per slot. The dialect is ported from the hackbuild-3mf writer; the zip is store only with sorted names and a fixed date, so equal input gives equal bytes. `printer` and `process` name the slicer presets; left out, the slicer keeps its own.

`reliefParts(dm, relief, split)` cuts a relief into closed bodies: `{ by: "height", breaks: [1.2, 1.8] }` makes three stacked bands (each from its floor up to the lower of the cell and the band top), `{ by: "mask", labels }` one body per label or per mask (a later mask paints over an earlier one).

```ts
const r = await photoRelief(dm, image, { source: "depth", depth: map });
const parts = reliefParts(dm, r, { by: "height", breaks: [1.0, 1.8] });
const file = toThreeMf([{ name: "relief", parts }], [{ color: "#FFFFFF" }, { color: "#888888" }, { color: "#FE0386" }], {
  printer: "Flashforge Creator 5 Pro 0.4 nozzle",
});
```

### depth from a posed 3d model

`glbMesh(bytes)` reads the triangles of an uncompressed GLB with every node transform applied (Draco and meshopt are refused with a message). `modelDepth(mesh, { width, pose: { up: "z", yaw, pitch, roll } })` turns it to the pose and rasterises the nearest surface through an orthographic camera on the CPU: a depth map, 0 to 1 with larger nearer and 0 off the model, plus `cover`. `depthImage(depth)` gives the silhouette as an RGBA image. Pass both to `photoRelief`, the map as `depth` to `photoRelief` with `source: "depth"`, and the 3D model goes down the photo path.

```ts
const depth = modelDepth(glbMesh(await file.arrayBuffer()), { width: 256, pose: { up: "y", yaw: 30, roll: 0 } });
const r = await photoRelief(dm, depthImage(depth), { source: "depth", depth }); // depthImage: the silhouette as the photo
```

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
| [`toThreeMf`](../../docs/api/depth-mesh/README.md#tothreemf) | multi colour 3MF, Orca and Bambu dialect, an extruder per part |
| [`reliefParts`](../../docs/api/depth-mesh/README.md#reliefparts) | a relief cut into stacked height bands or mask bodies |
| [`modelDepth`](../../docs/api/depth-mesh/README.md#modeldepth) | depth map of a posed mesh, the photo path's shape |
| [`glbMesh`](../../docs/api/depth-mesh/README.md#glbmesh) | the triangles of a GLB with node transforms applied |
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

The core is single threaded and runs from file://. There is no scalar fallback build; a browser without wasm SIMD128 should fail to instantiate it, which is inferred and not tried. Speed in a browser is unknown; no timing was taken. It also runs in Node 22, where the tests run it.

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

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package bundles no weights; Depth Anything V2 small, loaded through @hackbuild/vision, is Apache-2.0.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `cargo test -p hackbuild-depth-mesh` under rustc 1.95: a closed sphere from surface nets, ICP recovering a known small motion on a bumpy surface and returning a perturbed sphere cloud to identity, carving a box from 12 silhouettes to within a voxel or two of its height, relief heights and a closed 2 by 2 solid; `cargo clippy -D warnings` natively and for wasm32; `cargo fmt --check` | passes 8 tests (6 unit, 2 integration); clippy and fmt pass |
| 2026-11-22 | `npx vitest run packages/depth-mesh` under Node 22.18.0, including native and wasm parity: the wasm build (simd128 on) against the native build for the depth fixture, cloud, relief heights and mesh, surface nets, voxel model size, the ICP pose, inliers and error, carving masks and mesh, and Rodrigues | passes 4 tests; same bits from both builds; the carved hull and the relief solid have no open edges; volumes are positive and near the box's |
| 2026-11-24 | `npx vitest run packages/depth-mesh`: the three named sources; brightness from a ramp; the inflate dome highest in the middle of a disc, and inverted; depth through a call, resampled, kept on the result, inverted; the fallback to brightness with its note; background cut, relief mask, erase and restore; keep largest; closed solids and an STL of the right length | passes 12 tests; 0 open edges (computed) |

| 2026-11-25 | `test/threemf.test.ts`: the 3MF entries read back from the store only zip, an extruder per part and per object, one colour, type and preset per slot, the printer model and variant, equal bytes for equal input, refusals for a bad colour, a missing slot and an empty part; height bands stacking at the break with no open edges, mask labels and resampled masks; a hand built GLB with a node translation, compression refused, pose axes, and the nearest surface rasterised into the depth map | passes 7 tests |

### Not verified by anything

- The 3MF: not opened in OrcaSlicer, Bambu Studio or Flash Studio from
  this package. The dialect is the hackbuild-3mf writer's, which was
  checked there; the store only zip and the default bed position
  (128, 128) are untested in a slicer.
- `modelDepth` on a real GLB, and its speed at 256 px and up.

- `photoRelief` on a real photo with a real Depth Anything map, and its
  speed; the inflate blur (a gaussian of half the smoothing radius
  before the threshold) is not checked against a canvas blur.
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

# @hackbuild/depth-mesh

Depth maps and silhouettes to printable geometry: a Rust core built for
wasm32 with SIMD128 (`crates/depth-mesh`) and TS exporters. From an earlier scan bench
(point clouds, point to plane ICP, silhouette carving, surface nets) and
an earlier relief bench (relief heightfields and their closed solids). Code MIT; this README
CC-BY-4.0 with the code samples also MIT. No model and no weights here;
depth maps come from `@hackbuild/vision` (Depth Anything V2 small,
Apache-2.0) or any other source.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/depth-mesh

## Use

    import { loadDepthMesh, fitToPrint, toStl } from "@hackbuild/depth-mesh";
    import { DEPTH_MESH_WASM_BASE64 } from "@hackbuild/depth-mesh/inline";

    const dm = await loadDepthMesh({ base64: DEPTH_MESH_WASM_BASE64 });

    // relief: depth (0 to 1, larger nearer) to heights in mm, then a closed solid
    const h = dm.relief(map.data, { base: 0.4, height: 2.4, gamma: 1.2, bgcut: 0.1 });
    dm.healPinches(h, map.width, map.height);
    const relief = dm.heightfieldMesh(h, map.width, map.height, 0.25);

    // scan by depth: cloud per frame, ICP against a voxel model, fold in good frames
    const model = dm.model(0.01);
    const cloud = dm.cloud(map.data, map.width, map.height, { near: 0.3, far: 1.2, focal: 500, stride: 2 });
    const r = model.icp(cloud, pose);
    if (trackGood(r, pose, cloud.count)) model.integrate(cloud, (pose = r.pose));

    // scan by silhouettes on a turntable (as earlier builds did)
    const hull = dm.carve(masks, angles, { width, height, focal, dist, half }, 64, 1);
    const stl = toStl(fitToPrint(hull, 40));

- `cloud`: Z = near + (1 - d)(far - near), camera down -Z; normals from the
  grid neighbours facing the camera; depth edge fliers dropped.
- `relief`: normalized over the region (or a mask), background cut,
  gamma, floor 0.12 mm (as earlier builds did); `heightfieldMesh` splits each top quad on
  its shorter diagonal and closes the walls and the bottom.
- `model(voxel).icp`: two stages (2 maxDist then maxDist), 27 voxel
  nearest neighbour, normal agreement, 6 by 6 solve, Rodrigues update;
  `trackGood` is the earlier scan bench's accept test.
- `carve`: a voxel stays when it projects inside every mask; blur, then
  surface nets; `morphOpen` cleans masks first.
- Export: `toStl` (binary), `toObj`, `toPly` and `cloudToPly` (binary),
  `fitToPrint`, `bounds`, `openEdges`, `volume`.

## Photo to relief in one call

`photoRelief(dm, rgba, options)` takes a photo's RGBA pixels and a
height source and returns the closed relief solid, the heights, the
cell size and status notes (as the earlier relief bench did). The
sources are named in `HEIGHT_SOURCES`, in the bench's height from order:
`depth` (Depth Anything, needs a model or a stored map), `brightness`
and `inflate` (a silhouette domed by its distance to the outline); both
of the last two need no model. Options are the bench's: `width` (mm),
`base` and `height` (the relief range, mm), `gamma`, `bgcut` (depth and
brightness), `smooth` (mm), `invert`, `threshold` (inflate), plus a
relief `mask` (a segmentation mask works), the `erase` and `restore`
brush masks (restore wins), `keepLargest` and `cells` (grid columns,
default the photo width up to 256). Masks of any size are resampled.

    import { depth, fitSize } from "@hackbuild/vision";
    import { photoRelief, toStl } from "@hackbuild/depth-mesh";

    const r = await photoRelief(dm, ctx.getImageData(0, 0, w, h), {
      source: "depth",
      depth: saved ?? (() => depth(hub, canvas)),       // a stored map skips the model
      width: 30, base: 0.24, height: 2.4, bgcut: 0.25, smooth: 0.3,
      erase, restore,
    });
    store(r.depth);                                      // keep the map with the design
    download("relief.stl", toStl(r.mesh));               // mm, centred, image up is +y

When depth fails or no map is given, the call uses brightness and
`r.notes` says why; `r.source` is the source used. `brightnessHeight`,
`inflateHeight` and `depthHeight` are the sources on their own.

Rebuild the wasm and the inlined base64 with `npm run build:wasm -w
@hackbuild/depth-mesh`.

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
| `dist/index.js` (main entry, imports external) | 8,151 bytes | 8,558 bytes |
| `wasm/depth-mesh.wasm` | 23,546 bytes | 24,723 bytes |
| `dist/single/index.iife.js` (single file build) | 8,031 bytes | 8,432 bytes |

Measured 2026-11-24 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

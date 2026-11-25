// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/depth-mesh"],
  what: `depth maps and silhouettes to printable geometry: a rust core built for wasm32 with simd128 (\`crates/depth-mesh\`) and ts exporters. from an earlier scan bench (point clouds, point to plane icp, silhouette carving, surface nets) and an earlier relief bench (relief heightfields and their closed solids). no model and no weights here; depth maps come from \`@hackbuild/vision\` (depth anything v2 small, apache-2.0) or any other source.`,
  how: [
    `\`cloud\`: z = near + (1 - d)(far - near), camera down -z; normals from the grid neighbours facing the camera; depth edge fliers dropped.`,
    `\`relief\`: normalized over the region (or a mask), background cut, gamma, floor 0.12 mm (as earlier builds did); \`heightfieldMesh\` splits each top quad on its shorter diagonal and closes the walls and the bottom.`,
    `\`model(voxel).icp\`: two stages (2 maxdist then maxdist), 27 voxel nearest neighbour, normal agreement, 6 by 6 solve, rodrigues update; \`trackGood\` is the earlier scan bench's accept test.`,
  ],
  install: "npm install @hackbuild/depth-mesh",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/depth-mesh`,
  code: `import { loadDepthMesh, fitToPrint, toStl } from "@hackbuild/depth-mesh";
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
const stl = toStl(fitToPrint(hull, 40));`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/depth-mesh/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/depth-mesh" },
};
export default how;

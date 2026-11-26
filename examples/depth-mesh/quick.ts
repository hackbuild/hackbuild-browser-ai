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

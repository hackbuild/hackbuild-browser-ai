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

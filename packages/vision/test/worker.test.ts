import { describe, expect, it } from "vitest";
import { depthWorker } from "@hackbuild/vision";

// A fake transformers.js module as a data: URL: the depth is the red channel.
const fake = `
export class RawImage { constructor(data, width, height, channels) { this.data = data; this.width = width; this.height = height; this.channels = channels; } }
export async function pipeline(task, model, opts) {
  if (task !== "depth-estimation") throw new Error("wrong task " + task);
  globalThis.__depthOpts = { model, ...opts };
  return async (img) => {
    const data = new Float32Array(img.width * img.height);
    for (let i = 0; i < data.length; i++) data[i] = img.data[i * 4];
    return { predicted_depth: { data, dims: [1, img.height, img.width] } };
  };
}`;
const url = `data:text/javascript,${encodeURIComponent(fake)}`;
// the inline rung runs the source inside an imported function; hand it this module's import for data: urls
(globalThis as { __testImport?: unknown }).__testImport = (u: string) => import(u);
const prelude = "self.__import = (u) => globalThis.__testImport(u);";

describe("depth worker", () => {
  it("loads the pipeline and returns a normalized depth map", async () => {
    const lines: string[] = [];
    const w = await depthWorker({ urls: ["data:text/javascript,throw new Error('first url fails')", url], spawn: { prefer: ["inline"], prelude }, device: "wasm", onLicence: (l) => lines.push(l) });
    expect(w.rung).toBe("inline");
    const opts = (globalThis as { __depthOpts?: { revision?: string } }).__depthOpts;
    expect(opts).toMatchObject({ model: "onnx-community/depth-anything-v2-small", device: "wasm", dtype: "q8" });
    expect(opts!.revision).toMatch(/^[0-9a-f]{40}$/);
    expect(lines[0]).toMatch(/Apache-2.0/);
    const data = new Uint8ClampedArray(2 * 2 * 4);
    [0, 100, 200, 50].forEach((v, i) => (data[i * 4] = v));
    const d = await w.estimate({ width: 2, height: 2, data });
    expect(d.width).toBe(2);
    expect(Array.from(d.data)).toEqual([0, 0.5, 1, 0.25]);
    expect(d.range).toEqual([0, 200]);
    w.dispose();
  });

  it("refuses a model that is not a registered depth record", async () => {
    await expect(depthWorker({ urls: [url], modelId: "depth-anything/Depth-Anything-V2-Large-hf", spawn: { prefer: ["inline"], prelude } })).rejects.toThrow(/not a registered depth record/);
  });

  it("rejects when no runtime url loads", async () => {
    await expect(depthWorker({ urls: ["data:text/javascript,throw new Error('nope')"], spawn: { prefer: ["inline"], prelude } })).rejects.toThrow(/nope/);
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HEIGHT_SOURCES, brightnessHeight, fitToPrint, inflateHeight, loadDepthMesh, openEdges, photoRelief, toStl, type RgbaImage } from "@hackbuild/depth-mesh";

const root = join(import.meta.dirname, "..", "..", "..");
const dm = await loadDepthMesh({ bytes: new Uint8Array(readFileSync(join(root, "packages/depth-mesh/wasm/depth-mesh.wasm"))) });

/** A white 40 x 30 photo with a dark disc of radius 10 in the middle, or a left to right grey ramp. */
function photo(kind: "disc" | "ramp", w = 40, h = 30): RgbaImage {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const v = kind === "disc" ? ((x + 0.5 - w / 2) ** 2 + (y + 0.5 - h / 2) ** 2 <= 100 ? 0 : 255) : Math.round((x / (w - 1)) * 255);
      data.set([v, v, v, 255], (y * w + x) * 4);
    }
  return { width: w, height: h, data };
}

const rect = (w: number, h: number, x0: number, x1: number) => ({ width: w, height: h, data: Uint8Array.from({ length: w * h }, (_, i) => (i % w >= x0 && i % w < x1 ? 255 : 0)) });

describe("height sources", () => {
  it("lists the bench's three sources with their params", () => {
    expect(HEIGHT_SOURCES.map((s) => [s.name, s.label, s.needsModel])).toEqual([
      ["depth", "Depth Anything", true],
      ["brightness", "brightness", false],
      ["inflate", "inflate silhouette", false],
    ]);
    expect(HEIGHT_SOURCES.find((s) => s.name === "inflate")!.params).not.toContain("bgcut");
  });

  it("reads brightness and domes a silhouette highest at its middle", () => {
    const b = brightnessHeight(photo("ramp"), 40, 30);
    expect(b.values[0]).toBeCloseTo(0, 2);
    expect(b.values[39]).toBeCloseTo(1, 2);
    const f = inflateHeight(photo("disc"), 40, 30);
    expect(f.cover[0]).toBe(0);
    expect(f.values[15 * 40 + 20]).toBeGreaterThan(0.95);
    expect(f.values[15 * 40 + 11]).toBeLessThan(0.7);
    const inv = inflateHeight(photo("disc"), 40, 30, { invert: true });
    expect([inv.cover[0], inv.cover[15 * 40 + 20]]).toEqual([1, 0]);
  });
});

describe("photo to relief", () => {
  it("builds a closed solid from depth and keeps the depth map", async () => {
    const calls: number[] = [];
    const ramp = { width: 20, height: 15, data: Float32Array.from({ length: 300 }, (_, i) => (i % 20) / 19) };
    const r = await photoRelief(dm, photo("ramp"), { source: "depth", depth: async (img) => (calls.push(img.width), ramp), width: 40, base: 0.5, height: 3, bgcut: 0, smooth: 0 });
    expect(calls).toEqual([40]);
    expect([r.source, r.cols, r.rows, r.px]).toEqual(["depth", 40, 30, 1]);
    expect(r.depth).toBe(ramp);
    expect(r.heights[15 * 40 + 39]).toBeCloseTo(3, 3);
    expect(r.heights[15 * 40 + 1]).toBeLessThan(0.7);
    expect(openEdges(r.mesh)).toBe(0);
    const bytes = toStl(fitToPrint(r.mesh, 40));
    expect(bytes.byteLength).toBe(84 + 50 * (r.mesh.indices.length / 3));
    const inv = await photoRelief(dm, photo("ramp"), { source: "depth", depth: ramp, width: 40, base: 0.5, height: 3, bgcut: 0, smooth: 0, invert: true });
    expect(inv.heights[15 * 40 + 1]).toBeCloseTo(3, 1);
  });

  it("falls back to brightness when depth fails, and says so", async () => {
    const r = await photoRelief(dm, photo("ramp"), { source: "depth", depth: async () => Promise.reject(new Error("the model did not load")), smooth: 0, bgcut: 0 });
    expect(r.source).toBe("brightness");
    expect(r.notes[0]![0]).toBe("warn");
    expect(r.notes[0]![1]).toMatch(/depth failed: the model did not load/);
    expect(r.heights[15 * 40 + 39]).toBeCloseTo(2.4, 2);
  });

  it("applies the background cut, the mask, erase and restore", async () => {
    const o = { source: "brightness" as const, smooth: 0, bgcut: 0.5 };
    const cut = await photoRelief(dm, photo("ramp"), o);
    expect(cut.heights[15 * 40 + 10]).toBe(0);
    expect(cut.heights[15 * 40 + 30]).toBeGreaterThan(0);
    const masked = await photoRelief(dm, photo("ramp"), { ...o, bgcut: 0, mask: rect(4, 3, 0, 2) });
    expect(masked.heights[15 * 40 + 30]).toBe(0);
    expect(masked.heights[15 * 40 + 10]).toBeGreaterThan(0);
    const erased = await photoRelief(dm, photo("ramp"), { ...o, bgcut: 0, erase: rect(40, 30, 20, 40), restore: rect(40, 30, 30, 40) });
    expect(erased.heights[15 * 40 + 25]).toBe(0);
    expect(erased.heights[15 * 40 + 35]).toBeGreaterThan(0);
    expect(openEdges(erased.mesh)).toBe(0);
  });

  it("inflates a silhouette with smoothing, keeps the largest piece, and says when nothing is left", async () => {
    const r = await photoRelief(dm, photo("disc"), { source: "inflate", width: 20, base: 0.4, height: 2, smooth: 0.5 });
    expect(r.px).toBe(0.5);
    expect(r.heights[0]).toBe(0);
    expect(r.heights[15 * 40 + 20]).toBeGreaterThan(1.8);
    expect(openEdges(r.mesh)).toBe(0);
    const two = await photoRelief(dm, photo("ramp"), { source: "brightness", smooth: 0, bgcut: 0, erase: rect(40, 30, 10, 12), keepLargest: true });
    expect(two.heights[15 * 40 + 5]).toBe(0);
    expect(two.heights[15 * 40 + 30]).toBeGreaterThan(0);
    const none = await photoRelief(dm, photo("ramp"), { source: "brightness", erase: rect(1, 1, 0, 1) });
    expect(none.notes.at(-1)![1]).toMatch(/no relief/);
  });
});

import { describe, expect, it } from "vitest";
import { surfaceIndices } from "../src/index.js";

describe("surface indices", () => {
  it("keeps a smooth sheet whole and tears at a jump", () => {
    const cols = 4, rows = 3;
    const flat = new Float32Array(cols * rows).fill(0.5);
    expect(surfaceIndices(flat, cols, rows).length).toBe((cols - 1) * (rows - 1) * 2 * 3);
    // a near column on the right: the cells that span the jump drop out
    const step = Float32Array.from({ length: cols * rows }, (_, k) => (k % cols === cols - 1 ? 0.9 : 0.2));
    const idx = surfaceIndices(step, cols, rows, 0.1);
    expect(idx.length).toBe((cols - 2) * (rows - 1) * 2 * 3);
    for (const v of idx) expect(v % cols).not.toBe(cols - 1);
  });
});

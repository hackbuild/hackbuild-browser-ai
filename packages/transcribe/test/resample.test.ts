import { describe, expect, it } from "vitest";
import { toSixteenK } from "../src/index.js";

/** Ten seconds of a 440 Hz tone at `rate`, fed in 1024 sample blocks. */
function run(rate: number): Float32Array {
  const st = toSixteenK(rate);
  const n = rate * 10;
  const parts: Float32Array[] = [];
  for (let off = 0; off < n; off += 1024) {
    const b = new Float32Array(Math.min(1024, n - off));
    for (let i = 0; i < b.length; i++) b[i] = 0.5 * Math.sin((2 * Math.PI * 440 * (off + i)) / rate);
    parts.push(st ? st.process(b) : b);
  }
  const len = parts.reduce((a, p) => a + p.length, 0);
  const out = new Float32Array(len);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function zeroCrossHz(x: Float32Array, rate: number): number {
  let z = 0;
  for (let i = 1001; i < x.length - 1000; i++) if (x[i - 1]! < 0 && x[i]! >= 0) z++;
  return z / ((x.length - 2001) / rate);
}

describe("16 kHz front stage", () => {
  for (const rate of [48000, 44100, 32000, 24000, 22050, 16000, 8000]) {
    it(`brings ${rate} Hz to 16 kHz at the right speed`, () => {
      const y = run(rate);
      // 10 s gives 160000 samples, less the kernel's look ahead of 16 input taps
      expect(Math.abs(y.length - 160000)).toBeLessThanOrEqual(Math.ceil((16 * 16000) / rate) + 1);
      expect(Math.abs(zeroCrossHz(y, 16000) - 440)).toBeLessThan(1);
    });
  }
});

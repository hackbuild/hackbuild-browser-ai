// The wasm half of the native and wasm parity check: crates/audio-dsp/tests/parity.rs
// runs a seeded signal through every kernel and writes hashes and scalars to
// parity.json; the wasm build must give the same bits.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

const root = join(import.meta.dirname, "..", "..", "..");
const fx = JSON.parse(readFileSync(join(root, "crates/audio-dsp/tests/parity.json"), "utf8")) as Record<string, unknown> & {
  onsets: [number, number, number][];
  scalars: { floor: number; p95: number; stftFrames: number; bpm: number; offset: number; grid: [number, number, number] };
  math: number[][];
};

function fnv(x: Float32Array): string {
  const b = new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  let h = 0xcbf29ce484222325n;
  for (const v of b) {
    h ^= BigInt(v);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

describe("native and wasm parity", async () => {
  const dsp = await loadDsp({ bytes: new Uint8Array(readFileSync(join(root, "packages/audio-dsp/wasm/audio-dsp.wasm"))) });
  const inline = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
  const want = (name: string) => fx[name] as { len: number; hash: string };
  const check = (name: string, x: Float32Array) => {
    expect(x.length, name).toBe(want(name).len);
    expect(fnv(x), name).toBe(want(name).hash);
  };

  test("the build runs simd128 and the inlined copy is the same build", () => {
    expect(dsp.simd).toBe(true);
    expect(inline.synth(7, 100, 16000)).toEqual(dsp.synth(7, 100, 16000));
  });

  test("every kernel gives the native bits", () => {
    const sr = 16000;
    const raw = dsp.synth(20261122, 48000, sr);
    check("synth", raw);
    let sig = dsp.dcBlock(raw);
    check("dc", sig);
    sig = dsp.biquad(dsp.biquad(sig, "highpass", 80, sr), "highpass", 80, sr);
    check("hp2", sig);
    const band = dsp.biquad(dsp.biquad(sig, "highpass", 250, sr), "lowpass", 3800, sr);
    check("band", band);
    const vdb = dsp.frameDb(band);
    check("vdb", vdb);
    const floor = dsp.noiseFloor(vdb);
    expect(floor).toBe(fx.scalars.floor);
    expect(dsp.percentile(vdb, 0.95)).toBe(fx.scalars.p95);
    const noise = dsp.noiseSpectrum(sig, vdb, floor)!;
    check("noise", noise);
    const dn = dsp.denoise(sig, noise, 1.8, 0.08);
    check("denoise", dn);
    for (let i = 0; i < dn.length; i++) dn[i]! *= 8;
    check("limit", dsp.limit(dn));
    check("sinc", dsp.resample(raw, sr, 22050));
    check("linear", dsp.resample(raw, sr, 22050, "linear"));
    check("decimate", dsp.decimate(raw, 3, 41, 2400, sr));
    const st = dsp.stftMag(raw.subarray(0, 8192), 1024, 512);
    expect(st.frames).toBe(fx.scalars.stftFrames);
    check("stft", st.mag);
    const env = dsp.envelopeRms(raw, 128);
    check("rms", env);
    check("peak", dsp.envelopePeak(raw, 200));
    const fps = sr / 128;
    const hits = dsp.pickOnsets(env, fps);
    expect(hits.map((h) => [h.frame, h.peak, h.strength])).toEqual(fx.onsets);
    expect(dsp.estimateTempo(env, fps)).toEqual({ bpm: fx.scalars.bpm, offset: fx.scalars.offset });
    const g = dsp.fitGrid(
      hits.map((h) => h.frame / fps),
      hits.map((h) => h.strength),
    )!;
    expect([g.bpm, g.offset, g.r]).toEqual(fx.scalars.grid);
  });

  test("the deterministic math gives the native bits", () => {
    const m = dsp.math();
    for (const [x, s, c, e, l, a] of fx.math) {
      expect([m.sin(x!), m.cos(x!), m.exp(x! / 100), m.ln(Math.abs(x!) + 1), m.atan2(x!, 3)]).toEqual([s, c, e, l, a]);
    }
  });
});

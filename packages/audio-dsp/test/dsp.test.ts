import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import {
  OverlapAdd,
  coverage,
  decodeWav,
  encodeWav,
  gate,
  gateThreshold,
  loadDsp,
  parseLrc,
  planSegments,
  spreadWords,
  timestamp,
  toJson,
  toLrc,
  toSrt,
  toTxt,
  toVtt,
  writeMidi,
  zipStore,
  crc32,
} from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";

const root = join(import.meta.dirname, "..", "..", "..");

describe("kernels", async () => {
  const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
  const sine = (f: number, sr: number, n: number, a = 0.5) => Float32Array.from({ length: n }, (_, i) => a * Math.sin((2 * Math.PI * f * i) / sr));

  it("names bad parameters instead of trapping", () => {
    const x = new Float32Array(4096);
    expect(() => dsp.stftMag(x, 1000)).toThrow(/power of two/);
    expect(() => dsp.frameDb(x, 0)).toThrow(RangeError);
  });

  it("plans no segment that only reruns audio already covered", () => {
    expect(planSegments(100, 60, 0.5).segments).toEqual([
      { start: 0, len: 60 },
      { start: 30, len: 60 },
      { start: 60, len: 40 },
    ]);
  });

  it("high pass removes dc, low pass keeps it", () => {
    const dc = new Float32Array(8000).fill(0.5);
    expect(Math.abs(dsp.biquad(dc, "highpass", 80, 16000)[7999]!)).toBeLessThan(1e-3);
    expect(dsp.biquad(dc, "lowpass", 3800, 16000)[7999]).toBeCloseTo(0.5, 4);
    expect(dsp.biquadCoef("highpass", 80, 16000)).toHaveLength(5);
  });

  it("frame levels read -9 dBFS for a 0.5 sine and the floor finds the quiet part", () => {
    const x = new Float32Array(64000);
    x.set(sine(440, 16000, 16000), 48000);
    for (let i = 0; i < 48000; i++) x[i] = 0.001 * (((i * 7919) % 200) / 100 - 1);
    const db = dsp.frameDb(x);
    expect(db[350]).toBeCloseTo(-9.03, 1);
    expect(dsp.noiseFloor(db)).toBeLessThan(-60);
  });

  it("the limiter holds the ceiling and resampling keeps a tone", () => {
    const y = dsp.limit(sine(300, 16000, 8000, 3));
    expect(Math.max(...y.map(Math.abs))).toBeLessThanOrEqual(0.891 + 1e-6);
    const up = dsp.resample(sine(440, 48000, 4800), 48000, 16000);
    expect(up.length).toBe(1600);
    expect(up[800]).toBeCloseTo(0.5 * Math.sin((2 * Math.PI * 440 * 800) / 16000), 2);
    expect(dsp.decimate(sine(440, 48000, 4800), 3).length).toBe(1600);
  });

  it("denoise lowers steady noise under a tone", () => {
    const n = 64000;
    const x = new Float32Array(n);
    let s = 1;
    for (let i = 0; i < n; i++) {
      s = (s * 16807) % 2147483647;
      x[i] = 0.02 * (s / 2147483647 - 0.5) + (i > 48000 ? 0.3 * Math.sin(i * 0.1) : 0);
    }
    const db = dsp.frameDb(x);
    const noise = dsp.noiseSpectrum(x, db, dsp.noiseFloor(db))!;
    const y = dsp.denoise(x, noise, 2.6, 0.04);
    const rms = (a: Float32Array, i: number, j: number) => Math.sqrt(a.subarray(i, j).reduce((p, v) => p + v * v, 0) / (j - i));
    expect(rms(y, 2000, 14000)).toBeLessThan(rms(x, 2000, 14000) * 0.5);
    expect(rms(y, 50000, 62000)).toBeGreaterThan(rms(x, 50000, 62000) * 0.8);
  });

  it("onsets and tempo find a 120 bpm click track", () => {
    const sr = 11025;
    const x = new Float32Array(sr * 10);
    for (let b = 0; b < 20; b++) for (let k = 0; k < 200; k++) x[Math.round((0.25 + b * 0.5) * sr) + k] = Math.exp(-k / 40) * (k % 2 ? 1 : -1);
    const env = dsp.envelopeRms(x, 128);
    const fps = sr / 128;
    expect(dsp.pickOnsets(env, fps).length).toBe(20);
    expect(dsp.estimateTempo(env, fps).bpm).toBeCloseTo(120, 0);
    expect(dsp.fitGrid([0, 0.5, 1, 1.5, 2], [1, 1, 1, 1, 1])!.bpm).toBeCloseTo(120, 1);
    expect(dsp.fitGrid([], [])).toBeNull();
    expect(dsp.stftMag(x.subarray(0, 4096), 1024, 256).frames).toBe(13);
  });
});

describe("gate", () => {
  it("opens after 3 frames, closes after 25, pads, merges and drops short bursts", () => {
    const db = new Float32Array(400).fill(-70);
    db.fill(-20, 100, 200);
    db.fill(-20, 210, 220);
    db.fill(-20, 350, 352);
    const r = gate(db, -50, 400 * 160 + 240);
    expect(r).toEqual([[(100 - 25) * 160, (220 + 25) * 160 + 400]]);
    expect(gateThreshold(-80, -20)).toBe(-74);
    expect(gateThreshold(-30, -25)).toBe(-28);
    expect(coverage(r, 0, 0.5)).toBe(0);
    expect(coverage([[0, 16000]], 0, 2)).toBe(0.5);
  });
});

describe("overlap add", () => {
  it("reconstructs the input through an identity model at every overlap", () => {
    const total = 1000;
    const x = Float32Array.from({ length: total }, (_, i) => Math.sin(i / 7));
    for (const ov of [0, 0.1, 0.25, 0.4]) {
      const S = 128;
      const { segments, fade } = planSegments(total, S, ov);
      const acc = new OverlapAdd(total, 1, 1, fade);
      for (const s of segments) {
        const seg = new Float32Array(S);
        seg.set(x.subarray(s.start, s.start + s.len));
        acc.add(s, seg, S);
      }
      const [[y]] = acc.finish() as [[Float32Array]];
      for (let i = 0; i < total; i++) expect(y[i]).toBeCloseTo(x[i]!, 5);
    }
  });
});

describe("writers", () => {
  const segs = [
    { start: 0, end: 1.14, text: "one." },
    { start: 1.86, end: 2.9, text: "two" },
    { start: 6, end: 3661.9996, text: "three" },
  ];
  it("writes srt, vtt and txt in the earlier transcription tool layout", () => {
    expect(timestamp(3661.9996, true)).toBe("01:01:01,999");
    const odd = [{ start: 0, end: 1, text: "a --> b & <i>c</i>" }];
    expect(toSrt(odd)).toBe("1\n00:00:00,000 --> 00:00:01,000\na -> b & <i>c</i>\n");
    expect(toVtt(odd)).toBe("WEBVTT\n\n00:00:00.000 --> 00:00:01.000\na -> b &amp; &lt;i>c&lt;/i>\n");
    expect(toSrt(segs)).toBe("1\n00:00:00,000 --> 00:00:01,140\none.\n\n2\n00:00:01,860 --> 00:00:02,900\ntwo\n\n3\n00:00:06,000 --> 01:01:01,999\nthree\n");
    expect(toVtt(segs).startsWith("WEBVTT\n\n00:00:00.000 --> 00:00:01.140\none.\n")).toBe(true);
    expect(toTxt(segs)).toBe("one. two\n\nthree\n");
  });
  it("round trips lrc and spreads words by characters", () => {
    const l = toLrc(segs.slice(0, 2), "t");
    expect(l).toBe("[ti:t]\n[00:00.00]one.\n[00:01.86]two\n");
    expect(parseLrc(l).map((s) => [s.start, s.text])).toEqual([
      [0, "one."],
      [1.86, "two"],
    ]);
    const w = spreadWords("aa b", 0, 3);
    expect(w.map((x) => +x.end.toFixed(3))).toEqual([2, 3]);
  });
  it("round trips wav in pcm16 and float32", () => {
    const ch = [Float32Array.from([0, 0.5, -0.5, 1]), Float32Array.from([0.25, -1, 0, 0])];
    const a = decodeWav(encodeWav(ch, 22050));
    expect(a.sampleRate).toBe(22050);
    expect(a.channels[1]![1]).toBe(-1);
    expect(a.channels[0]![1]).toBeCloseTo(0.5, 4);
    expect(decodeWav(encodeWav(ch, 8000, "float32")).channels[0]).toEqual(ch[0]);
    expect(() => decodeWav(new Uint8Array(12))).toThrow(/RIFF/);
  });
  it("writes a format 1 midi file with drums on channel 10", () => {
    const m = writeMidi(
      [
        { name: "bass", notes: [{ t: 0, dur: 0.5, m: 40, v: 1 }], program: 33 },
        { name: "kit", drums: true, notes: [{ t: 0.5, dur: 0.1, m: 36, v: 0.5 }] },
      ],
      120,
    );
    expect(Array.from(m.subarray(0, 14))).toEqual([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, 3, 1, 0xe0]);
    const hex = Buffer.from(m).toString("hex");
    expect(hex).toContain("ff510307a120");
    expect(hex).toContain("c021");
    expect(hex).toContain("992440");
    expect(hex).toContain("90287f");
  });
  it("writes a store only zip with crc32", () => {
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    const z = zipStore([{ name: "a.txt", data: "hello" }], new Date(2026, 7, 25, 20, 33, 18));
    expect(z.length).toBe(30 + 5 + 5 + 46 + 5 + 22);
    expect(new DataView(z.buffer).getUint32(0, true)).toBe(0x04034b50);
    expect(new TextDecoder().decode(z.subarray(35, 40))).toBe("hello");
  });
});

// Parity with real exports from an earlier transcription tool. The files hold personal speech, so they
// live in the gitignored .local/transcripts folder (or TRANSCRIPT_FIXTURES) and the
// test is skipped on machines without them.
const dir = process.env.TRANSCRIPT_FIXTURES ?? join(root, ".local", "transcripts");
const have = existsSync(join(dir, "manifest.json"));
describe.skipIf(!have)("the earlier transcription tool export parity (local fixtures)", () => {
  const names = have ? readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "manifest.json") : [];
  test("every txt, srt, vtt and json file is reproduced byte for byte from its segments", () => {
    expect(names.length).toBeGreaterThan(0);
    for (const n of names) {
      const base = n.replace(/\.json$/, "");
      const raw = readFileSync(join(dir, n), "utf8");
      const j = JSON.parse(raw) as Parameters<typeof toJson>[0];
      expect(toSrt(j.segments), base).toBe(readFileSync(join(dir, base + ".srt"), "utf8"));
      expect(toVtt(j.segments), base).toBe(readFileSync(join(dir, base + ".vtt"), "utf8"));
      expect(toTxt(j.segments), base).toBe(readFileSync(join(dir, base + ".txt"), "utf8"));
      expect(toJson(j), base).toBe(raw);
    }
  });
});

import { describe, expect, it } from "vitest";
import { loadDsp, writeMidi } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { createHub, createRegistry, stubFactory } from "@hackbuild/models";
import {
  BASIC_PITCH,
  BP_BINS,
  BP_ROWS,
  BP_WINDOW,
  attachNotes,
  decodeNotes,
  drumNotes,
  estimateTempo,
  fitGridToNotes,
  isShaderFailure,
  keepMonophonic,
  notesStubs,
  refineNotes,
  runPitch,
  tfjsPitchProvider,
  type PitchModel,
  type Tfjs,
  bpFrameCount,
  bpFrameTime,
} from "@hackbuild/notes";

const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const row = (on: number[]) => {
  const r = new Float32Array(BP_BINS);
  for (const p of on) r[p] = 0.9;
  return r;
};

describe("basic pitch runner", () => {
  it("frames windows with the lead pad and keeps 142 rows per window", async () => {
    const seen: number[] = [];
    const m: PitchModel = {
      batch: 2,
      run: async (w, b) => {
        seen.push(b, w[3840]!, w[BP_WINDOW + 3840]!);
        return { frames: new Float32Array(b * BP_ROWS * BP_BINS), onsets: new Float32Array(b * BP_ROWS * BP_BINS) };
      },
    };
    const mono = Float32Array.from({ length: 22050 * 3 }, (_, i) => i);
    const out = await runPitch(m, mono);
    // 3 s: one full window of 142 kept frames plus 118 frames of the next (computed)
    expect(out.frames.length).toBe(260);
    expect(seen[0]).toBe(2);
    expect(seen[1]).toBe(0);
    expect(seen[2]).toBe(36164);
  });

  it("loads through the tfjs provider, falling from webgl to cpu", async () => {
    const backends: string[] = [];
    const flags: string[] = [];
    const tf: Tfjs = {
      setBackend: async (n) => {
        backends.push(n);
        if (n === "webgl") throw new Error("Failed to compile fragment shader");
        return true;
      },
      ready: async () => {},
      env: () => ({ set: (f) => void flags.push(f) }),
      tensor: () => ({ dispose: () => {} }),
      loadGraphModel: async () => ({
        execute: () => [
          { data: async () => new Float32Array(BP_ROWS * BP_BINS), dispose: () => {} },
          { data: async () => new Float32Array(BP_ROWS * BP_BINS), dispose: () => {} },
        ],
      }),
    };
    const hub = createHub({ registry: createRegistry() });
    attachNotes(hub);
    hub.provide("tfjs", tfjsPitchProvider({ runtime: async () => tf }));
    const l = await hub.use<PitchModel>("notes");
    expect(l.value.batch).toBe(1);
    expect(backends).toEqual(["webgl", "cpu"]);
    expect(flags).toEqual(["WEBGL_SIZE_UPLOAD_UNIFORM"]);
    expect(isShaderFailure(new Error("getT1 overloaded"))).toBe(true);
    expect(BASIC_PITCH.licence).toBe("Apache-2.0");
  });
});

describe("notes", () => {
  it("decodes held notes, bridges short gaps and splits on a new onset", () => {
    const frames: Float32Array[] = [];
    const onsets: Float32Array[] = [];
    for (let i = 0; i < 40; i++) {
      frames.push(row(i < 20 && i !== 10 ? [48] : i >= 25 && i < 35 ? [48, 60] : []));
      onsets.push(row(i === 0 || i === 25 ? [48] : i === 26 ? [60] : []));
    }
    const n = decodeNotes(frames, onsets);
    expect(n.map((x) => [x.m, Math.round(x.t * 86), Math.round(x.dur * 86)])).toEqual([
      [69, 0, 20],
      [69, 25, 10],
      [81, 26, 9],
    ]);
  });

  it("times frames by window, so a late onset lands where the audio has it", () => {
    // window starts sit at multiples of 36164 samples; inside a window frames step 256 samples
    expect(bpFrameTime(142)).toBeCloseTo(36164 / 22050, 9);
    expect(bpFrameTime(300)).toBeCloseTo((2 * 36164 + 16 * 256) / 22050, 9);
    const frames: Float32Array[] = [];
    const onsets: Float32Array[] = [];
    for (let i = 0; i < 400; i++) {
      frames.push(row(i >= 300 && i < 330 ? [48] : []));
      onsets.push(row(i === 300 ? [48] : []));
    }
    const [n] = decodeNotes(frames, onsets);
    // 3.4659 s (computed); i / 86 gave 3.4884 s, 22 ms late, growing 0.4 s per minute
    expect(n!.t).toBeCloseTo(3.4659, 3);
    expect(bpFrameCount(22050 * 60)).toBeGreaterThan(5194);
  });

  it("merges splits, drops harmonic ghosts and keeps one line", () => {
    const r = refineNotes(
      [
        { t: 0, dur: 0.5, m: 60, v: 0.9 },
        { t: 0.52, dur: 0.3, m: 60, v: 0.5 },
        { t: 0.01, dur: 0.5, m: 72, v: 0.4 },
        { t: 1, dur: 0.01, m: 64, v: 0.9 },
      ],
      { mergeGap: 0.05, minDur: 0.03 },
    );
    expect(r).toEqual([{ t: 0, dur: 0.8200000000000001, m: 60, v: 0.9 }]);
    expect(
      keepMonophonic([
        { t: 0, dur: 1, m: 60, v: 1 },
        { t: 0.5, dur: 1, m: 64, v: 1 },
      ]).map((n) => [n.m, n.dur]),
    ).toEqual([
      [60, 0.5],
      [64, 1],
    ]);
  });

  it("runs in stub mode end to end into a midi file", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory(notesStubs()));
    const l = await hub.use<PitchModel>("notes");
    const out = await runPitch(l.value, new Float32Array(22050 * 2));
    const n = decodeNotes(out.frames, out.onsets);
    expect(n[0]!.m).toBe(69);
    const mid = writeMidi([{ name: "lead", notes: n }], 120);
    expect(mid[9]).toBe(1);
  });
});

describe("drums and tempo", () => {
  function kit(bpm: number, secs: number, sr = 44100) {
    const x = new Float32Array(sr * secs);
    let s = 7;
    const noise = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
    for (let b = 0; b * 60 / bpm < secs - 0.3; b++) {
      const at = Math.round((0.2 + (b * 60) / bpm) * sr);
      for (let k = 0; k < sr * 0.15; k++) {
        const e = Math.exp(-k / (sr * 0.03));
        x[at + k]! += b % 2 === 0 ? 0.8 * e * Math.sin((2 * Math.PI * 55 * k) / sr) : 0.5 * e * noise();
      }
    }
    return x;
  }
  it("finds kicks on downbeats, snares on backbeats and the tempo", () => {
    const x = kit(120, 8);
    const notes = drumNotes(dsp, x, 44100);
    const kicks = notes.filter((n) => n.drum === "kick");
    const snares = notes.filter((n) => n.drum === "snare");
    expect(kicks.length).toBeGreaterThanOrEqual(7);
    expect(snares.length).toBeGreaterThanOrEqual(7);
    expect(Math.abs(kicks[0]!.t - 0.2)).toBeLessThan(0.03);
    expect(estimateTempo(dsp, x, 44100).bpm).toBeCloseTo(120, -0.5);
    const g = fitGridToNotes(dsp, kicks.concat(snares));
    expect(g!.bpm).toBeCloseTo(120, 0);
    expect(fitGridToNotes(dsp, [])).toBeNull();
  });
});

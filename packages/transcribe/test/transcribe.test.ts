import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { tjsProvider, type TjsModule } from "@hackbuild/devices";
import { createHub, createRegistry, stubFactory } from "@hackbuild/models";
import {
  LiveSegmenter,
  StreamDecimator,
  TRANSCRIBE_RECORDS,
  analyze,
  attachTranscribe,
  cleanup,
  lowpassTaps,
  mapTime,
  materialize,
  packReels,
  toMono,
  transcribe,
  transcribeStubs,
  webSpeech,
  type SpeechRecognitionLike,
} from "@hackbuild/transcribe";

const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const root = join(import.meta.dirname, "..", "..", "..");

describe("reels", () => {
  it("cuts a long region on its quietest late frame and maps times back", () => {
    const sr = 16000;
    const db = new Float32Array(6000).fill(-20);
    db[2450] = -60;
    const reels = packReels([[0, 40 * sr]], db, 26 * sr, Math.round(0.12 * sr));
    expect(reels.length).toBe(2);
    expect(reels[0]!.runs[0]!.s1).toBe(2450 * 160);
    const two = packReels(
      [
        [16000, 32000],
        [80000, 96000],
      ],
      db,
      26 * sr,
      1920,
    );
    expect(two.length).toBe(1);
    const m = materialize(two[0]!, new Float32Array(100000).fill(1), 1600);
    expect(m.audio.length).toBe(1600 * 2 + 16000 + 1920 + 16000);
    expect(mapTime(m.runs, 0)).toBe(1);
    expect(mapTime(m.runs, 0.5)).toBeCloseTo(1.4, 6);
    expect(mapTime(m.runs, (1600 + 16000 + 1000) / sr)).toBe(2);
    expect(mapTime(m.runs, (1600 + 16000 + 1920 + 8000) / sr)).toBeCloseTo(5.5, 6);
    expect(mapTime(m.runs, 99)).toBe(6);
  });
});

describe("phantom filter", () => {
  const vad: [number, number][] = [[0, 16000 * 10]];
  it("drops watermarks always, outros and weak words only over silence, loops and third repeats", () => {
    const segs = [
      { start: 0, end: 1, text: "Subtitles by the Amara.org community" },
      { start: 1, end: 2, text: "Thanks for watching." },
      { start: 20, end: 21, text: "Thanks for watching." },
      { start: 21, end: 22, text: "you" },
      { start: 3, end: 4, text: "you" },
      { start: 4, end: 9, text: "go go go go go go go go go" },
      { start: 9, end: 9.5, text: "again" },
      { start: 9.5, end: 10, text: "again" },
      { start: 10, end: 10.5, text: "Again." },
    ];
    const { kept, dropped } = cleanup(segs, vad);
    expect(dropped.map((d) => d.why)).toEqual(["watermark", "outro", "phantom", "loop", "repeat"]);
    expect(kept.map((k) => k.text)).toEqual(["Thanks for watching.", "you", "again", "again"]);
    expect(cleanup(segs, vad, false).dropped).toEqual([]);
  });
});

describe("front end", () => {
  it("gates the seeded speech bursts and lifts them toward -20 dBFS", () => {
    const pcm = dsp.synth(5, 16000 * 8, 16000);
    const a = analyze(dsp, pcm);
    // 0.5 s gaps merge under the 0.25 s pads and the 0.30 s merge gap, so the bursts read as one region
    expect(a.vad.length).toBe(1);
    expect(a.vad[0]![0] / 16000).toBeGreaterThan(0.15);
    expect(a.vad[0]![0] / 16000).toBeLessThan(0.4);
    expect(a.stats.density).toBeGreaterThan(0.5);
    expect(a.stats.density).toBeLessThan(1);
    expect(a.stats.snrDb).toBeGreaterThan(15);
    expect(a.stats.gainDb).toBeGreaterThan(0);
    expect(a.noise?.length).toBe(257);
    const quiet = analyze(dsp, new Float32Array(16000 * 3));
    expect(quiet.stats.forced).toBe(true);
  });

  it("picks one live mic or mixes close channels", () => {
    const a = Float32Array.from([1, -1, 1, -1]);
    const b = Float32Array.from([0.1, -0.1, 0.1, -0.1]);
    expect(toMono([a, b])).toEqual(a);
    expect(toMono([a, a.map((v) => v * 0.8)])[0]).toBeCloseTo(0.9, 6);
    expect(toMono([a, b], "R")).toEqual(b);
  });
});

describe("transcribe through the hub", () => {
  it("runs in stub mode with times inside the speech", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory(transcribeStubs()));
    const pcm = dsp.synth(9, 16000 * 8, 16000);
    const seen: number[] = [];
    let t = 0;
    const out = await transcribe(hub, dsp, pcm, { onProgress: (p) => seen.push(p.done), now: () => (t += 100) });
    expect(out.segments.length).toBe(1);
    expect(out.segments[0]!.text).toMatch(/^stub transcript, \d+\.\d s$/);
    expect(out.segments[0]!.start).toBeGreaterThan(0.15);
    expect(out.stats.reels).toBe(1);
    expect(seen).toEqual([1]);
  });

  it("loads a whisper record through the transformers.js provider and passes the language", async () => {
    const calls: Record<string, unknown>[] = [];
    const models: string[] = [];
    const mod: TjsModule = {
      env: {},
      pipeline: async (task, model, o) => {
        expect(task).toBe("automatic-speech-recognition");
        expect(o.dtype).toEqual({ encoder_model: "q8", decoder_model_merged: "q8" });
        models.push(model);
        return async (_a: Float32Array, opt: Record<string, unknown>) => {
          calls.push(opt);
          return { text: "hello there", chunks: [{ timestamp: [0.2, 1.1], text: " hello there" }] };
        };
      },
    };
    const hub = createHub({ registry: createRegistry(), env: { webgpu: false, f16: false, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https", opfs: false, cacheStorage: false, indexedDB: false, threads: 1, deviceMemoryGB: null, promptApi: false, notes: [] } });
    attachTranscribe(hub);
    hub.provide("tjs", tjsProvider({ runtime: async () => mod }).factory);
    const out = await transcribe(hub, dsp, dsp.synth(3, 16000 * 6, 16000), { model: "whisper-base", language: "fr" });
    expect(calls[0]).toMatchObject({ return_timestamps: true, task: "transcribe", language: "fr" });
    expect(out.segments[0]!.text).toBe("hello there");
    await transcribe(hub, dsp, dsp.synth(3, 16000 * 6, 16000), { model: "whisper-base.en", language: "fr" });
    expect(models).toEqual(["onnx-community/whisper-base", "Xenova/whisper-base.en"]);
    expect(calls[1]!.language).toBeUndefined();
    // transformers.js 4.3.2 throws "Cannot specify `task` or `language` for an English-only model" (measured in Chrome 150)
    expect(calls[1]!.task).toBeUndefined();
    expect(TRANSCRIBE_RECORDS.every((r) => r.licence.length > 0)).toBe(true);
  });
});

describe("live segmenter", () => {
  it("cuts on a closed gate after the tail, drops blips and caps the queue", () => {
    let t = 0;
    const got: number[] = [];
    const seg = new LiveSegmenter({ now: () => t, queue: 2, tailMs: 200, onSegment: (s) => got.push(+s.sec.toFixed(2)) });
    const block = new Float32Array(1600);
    const feed = (open: boolean, n: number) => {
      for (let i = 0; i < n; i++) {
        seg.push(block, open);
        t += 100;
      }
    };
    feed(true, 20);
    feed(false, 4);
    expect(got).toEqual([2.4]);
    feed(true, 2);
    feed(false, 4);
    expect(got.length).toBe(1);
    feed(true, 30);
    feed(false, 4);
    feed(true, 30);
    feed(false, 4);
    expect(got.length).toBe(2);
    expect(seg.dropped).toBe(1);
    seg.done();
    expect(seg.pending).toBe(1);
  });

  it("cuts fixed windows and decimates 48 kHz to 16 kHz across blocks", () => {
    const got: number[] = [];
    const seg = new LiveSegmenter({ mode: "fixed", windowS: 2, inputRate: 48000, onSegment: (s) => got.push(s.pcm.length) });
    for (let i = 0; i < 70; i++) seg.push(new Float32Array(4800));
    expect(got).toEqual([32000, 32000, 32000]);
    const d = new StreamDecimator(lowpassTaps(7000 / 48000, 41), 3);
    const tone = Float32Array.from({ length: 9600 }, (_, i) => Math.sin((2 * Math.PI * 440 * i) / 48000));
    const y = new Float32Array([...d.process(tone.subarray(0, 4000)), ...d.process(tone.subarray(4000))]);
    expect(y.length).toBe(3200);
    expect(y[1000]).toBeCloseTo(Math.sin((2 * Math.PI * 440 * (3000 - 20)) / 48000), 2);
  });
});

describe("web speech", () => {
  it("turns final results into timed segments and restarts on end", () => {
    let t = 0;
    let starts = 0;
    let inst: SpeechRecognitionLike | null = null;
    class Fake implements SpeechRecognitionLike {
      lang = "";
      continuous = false;
      interimResults = false;
      onresult: SpeechRecognitionLike["onresult"] = null;
      onerror: SpeechRecognitionLike["onerror"] = null;
      onend: SpeechRecognitionLike["onend"] = null;
      constructor() {
        inst = this;
      }
      start() {
        starts++;
      }
      stop() {}
    }
    const segs: { start: number; end: number; text: string }[] = [];
    const ws = webSpeech({ Recognition: Fake, now: () => t, onSegment: (s) => segs.push(s) });
    ws.start();
    t = 2000;
    const r = Object.assign([{ transcript: " hi there " }], { isFinal: true });
    inst!.onresult!({ resultIndex: 0, results: [r] });
    inst!.onend!();
    expect(segs).toEqual([{ start: 0, end: 2, text: "hi there", final: true }]);
    expect(starts).toBe(2);
  });
});

const dir = process.env.SCRIBE_FIXTURES ?? join(root, ".local", "scribe");
const have = existsSync(join(dir, "manifest.json"));
describe.skipIf(!have)("SCRIBE phantom filter parity (local fixtures)", () => {
  test("re-running the filter over kept plus dropped lines gives SCRIBE's split", () => {
    let checked = 0;
    for (const f of readdirSync(dir).filter((n) => n.endsWith(".json") && n !== "manifest.json")) {
      const j = JSON.parse(readFileSync(join(dir, f), "utf8")) as {
        duration: number;
        segments: { start: number; end: number; text: string }[];
        dropped: { start: number; text: string; why: string }[];
      };
      const all = [...j.segments, ...j.dropped.map((d) => ({ start: d.start, end: d.start + 2, text: d.text }))].sort((a, b) => a.start - b.start);
      const { kept, dropped } = cleanup(all, [[0, Math.ceil(j.duration * 16000) + 16000]]);
      expect(kept.length, f).toBe(j.segments.length);
      expect(
        dropped.map((d) => [d.start, d.why]),
        f,
      ).toEqual(j.dropped.map((d) => [d.start, d.why]));
      checked += j.dropped.length;
    }
    expect(checked).toBeGreaterThan(0);
  });
});

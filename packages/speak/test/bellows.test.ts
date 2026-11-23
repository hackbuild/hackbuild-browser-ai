import { describe, expect, it } from "vitest";
import { type BellowsRenderOptions, type BellowsVoiceModule, bellowsEngine, seedFrom, spansToPhonemes } from "../src/index.js";

// A seeded rng for the tests (mulberry32).
const mulberry = (a: number) => () => {
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function fakeModule(calls: BellowsRenderOptions[]): BellowsVoiceModule {
  return {
    renderSpeech(text, opts) {
      calls.push(opts);
      const sr = opts.sampleRate ?? 48000;
      return {
        samples: new Float32Array(Math.round(0.1 * text.length * sr)),
        sampleRate: sr,
        spans: [
          { ipa: "h", start: -0.05, end: 0 },
          { ipa: "ɛ", start: 0, end: 0.1 },
          { ipa: "_", start: 0.1, end: 0.15 },
          { ipa: "ɫ", start: 0.15, end: 0.2 },
        ],
      };
    },
  };
}

async function collect(it: AsyncIterable<unknown>) {
  const out = [];
  for await (const c of it) out.push(c);
  return out;
}

describe("bellows engine", () => {
  it("draws its seed once from the injected rng and counts segments", async () => {
    let draws = 0;
    const rng = mulberry(7);
    const counted = () => (draws++, rng());
    const calls: BellowsRenderOptions[] = [];
    const e = bellowsEngine({ runtime: async () => fakeModule(calls), rng: counted });
    expect(draws).toBe(1);
    const status: string[] = [];
    await e.load({ onStatus: (s) => status.push(s.kind) });
    expect(status[0]).toBe("licence");
    expect(e.licence).toMatch(/no weights/);
    const ac = new AbortController();
    await collect(e.synth("hello", {}, ac.signal));
    await collect(e.synth("hello", { voice: "soprano", rate: 1.2 }, ac.signal));
    expect(draws).toBe(1);
    const base = seedFrom(mulberry(7));
    expect(calls.map((c) => c.seed)).toEqual([`${base}:0`, `${base}:1`]);
    expect(calls[0]!.voice).toBe("narrator-female");
    expect(calls[1]!.voice).toBe("soprano");
    expect(calls[1]!.rate).toBe(1.2);
  });

  it("gives the same seeds for the same rng", () => {
    expect(seedFrom(mulberry(3))).toBe(seedFrom(mulberry(3)));
    expect(seedFrom(mulberry(3))).not.toBe(seedFrom(mulberry(4)));
  });

  it("yields the samples with phoneme times from the spans, pauses dropped", async () => {
    const e = bellowsEngine({ runtime: async () => fakeModule([]), rng: mulberry(1), sampleRate: 24000 });
    await e.load({});
    const [c] = (await collect(e.synth("hi", {}, new AbortController().signal))) as { samples: Float32Array; sampleRate: number; phonemes: { phoneme: string; t0: number; t1: number }[] }[];
    expect(c!.sampleRate).toBe(24000);
    expect(c!.phonemes.map((p) => p.phoneme)).toEqual(["h", "ɛ", "ɫ"]);
    expect(c!.phonemes[0]!.t0).toBe(0);
    expect(spansToPhonemes([{ ipa: "a", start: 0.2, end: 0.2 }], 3)).toEqual([]);
  });

  it("refuses a bellows-voice without renderSpeech", async () => {
    const e = bellowsEngine({ runtime: async () => ({}) as BellowsVoiceModule, rng: mulberry(1) });
    await expect(e.load({})).rejects.toThrow(/0\.8\.0/);
  });

  it("uses a caller render, for a worker, without loading the runtime", async () => {
    let loaded = false;
    const e = bellowsEngine({
      runtime: async () => ((loaded = true), fakeModule([])),
      rng: mulberry(1),
      render: async (text, opts) => fakeModule([]).renderSpeech(text, opts),
    });
    await e.load({});
    const out = await collect(e.synth("x", {}, new AbortController().signal));
    expect(loaded).toBe(false);
    expect(out.length).toBe(1);
  });
});

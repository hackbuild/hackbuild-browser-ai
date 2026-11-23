import { describe, expect, it } from "vitest";
import { type BellowsParts, type BellowsRenderOptions, type BellowsVoiceModule, bellowsEngine, renderSpeechFrom, seedFrom, spansToPhonemes } from "../src/index.js";

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
    await expect(e.load({})).rejects.toThrow(/renderSpeechFrom/);
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

describe("renderSpeechFrom, bellows-voice 0.7.3 glue", () => {
  it("lays phrases, posts the score once and returns mono samples with the spans", () => {
    const setups: unknown[][] = [];
    let registered = 0;
    const parts: BellowsParts = {
      bellows: {
        internParam: (n) => ["phoneme", "bend", "nextPhoneme", "nextIn"].indexOf(n) + 10,
        registerBuiltins: () => void registered++,
        registerEngine: () => void registered++,
        renderOffline: (setup, o) => {
          setups.push(setup);
          const n = Math.round(o.seconds * (o.sampleRate ?? 48000));
          return { left: new Float32Array(n).fill(0.2), right: new Float32Array(n).fill(0.4), sampleRate: o.sampleRate ?? 48000 };
        },
      },
      voice: {
        lyricsToSyllables: (t) => t.split(/\s+/).filter((w) => /\w/.test(w)).map((w) => ({ w })),
        speechPlan: (syl, _o, q) => ({ syllables: [...syl], notes: syl.map(() => ({ hz: 120, dur: 0.2 })).concat(q?.map(() => ({ hz: 0, dur: 0.1, rest: true })) ?? []) }),
        planSung: (notes) => ({ phrases: [{ start: notes[0]!.time, end: notes[notes.length - 1]!.time + 0.2, spans: notes.map((n) => ({ ipa: "a", start: n.time, end: n.time + n.dur })) }] }),
        sungEvents: () => ({ events: [{ e: 1 }], leadIn: 0 }),
        resolveAccent: () => ({}),
        spellOut: (t) => t,
        voicePreset: (id) => (id === "narrator-female" ? { params: { body: 1 }, speechHz: 200 } : undefined),
        VOCAL_PLAN_LEAD: 0.3,
        vocalGlideLead: () => 0.05,
      },
      engine: { vocalEngine: {} },
    };
    const m = renderSpeechFrom(parts);
    const r = m.renderSpeech("hello there. how are you?", { seed: "7", sampleRate: 1000, tail: 0 });
    m.renderSpeech("again", { seed: "8", sampleRate: 1000 });
    expect(registered).toBe(2);
    expect(r.samples[0]).toBeCloseTo(0.3, 6);
    expect(r.spans.length).toBe(5);
    const setup = setups[0] as { type: string; seed?: string; params?: unknown }[];
    expect(setup.map((x) => x.type)).toEqual(["internParam", "internParam", "internParam", "internParam", "createChannel", "events"]);
    expect(setup[4]).toMatchObject({ seed: "7::ch0", params: { body: 1 }, engineId: "vocal" });
    expect(() => m.renderSpeech("x", { seed: "1", voice: "nobody" })).toThrow(/no starter voice/);
  });
});

describe("bellows engine on the real bellows-voice 0.8.0", () => {
  const run = async (seed: number) => {
    const e = bellowsEngine({ runtime: async () => (await import("bellows-voice/engine")) as unknown as BellowsVoiceModule, rng: mulberry(seed), sampleRate: 24000 });
    await e.load({ signal: new AbortController().signal });
    const chunks = (await collect(e.synth("hello there.", {}, new AbortController().signal))) as { samples: Float32Array; phonemes?: unknown[] }[];
    const samples = chunks.flatMap((c) => [...c.samples]);
    return { samples, phonemes: chunks.flatMap((c) => c.phonemes ?? []) };
  };
  it("renders the same samples for the same seed and other samples for another", async () => {
    const a = await run(11);
    const b = await run(11);
    const c = await run(12);
    expect(a.samples.length).toBeGreaterThan(24000 * 0.3);
    expect(a.samples.some((v) => Math.abs(v) > 1e-3)).toBe(true);
    expect(a.phonemes.length).toBeGreaterThan(3);
    expect(b.samples).toEqual(a.samples);
    expect(c.samples).not.toEqual(a.samples);
  });
});

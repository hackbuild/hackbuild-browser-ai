import { describe, expect, test } from "vitest";
import { createHub, stubFactory } from "@hackbuild/models";
import { attachTranscribe } from "@hackbuild/transcribe";
import { CONVERSATION, VAD_RECORDS, VadMachine, captureWorkletSource, createListener, energyVad, hubTranscriber, sileroVad, type Utterance, type VadEvent, type VadSource } from "@hackbuild/listen";

const F = 512; // 32 ms
const frame = () => new Float32Array(F);

function run(m: VadMachine, probs: number[]): VadEvent[] {
  return probs.flatMap((p) => m.process(p, frame()));
}
const rep = (p: number, ms: number) => Array<number>(Math.ceil(ms / 32)).fill(p);

describe("vad machine", () => {
  test("an utterance starts, confirms after 250 ms and ends after 600 ms of quiet", () => {
    const ev = run(new VadMachine(), [...rep(0, 320), ...rep(0.7, 320), ...rep(0.1, 640)]);
    expect(ev.map((e) => e.type)).toEqual(["start", "confirmed", "end"]);
    const end = ev.at(-1) as Extract<VadEvent, { type: "end" }>;
    // 10 frames of pre pad (300 ms), 10 of speech, 19 of quiet (608 ms)
    expect(end.audio.length).toBe(39 * F);
    expect(end.speech).toEqual([[10 * F, 20 * F]]);
    expect((ev[1] as { talking: boolean }).talking).toBe(false);
  });
  test("a short burst is a misfire", () => {
    expect(run(new VadMachine(), [...rep(0.9, 128), ...rep(0, 640)]).map((e) => e.type)).toEqual(["start", "misfire"]);
  });
  test("while talking, 0.7 is not speech and 0.9 for 450 ms is a barge in", () => {
    const m = new VadMachine();
    m.setTalking(true);
    expect(run(m, rep(0.7, 1000))).toEqual([]);
    const ev = run(m, rep(0.9, 480));
    expect(ev.map((e) => e.type)).toEqual(["start", "confirmed"]);
    expect((ev[1] as { talking: boolean }).talking).toBe(true);
  });
  test("a long utterance is cut at maxSec", () => {
    const ev = run(new VadMachine({ maxSec: 1 }), rep(0.9, 1100));
    expect(ev.filter((e) => e.type === "end")).toHaveLength(1);
  });
});

test("energy source rises over the noise floor", () => {
  const v = energyVad();
  const quiet = new Float32Array(F).fill(0.001);
  for (let i = 0; i < 20; i++) v.prob(quiet);
  const loud = new Float32Array(F).map((_, i) => 0.3 * Math.sin(i / 3));
  expect(v.prob(quiet)).toBe(0);
  expect(v.prob(loud)).toBe(1);
});

function tone(sec: number, amp: number, rate = 48000): Float32Array {
  return new Float32Array(Math.round(sec * rate)).map((_, i) => amp * Math.sin((2 * Math.PI * 300 * i) / rate));
}

async function feed(l: ReturnType<typeof createListener>, parts: Float32Array[]) {
  for (const p of parts) for (let i = 0; i < p.length; i += 2048) l.push(p.subarray(i, i + 2048));
  await l.idle();
}

describe("listener", () => {
  test("48 kHz blocks become one transcribed utterance", async () => {
    const got: Utterance[] = [];
    const states: string[] = [];
    let heard = 0;
    const l = createListener({
      vad: energyVad(),
      transcribe: async (pcm) => ((heard = pcm.length), "put the mug on the shelf"),
      onUtterance: (u) => got.push(u),
      onState: (s) => states.push(s),
    });
    l.start();
    await feed(l, [tone(1, 0.0005), tone(0.8, 0.3), tone(1, 0.0005)]);
    expect(got).toHaveLength(1);
    expect(got[0]!.text).toBe("put the mug on the shelf");
    expect(got[0]!.bargeIn).toBe(false);
    expect(heard % F).toBe(0);
    expect(heard / 16000).toBeGreaterThan(0.8);
    expect(states).toEqual(["listening", "hearing", "transcribing", "listening"]);
  });

  test("speech while talking calls onBargeIn and the utterance says so", async () => {
    let barge = 0;
    const got: Utterance[] = [];
    // a source that reads the level directly, so the stricter bar is what decides
    const level: VadSource = { id: "level", prob: (f) => Math.min(1, Math.sqrt(f.reduce((s, v) => s + v * v, 0) / f.length) * 4) };
    const l = createListener({ vad: level, inputRate: 16000, transcribe: async () => "stop", onBargeIn: () => barge++, onUtterance: (u) => got.push(u) });
    l.start();
    l.setTalking(true);
    await feed(l, [tone(0.6, 0.25, 16000)]);
    expect(barge).toBe(0);
    await feed(l, [tone(0.6, 0.4, 16000), tone(1, 0, 16000)]);
    expect(barge).toBe(1);
    expect(got.at(-1)).toMatchObject({ text: "stop", bargeIn: true });
  });

  test("dropWhileTalking leaves out an utterance that began over the voice", async () => {
    const level: VadSource = { id: "level", prob: (f) => Math.min(1, Math.sqrt(f.reduce((s, v) => s + v * v, 0) / f.length) * 4) };
    for (const drop of [true, false]) {
      const got: Utterance[] = [];
      let asked = 0;
      const l = createListener({ vad: level, inputRate: 16000, dropWhileTalking: drop, transcribe: async () => (asked++, "stop"), onUtterance: (u) => got.push(u) });
      l.start();
      l.setTalking(true);
      await feed(l, [tone(0.6, 0.6, 16000), tone(1, 0, 16000)]);
      expect(got.length).toBe(drop ? 0 : 1);
      expect(asked).toBe(drop ? 0 : 1);
      // the same speech after the voice stops is kept
      l.setTalking(false);
      await feed(l, [tone(0.6, 0.6, 16000), tone(1, 0, 16000)]);
      expect(got.at(-1)?.text).toBe("stop");
    }
  });

  test("the conversation preset waits 900 ms of quiet", () => {
    const m = new VadMachine(CONVERSATION);
    const ev = run(m, [...rep(0.9, 400), ...rep(0.1, 700)]);
    expect(ev.some((e) => e.type === "end")).toBe(false);
    expect(run(m, rep(0.1, 250)).some((e) => e.type === "end")).toBe(true);
  });

  test("the phantom filter drops a subtitle watermark", async () => {
    const got: Utterance[] = [];
    const l = createListener({ vad: energyVad(), transcribe: async () => "Subtitles by the Amara.org community", onUtterance: (u) => got.push(u) });
    l.start();
    await feed(l, [tone(0.5, 0.0005), tone(0.6, 0.3), tone(1, 0.0005)]);
    expect(got[0]!.text).toBe("");
    expect(got[0]!.dropped).toMatch(/^watermark/);
  });

  test("hubTranscriber runs the transcribe capability through the hub", async () => {
    const hub = createHub({ stub: true });
    attachTranscribe(hub);
    hub.provide("stub", stubFactory({ transcribe: () => async (a: Float32Array) => ({ text: ` ${a.length} samples` }) }));
    const t = hubTranscriber(hub);
    expect(await t(new Float32Array(1600))).toBe(" 1600 samples");
  });
});

test("silero source carries 64 samples of context and the state", async () => {
  const seen: { input: number[]; state: number }[] = [];
  class T {
    constructor(
      public type: string,
      public data: Float32Array | BigInt64Array,
      public dims: number[],
    ) {}
  }
  const ort = {
    Tensor: T,
    InferenceSession: {
      create: async () => ({
        run: async (feeds: Record<string, T>) => {
          const x = feeds.input!;
          seen.push({ input: x.dims, state: (feeds.state!.data as Float32Array)[0]! });
          return { output: { data: [0.8] }, stateN: { data: new Float32Array(256).fill(seen.length) } };
        },
      }),
    },
  };
  const v = await sileroVad(ort, new Uint8Array(1));
  expect(await v.prob(new Float32Array(512).fill(1))).toBeCloseTo(0.8);
  await v.prob(new Float32Array(512));
  expect(seen).toEqual([
    { input: [1, 576], state: 0 },
    { input: [1, 576], state: 1 },
  ]);
  expect(VAD_RECORDS[0]!.licence).toBe("MIT");
});

test("capture worklet source registers its processor", () => {
  expect(captureWorkletSource(1024)).toContain("registerProcessor('hb-capture'");
});

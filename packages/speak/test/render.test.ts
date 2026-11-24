import { describe, expect, test } from "vitest";
import { decodeWav } from "@hackbuild/audio-dsp";
import { humanError } from "@hackbuild/devices";
import {
  OFFLINE_RENDER_REFUSAL,
  OfflineRenderError,
  canRender,
  createSpeaker,
  renderSpeech,
  renderedBuffer,
  renderedTiming,
  renderedWav,
  renderedWavBytes,
  stubEngine,
  webSpeechEngine,
  type AudioContextLike,
  type PcmEngine,
} from "@hackbuild/speak";

const native = () => webSpeechEngine({ synth: { speak() {}, cancel() {}, getVoices: () => [] }, Utterance: class { constructor(public text: string) {} } as never });

describe("offline render", () => {
  test("capability flag: pcm engines render, the system voice does not", () => {
    expect(canRender(stubEngine())).toBe(true);
    expect(canRender(native())).toBe(false);
    expect(native().offline).toBe(false);
  });

  test("stub render keeps word offsets in the input text and times on the buffer", async () => {
    const text = "Hello *there*. Second line here.";
    const r = await renderSpeech(stubEngine({ secPerChar: 0.01 }), text, { gap: 0.1 });
    expect(r.engine).toBe("stub");
    expect(r.sampleRate).toBe(24000);
    expect(r.duration).toBeCloseTo(r.samples.length / 24000);
    const ws = r.words.map((w) => text.slice(w.start, w.end));
    expect(ws).toEqual(["Hello", "there", "Second", "line", "here"]);
    expect(r.words.every((w) => !w.estimated)).toBe(true);
    // the second segment starts after the first and its gap
    const second = r.words[2]!;
    expect(second.t0).toBeGreaterThanOrEqual(r.words[1]!.t1 + 0.1 - 1e-6);
    for (let i = 1; i < r.words.length; i++) expect(r.words[i]!.t0).toBeGreaterThanOrEqual(r.words[i - 1]!.t0);
  });

  test("an engine without word times gets estimated ones", async () => {
    const quiet: PcmEngine = {
      kind: "pcm",
      id: "quiet",
      licence: "none",
      async load() {},
      async *synth(t) {
        yield { samples: new Float32Array(t.length * 160), sampleRate: 16000, phonemes: [{ start: 0, end: 1, t0: 0, t1: 0.05, phoneme: "h" }] };
      },
    };
    const r = await renderSpeech(quiet, "ab cd");
    expect(r.words.map((w) => [w.start, w.end, w.estimated])).toEqual([[0, 2, true], [3, 5, true]]);
    expect(r.words[1]!.t1).toBeCloseTo(r.duration);
    expect(r.phonemes[0]).toMatchObject({ phoneme: "h", start: 0, estimated: false });
  });

  test("skips native and failing engines, refuses when only the system voice is left", async () => {
    const skipped: string[] = [];
    const r = await renderSpeech([native(), stubEngine({ id: "bad", fail: "synth" }), stubEngine()], "hi there.", { onSkip: (e) => skipped.push(e) });
    expect(r.engine).toBe("stub");
    expect(skipped).toEqual(["webspeech", "bad"]);
    const err = await renderSpeech([native()], "hi").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OfflineRenderError);
    expect((err as OfflineRenderError).code).toBe("native");
    expect(humanError(err)).toBe(OFFLINE_RENDER_REFUSAL);
    const fail = await renderSpeech([stubEngine({ fail: "load" })], "hi").catch((e: unknown) => e);
    expect((fail as OfflineRenderError).code).toBe("failed");
    expect(humanError(fail)).toMatch(/^no voice could render this text\. stub: stub engine refused to load\.$/);
  });

  test("wav blob, buffer and timing json", async () => {
    const r = await renderSpeech(stubEngine(), "one two.");
    const bytes = renderedWavBytes(r);
    const back = decodeWav(bytes);
    expect(back.sampleRate).toBe(24000);
    expect(back.channels[0]!.length).toBe(r.samples.length);
    const blob = renderedWav(r);
    expect(blob.type).toBe("audio/wav");
    expect(blob.size).toBe(bytes.length);
    const d = new Float32Array(r.samples.length);
    const buf = renderedBuffer({ createBuffer: (_c: number, n: number) => (expect(n).toBe(d.length), { getChannelData: () => d }) }, r);
    expect(buf.getChannelData(0)[100]).toBeCloseTo(r.samples[100]!);
    expect(renderedTiming(r, "one two.").words.map((w) => w.text)).toEqual(["one", "two"]);
  });

  test("speaker.render uses the chain and voice settings", async () => {
    const ctx = { currentTime: 0, sampleRate: 24000, destination: { connect() {} }, createBuffer: () => ({ getChannelData: () => new Float32Array(1) }), createBufferSource: () => ({}) as never, createAnalyser: () => ({ connect() {}, fftSize: 0, getFloatTimeDomainData() {} }), createGain: () => ({ connect() {}, gain: { value: 1 } }) } as AudioContextLike;
    const sp = createSpeaker({ ctx, engines: [native(), stubEngine()], voice: { rate: 2 }, tickMs: 0 });
    const slow = await renderSpeech(stubEngine(), "abcd efgh.");
    const r = await sp.render("abcd efgh.");
    expect(r.engine).toBe("stub");
    expect(r.duration).toBeCloseTo(slow.duration / 2, 2);
  });
});

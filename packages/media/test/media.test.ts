import { describe, expect, it } from "vitest";
import { decodeAudio, histDistance, lumaHistogram, pickKeyframes, pickMime, record, sampleTimes, type OfflineCtor } from "@hackbuild/media";

describe("decode", () => {
  it("decodes then renders at the target rate, and names a refused container", async () => {
    const made: number[] = [];
    const buf = (sr: number, n: number) => ({ sampleRate: sr, duration: n / sr, numberOfChannels: 2, length: n, getChannelData: (c: number) => new Float32Array(n).fill(c + 1) });
    const Ctx = class {
      destination = {};
      constructor(
        _c: number,
        _n: number,
        readonly sr: number,
      ) {
        made.push(sr);
      }
      async decodeAudioData(b: ArrayBuffer) {
        if (b.byteLength === 0) throw new Error("EncodingError");
        return buf(48000, 48000);
      }
      createBufferSource() {
        return { buffer: null, connect() {}, start() {} };
      }
      async startRendering() {
        return buf(this.sr, 16000);
      }
    } as unknown as OfflineCtor;
    const d = await decodeAudio(new ArrayBuffer(8), 16000, Ctx);
    expect([d.sampleRate, d.channels.length, d.channels[1]![0]]).toEqual([16000, 2, 2]);
    expect(made).toEqual([16000, 16000]);
    await expect(decodeAudio(new ArrayBuffer(0), 16000, Ctx)).rejects.toThrow(/will not decode/);
  });
});

describe("keyframes", () => {
  const frame = (v: number) => lumaHistogram(new Uint8Array(64).fill(v).map((x, i) => (i % 4 === 3 ? 255 : x)));
  it("keeps scene changes, a max gap and the biggest changes under a cap", () => {
    expect(histDistance(frame(0), frame(255))).toBe(1);
    const fr = [0, 0, 0, 200, 200, 10, 10, 10, 10, 10].map((v, i) => ({ t: i, hist: frame(v) }));
    expect(pickKeyframes(fr)).toEqual([0, 3, 5]);
    expect(pickKeyframes(fr, { maxGap: 3 })).toEqual([0, 3, 5, 8]);
    expect(pickKeyframes(fr, { max: 2 })).toEqual([0, 3]);
    expect(sampleTimes(3, 1)).toEqual([0.05, 1.05, 2.05]);
  });
});

describe("recording", () => {
  it("picks the first supported type and collects chunks", async () => {
    expect(pickMime((t) => t === "video/webm")).toBe("video/webm");
    expect(pickMime(() => false)).toBe("");
    let inst: { ondataavailable: ((e: { data: Blob }) => void) | null; onstop: (() => void) | null } | null = null;
    class R {
      ondataavailable: ((e: { data: Blob }) => void) | null = null;
      onstop: (() => void) | null = null;
      constructor(
        _s: unknown,
        readonly opts: Record<string, unknown>,
      ) {
        inst = this;
      }
      start() {}
      stop() {
        this.ondataavailable!({ data: new Blob(["ab"]) });
        this.onstop!();
      }
    }
    const r = record({}, { Recorder: R, mimeType: "video/webm" });
    expect(inst).not.toBeNull();
    const b = await r.stop();
    expect([b.size, b.type]).toEqual([2, "video/webm"]);
  });
});

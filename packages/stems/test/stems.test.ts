import { describe, expect, it } from "vitest";
import type { OrtModel } from "@hackbuild/devices";
import { createHub, createRegistry, stubFactory } from "@hackbuild/models";
import { STEMS_RECORDS, attachStems, ortSeparator, overlapOf, separate, stemsStubs } from "@hackbuild/stems";

const mix = (n: number) => [Float32Array.from({ length: n }, (_, i) => Math.sin(i / 9)), Float32Array.from({ length: n }, (_, i) => Math.cos(i / 7))] as const;

describe("stems", () => {
  it("names licences and overlaps per tier", () => {
    expect(STEMS_RECORDS.map((r) => [r.id, overlapOf(r), r.licence])).toEqual([
      ["htdemucs-fast", 0.1, "MIT"],
      ["htdemucs-slow", 0.4, "MIT"],
    ]);
  });

  it("separates in stub mode with stems summing back to the mix", async () => {
    const hub = createHub({ stub: true });
    hub.provide("stub", stubFactory(stemsStubs()));
    const [l, r] = mix(5000);
    let t = 0;
    const prog: number[] = [];
    const out = await separate(hub, l, r, { segment: 1024, overlap: 0.25, now: () => (t += 10), onProgress: (p) => prog.push(p.done) });
    for (const i of [0, 777, 4999]) {
      const s = out.stems.drums.left[i]! + out.stems.bass.left[i]! + out.stems.other.left[i]! + out.stems.vocals.left[i]!;
      expect(s).toBeCloseTo(l[i]!, 5);
    }
    expect(prog.length).toBe(Math.ceil(5000 / 768));
    expect(out.rtf).toBeGreaterThan(0);
  });

  it("runs an ort htdemucs record and refuses two input exports", async () => {
    const S = 512;
    const model: OrtModel = {
      ort: { Tensor: class { constructor(readonly type: string, readonly data: Float32Array, readonly dims: number[]) {} } as never, InferenceSession: { create: async () => null as never } },
      sessions: {},
      session: {
        inputNames: ["mix"],
        outputNames: ["spec", "wave"],
        run: async (feeds: Record<string, unknown>) => {
          const x = (feeds.mix as { data: Float32Array }).data;
          const out = new Float32Array(4 * 2 * S);
          for (let t = 0; t < 4; t++) out.set(x.subarray(0, 2 * S).map((v) => (t === 3 ? v : 0)), t * 2 * S);
          return { spec: { data: new Float32Array(1), dims: [1, 4, 4, 1, 1] }, wave: { data: out, dims: [1, 4, 2, S] } };
        },
      },
      rung: { device: "wasm" },
      dispose: async () => {},
    };
    const hub = createHub({ registry: createRegistry(), env: { webgpu: false, f16: false, adapter: null, maxBufferBytes: null, isolated: false, protocol: "https", opfs: false, cacheStorage: false, indexedDB: false, threads: 1, deviceMemoryGB: null, promptApi: false, notes: [] } });
    attachStems(hub);
    hub.provide("ort", async () => model);
    const [l, r] = mix(2000);
    const out = await separate(hub, l, r, { model: "htdemucs-fast", segment: S });
    expect(out.stems.vocals.right[1500]).toBeCloseTo(r[1500]!, 5);
    expect(out.stems.drums.left[1500]).toBe(0);
    expect(() => ortSeparator({ ...model, session: { ...model.session, inputNames: ["a", "b"] } })).toThrow(/spectrogram/);
  });
});

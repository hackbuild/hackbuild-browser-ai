import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, test } from "vitest";
import { epochsFromEvents, loadBiosignal } from "@hackbuild/biosignal";
import { BIOSIGNAL_WASM_BASE64 } from "@hackbuild/biosignal/inline";

const root = join(import.meta.dirname, "..", "..", "..");
const fx = JSON.parse(readFileSync(join(root, "crates/biosignal/tests/parity.json"), "utf8")) as {
  x: string;
  filtered: string;
  cov0: number[];
  tangent: number[];
  distance: number;
  proba: number[];
  cv: number[];
};
const fnv = (a: Float32Array) => {
  let h = 0xcbf29ce484222325n;
  for (const v of new Uint8Array(a.buffer, a.byteOffset, a.byteLength)) h = ((h ^ BigInt(v)) * 0x100000001b3n) & 0xffffffffffffffffn;
  return h.toString(16).padStart(16, "0");
};

const bs = await loadBiosignal({ bytes: new Uint8Array(readFileSync(join(root, "packages/biosignal/wasm/biosignal.wasm"))) });
const C = 4;
const T = 128;
const FS = 128;
const alpha = [{ lo: 8, hi: 12 }];

describe("native and wasm parity", () => {
  test("filters, covariances, distances, training and cross validation give the native bits", () => {
    expect(bs.simd).toBe(true);
    const ep = bs.synth(7, C, T, FS, 10, 20, 3);
    const all = new Float32Array(ep.length * C * T);
    ep.forEach((e, i) => all.set(e.data, i * C * T));
    expect(fnv(all)).toBe(fx.x);
    expect(fnv(bs.bandpass(ep[0]!.data.subarray(0, T), FS, 8, 12, 50))).toBe(fx.filtered);
    const covs = bs.features(ep, alpha, FS, 0.08, 50);
    const c0 = covs.subarray(0, 16);
    expect([...c0]).toEqual(fx.cov0);
    const c1 = covs.slice(16, 32);
    // the tangent vector fixture needs an inverse square root the wasm surface does not export; the distance covers the same eigen path
    expect(bs.distance(c0.slice(), c1, C)).toBe(fx.distance);
    const m = bs.train(ep, alpha, FS, { classes: 2, epochs: 60 }, 0.08, 50);
    expect(m.proba(ep[5]!)).toEqual(fx.proba);
    expect(bs.crossValidate(ep, alpha, FS, { classes: 2, epochs: 60, seed: 11 }, 0.08, 50)).toEqual(fx.cv);
  });
});

describe("classifier", () => {
  it("round trips through JSON and epochs continuous data by event", () => {
    const ep = bs.synth(3, C, T, FS, 10, 16, 2);
    const m = bs.train(ep, alpha, FS, { classes: 2 });
    const json = JSON.parse(JSON.stringify(m.toJSON()));
    const m2 = bs.load(json);
    expect(m2.proba(ep[3]!)).toEqual(m.proba(ep[3]!));
    expect(ep.filter((e) => m2.predict(e) === e.label).length / ep.length).toBeGreaterThan(0.9);
    expect(() => bs.load({ ...json, values: json.values.slice(1) })).toThrow(/header/);
    m.dispose();
    const data = [Float32Array.from({ length: 1000 }, (_, i) => i), new Float32Array(1000)];
    const e = epochsFromEvents(data, [{ at: 100, label: 1 }, { at: 950, label: 0 }], 64, 2, 32);
    expect(e.map((x) => [x.trial, x.data[0]])).toEqual([
      [0, 100],
      [0, 132],
    ]);
    const id = new Float64Array([1, 0, 0, 1]);
    expect([...bs.tangent(id, id, 2)]).toEqual([0, 0, 0]);
  });

  it("folds by trial by default; window level folds report the leaky number", () => {
    const ep = bs.synth(5, C, T, FS, 10, 12, 4);
    const fair = bs.crossValidate(ep, alpha, FS, { classes: 2, epochs: 40, folds: 4 });
    const leaky = bs.crossValidate(ep, alpha, FS, { classes: 2, epochs: 40, folds: 4, byTrial: false });
    expect(fair.length).toBe(4);
    expect(leaky.length).toBe(4);
    expect(fair.every((a) => a >= 0 && a <= 1)).toBe(true);
    // windows that share a trial share its mixing, and labels carry no signal: only a leak can score
    let st = 99;
    const rnd = () => ((st = (st * 1103515245 + 12345) >>> 0) / 2 ** 32) * 2 - 1;
    const leakEp: { data: Float32Array; channels: number; samples: number; label: number; trial: number }[] = [];
    for (let trial = 0; trial < 24; trial++) {
      const mix = Array.from({ length: C * C }, () => rnd());
      for (let w = 0; w < 6; w++) {
        const data = new Float32Array(C * T);
        for (let t = 0; t < T; t++) {
          const z = Array.from({ length: C }, () => rnd());
          for (let i = 0; i < C; i++) data[i * T + t] = z.reduce((acc, v, j) => acc + v * mix[i * C + j]!, 0);
        }
        leakEp.push({ data, channels: C, samples: T, label: trial % 2, trial });
      }
    }
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    const fairL = mean(bs.crossValidate(leakEp, [{ lo: 1, hi: 60 }], FS, { classes: 2, epochs: 80, folds: 4 }));
    const leakyL = mean(bs.crossValidate(leakEp, [{ lo: 1, hi: 60 }], FS, { classes: 2, epochs: 80, folds: 4, byTrial: false }));
    // measured 0.368 by trial and 0.604 by window on this fixture
    expect(fairL).toBeLessThan(0.55);
    expect(leakyL - fairL).toBeGreaterThan(0.15);
  });
});

describe("input checks", () => {
  it("refuses no epochs and a model whose sizes do not match its header", () => {
    expect(() => bs.train([], [{ lo: 8, hi: 12 }], 128, { classes: 2 })).toThrow(/no epochs/);
    const ep = bs.synth(3, C, 128, 128, 10, 8, 2);
    const m = bs.train(ep, [{ lo: 8, hi: 12 }], 128, { classes: 2, epochs: 5 }).toJSON();
    const bad = { ...m, values: [...m.values] };
    bad.values[3] = bad.values[3]! + 1;
    expect(() => bs.load(bad)).toThrow(/header/);
    expect(() => bs.load(m)).not.toThrow();
  });
});


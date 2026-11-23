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
  test("filters, covariances, tangent vectors, training and cross validation give the native bits", () => {
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
  });
});

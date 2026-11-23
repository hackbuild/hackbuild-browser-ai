// The single file builds: every package entry bundles to one ESM file with
// no bare imports left, and each file loads in Node with its exports.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { bundle } from "../bundle.mjs";

const expected = {
  "ai-env": ["probe", "importEsm", "spawnWorker"],
  weights: ["openWeightStore", "getRepo"],
  models: ["createHub", "createRegistry", "CATALOG"],
  chat: ["createEngine", "scripted"],
  structured: ["call", "createTagParser"],
  memory: ["open", "loadCore"],
  devices: ["tjsProvider", "ortProvider", "LADDERS"],
  "audio-dsp": ["loadDsp", "gate", "toSrt", "writeMidi"],
};

for (const [pkg, names] of Object.entries(expected)) {
  test(`${pkg} bundles to self contained files`, async () => {
    const files = await bundle(pkg);
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      assert.doesNotMatch(src, /^\s*(?:import|export)\s[^;]*?\sfrom\s*["'](?![./])/m, `${f} keeps a bare import`);
      const mod = await import(pathToFileURL(f).href);
      if (f.endsWith("/index.js")) for (const n of names) assert.equal(typeof mod[n] === "undefined", false, `${f} lacks ${n}`);
    }
  });
}

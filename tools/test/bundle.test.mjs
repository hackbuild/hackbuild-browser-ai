// The single file builds: every package entry bundles to one ESM file with
// no bare imports left, and each file loads in Node with its exports; the
// classic IIFE twin carries no module syntax and sets its global.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { runInNewContext } from "node:vm";
import { bundle, globalName } from "../bundle.mjs";

const expected = {
  "ai-env": ["probe", "importEsm", "spawnWorker"],
  weights: ["openWeightStore", "getRepo"],
  models: ["createHub", "createRegistry", "CATALOG"],
  chat: ["createEngine", "scripted", "createSession"],
  converse: ["createConversation", "createSession", "buildMessages"],
  structured: ["call", "createTagParser"],
  memory: ["open", "loadCore"],
  devices: ["tjsProvider", "ortProvider", "LADDERS"],
  "audio-dsp": ["loadDsp", "gate", "toSrt", "writeMidi"],
  transcribe: ["transcribe", "attachTranscribe", "LiveSegmenter"],
  vision: ["attachVision", "depth", "detect", "landmarks", "mediapipeProvider"],
  "depth-mesh": ["loadDepthMesh", "toStl", "fitToPrint"],
  stems: ["separate", "attachStems"],
  notes: ["runPitch", "decodeNotes", "drumNotes"],
  biosignal: ["loadBiosignal", "epochsFromEvents"],
  media: ["decodeAudio", "pickKeyframes", "record"],
};

for (const [pkg, names] of Object.entries(expected)) {
  test(`${pkg} bundles to self contained files`, async () => {
    const files = await bundle(pkg);
    assert.ok(files.length > 0);
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      if (f.endsWith(".iife.js")) {
        assert.doesNotMatch(src, /^\s*(?:import|export)\s/m, `${f} keeps module syntax`);
        const entry = f.split("/").pop().replace(/\.iife\.js$/, "");
        const g = globalName(pkg, entry);
        const ctx = { document: { baseURI: "file:///x/" }, TextEncoder, TextDecoder, URL, atob, btoa, console, globalThis: {} };
        ctx.globalThis = ctx;
        runInNewContext(`${src}\n;globalThis.__g = typeof ${g} === "undefined" ? undefined : ${g};`, ctx);
        assert.ok(ctx.__g && typeof ctx.__g === "object", `${f} sets no ${g}`);
        if (entry === "index") for (const n of names) assert.equal(typeof ctx.__g[n] === "undefined", false, `${f} lacks ${n}`);
        continue;
      }
      assert.doesNotMatch(src, /^\s*(?:import|export)\s[^;]*?\sfrom\s*["'](?![./])/m, `${f} keeps a bare import`);
      const mod = await import(pathToFileURL(f).href);
      if (f.endsWith("/index.js")) for (const n of names) assert.equal(typeof mod[n] === "undefined", false, `${f} lacks ${n}`);
    }
  });
}

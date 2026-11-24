#!/usr/bin/env node
// Shared origin check (suite design 2.2, decision D7): two paths served
// from one local http host stand in for two sites on one Pages origin.
// Rows:
//   store      a blob put through @hackbuild/weights on /a/ is read on /b/,
//              once per backend (opfs, idb, cache)
//   webllm     an entry written to the WebLLM 0.2.84 IndexedDB layout
//              ("webllm/model", store "urls", keyPath "url") on /a/ is
//              listed on /b/ through webllmCache from @hackbuild/chat/webllm
//   tjs-cache  transformersCache put on /a/, match on /b/
//   one-fetch  /a/ and /b/ ask the store for one key at the same time;
//              a stub fetch counts the downloads; the store's Web Lock
//              keeps it to one
// Stub bytes only, no weight and no network beyond the local host.
// Usage: node tools/check-origin.mjs   (HB_CHROME overrides the browser,
// TMPDIR places the throwaway profile)
import { createServer } from "node:http";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import puppeteer from "puppeteer-core";
import { rolldown } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const CANDIDATES = [process.env.HB_CHROME, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser"];
const chrome = CANDIDATES.find((p) => p && existsSync(p));
if (!chrome) {
  console.error("check-origin: no chrome found, set HB_CHROME");
  process.exit(1);
}

// the weights package from source, as one ESM file a page imports
async function esm(input) {
  const bundle = await rolldown({ input, logLevel: "silent" });
  const { output } = await bundle.generate({ format: "esm", codeSplitting: false });
  await bundle.close();
  return output[0].code;
}
const lib = await esm(join(root, "packages", "weights", "src", "index.ts"));
// the WebLLM cache adapter, to read the WebLLM layout the way the manager will
const webllmLib = await esm(join(root, "packages", "chat", "src", "webllm.ts"));

const page = (name) =>
  `<!doctype html><meta charset="utf-8"><title>${name}</title><script type="module">import * as W from "/lib/weights.js"; import * as L from "/lib/webllm.js"; window.W = W; window.L = L; window.ready = true;</script>`;
const server = createServer((req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (path === "/lib/weights.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(lib);
  if (path === "/lib/webllm.js") return res.writeHead(200, { "content-type": "text/javascript" }).end(webllmLib);
  if (path === "/a/" || path === "/b/") return res.writeHead(200, { "content-type": "text/html" }).end(page(path));
  res.writeHead(404).end();
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;

const profile = mkdtempSync(join(tmpdir(), "hb-origin-"));
const browser = await puppeteer.launch({ executablePath: chrome, headless: true, args: ["--no-sandbox", `--user-data-dir=${profile}`] });
const rows = [];
let failed = 0;
const row = (name, pass, detail) => {
  rows.push(`| ${name} | ${pass ? "pass" : "fail"} | ${detail} |`);
  console.log(`check-origin: ${name} ${pass ? "pass" : "fail"}: ${detail}`);
  if (!pass) failed++;
};

// helpers the pages define: deterministic stub bytes, their hex digest, and a
// slow streaming stub fetch that counts calls in the page
const helpers = () => {
  window.stubBytes = (n) => {
    const b = new Uint8Array(n);
    for (let i = 0; i < n; i++) b[i] = (i * 31 + 7) % 251;
    return b;
  };
  window.hex = async (blob) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map((x) => x.toString(16).padStart(2, "0")).join("");
  window.fetches = 0;
  window.stubFetch = async (_url, init = {}) => {
    window.fetches++;
    const all = window.stubBytes(8 * 65536);
    let at = 0;
    const body = new ReadableStream({
      async pull(c) {
        if (init.signal?.aborted) return c.error(new DOMException("aborted", "AbortError"));
        await new Promise((r) => setTimeout(r, 40));
        if (at >= all.length) return c.close();
        c.enqueue(all.slice(at, at + 65536));
        at += 65536;
      },
    });
    return new Response(body, { status: 200, headers: { "content-length": String(all.length), etag: '"stub-1"' } });
  };
};

try {
  const a = await browser.newPage();
  const b = await browser.newPage();
  for (const p of [a, b]) {
    await p.goto(`${origin}${p === a ? "/a/" : "/b/"}`, { waitUntil: "load" });
    await p.waitForFunction("window.ready === true");
    await p.evaluate(helpers);
  }
  const ua = await browser.version();

  // store: one row per backend
  for (const backend of ["opfs", "idb", "cache"]) {
    const key = `stub:${backend}`;
    const put = await a.evaluate(
      async (backend, key) => {
        const s = await W.openWeightStore({ backends: [backend], fetch: () => Promise.reject(new Error("no fetch in this row")), onNotice: () => {} });
        const blob = await s.put({ key, licence: "stub bytes, no weights" }, stubBytes(300000));
        return { backend: s.backend.name, hash: await hex(blob) };
      },
      backend,
      key,
    );
    const got = await b.evaluate(
      async (backend, key) => {
        const s = await W.openWeightStore({ backends: [backend], fetch: () => Promise.reject(new Error("fetched: the entry was not shared")), onNotice: () => {} });
        if (!(await s.has(key))) return { has: false };
        const blob = await s.get({ url: `${location.origin}/never`, key, licence: "stub bytes, no weights" });
        return { has: true, backend: s.backend.name, hash: await hex(blob), size: blob.size };
      },
      backend,
      key,
    );
    row(`store ${backend}`, put.backend === backend && got.has && got.hash === put.hash, got.has ? `put on /a/, read on /b/ through ${got.backend}, ${got.size} bytes, sha-256 equal (measured)` : "the entry put on /a/ is missing on /b/");
  }

  // webllm: the 0.2.84 IndexedDB layout, written raw
  const url = "https://huggingface.co/mlc-ai/stub-MLC/resolve/main/params_shard_0.bin";
  await a.evaluate(
    (url) =>
      new Promise((res, rej) => {
        const r = indexedDB.open("webllm/model", 1);
        r.onupgradeneeded = () => r.result.createObjectStore("urls", { keyPath: "url" });
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction(["urls"], "readwrite");
          tx.objectStore("urls").put({ url, data: stubBytes(4096).buffer });
          tx.oncomplete = () => (r.result.close(), res());
          tx.onerror = () => rej(tx.error);
        };
      }),
    url,
  );
  const wl = await b.evaluate(async () => {
    const c = L.webllmCache({ modelList: [{ model: "https://huggingface.co/mlc-ai/stub-MLC", model_id: "stub-MLC" }] });
    const rows = await c.list();
    return { found: await c.has("stub-MLC"), bytes: rows[0]?.bytes ?? 0 };
  });
  row("webllm idb", wl.found && wl.bytes === 4096, wl.found ? `"webllm/model" entry written on /a/, listed on /b/ through webllmCache, ${wl.bytes} bytes (measured)` : "the webllm entry is missing on /b/");

  // transformersCache: put on /a/, match on /b/
  const tjsUrl = "https://huggingface.co/onnx-community/stub/resolve/main/onnx/model_q4.onnx";
  const tjsPut = await a.evaluate(async (u) => {
    const s = await W.openWeightStore({ onNotice: () => {} });
    const c = W.transformersCache(s, { licenceFor: () => null });
    await c.put(u, new Response(stubBytes(70000)));
    return { backend: s.backend.name, hash: await hex(new Blob([stubBytes(70000)])) };
  }, tjsUrl);
  const tjsGot = await b.evaluate(async (u) => {
    const s = await W.openWeightStore({ fetch: () => Promise.reject(new Error("fetched")), onNotice: () => {} });
    const c = W.transformersCache(s, { licenceFor: () => null });
    const r = await c.match(u);
    return r ? { hash: await hex(await r.blob()), backend: s.backend.name } : null;
  }, tjsUrl);
  row("tjs-cache", !!tjsGot && tjsGot.hash === tjsPut.hash, tjsGot ? `put on /a/ (${tjsPut.backend}), matched on /b/ (${tjsGot.backend}), sha-256 equal (measured)` : "match on /b/ returned nothing");

  // one-fetch: both pages ask for one key at the same moment
  const one = async (p) =>
    p.evaluate(async () => {
      const s = await W.openWeightStore({ fetch: stubFetch, onNotice: () => {} });
      const blob = await s.get({ url: "https://stub.invalid/shared.bin", key: "stub:shared", licence: "stub bytes, no weights" });
      return { fetches: window.fetches, size: blob.size, hash: await hex(blob), backend: s.backend.name };
    });
  const [ra, rb] = await Promise.all([one(a), one(b)]);
  const want = await a.evaluate(async () => hex(new Blob([stubBytes(8 * 65536)])));
  const total = ra.fetches + rb.fetches;
  const intact = ra.hash === want && rb.hash === want;
  row("one-fetch", total === 1 && intact, `${total} stub fetch${total === 1 ? "" : "es"} for one key asked by two pages at once (measured); bytes ${intact ? "intact" : "corrupt"} on both pages (${ra.backend})`);
  rows.unshift(`headless ${ua}, ${origin}/a/ and /b/, stub bytes only (measured).`, "", "| row | result | detail |", "|---|---|---|");
} finally {
  await browser.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}
console.log(["", "### shared origin (D7)", "", ...rows, ""].join("\n"));
process.exitCode = failed ? 1 : 0;

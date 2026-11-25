// smoke-views: one headless smoke per ai-views demo page (tools/build-views.mjs),
// on stub providers. Serves the built site, opens each page in system Chrome with
// every model host unreachable, fails on a page error, then runs the page's
// sample (window.hbSample) and checks what the view should show after it.
// Usage: node tools/smoke-views.mjs [siteDir]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import puppeteer from "puppeteer-core";

const dir = resolve(process.argv[2] ?? "_site");
const CHROME = process.env.CHROME ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
const HOSTS = ["huggingface.co", "*.huggingface.co", "hf.co", "*.hf.co", "storage.googleapis.com", "cdn.jsdelivr.net", "raw.githubusercontent.com", "*.mlc.ai"];

/** Per page: what the first view must hold, and what the sample must leave. */
const PAGES = {
  models: { first: () => !!document.querySelector(".hb-msel-line") && /^load, /.test(document.getElementById("go").textContent), after: () => document.getElementById("gate").hidden && document.getElementById("awake").textContent === "awake" },
  jobs: { first: () => document.querySelectorAll(".hb-msel-job").length === 3 && document.querySelectorAll(".hb-msel-presets .hb-chip").length === 3 && /^load all, /.test(document.getElementById("go").textContent), after: () => document.getElementById("gate").hidden && /smollm2 360m|SmolLM2/i.test(document.getElementById("awake-note").textContent) && [...document.querySelectorAll(".hb-msel-job .hb-msel-state")].every((s) => s.textContent === "ready") },
  chat: { first: () => !!document.querySelector(".hb-lay-convempty") && !!document.querySelector(".hb-convbox .hb-btn-go") && !!document.querySelector(".hb-ctxmeter") && !!document.querySelector("chat-list .hb-convs"), after: () => document.querySelectorAll(".hb-msg").length === 2 && !!document.querySelector(".hb-think") && !!document.querySelector(".hb-msg-used") && /tok/.test(document.querySelector(".hb-msg-stats")?.textContent ?? "") && /what can you do/.test(document.querySelector("chat-list .hb-convs-title")?.textContent ?? "") },
  transcribe: { first: () => !!document.querySelector(".hb-lay-drop .hb-btn-go"), after: () => document.querySelectorAll(".hb-transcript .hb-tseg").length === 4 && !!document.querySelector("[data-ex='srt']") },
  masks: { first: () => !!document.querySelector(".hb-lay-empty .hb-btn-go") && document.querySelectorAll(".hb-lay-tools [data-tool]").length === 10, after: () => !!document.querySelector(".hb-mask-canvas") && !document.querySelector("[data-studio]").hidden && !!document.querySelector("mask-rack [data-all]"),
    deep: () => window.hbMaskCheck() },
  frame: { first: () => !!document.querySelector(".hb-camtile") && !!document.querySelector("#camera.hb-btn-go"), after: () => document.querySelector(".hb-camtile-tag").textContent === "2 found" && !document.getElementById("look").hidden },
};

const server = createServer(async (req, res) => {
  try {
    let p = join(dir, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if ((await stat(p)).isDirectory()) p = join(p, "index.html");
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}/views/`;
const profile = mkdtempSync(join(tmpdir(), "smoke-views-"));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, userDataDir: profile, args: ["--no-first-run", `--host-resolver-rules=${HOSTS.map((h) => `MAP ${h} ~NOTFOUND`).join(", ")}`] });
let failed = 0;
try {
  for (const [name, check] of Object.entries(PAGES)) {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && !/favicon|ERR_NAME_NOT_RESOLVED/.test(m.text()) && errors.push(m.text()));
    await page.goto(base + name + "/", { waitUntil: "networkidle0" });
    await new Promise((r) => setTimeout(r, 300));
    const first = await page.evaluate(check.first);
    await page.evaluate(() => window.hbSample());
    await new Promise((r) => setTimeout(r, 1800));
    let after = await page.evaluate(check.after);
    if (after && check.deep) after = await page.evaluate(check.deep);
    const ok = first && after && !errors.length;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${name}: first view ${first ? "ok" : "wrong"}, after the sample ${after ? "ok" : "wrong"}${errors.length ? `, errors: ${errors.join(" | ")}` : ""}`);
    await page.close();
  }
} finally {
  await browser.close();
  rmSync(profile, { recursive: true, force: true });
  server.close();
}
process.exit(failed ? 1 : 0);

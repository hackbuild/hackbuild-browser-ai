import { describe, expect, test } from "vitest";
import type { Env } from "@hackbuild/ai-env";
import type { ModelRecord } from "@hackbuild/models";
import {
  ELEMENT_NAMES,
  TOKENS,
  HB_CSS,
  HOST_CSS,
  appendDelta,
  define,
  disableReason,
  escapeHtml,
  finishLine,
  formatSize,
  licenceLine,
  maskKey,
  modelRows,
  pillFor,
  progressText,
  traceRows,
} from "@hackbuild/ai-elements";

const env = (o: Partial<Env> = {}): Env => ({
  webgpu: false,
  f16: false,
  adapter: null,
  maxBufferBytes: null,
  isolated: false,
  protocol: "https",
  opfs: true,
  cacheStorage: true,
  indexedDB: true,
  threads: 1,
  deviceMemoryGB: null,
  promptApi: false,
  notes: [],
  ...o,
});

const rec = (o: Partial<ModelRecord>): ModelRecord => ({
  id: "m",
  provides: ["chat"],
  provider: "tjs",
  source: {},
  sizeMB: 300,
  sizeSource: "inferred",
  ladder: [{ device: "wasm", dtype: "q8" }],
  licence: "Apache-2.0",
  commercial: true,
  ...o,
});

describe("model rows", () => {
  test("sizes carry their source word", () => {
    expect(formatSize(300, "inferred")).toBe("300 MB, inferred");
    expect(formatSize(2.3, "vendor")).toBe("2.3 MB, vendor");
    expect(formatSize(2048, "measured")).toBe("2.0 GB, measured");
    expect(formatSize(null, "unknown")).toBe("size unknown");
  });
  test("licence line names the weights licence and commercial use", () => {
    expect(licenceLine(rec({}))).toBe("weights Apache-2.0, commercial use allowed");
    expect(licenceLine(rec({ licence: "LFM Open License", commercial: "unknown" }))).toBe("weights LFM Open License, commercial use unknown");
  });
  test("a webgpu only model is disabled with the reason", () => {
    const gpu = rec({ ladder: [{ device: "webgpu", dtype: "q4f16" }] });
    expect(disableReason(gpu, env())).toBe("no webgpu adapter, the gpu has no shader-f16. this model needs them.");
    expect(disableReason(gpu, env({ webgpu: true }))).toBe("the gpu has no shader-f16. this model needs it.");
    expect(disableReason(gpu, env({ webgpu: true, f16: true }))).toBeNull();
    expect(disableReason(rec({ ladder: [] }), env())).toBe("this model has no device ladder.");
  });
  test("rows list the first rung this device would try", () => {
    const rows = modelRows([rec({ id: "a", label: "model a", ladder: [{ device: "webgpu", dtype: "fp16" }, { device: "wasm", dtype: "q8" }] })], env());
    expect(rows[0]).toMatchObject({ id: "a", label: "model a", devices: "webgpu or wasm", first: "wasm q8", disabled: null });
  });
});

test("progress text with and without a total", () => {
  const MB = 1024 * 1024;
  expect(progressText({ loaded: 50 * MB, total: 200 * MB, resuming: false })).toEqual({ text: "25 percent, 50 of 200 MB", fraction: 0.25 });
  expect(progressText({ loaded: 3 * MB, total: null, resuming: false })).toEqual({ text: "3.0 MB, total unknown", fraction: null });
  expect(progressText({ loaded: 12 * MB, total: null, resuming: true }).text).toBe("resuming, 12 MB on disk");
});

test("pills from engine and hub status", () => {
  expect(pillFor({ engine: "pocket", kind: "patch-missed", text: "Worker patches matched nothing" })).toEqual({ id: "pocket", kind: "patch-missed", text: "worker patches matched nothing" });
  expect(pillFor({ engine: "kokoro", kind: "watchdog", text: "no audio" }).kind).toBe("failed");
  expect(pillFor({ id: "whisper", busy: 2 })).toEqual({ id: "whisper", kind: "busy", text: "whisper busy, 2 waiting" });
  expect(pillFor({ id: "whisper", busy: 0 }).kind).toBe("ready");
});

test("trace rows mark the hits handed to the model", () => {
  const t = (id: number, score: number) => ({ id, bm25Rank: id === 2 ? -1 : id - 1, vecRank: 0, bm25: 1.23456, cos: 0.5, rrf: 0.0325, rel: 1, rec: 1, imp: 0.5, ret: 1, score, text: `item ${id} ${"x".repeat(id === 3 ? 100 : 0)}`, kind: "episode" as const });
  const rows = traceRows({ trace: [t(1, 0.9), t(2, 0.5), t(3, 0.1)], hits: [{ item: { id: 1 } } as never] });
  expect(rows.map((r) => r.used)).toEqual([true, false, false]);
  expect(rows[0]).toMatchObject({ rank: 1, bm25: "#1 1.235", cos: "#1 0.500", rrf: "0.033", score: "0.900" });
  expect(rows[1]!.bm25).toBe("none 1.235");
  expect(rows[2]!.text.length).toBe(80);
  expect(rows[2]!.text.endsWith("...")).toBe(true);
});

test("keys show first and last four only", () => {
  expect(maskKey("sk-abcdefghijkl1234")).toBe("sk-a...1234");
  expect(maskKey("short")).toBe("*****");
  expect(maskKey("sk-12345678")).toBe("***********");
});

test("chat lines stream into one assistant line and close with a note", () => {
  let l = appendDelta([{ role: "user", text: "hi", think: "", done: true }], { think: "plan" });
  l = appendDelta(l, { text: "hel" });
  l = appendDelta(l, { text: "lo" });
  expect(l).toHaveLength(2);
  expect(l[1]).toMatchObject({ role: "assistant", text: "hello", think: "plan", done: false });
  l = finishLine(l, "stopped.");
  expect(l[1]).toMatchObject({ done: true, note: "stopped." });
  expect(appendDelta(l, { text: "x" })).toHaveLength(3);
});

test("html is escaped", () => {
  expect(escapeHtml(`<b a="1">&'`)).toBe("&lt;b a=&quot;1&quot;&gt;&amp;&#39;");
});

test("define registers each element once under a prefix and nothing on import", () => {
  const reg = new Map<string, unknown>();
  const target = { get: (n: string) => reg.get(n), define: (n: string, c: unknown) => void reg.set(n, c) };
  class FakeBase {}
  const tags = define("x", target, FakeBase as never);
  expect(tags).toEqual(ELEMENT_NAMES.map((n) => `x-${n}`));
  const first = reg.get("x-chat-panel");
  define("x", target, FakeBase as never);
  expect(reg.get("x-chat-panel")).toBe(first);
  expect(() => define("hb", undefined, undefined)).toThrow(/no custom elements/);
});

test("tokens default to hackbuild-ui values and never shadow a page's tokens", () => {
  // --hb-ok and --hb-warn once held other values on :host and shadowed the design system inside the elements
  expect(TOKENS["--hb-ok"]).toBe("#1f9d55");
  expect(TOKENS["--hb-warn"]).toBe("#c77700");
  expect(TOKENS["--hb-pink"]).toBe("#FE0386");
  // no token is declared in the sheet, so a page's value on the element or an ancestor reaches in
  expect(`${HB_CSS}\n${HOST_CSS}`).not.toMatch(/(^|[{;\s])--hb-[a-z0-9-]+\s*:/);
  // every token use carries its hackbuild-ui fallback
  expect(HB_CSS).not.toMatch(/var\(--hb-(?!at\b)[a-z0-9-]+\)/);
  expect(HB_CSS).toContain("var(--hb-ok, #1f9d55)");
  expect(HB_CSS).toContain("var(--hb-shadow, 3px 3px 0 var(--hb-ink, #1a1a1a))");
  // page level rules are gone: no import, no grain overlay, no dark palette
  expect(HB_CSS).not.toMatch(/@import|body\.hb|prefers-color-scheme/);
});

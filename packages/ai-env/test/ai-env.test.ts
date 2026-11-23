import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  sha256Text,
  absolutizeImports,
  base64ToBytes,
  bytesToBase64,
  importEsm,
  InlineWorker,
  LoadError,
  probe,
  rewriteSource,
  spawnWorker,
  textToDataUrl,
  toClassicWorker,
  type WorkerLike,
} from "@hackbuild/ai-env";

function gpu(features: string[]) {
  return {
    requestAdapter: async () => ({
      features: new Set(features),
      limits: { maxBufferSize: 2 ** 30 },
      info: { vendor: "apple", architecture: "metal-3" },
    }),
  };
}

describe("probe", () => {
  it("reads webgpu, shader-f16, isolation and threads from the globals", async () => {
    const env = await probe({
      globals: {
        navigator: { gpu: gpu(["shader-f16"]), hardwareConcurrency: 10, deviceMemory: 8, storage: { getDirectory: async () => ({}) } },
        location: { protocol: "https:" },
        crossOriginIsolated: true,
        indexedDB: { open() {} },
        caches: { keys: async () => [] },
      },
    });
    expect(env).toMatchObject({
      webgpu: true,
      f16: true,
      isolated: true,
      threads: 4,
      protocol: "https",
      opfs: true,
      cacheStorage: true,
      indexedDB: true,
      deviceMemoryGB: 8,
      maxBufferBytes: 2 ** 30,
      promptApi: false,
    });
    expect(env.adapter).toEqual({ vendor: "apple", architecture: "metal-3" });
    expect(env.notes).toEqual([]);
  });

  it("reports file:// with no opfs, one thread and the missing f16", async () => {
    let asked = false;
    const env = await probe({
      globals: {
        navigator: { gpu: gpu([]), hardwareConcurrency: 8, storage: { getDirectory: async () => ((asked = true), {}) } },
        location: { protocol: "file:" },
        crossOriginIsolated: false,
        indexedDB: { open() {} },
        LanguageModel: {},
      },
    });
    expect(env.webgpu).toBe(true);
    expect(env.f16).toBe(false);
    expect(env.opfs).toBe(false);
    expect(asked).toBe(false);
    expect(env.threads).toBe(1);
    expect(env.protocol).toBe("file");
    expect(env.promptApi).toBe(true);
    expect(env.notes.join(" ")).toMatch(/shader-f16/);
    expect(env.notes.join(" ")).toMatch(/file:\/\//);
  });

  it("gives up on an adapter request that never settles", async () => {
    const env = await probe({
      timeoutMs: 20,
      globals: { navigator: { gpu: { requestAdapter: () => new Promise(() => {}) } }, location: { protocol: "http:" } },
    });
    expect(env.webgpu).toBe(false);
    expect(env.notes[0]).toBe("no webgpu adapter. models run on wasm.");
    expect(env.indexedDB).toBe(false);
  });

  it("handles a page with no navigator.gpu", async () => {
    const env = await probe({ globals: { navigator: {}, location: { protocol: "https:" } } });
    expect(env.webgpu).toBe(false);
    expect(env.opfs).toBe(false);
  });
});

describe("source rewriting", () => {
  it("swaps module workers for classic ones and keeps other options", () => {
    const src = [
      `const a = new Worker(workerURL, { type: "module" });`,
      `const b = new Worker(new URL("./w.js", import.meta.url), {type:'module', name: "x"});`,
      `const c = new Worker(u);`,
      `const d = new Worker(u, { name: "plain" });`,
    ].join("\n");
    const { text, count } = toClassicWorker(src);
    expect(count).toBe(2);
    expect(text).toContain(`new Worker(workerURL)`);
    expect(text).toContain(`new Worker(new URL("./w.js", import.meta.url), { name: "x" })`);
    expect(text).toContain(`new Worker(u, { name: "plain" })`);
  });

  it("reports rewrites that matched nothing", () => {
    const r = rewriteSource("CHUNK_GAP_SEC = 0.25; numThreads = 4", [
      [/CHUNK_GAP_SEC\s*=\s*0\.25/, "CHUNK_GAP_SEC = 0.1"],
      ["numThreads = 4", "numThreads = 1"],
      ["proxy = true", "proxy = false"],
    ]);
    expect(r.text).toBe("CHUNK_GAP_SEC = 0.1; numThreads = 1");
    expect(r.missed).toEqual([{ index: 2, pattern: "proxy = true" }]);
  });

  it("makes relative imports absolute", () => {
    const s = `import a from "./a.js"; import "../b.js"; export * from './c.js'; const d = import("./d.js"); import e from "https://x/e.js";`;
    const out = absolutizeImports(s, "https://cdn.test/pkg/esm/index.js");
    expect(out).toContain(`"https://cdn.test/pkg/esm/a.js"`);
    expect(out).toContain(`"https://cdn.test/pkg/b.js"`);
    expect(out).toContain(`'https://cdn.test/pkg/esm/c.js'`);
    expect(out).toContain(`import("https://cdn.test/pkg/esm/d.js")`);
    expect(out).toContain(`"https://x/e.js"`);
  });

  it("encodes base64 equal to node Buffer across the 32 KB step", () => {
    for (const n of [0, 1, 2, 3, 32767, 32768, 100001]) {
      const bytes = new Uint8Array(n);
      for (let i = 0; i < n; i++) bytes[i] = (i * 131 + 7) & 255;
      const b64 = bytesToBase64(bytes);
      expect(b64).toBe(Buffer.from(bytes).toString("base64"));
      expect(Array.from(base64ToBytes(b64))).toEqual(Array.from(bytes));
    }
    expect(textToDataUrl("x")).toBe("data:text/javascript;base64,eA==");
  });
});

function fakeFetch(files: Record<string, string>) {
  return (async (url: string) => {
    const body = files[url];
    return body === undefined ? new Response("", { status: 404 }) : new Response(body);
  }) as unknown as typeof fetch;
}

describe("importEsm", () => {
  it("checks a pinned sha256 and moves to the next url on a mismatch", async () => {
    const good = "export const v = 1;";
    const seen: string[] = [];
    const m = await importEsm<{ via: string }>(["https://a.test/x.js", "https://b.test/x.js"], {
      protocol: "https:",
      fetch: fakeFetch({ "https://a.test/x.js": "export const v = 2;", "https://b.test/x.js": good }),
      integrity: { "https://a.test/x.js": await sha256Text(good), "https://b.test/x.js": await sha256Text(good) },
      createObjectURL: () => "blob:fake/2",
      revokeObjectURL: (u) => seen.push(`revoked ${u}`),
      importer: async (s) => (seen.push(s), { via: s }),
    });
    expect(m.via).toBe("blob:fake/2");
    expect(seen).toEqual(["blob:fake/2", "revoked blob:fake/2"]);
  });

  it("uses plain import over http when nothing is patched", async () => {
    const seen: string[] = [];
    const m = await importEsm<{ ok: number }>("https://cdn.test/a.js", {
      protocol: "https:",
      importer: async (s) => (seen.push(s), { ok: 1 }),
    });
    expect(m.ok).toBe(1);
    expect(seen).toEqual(["https://cdn.test/a.js"]);
  });

  it("on file:// fetches, patches workers, and falls from blob to data url", async () => {
    const blobs: Blob[] = [];
    const seen: string[] = [];
    const attempts: string[] = [];
    const src = `export const w = () => new Worker(workerURL, { type: "module" }); import x from "./x.js";`;
    const m = await importEsm<{ via: string }>(["https://dead.test/i.js", "https://cdn.test/pkg/i.js"], {
      protocol: "file:",
      fetch: fakeFetch({ "https://cdn.test/pkg/i.js": src }),
      createObjectURL: (b) => (blobs.push(b), "blob:fake/1"),
      importer: async (s) => {
        seen.push(s);
        if (s.startsWith("blob:")) throw new TypeError("blob import refused");
        return { via: s.slice(0, 5) };
      },
      onAttempt: (a) => attempts.push(`${a.via}:${a.ok}`),
    });
    expect(m.via).toBe("data:");
    expect(attempts).toEqual(["blob:false", "blob:false", "data:true"]);
    const dataUrl = seen[1]!;
    const text = new TextDecoder().decode(base64ToBytes(dataUrl.split(",")[1]!));
    expect(text).toContain("new Worker(workerURL)");
    expect(text).toContain(`"https://cdn.test/pkg/x.js"`);
    expect(await blobs[0]!.text()).toBe(text);
  });

  it("throws LoadError with every attempt when all fail", async () => {
    const err = await importEsm("https://a.test/m.js", {
      protocol: "https:",
      fetch: fakeFetch({}),
      importer: async () => {
        throw new Error("nope");
      },
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadError);
    expect((err as LoadError).attempts.map((a) => a.via)).toEqual(["import", "blob"]);
  });

  it("reports missed rewrites", async () => {
    const missed: string[] = [];
    await importEsm("https://a.test/m.js", {
      protocol: "https:",
      fetch: fakeFetch({ "https://a.test/m.js": "export default 1" }),
      createObjectURL: () => "blob:x",
      importer: async () => ({}),
      rewrites: [["CHUNK_GAP_SEC", "X"]],
      onMissed: (m) => missed.push(...m.map((x) => x.pattern)),
    });
    expect(missed).toEqual(["CHUNK_GAP_SEC"]);
  });
});

type Ev = { data?: unknown; message?: string };
class FakeWorker implements WorkerLike {
  static made: { url: string; type: string | undefined }[] = [];
  static refuse = new Set<string>();
  static blobs = new Map<string, string>();
  private l = new Map<string, Set<(e: Ev) => void>>();
  constructor(url: string, opts?: { type?: "module" | "classic" }) {
    FakeWorker.made.push({ url, type: opts?.type });
    const src = FakeWorker.blobs.get(url) ?? "";
    setTimeout(() => {
      if (FakeWorker.refuse.has(opts?.type ?? "classic")) this.fire("error", { message: "module worker refused on file://" });
      else if (src.includes("__aiEnvReady")) this.fire("message", { data: { __aiEnvReady: 1 } });
    }, 1);
  }
  private fire(t: string, e: Ev) {
    for (const f of this.l.get(t) ?? []) f(e);
  }
  postMessage() {}
  terminate() {}
  addEventListener(t: "message" | "error", f: (e: Ev) => void) {
    if (!this.l.has(t)) this.l.set(t, new Set());
    this.l.get(t)!.add(f);
  }
  removeEventListener(t: "message" | "error", f: (e: Ev) => void) {
    this.l.get(t)?.delete(f);
  }
}

describe("spawnWorker", () => {
  it("falls from module-blob to classic-blob and rewrites the source", async () => {
    FakeWorker.made = [];
    FakeWorker.refuse = new Set(["module"]);
    let n = 0;
    FakeWorker.made = [];
    const urls: string[] = [];
    const out = await spawnWorker(`const w = new Worker(u, { type: "module" }); numThreads = 4;`, {
      Worker: FakeWorker,
      createObjectURL: (b: Blob) => {
        const u = `blob:${++n}`;
        urls.push(u);
        void b.text().then((t) => FakeWorker.blobs.set(u, t));
        FakeWorker.blobs.set(u, "__aiEnvReady");
        return u;
      },
      readyMs: 200,
      rewrites: [["numThreads = 4", "numThreads = 1"]],
    });
    expect(out.rung).toBe("classic-blob");
    expect(out.failures).toEqual([{ rung: "module-blob", error: "Error: module worker refused on file://" }]);
    expect(FakeWorker.made.map((m) => m.type)).toEqual(["module", "classic"]);
    await new Promise((r) => setTimeout(r, 5));
    const classicSrc = FakeWorker.blobs.get(urls[1]!)!;
    expect(classicSrc).toContain("new Worker(u)");
    expect(classicSrc).toContain("numThreads = 1");
  });

  it("falls to the inline rung and exchanges messages", async () => {
    const out = await spawnWorker(
      `self.onmessage = (e) => self.postMessage({ echo: e.data * 2 });`,
      { prefer: ["module-blob", "inline"], Worker: undefined as never, readyMs: 200 },
    );
    expect(out.rung).toBe("inline");
    expect(out.failures[0]!.error).toMatch(/Worker is not defined/);
    const reply = await new Promise<unknown>((resolve) => {
      out.worker.addEventListener("message", (e) => resolve(e.data));
      out.worker.postMessage(21);
    });
    expect(reply).toEqual({ echo: 42 });
  });

  it("never runs inline unless asked, and a url source needs a matching sha256 for it", async () => {
    const src = `self.onmessage = (e) => self.postMessage(e.data);`;
    const fetch = (async () => new Response(src)) as unknown as typeof globalThis.fetch;
    await expect(spawnWorker(src, { Worker: undefined as never, readyMs: 100 })).rejects.toThrow(/module-blob.*classic-blob/);
    const noHash = await spawnWorker({ url: "https://cdn.test/w.js" }, { prefer: ["inline"], fetch, readyMs: 100 }).catch((e: Error) => e.message);
    expect(noHash).toMatch(/needs a sha256/);
    const good = await sha256Text(src);
    const ok = await spawnWorker({ url: "https://cdn.test/w.js", sha256: good }, { prefer: ["inline"], fetch, readyMs: 200 });
    expect(ok.rung).toBe("inline");
    const bad = await spawnWorker({ url: "https://cdn.test/w.js", sha256: "00".repeat(32) }, { prefer: ["inline"], fetch }).catch((e: Error) => e.message);
    expect(bad).toMatch(/sha256/);
  });

  it("runs the inline rung with no eval", () => {
    const src = readFileSync(join(import.meta.dirname, "..", "src", "load.ts"), "utf8");
    expect(src).not.toMatch(/new Function|\beval\(/);
  });

  it("names every failed rung when none starts", async () => {
    const err = await spawnWorker(`throw new Error("boom")`, { prefer: ["inline"], readyMs: 100 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LoadError);
    expect((err as Error).message).toMatch(/inline/);
  });

  it("inline worker stops delivering after terminate", async () => {
    const w = new InlineWorker(`self.onmessage = (e) => self.postMessage(e.data);`);
    const got: unknown[] = [];
    w.addEventListener("message", (e) => got.push(e.data));
    w.postMessage(1);
    // the source is imported before it runs, so wait for the echo rather than a fixed time
    await vi.waitFor(() => expect(got).toEqual([1]));
    w.terminate();
    w.postMessage(2);
    await new Promise((r) => setTimeout(r, 10));
    expect(got).toEqual([1]);
  });
});

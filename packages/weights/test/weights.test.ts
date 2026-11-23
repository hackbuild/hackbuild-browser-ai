import { createHash } from "node:crypto";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import {
  cacheBackend,
  idbBackend,
  memoryBackend,
  opfsBackend,
  openWeightStore,
  Sha256,
  sha256Hex,
  WeightError,
  type Backend,
  type DirLike,
} from "@hackbuild/weights";

const nodeSha = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");

function file(n: number): Uint8Array {
  const b = new Uint8Array(n);
  let x = 12345;
  for (let i = 0; i < n; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    b[i] = x >>> 24;
  }
  return b;
}

interface ServerOpts {
  length?: boolean;
  ranges?: boolean;
  /** Error the stream after this many bytes on the first request only. */
  breakAt?: number;
  etag?: string;
  chunk?: number;
}

function server(data: Uint8Array, o: ServerOpts = {}) {
  const calls: { range: string | null; ifRange: string | null }[] = [];
  const f = async (_url: string, init?: RequestInit) => {
    const h = new Headers(init?.headers);
    calls.push({ range: h.get("range"), ifRange: h.get("if-range") });
    const first = calls.length === 1;
    let start = 0;
    let status = 200;
    const headers = new Headers();
    if (o.etag) headers.set("etag", o.etag);
    const m = /bytes=(\d+)-/.exec(h.get("range") ?? "");
    if (m && o.ranges !== false && (!h.get("if-range") || h.get("if-range") === o.etag)) {
      start = Number(m[1]);
      status = 206;
      headers.set("content-range", `bytes ${start}-${data.length - 1}/${data.length}`);
    }
    if (o.length !== false) headers.set("content-length", String(data.length - start));
    const chunk = o.chunk ?? 1000;
    let pos = start;
    const body = new ReadableStream<Uint8Array>({
      pull(ctrl) {
        if (first && o.breakAt !== undefined && pos >= o.breakAt) {
          ctrl.error(new Error("connection reset"));
          return;
        }
        if (pos >= data.length) {
          ctrl.close();
          return;
        }
        const end = Math.min(data.length, pos + chunk, first && o.breakAt !== undefined ? Math.max(o.breakAt, pos + 1) : Infinity);
        ctrl.enqueue(data.slice(pos, end));
        pos = end;
      },
    });
    return new Response(body, { status, headers });
  };
  return { fetch: f as unknown as typeof fetch, calls };
}

const quiet = { onNotice: () => {} };

describe("sha256", () => {
  it("matches node crypto across block edges and chunkings", () => {
    for (const n of [0, 1, 55, 56, 63, 64, 65, 119, 120, 1000, 70001]) {
      const b = file(n);
      expect(sha256Hex(b)).toBe(nodeSha(b));
      const h = new Sha256();
      for (let i = 0; i < n; i += 37) h.update(b.subarray(i, i + 37));
      expect(h.digestHex()).toBe(nodeSha(b));
    }
  });
});

describe("download", () => {
  it("stores parts and reports progress with no content length", async () => {
    const data = file(10_000);
    const s = server(data, { length: false });
    const store = await openWeightStore({ backends: ["memory"], partBytes: 4096, fetch: s.fetch, ...quiet });
    const seen: (number | null)[] = [];
    const blob = await store.get({ url: "https://h.test/m.gguf", licence: "Apache-2.0" }, { onProgress: (p) => seen.push(p.total) });
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
    expect(seen.every((t) => t === null)).toBe(true);
    const meta = await store.meta("https://h.test/m.gguf");
    expect(meta).toMatchObject({ complete: true, total: 10_000, sha256: nodeSha(data) });
    expect(meta!.parts.reduce((a, b) => a + b, 0)).toBe(10_000);
    expect(meta!.parts.length).toBe(3);
    // second get is served from the store
    await store.get({ url: "https://h.test/m.gguf", licence: "Apache-2.0" });
    expect(s.calls.length).toBe(1);
  });

  it("resumes an interrupted download with Range and If-Range", async () => {
    const data = file(20_000);
    const s = server(data, { breakAt: 9_500, etag: '"v1"' });
    const store = await openWeightStore({ backends: ["memory"], partBytes: 4096, fetch: s.fetch, ...quiet });
    const ref = { url: "https://h.test/big.bin", licence: "MIT", sha256: nodeSha(data) };
    const err = await store.get(ref).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(WeightError);
    expect((err as WeightError).message).toMatch(/kept for resume/);
    const partial = await store.meta(ref.url);
    const kept = partial!.parts.reduce((a, b) => a + b, 0);
    expect(kept).toBe(9_500);
    const progress: boolean[] = [];
    const blob = await store.get(ref, { onProgress: (p) => progress.push(p.resuming) });
    expect(s.calls[1]).toEqual({ range: `bytes=${kept}-`, ifRange: '"v1"' });
    expect(progress[0]).toBe(true);
    expect(nodeSha(new Uint8Array(await blob.arrayBuffer()))).toBe(nodeSha(data));
  });

  it("starts over when the server ignores the Range", async () => {
    const data = file(9_000);
    const s = server(data, { breakAt: 5_000, ranges: false });
    const store = await openWeightStore({ backends: ["memory"], partBytes: 2048, fetch: s.fetch, ...quiet });
    const ref = { url: "https://h.test/x", licence: "MIT" };
    await store.get(ref).catch(() => undefined);
    const blob = await store.get(ref);
    expect(s.calls.length).toBe(3);
    expect(s.calls[2]!.range).toBeNull();
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(data);
  });

  it("refuses a file whose sha256 differs and removes it", async () => {
    const data = file(3_000);
    const store = await openWeightStore({ backends: ["memory"], fetch: server(data).fetch, ...quiet });
    const ref = { url: "https://h.test/y", licence: "MIT", sha256: "00".repeat(32) };
    const err = await store.get(ref).catch((e: unknown) => e);
    expect((err as WeightError).code).toBe("sha256");
    expect(await store.has(ref.url)).toBe(false);
    expect(await store.meta(ref.url)).toBeNull();
  });

  it("shares one fetch between once() callers and between concurrent gets", async () => {
    const data = file(5_000);
    const s = server(data);
    const store = await openWeightStore({ backends: ["memory"], fetch: s.fetch, ...quiet });
    const ref = { url: "https://h.test/onnx", licence: "MIT" };
    const [a, b] = await Promise.all([store.once(ref), store.once(ref)]);
    expect(a).toBe(b);
    expect(s.calls.length).toBe(1);
    const ref2 = { url: "https://h.test/other", licence: "MIT" };
    await Promise.all([store.get(ref2), store.get(ref2), store.get(ref2)]);
    expect(s.calls.length).toBe(2);
  });

  it("refuses a download that does not fit the quota", async () => {
    const store = await openWeightStore({
      backends: ["memory"],
      fetch: server(file(1_000)).fetch,
      estimate: async () => ({ usage: 0, quota: 1_100 }),
      ...quiet,
    });
    const err = await store.get({ url: "https://h.test/q", licence: "MIT" }).catch((e: unknown) => e);
    expect((err as WeightError).code).toBe("quota");
    expect((await store.estimate()).fits(10)).toBe(true);
  });

  it("states the licence once per key", async () => {
    const lines: string[] = [];
    const store = await openWeightStore({ backends: ["memory"], fetch: server(file(10)).fetch, onNotice: (l) => lines.push(l) });
    const ref = { url: "https://h.test/l", key: "gguf:org/model.gguf", licence: "Llama 3.2 Community License" };
    await store.get(ref);
    await store.get(ref);
    expect(lines).toEqual(["weights gguf:org/model.gguf: licence Llama 3.2 Community License. the weights are not part of this library."]);
  });

  it("keeps parts on abort", async () => {
    const data = file(50_000);
    const store = await openWeightStore({ backends: ["memory"], partBytes: 1024, fetch: server(data, { chunk: 512 }).fetch, ...quiet });
    const ac = new AbortController();
    const ref = { url: "https://h.test/a", licence: "MIT" };
    const err = await store
      .get(ref, {
        signal: ac.signal,
        onProgress: (p) => {
          if (p.loaded >= 3_000) ac.abort();
        },
      })
      .catch((e: unknown) => e);
    // the fake stream ignores the signal, so the download either completes or reports abort; both keep parts
    if (err instanceof WeightError) expect(err.code).toBe("abort");
    expect((await store.meta(ref.url))!.parts.length).toBeGreaterThan(0);
  });

  it("accepts a user supplied file and checks its sha256", async () => {
    const store = await openWeightStore({ backends: ["memory"], partBytes: 100, fetch: server(file(1)).fetch, ...quiet });
    const data = file(1_050);
    const blob = await store.put({ key: "local:model.onnx", licence: "MIT", sha256: nodeSha(data) }, new File([data as BlobPart], "model.onnx"));
    expect(blob.size).toBe(1_050);
    expect((await store.meta("local:model.onnx"))!.parts.length).toBe(11);
    const err = await store.put({ key: "local:bad", licence: "MIT", sha256: "ab".repeat(32) }, data.buffer as ArrayBuffer).catch((e: unknown) => e);
    expect((err as WeightError).code).toBe("sha256");
    expect(await store.has("local:bad")).toBe(false);
  });
});

function fakeCaches(): CacheStorage {
  const caches = new Map<string, Map<string, Response>>();
  const open = async (name: string) => {
    let m = caches.get(name);
    if (!m) caches.set(name, (m = new Map()));
    const c = m;
    return {
      async match(u: string) {
        return c.get(u)?.clone();
      },
      async put(u: string, r: Response) {
        c.set(u, new Response(await r.arrayBuffer(), { headers: r.headers }));
      },
      async delete(u: string) {
        return c.delete(u);
      },
      async keys() {
        return [...c.keys()].map((url) => ({ url }));
      },
    };
  };
  return { open } as unknown as CacheStorage;
}

function fakeDir(): DirLike {
  const files = new Map<string, Blob>();
  const dirs = new Map<string, DirLike>();
  const d: DirLike = {
    async getDirectoryHandle(name, o) {
      let x = dirs.get(name);
      if (!x) {
        if (!o?.create) throw new DOMException("not found", "NotFoundError");
        dirs.set(name, (x = fakeDir()));
      }
      return x;
    },
    async getFileHandle(name, o) {
      if (!files.has(name) && !o?.create) throw new DOMException("not found", "NotFoundError");
      return {
        getFile: async () => files.get(name) ?? new Blob([]),
        createWritable: async () => {
          const chunks: (Blob | string)[] = [];
          return {
            write: async (c: Blob | string) => void chunks.push(c),
            close: async () => void files.set(name, new Blob(chunks)),
          };
        },
      };
    },
    async removeEntry(name) {
      dirs.delete(name);
      files.delete(name);
    },
    async *keys() {
      yield* dirs.keys();
    },
  };
  return d;
}

const backends: [string, () => Backend][] = [
  ["memory", () => memoryBackend()],
  ["idb", () => idbBackend({ indexedDB: new IDBFactory(), db: "t" })],
  ["cache", () => cacheBackend({ caches: fakeCaches() })],
  ["opfs", () => opfsBackend({ root: async () => root }) ],
];
const root = fakeDir();

describe.each(backends)("%s backend", (_name, make) => {
  it("downloads, resumes, lists and evicts", async () => {
    const data = file(12_345);
    const s = server(data, { breakAt: 7_000, etag: '"e"' });
    const store = await openWeightStore({ backends: [make()], partBytes: 3_000, fetch: s.fetch, ...quiet });
    const ref = { url: "https://h.test/w.bin", key: "gguf:org/w.gguf", licence: "MIT", sha256: nodeSha(data) };
    await store.get(ref).catch(() => undefined);
    const blob = await store.get(ref);
    expect(s.calls[1]!.range).toBe("bytes=7000-");
    expect(nodeSha(new Uint8Array(await blob.arrayBuffer()))).toBe(nodeSha(data));
    expect(await store.keys()).toContain("gguf:org/w.gguf");
    expect(await store.has("gguf:org/w.gguf")).toBe(true);
    await store.evict("gguf:org/w.gguf");
    expect(await store.has("gguf:org/w.gguf")).toBe(false);
    expect(await store.keys()).not.toContain("gguf:org/w.gguf");
  });
});

describe("backend choice", () => {
  it("skips a backend that throws on open", async () => {
    const broken: Backend = { ...memoryBackend(), name: "opfs", getMeta: async () => Promise.reject(new Error("SecurityError")) };
    const store = await openWeightStore({ backends: [broken, "memory"], fetch: server(file(1)).fetch, ...quiet });
    expect(store.backend.name).toBe("memory");
  });

  it("auto on file:// leaves out opfs and cache", async () => {
    const store = await openWeightStore({ protocol: "file:", fetch: server(file(1)).fetch, ...quiet });
    expect(["idb", "memory"]).toContain(store.backend.name);
  });
});

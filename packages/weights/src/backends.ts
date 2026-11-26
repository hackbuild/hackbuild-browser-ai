/**
 * Storage backends. Each stores a weight file as numbered parts plus one
 * meta record, so every backend resumes the same way and a multi GB file
 * never has to sit in one buffer. Parts are Blobs, which lets the browser
 * keep them on disk.
 */

export type BackendName = "opfs" | "cache" | "idb" | "memory";

/**
 * The stored record of one weight file: URL, licence, total, part sizes, validators and the SHA-256
 * once complete.
 */
export interface Meta {
  key: string;
  url: string | null;
  licence: string;
  /** Total bytes from Content-Length or Content-Range, null when the server sent neither. */
  total: number | null;
  /** Byte length of each stored part, in order. */
  parts: number[];
  complete: boolean;
  etag: string | null;
  lastModified: string | null;
  /** SHA-256 hex of the complete file, set once it is complete. */
  sha256: string | null;
  updated: number;
}

/** A storage backend that keeps each weight file as numbered parts plus one meta record. */
export interface Backend {
  readonly name: BackendName;
  getMeta(key: string): Promise<Meta | null>;
  putMeta(meta: Meta): Promise<void>;
  getPart(key: string, n: number): Promise<Blob | null>;
  putPart(key: string, n: number, part: Blob): Promise<void>;
  /** Remove the meta and every part of a key. */
  remove(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** A backend that keeps parts in memory for this tab only. */
export function memoryBackend(): Backend {
  const metas = new Map<string, Meta>();
  const parts = new Map<string, Blob>();
  return {
    name: "memory",
    async getMeta(key) {
      const m = metas.get(key);
      return m ? structuredClone(m) : null;
    },
    async putMeta(meta) {
      metas.set(meta.key, structuredClone(meta));
    },
    async getPart(key, n) {
      return parts.get(`${key}:${n}`) ?? null;
    },
    async putPart(key, n, part) {
      parts.set(`${key}:${n}`, part);
    },
    async remove(key) {
      metas.delete(key);
      for (const k of [...parts.keys()]) if (k.startsWith(`${key}:`) && /^\d+$/.test(k.slice(key.length + 1))) parts.delete(k);
    },
    async keys() {
      return [...metas.keys()];
    },
  };
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

/**
 * IndexedDB parts: one `kv` store with
 * `<key>:meta` and `<key>:<n>` records. Works on file://.
 */
export function idbBackend(opts: { db?: string; indexedDB?: IDBFactory } = {}): Backend {
  const factory = opts.indexedDB ?? globalThis.indexedDB;
  const name = opts.db ?? "hackbuild-weights";
  let dbp: Promise<IDBDatabase> | null = null;
  const open = () =>
    (dbp ??= new Promise<IDBDatabase>((resolve, reject) => {
      const r = factory.open(name, 1);
      r.onupgradeneeded = () => {
        if (!r.result.objectStoreNames.contains("kv")) r.result.createObjectStore("kv");
      };
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    }));
  const tx = async (mode: IDBTransactionMode) => (await open()).transaction("kv", mode).objectStore("kv");
  const get = async <T>(k: string) => ((await req((await tx("readonly")).get(k))) as T | undefined) ?? null;
  const put = async (k: string, v: unknown) => {
    await req((await tx("readwrite")).put(v, k));
  };
  return {
    name: "idb",
    getMeta: (key) => get<Meta>(`${key}:meta`),
    putMeta: (meta) => put(`${meta.key}:meta`, meta),
    getPart: (key, n) => get<Blob>(`${key}:${n}`),
    putPart: (key, n, part) => put(`${key}:${n}`, part),
    async remove(key) {
      const meta = await get<Meta>(`${key}:meta`);
      const store = await tx("readwrite");
      const count = Math.max(meta?.parts.length ?? 0, 0);
      store.delete(`${key}:meta`);
      for (let n = 0; n < count + 1; n++) store.delete(`${key}:${n}`);
      await new Promise<void>((resolve, reject) => {
        store.transaction.oncomplete = () => resolve();
        store.transaction.onerror = () => reject(store.transaction.error);
      });
    },
    async keys() {
      const all = (await req((await tx("readonly")).getAllKeys())) as IDBValidKey[];
      return all.map(String).filter((k) => k.endsWith(":meta")).map((k) => k.slice(0, -5));
    },
  };
}

/** Cache Storage parts at synthetic URLs. Not available on file://. */
export function cacheBackend(opts: { cache?: string; caches?: CacheStorage; origin?: string } = {}): Backend {
  const storage = opts.caches ?? globalThis.caches;
  const name = opts.cache ?? "hackbuild-weights";
  const origin = opts.origin ?? "https://weights.invalid/";
  const url = (key: string, n: number | "meta") => `${origin}${encodeURIComponent(key)}/${n}`;
  const open = () => storage.open(name);
  return {
    name: "cache",
    async getMeta(key) {
      const r = await (await open()).match(url(key, "meta"));
      return r ? ((await r.json()) as Meta) : null;
    },
    async putMeta(meta) {
      await (await open()).put(url(meta.key, "meta"), new Response(JSON.stringify(meta), { headers: { "content-type": "application/json" } }));
    },
    async getPart(key, n) {
      const r = await (await open()).match(url(key, n));
      return r ? await r.blob() : null;
    },
    async putPart(key, n, part) {
      await (await open()).put(url(key, n), new Response(part));
    },
    async remove(key) {
      const c = await open();
      const meta = await this.getMeta(key);
      await c.delete(url(key, "meta"));
      for (let n = 0; n <= (meta?.parts.length ?? 0); n++) await c.delete(url(key, n));
    },
    async keys() {
      const c = await open();
      const reqs = await c.keys();
      return reqs
        .map((r) => (typeof r === "string" ? r : r.url))
        .filter((u) => u.startsWith(origin) && u.endsWith("/meta"))
        .map((u) => decodeURIComponent(u.slice(origin.length, -5)));
    },
  };
}

/** The parts of FileSystemDirectoryHandle the OPFS backend uses. */
export interface DirLike {
  getDirectoryHandle(name: string, o?: { create?: boolean }): Promise<DirLike>;
  getFileHandle(name: string, o?: { create?: boolean }): Promise<{
    getFile(): Promise<Blob>;
    createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>;
  }>;
  removeEntry(name: string, o?: { recursive?: boolean }): Promise<void>;
  keys?(): AsyncIterable<string>;
}

/** Origin private file system: one directory per key, files `meta.json` and `<n>.part`. */
export function opfsBackend(opts: { root?: () => Promise<DirLike>; dir?: string } = {}): Backend {
  const rootFn =
    opts.root ?? (async () => (await (navigator.storage as unknown as { getDirectory(): Promise<DirLike> }).getDirectory()) as DirLike);
  const top = opts.dir ?? "hackbuild-weights";
  const safe = (key: string) => encodeURIComponent(key).replace(/\./g, "%2E");
  const base = async () => (await rootFn()).getDirectoryHandle(top, { create: true });
  const dirOf = async (key: string, create: boolean) => {
    try {
      return await (await base()).getDirectoryHandle(safe(key), { create });
    } catch {
      return null;
    }
  };
  const readFile = async (key: string, file: string) => {
    const d = await dirOf(key, false);
    if (!d) return null;
    try {
      return await (await d.getFileHandle(file)).getFile();
    } catch {
      return null;
    }
  };
  const writeFile = async (key: string, file: string, data: Blob | string) => {
    const d = (await dirOf(key, true))!;
    const w = await (await d.getFileHandle(file, { create: true })).createWritable();
    await w.write(data);
    await w.close();
  };
  return {
    name: "opfs",
    async getMeta(key) {
      const f = await readFile(key, "meta.json");
      return f ? (JSON.parse(await f.text()) as Meta) : null;
    },
    putMeta: (meta) => writeFile(meta.key, "meta.json", JSON.stringify(meta)),
    getPart: (key, n) => readFile(key, `${n}.part`),
    putPart: (key, n, part) => writeFile(key, `${n}.part`, part),
    async remove(key) {
      try {
        await (await base()).removeEntry(safe(key), { recursive: true });
      } catch {
        /* already gone */
      }
    },
    async keys() {
      const b = await base();
      const out: string[] = [];
      if (b.keys) for await (const k of b.keys()) out.push(decodeURIComponent(k));
      return out;
    },
  };
}

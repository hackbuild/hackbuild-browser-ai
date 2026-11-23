// Where a memory persists: IndexedDB in a page, a Map in tests and in
// pages where IndexedDB fails.

import type { Kind } from "./core.js";

/** One stored item. Times are milliseconds since 1970. */
export interface StoredItem {
  id: number;
  text: string;
  kind: Kind;
  scope: string;
  created: number;
  lastUsed: number;
  importance: number;
  arousal: number;
  valence: number;
  novelty: number;
  uses: number;
  weight: number;
  place?: [number, number, number];
  /** Section or source label, used by the per section cap in select. */
  section?: string;
  entities?: string[];
  meta?: Record<string, unknown>;
}

export interface MemorySink {
  readonly kind: "indexeddb" | "memory";
  loadItems(): Promise<StoredItem[]>;
  putItems(items: StoredItem[]): Promise<void>;
  /** Deletes the items and every embedder's vector for them. */
  deleteItems(ids: number[]): Promise<void>;
  /** Vectors are kept per embedder id, so a model change re-embeds. */
  getVectors(embedderId: string, ids: number[]): Promise<Map<number, Float32Array>>;
  putVectors(embedderId: string, vecs: Map<number, Float32Array>): Promise<void>;
  getKv<T>(key: string): Promise<T | undefined>;
  putKv(key: string, value: unknown): Promise<void>;
  clear(): Promise<void>;
  close(): void;
}

/** A sink over a Map. Nothing outlives the page. */
export function memorySink(): MemorySink {
  const items = new Map<number, StoredItem>();
  const vecs = new Map<string, Float32Array>();
  const kv = new Map<string, unknown>();
  const clone = <T>(x: T): T => structuredClone(x);
  return {
    kind: "memory",
    loadItems: async () => [...items.values()].map(clone),
    putItems: async (xs) => {
      for (const x of xs) items.set(x.id, clone(x));
    },
    deleteItems: async (ids) => {
      const gone = new Set(ids.map(String));
      for (const id of ids) items.delete(id);
      for (const k of [...vecs.keys()]) if (gone.has(k.slice(k.lastIndexOf("|") + 1))) vecs.delete(k);
    },
    getVectors: async (e, ids) => {
      const out = new Map<number, Float32Array>();
      for (const id of ids) {
        const v = vecs.get(`${e}|${id}`);
        if (v) out.set(id, v.slice());
      }
      return out;
    },
    putVectors: async (e, m) => {
      for (const [id, v] of m) vecs.set(`${e}|${id}`, v.slice());
    },
    getKv: async <T>(k: string) => kv.get(k) as T | undefined,
    putKv: async (k, v) => {
      kv.set(k, clone(v));
    },
    clear: async () => {
      items.clear();
      vecs.clear();
      kv.clear();
    },
    close: () => {},
  };
}

const req = <T>(r: IDBRequest<T>): Promise<T> =>
  new Promise((res, rej) => {
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });

const done = (t: IDBTransaction): Promise<void> =>
  new Promise((res, rej) => {
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error ?? new Error("transaction aborted"));
  });

/**
 * A sink over one IndexedDB database per memory id, named
 * `hackbuild-memory:<id>`, with stores items (keyPath id), vectors (key
 * `<embedder id>|<item id>`, value an ArrayBuffer of float32) and kv.
 */
export async function indexedDbSink(id: string, opts: { indexedDB?: IDBFactory } = {}): Promise<MemorySink> {
  const factory = opts.indexedDB ?? globalThis.indexedDB;
  if (!factory) throw new Error("memory: no indexeddb in this context");
  const open = factory.open(`hackbuild-memory:${id}`, 1);
  open.onupgradeneeded = () => {
    const db = open.result;
    if (!db.objectStoreNames.contains("items")) db.createObjectStore("items", { keyPath: "id" });
    if (!db.objectStoreNames.contains("vectors")) db.createObjectStore("vectors");
    if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
  };
  const db = await req(open);
  const tx = (stores: string[], mode: IDBTransactionMode) => db.transaction(stores, mode);
  return {
    kind: "indexeddb",
    async loadItems() {
      return req(tx(["items"], "readonly").objectStore("items").getAll() as IDBRequest<StoredItem[]>);
    },
    async putItems(xs) {
      const t = tx(["items"], "readwrite");
      const s = t.objectStore("items");
      for (const x of xs) s.put(x);
      await done(t);
    },
    async deleteItems(ids) {
      if (!ids.length) return;
      const gone = new Set(ids.map(String));
      const t = tx(["items", "vectors"], "readwrite");
      const s = t.objectStore("items");
      for (const i of ids) s.delete(i);
      // vector keys are `<embedder id>|<item id>`; drop every embedder's copy
      const cur = t.objectStore("vectors").openKeyCursor();
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return;
        const k = String(c.key);
        if (gone.has(k.slice(k.lastIndexOf("|") + 1))) t.objectStore("vectors").delete(c.key);
        c.continue();
      };
      await done(t);
    },
    async getVectors(e, ids) {
      const s = tx(["vectors"], "readonly").objectStore("vectors");
      const out = new Map<number, Float32Array>();
      const got = await Promise.all(ids.map((i) => req(s.get(`${e}|${i}`) as IDBRequest<ArrayBuffer | undefined>)));
      got.forEach((b, j) => {
        if (b) out.set(ids[j]!, new Float32Array(b));
      });
      return out;
    },
    async putVectors(e, m) {
      const t = tx(["vectors"], "readwrite");
      const s = t.objectStore("vectors");
      for (const [i, v] of m) s.put(v.slice().buffer, `${e}|${i}`);
      await done(t);
    },
    async getKv<T>(k: string) {
      return req(tx(["kv"], "readonly").objectStore("kv").get(k)) as Promise<T | undefined>;
    },
    async putKv(k, v) {
      const t = tx(["kv"], "readwrite");
      t.objectStore("kv").put(v, k);
      await done(t);
    },
    async clear() {
      const t = tx(["items", "vectors", "kv"], "readwrite");
      for (const n of ["items", "vectors", "kv"]) t.objectStore(n).clear();
      await done(t);
    },
    close: () => db.close(),
  };
}

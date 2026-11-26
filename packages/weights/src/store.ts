/**
 * One weight store over OPFS, Cache Storage, IndexedDB parts and memory.
 *
 * A download is written as parts of `partBytes` (default 128 MB) with a
 * meta record updated after each part. An
 * interrupted download keeps what it has; the next `get` asks the server
 * for the rest with a Range request guarded by If-Range, and starts over
 * when the server answers 200 instead of 206 or when the 206 carries a
 * different ETag or Last-Modified than the stored parts. The SHA-256 is computed as
 * the bytes stream in, and checked when the reference carries one.
 */

import { cacheBackend, idbBackend, memoryBackend, opfsBackend, type Backend, type BackendName, type Meta } from "./backends.js";
import { Sha256 } from "./sha256.js";

/** A weight file to fetch: URL, cache key, SHA-256 when known, and the weight licence. */
export interface WeightRef {
  url: string;
  /** Cache key. Default: the URL. Use `gguf:<repo>/<file>` style keys to match older caches. */
  key?: string;
  /** Lowercase hex SHA-256 of the whole file, when known. */
  sha256?: string;
  /** Weight licence, stated on first load. Required: every model reference names one. */
  licence: string;
}

/** Download progress of one file; `total` and `fraction` are null when the server sent no length. */
export interface Progress {
  key: string;
  loaded: number;
  /** null when the server sent no length; show an indeterminate bar counting MB. */
  total: number | null;
  fraction: number | null;
  /** true while existing parts are read back for a resume. */
  resuming: boolean;
}

/** Options for one `get`: a progress callback, an abort signal, and whether to resume. */
export interface GetOptions {
  onProgress?: (p: Progress) => void;
  signal?: AbortSignal;
  /** Continue an interrupted download. Default true. */
  resume?: boolean;
}

/** The error the store throws, with a `code` of "http", "sha256", "quota", "abort" or "range". */
export class WeightError extends Error {
  readonly code: "http" | "sha256" | "quota" | "abort" | "range";
  constructor(code: WeightError["code"], message: string) {
    super(message);
    this.name = "WeightError";
    this.code = code;
  }
}

/**
 * Options for `openWeightStore`: backend order, part size, fetch, the licence notice, storage
 * estimate, persistence and Web Locks.
 */
export interface StoreOptions {
  /** Backend order to try, or backend objects. Default "auto": opfs, idb, cache, memory, skipping what is missing. */
  backends?: "auto" | readonly (BackendName | Backend)[];
  partBytes?: number;
  fetch?: typeof fetch;
  /**
   * Called once per model per store with the licence line (a Hugging Face
   * repo, or the URL's folder, is one model). Default: one console.info
   * line per model per page session; pass `() => {}` to silence it.
   */
  onNotice?: (line: string) => void;
  /** navigator.storage.estimate, injectable. */
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  /** navigator.storage.persist and persisted, injectable. */
  persist?: () => Promise<boolean>;
  persisted?: () => Promise<boolean>;
  /**
   * Web Locks, so pages and workers of one origin share one download per
   * key: the second page waits, then reads what the first stored. Default
   * navigator.locks where present; false turns it off.
   */
  locks?: LocksLike | false;
  /** Page protocol; "file:" removes opfs and cache from auto. */
  protocol?: string;
  now?: () => number;
}

/** The part of navigator.locks the store uses. */
export interface LocksLike {
  request<T>(name: string, opts: { signal?: AbortSignal }, fn: () => Promise<T>): Promise<T>;
}

/** One download in flight, for a row with its own bar and cancel. */
export interface DownloadRow {
  key: string;
  url: string;
  loaded: number;
  total: number | null;
  fraction: number | null;
  /** Callers waiting on this download. */
  waiters: number;
}

/** Used and quota bytes of this origin's storage, and whether a file of a given size fits. */
export interface Estimate {
  used: number | null;
  quota: number | null;
  /** True when quota is unknown or free space is at least 1.2 times `bytes`. */
  fits(bytes: number): boolean;
}

/**
 * A weight store: get with resume, put files the user supplied, list, evict, cancel, track
 * downloads and estimate space.
 */
export interface WeightStore {
  readonly backend: Backend;
  get(ref: WeightRef, opts?: GetOptions): Promise<Blob>;
  /** Bytes of a file, fetched once and shared by every caller until `release` (one fetch feeding many session attempts). */
  once(ref: WeightRef, opts?: GetOptions): Promise<Uint8Array>;
  release(key: string): void;
  /** Store weights the user supplied as a File, Blob or buffer. Checks the SHA-256 when the ref has one. */
  put(ref: Omit<WeightRef, "url"> & { url?: string; key: string }, data: Blob | ArrayBuffer | Uint8Array): Promise<Blob>;
  has(key: string): Promise<boolean>;
  meta(key: string): Promise<Meta | null>;
  evict(key: string): Promise<void>;
  keys(): Promise<string[]>;
  estimate(): Promise<Estimate>;
  /** Downloads in flight, oldest first. */
  downloads(): DownloadRow[];
  /** Called with the rows whenever a download starts, moves or ends. Returns an unsubscribe. */
  onDownloads(fn: (rows: DownloadRow[]) => void): () => void;
  /** Stop one download for every caller waiting on it; its parts are kept for resume. False when nothing ran under the key. */
  cancel(key: string): boolean;
  /** Ask the browser not to clear this origin's storage (navigator.storage.persist). False when refused or missing. */
  persist(): Promise<boolean>;
  /** Whether the browser keeps this origin's storage; null when the browser cannot say. */
  persisted(): Promise<boolean | null>;
}

function pickBackends(opts: StoreOptions): Backend[] {
  const spec = opts.backends ?? "auto";
  const onFile = (opts.protocol ?? (globalThis as { location?: { protocol?: string } }).location?.protocol) === "file:";
  const g = globalThis as { navigator?: { storage?: { getDirectory?: unknown } }; caches?: unknown; indexedDB?: unknown };
  const names: readonly (BackendName | Backend)[] =
    spec === "auto"
      ? ([
          !onFile && typeof g.navigator?.storage?.getDirectory === "function" ? "opfs" : null,
          g.indexedDB ? "idb" : null,
          !onFile && g.caches ? "cache" : null,
          "memory",
        ].filter(Boolean) as BackendName[])
      : spec;
  return names.map((n) =>
    typeof n !== "string" ? n : n === "opfs" ? opfsBackend() : n === "idb" ? idbBackend() : n === "cache" ? cacheBackend() : memoryBackend(),
  );
}

function parseContentRange(h: string | null): { start: number; total: number | null } | null {
  const m = h && /bytes\s+(\d+)-\d+\/(\d+|\*)/i.exec(h);
  if (!m) return null;
  return { start: Number(m[1]), total: m[2] === "*" ? null : Number(m[2]) };
}

const bareTag = (t: string | null): string | null => (t ? t.replace(/^W\//, "").replace(/^"|"$/g, "") : null);

/**
 * True when a 206 comes from the file the stored parts came from: its ETag,
 * or else its Last-Modified, equals the stored one. With neither validator
 * on both sides the splice is allowed only when a known SHA-256 will check
 * the result.
 */
function sameFile(meta: Meta, res: Response, hashKnown: boolean): boolean {
  const tag = bareTag(res.headers.get("etag"));
  if (meta.etag && tag) return bareTag(meta.etag) === tag;
  const lm = res.headers.get("last-modified");
  if (meta.lastModified && lm) return meta.lastModified === lm;
  return hashKnown;
}

async function assemble(b: Backend, meta: Meta): Promise<Blob | null> {
  const parts: Blob[] = [];
  for (let n = 0; n < meta.parts.length; n++) {
    const p = await b.getPart(meta.key, n);
    if (!p || p.size !== meta.parts[n]) return null;
    parts.push(p);
  }
  return new Blob(parts);
}

/**
 * Open a store. The first backend whose meta read works is used; a backend
 * that throws on open (OPFS on file://, a blocked IndexedDB) is skipped.
 */
export async function openWeightStore(opts: StoreOptions = {}): Promise<WeightStore> {
  const partBytes = opts.partBytes ?? 128 * 1024 * 1024;
  const doFetch = opts.fetch ?? globalThis.fetch.bind(globalThis);
  const notice = opts.onNotice;
  const now = opts.now ?? (() => Date.now());
  let backend: Backend | null = null;
  for (const b of pickBackends(opts)) {
    try {
      await b.getMeta("__probe__");
      backend = b;
      break;
    } catch {
      /* next backend */
    }
  }
  if (!backend) backend = memoryBackend();
  const be = backend;
  const noticed = new Set<string>();
  interface Flight {
    p: Promise<Blob>;
    ac: AbortController;
    waiters: number;
    progress: Set<(p: Progress) => void>;
    row: DownloadRow;
  }
  const inflight = new Map<string, Flight>();
  const rowFns = new Set<(rows: DownloadRow[]) => void>();
  const rows = () => [...inflight.values()].filter((f) => !f.ac.signal.aborted).map((f) => ({ ...f.row, waiters: f.waiters }));
  const tell = () => {
    if (!rowFns.size) return;
    const r = rows();
    for (const fn of rowFns) fn(r);
  };
  const g = globalThis as { navigator?: { locks?: LocksLike; storage?: { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> } } };
  const locks = opts.locks === false ? null : (opts.locks ?? g.navigator?.locks ?? null);
  /** Run one download under the origin wide lock for its key, when Web Locks exist. */
  const locked = <T>(key: string, signal: AbortSignal, fn: () => Promise<T>): Promise<T> => {
    if (!locks) return fn();
    return locks.request(`hackbuild-weights:${key}`, { signal }, fn).catch((e: unknown) => {
      if (signal.aborted && !(e instanceof WeightError)) throw new WeightError("abort", `download of ${key} aborted while another page held it`);
      throw e;
    });
  };
  const onceMap = new Map<string, Promise<Uint8Array>>();

  const tellLicence = (key: string, licence: string) => {
    const model = modelOf(key);
    if (noticed.has(model)) return;
    noticed.add(model);
    const first = firstInSession(model);
    const line = `weights ${model}: licence ${licence}. the weights are not part of this library.`;
    if (notice) notice(line);
    else if (first) console.info(line);
  };

  const estimate = async (): Promise<Estimate> => {
    const fn =
      opts.estimate ??
      (() => (globalThis as { navigator?: { storage?: { estimate?: () => Promise<{ usage?: number; quota?: number }> } } }).navigator?.storage?.estimate?.() ?? Promise.resolve({}));
    let e: { usage?: number; quota?: number } = {};
    try {
      e = (await fn()) ?? {};
    } catch {
      /* unknown */
    }
    const used = typeof e.usage === "number" ? e.usage : null;
    const quota = typeof e.quota === "number" ? e.quota : null;
    return { used, quota, fits: (bytes) => quota === null || quota - (used ?? 0) >= 1.2 * bytes };
  };

  async function download(ref: WeightRef, key: string, o: GetOptions): Promise<Blob> {
    let meta = await be.getMeta(key);
    if (meta?.complete) {
      const blob = await assemble(be, meta);
      if (blob && (!ref.sha256 || meta.sha256 === ref.sha256.toLowerCase())) return blob;
      await be.remove(key);
      meta = null;
    }
    const resume = o.resume !== false;
    if (meta && (!resume || meta.url !== ref.url)) {
      await be.remove(key);
      meta = null;
    }
    const hash = new Sha256();
    let offset = 0;
    if (meta && meta.parts.length) {
      for (let n = 0; n < meta.parts.length; n++) {
        const p = await be.getPart(key, n);
        if (!p || p.size !== meta.parts[n]) {
          meta.parts = meta.parts.slice(0, n);
          break;
        }
        hash.update(new Uint8Array(await p.arrayBuffer()));
        offset += p.size;
        o.onProgress?.({ key, loaded: offset, total: meta.total, fraction: meta.total ? offset / meta.total : null, resuming: true });
      }
    }
    if (!meta) {
      meta = { key, url: ref.url, licence: ref.licence, total: null, parts: [], complete: false, etag: null, lastModified: null, sha256: null, updated: now() };
    }

    const headers: Record<string, string> = {};
    if (offset > 0) {
      headers["range"] = `bytes=${offset}-`;
      const validator = meta.etag ?? meta.lastModified;
      if (validator) headers["if-range"] = validator;
    }
    const init: RequestInit = { headers };
    if (o.signal) init.signal = o.signal;
    let res: Response;
    try {
      res = await doFetch(ref.url, init);
    } catch (e) {
      if (o.signal?.aborted) throw new WeightError("abort", `download of ${key} aborted`);
      throw new WeightError("http", `fetch ${ref.url} failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    if (offset > 0 && res.status === 416 && meta.total !== null && offset >= meta.total) {
      // the stored parts already hold the whole file
    } else if (offset > 0 && res.status === 416 && meta.total === null) {
      // no length was ever sent and the server has nothing past the stored bytes
      meta.total = offset;
    } else if (offset > 0 && res.status === 206 && !sameFile(meta, res, !!ref.sha256)) {
      // Hugging Face's CDN answers 206 even to a stale If-Range, so the
      // validator on the 206 is compared here; a changed file starts over
      await res.body?.cancel().catch(() => undefined);
      await be.remove(key);
      return download(ref, key, { ...o, resume: false });
    } else if (offset > 0 && res.status === 206) {
      const cr = parseContentRange(res.headers.get("content-range"));
      if (!cr || cr.start !== offset) throw new WeightError("range", `server resumed ${key} at ${cr?.start ?? "unknown"}, expected ${offset}`);
      if (cr.total !== null) meta.total = cr.total;
    } else if (res.ok) {
      if (offset > 0) {
        // the server ignored the Range or the file changed: start over
        await res.body?.cancel().catch(() => undefined);
        await be.remove(key);
        return download(ref, key, { ...o, resume: false });
      }
      const len = res.headers.get("content-length");
      meta.total = len !== null && /^\d+$/.test(len) && !res.headers.get("content-encoding") ? Number(len) : null;
    } else {
      throw new WeightError("http", `http ${res.status} for ${ref.url}`);
    }
    meta.etag = res.headers.get("etag") ?? meta.etag;
    meta.lastModified = res.headers.get("last-modified") ?? meta.lastModified;
    meta.updated = now();
    await be.putMeta(meta);

    if (meta.total !== null && offset === 0) {
      const est = await estimate();
      if (!est.fits(meta.total)) {
        throw new WeightError("quota", `not enough storage for ${key}: needs ${meta.total} bytes plus a 20 percent margin, ${(est.quota ?? 0) - (est.used ?? 0)} free`);
      }
    }

    let cur: Uint8Array[] = [];
    let curBytes = 0;
    let loaded = offset;
    const flush = async () => {
      if (!curBytes) return;
      const n = meta!.parts.length;
      await be.putPart(key, n, new Blob(cur as BlobPart[]));
      meta!.parts.push(curBytes);
      meta!.updated = now();
      await be.putMeta(meta!);
      cur = [];
      curBytes = 0;
    };
    if (res.status !== 416 && res.body) {
      const reader = res.body.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          if (o.signal?.aborted) throw new Error("aborted");
          hash.update(value);
          loaded += value.byteLength;
          // split at part boundaries so every part but the last is exactly partBytes
          let rest = value;
          while (rest.byteLength) {
            const take = Math.min(rest.byteLength, partBytes - curBytes);
            cur.push(rest.subarray(0, take));
            curBytes += take;
            rest = rest.subarray(take);
            if (curBytes >= partBytes) await flush();
          }
          o.onProgress?.({ key, loaded, total: meta.total, fraction: meta.total ? Math.min(1, loaded / meta.total) : null, resuming: false });
        }
      } catch (e) {
        await flush().catch(() => undefined);
        if (o.signal?.aborted) throw new WeightError("abort", `download of ${key} aborted at ${loaded} bytes; parts kept for resume`);
        throw new WeightError("http", `download of ${key} broke at ${loaded} bytes, parts kept for resume: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    await flush();
    if (meta.total !== null && loaded !== meta.total) {
      throw new WeightError("http", `download of ${key} ended at ${loaded} of ${meta.total} bytes; parts kept for resume`);
    }
    const digest = hash.digestHex();
    if (ref.sha256 && digest !== ref.sha256.toLowerCase()) {
      await be.remove(key);
      throw new WeightError("sha256", `sha256 of ${key} is ${digest}, expected ${ref.sha256.toLowerCase()}; the parts were removed`);
    }
    meta.total = loaded;
    meta.sha256 = digest;
    meta.complete = true;
    meta.updated = now();
    await be.putMeta(meta);
    const blob = await assemble(be, meta);
    if (!blob) throw new WeightError("http", `parts of ${key} went missing after the download`);
    return blob;
  }

  const store: WeightStore = {
    backend: be,
    get(ref, o = {}) {
      const key = ref.key ?? ref.url;
      tellLicence(key, ref.licence);
      // one fetch per key; it runs on its own controller, aborts only when
      // every waiter has aborted, and sends progress to every waiter
      let f = inflight.get(key);
      // a flight whose waiters all aborted is winding down; a new caller
      // starts a fresh download once it has settled and kept its parts
      if (!f || f.ac.signal.aborted) {
        const before = f ? f.p.then(() => undefined, () => undefined) : Promise.resolve();
        const ac = new AbortController();
        const progress = new Set<(p: Progress) => void>();
        const row: DownloadRow = { key, url: ref.url, loaded: 0, total: null, fraction: null, waiters: 0 };
        const dl: GetOptions = {
          signal: ac.signal,
          onProgress: (x) => {
            row.loaded = x.loaded;
            row.total = x.total;
            row.fraction = x.fraction;
            progress.forEach((cb) => cb(x));
            tell();
          },
        };
        if (o.resume !== undefined) dl.resume = o.resume;
        const flight: Flight = { p: null as unknown as Promise<Blob>, ac, waiters: 0, progress, row };
        flight.p = before
          .then(() => locked(key, ac.signal, () => download(ref, key, dl)))
          .finally(() => {
            if (inflight.get(key) === flight) inflight.delete(key);
            tell();
          });
        f = flight;
        inflight.set(key, f);
      }
      const fl = f;
      fl.waiters++;
      if (o.onProgress) fl.progress.add(o.onProgress);
      tell();
      return new Promise<Blob>((resolve, reject) => {
        let settled = false;
        const leave = () => {
          settled = true;
          o.signal?.removeEventListener("abort", onAbort);
          if (o.onProgress) fl.progress.delete(o.onProgress);
          fl.waiters--;
        };
        const onAbort = () => {
          if (settled) return;
          leave();
          if (fl.waiters <= 0) fl.ac.abort();
          reject(new WeightError("abort", `download of ${key} aborted; parts kept for resume`));
        };
        if (o.signal?.aborted) return onAbort();
        o.signal?.addEventListener("abort", onAbort, { once: true });
        fl.p.then(
          (b) => {
            if (settled) return;
            leave();
            resolve(b);
          },
          (e: unknown) => {
            if (settled) return;
            leave();
            reject(e);
          },
        );
      });
    },
    once(ref, o = {}) {
      const key = ref.key ?? ref.url;
      let p = onceMap.get(key);
      if (!p) {
        p = store.get(ref, o).then(async (b) => new Uint8Array(await b.arrayBuffer()));
        p.catch(() => onceMap.delete(key));
        onceMap.set(key, p);
      }
      return p;
    },
    release(key) {
      onceMap.delete(key);
    },
    async put(ref, data) {
      const key = ref.key;
      tellLicence(key, ref.licence);
      const blob = data instanceof Blob ? data : new Blob([data as BlobPart]);
      const hash = new Sha256();
      await be.remove(key);
      const meta: Meta = { key, url: ref.url ?? null, licence: ref.licence, total: blob.size, parts: [], complete: false, etag: null, lastModified: null, sha256: null, updated: now() };
      for (let off = 0, n = 0; off < blob.size || (blob.size === 0 && n === 0); off += partBytes, n++) {
        const part = blob.slice(off, off + partBytes);
        hash.update(new Uint8Array(await part.arrayBuffer()));
        if (part.size) {
          await be.putPart(key, n, part);
          meta.parts.push(part.size);
        }
        if (blob.size === 0) break;
      }
      const digest = hash.digestHex();
      if (ref.sha256 && digest !== ref.sha256.toLowerCase()) {
        await be.remove(key);
        throw new WeightError("sha256", `sha256 of ${key} is ${digest}, expected ${ref.sha256.toLowerCase()}`);
      }
      meta.sha256 = digest;
      meta.complete = true;
      await be.putMeta(meta);
      return (await assemble(be, meta))!;
    },
    async has(key) {
      return (await be.getMeta(key))?.complete === true;
    },
    meta: (key) => be.getMeta(key),
    async evict(key) {
      onceMap.delete(key);
      await be.remove(key);
    },
    keys: () => be.keys(),
    estimate,
    downloads: rows,
    onDownloads(fn) {
      rowFns.add(fn);
      return () => rowFns.delete(fn);
    },
    cancel(key) {
      const f = inflight.get(key);
      if (!f || f.ac.signal.aborted) return false;
      f.ac.abort();
      tell();
      return true;
    },
    async persist() {
      const fn = opts.persist ?? g.navigator?.storage?.persist?.bind(g.navigator.storage);
      if (!fn) return false;
      try {
        return (await fn()) === true;
      } catch {
        return false;
      }
    },
    async persisted() {
      const fn = opts.persisted ?? g.navigator?.storage?.persisted?.bind(g.navigator.storage);
      if (!fn) return null;
      try {
        return (await fn()) === true;
      } catch {
        return null;
      }
    },
  };
  return store;
}

const HF_REPO = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\//;
/** The model a weight key belongs to: its Hugging Face repo, the folder of any other URL, or a non URL key as is. */
export function modelOf(key: string): string {
  const m = HF_REPO.exec(key);
  if (m) return m[1]!;
  if (!/^https?:\/\//.test(key)) return key;
  const cut = key.split("?")[0]!.lastIndexOf("/");
  return cut > 0 ? key.slice(0, cut) : key;
}

const SEEN = Symbol.for("hackbuild.licence.seen");
/** True the first time a model is named in this page session; shared by every hackbuild package through a global symbol. */
export function firstInSession(model: string): boolean {
  const g = globalThis as unknown as Record<symbol, Set<string> | undefined>;
  const seen = (g[SEEN] ??= new Set<string>());
  if (seen.has(model)) return false;
  seen.add(model);
  return true;
}

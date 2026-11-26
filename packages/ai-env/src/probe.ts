/**
 * Capability probe. Reports what the tab can do before a runtime is chosen:
 * WebGPU adapter and shader-f16, cross origin isolation, the page protocol,
 * OPFS, how many wasm threads are safe, and device memory when the browser
 * says. Each field is measured by trying the API; nothing is assumed from
 * the user agent.
 */

export type Protocol = "file" | "http" | "https" | "other";

/** What the tab can do, as measured by `probe`, with one note per missing capability. */
export interface Env {
  /** navigator.gpu.requestAdapter() returned an adapter. */
  webgpu: boolean;
  /** The adapter lists the "shader-f16" feature. q4f16 and fp16 models need it. */
  f16: boolean;
  /** Adapter vendor and architecture when the browser exposes them, else null. */
  adapter: { vendor: string; architecture: string } | null;
  /** maxBufferSize of the adapter in bytes, or null. */
  maxBufferBytes: number | null;
  /** crossOriginIsolated; wasm threads need it. */
  isolated: boolean;
  protocol: Protocol;
  /** navigator.storage.getDirectory() resolved. Always false on file://. */
  opfs: boolean;
  /** Cache Storage (caches.open) works on this origin. */
  cacheStorage: boolean;
  /** indexedDB.open is present. */
  indexedDB: boolean;
  /** Safe wasm thread count: 1 unless isolated, then up to 4. */
  threads: number;
  /** navigator.deviceMemory in GB (rounded by the browser), or null. */
  deviceMemoryGB: number | null;
  /** Chrome built in Prompt API (globalThis.LanguageModel) is present. */
  promptApi: boolean;
  /** One line per capability that is missing, lowercase, naming the failure. */
  notes: string[];
}

/** What the probe reads. Defaults to globalThis; tests pass fakes. */
export interface ProbeGlobals {
  navigator?: unknown;
  location?: { protocol?: string };
  crossOriginIsolated?: boolean;
  caches?: unknown;
  indexedDB?: unknown;
  LanguageModel?: unknown;
}

/** Options for `probe`: the globals to read, the timeout for adapter and OPFS calls, and the thread cap. */
export interface ProbeOptions {
  globals?: ProbeGlobals;
  /** Give up on requestAdapter or getDirectory after this many ms. Default 3000. */
  timeoutMs?: number;
  /** Upper bound for threads when isolated. Default 4. */
  maxThreads?: number;
}

interface GpuAdapterLike {
  features?: { has(name: string): boolean };
  limits?: { maxBufferSize?: number };
  info?: { vendor?: string; architecture?: string };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | undefined> {
  return new Promise((resolve) => {
    const t = setTimeout(() => resolve(undefined), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      () => {
        clearTimeout(t);
        resolve(undefined);
      },
    );
  });
}

/** Maps a `location.protocol` string to "file", "http", "https" or "other". */
export function protocolOf(proto: string | undefined): Protocol {
  if (proto === "file:") return "file";
  if (proto === "http:") return "http";
  if (proto === "https:") return "https";
  return "other";
}

/**
 * Measures what the tab can do: WebGPU and shader-f16, cross origin isolation, OPFS, Cache Storage,
 * IndexedDB, safe wasm threads, device memory and the Prompt API.
 */
export async function probe(opts: ProbeOptions = {}): Promise<Env> {
  const g = (opts.globals ?? (globalThis as unknown as ProbeGlobals)) as ProbeGlobals;
  const timeoutMs = opts.timeoutMs ?? 3000;
  const nav = (g.navigator ?? {}) as {
    gpu?: { requestAdapter(o?: unknown): Promise<GpuAdapterLike | null> };
    storage?: { getDirectory?: () => Promise<unknown> };
    hardwareConcurrency?: number;
    deviceMemory?: number;
  };
  const notes: string[] = [];
  const protocol = protocolOf(g.location?.protocol);

  let webgpu = false;
  let f16 = false;
  let adapterInfo: Env["adapter"] = null;
  let maxBufferBytes: number | null = null;
  if (nav.gpu && typeof nav.gpu.requestAdapter === "function") {
    const adapter = await withTimeout(nav.gpu.requestAdapter(), timeoutMs);
    if (adapter) {
      webgpu = true;
      f16 = adapter.features?.has("shader-f16") === true;
      if (adapter.info) adapterInfo = { vendor: adapter.info.vendor ?? "", architecture: adapter.info.architecture ?? "" };
      maxBufferBytes = adapter.limits?.maxBufferSize ?? null;
      if (!f16) notes.push("webgpu adapter has no shader-f16. q4f16 and fp16 models fall back to f32 or wasm.");
    } else notes.push("no webgpu adapter. models run on wasm.");
  } else notes.push("navigator.gpu is missing. models run on wasm.");

  const isolated = g.crossOriginIsolated === true;
  const maxThreads = opts.maxThreads ?? 4;
  const cores = typeof nav.hardwareConcurrency === "number" ? nav.hardwareConcurrency : 1;
  const threads = isolated ? Math.max(1, Math.min(maxThreads, cores)) : 1;
  if (!isolated) notes.push("page is not cross origin isolated. wasm runs on one thread.");

  let opfs = false;
  if (protocol === "file") notes.push("file:// page. opfs is unavailable, weights go to indexeddb parts.");
  else if (nav.storage && typeof nav.storage.getDirectory === "function") {
    opfs = (await withTimeout(nav.storage.getDirectory().then(() => true), timeoutMs)) === true;
    if (!opfs) notes.push("opfs getDirectory failed.");
  } else notes.push("opfs is missing.");

  let cacheStorage = false;
  // keys() answers without creating a cache, so a probe leaves nothing behind
  const caches = g.caches as { keys?: () => Promise<unknown> } | undefined;
  if (caches && typeof caches.keys === "function" && protocol !== "file") {
    cacheStorage = (await withTimeout(caches.keys().then(() => true), timeoutMs)) === true;
  }
  const idb = !!g.indexedDB && typeof (g.indexedDB as { open?: unknown }).open === "function";
  if (!idb) notes.push("indexeddb is missing. weights stay in memory for this tab only.");

  const deviceMemoryGB = typeof nav.deviceMemory === "number" ? nav.deviceMemory : null;
  const promptApi = g.LanguageModel !== undefined && g.LanguageModel !== null;

  return {
    webgpu,
    f16,
    adapter: adapterInfo,
    maxBufferBytes,
    isolated,
    protocol,
    opfs,
    cacheStorage,
    indexedDB: idb,
    threads,
    deviceMemoryGB,
    promptApi,
    notes,
  };
}

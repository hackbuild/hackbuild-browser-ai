/**
 * File:// safe loading of ES modules and workers.
 *
 * importEsm: plain import() first when nothing needs patching and the page
 * is served over http(s); else fetch the text, patch it, import it from a
 * Blob URL, then from a base64 data: URL (FERRULE importWllama). Each URL in
 * `urls` is tried in order, so a CDN fallback list is one call.
 *
 * spawnWorker: the worker ladder from the plan, written once. Rungs are
 * module-blob, classic-blob and inline (the source runs on the page with a
 * worker shaped shim). A rung counts once the worker posts the ready
 * handshake appended after the source, so a worker whose top level code
 * throws moves to the next rung instead of hanging.
 */

import { absolutizeImports, rewriteSource, textToDataUrl, toClassicWorker, type Rewrite } from "./source.js";

export type Importer = (specifier: string) => Promise<unknown>;

export interface LoadDeps {
  fetch?: typeof fetch;
  /** Defaults to a native dynamic import. Tests pass a fake. */
  importer?: Importer;
  createObjectURL?: (b: Blob) => string;
  revokeObjectURL?: (u: string) => void;
  protocol?: string;
}

export interface ImportEsmOptions extends LoadDeps {
  /** Rewrites applied to the fetched text. Missing matches are reported through onMissed. */
  rewrites?: readonly Rewrite[];
  /** Swap module workers for classic workers in the source. Default: true on file://. */
  classicWorkers?: boolean;
  /** Free form patch after the rewrites. */
  patch?: (src: string, url: string) => string;
  onMissed?: (missed: { index: number; pattern: string }[], url: string) => void;
  /** Log of every attempt, for status UIs. */
  onAttempt?: (a: { url: string; via: "import" | "blob" | "data"; ok: boolean; error?: string }) => void;
}

export class LoadError extends Error {
  readonly attempts: { url: string; via: string; error: string }[];
  constructor(message: string, attempts: { url: string; via: string; error: string }[]) {
    super(message);
    this.name = "LoadError";
    this.attempts = attempts;
  }
}

const nativeImport: Importer = (s) => import(/* @vite-ignore */ s);

function errText(e: unknown): string {
  return e instanceof Error ? `${e.name}: ${e.message}` : String(e);
}

export async function importEsm<T = unknown>(urls: string | readonly string[], opts: ImportEsmOptions = {}): Promise<T> {
  const list = typeof urls === "string" ? [urls] : urls;
  const importer = opts.importer ?? nativeImport;
  const doFetch = opts.fetch ?? globalThis.fetch?.bind(globalThis);
  const protocol = opts.protocol ?? (globalThis as { location?: { protocol?: string } }).location?.protocol ?? "";
  const onFile = protocol === "file:";
  const classic = opts.classicWorkers ?? onFile;
  const needsPatch = classic || !!opts.patch || (opts.rewrites?.length ?? 0) > 0;
  const mkUrl = opts.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const attempts: { url: string; via: string; error: string }[] = [];
  const note = (url: string, via: "import" | "blob" | "data", ok: boolean, error?: string) => {
    opts.onAttempt?.(error === undefined ? { url, via, ok } : { url, via, ok, error });
    if (!ok) attempts.push({ url, via, error: error ?? "" });
  };

  for (const url of list) {
    if (!needsPatch) {
      try {
        const m = (await importer(url)) as T;
        note(url, "import", true);
        return m;
      } catch (e) {
        note(url, "import", false, errText(e));
      }
    }
    if (!doFetch) continue;
    let src: string;
    try {
      const res = await doFetch(url);
      if (!res.ok) throw new Error(`http ${res.status}`);
      src = await res.text();
    } catch (e) {
      note(url, "blob", false, `fetch failed: ${errText(e)}`);
      continue;
    }
    if (opts.rewrites?.length) {
      const r = rewriteSource(src, opts.rewrites);
      if (r.missed.length) opts.onMissed?.(r.missed, url);
      src = r.text;
    }
    if (classic) src = toClassicWorker(src).text;
    if (opts.patch) src = opts.patch(src, url);
    src = absolutizeImports(src, url);
    try {
      const blobUrl = mkUrl(new Blob([src], { type: "text/javascript" }));
      const m = (await importer(blobUrl)) as T;
      note(url, "blob", true);
      return m;
    } catch (e) {
      note(url, "blob", false, errText(e));
    }
    try {
      const m = (await importer(textToDataUrl(src))) as T;
      note(url, "data", true);
      return m;
    } catch (e) {
      note(url, "data", false, errText(e));
    }
  }
  throw new LoadError(`could not import ${list.join(", ")}`, attempts);
}

export type WorkerRung = "module-blob" | "classic-blob" | "inline";

/** The parts of Worker the ladder uses. A real Worker satisfies it. */
export interface WorkerLike {
  postMessage(msg: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  addEventListener(type: "message" | "error", fn: (ev: { data?: unknown; message?: string }) => void): void;
  removeEventListener(type: "message" | "error", fn: (ev: { data?: unknown; message?: string }) => void): void;
}

export interface SpawnOptions {
  prefer?: readonly WorkerRung[];
  /** Applied to the worker source before spawning. */
  rewrites?: readonly Rewrite[];
  onMissed?: (missed: { index: number; pattern: string }[]) => void;
  /** Code placed before the source. */
  prelude?: string;
  /** Base URL for relative importScripts and imports in the source. */
  base?: string;
  /** How long to wait for the handshake. Default 4000 ms. */
  readyMs?: number;
  /** Worker constructor. Default globalThis.Worker. */
  Worker?: new (url: string, opts?: { type?: "module" | "classic"; name?: string }) => WorkerLike;
  createObjectURL?: (b: Blob) => string;
  fetch?: typeof fetch;
  name?: string;
}

export interface Spawned {
  worker: WorkerLike;
  rung: WorkerRung;
  failures: { rung: WorkerRung; error: string }[];
}

const READY = "__aiEnvReady";

function handshake(): string {
  return `try{self.postMessage({${READY}:1})}catch(e){}\n`;
}

/**
 * A worker shaped object that runs the source on the page. Messages are
 * delivered on a later task so ordering matches a real worker. Used only as
 * the last rung: it blocks the page while the source computes.
 */
export class InlineWorker implements WorkerLike {
  private readonly pageListeners = new Map<string, Set<(ev: { data?: unknown; message?: string }) => void>>();
  private readonly innerListeners = new Set<(ev: { data: unknown }) => void>();
  private innerOnMessage: ((ev: { data: unknown }) => void) | null = null;
  private dead = false;

  constructor(src: string) {
    const self = {
      postMessage: (data: unknown) => this.emit("message", { data }),
      addEventListener: (type: string, fn: (ev: { data: unknown }) => void) => {
        if (type === "message") this.innerListeners.add(fn);
      },
      removeEventListener: (type: string, fn: (ev: { data: unknown }) => void) => {
        if (type === "message") this.innerListeners.delete(fn);
      },
      set onmessage(fn: ((ev: { data: unknown }) => void) | null) {
        inner.innerOnMessage = fn;
      },
      get onmessage() {
        return inner.innerOnMessage;
      },
      close: () => this.terminate(),
      importScripts: () => {
        throw new Error("importScripts is not available in an inline worker");
      },
    };
    const inner = this;
    queueMicrotask(() => {
      try {
        // The worker source is code the caller chose to run; this is the inline rung of the ladder.
        new Function("self", "postMessage", "importScripts", src)(self, self.postMessage, self.importScripts);
      } catch (e) {
        this.emit("error", { message: errText(e) });
      }
    });
  }

  private emit(type: "message" | "error", ev: { data?: unknown; message?: string }): void {
    if (this.dead) return;
    setTimeout(() => {
      if (this.dead) return;
      for (const fn of this.pageListeners.get(type) ?? []) fn(ev);
    }, 0);
  }

  postMessage(data: unknown): void {
    if (this.dead) return;
    setTimeout(() => {
      if (this.dead) return;
      const ev = { data };
      this.innerOnMessage?.(ev);
      for (const fn of this.innerListeners) fn(ev);
    }, 0);
  }

  terminate(): void {
    this.dead = true;
  }

  addEventListener(type: "message" | "error", fn: (ev: { data?: unknown; message?: string }) => void): void {
    let s = this.pageListeners.get(type);
    if (!s) this.pageListeners.set(type, (s = new Set()));
    s.add(fn);
  }

  removeEventListener(type: "message" | "error", fn: (ev: { data?: unknown; message?: string }) => void): void {
    this.pageListeners.get(type)?.delete(fn);
  }
}

function waitReady(w: WorkerLike, ms: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = (err?: string) => {
      clearTimeout(t);
      w.removeEventListener("message", onMsg);
      w.removeEventListener("error", onErr);
      if (err === undefined) resolve();
      else reject(new Error(err));
    };
    const onMsg = (ev: { data?: unknown }) => {
      const d = ev.data as Record<string, unknown> | null | undefined;
      if (d && typeof d === "object" && d[READY] === 1) done();
    };
    const onErr = (ev: { message?: string }) => done(ev.message || "worker error event");
    const t = setTimeout(() => done(`no ready handshake in ${ms} ms`), ms);
    w.addEventListener("message", onMsg);
    w.addEventListener("error", onErr);
  });
}

/**
 * Spawn a worker from source text or a URL to source text, walking the
 * rungs in `prefer` (default module-blob, classic-blob, inline). The ready
 * handshake message is swallowed; the caller sees only its own messages.
 */
export async function spawnWorker(source: string | { url: string }, opts: SpawnOptions = {}): Promise<Spawned> {
  let src: string;
  if (typeof source === "string") src = source;
  else {
    const f = opts.fetch ?? globalThis.fetch.bind(globalThis);
    const res = await f(source.url);
    if (!res.ok) throw new LoadError(`worker source http ${res.status}`, [{ url: source.url, via: "fetch", error: `http ${res.status}` }]);
    src = await res.text();
  }
  if (opts.rewrites?.length) {
    const r = rewriteSource(src, opts.rewrites);
    if (r.missed.length) opts.onMissed?.(r.missed);
    src = r.text;
  }
  const base = opts.base ?? (typeof source === "string" ? undefined : source.url);
  const prefer = opts.prefer ?? ["module-blob", "classic-blob", "inline"];
  const readyMs = opts.readyMs ?? 4000;
  const W = opts.Worker ?? (globalThis as { Worker?: SpawnOptions["Worker"] }).Worker;
  const mkUrl = opts.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const failures: Spawned["failures"] = [];
  const prelude = opts.prelude ? opts.prelude + "\n" : "";

  for (const rung of prefer) {
    let w: WorkerLike | undefined;
    try {
      if (rung === "inline") {
        w = new InlineWorker(prelude + src + "\n" + handshake());
      } else {
        if (!W) throw new Error("Worker is not defined");
        let body = src;
        if (rung === "classic-blob") {
          body = toClassicWorker(body).text;
        } else if (base) body = absolutizeImports(body, base);
        const url = mkUrl(new Blob([prelude + body + "\n" + handshake()], { type: "text/javascript" }));
        const o: { type?: "module" | "classic"; name?: string } = { type: rung === "module-blob" ? "module" : "classic" };
        if (opts.name) o.name = opts.name;
        w = new W(url, o);
      }
      await waitReady(w, readyMs);
      return { worker: w, rung, failures };
    } catch (e) {
      w?.terminate();
      failures.push({ rung, error: errText(e) });
    }
  }
  throw new LoadError(
    `no worker rung started: ${failures.map((f) => `${f.rung} (${f.error})`).join("; ")}`,
    failures.map((f) => ({ url: "", via: f.rung, error: f.error })),
  );
}

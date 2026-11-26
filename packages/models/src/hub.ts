/**
 * The hub: routes a capability request to a record, walks the record's
 * ladder through the provider's factory, keeps loaded models under a memory
 * budget (idle models are disposed oldest first), and serializes GPU work.
 *
 * exclusive(resource, fn, { priority }) is a queue with one job per
 * resource at a time, higher priority first, FIFO within a priority.
 * chain(name) is a plain serial queue.
 * Loads that run on webgpu go through exclusive("gpu") too, so a model
 * never compiles shaders while another one runs.
 *
 * run(l, fn, { minIntervalMs, idleOnly, frameBudgetMs }) schedules heavy
 * inference around rendering (a webgpu model shares the GPU with
 * the scene and stutters it, which JS profiling does not show): a minimum
 * gap between starts per model, waiting for an idle callback, and waiting
 * while recent frames are over budget (`reportFrame(ms)` from the render
 * loop). `busy()` and `onBusy` drive a model busy indicator.
 */

import type { Env } from "@hackbuild/ai-env";
import { ladderFor, walkLadder, type Capability, type LadderFailure, type ModelRecord, type Provider, type Rung } from "./record.js";
import { createRegistry, type Registry, type SizeClass } from "./registry.js";
import { firstInSession } from "./pinning.js";

/**
 * What a factory gets for one rung: the record, the rung, the env, the abort signal, the hub,
 * whether the rung is the last, and a progress reporter.
 */
export interface FactoryContext {
  record: ModelRecord;
  rung: Rung;
  env: Env | undefined;
  signal: AbortSignal | undefined;
  hub: Hub;
  /** True on the ladder's last rung: a failure here exhausts it, so a factory frees what it cached for the record. */
  last: boolean;
  /** Tell every `hub.onLoad` listener how this load moves: fetch, then compile, then warm. */
  report(phase: "fetch" | "compile" | "warm", fraction: number | null, file?: string): void;
}

/** A step of a load: fetch, compile, warm, ready or failed. */
export type LoadPhase = "fetch" | "compile" | "warm" | "ready" | "failed";

/** One step of a load, heard by every listener; one model keeps one id across ladder rungs. */
export interface LoadEvent {
  id: string;
  phase: LoadPhase;
  /** 0 to 1, or null while unknown. */
  fraction: number | null;
  /** The file being fetched, when the factory names one. */
  file?: string;
  /** Index of the ladder rung the event belongs to. */
  rung: number;
  /** For "failed": the reason. */
  error?: string;
}

/** Builds a runtime object for one rung. Throw to move to the next rung. */
export type Factory<T = unknown> = (ctx: FactoryContext) => Promise<T>;

/**
 * A model the hub loaded: its id, record, the rung that worked, the runtime object and the rungs
 * that failed first.
 */
export interface Loaded<T = unknown> {
  readonly id: string;
  readonly record: ModelRecord;
  readonly rung: Rung;
  readonly value: T;
  /** Rungs that failed before this one loaded. */
  readonly failures: LadderFailure[];
}

/** Options for `hub.use`: size class, largest size, commercial use, abort signal and load priority. */
export interface UseOptions {
  size?: SizeClass;
  maxMB?: number;
  commercial?: boolean;
  signal?: AbortSignal;
  /** Priority of the load in the gpu queue. */
  priority?: number;
}

/** Priority and abort signal for a job in an exclusive queue. */
export interface ExclusiveOptions {
  priority?: number;
  signal?: AbortSignal;
}

/**
 * Scheduling for one `hub.run`: least gap between starts, idle only, a frame budget and whether to
 * wait or skip.
 */
export interface RunOptions extends ExclusiveOptions {
  /** Least ms between the starts of two runs of this model. Default 0. */
  minIntervalMs?: number;
  /** Start only from an idle callback (requestIdleCallback where present). */
  idleOnly?: boolean;
  /** Start only while the mean of the last reported frame times is at most this many ms. */
  frameBudgetMs?: number;
  /** Give up waiting for the frame budget after this many ms and run anyway. Default 1000. */
  maxDeferMs?: number;
  /** "wait" (default) delays the run until it is due; "skip" rejects with HubError code "skipped" instead. */
  when?: "wait" | "skip";
}

/** Clock and waits the scheduler uses; tests inject fakes. */
export interface HubTimers {
  sleep(ms: number): Promise<void>;
  idle(): Promise<void>;
}

/**
 * One loaded model as the hub reports it: id, provider, device, size, references, last use and runs
 * in flight.
 */
export interface HubStatus {
  id: string;
  provider: Provider;
  device: Rung["device"];
  sizeMB: number | null;
  refs: number;
  lastUsed: number;
  /** Runs in flight or waiting. */
  busy: number;
}

/**
 * A model hub: routes a capability to a record, loads it through a provider factory, keeps loaded
 * models under a memory budget and queues GPU work.
 */
export interface Hub {
  readonly registry: Registry;
  readonly env: Env | undefined;
  provide<T>(provider: Provider, factory: Factory<T>): void;
  /** Load (or reuse) the model for a capability or record id. */
  use<T = unknown>(what: Capability | { id: string }, opts?: UseOptions): Promise<Loaded<T>>;
  release(l: Loaded): void;
  unload(id: string): Promise<void>;
  /** Run inference on a loaded model; webgpu models take the gpu lock. */
  run<T, R>(l: Loaded<T>, fn: (value: T) => Promise<R>, opts?: RunOptions): Promise<R>;
  /** Report one rendered frame's time in ms; the last 30 feed `frameBudgetMs`. */
  reportFrame(ms: number): void;
  /** Mean of the reported frame times, or 0 with none. */
  frameMs(): number;
  /** Runs in flight or waiting, for one model id or all. */
  busy(id?: string): number;
  /** Called with the total busy count whenever it changes. Returns an unsubscribe. */
  onBusy(fn: (count: number) => void): () => void;
  exclusive<R>(resource: string, fn: () => Promise<R>, opts?: ExclusiveOptions): Promise<R>;
  /** Called with every load step of every model (fetch, compile, warm, ready, failed). Returns an unsubscribe. */
  onLoad(fn: (e: LoadEvent) => void): () => void;
  chain(name: string): <R>(fn: () => Promise<R>) => Promise<R>;
  residentMB(): number;
  status(): HubStatus[];
}

/** The error the hub throws, with a `code` of "no-route", "no-provider", "budget", "abort" or "skipped". */
export class HubError extends Error {
  readonly code: "no-route" | "no-provider" | "budget" | "abort" | "skipped";
  constructor(code: HubError["code"], message: string) {
    super(message);
    this.name = "HubError";
    this.code = code;
  }
}

/**
 * Options for `createHub`: registry, env, memory budget, the stub switch, clock, timers and the
 * licence notice.
 */
export interface HubOptions {
  registry?: Registry;
  env?: Env;
  /** Memory budget for resident models, in MB. Default no limit. */
  budgetMB?: number;
  /** Route every request to the stub provider (the `?stub` switch). */
  stub?: boolean;
  now?: () => number;
  timers?: HubTimers;
  /**
   * Called once per record, before its first load, with the weight licence
   * line. Default: one console.info line per model per page session; pass
   * `() => {}` to silence it. Every model reference states its licence.
   */
  onLicence?: (line: string, record: ModelRecord) => void;
}

function defaultTimers(): HubTimers {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => unknown };
  return {
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    idle: () => new Promise((r) => (g.requestIdleCallback ? void g.requestIdleCallback(() => r(), { timeout: 1000 }) : void setTimeout(r, 0))),
  };
}

interface Entry {
  loaded: Loaded;
  refs: number;
  lastUsed: number;
}

interface Waiter {
  priority: number;
  seq: number;
  start: () => void;
}

/** A record that serves `capability` from the stub provider, with no weights. */
export function stubRecord(capability: Capability): ModelRecord {
  return {
    id: `stub:${capability}`,
    provides: [capability],
    provider: "stub",
    source: {},
    sizeMB: 0,
    sizeSource: "measured",
    ladder: [{ device: "cpu" }],
    licence: "none, the stub has no weights",
    commercial: true,
    place: "main",
  };
}

/**
 * A stub factory from per capability builders. Every capability package
 * exports its own builder (chat echoes, depth returns a ramp, transcribe
 * returns fixed text) and an app registers them once:
 * `hub.provide("stub", stubFactory({ chat: () => echoChat(), depth: () => rampDepth() }))`.
 */
export function stubFactory(builders: Record<string, (record: ModelRecord) => unknown>): Factory {
  return async ({ record }) => {
    const cap = record.provides[0]!;
    const b = builders[cap];
    if (!b) throw new Error(`no stub for ${cap}`);
    return b(record);
  };
}

/** Creates a model hub over a registry, with the memory budget and licence notice from `opts`. */
export function createHub(opts: HubOptions = {}): Hub {
  const registry = opts.registry ?? createRegistry();
  const now = opts.now ?? (() => Date.now());
  const budget = opts.budgetMB ?? Infinity;
  const told = new Set<string>();
  const factories = new Map<Provider, Factory>();
  const entries = new Map<string, Entry>();
  const loading = new Map<string, Promise<Loaded>>();
  const queues = new Map<string, { busy: boolean; waiting: Waiter[] }>();
  const chains = new Map<string, Promise<unknown>>();
  let seq = 0;
  const timers = opts.timers ?? defaultTimers();
  const frames: number[] = [];
  const lastStart = new Map<string, number>();
  const busyBy = new Map<string, number>();
  const busyFns = new Set<(n: number) => void>();
  const loadFns = new Set<(e: LoadEvent) => void>();
  const emitLoad = (e: LoadEvent) => {
    for (const fn of loadFns) {
      try {
        fn(e);
      } catch {
        /* a listener's throw never breaks a load */
      }
    }
  };
  const busyTotal = () => [...busyBy.values()].reduce((a, b) => a + b, 0);
  const bump = (id: string, d: number) => {
    busyBy.set(id, (busyBy.get(id) ?? 0) + d);
    if (!busyBy.get(id)) busyBy.delete(id);
    const n = busyTotal();
    for (const f of busyFns) f(n);
  };
  const frameMs = () => (frames.length ? frames.reduce((a, b) => a + b, 0) / frames.length : 0);
  const skip = (id: string, why: string) => new HubError("skipped", `${id}: run skipped, ${why}`);
  /** Wait (or refuse) until a scheduled run may start. */
  async function due(id: string, ro: RunOptions): Promise<void> {
    const mode = ro.when ?? "wait";
    if (ro.minIntervalMs) {
      const gap = (lastStart.get(id) ?? -Infinity) + ro.minIntervalMs - now();
      if (gap > 0) {
        if (mode === "skip") throw skip(id, `next start in ${Math.ceil(gap)} ms`);
        await timers.sleep(gap);
      }
    }
    if (ro.frameBudgetMs !== undefined && frameMs() > ro.frameBudgetMs) {
      if (mode === "skip") throw skip(id, `frames at ${frameMs().toFixed(1)} ms over the ${ro.frameBudgetMs} ms budget`);
      const until = now() + (ro.maxDeferMs ?? 1000);
      while (frameMs() > ro.frameBudgetMs && now() < until) {
        if (ro.signal?.aborted) throw new HubError("abort", `${id}: run aborted while waiting for the frame budget`);
        await timers.sleep(16);
      }
    }
    if (ro.idleOnly) await timers.idle();
    if (ro.signal?.aborted) throw new HubError("abort", `${id}: run aborted before it started`);
  }

  const residentMB = () => [...entries.values()].reduce((a, e) => a + (e.loaded.record.sizeMB ?? 0), 0);

  async function dispose(e: Entry) {
    entries.delete(e.loaded.id);
    const v = e.loaded.value as { dispose?: () => unknown; unload?: () => unknown } | null;
    try {
      await (v?.dispose?.() ?? v?.unload?.());
    } catch {
      /* a failed dispose still frees the slot */
    }
  }

  async function makeRoom(mb: number) {
    if (residentMB() + mb <= budget) return;
    const idle = [...entries.values()].filter((e) => e.refs === 0).sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of idle) {
      if (residentMB() + mb <= budget) break;
      await dispose(e);
    }
    if (residentMB() + mb > budget) {
      throw new HubError("budget", `needs ${mb} MB, ${residentMB()} MB resident in use, budget ${budget} MB. release a model first.`);
    }
  }

  const hub: Hub = {
    registry,
    env: opts.env,
    provide(provider, factory) {
      factories.set(provider, factory as Factory);
    },
    async use<T>(what: Capability | { id: string }, o: UseOptions = {}): Promise<Loaded<T>> {
      let rec: ModelRecord | undefined;
      if (typeof what === "object") rec = registry.get(what.id);
      else if (opts.stub) rec = stubRecord(what);
      else {
        const q: Parameters<Registry["route"]>[0] = { provides: what };
        if (opts.env) q.env = opts.env;
        if (o.size) q.size = o.size;
        if (o.commercial) q.commercial = true;
        const free = budget - [...entries.values()].filter((e) => e.refs > 0).reduce((a, e) => a + (e.loaded.record.sizeMB ?? 0), 0);
        q.maxMB = Math.min(o.maxMB ?? Infinity, free);
        rec = registry.route(q);
      }
      if (!rec) throw new HubError("no-route", `no model for ${typeof what === "string" ? what : what.id} fits this device and budget`);
      const record = rec;
      const have = entries.get(record.id);
      if (have) {
        have.refs++;
        have.lastUsed = now();
        return have.loaded as Loaded<T>;
      }
      let p = loading.get(record.id);
      if (!p) {
        if (!told.has(record.id)) {
          told.add(record.id);
          const rev = record.source.revision ? ` at ${record.source.revision.slice(0, 7)}` : "";
          const line = `model ${record.id}${rev}: weight licence ${record.licence}. the weights are not part of this library.`;
          const first = firstInSession(record.source.repo ?? record.source.modelId ?? record.source.url ?? record.id);
          if (opts.onLicence) opts.onLicence(line, record);
          else if (first) console.info(line);
        }
        const factory = factories.get(record.provider);
        if (!factory) throw new HubError("no-provider", `no factory for provider ${record.provider}; call hub.provide("${record.provider}", ...)`);
        p = (async () => {
          await makeRoom(record.sizeMB ?? 0);
          const { rungs } = ladderFor(record, opts.env);
          let at = 0;
          let res: Awaited<ReturnType<typeof walkLadder<unknown>>>;
          try {
            res = await walkLadder(record.id, rungs, (rung, index) => {
            if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
            at = index;
            emitLoad({ id: record.id, phase: "fetch", fraction: null, rung: index });
            const report = (phase: "fetch" | "compile" | "warm", fraction: number | null, file?: string) =>
              emitLoad({ id: record.id, phase, fraction, rung: index, ...(file !== undefined ? { file } : {}) });
            const go = () => factory({ record, rung, env: opts.env, signal: o.signal, hub, last: rung === rungs[rungs.length - 1], report });
            const eo: ExclusiveOptions = { priority: o.priority ?? 0 };
            if (o.signal) eo.signal = o.signal;
            return rung.device === "webgpu" ? hub.exclusive("gpu", go, eo) : go();
            });
          } catch (e) {
            emitLoad({ id: record.id, phase: "failed", fraction: null, rung: at, error: e instanceof Error ? e.message : String(e) });
            throw e;
          }
          emitLoad({ id: record.id, phase: "ready", fraction: 1, rung: at });
          const loaded: Loaded = { id: record.id, record, rung: res.rung, value: res.value, failures: res.failures };
          entries.set(record.id, { loaded, refs: 0, lastUsed: now() });
          return loaded;
        })().finally(() => loading.delete(record.id));
        loading.set(record.id, p);
      }
      const loaded = await p;
      const e = entries.get(loaded.id)!;
      e.refs++;
      e.lastUsed = now();
      return loaded as Loaded<T>;
    },
    release(l) {
      const e = entries.get(l.id);
      if (e && e.refs > 0) {
        e.refs--;
        e.lastUsed = now();
      }
    },
    async unload(id) {
      const e = entries.get(id);
      if (e) await dispose(e);
    },
    async run(l, fn, ro = {}) {
      const e = entries.get(l.id);
      if (e) e.lastUsed = now();
      const scheduled = !!(ro.minIntervalMs || ro.idleOnly || ro.frameBudgetMs !== undefined);
      if (scheduled && ro.when === "skip" && (busyBy.get(l.id) ?? 0) > 0) throw skip(l.id, "a run of this model is in flight");
      bump(l.id, 1);
      try {
        if (scheduled) await due(l.id, ro);
        lastStart.set(l.id, now());
        const eo: ExclusiveOptions = {};
        if (ro.priority !== undefined) eo.priority = ro.priority;
        if (ro.signal) eo.signal = ro.signal;
        return await (l.rung.device === "webgpu" ? hub.exclusive("gpu", () => fn(l.value), eo) : fn(l.value));
      } finally {
        bump(l.id, -1);
      }
    },
    reportFrame(ms) {
      frames.push(ms);
      if (frames.length > 30) frames.shift();
    },
    frameMs,
    busy: (id) => (id === undefined ? busyTotal() : (busyBy.get(id) ?? 0)),
    onBusy(fn) {
      busyFns.add(fn);
      return () => busyFns.delete(fn);
    },
    onLoad(fn) {
      loadFns.add(fn);
      return () => loadFns.delete(fn);
    },
    exclusive<R>(resource: string, fn: () => Promise<R>, eo: ExclusiveOptions = {}): Promise<R> {
      let q = queues.get(resource);
      if (!q) queues.set(resource, (q = { busy: false, waiting: [] }));
      const queue = q;
      return new Promise<R>((resolve, reject) => {
        const w: Waiter = {
          priority: eo.priority ?? 0,
          seq: seq++,
          start: () => {
            if (eo.signal?.aborted) {
              reject(new HubError("abort", `${resource} job aborted before it started`));
              next();
              return;
            }
            // a synchronous throw in fn must still release the queue
            Promise.resolve().then(fn).then(resolve, reject).finally(next);
          },
        };
        const next = () => {
          queue.busy = false;
          const n = queue.waiting.shift();
          if (n) {
            queue.busy = true;
            n.start();
          }
        };
        if (!queue.busy) {
          queue.busy = true;
          w.start();
        } else {
          queue.waiting.push(w);
          queue.waiting.sort((a, b) => b.priority - a.priority || a.seq - b.seq);
          eo.signal?.addEventListener("abort", () => {
            const i = queue.waiting.indexOf(w);
            if (i >= 0) {
              queue.waiting.splice(i, 1);
              reject(new HubError("abort", `${resource} job aborted while waiting`));
            }
          });
        }
      });
    },
    chain(name) {
      return <R>(fn: () => Promise<R>): Promise<R> => {
        const prev = chains.get(name) ?? Promise.resolve();
        const p = prev.then(fn, fn);
        chains.set(
          name,
          p.then(
            () => undefined,
            () => undefined,
          ),
        );
        return p;
      };
    },
    residentMB,
    status() {
      return [...entries.values()].map((e) => ({
        id: e.loaded.id,
        provider: e.loaded.record.provider,
        device: e.loaded.rung.device,
        sizeMB: e.loaded.record.sizeMB,
        refs: e.refs,
        lastUsed: e.lastUsed,
        busy: busyBy.get(e.loaded.id) ?? 0,
      }));
    },
  };
  return hub;
}

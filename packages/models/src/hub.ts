/**
 * The hub: routes a capability request to a record, walks the record's
 * ladder through the provider's factory, keeps loaded models under a memory
 * budget (idle models are disposed oldest first), and serializes GPU work.
 *
 * exclusive(resource, fn, { priority }) is the MORTISE queue: one job per
 * resource at a time, higher priority first, FIFO within a priority.
 * chain(name) is the HACKLE vlmChain: a plain serial queue.
 * Loads that run on webgpu go through exclusive("gpu") too, so a model
 * never compiles shaders while another one runs.
 */

import type { Env } from "@hackbuild/ai-env";
import { ladderFor, walkLadder, type Capability, type LadderFailure, type ModelRecord, type Provider, type Rung } from "./record.js";
import { createRegistry, type Registry, type SizeClass } from "./registry.js";

export interface FactoryContext {
  record: ModelRecord;
  rung: Rung;
  env: Env | undefined;
  signal: AbortSignal | undefined;
  hub: Hub;
}

/** Builds a runtime object for one rung. Throw to move to the next rung. */
export type Factory<T = unknown> = (ctx: FactoryContext) => Promise<T>;

export interface Loaded<T = unknown> {
  readonly id: string;
  readonly record: ModelRecord;
  readonly rung: Rung;
  readonly value: T;
  /** Rungs that failed before this one loaded. */
  readonly failures: LadderFailure[];
}

export interface UseOptions {
  size?: SizeClass;
  maxMB?: number;
  commercial?: boolean;
  signal?: AbortSignal;
  /** Priority of the load in the gpu queue. */
  priority?: number;
}

export interface ExclusiveOptions {
  priority?: number;
  signal?: AbortSignal;
}

export interface HubStatus {
  id: string;
  provider: Provider;
  device: Rung["device"];
  sizeMB: number | null;
  refs: number;
  lastUsed: number;
}

export interface Hub {
  readonly registry: Registry;
  readonly env: Env | undefined;
  provide<T>(provider: Provider, factory: Factory<T>): void;
  /** Load (or reuse) the model for a capability or record id. */
  use<T = unknown>(what: Capability | { id: string }, opts?: UseOptions): Promise<Loaded<T>>;
  release(l: Loaded): void;
  unload(id: string): Promise<void>;
  /** Run inference on a loaded model; webgpu models take the gpu lock. */
  run<T, R>(l: Loaded<T>, fn: (value: T) => Promise<R>, opts?: ExclusiveOptions): Promise<R>;
  exclusive<R>(resource: string, fn: () => Promise<R>, opts?: ExclusiveOptions): Promise<R>;
  chain(name: string): <R>(fn: () => Promise<R>) => Promise<R>;
  residentMB(): number;
  status(): HubStatus[];
}

export class HubError extends Error {
  readonly code: "no-route" | "no-provider" | "budget" | "abort";
  constructor(code: HubError["code"], message: string) {
    super(message);
    this.name = "HubError";
    this.code = code;
  }
}

export interface HubOptions {
  registry?: Registry;
  env?: Env;
  /** Memory budget for resident models, in MB. Default no limit. */
  budgetMB?: number;
  /** Route every request to the stub provider (the `?stub` switch). */
  stub?: boolean;
  now?: () => number;
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

export function createHub(opts: HubOptions = {}): Hub {
  const registry = opts.registry ?? createRegistry();
  const now = opts.now ?? (() => Date.now());
  const budget = opts.budgetMB ?? Infinity;
  const factories = new Map<Provider, Factory>();
  const entries = new Map<string, Entry>();
  const loading = new Map<string, Promise<Loaded>>();
  const queues = new Map<string, { busy: boolean; waiting: Waiter[] }>();
  const chains = new Map<string, Promise<unknown>>();
  let seq = 0;

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
        const factory = factories.get(record.provider);
        if (!factory) throw new HubError("no-provider", `no factory for provider ${record.provider}; call hub.provide("${record.provider}", ...)`);
        p = (async () => {
          await makeRoom(record.sizeMB ?? 0);
          const { rungs } = ladderFor(record, opts.env);
          const res = await walkLadder(record.id, rungs, (rung) => {
            if (o.signal?.aborted) throw new DOMException("aborted", "AbortError");
            const go = () => factory({ record, rung, env: opts.env, signal: o.signal, hub });
            const eo: ExclusiveOptions = { priority: o.priority ?? 0 };
            if (o.signal) eo.signal = o.signal;
            return rung.device === "webgpu" ? hub.exclusive("gpu", go, eo) : go();
          });
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
    run(l, fn, eo = {}) {
      const e = entries.get(l.id);
      if (e) e.lastUsed = now();
      return l.rung.device === "webgpu" ? hub.exclusive("gpu", () => fn(l.value), eo) : fn(l.value);
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
            fn().then(resolve, reject).finally(next);
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
      }));
    },
  };
  return hub;
}

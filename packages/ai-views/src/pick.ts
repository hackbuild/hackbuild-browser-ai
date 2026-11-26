/**
 * useModelPick(job): the state behind a model picker. It turns the job's
 * records into rows fitted to this machine, keeps the choice, the options
 * and the load state of each model, and loads through @hackbuild/weights
 * with progress. Framework free: a view subscribes and redraws; the Vue
 * component and the custom element both sit on it.
 */

import type { Env } from "@hackbuild/ai-env";
import type { ModelRecord, StorageEstimate } from "@hackbuild/models";
import { getRepo, hfResolve, type WeightStore } from "@hackbuild/weights";
import { bytesText, canLoad, loadAll, type ModelOption, type ModelPickState, type ModelRow, type OwnKind } from "@virgilvox/hackbuild-ui/vanilla";
import { ALL_RECORDS, JOBS, jobRecords, type Job } from "./jobs.js";
import { rowOf } from "./rows.js";

/** What a loader gets: an abort signal, a progress callback and the row's options. */
export interface LoadContext {
  signal: AbortSignal;
  /** 0 to 1, or null while the total is unknown. */
  onProgress: (fraction: number | null) => void;
  options: Record<string, string>;
}

/** Fetches a model's weights (and may start its runtime). Throws to fail the row. */
export type Loader = (rec: ModelRecord, ctx: LoadContext) => Promise<unknown>;

/**
 * The ids of records whose files are already in a weight store: the cache
 * badge of a picker. A record counts when every file key it names is kept,
 * or, for one its runtime fetches by model id, when any kept url sits under
 * that id on the hub. Records cached elsewhere (WebLLM's own cache) are not seen.
 */
export async function storedIds(store: Pick<WeightStore, "keys">, records: readonly ModelRecord[]): Promise<string[]> {
  const keys = await store.keys().catch(() => [] as string[]);
  if (!keys.length) return [];
  const set = new Set(keys);
  return records
    .filter((r) => {
      const ks = weightKeys(r);
      if (ks.length) return ks.every((k) => set.has(k));
      const id = r.source.modelId;
      return !!id && keys.some((k) => k.includes(`/${id}/resolve/`));
    })
    .map((r) => r.id);
}

/** What a hub repo check found: whether it exists, whether it carries onnx files, and the words a row shows. */
export interface RepoCheck {
  ok: boolean;
  onnx: number;
  note: string;
}

/**
 * Checks a hub repo id before it is used as your own model: it exists, it is
 * public, and it carries onnx files transformers.js can run. One request to
 * the hub's model api; no weights are fetched.
 */
export async function verifyRepo(repo: string, o: { fetch?: typeof fetch; host?: string } = {}): Promise<RepoCheck> {
  const id = repo.trim().replace(/^https?:\/\/huggingface\.co\//, "").replace(/\/+$/, "");
  if (!/^[\w.-]+\/[\w.-]+$/.test(id)) return { ok: false, onnx: 0, note: "write it as owner/name." };
  const f = o.fetch ?? globalThis.fetch.bind(globalThis);
  let res: Response;
  try {
    res = await f(`${o.host ?? "https://huggingface.co"}/api/models/${id}`);
  } catch {
    return { ok: false, onnx: 0, note: "the hub did not answer. check the connection." };
  }
  if (res.status === 401 || res.status === 403) return { ok: false, onnx: 0, note: `${id} is gated or private. it cannot load here.` };
  if (!res.ok) return { ok: false, onnx: 0, note: `${id} was not found on the hub.` };
  const body = (await res.json().catch(() => ({}))) as { siblings?: { rfilename: string }[]; gated?: unknown };
  if (body.gated) return { ok: false, onnx: 0, note: `${id} is gated. accept its terms on the hub first.` };
  const onnx = (body.siblings ?? []).filter((x) => x.rfilename.endsWith(".onnx")).length;
  return onnx ? { ok: true, onnx, note: `${id} found, ${onnx} onnx files.` } : { ok: false, onnx: 0, note: `${id} has no onnx files. pick an onnx export.` };
}

/**
 * A loader over a weight store: a record with a url fetches that file, a
 * record with a repo and files fetches each, resuming and checking the
 * SHA-256 when the record has one. Records a runtime fetches itself (WebLLM,
 * transformers.js model ids) need the app's loader.
 */
/** The cache keys of a record's files in a weight store, as weightsLoader writes them. */
export function weightKeys(rec: ModelRecord): string[] {
  const s = rec.source;
  if (s.url && !s.repo) return [s.url];
  const base = s.repo ? hfResolve(s.repo, s.revision ?? "main") : "";
  const files = s.files?.length ? s.files.map((f) => f.path) : s.file ? [s.file] : [];
  return base ? files.map((f) => base + f) : [];
}

/**
 * A loader that fetches a record's weight files through a weight store; records that load through
 * their runtime throw.
 */
export function weightsLoader(store: WeightStore): Loader {
  return async (rec, { signal, onProgress }) => {
    if (rec.noDownload || rec.sizeMB === 0) {
      onProgress(1);
      return null;
    }
    const s = rec.source;
    if (s.url && !s.repo) {
      return store.get({ url: s.url, licence: rec.licence, ...(s.sha256 ? { sha256: s.sha256 } : {}) }, { signal, onProgress: (p) => onProgress(p.fraction) });
    }
    const files = s.files?.length ? s.files : s.file ? [{ path: s.file, ...(s.sha256 ? { sha256: s.sha256 } : {}) }] : [];
    if (s.repo && files.length) {
      return getRepo(store, { base: hfResolve(s.repo, s.revision ?? "main"), files, licence: rec.licence }, { signal, onProgress: (p) => onProgress(p.total ? p.loaded / p.total : null) });
    }
    throw new Error(`${rec.label ?? rec.id} loads through its runtime. the page passes a loader for it.`);
  };
}

/** Deletes a stored model's files from a weight store: the remove of a picker. */
export function weightsRemover(store: WeightStore): (rec: ModelRecord) => Promise<void> {
  return async (rec) => {
    for (const k of weightKeys(rec)) await store.evict(k);
  };
}

/**
 * Options for `useModelPick`: records, env, storage estimate, loader, remover, stored ids, the
 * chosen id and extra row options.
 */
export interface PickOptions {
  /** Records to pick from; default every record the views know. */
  records?: readonly ModelRecord[];
  env?: Env;
  estimate?: StorageEstimate | null;
  /** Loads a model; required to load. weightsLoader(store) fetches files; a page with a runtime passes its own. */
  loader?: Loader;
  /** Deletes a stored model's weights; weightsRemover(store) does it through @hackbuild/weights. */
  onRemove?: (rec: ModelRecord) => Promise<void> | void;
  /** Ids already on this machine. */
  stored?: Iterable<string>;
  chosen?: string;
  /** Options a job adds to every row, like a language select for speech. */
  extra?: (rec: ModelRecord) => readonly ModelOption[];
}

/** What a picker shows: its job, title, rows, the chosen id and row, and what the loader returned for it. */
export interface PickSnapshot {
  job: Job;
  title: string;
  empty: string;
  rows: ModelRow[];
  chosen: string;
  row: ModelRow | undefined;
  /** What the loader returned for the chosen model, once it is loaded (an engine, a session). */
  loaded: unknown;
}

/**
 * A model picker for one job: choose, load, cancel, remove, set row options, add your own model,
 * and subscribe to its snapshot.
 */
export interface ModelPick {
  readonly job: Job;
  snapshot(): PickSnapshot;
  subscribe(fn: (s: PickSnapshot) => void): () => void;
  choose(id: string): void;
  /** Load the chosen model, or `id`, through the loader. Rejects when there is no loader or the load fails; the row shows it. */
  load(id?: string): Promise<void>;
  cancel(id?: string): void;
  /** Delete a stored model through onRemove, then forget it. */
  remove(id: string): Promise<void>;
  option(id: string, key: string, value: string): void;
  /** Options set on a row. */
  optionsOf(id: string): Record<string, string>;
  /** Add a model from a "your own" form; returns its id. */
  custom(kind: OwnKind, values: Record<string, string>): string;
  /** New machine facts (env, storage) or records. */
  update(o: { env?: Env | undefined; estimate?: StorageEstimate | null | undefined; records?: readonly ModelRecord[] | undefined; loader?: Loader | undefined; onRemove?: PickOptions["onRemove"]; stored?: Iterable<string> | undefined }): void;
  /** What the loader returned for a model. */
  result(id: string): unknown;
  record(id: string): ModelRecord | undefined;
  /** The error of the last failed load of a row. */
  error(id: string): string | undefined;
}

const OWN_PROVIDES: Partial<Record<Job, string[]>> = { chat: ["chat"], transcribe: ["transcribe"], vision: ["vision.ask", "vision.caption"], voice: ["speak"], embed: ["embed"] };

/** A record for a "your own" form. Its licence is unknown until the person reads the card. */
export function ownRecord(job: Job, kind: OwnKind, v: Record<string, string>): ModelRecord {
  const provides = OWN_PROVIDES[job] ?? [job];
  const base = { provides, sizeMB: null, sizeSource: "unknown" as const, licence: "unknown, read the model card", commercial: "unknown" as const, speed: "steady" as const, verdict: "your own" };
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  switch (kind) {
    case "gguf":
      return { ...base, id: `own-${slug(`${v.repo}-${v.file}`)}`, label: v.file || v.repo || "gguf", provider: "wllama", source: { repo: v.repo!, file: v.file! }, ladder: [{ device: "wasm" }] };
    case "onnx":
      return { ...base, id: `own-${slug(v.repo ?? "onnx")}`, label: (v.repo ?? "").split("/").pop() || "onnx", provider: "tjs", source: { modelId: v.repo! }, ladder: [{ device: "webgpu" }, { device: "wasm" }] };
    case "mlc":
      return { ...base, id: `own-${slug(v.url ?? "mlc")}`, label: (v.url ?? "").replace(/\/+$/, "").split("/").pop() || "mlc", provider: "webllm", source: { url: v.url! }, ladder: [{ device: "webgpu" }] };
    case "endpoint":
      return { ...base, id: `own-${slug(v.url ?? "endpoint")}`, label: (v.url ?? "").replace(/^https?:\/\//, "").split("/")[0] || "endpoint", provider: "remote", source: { url: v.url! }, ladder: [{ device: "remote" }], speed: "fast", verdict: "your endpoint" };
  }
}

/**
 * The row a picker starts on: the first "start here" record that fits this
 * machine, else the first that fits and is fast or steady, else the first
 * that fits, else the first.
 */
export function defaultPick(records: readonly ModelRecord[], env?: Env, estimate?: StorageEstimate | null): string {
  const fits = records.filter((r) => rowOf(r, { env, estimate }).unfit === undefined);
  return (fits.find((r) => r.group === "start here") ?? fits.find((r) => r.speed === "fast" || r.speed === "steady") ?? fits[0] ?? records[0])?.id ?? "";
}

/** Creates a model picker for a job, with rows that say whether each model fits this machine. */
export function useModelPick(job: Job, o: PickOptions = {}): ModelPick {
  const def = JOBS[job];
  let records = jobRecords(job, o.records ?? ALL_RECORDS);
  let env = o.env;
  let estimate = o.estimate ?? null;
  let loader = o.loader;
  let onRemove = o.onRemove;
  const results = new Map<string, unknown>();
  const own: ModelRecord[] = [];
  const state = new Map<string, ModelPickState>();
  const progress = new Map<string, number>();
  const errors = new Map<string, string>();
  const options = new Map<string, Record<string, string>>();
  const aborts = new Map<string, AbortController>();
  for (const id of o.stored ?? []) state.set(id, "stored");
  const all = () => [...records, ...own];
  let chosen = o.chosen ?? defaultPick(all(), env, estimate);
  const subs = new Set<(s: PickSnapshot) => void>();

  const rows = () =>
    all().map((r) =>
      rowOf(r, { env, estimate, state: state.get(r.id), progress: progress.get(r.id), options: options.get(r.id), extra: o.extra?.(r), own: own.includes(r) }),
    );
  const snapshot = (): PickSnapshot => {
    const rs = rows();
    return { job, title: def.title, empty: def.empty, rows: rs, chosen, row: rs.find((r) => r.id === chosen), loaded: results.get(chosen) };
  };
  const emit = () => {
    const s = snapshot();
    for (const fn of subs) fn(s);
  };

  const pick: ModelPick = {
    job,
    snapshot,
    subscribe(fn) {
      subs.add(fn);
      fn(snapshot());
      return () => subs.delete(fn);
    },
    choose(id) {
      if (!all().some((r) => r.id === id) || id === chosen) return;
      chosen = id;
      emit();
    },
    async load(id = chosen) {
      const rec = all().find((r) => r.id === id);
      const row = rec && rowOf(rec, { env, estimate, state: state.get(id) });
      if (!rec || !canLoad(row)) return;
      if (!loader) {
        state.set(id, "error");
        errors.set(id, "no loader. the page passes one to load a model.");
        emit();
        throw new Error(`no loader for ${rec.id}: pass one to useModelPick, such as weightsLoader(store)`);
      }
      const ac = new AbortController();
      aborts.set(id, ac);
      state.set(id, "loading");
      progress.set(id, 0);
      errors.delete(id);
      emit();
      try {
        const out = await loader(rec, {
          signal: ac.signal,
          options: options.get(id) ?? {},
          onProgress: (f) => {
            progress.set(id, f ?? progress.get(id) ?? 0);
            emit();
          },
        });
        results.set(id, out);
        state.set(id, "loaded");
      } catch (e) {
        const aborted = ac.signal.aborted;
        state.set(id, aborted ? "none" : "error");
        if (!aborted) errors.set(id, e instanceof Error ? e.message : String(e));
        if (!aborted) throw e;
      } finally {
        aborts.delete(id);
        progress.delete(id);
        emit();
      }
    },
    cancel(id = chosen) {
      aborts.get(id)?.abort();
    },
    async remove(id) {
      const rec = all().find((r) => r.id === id);
      if (!rec) return;
      await onRemove?.(rec);
      state.delete(id);
      results.delete(id);
      emit();
    },
    option(id, key, value) {
      options.set(id, { ...options.get(id), [key]: value });
      emit();
    },
    optionsOf: (id) => ({ ...options.get(id) }),
    custom(kind, values) {
      const rec = ownRecord(job, kind, values);
      const i = own.findIndex((r) => r.id === rec.id);
      if (i >= 0) own[i] = rec;
      else own.push(rec);
      chosen = rec.id;
      emit();
      return rec.id;
    },
    update(n) {
      if ("env" in n) env = n.env;
      if ("estimate" in n) estimate = n.estimate ?? null;
      if (n.records) records = jobRecords(job, n.records);
      if (n.loader) loader = n.loader;
      if (n.onRemove) onRemove = n.onRemove;
      for (const id of n.stored ?? []) if (!state.has(id) || state.get(id) === "none") state.set(id, "stored");
      emit();
    },
    result: (id) => results.get(id),
    record: (id) => all().find((r) => r.id === id),
    error: (id) => errors.get(id),
  };
  return pick;
}

/** A preset for a tool with several jobs: one pick per job. */
export interface PickPreset {
  id: string;
  label: string;
  picks: Partial<Record<Job, string>>;
}

/** One line of a jobs rack: the job, its label, whether it is required, and the chosen row. */
export interface JobLine {
  job: Job;
  label: string;
  required: boolean;
  row: ModelRow | undefined;
}

/** Several pickers as one rack: a line per job, presets with their totals, and load all. */
export interface JobsPick {
  readonly picks: ReadonlyMap<Job, ModelPick>;
  lines(): JobLine[];
  presets(): { id: string; label: string; total: string }[];
  applyPreset(id: string): void;
  /** "load all, 1.2 gb" and the ids it would fetch. */
  all(): { ids: string[]; label: string };
  loadAll(): Promise<void>;
  subscribe(fn: () => void): () => void;
  /** New machine facts, records or loader for every job. */
  update(o: Parameters<ModelPick["update"]>[0]): void;
  setPresets(p: readonly PickPreset[]): void;
}

/** Creates one picker per job and joins them as a rack with presets and load all. */
export function useJobsPick(jobs: readonly { job: Job; required?: boolean; options?: PickOptions }[], initialPresets: readonly PickPreset[] = [], shared: PickOptions = {}): JobsPick {
  let presets = initialPresets;
  const extra = new Set<() => void>();
  const picks = new Map<Job, ModelPick>(jobs.map((j) => [j.job, useModelPick(j.job, { ...shared, ...j.options })]));
  const required = new Map(jobs.map((j) => [j.job, !!j.required]));
  const chosenRows = () => [...picks.values()].map((p) => p.snapshot().row);
  return {
    picks,
    lines: () => [...picks].map(([job, p]) => ({ job, label: JOBS[job].label, required: required.get(job) ?? false, row: p.snapshot().row })),
    presets: () =>
      presets.map((pr) => {
        let bytes = 0;
        for (const [job, id] of Object.entries(pr.picks) as [Job, string][]) {
          const row = picks.get(job)?.snapshot().rows.find((r) => r.id === id);
          if (row && row.state !== "stored" && row.state !== "loaded") bytes += row.bytes ?? 0;
        }
        return { id: pr.id, label: pr.label, total: bytes > 0 ? `about ${bytesText(bytes)}` : "nothing to fetch" };
      }),
    applyPreset(id) {
      const pr = presets.find((p) => p.id === id);
      if (!pr) return;
      for (const [job, mid] of Object.entries(pr.picks) as [Job, string][]) picks.get(job)?.choose(mid);
    },
    all: () => loadAll(chosenRows()),
    async loadAll() {
      await Promise.all([...picks.values()].map((p) => p.load().catch(() => undefined)));
    },
    subscribe(fn) {
      const offs = [...picks.values()].map((p) => p.subscribe(() => fn()));
      extra.add(fn);
      return () => (offs.forEach((off) => off()), extra.delete(fn));
    },
    update(o) {
      for (const p of picks.values()) p.update(o);
    },
    setPresets(p) {
      presets = p;
      for (const fn of extra) fn();
    },
  };
}

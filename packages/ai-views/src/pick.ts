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

export interface LoadContext {
  signal: AbortSignal;
  /** 0 to 1, or null while the total is unknown. */
  onProgress: (fraction: number | null) => void;
  options: Record<string, string>;
}

/** Fetches a model's weights (and may start its runtime). Throws to fail the row. */
export type Loader = (rec: ModelRecord, ctx: LoadContext) => Promise<unknown>;

/**
 * A loader over a weight store: a record with a url fetches that file, a
 * record with a repo and files fetches each, resuming and checking the
 * SHA-256 when the record has one. Records a runtime fetches itself (WebLLM,
 * transformers.js model ids) need the app's loader.
 */
export function weightsLoader(store: WeightStore): Loader {
  return async (rec, { signal, onProgress }) => {
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

export interface PickOptions {
  /** Records to pick from; default every record the views know. */
  records?: readonly ModelRecord[];
  env?: Env;
  estimate?: StorageEstimate | null;
  loader?: Loader;
  /** Ids already on this machine. */
  stored?: Iterable<string>;
  chosen?: string;
  /** Options a job adds to every row, like a language select for speech. */
  extra?: (rec: ModelRecord) => readonly ModelOption[];
}

export interface PickSnapshot {
  job: Job;
  title: string;
  empty: string;
  rows: ModelRow[];
  chosen: string;
  row: ModelRow | undefined;
}

export interface ModelPick {
  readonly job: Job;
  snapshot(): PickSnapshot;
  subscribe(fn: (s: PickSnapshot) => void): () => void;
  choose(id: string): void;
  /** Load the chosen model, or `id`. Resolves when it is loaded or failed. */
  load(id?: string): Promise<void>;
  cancel(id?: string): void;
  /** Forget a stored model; the page removes its files. */
  remove(id: string): void;
  option(id: string, key: string, value: string): void;
  /** Options set on a row. */
  optionsOf(id: string): Record<string, string>;
  /** Add a model from a "your own" form; returns its id. */
  custom(kind: OwnKind, values: Record<string, string>): string;
  /** New machine facts (env, storage) or records. */
  update(o: { env?: Env | undefined; estimate?: StorageEstimate | null | undefined; records?: readonly ModelRecord[] | undefined; loader?: Loader | undefined }): void;
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

export function useModelPick(job: Job, o: PickOptions = {}): ModelPick {
  const def = JOBS[job];
  let records = jobRecords(job, o.records ?? ALL_RECORDS);
  let env = o.env;
  let estimate = o.estimate ?? null;
  let loader = o.loader;
  const own: ModelRecord[] = [];
  const state = new Map<string, ModelPickState>();
  const progress = new Map<string, number>();
  const errors = new Map<string, string>();
  const options = new Map<string, Record<string, string>>();
  const aborts = new Map<string, AbortController>();
  for (const id of o.stored ?? []) state.set(id, "stored");
  const all = () => [...records, ...own];
  let chosen = o.chosen ?? "";
  if (!chosen) {
    const first = all().find((r) => rowOf(r, { env, estimate }).unfit === undefined);
    chosen = first?.id ?? all()[0]?.id ?? "";
  }
  const subs = new Set<(s: PickSnapshot) => void>();

  const rows = () =>
    all().map((r) =>
      rowOf(r, { env, estimate, state: state.get(r.id), progress: progress.get(r.id), options: options.get(r.id), extra: o.extra?.(r), own: own.includes(r) }),
    );
  const snapshot = (): PickSnapshot => {
    const rs = rows();
    return { job, title: def.title, empty: def.empty, rows: rs, chosen, row: rs.find((r) => r.id === chosen) };
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
      const ac = new AbortController();
      aborts.set(id, ac);
      state.set(id, "loading");
      progress.set(id, 0);
      errors.delete(id);
      emit();
      try {
        if (loader && !row!.noDownload) {
          await loader(rec, {
            signal: ac.signal,
            options: options.get(id) ?? {},
            onProgress: (f) => {
              progress.set(id, f ?? progress.get(id) ?? 0);
              emit();
            },
          });
        }
        state.set(id, "loaded");
      } catch (e) {
        const aborted = ac.signal.aborted;
        state.set(id, aborted ? "none" : "error");
        if (!aborted) errors.set(id, e instanceof Error ? e.message : String(e));
      } finally {
        aborts.delete(id);
        progress.delete(id);
        emit();
      }
    },
    cancel(id = chosen) {
      aborts.get(id)?.abort();
    },
    remove(id) {
      if (state.get(id) === "stored") state.delete(id);
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
      emit();
    },
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
}

export function useJobsPick(jobs: readonly { job: Job; required?: boolean; options?: PickOptions }[], presets: readonly PickPreset[] = [], shared: PickOptions = {}): JobsPick {
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
      await Promise.all([...picks.values()].map((p) => p.load()));
    },
    subscribe(fn) {
      const offs = [...picks.values()].map((p) => p.subscribe(() => fn()));
      return () => offs.forEach((off) => off());
    },
  };
}

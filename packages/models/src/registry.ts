import type { Env } from "@hackbuild/ai-env";
import { ladderFor, type Capability, type ModelRecord, type Provider } from "./record.js";

export type SizeClass = "tiny" | "small" | "medium" | "large";

/** Size class by download size: tiny under 400 MB, small under 1.5 GB, medium under 3.5 GB (inferred cut points). */
export function sizeClass(mb: number | null): SizeClass | null {
  if (mb === null) return null;
  if (mb < 400) return "tiny";
  if (mb < 1500) return "small";
  if (mb < 3500) return "medium";
  return "large";
}

export interface Query {
  provides?: Capability;
  provider?: Provider;
  size?: SizeClass;
  maxMB?: number;
  /** Drop records whose weight licence forbids commercial use. */
  commercial?: boolean;
  env?: Env;
}

export interface Registry {
  add(...recs: ModelRecord[]): void;
  get(id: string): ModelRecord | undefined;
  list(): ModelRecord[];
  find(q: Query): ModelRecord[];
  /** The record the hub should load for a request: runnable here, under the budget, the requested size first, then largest that fits. */
  route(q: Query): ModelRecord | undefined;
}

export class RegistryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RegistryError";
  }
}

export function validateRecord(r: ModelRecord): void {
  if (!r.id) throw new RegistryError("record has no id");
  if (!r.licence || !r.licence.trim()) throw new RegistryError(`${r.id}: every model reference names its weight licence`);
  if (!r.provides.length) throw new RegistryError(`${r.id}: provides is empty`);
  if (!r.ladder.length) throw new RegistryError(`${r.id}: ladder is empty`);
}

export function createRegistry(initial: readonly ModelRecord[] = []): Registry {
  const recs = new Map<string, ModelRecord>();
  const reg: Registry = {
    add(...rs) {
      for (const r of rs) {
        validateRecord(r);
        recs.set(r.id, r);
      }
    },
    get: (id) => recs.get(id),
    list: () => [...recs.values()],
    find(q) {
      return [...recs.values()].filter((r) => {
        if (q.provides && !r.provides.includes(q.provides)) return false;
        if (q.provider && r.provider !== q.provider) return false;
        if (q.maxMB !== undefined && r.sizeMB !== null && r.sizeMB > q.maxMB) return false;
        if (q.commercial && r.commercial !== true) return false;
        if (q.env && ladderFor(r, q.env).rungs.length === 0) return false;
        return true;
      });
    },
    route(q) {
      const { size, ...rest } = q;
      const all = reg.find(rest);
      if (!all.length) return undefined;
      const bySize = (rs: ModelRecord[]) => [...rs].sort((a, b) => (b.sizeMB ?? 0) - (a.sizeMB ?? 0));
      if (size) {
        const exact = all.filter((r) => sizeClass(r.sizeMB) === size);
        if (exact.length) return bySize(exact)[0];
      }
      return bySize(all)[0];
    },
  };
  reg.add(...initial);
  return reg;
}

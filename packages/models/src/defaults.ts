/**
 * Defaults with reasons: what a first visit should start with on this
 * machine, and one lowercase line per field saying why. Pure: everything
 * it reads comes in as arguments, so the same inputs give the same
 * suggestion. The rows feed a reasons list ({ label, value, why }).
 */

import type { Env } from "@hackbuild/ai-env";
import { budgetFor, type Budget, type StorageEstimate } from "./fit.js";
import { ladderFor, type Capability, type ModelRecord } from "./record.js";

/** A catalogue model is offered over a stored one only when it is this many times larger (a real step up, not a sideways move). Vendor, proposed here. */
export const STEP_UP = 1.5;

export interface Reason {
  label: string;
  value: string;
  why: string;
}

export interface DefaultsInput {
  /** Records to choose from, e.g. CATALOG or registry.list(). */
  catalogue: readonly ModelRecord[];
  /** Ids already in the weight store. */
  stored?: readonly string[];
  /** store.estimate(); a catalogue offer must fit the free storage. */
  estimate?: StorageEstimate | null;
  /** Capability to pick for. Default "chat". */
  provides?: Capability;
  /** Override the budget, e.g. from a setting. Default budgetFor(env). */
  budget?: Budget;
}

export interface Defaults {
  patch: {
    /** The record to load, or null when nothing stored fits and the person must download first. */
    model: string | null;
    device: "webgpu" | "wasm";
    threads: number;
  };
  reasons: Reason[];
  /** A catalogue record worth downloading: nothing stored fits, or it is a real step up. */
  download: ModelRecord | null;
  budget: Budget;
}

const mbText = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} gb` : `${Math.round(mb)} mb`);
const nameOf = (r: ModelRecord) => r.label ?? r.id;
const sized = (r: ModelRecord): r is ModelRecord & { sizeMB: number } => r.sizeMB !== null;
const tools = (r: ModelRecord) => (r.quirks?.nativeTools || r.tags?.includes("tools") ? 1 : 0);

/** The model to start with: the largest stored model that fits the budget, with an offer to download when that helps. */
export function pickModel(env: Env | undefined, input: DefaultsInput): { model: string | null; why: string; download: ModelRecord | null } {
  const budget = input.budget ?? budgetFor(env);
  const cap = input.provides ?? "chat";
  const stored = new Set(input.stored ?? []);
  const runnable = input.catalogue.filter((r) => r.provides.includes(cap) && r.provider !== "remote" && ladderFor(r, env).rungs.length > 0);
  const installed = runnable.filter((r) => stored.has(r.id));
  const fits = installed.filter(sized).filter((r) => r.sizeMB <= budget.mb).sort((a, b) => b.sizeMB - a.sizeMB);
  const roomFor = (r: ModelRecord & { sizeMB: number }) => !input.estimate || input.estimate.fits(r.sizeMB * 1024 * 1024);
  const best =
    runnable
      .filter(sized)
      .filter((r) => !stored.has(r.id) && r.sizeMB <= budget.mb && roomFor(r))
      .sort((a, b) => b.sizeMB - a.sizeMB || tools(b) - tools(a))[0] ?? null;
  const chosen = fits[0];
  if (chosen) {
    const better = best && best.sizeMB > chosen.sizeMB * STEP_UP ? best : null;
    return { model: chosen.id, why: `largest stored model that fits (${budget.why}).`, download: better };
  }
  if (installed.length) {
    const smallest = [...installed].sort((a, b) => (a.sizeMB ?? Infinity) - (b.sizeMB ?? Infinity))[0]!;
    return { model: smallest.id, why: `stored models are large for this machine (${budget.why}). replies may be slow.`, download: best };
  }
  if (best) return { model: null, why: `nothing stored. ${nameOf(best)} fits, ${mbText(best.sizeMB)} (${best.sizeSource}), ${budget.why}.`, download: best };
  return { model: null, why: `nothing stored, and no model fits this machine (${budget.why}).`, download: null };
}

/** Defaults for a first visit, from the probe and the catalogue, with one reason per field. */
export function suggestDefaults(env: Env | undefined, input: DefaultsInput): Defaults {
  const budget = input.budget ?? budgetFor(env);
  const pick = pickModel(env, { ...input, budget });
  const device = env?.webgpu ? "webgpu" : "wasm";
  const threads = env?.threads ?? 1;
  const model = pick.model ? input.catalogue.find((r) => r.id === pick.model) : undefined;
  const reasons: Reason[] = [
    { label: "model", value: model ? nameOf(model) : "none yet", why: pick.why },
    {
      label: "device",
      value: device,
      why: !env ? "no probe ran. models run on wasm." : env.webgpu ? (env.f16 ? "webgpu adapter with shader-f16." : "webgpu adapter without shader-f16. f16 rows are off.") : "no webgpu adapter. models run on wasm.",
    },
    { label: "threads", value: String(threads), why: env?.isolated ? "the page is cross origin isolated." : "the page is not cross origin isolated. wasm runs on one thread." },
    { label: "memory budget", value: mbText(budget.mb), why: `${budget.why}. proposed, not measured.` },
  ];
  if (pick.download) reasons.push({ label: "download", value: nameOf(pick.download), why: `${mbText(pick.download.sizeMB ?? 0)} (${pick.download.sizeSource}) once, then kept in this browser.` });
  return { patch: { model: pick.model, device, threads }, reasons, download: pick.download, budget };
}

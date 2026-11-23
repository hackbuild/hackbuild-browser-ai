/**
 * Pinned revisions and file hashes for the Hugging Face repos the records
 * load. tools/pin-weights.mjs writes pins.ts; this file reads it. A record
 * that names a pinned repo and no revision gets the pinned one when it is
 * added to a registry, so every loader resolves `resolve/<commit>/` URLs,
 * and pinnedSha gives the SHA-256 for such a URL.
 */

import { PINNED_AT, PINS, type PinFile, type RepoPin } from "./pins.js";
import type { ModelRecord } from "./record.js";

export { PINNED_AT, PINS, type PinFile, type RepoPin };

export function pinOf(repo: string | undefined): RepoPin | undefined {
  return repo && Object.hasOwn(PINS, repo) ? PINS[repo] : undefined;
}

/** The record with source.revision set from the pins when it names a pinned repo and has none. */
export function withPin(rec: ModelRecord): ModelRecord {
  const s = rec.source;
  if (s.revision) return rec;
  const pin = pinOf(s.repo ?? s.modelId);
  return pin ? { ...rec, source: { ...s, revision: pin.revision } } : rec;
}

const HF = /^https:\/\/huggingface\.co\/([^/]+\/[^/]+)\/resolve\/([^/]+)\/(.+)$/;

/** SHA-256 of a Hugging Face resolve URL at a pinned commit, or undefined (other host, unpinned repo, other revision). */
export function pinnedSha(url: string): string | undefined {
  const m = HF.exec(url.split("?")[0]!);
  if (!m) return undefined;
  const pin = pinOf(m[1]);
  if (!pin || decodeURIComponent(m[2]!) !== pin.revision) return undefined;
  const f = Object.hasOwn(pin.files, m[3]!) ? pin.files[m[3]!] : undefined;
  return f?.[0];
}

/** A resolve URL base at the pinned commit, or at `fallback` when the repo is not pinned. */
export function pinnedBase(repo: string, fallback = "main"): string {
  return `https://huggingface.co/${repo}/resolve/${pinOf(repo)?.revision ?? fallback}/`;
}

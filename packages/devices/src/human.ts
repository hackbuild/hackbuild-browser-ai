/**
 * Failure copy for people: every line names what failed and ends with
 * what still works, lowercase, never a prefix plus a raw exception.
 * Runtime failures go through classifyError; mic and camera failures are
 * read by DOMException name (denied, not found, in use).
 */

import { classifyError, type ErrorKind } from "@hackbuild/models";

/** What was being done when it failed. "model" covers loads and runs. */
export type FailureKind = "model" | "mic" | "camera" | "storage";

const KINDS: readonly string[] = ["model", "mic", "camera", "storage"];

const nameOf = (e: unknown): string => (e && typeof e === "object" && "name" in e ? String((e as { name: unknown }).name) : "");
const codeOf = (e: unknown): string => (e && typeof e === "object" && "code" in e ? String((e as { code: unknown }).code) : "");
const messageOf = (e: unknown): string => {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : e && typeof e === "object" && "message" in e ? String((e as { message: unknown }).message) : String(e);
  const one = m.replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
  return one.length > 160 ? `${one.slice(0, 157)}...` : one || "no message";
};

type DeviceCase = "blocked" | "missing" | "busy";
const DEVICE_CASE: Record<string, DeviceCase> = {
  NotAllowedError: "blocked",
  SecurityError: "blocked",
  PermissionDeniedError: "blocked",
  NotFoundError: "missing",
  DevicesNotFoundError: "missing",
  OverconstrainedError: "missing",
  NotReadableError: "busy",
  TrackStartError: "busy",
  AbortError: "busy",
};

const DEVICE_LINES: Record<"mic" | "camera", Record<DeviceCase, string> & { alt: string; noun: string }> = {
  mic: {
    noun: "the mic",
    alt: "type instead",
    blocked: "the mic is blocked for this site. type instead, or allow it in the address bar.",
    missing: "no microphone found. plug one in, or type instead.",
    busy: "the mic is in use by another app. close it, or type instead.",
  },
  camera: {
    noun: "the camera",
    alt: "drop an image instead",
    blocked: "the camera is blocked for this site. drop an image instead, or allow it in the address bar.",
    missing: "no camera found. drop an image instead.",
    busy: "the camera is in use by another app. close it, or drop an image instead.",
  },
};

const RUNTIME: Record<Exclude<ErrorKind, "unknown">, string> = {
  "out-of-memory": "the model ran out of memory. unload another model, or pick the next row down.",
  f16: "this gpu has no shader-f16. pick a row without f16, or one marked cpu.",
  "device-lost": "the gpu reset during the run. load the model again, or pick a row marked cpu.",
  "runtime-mismatch": "the runtime and the model build do not match. pick another row, or reload the page.",
  "unsupported-op": "this backend lacks an operation the model needs. pick a row marked cpu, or another model.",
  network: "the download failed. check the connection and press load again. finished files are kept.",
  abort: "stopped. press load to go on from where it left off.",
};

const STORAGE: Record<string, string> = {
  quota: "not enough storage for this model. remove a stored model, or pick a smaller one.",
  sha256: "the download did not match its checksum and was removed. press load to fetch it again.",
  range: "the server sent the wrong part of the file. press load to start the download over.",
};

/**
 * A lowercase line for a failure, naming it and the working alternative.
 * `humanError(e)` reads a runtime or storage failure; `humanError("mic", e)`
 * and `humanError("camera", e)` read a device failure by its DOMException name.
 * An unknown failure keeps its message.
 */
export function humanError(raw: unknown): string;
export function humanError(kind: FailureKind, raw: unknown): string;
export function humanError(a: unknown, b?: unknown): string {
  const explicit = typeof a === "string" && KINDS.includes(a) && arguments.length > 1;
  const kind: FailureKind = explicit ? (a as FailureKind) : "model";
  const e = explicit ? b : a;
  if (kind === "mic" || kind === "camera") {
    const lines = DEVICE_LINES[kind];
    const c = DEVICE_CASE[nameOf(e)];
    if (c) return lines[c];
    if (/permission|denied|not allowed/i.test(messageOf(e))) return lines.blocked;
    return `${lines.noun} did not start: ${messageOf(e)}. ${lines.alt}.`;
  }
  const code = codeOf(e);
  if (nameOf(e) === "WeightError" && STORAGE[code]) return STORAGE[code]!;
  if (nameOf(e) === "QuotaExceededError" || /quota|not enough storage/i.test(messageOf(e))) return STORAGE.quota!;
  if (kind === "storage") return `storage failed: ${messageOf(e)}. the model still runs, and is fetched again next visit.`;
  const k = classifyError(e);
  if (k !== "unknown") return RUNTIME[k];
  return `the model failed: ${messageOf(e)}. pick another row, or reload the page.`;
}

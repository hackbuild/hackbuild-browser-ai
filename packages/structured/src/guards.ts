/**
 * Turn guards for small models (as earlier builds did): stop after 3 parse
 * failures, when the same call repeats 3 times in the last 6, or after 2
 * garbage replies in a row; cap pushbacks at 3.
 */

export interface GuardOptions {
  parseFails?: number;
  repeat?: { count: number; window: number };
  garbage?: { ratio: number; consecutive: number };
  pushbacks?: number;
}

/** Which guard tripped: too many parse failures, a repeated call, garbage replies or too many pushbacks. */
export type StopReason = "parse-fails" | "repeat" | "garbage" | "pushbacks";

/** Counters over one agent run that return a `StopReason` when a limit is reached. */
export interface Guards {
  /** Record a reply that did not parse. */
  parseFail(): StopReason | null;
  /** Record a parsed reply; resets the consecutive garbage count unless the text is garbage. */
  reply(text: string): StopReason | null;
  /** Record a tool call by fingerprint. */
  call(name: string, args: unknown): StopReason | null;
  pushback(): StopReason | null;
  readonly stopped: StopReason | null;
  reset(): void;
}

/** Share of characters that are JSON punctuation. Above .18 a prose reply is likely garbage. */
export function jsonCharRatio(text: string): number {
  const t = text.replace(/\s+/g, "");
  if (!t.length) return 0;
  const n = (t.match(/[{}[\]":,\\]/g) ?? []).length;
  return n / t.length;
}

/** True when a reply is empty, repeats a short run six times or more, or has a JSON punctuation share above `ratio`. */
export function looksLikeGarbage(text: string, ratio = 0.18): boolean {
  const t = text.trim();
  if (!t) return true;
  if (/(.{2,12})\1{5,}/.test(t)) return true;
  return jsonCharRatio(t) > ratio;
}

/** Stable fingerprint of a call: name plus arguments with sorted keys. */
export function fingerprint(name: string, args: unknown): string {
  const norm = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(norm);
    if (v && typeof v === "object") {
      return Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, norm((v as Record<string, unknown>)[k])]));
    }
    return typeof v === "string" ? v.trim().toLowerCase() : v;
  };
  return `${name}:${JSON.stringify(norm(args))}`;
}

/** Make guards with the defaults 3 parse failures, the same call 3 times in the last 6, 2 garbage replies in a row, and 3 pushbacks. */
export function createGuards(o: GuardOptions = {}): Guards {
  const maxFails = o.parseFails ?? 3;
  const rep = o.repeat ?? { count: 3, window: 6 };
  const gar = o.garbage ?? { ratio: 0.18, consecutive: 2 };
  const maxPush = o.pushbacks ?? 3;
  let fails = 0;
  let garbage = 0;
  let pushes = 0;
  let recent: string[] = [];
  let stopped: StopReason | null = null;
  const stop = (r: StopReason) => (stopped = r);
  return {
    parseFail() {
      if (++fails >= maxFails) return stop("parse-fails");
      return null;
    },
    reply(text) {
      if (looksLikeGarbage(text, gar.ratio)) {
        if (++garbage >= gar.consecutive) return stop("garbage");
      } else garbage = 0;
      return null;
    },
    call(name, args) {
      recent.push(fingerprint(name, args));
      recent = recent.slice(-rep.window);
      const last = recent[recent.length - 1];
      if (recent.filter((f) => f === last).length >= rep.count) return stop("repeat");
      return null;
    },
    pushback() {
      if (++pushes > maxPush) return stop("pushbacks");
      return null;
    },
    get stopped() {
      return stopped;
    },
    reset() {
      fails = garbage = pushes = 0;
      recent = [];
      stopped = null;
    },
  };
}

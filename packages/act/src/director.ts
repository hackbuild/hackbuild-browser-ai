/**
 * The director: reads the model's reply as it streams, hands visible text
 * to speech, and holds each cue until the voice reaches it.
 *
 * Contract with speech: the text `feed` returns is the text speech gets,
 * and speech reports progress as character offsets in that same text
 * (segment start, each word timestamp, segment end). `reached(offset)`
 * fires every pending cue at or before the offset.
 *
 * Kinds behave differently on the avatar:
 *   mood     sticky, decays over `moodDecayMs`; the same mood again while
 *            it still shows is suppressed
 *   gesture  one shot on the upper body, with a cooldown
 *   posture  persists until another posture; only from explicit tags,
 *            never inferred from speech
 *
 * Keep the raw tagged reply in the chat history, not the visible text.
 * With tags stripped from history, 1B and 2B models were measured to stop
 * tagging by the third turn in the builds this protocol comes from; the
 * model copies its own earlier replies.
 */

import { createTagParser, type Tag, type TagParser } from "@hackbuild/structured";
import type { Embedder } from "@hackbuild/memory";
import { cuesFromJson } from "./grammar.js";
import { createInferrer, type Inferrer } from "./infer.js";
import { createResolver, type Resolver } from "./resolve.js";
import { surfaceForms, type ActKind, type ActVocabulary } from "./vocab.js";

/** An act placed at an offset of the visible text, with the tag or sentence it came from. */
export interface Cue {
  kind: ActKind;
  name: string;
  /** Offset in the visible text. */
  at: number;
  /** The tag as written, or the sentence it was inferred from. */
  raw: string;
  source: "tag" | "infer" | "json" | "replay";
}

/** A cue that fired, with the clock time in ms. */
export interface FiredCue extends Cue {
  /** Clock time it fired, ms. */
  t: number;
}

/** A cue that did not fire because it repeated the current mood or posture, or fell inside the gesture cooldown. */
export interface Suppressed extends Cue {
  reason: "repeat" | "cooldown";
}

/** The cues that fired in one reply, by offset, for `replay`. */
export interface ReplayRecord {
  cues: { at: number; kind: ActKind; name: string }[];
}

/** Options for `createDirector`: the vocabulary, the mode, the fire callback, an optional embedder and the timing settings. */
export interface DirectorOptions {
  vocab: ActVocabulary;
  /** "tags": explicit tags only. "hybrid": tags plus inference for untagged sentences. "off": strip tags, fire nothing. */
  mode?: "tags" | "hybrid" | "off";
  fire: (cue: FiredCue) => void;
  onSuppressed?: (cue: Suppressed) => void;
  /** Optional embedder for the resolver (floor 0.55) and the inferrer (floor 0.32, margin 0.07). */
  embedder?: Embedder;
  resolver?: Resolver;
  inferrer?: Inferrer;
  /** Clock in ms. Default Date.now. */
  now?: () => number;
  /** Default 2500 ms (inferred, not measured). */
  gestureCooldownMs?: number;
  /** Time constant of the mood decay. Default 12000 ms (inferred). */
  moodDecayMs?: number;
  /** A mood under this weight counts as gone. Default 0.15. */
  moodFloor?: number;
}

/** Reads a streamed reply, returns the visible text for speech and fires each cue when speech reaches its offset. */
export interface Director {
  /** Start a new reply. Mood, posture and the gesture cooldown carry over. */
  begin(): void;
  /** Feed raw model text. Returns the visible text for speech and the cues placed in this chunk. */
  feed(chunk: string): { text: string; cues: Cue[] };
  /** End of the reply stream. */
  finish(): { text: string; cues: Cue[] };
  /** Speech reached this offset of the visible text. Returns the cues fired now. */
  reached(offset: number): FiredCue[];
  /** A JSON style reply: cues at offset 0 of the say text. */
  json(obj: unknown): { say: string; cues: Cue[] };
  /** Wait for cues still being resolved or inferred by the embedder. */
  settle(): Promise<void>;
  /** The current mood and its weight, or null when it has decayed. */
  mood(): { name: string; weight: number } | null;
  posture(): string | null;
  /** Cues that fired in this reply, for replaying the reply later. */
  record(): ReplayRecord;
  /** Cues waiting for the voice. */
  pending(): readonly Cue[];
}

const OPEN_CLOSE = /^[[*({【「（](.*)[\])}*】」）]$/s;

/** Make a director over a vocabulary that places cues as the reply streams and fires them as speech reports offsets. */
export function createDirector(o: DirectorOptions): Director {
  const v = o.vocab;
  const mode = o.mode ?? "tags";
  const now = o.now ?? (() => Date.now());
  const resolver = o.resolver ?? createResolver(v, o.embedder ? { embedder: o.embedder } : {});
  const inferrer = o.inferrer ?? createInferrer(v, o.embedder ? { embedder: o.embedder } : {});
  const cooldown = o.gestureCooldownMs ?? 2500;
  const decay = o.moodDecayMs ?? 12000;
  const floor = o.moodFloor ?? 0.15;
  const forms = surfaceForms(v);

  let parser: TagParser;
  let vis = "";
  let sentStart = 0;
  let reachedAt = -1;
  let queue: Cue[] = [];
  let fired: ReplayRecord["cues"] = [];
  let inflight: Promise<unknown>[] = [];
  let moodState: { name: string; since: number } | null = null;
  let postureState: string | null = null;
  let lastGesture = -Infinity;

  const begin = () => {
    parser = createTagParser({ keys: { mood: null, gesture: null, posture: null, act: null, cue: forms }, plain: true });
    vis = "";
    sentStart = 0;
    reachedAt = -1;
    queue = [];
    fired = [];
    inflight = [];
  };
  begin();

  const moodNow = (t: number) => {
    if (!moodState) return null;
    const w = Math.exp(-(t - moodState.since) / decay);
    return w >= floor ? { name: moodState.name, weight: w } : null;
  };

  const fire = (c: Cue): FiredCue | null => {
    const t = now();
    let reason: Suppressed["reason"] | null = null;
    if (c.kind === "mood") {
      if (moodNow(t)?.name === c.name) reason = "repeat";
      else moodState = { name: c.name, since: t };
    } else if (c.kind === "gesture") {
      if (t - lastGesture < cooldown) reason = "cooldown";
      else lastGesture = t;
    } else if (postureState === c.name) reason = "repeat";
    else postureState = c.name;
    if (reason) {
      o.onSuppressed?.({ ...c, reason });
      return null;
    }
    const f = { ...c, t };
    fired.push({ at: c.at, kind: c.kind, name: c.name });
    o.fire(f);
    return f;
  };

  const place = (c: Cue): void => {
    if (mode === "off") return;
    if (c.at <= reachedAt) fire(c);
    else queue.push(c);
  };

  /** Split a tag into the names it carries: "[happy, wave]", "[mood: happy, gesture: wave]". */
  const partsOf = (tag: Tag): { kind: ActKind | null; text: string }[] => {
    const keyed = tag.key === "mood" || tag.key === "gesture" || tag.key === "posture" ? (tag.key as ActKind) : null;
    let body = tag.key === "cue" ? (OPEN_CLOSE.exec(tag.raw.trim())?.[1] ?? tag.value) : tag.value;
    body = body.trim();
    return body
      .split(/[,;/]|\band\b/)
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const m = /^(mood|gesture|posture|act)\s*[:=]\s*(.+)$/i.exec(s);
        if (m) {
          const k = m[1]!.toLowerCase();
          return { kind: k === "act" ? null : (k as ActKind), text: m[2]! };
        }
        return { kind: keyed, text: s };
      });
  };

  const fromTags = (tags: Tag[]): Cue[] => {
    const out: Cue[] = [];
    for (const tag of tags) {
      for (const p of partsOf(tag)) {
        const r = resolver.resolve(p.text, p.kind);
        if (r) {
          const c: Cue = { kind: r.kind, name: r.name, at: tag.at, raw: tag.raw, source: "tag" };
          out.push(c);
          place(c);
        } else if (o.embedder && tag.key !== "cue") {
          // keyed tags with an unknown word get the embedding step; plain ones stay lexical
          inflight.push(
            resolver.resolveAsync(p.text, p.kind).then((ra) => {
              if (ra) place({ kind: ra.kind, name: ra.name, at: tag.at, raw: tag.raw, source: "tag" });
            }),
          );
        }
      }
    }
    return out;
  };

  const tagAts: number[] = [];

  const sentences = (final: boolean): Cue[] => {
    if (mode !== "hybrid") return [];
    const out: Cue[] = [];
    const re = /[.?!\n]+(?=\s|$)/g;
    re.lastIndex = sentStart;
    for (;;) {
      const m = re.exec(vis);
      let end: number;
      if (m && (m.index + m[0].length < vis.length || final)) end = m.index + m[0].length;
      else if (final && sentStart < vis.length) end = vis.length;
      else break;
      const s = vis.slice(sentStart, end);
      const start = sentStart + (s.length - s.trimStart().length);
      const tagged = tagAts.some((a) => a >= sentStart && a <= end);
      sentStart = end;
      re.lastIndex = end;
      if (!tagged && s.trim()) {
        const k = inferrer.keyword(s);
        if (k) {
          const c: Cue = { kind: k.kind, name: k.name, at: start, raw: s.trim(), source: "infer" };
          out.push(c);
          place(c);
        } else if (o.embedder) {
          inflight.push(
            inferrer.infer(s).then((ki) => {
              if (ki) place({ kind: ki.kind, name: ki.name, at: start, raw: s.trim(), source: "infer" });
            }),
          );
        }
      }
      if (end >= vis.length) break;
    }
    return out;
  };

  const take = (r: { text: string; tags: Tag[] }, final: boolean) => {
    vis += r.text;
    for (const t of r.tags) tagAts.push(t.at);
    const cues = fromTags(r.tags);
    cues.push(...sentences(final));
    return { text: r.text, cues };
  };

  return {
    begin() {
      tagAts.length = 0;
      begin();
    },
    feed: (chunk) => take(parser.feed(chunk), false),
    finish: () => take(parser.end(), true),
    reached(offset) {
      reachedAt = Math.max(reachedAt, offset);
      const due = queue.filter((c) => c.at <= offset).sort((a, b) => a.at - b.at);
      queue = queue.filter((c) => c.at > offset);
      const out: FiredCue[] = [];
      for (const c of due) {
        const f = fire(c);
        if (f) out.push(f);
      }
      return out;
    },
    json(obj) {
      const { say, names } = cuesFromJson(obj);
      const cues: Cue[] = [];
      for (const n of names) {
        const r = resolver.resolve(n.name, n.kind);
        if (!r) continue;
        const c: Cue = { kind: r.kind, name: r.name, at: 0, raw: n.name, source: "json" };
        cues.push(c);
        place(c);
      }
      return { say, cues };
    },
    async settle() {
      while (inflight.length) {
        const all = inflight;
        inflight = [];
        await Promise.all(all);
      }
    },
    mood: () => moodNow(now()),
    posture: () => postureState,
    record: () => ({ cues: fired.map((c) => ({ ...c })) }),
    pending: () => queue,
  };
}

/**
 * Replay a recorded reply: the same cues fire at the same offsets when the
 * reply is spoken again, with no model and no inference.
 */
export function replay(rec: ReplayRecord, fire: (cue: FiredCue) => void, now: () => number = () => Date.now()): { reached(offset: number): FiredCue[] } {
  let left = [...rec.cues].sort((a, b) => a.at - b.at);
  return {
    reached(offset) {
      const due = left.filter((c) => c.at <= offset);
      left = left.filter((c) => c.at > offset);
      return due.map((c) => {
        const f: FiredCue = { ...c, raw: "", source: "replay", t: now() };
        fire(f);
        return f;
      });
    },
  };
}

/**
 * Jobs: what a person wants a model for, and the records that can do it.
 * A tool asks for a job ("chat", "transcribe"), never for a provider. The
 * records come from the packages that run them; a record listed in more
 * than one place counts once, the running package's copy first.
 */

import { CATALOG, type ModelRecord } from "@hackbuild/models";
import { EMBED_RECORDS } from "@hackbuild/embed";
import { IMAGEGEN_PICKER_RECORDS, IMAGEGEN_RECORDS } from "@hackbuild/imagegen";
import { SPEAK_RECORDS } from "@hackbuild/speak";
import { TRANSCRIBE_RECORDS } from "@hackbuild/transcribe";
import { PICKER_RECORDS, VISION_RECORDS, faceApiRecord } from "@hackbuild/vision";

/** Base URL of the face-api weights (MIT) on the package CDN. */
export const FACE_API_BASE = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model/";

/** A job a model picker serves, such as chat, transcribe, vision or masks. */
export type Job = "chat" | "transcribe" | "vision" | "detect" | "masks" | "image" | "voice" | "depth" | "embed" | "faceswap" | "landmarks";

/** A job's words (line label, sheet title, empty line) and which capabilities serve it. */
export interface JobDef {
  /** The word on a job line: "brain", "ears". */
  label: string;
  /** The sheet's title: "pick a chat model". */
  title: string;
  /** What the gate or the empty line says with nothing picked. */
  empty: string;
  provides: (caps: readonly string[]) => boolean;
}

const has = (...want: string[]) => (caps: readonly string[]) => caps.some((c) => want.includes(c));

/** The words and capability test of every job. */
export const JOBS: Readonly<Record<Job, JobDef>> = {
  chat: { label: "brain", title: "pick a chat model", empty: "no model", provides: has("chat") },
  transcribe: { label: "ears", title: "pick a speech model", empty: "no speech model", provides: has("transcribe") },
  vision: { label: "eyes", title: "pick a vision model", empty: "no vision model", provides: has("vision.ask", "vision.caption") },
  detect: { label: "detector", title: "pick a detector", empty: "no detector", provides: has("detect") },
  masks: { label: "masks", title: "pick a mask model", empty: "no mask model", provides: has("segment", "segment.everything") },
  image: { label: "image", title: "pick an image model", empty: "no image model", provides: has("imagegen") },
  voice: { label: "voice", title: "pick a voice", empty: "no voice", provides: has("speak") },
  depth: { label: "depth", title: "pick a depth model", empty: "no depth model", provides: has("depth") },
  embed: { label: "memory", title: "pick an embedder", empty: "no embedder", provides: has("embed") },
  faceswap: { label: "face swap", title: "pick the face swap models", empty: "no face model", provides: has("face.detect", "face.embed", "face.swap") },
  landmarks: { label: "landmarks", title: "pick a landmark model", empty: "no landmarks", provides: has("landmarks.face", "landmarks.hand", "landmarks.pose", "landmarks.gesture") },
};

/** Every job name, in the order of `JOBS`. */
export const JOB_NAMES = Object.keys(JOBS) as Job[];

/** Every record the views know, the running package's copy of a duplicate first. */
export const ALL_RECORDS: readonly ModelRecord[] = (() => {
  const seen = new Set<string>();
  const out: ModelRecord[] = [];
  for (const r of [...TRANSCRIBE_RECORDS, ...VISION_RECORDS, ...PICKER_RECORDS, ...SPEAK_RECORDS, ...IMAGEGEN_RECORDS, ...IMAGEGEN_PICKER_RECORDS, ...EMBED_RECORDS, faceApiRecord(FACE_API_BASE), ...CATALOG]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    out.push(r);
  }
  return out;
})();

/** The records that do a job, catalogue order kept. */
export function jobRecords(job: Job, records: readonly ModelRecord[] = ALL_RECORDS): ModelRecord[] {
  const def = JOBS[job];
  return records.filter((r) => def.provides(r.provides));
}

/** Whether a string is a job name. */
export function isJob(s: string | null | undefined): s is Job {
  return !!s && s in JOBS;
}

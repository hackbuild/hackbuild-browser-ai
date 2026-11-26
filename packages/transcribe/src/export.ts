/**
 * Transcript exports in the earlier transcription tool's layouts: txt, srt,
 * vtt and json per file, and one store only zip with four files per
 * source plus `manifest.json`. The manifest records the model and language
 * of each file's own run (the earlier tool wrote the select values at
 * export time, which could differ from the run). A speaker label, when a
 * person set one, leads the line in txt and srt and is a voice tag in vtt.
 */

import { timestamp, toSrt, toTxt, zipStore } from "@hackbuild/audio-dsp";
import type { Dropped, Seg } from "./cleanup.js";
import type { Transcript } from "./transcribe.js";

/** One file's transcript with what made it. A `Transcript` plus its source name fits. */
export interface TranscriptDoc {
  /** File name the audio came from. */
  source: string;
  segments: readonly Seg[];
  dropped?: readonly Dropped[];
  stats?: Partial<Transcript["stats"]> | null;
  /** Record id of the run. */
  model: string;
  language: string;
  /** Seconds; falls back to stats.dur. */
  duration?: number;
}

const said = (s: Seg) => (s.speaker ? `${s.speaker}: ${s.text}` : s.text);
const r3 = (x: number) => +x.toFixed(3);

/** Plain text with speaker labels leading their lines; a gap over 2 s starts a paragraph. */
export function asTxt(segs: readonly Seg[]): string {
  return toTxt(segs.map((s) => ({ start: s.start, end: s.end, text: said(s) })));
}

/** SubRip text with speaker labels leading their lines. */
export function asSrt(segs: readonly Seg[]): string {
  return toSrt(segs.map((s) => ({ start: s.start, end: s.end, text: said(s) })));
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** WebVTT text with speakers as voice tags and cue text escaped. */
export function asVtt(segs: readonly Seg[]): string {
  const cue = (s: Seg) => {
    const body = esc(s.text.replace(/-->/g, "->").replace(/\n\s*\n/g, "\n"));
    return s.speaker ? `<v ${esc(s.speaker)}>${body}` : body;
  };
  return "WEBVTT\n\n" + segs.map((s) => `${timestamp(s.start, false)} --> ${timestamp(s.end, false)}\n${cue(s)}\n`).join("\n");
}

function segJson(s: Seg): Record<string, unknown> {
  const o: Record<string, unknown> = { start: r3(s.start), end: r3(s.end), text: s.text };
  if (s.speaker) o.speaker = s.speaker;
  if (s.confidence !== undefined) o.confidence = r3(s.confidence);
  if (s.words?.length) o.words = s.words.map((w) => ({ start: r3(w.start), end: r3(w.end), text: w.text, ...(w.confidence !== undefined ? { confidence: r3(w.confidence) } : {}) }));
  if (s.edited) o.edited = true;
  return o;
}

/** The json export: source, duration, model, language, stats, segments, dropped lines with the reason. */
export function asJson(doc: TranscriptDoc): string {
  return JSON.stringify(
    {
      source: doc.source,
      duration: doc.duration ?? doc.stats?.dur ?? null,
      model: doc.model,
      language: doc.language,
      stats: doc.stats ?? null,
      segments: doc.segments.map(segJson),
      dropped: (doc.dropped ?? []).map((s) => ({ start: r3(s.start), end: r3(s.end), text: s.text, why: s.why })),
    },
    null,
    2,
  );
}

/** A file name without its extension or folder, made safe for a zip entry. */
export function baseName(name: string): string {
  const leaf = name.split(/[\\/]/).pop() ?? name;
  const b = leaf.replace(/\.[^.]+$/, "").replace(/[\u0000-\u001f:*?"<>|]/g, "_").trim();
  return b || "transcript";
}

/** One source's row in `manifest.json`: its model, language and levels. */
export interface ManifestFile {
  source: string;
  model: string;
  language: string;
  duration: number | null;
  lines: number;
  dropped: number;
  levels: { noise_dbfs: number; speech_dbfs: number; snr_db: number; lift_db: number; speech_density: number; realtime_factor: number } | null;
  outputs: string[];
}

/** The `manifest.json` that `bundle` writes into the zip. */
export interface Manifest {
  tool: string;
  generated: string;
  /** The one model of every file, or "mixed". */
  model: string;
  /** The one language of every file, or "mixed". */
  language: string;
  capture: Record<string, unknown> | null;
  files: ManifestFile[];
}

const r1 = (x: number | undefined) => +(x ?? 0).toFixed(1);
const one = (xs: string[]) => (xs.length && xs.every((x) => x === xs[0]) ? xs[0]! : xs.length ? "mixed" : "");

/**
 * The zip of every document: txt, srt, vtt and json per source, and
 * `manifest.json` first. Two sources with one base name get "-2", "-3".
 * Pass `date` for reproducible bytes.
 */
export function bundle(docs: readonly TranscriptDoc[], o: { tool?: string; capture?: Record<string, unknown> | null; date?: Date } = {}): { zip: Uint8Array; manifest: Manifest } {
  const date = o.date ?? new Date();
  const used = new Set<string>();
  const entries: { name: string; data: string }[] = [];
  const files: ManifestFile[] = [];
  for (const d of docs) {
    let b = baseName(d.source);
    for (let i = 2; used.has(b.toLowerCase()); i++) b = `${baseName(d.source)}-${i}`;
    used.add(b.toLowerCase());
    const out = [`${b}.txt`, `${b}.srt`, `${b}.vtt`, `${b}.json`];
    entries.push({ name: out[0]!, data: asTxt(d.segments) }, { name: out[1]!, data: asSrt(d.segments) }, { name: out[2]!, data: asVtt(d.segments) }, { name: out[3]!, data: asJson(d) });
    const s = d.stats;
    files.push({
      source: d.source,
      model: d.model,
      language: d.language,
      duration: d.duration ?? s?.dur ?? null,
      lines: d.segments.length,
      dropped: d.dropped?.length ?? 0,
      levels: s
        ? { noise_dbfs: r1(s.noiseDb), speech_dbfs: r1(s.speechDb), snr_db: r1(s.snrDb), lift_db: r1(s.gainDb), speech_density: +(s.density ?? 0).toFixed(3), realtime_factor: +(s.rtf ?? 0).toFixed(2) }
        : null,
      outputs: out,
    });
  }
  const manifest: Manifest = {
    tool: o.tool ?? "hackbuild-transcribe",
    generated: date.toISOString(),
    model: one(docs.map((d) => d.model)),
    language: one(docs.map((d) => d.language)),
    capture: o.capture ?? null,
    files,
  };
  entries.unshift({ name: "manifest.json", data: JSON.stringify(manifest, null, 2) });
  return { zip: zipStore(entries, date), manifest };
}

/**
 * Transcript import: our own json export, srt and vtt back into segments
 * for editing. Each parser reads what the matching exporter in export.ts
 * writes, so a transcript survives export and import with its times to
 * the millisecond, its text, and its speaker labels; the json keeps
 * confidence, words, the edited mark, dropped lines and the run's model
 * and language too. Files from other tools are read as far as the format
 * allows (cue ids, cue settings, mm:ss stamps, styling tags, notes).
 */

import type { DropReason, Dropped, Seg, Word } from "./cleanup.js";
import type { TranscriptDoc } from "./export.js";

/** The transcript formats `importTranscript` reads. */
export type TranscriptFormat = "json" | "srt" | "vtt";

/** Settings for reading a transcript back. */
export interface ImportOptions {
  /**
   * srt only: read a leading "name: " as the speaker, as asSrt writes it.
   * Off by default, since a colon in a plain line would be taken for one.
   * Labels are 1 to 32 characters with no colon or newline.
   */
  speakers?: boolean;
}

/** Thrown when a file is not a transcript this reads; the message is the copy to show. */
export class TranscriptImportError extends Error {
  override readonly name = "TranscriptImportError";
}

const STAMP = /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/;
const CUE_TIME = new RegExp(`^\\s*${STAMP.source}\\s*-->\\s*${STAMP.source}`);

/** Seconds from an srt or vtt stamp: hh:mm:ss,mmm, hh:mm:ss.mmm or mm:ss.mmm. */
export function parseStamp(s: string): number {
  const m = STAMP.exec(s);
  if (!m) throw new TranscriptImportError(`"${s}" is not a time stamp.`);
  return stampOf(m.slice(1, 5));
}

function stampOf(p: (string | undefined)[]): number {
  const [h, m, s, ms] = p;
  return +((Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms!.padEnd(3, "0")) / 1000).toFixed(3));
}

const lines = (text: string) => text.replace(/^﻿/, "").replace(/\r\n?/g, "\n");

/** Blocks separated by blank lines, each a list of lines. */
const blocks = (text: string) =>
  lines(text)
    .split(/\n[ \t]*\n/)
    .map((b) => b.split("\n"))
    .filter((b) => b.some((l) => l.trim()));

const SPEAKER = /^([^:\n]{1,32}):\s(.*)$/s;

/** Segments from SubRip text; `{ speakers: true }` reads a leading "name: " as the speaker. */
export function parseSrt(text: string, o: ImportOptions = {}): Seg[] {
  const out: Seg[] = [];
  for (const b of blocks(text)) {
    const at = b.findIndex((l) => CUE_TIME.test(l));
    if (at < 0) continue;
    const m = CUE_TIME.exec(b[at]!)!;
    const body = b.slice(at + 1).join("\n").trim();
    const seg: Seg = { start: stampOf(m.slice(1, 5)), end: stampOf(m.slice(5, 9)), text: body };
    const sp = o.speakers ? SPEAKER.exec(body) : null;
    if (sp) {
      seg.speaker = sp[1]!.trim();
      seg.text = sp[2]!.trim();
    }
    out.push(seg);
  }
  if (!out.length && text.trim()) throw new TranscriptImportError("no cues in this srt file. each cue needs a line like 00:00:01,000 --> 00:00:02,000.");
  return out;
}

const ENTITY: Record<string, string> = { amp: "&", lt: "<", gt: ">", nbsp: " ", lrm: "‎", rlm: "‏", quot: '"', apos: "'" };
const unescape = (t: string) => t.replace(/&(amp|lt|gt|nbsp|lrm|rlm|quot|apos);/g, (_, k: string) => ENTITY[k]!);

/** Segments from WebVTT text, with voice tags read as speakers. */
export function parseVtt(text: string): Seg[] {
  const all = blocks(text);
  if (!all.length || !/^WEBVTT(?:[ \t]|$)/.test(all[0]![0]!.trim())) throw new TranscriptImportError("this is not a vtt file. it must start with WEBVTT.");
  const out: Seg[] = [];
  for (const b of all.slice(1)) {
    const first = b[0]!.trim();
    if (/^(NOTE|STYLE|REGION)(\s|$)/.test(first)) continue;
    const at = b.findIndex((l) => CUE_TIME.test(l));
    if (at < 0) continue;
    const m = CUE_TIME.exec(b[at]!)!;
    let body = b.slice(at + 1).join("\n").trim();
    const seg: Seg = { start: stampOf(m.slice(1, 5)), end: stampOf(m.slice(5, 9)), text: "" };
    const v = /^<v(?:\.[^\s>]*)?\s+([^>]+)>/.exec(body);
    if (v) {
      seg.speaker = unescape(v[1]!.trim());
      body = body.slice(v[0].length).replace(/<\/v>\s*$/, "");
    }
    seg.text = unescape(body.replace(/<[^>]*>/g, "")).trim();
    out.push(seg);
  }
  return out;
}

const num = (x: unknown): number | undefined => (typeof x === "number" && Number.isFinite(x) ? x : undefined);
const str = (x: unknown): string | undefined => (typeof x === "string" ? x : undefined);
const REASONS: readonly DropReason[] = ["empty", "watermark", "outro", "phantom", "loop", "repeat"];

function segOf(x: unknown, i: number, where: string): Seg {
  const r = (x ?? {}) as Record<string, unknown>;
  const start = num(r.start);
  const end = num(r.end) ?? start;
  const text = str(r.text);
  if (start === undefined || end === undefined || text === undefined) throw new TranscriptImportError(`${where} ${i + 1} needs a start, an end and a text.`);
  const s: Seg = { start, end, text };
  const speaker = str(r.speaker);
  if (speaker) s.speaker = speaker;
  const c = num(r.confidence);
  if (c !== undefined) s.confidence = c;
  if (Array.isArray(r.words)) {
    s.words = r.words.flatMap((w): Word[] => {
      const o = (w ?? {}) as Record<string, unknown>;
      const ws = num(o.start);
      const we = num(o.end);
      const wt = str(o.text);
      if (ws === undefined || we === undefined || wt === undefined) return [];
      const word: Word = { start: ws, end: we, text: wt };
      const wc = num(o.confidence);
      if (wc !== undefined) word.confidence = wc;
      return [word];
    });
  }
  if (r.edited === true) s.edited = true;
  return s;
}

/** Our json export (asJson, or the audio-dsp toJson layout) back to a document. */
export function parseTranscriptJson(text: string): TranscriptDoc {
  let d: unknown;
  try {
    d = JSON.parse(lines(text));
  } catch {
    throw new TranscriptImportError("this json file does not parse. it may be cut short.");
  }
  const r = (d ?? {}) as Record<string, unknown>;
  if (!Array.isArray(r.segments)) throw new TranscriptImportError("this json file has no segments list. import a transcript json exported from this tool.");
  const doc: TranscriptDoc = {
    source: str(r.source) ?? "",
    model: str(r.model) ?? "",
    language: str(r.language) ?? "",
    segments: r.segments.map((s, i) => segOf(s, i, "segment")),
  };
  const dur = num(r.duration);
  if (dur !== undefined) doc.duration = dur;
  if (r.stats && typeof r.stats === "object") doc.stats = r.stats as NonNullable<TranscriptDoc["stats"]>;
  if (Array.isArray(r.dropped)) {
    doc.dropped = r.dropped.map((x, i): Dropped => {
      const why = str((x as Record<string, unknown> | null)?.why);
      return { ...segOf(x, i, "dropped line"), why: why && (REASONS as string[]).includes(why) ? (why as DropReason) : "phantom" };
    });
  }
  return doc;
}

/** The format of a file, by its extension, else by its first characters. */
export function sniffTranscript(name: string, text: string): TranscriptFormat | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase();
  if (ext === "json" || ext === "srt" || ext === "vtt") return ext;
  const head = lines(text).trimStart();
  if (head.startsWith("WEBVTT")) return "vtt";
  if (head.startsWith("{")) return "json";
  if (/^\d+\s*\n\s*\d{1,2}:\d{2}:\d{2},\d{1,3}\s*-->/.test(head) || CUE_TIME.test(head.split("\n")[0] ?? "")) return "srt";
  return null;
}

/**
 * Read a dropped transcript file into a document for editing. srt and
 * vtt carry no model or language, so those are empty; the source is the
 * file name.
 */
export function importTranscript(name: string, text: string, o: ImportOptions = {}): TranscriptDoc & { format: TranscriptFormat } {
  const format = sniffTranscript(name, text);
  if (!format) throw new TranscriptImportError(`${name} is not a transcript this tool reads. drop a json, srt or vtt file.`);
  if (format === "json") {
    const doc = parseTranscriptJson(text);
    return { ...doc, source: doc.source || name, format };
  }
  const segments = format === "srt" ? parseSrt(text, o) : parseVtt(text);
  return { source: name, model: "", language: "", segments, format };
}

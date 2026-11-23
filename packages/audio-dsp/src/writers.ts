/**
 * File writers: txt, srt, vtt and json transcripts in the earlier transcription tool
 * layouts (byte for byte), lrc in the earlier lyrics tool's, 16 bit and float WAV, standard
 * MIDI files in the earlier transcription tool layout (format 1, 480 ticks per quarter,
 * drums on channel 10), and a store only zip.
 */

export interface Segment {
  start: number;
  end: number;
  text: string;
}

/** hh:mm:ss,mmm (srt) or hh:mm:ss.mmm (vtt); milliseconds rounded, capped at 999. */
export function timestamp(t: number, comma: boolean): string {
  if (!Number.isFinite(t) || t < 0) t = 0;
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = Math.floor(t % 60);
  let ms = Math.round((t - Math.floor(t)) * 1000);
  if (ms > 999) ms = 999;
  const p = (n: number, w: number) => String(n).padStart(w, "0");
  return `${p(h, 2)}:${p(m, 2)}:${p(s, 2)}${comma ? "," : "."}${p(ms, 3)}`;
}

/** Plain text; a gap over 2 s starts a paragraph. */
export function toTxt(segs: readonly Segment[]): string {
  let out = "";
  let last = -99;
  for (const s of segs) {
    if (s.start - last > 2 && out) out += "\n\n";
    else if (out) out += " ";
    out += s.text;
    last = s.end;
  }
  return out + "\n";
}

export function toSrt(segs: readonly Segment[]): string {
  return segs.map((s, i) => `${i + 1}\n${timestamp(s.start, true)} --> ${timestamp(s.end, true)}\n${s.text}\n`).join("\n");
}

export function toVtt(segs: readonly Segment[]): string {
  return "WEBVTT\n\n" + segs.map((s) => `${timestamp(s.start, false)} --> ${timestamp(s.end, false)}\n${s.text}\n`).join("\n");
}

export interface TranscriptJson {
  source: string;
  duration: number;
  model: string;
  language: string;
  stats?: Record<string, unknown> | null;
  segments: readonly Segment[];
  dropped?: readonly { start: number; text: string; why: string }[];
}

/** The earlier transcription tool json export: times to 3 decimals, two space indent. */
export function toJson(t: TranscriptJson): string {
  return JSON.stringify(
    {
      source: t.source,
      duration: t.duration,
      model: t.model,
      language: t.language,
      stats: t.stats ?? null,
      segments: t.segments.map((s) => ({ start: +s.start.toFixed(3), end: +s.end.toFixed(3), text: s.text })),
      dropped: (t.dropped ?? []).map((s) => ({ start: +s.start.toFixed(3), text: s.text, why: s.why })),
    },
    null,
    2,
  );
}

/** mm:ss.xx */
export function lrcStamp(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  return `${String(m).padStart(2, "0")}:${(sec % 60).toFixed(2).padStart(5, "0")}`;
}

export function toLrc(lines: readonly Segment[], title?: string): string {
  let out = title ? `[ti:${title}]\n` : "";
  for (const l of lines) out += `[${lrcStamp(l.start)}]${l.text}\n`;
  return out;
}

/** Lines of an lrc file; a line's end is the next start, or start plus 0.07 s per character (at least 1.5 s). */
export function parseLrc(text: string): Segment[] {
  const lines: { start: number; text: string }[] = [];
  const re = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  for (const raw of text.split(/\r?\n/)) {
    const stamps: number[] = [];
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(raw))) stamps.push(parseInt(m[1]!, 10) * 60 + parseFloat(m[2]!));
    const txt = raw.replace(/\[[^\]]*\]/g, "").trim();
    if (!stamps.length || !txt) continue;
    for (const s of stamps) lines.push({ start: s, text: txt });
  }
  lines.sort((a, b) => a.start - b.start);
  return lines.map((l, i) => ({ ...l, end: i + 1 < lines.length ? lines[i + 1]!.start : l.start + Math.max(1.5, l.text.length * 0.07) }));
}

/** Word timing spread across a line by character count (as earlier builds did). */
export function spreadWords(text: string, start: number, end: number): Segment[] {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  if (!toks.length) return [];
  const chars = toks.reduce((n, t) => n + t.length, 0) || 1;
  const dur = Math.max(0.05, end - start);
  let acc = start;
  const out = toks.map((tk) => {
    const w = (dur * tk.length) / chars;
    const s = { text: tk, start: acc, end: acc + w };
    acc += w;
    return s;
  });
  out[out.length - 1]!.end = end;
  return out;
}

/** WAV bytes, interleaved. 16 bit PCM by default, or 32 bit float. */
export function encodeWav(channels: readonly Float32Array[], sampleRate: number, format: "pcm16" | "float32" = "pcm16"): Uint8Array {
  const n = channels[0]?.length ?? 0;
  const nc = channels.length;
  const bps = format === "pcm16" ? 2 : 4;
  const bytes = n * nc * bps;
  const buf = new ArrayBuffer(44 + bytes);
  const dv = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) dv.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  dv.setUint32(4, 36 + bytes, true);
  str(8, "WAVE");
  str(12, "fmt ");
  dv.setUint32(16, 16, true);
  dv.setUint16(20, format === "pcm16" ? 1 : 3, true);
  dv.setUint16(22, nc, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * nc * bps, true);
  dv.setUint16(32, nc * bps, true);
  dv.setUint16(34, bps * 8, true);
  str(36, "data");
  dv.setUint32(40, bytes, true);
  let o = 44;
  for (let i = 0; i < n; i++)
    for (let c = 0; c < nc; c++) {
      const v = channels[c]![i]!;
      if (format === "float32") dv.setFloat32(o, v, true);
      else {
        const x = Math.max(-1, Math.min(1, v));
        dv.setInt16(o, x < 0 ? x * 0x8000 : x * 0x7fff, true);
      }
      o += bps;
    }
  return new Uint8Array(buf);
}

/** Parse PCM 8, 16, 24, 32 bit or float 32 WAV into channels. */
export function decodeWav(bytes: Uint8Array): { sampleRate: number; channels: Float32Array[] } {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (o: number) => String.fromCharCode(bytes[o]!, bytes[o + 1]!, bytes[o + 2]!, bytes[o + 3]!);
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("not a wav file: no RIFF WAVE header");
  let o = 12;
  let fmt = 0;
  let nc = 0;
  let sr = 0;
  let bits = 0;
  while (o + 8 <= bytes.length) {
    const id = tag(o);
    const len = dv.getUint32(o + 4, true);
    if (id === "fmt ") {
      fmt = dv.getUint16(o + 8, true);
      nc = dv.getUint16(o + 10, true);
      sr = dv.getUint32(o + 12, true);
      bits = dv.getUint16(o + 22, true);
      if (fmt === 0xfffe) fmt = dv.getUint16(o + 32, true);
    } else if (id === "data") {
      if (!nc) throw new Error("wav data before fmt chunk");
      const bps = bits / 8;
      const n = Math.floor(Math.min(len, bytes.length - o - 8) / (bps * nc));
      const ch = Array.from({ length: nc }, () => new Float32Array(n));
      let p = o + 8;
      for (let i = 0; i < n; i++)
        for (let c = 0; c < nc; c++) {
          let v: number;
          if (fmt === 3 && bits === 32) v = dv.getFloat32(p, true);
          else if (bits === 16) v = dv.getInt16(p, true) / 32768;
          else if (bits === 8) v = (dv.getUint8(p) - 128) / 128;
          else if (bits === 24) v = ((dv.getUint8(p) | (dv.getUint8(p + 1) << 8) | (dv.getInt8(p + 2) << 16)) as number) / 8388608;
          else if (bits === 32) v = dv.getInt32(p, true) / 2147483648;
          else throw new Error(`wav: ${bits} bit format ${fmt} is not supported`);
          ch[c]![i] = v;
          p += bps;
        }
      return { sampleRate: sr, channels: ch };
    }
    o += 8 + len + (len & 1);
  }
  throw new Error("wav: no data chunk");
}

export interface MidiNote {
  /** Start, seconds. */
  t: number;
  /** Duration, seconds. */
  dur: number;
  /** MIDI note number. */
  m: number;
  /** Velocity 0 to 1. */
  v: number;
}

export interface MidiTrack {
  name: string;
  notes: readonly MidiNote[];
  /** General MIDI program; ignored for drums. */
  program?: number;
  /** Drum kit on channel 10. */
  drums?: boolean;
}

const TPQ = 480;

function vlq(n: number): number[] {
  const b = [n & 0x7f];
  n >>= 7;
  while (n > 0) {
    b.unshift((n & 0x7f) | 0x80);
    n >>= 7;
  }
  return b;
}

function chunk(events: { tick: number; order: number; bytes: number[] }[]): number[] {
  events.sort((a, b) => a.tick - b.tick || a.order - b.order);
  const data: number[] = [];
  let last = 0;
  for (const ev of events) {
    data.push(...vlq(Math.max(0, Math.round(ev.tick - last))));
    last = ev.tick;
    data.push(...ev.bytes);
  }
  data.push(...vlq(0), 0xff, 0x2f, 0x00);
  const L = data.length;
  return [0x4d, 0x54, 0x72, 0x6b, (L >> 24) & 255, (L >> 16) & 255, (L >> 8) & 255, L & 255, ...data];
}

/** A format 1 file: a tempo track (tempo, 4/4) then one track per input. Note times are seconds at `bpm`. */
export function writeMidi(tracks: readonly MidiTrack[], bpm: number): Uint8Array {
  const out = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, ((tracks.length + 1) >> 8) & 255, (tracks.length + 1) & 255, (TPQ >> 8) & 255, TPQ & 255];
  const us = Math.round(60000000 / bpm);
  out.push(
    ...chunk([
      { tick: 0, order: 0, bytes: [0xff, 0x51, 0x03, (us >> 16) & 255, (us >> 8) & 255, us & 255] },
      { tick: 0, order: 1, bytes: [0xff, 0x58, 0x04, 4, 2, 24, 8] },
    ]),
  );
  const beats = (sec: number) => (sec * bpm) / 60;
  let chan = 0;
  for (const t of tracks) {
    const ch = t.drums ? 9 : chan === 9 ? ++chan : chan;
    if (!t.drums) chan = Math.min(15, chan + 1);
    const ev: { tick: number; order: number; bytes: number[] }[] = [
      { tick: 0, order: 0, bytes: [0xff, 0x03, t.name.length, ...Array.from(t.name, (c) => c.charCodeAt(0) & 127)] },
    ];
    if (!t.drums) ev.push({ tick: 0, order: 1, bytes: [0xc0 | ch, t.program ?? 0] });
    for (const n of t.notes) {
      if (n.t < -1e-6) continue;
      const b = Math.max(0, beats(n.t));
      const on = Math.round(b * TPQ);
      const off = Math.max(on + 1, Math.round((b + beats(n.dur)) * TPQ));
      const m = Math.max(0, Math.min(127, Math.round(n.m)));
      const vel = Math.max(1, Math.min(127, Math.round(n.v * 127)));
      ev.push({ tick: on, order: 2, bytes: [0x90 | ch, m, vel] }, { tick: off, order: 1, bytes: [0x80 | ch, m, 0] });
    }
    out.push(...chunk(ev));
  }
  return new Uint8Array(out);
}

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

export function crc32(b: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** A store only zip (no compression), UTF-8 names. `date` sets the DOS time stamp; pass one for reproducible bytes. */
export function zipStore(entries: readonly { name: string; data: string | Uint8Array }[], date: Date = new Date()): Uint8Array {
  const enc = new TextEncoder();
  const tt = ((date.getHours() & 31) << 11) | ((date.getMinutes() & 63) << 5) | ((date.getSeconds() / 2) & 31);
  const dd = (((date.getFullYear() - 1980) & 127) << 9) | (((date.getMonth() + 1) & 15) << 5) | (date.getDate() & 31);
  const parts: Uint8Array[] = [];
  const cd: Uint8Array[] = [];
  let off = 0;
  for (const e of entries) {
    const nm = enc.encode(e.name);
    const data = typeof e.data === "string" ? enc.encode(e.data) : e.data;
    const crc = crc32(data);
    const lh = new Uint8Array(30 + nm.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(10, tt, true);
    lv.setUint16(12, dd, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, nm.length, true);
    lh.set(nm, 30);
    parts.push(lh, data);
    const ch = new Uint8Array(46 + nm.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(12, tt, true);
    cv.setUint16(14, dd, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nm.length, true);
    cv.setUint32(42, off, true);
    ch.set(nm, 46);
    cd.push(ch);
    off += lh.length + data.length;
  }
  const cds = cd.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, cds, true);
  ev.setUint32(16, off, true);
  const all = [...parts, ...cd, end];
  const out = new Uint8Array(all.reduce((a, p) => a + p.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

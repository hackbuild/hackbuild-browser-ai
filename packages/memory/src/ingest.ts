/**
 * Sources into memory: text, markdown, csv, json, html, mail (.eml), PDF,
 * DOCX and zip files, one by one or a whole folder, read in the browser and
 * cut into chunks a recall can return. pdf.js, mammoth and JSZip load from
 * their pinned CDN builds on first use only; a page or a test can pass its
 * own modules instead.
 */

import type { AddOptions } from "./memory.js";

/** Pinned CDN builds the readers import on first use. */
export const INGEST_URLS = {
  pdfjs: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs",
  pdfjsWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm",
  jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm",
} as const;

/** A file as the readers take it: a Blob with a name, and the folder path when it came from one. */
export type SourceFile = Blob & { name: string; webkitRelativePath?: string };

/** One readable piece of a source: its name (a zip keeps the inner path) and its text. */
export interface SourceText {
  name: string;
  text: string;
  /** "pdf", "docx", "mail", "html", "text". */
  type: string;
}

/** The part of pdf.js the reader uses; tests pass a fake. */
export interface PdfLike {
  GlobalWorkerOptions?: { workerSrc: string };
  getDocument(src: { data: Uint8Array }): { promise: Promise<{ numPages: number; getPage(n: number): Promise<{ getTextContent(): Promise<{ items: { str?: string; hasEOL?: boolean }[] }> }> }> };
}
/** The part of mammoth the reader uses. */
export interface MammothLike {
  extractRawText(o: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
}
/** The part of JSZip the reader uses. */
export interface ZipLike {
  loadAsync(data: ArrayBuffer | Uint8Array): Promise<{ files: Record<string, { dir: boolean; name: string; async(t: "blob"): Promise<Blob> }> }>;
}

/** Options for {@link readSources} and {@link ingest}. */
export interface IngestOptions {
  /** Module importer for the CDN builds; default a native dynamic import. */
  importer?: (url: string) => Promise<unknown>;
  /** Library modules in place of the CDN builds (tests). */
  modules?: { pdfjs?: () => Promise<PdfLike>; mammoth?: () => Promise<MammothLike>; jszip?: () => Promise<ZipLike> };
  /** Characters per chunk. Default 900. */
  chunk?: number;
  /** Characters two chunks share. Default 120. */
  overlap?: number;
  /** Skip files larger than this many bytes. Default 25 MB. */
  maxBytes?: number;
  /** One line per file read, skipped or failed. */
  onFile?: (e: { name: string; chunks: number; note?: string }) => void;
  signal?: AbortSignal;
}

const TEXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|log|ya?ml|toml|ini|xml|rst|tex|srt|vtt|js|ts|py|rs|c|h|cpp|go|java|rb|sh|css)$/i;
const nativeImport = (url: string): Promise<unknown> => import(/* @vite-ignore */ url);

/** What a file is, by name and type: pdf, docx, zip, mail, html, text, or null for one the readers skip. */
export function sourceType(f: { name: string; type?: string }): "pdf" | "docx" | "zip" | "mail" | "html" | "text" | null {
  const n = f.name.toLowerCase();
  const t = (f.type ?? "").toLowerCase();
  if (n.endsWith(".pdf") || t === "application/pdf") return "pdf";
  if (n.endsWith(".docx")) return "docx";
  if (n.endsWith(".zip") || t === "application/zip") return "zip";
  if (n.endsWith(".eml") || n.endsWith(".mbox") || t === "message/rfc822") return "mail";
  if (n.endsWith(".html") || n.endsWith(".htm") || t === "text/html") return "html";
  if (TEXT.test(n) || t.startsWith("text/")) return "text";
  return null;
}

/** Visible text of an html page: scripts and styles dropped, tags to spaces, entities decoded. */
export function htmlText(html: string): string {
  return html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

function qpDecode(s: string): string {
  return s.replace(/=\r?\n/g, "").replace(/=([0-9A-F]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}
function b64Decode(s: string): string {
  try {
    const bin = atob(s.replace(/\s+/g, ""));
    return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}

/**
 * The readable body of a mail message (.eml): subject, from and date, then the
 * plain text part, or the html part as text when there is no plain one.
 * Quoted printable and base64 parts are decoded; attachments are skipped.
 */
export function mailText(raw: string): string {
  const split = raw.search(/\r?\n\r?\n/);
  const head = split < 0 ? raw : raw.slice(0, split);
  const body = split < 0 ? "" : raw.slice(split).replace(/^\r?\n\r?\n/, "");
  const field = (h: string, k: string) => new RegExp(`^${k}:\\s*(.*(?:\\r?\\n[ \\t].*)*)`, "im").exec(h)?.[1]?.replace(/\r?\n[ \t]+/g, " ").trim() ?? "";
  const lead = ["subject", "from", "date"].map((k) => [k, field(head, k)] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
  const decode = (h: string, b: string) => {
    const enc = field(h, "content-transfer-encoding").toLowerCase();
    return enc === "base64" ? b64Decode(b) : enc === "quoted-printable" ? qpDecode(b) : b;
  };
  const parts: { type: string; text: string }[] = [];
  const walk = (h: string, b: string) => {
    const type = field(h, "content-type").toLowerCase();
    const boundary = /boundary="?([^";]+)"?/i.exec(field(h, "content-type"))?.[1];
    if (type.startsWith("multipart/") && boundary) {
      for (const p of b.split(`--${boundary}`).slice(1)) {
        if (p.startsWith("--")) break;
        const s = p.replace(/^\r?\n/, "");
        const at = s.search(/\r?\n\r?\n/);
        if (at < 0) continue;
        walk(s.slice(0, at), s.slice(at).replace(/^\r?\n\r?\n/, ""));
      }
      return;
    }
    if (/attachment/i.test(field(h, "content-disposition"))) return;
    if (!type || type.startsWith("text/plain")) parts.push({ type: "plain", text: decode(h, b) });
    else if (type.startsWith("text/html")) parts.push({ type: "html", text: htmlText(decode(h, b)) });
  };
  walk(head, body);
  const text = (parts.find((p) => p.type === "plain") ?? parts[0])?.text ?? "";
  return [...lead, "", text.trim()].join("\n").trim();
}

/** Splits text into chunks of about `size` characters on paragraph, then sentence, then word bounds, with `overlap` shared. */
export function chunkText(text: string, size = 900, overlap = 120): string[] {
  const clean = text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= size) return [clean];
  const out: string[] = [];
  let i = 0;
  while (i < clean.length) {
    let end = Math.min(clean.length, i + size);
    if (end < clean.length) {
      const win = clean.slice(i, end);
      const cut = Math.max(win.lastIndexOf("\n\n"), win.lastIndexOf(". "), win.lastIndexOf("\n"));
      if (cut > size * 0.5) end = i + cut + 1;
      else {
        const sp = win.lastIndexOf(" ");
        if (sp > size * 0.5) end = i + sp;
      }
    }
    const piece = clean.slice(i, end).trim();
    if (piece) out.push(piece);
    if (end >= clean.length) break;
    i = Math.max(i + 1, end - overlap);
  }
  return out;
}

async function libs(o: IngestOptions) {
  const imp = o.importer ?? nativeImport;
  const cache = new Map<string, Promise<unknown>>();
  const once = <T>(key: string, f: () => Promise<T>): Promise<T> => {
    if (!cache.has(key)) cache.set(key, f());
    return cache.get(key) as Promise<T>;
  };
  return {
    pdfjs: () =>
      once("pdf", async () => {
        const m = (await (o.modules?.pdfjs?.() ?? imp(INGEST_URLS.pdfjs))) as PdfLike;
        if (m.GlobalWorkerOptions && !m.GlobalWorkerOptions.workerSrc) m.GlobalWorkerOptions.workerSrc = INGEST_URLS.pdfjsWorker;
        return m;
      }),
    mammoth: () => once("docx", async () => { const m = (await (o.modules?.mammoth?.() ?? imp(INGEST_URLS.mammoth))) as MammothLike & { default?: MammothLike }; return typeof m.default?.extractRawText === "function" ? m.default : m; }),
    jszip: () => once("zip", async () => { const m = (await (o.modules?.jszip?.() ?? imp(INGEST_URLS.jszip))) as ZipLike & { default?: ZipLike }; return typeof m.default?.loadAsync === "function" ? m.default : m; }),
  };
}

/**
 * Reads files into text, one entry per readable file; a zip yields one per
 * readable file inside it. Files the readers do not know are reported
 * through `onFile` with a note and skipped.
 */
export async function readSources(files: Iterable<SourceFile>, o: IngestOptions = {}): Promise<SourceText[]> {
  const L = await libs(o);
  const max = o.maxBytes ?? 25 * 1024 * 1024;
  const out: SourceText[] = [];
  const read = async (f: SourceFile, name: string): Promise<void> => {
    if (o.signal?.aborted) throw new DOMException("stopped", "AbortError");
    const type = sourceType({ name, type: f.type });
    if (!type) return o.onFile?.({ name, chunks: 0, note: "skipped, not a text, pdf, docx, zip or mail file" });
    if (f.size > max) return o.onFile?.({ name, chunks: 0, note: `skipped, larger than ${Math.round(max / 1048576)} mb` });
    try {
      if (type === "zip") {
        const zip = await (await L.jszip()).loadAsync(await f.arrayBuffer());
        for (const e of Object.values(zip.files)) {
          if (e.dir || /(^|\/)(__MACOSX|\.)/.test(e.name)) continue;
          const blob = await e.async("blob");
          await read(Object.assign(blob, { name: e.name }), `${name}/${e.name}`);
        }
        return;
      }
      let text = "";
      if (type === "pdf") {
        const doc = await (await L.pdfjs()).getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
        const pages: string[] = [];
        for (let p = 1; p <= doc.numPages; p++) {
          const c = await (await doc.getPage(p)).getTextContent();
          pages.push(c.items.map((it) => (it.str ?? "") + (it.hasEOL ? "\n" : " ")).join("").trim());
        }
        text = pages.join("\n\n");
      } else if (type === "docx") text = (await (await L.mammoth()).extractRawText({ arrayBuffer: await f.arrayBuffer() })).value;
      else if (type === "mail") text = mailText(await f.text());
      else if (type === "html") text = htmlText(await f.text());
      else text = await f.text();
      if (!text.trim()) return o.onFile?.({ name, chunks: 0, note: "no text found" });
      out.push({ name, text, type });
    } catch (e) {
      if (o.signal?.aborted) throw e;
      o.onFile?.({ name, chunks: 0, note: `failed: ${e instanceof Error ? e.message : String(e)}` });
    }
  };
  for (const f of files) await read(f, f.webkitRelativePath || f.name);
  return out;
}

/** What a store needs to take sources: add, with options. A `Memory` from `open` fits. */
export interface IngestTarget {
  add(text: string, o?: AddOptions): Promise<{ id: number; merged: boolean }>;
}

/**
 * Reads files and adds each chunk to memory as a "doc" item (docs never
 * decay), with the file name as its section and `meta.source`. Returns the
 * files read and the chunks added.
 */
export async function ingest(mem: IngestTarget, files: Iterable<SourceFile>, o: IngestOptions & { scope?: string } = {}): Promise<{ files: number; chunks: number }> {
  const read = await readSources(files, o);
  let chunks = 0;
  for (const s of read) {
    const parts = chunkText(s.text, o.chunk ?? 900, o.overlap ?? 120);
    for (let i = 0; i < parts.length; i++) {
      if (o.signal?.aborted) throw new DOMException("stopped", "AbortError");
      await mem.add(parts[i]!, { kind: "doc", section: s.name, dedup: false, meta: { source: s.name, type: s.type, part: i + 1, of: parts.length }, ...(o.scope ? { scope: o.scope } : {}) });
    }
    chunks += parts.length;
    o.onFile?.({ name: s.name, chunks: parts.length });
  }
  return { files: read.length, chunks };
}

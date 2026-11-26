/**
 * Source text rewriting for runtimes that must run from file://.
 * Every rewrite reports whether it matched, so an upstream change that
 * moves a patched string is caught at load time instead of failing later.
 */

export type Rewrite = readonly [pattern: RegExp | string, replacement: string];

/** The rewritten text and the rewrites that matched nothing. */
export interface RewriteResult {
  text: string;
  /** Index and pattern of each rewrite that matched nothing. */
  missed: { index: number; pattern: string }[];
}

/** Applies string or RegExp rewrites to source text and reports each one that matched nothing. */
export function rewriteSource(src: string, rewrites: readonly Rewrite[]): RewriteResult {
  let text = src;
  const missed: RewriteResult["missed"] = [];
  rewrites.forEach(([pattern, replacement], index) => {
    if (typeof pattern === "string") {
      if (!text.includes(pattern)) missed.push({ index, pattern });
      else text = text.split(pattern).join(replacement);
    } else {
      const re = pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + "g");
      re.lastIndex = 0;
      if (!re.test(text)) missed.push({ index, pattern: String(pattern) });
      re.lastIndex = 0;
      text = text.replace(re, replacement);
    }
  });
  return { text, missed };
}

// new Worker(<expr>, { type: "module" }) and variants with other keys in the options object.
const MODULE_WORKER = /new\s+Worker\(\s*([^,()]+(?:\([^()]*\))?[^,()]*)\s*,\s*\{([^{}]*)\}\s*\)/g;

/**
 * Turn module workers into classic workers: Chrome refuses module workers
 * from a file:// page (as earlier builds did). Other option keys
 * are kept. Returns the text and how many constructors changed.
 */
export function toClassicWorker(src: string): { text: string; count: number } {
  let count = 0;
  const text = src.replace(MODULE_WORKER, (whole, target: string, opts: string) => {
    if (!/\btype\s*:\s*["'`]module["'`]/.test(opts)) return whole;
    count++;
    const rest = opts
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s && !/^type\s*:/.test(s));
    return rest.length ? `new Worker(${target.trim()}, { ${rest.join(", ")} })` : `new Worker(${target.trim()})`;
  });
  return { text, count };
}

/**
 * Make relative import specifiers absolute against `base`, so a module
 * imported from a Blob or data: URL can still reach its siblings.
 * Covers static `from "./x"`, bare `import "./x"` and dynamic `import("./x")`.
 */
export function absolutizeImports(src: string, base: string): string {
  const abs = (spec: string) => new URL(spec, base).href;
  return src
    .replace(/(\bfrom\s*)(["'])(\.{1,2}\/[^"']*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${abs(spec)}${q}`)
    .replace(/(\bimport\s*)(["'])(\.{1,2}\/[^"']*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${abs(spec)}${q}`)
    .replace(/(\bimport\s*\(\s*)(["'])(\.{1,2}\/[^"']*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${abs(spec)}${q}`);
}

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

/** Base64 of bytes, built in 32 KB steps so no call takes a huge argument list. */
export function bytesToBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  const STEP = 32 * 1024 - ((32 * 1024) % 3);
  for (let off = 0; off < bytes.length; off += STEP) {
    const end = Math.min(bytes.length, off + STEP);
    let s = "";
    for (let i = off; i < end; i += 3) {
      const a = bytes[i]!;
      const b = i + 1 < end ? bytes[i + 1]! : 0;
      const c = i + 2 < end ? bytes[i + 2]! : 0;
      const n = (a << 16) | (b << 8) | c;
      s += B64[(n >> 18) & 63]! + B64[(n >> 12) & 63]!;
      s += i + 1 < end ? B64[(n >> 6) & 63]! : "=";
      s += i + 2 < end ? B64[n & 63]! : "=";
    }
    parts.push(s);
  }
  return parts.join("");
}

/** Decodes base64 text to bytes, skipping characters outside the base64 alphabet. */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
  const pad = b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0;
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4) - (clean.length % 4 === 0 ? pad : 0));
  const lut = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) lut[B64.charCodeAt(i)] = i;
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const n =
      (lut[clean.charCodeAt(i)]! << 18) |
      (lut[clean.charCodeAt(i + 1)]! << 12) |
      ((i + 2 < clean.length ? lut[clean.charCodeAt(i + 2)]! : 0) << 6) |
      (i + 3 < clean.length ? lut[clean.charCodeAt(i + 3)]! : 0);
    if (o < out.length) out[o++] = (n >> 16) & 255;
    if (o < out.length) out[o++] = (n >> 8) & 255;
    if (o < out.length) out[o++] = n & 255;
  }
  return out;
}

/** Encodes text as a base64 data: URL, JavaScript by default. */
export function textToDataUrl(text: string, mime = "text/javascript"): string {
  return `data:${mime};base64,${bytesToBase64(new TextEncoder().encode(text))}`;
}

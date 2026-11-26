// Loads the hackbuild-character wasm core and wraps its extern "C"
// surface. Inputs are copied into wasm memory, one call runs, and the
// result is copied out of the out buffer; a failed call throws with the
// core's message.

import type { Card, Profile, ReadResult } from "./types.js";

/** Where `loadCharacterCore` gets the wasm: a URL to fetch, bytes, or a base64 string such as `CHARACTER_WASM_BASE64`. */
export type CoreSource = { url: string | URL } | { bytes: ArrayBuffer | Uint8Array } | { base64: string };

type Ptr = number;
interface Exports {
  memory: WebAssembly.Memory;
  cc_alloc(len: number): Ptr;
  cc_free(ptr: Ptr, len: number): void;
  cc_out_ptr(): Ptr;
  cc_out_len(): number;
  cc_profile_version(): number;
  cc_read(p: Ptr, n: number): number;
  cc_entry(p: Ptr, n: number, np: Ptr, nn: number): number;
  cc_upgrade(p: Ptr, n: number): number;
  cc_downgrade(p: Ptr, n: number): number;
  cc_validate(p: Ptr, n: number): number;
  cc_migrate(p: Ptr, n: number, create: number): number;
  cc_migrate_profile(p: Ptr, n: number): number;
  cc_write_png(pp: Ptr, pn: number, cp: Ptr, cn: number, mode: number): number;
  cc_write_charx(cp: Ptr, cn: number, fp: Ptr, fn: number, refs: number): number;
  cc_blank_png(w: number, h: number, rgb: number): number;
}

/** The error every failed core call and a failed wasm fetch throw, carrying the core's message. */
export class CharacterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CharacterError";
  }
}

/** Names of the raw operations, as the parity fixture spells them. */
export type RawOp = "read" | "entry" | "upgrade" | "downgrade" | "validate" | "migrate" | "migrate_profile" | "write_png" | "write_charx";

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(s: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  return new Uint8Array((globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer.from(s, "base64"));
}

async function bytesOf(src: CoreSource): Promise<Uint8Array> {
  if ("bytes" in src) return src.bytes instanceof Uint8Array ? src.bytes : new Uint8Array(src.bytes);
  if ("base64" in src) return b64(src.base64);
  const r = await fetch(src.url);
  if (!r.ok) throw new CharacterError(`character wasm: http ${r.status} for ${String(src.url)}`);
  return new Uint8Array(await r.arrayBuffer());
}

/** A card as an object, or card bytes (PNG, CHARX or JSON). */
export type CardInput = Card | Record<string, unknown> | Uint8Array;

const asBytes = (c: CardInput): Uint8Array => (c instanceof Uint8Array ? c : enc.encode(JSON.stringify(c)));

/** A file to put in a CHARX archive: its path inside the archive and its bytes. */
export interface CharxAsset {
  /** Path inside the archive, e.g. "assets/avatar/body.vrm". */
  path: string;
  bytes: Uint8Array;
}

/** The card operations. Every method is synchronous once the core is loaded. */
export class CharacterCore {
  /** The profile extension version this core writes. */
  readonly profileVersion: number;
  constructor(private readonly x: Exports) {
    this.profileVersion = x.cc_profile_version();
  }

  private put(b: Uint8Array): [Ptr, number] {
    if (!b.length) return [0, 0];
    const p = this.x.cc_alloc(b.length);
    new Uint8Array(this.x.memory.buffer, p, b.length).set(b);
    return [p, b.length];
  }

  private call(fn: (...a: number[]) => number, inputs: Uint8Array[], extra: number[] = []): { code: number; out: Uint8Array } {
    const held = inputs.map((b) => this.put(b));
    try {
      const code = fn(...held.flat(), ...extra);
      const out = new Uint8Array(this.x.memory.buffer, this.x.cc_out_ptr(), this.x.cc_out_len()).slice();
      return { code, out };
    } finally {
      for (const [p, n] of held) if (n) this.x.cc_free(p, n);
    }
  }

  /** One raw operation on bytes, as the parity fixture records them. */
  raw(op: RawOp, a: Uint8Array, b: Uint8Array = new Uint8Array(), n = 0): { code: number; out: Uint8Array } {
    const x = this.x;
    switch (op) {
      case "read":
        return this.call(x.cc_read, [a]);
      case "entry":
        return this.call(x.cc_entry, [a, b]);
      case "upgrade":
        return this.call(x.cc_upgrade, [a]);
      case "downgrade":
        return this.call(x.cc_downgrade, [a]);
      case "validate":
        return this.call(x.cc_validate, [a]);
      case "migrate":
        return this.call(x.cc_migrate, [a], [n]);
      case "migrate_profile":
        return this.call(x.cc_migrate_profile, [a]);
      case "write_png":
        return this.call(x.cc_write_png, [a, b], [n]);
      case "write_charx":
        return this.call(x.cc_write_charx, [a, b], [n]);
    }
  }

  private ok(r: { code: number; out: Uint8Array }): Uint8Array {
    if (r.code !== 0) throw new CharacterError(dec.decode(r.out));
    return r.out;
  }
  private json<T>(r: { code: number; out: Uint8Array }): T {
    return JSON.parse(dec.decode(this.ok(r))) as T;
  }

  /** Read a card from PNG, CHARX or JSON bytes; the format is detected from the bytes. */
  read(bytes: Uint8Array): ReadResult {
    return this.json(this.raw("read", bytes));
  }
  /** One file from a CHARX archive. */
  entry(charx: Uint8Array, path: string): Uint8Array {
    return this.ok(this.raw("entry", charx, enc.encode(path)));
  }
  /** Any card (V1, V2, V3) to V3, normalized. */
  upgrade(card: CardInput): Card & { spec: "chara_card_v3" } {
    return this.json(this.raw("upgrade", asBytes(card)));
  }
  /** Any card to V2; V3 only fields are dropped. */
  downgrade(card: CardInput): Card & { spec: "chara_card_v2" } {
    return this.json(this.raw("downgrade", asBytes(card)));
  }
  /** Problems with a card as written, each prefixed by its path. Empty when valid. */
  validate(card: CardInput): string[] {
    return this.json(this.raw("validate", asBytes(card)));
  }
  /** Bring the profile extension to the current version; `create` adds a default one. */
  migrate(card: CardInput, o: { create?: boolean } = {}): { card: Card; notes: string[] } {
    return this.json(this.raw("migrate", asBytes(card), undefined, o.create ? 1 : 0));
  }
  /** A bare profile object to the current version, with notes for every change. */
  migrateProfile(profile: unknown): { profile: Profile; notes: string[] } {
    return this.json(this.raw("migrate_profile", enc.encode(JSON.stringify(profile ?? {}))));
  }
  /**
   * The card in a PNG: `chara` (V2) and `ccv3` (V3) text chunks by
   * default, before IEND, replacing old card chunks. Without an image a
   * plain 64 by 64 PNG is used.
   */
  writePng(card: CardInput, o: { image?: Uint8Array; mode?: "both" | "v3" | "v2" } = {}): Uint8Array {
    const mode = o.mode === "v3" ? 1 : o.mode === "v2" ? 2 : 0;
    return this.ok(this.raw("write_png", o.image ?? new Uint8Array(), asBytes(card), mode));
  }
  /**
   * A CHARX archive: card.json as V3, then the assets, all stored. With
   * `refs` (default), assets the card does not list get `data.assets`
   * records typed from their `assets/<type>/` folder.
   */
  writeCharx(card: CardInput, assets: readonly CharxAsset[] = [], o: { refs?: boolean } = {}): Uint8Array {
    return this.ok(this.raw("write_charx", asBytes(card), packAssets(assets), o.refs === false ? 0 : 1));
  }
  /** A one colour RGB PNG, `rgb` as 0xRRGGBB. */
  blankPng(w: number, h: number, rgb = 0xc8c8c4): Uint8Array {
    return this.ok({ code: this.x.cc_blank_png(w, h, rgb), out: new Uint8Array(this.x.memory.buffer, this.x.cc_out_ptr(), this.x.cc_out_len()).slice() });
  }
}

/** The pack format the core reads: per file a u32 LE name length, name, u32 LE data length, data. */
export function packAssets(assets: readonly CharxAsset[]): Uint8Array {
  const names = assets.map((a) => enc.encode(a.path));
  const total = assets.reduce((s, a, i) => s + 8 + names[i]!.length + a.bytes.length, 0);
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  let o = 0;
  assets.forEach((a, i) => {
    const n = names[i]!;
    dv.setUint32(o, n.length, true);
    out.set(n, o + 4);
    o += 4 + n.length;
    dv.setUint32(o, a.bytes.length, true);
    out.set(a.bytes, o + 4);
    o += 4 + a.bytes.length;
  });
  return out;
}

/** Fetch or decode the character wasm, instantiate it and return a `CharacterCore`. */
export async function loadCharacterCore(src: CoreSource): Promise<CharacterCore> {
  const bytes = await bytesOf(src);
  const { instance } = await WebAssembly.instantiate(bytes as BufferSource, {});
  return new CharacterCore(instance.exports as unknown as Exports);
}

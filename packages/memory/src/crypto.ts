// Sealing at rest with a password, Web Crypto only. A password and a
// lock record give one session key; every seal after that is cheap.
//
// The lock record holds a salt, an iteration count and a verifier, never
// the password. PBKDF2 SHA-256 runs once per session (210,000 iterations
// by default) to a 256 bit master. HKDF SHA-256 splits the master: one
// branch is the verifier stored in the lock, the other derives a fresh
// AES-GCM 256 key per write from a fresh 16 byte salt, with a fresh 12
// byte iv. The master never leaves a non extractable CryptoKey.
//
// There is no recovery. A lost password means the sealed data is gone.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** The default PBKDF2 SHA-256 iteration count. */
export const SEAL_ITERATIONS = 210_000;
/** Envelope bytes added to every sealed payload: magic 4, salt 16, iv 12, tag 16. */
export const SEAL_OVERHEAD = 48;
const MAGIC = enc.encode("HBS1");
const MAX_ITERATIONS = 10_000_000;

/** The lock record: stored beside the sealed data, safe to show. */
export interface SealLock {
  algo: "pbkdf2-sha256";
  iterations: number;
  /** 16 random bytes, base64. */
  salt: string;
  /** The HKDF verifier of the master, 32 bytes, base64. */
  hash: string;
}

export class SealError extends Error {
  constructor(
    message: string,
    readonly code: "wrong-password" | "bad-lock" | "bad-envelope" | "rejected",
  ) {
    super(message);
    this.name = "SealError";
  }
}

/** A session key. Holds a non extractable HKDF key, never the password. */
export class SealKey {
  /** @internal */
  constructor(
    /** The lock salt, which names the key in the session cache. */
    readonly id: string,
    /** @internal */
    readonly master: CryptoKey,
  ) {}
}

type Bytes = Uint8Array<ArrayBuffer>;

/** Base64 without spreading the whole array onto the stack. */
export function toBase64(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

export function fromBase64(s: string): Bytes {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const subtle = (): SubtleCrypto => {
  const s = globalThis.crypto?.subtle;
  if (!s) throw new SealError("seal: no web crypto in this context. sealing needs a secure origin.", "rejected");
  return s;
};

const random = (n: number): Bytes => globalThis.crypto.getRandomValues(new Uint8Array(n));

async function master(password: string, lock: SealLock): Promise<CryptoKey> {
  const s = subtle();
  const pw = await s.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = new Uint8Array(await s.deriveBits({ name: "PBKDF2", salt: fromBase64(lock.salt), iterations: lock.iterations, hash: "SHA-256" }, pw, 256));
  const key = await s.importKey("raw", bits, "HKDF", false, ["deriveBits", "deriveKey"]);
  bits.fill(0);
  return key;
}

async function verifier(m: CryptoKey): Promise<Bytes> {
  return new Uint8Array(await subtle().deriveBits({ name: "HKDF", hash: "SHA-256", salt: new Uint8Array(0), info: enc.encode("hackbuild seal lock v1") }, m, 256));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

function checkLock(lock: SealLock): void {
  const ok =
    lock &&
    lock.algo === "pbkdf2-sha256" &&
    Number.isInteger(lock.iterations) &&
    lock.iterations >= 1 &&
    lock.iterations <= MAX_ITERATIONS &&
    typeof lock.salt === "string" &&
    typeof lock.hash === "string";
  if (!ok) throw new SealError("seal: the lock record is not one this version reads.", "bad-lock");
}

const cache = new Map<string, SealKey>();
const cacheId = (lock: SealLock) => `${lock.salt}:${lock.hash}`;

/**
 * A new lock for a password and its session key, cached. Store the lock
 * beside the data; the password is not kept.
 */
export async function makeLock(password: string, opts: { iterations?: number } = {}): Promise<{ lock: SealLock; key: SealKey }> {
  if (!password) throw new SealError("seal: empty password.", "rejected");
  const lock: SealLock = { algo: "pbkdf2-sha256", iterations: opts.iterations ?? SEAL_ITERATIONS, salt: toBase64(random(16)), hash: "" };
  checkLock({ ...lock, hash: "x" });
  const m = await master(password, lock);
  lock.hash = toBase64(await verifier(m));
  const key = new SealKey(lock.salt, m);
  cache.set(cacheId(lock), key);
  return { lock, key };
}

/** True when the password opens the lock. Constant time compare of the verifier. */
export async function verifyLock(password: string, lock: SealLock): Promise<boolean> {
  checkLock(lock);
  return sameBytes(await verifier(await master(password, lock)), fromBase64(lock.hash));
}

/**
 * The session key for a lock: derives once, checks the password and
 * caches the key for the page's life. A wrong password throws
 * SealError "wrong-password".
 */
export async function deriveKey(password: string, lock: SealLock): Promise<SealKey> {
  checkLock(lock);
  const m = await master(password, lock);
  if (!sameBytes(await verifier(m), fromBase64(lock.hash))) throw new SealError("seal: wrong password. there is no recovery.", "wrong-password");
  const key = new SealKey(lock.salt, m);
  cache.set(cacheId(lock), key);
  return key;
}

/** The cached session key for a lock, or undefined until deriveKey or makeLock ran. */
export function cachedKey(lock: SealLock): SealKey | undefined {
  return cache.get(cacheId(lock));
}

/** Drop one lock's cached key, or every cached key. */
export function forgetKey(lock?: SealLock): void {
  if (lock) cache.delete(cacheId(lock));
  else cache.clear();
}

async function dataKey(key: SealKey, salt: Bytes, use: KeyUsage): Promise<CryptoKey> {
  return subtle().deriveKey({ name: "HKDF", hash: "SHA-256", salt, info: enc.encode("hackbuild seal data v1") }, key.master, { name: "AES-GCM", length: 256 }, false, [use]);
}

const aad = (context: string) => enc.encode(`hbs1|${context}`);

/**
 * Seal bytes. Output: "HBS1", salt 16, iv 12, ciphertext and tag 16, so
 * it is SEAL_OVERHEAD bytes longer than the input. `context` binds the
 * envelope to a place (an item id, a file name); open must pass the same.
 */
export async function sealBytes(key: SealKey, plain: Uint8Array, context = ""): Promise<Bytes> {
  const salt = random(16);
  const iv = random(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, await dataKey(key, salt, "encrypt"), plain as Bytes));
  const out = new Uint8Array(32 + ct.length);
  out.set(MAGIC, 0);
  out.set(salt, 4);
  out.set(iv, 20);
  out.set(ct, 32);
  return out;
}

/** Open sealed bytes. A wrong key, a changed byte or another context throws SealError. */
export async function openBytes(key: SealKey, sealed: Uint8Array, context = ""): Promise<Bytes> {
  if (sealed.length < SEAL_OVERHEAD || !sameBytes(sealed.subarray(0, 4), MAGIC)) throw new SealError("seal: not a sealed envelope.", "bad-envelope");
  const salt = sealed.slice(4, 20);
  const iv = sealed.slice(20, 32);
  try {
    return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv, additionalData: aad(context) }, await dataKey(key, salt, "decrypt"), sealed.slice(32)));
  } catch {
    throw new SealError("seal: the envelope does not open. wrong key, or it was changed.", "rejected");
  }
}

/** Seal a JSON value. */
export async function seal(key: SealKey, value: unknown, context = ""): Promise<Bytes> {
  return sealBytes(key, enc.encode(JSON.stringify(value ?? null)), context);
}

/** Open a sealed JSON value. */
export async function open<T = unknown>(key: SealKey, sealed: Uint8Array, context = ""): Promise<T> {
  return JSON.parse(dec.decode(await openBytes(key, sealed, context))) as T;
}

/** True when bytes start with the envelope magic. */
export function isSealed(b: Uint8Array): boolean {
  return b.length >= SEAL_OVERHEAD && sameBytes(b.subarray(0, 4), MAGIC);
}

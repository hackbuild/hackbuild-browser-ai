// The "@hackbuild/memory/seal" subpath: password sealing at rest and the
// sealed sink. Kept off the main entry so a memory that never seals does
// not carry it.
export {
  type SealLock,
  SealKey,
  SealError,
  SEAL_ITERATIONS,
  SEAL_OVERHEAD,
  makeLock,
  verifyLock,
  deriveKey,
  cachedKey,
  forgetKey,
  seal,
  open,
  sealBytes,
  openBytes,
  isSealed,
  toBase64,
  fromBase64,
} from "./crypto.js";
export { sealedSink } from "./sealed.js";

// A sink that seals what it hands to another sink: item text and
// metadata, vectors (a vector leaks its text) and kv values. At rest the
// inner sink sees item ids, vector and kv key names, and sizes; nothing
// else. The keyword index is never stored: open rebuilds the core index
// in memory from the opened items once the key is given.

import type { MemorySink, StoredItem } from "./sink.js";
import { open, openBytes, seal, sealBytes, SealError, type SealKey } from "./crypto.js";

type Body = Omit<StoredItem, "id">;

const shell = (id: number, sealed: Uint8Array): StoredItem => ({
  id,
  text: "",
  kind: "note",
  scope: "",
  created: 0,
  lastUsed: 0,
  importance: 0,
  arousal: 0,
  valence: 0,
  novelty: 0,
  uses: 0,
  weight: 0,
  meta: { sealed },
});

const asBytes = (x: unknown): Uint8Array | null =>
  x instanceof Uint8Array ? x : x instanceof ArrayBuffer ? new Uint8Array(x) : ArrayBuffer.isView(x) ? new Uint8Array(x.buffer, x.byteOffset, x.byteLength) : null;

const plainRow = (what: string) => new SealError(`memory: ${what} is not sealed. a sealed store reads sealed rows only; export the plain memory and import it into the sealed one.`, "rejected");

/**
 * Wrap a sink so every item, vector and kv value is sealed with `key`
 * (from deriveKey or makeLock in "@hackbuild/memory/seal"). Each envelope
 * is bound to its place, so a row moved to another id does not open.
 * A plain row in the inner sink throws.
 */
export function sealedSink(inner: MemorySink, key: SealKey): MemorySink {
  return {
    kind: inner.kind,
    async loadItems() {
      const rows = await inner.loadItems();
      return Promise.all(
        rows.map(async (r) => {
          const b = asBytes(r.meta?.["sealed"]);
          if (!b) throw plainRow(`item ${r.id}`);
          return { ...(await open<Body>(key, b, `item:${r.id}`)), id: r.id };
        }),
      );
    },
    async putItems(items) {
      const rows = await Promise.all(
        items.map(async ({ id, ...body }) => shell(id, await seal(key, body, `item:${id}`))),
      );
      await inner.putItems(rows);
    },
    deleteItems: (ids) => inner.deleteItems(ids),
    async getVectors(e, ids) {
      const got = await inner.getVectors(e, ids);
      const out = new Map<number, Float32Array>();
      for (const [id, v] of got) {
        const plain = await openBytes(key, new Uint8Array(v.buffer, v.byteOffset, v.byteLength), `vec:${e}|${id}`);
        out.set(id, new Float32Array(plain.buffer, plain.byteOffset, plain.byteLength / 4));
      }
      return out;
    },
    async putVectors(e, m) {
      const out = new Map<number, Float32Array>();
      for (const [id, v] of m) {
        // envelope length is 48 plus 4 per float, so it stays float aligned
        const s = await sealBytes(key, new Uint8Array(v.buffer, v.byteOffset, v.byteLength), `vec:${e}|${id}`);
        out.set(id, new Float32Array(s.buffer, 0, s.byteLength / 4));
      }
      await inner.putVectors(e, out);
    },
    async getKv<T>(k: string) {
      const v = await inner.getKv<unknown>(k);
      if (v === undefined) return undefined;
      const b = asBytes(v);
      if (!b) throw plainRow(`kv ${k}`);
      return open<T>(key, b, `kv:${k}`);
    },
    async putKv(k, v) {
      await inner.putKv(k, await seal(key, v, `kv:${k}`));
    },
    clear: () => inner.clear(),
    close: () => inner.close(),
  };
}

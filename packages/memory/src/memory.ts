// The memory: items in a sink, mirrored into a wasm core index, recalled
// by BM25 plus vectors fused by reciprocal rank.

import { type Core, type CoreHit, type CoreIndex, type Kind, KINDS, kindCode } from "./core.js";
import type { Embedder } from "./embed.js";
import { assembleSections, CoreMemory, expandQuery, select, type Assembled, type Section } from "./assemble.js";
import { indexedDbSink, memorySink, type MemorySink, type StoredItem } from "./sink.js";

const HOUR = 3_600_000;

export interface OpenOptions {
  /** The loaded wasm core (loadCore). */
  core: Core;
  /** Leave out for keyword only recall. */
  embed?: Embedder | null;
  /** Defaults to IndexedDB, then to a Map when IndexedDB fails. */
  sink?: MemorySink;
  indexedDB?: IDBFactory;
  /** Scopes recall searches when a call names none. Default ["self"]. */
  scopes?: string[];
  /** Clock in milliseconds since 1970. Default Date.now. */
  now?: () => number;
  /** Texts per embed call. Default 12. */
  batch?: number;
}

export interface Status {
  mode: "hybrid" | "keyword";
  sink: "indexeddb" | "memory";
  simd: boolean;
  /** Why recall is keyword only, or why the sink is a Map, in lowercase. */
  notes: string[];
}

export interface AddOptions {
  kind?: Kind;
  scope?: string;
  importance?: number;
  arousal?: number;
  valence?: number;
  novelty?: number;
  place?: [number, number, number];
  section?: string;
  entities?: string[];
  meta?: Record<string, unknown>;
  /** Merge into a near duplicate in the same kind and scope. Default true. */
  dedup?: boolean;
  /** Cosine at or above this is a duplicate. Default 0.93 (inferred from the source builds). */
  dupCosine?: number;
  /** Equal text within this many ms is a duplicate. Default 60 000. */
  dupWindowMs?: number;
}

export interface RecallOptions {
  k?: number;
  cand?: number;
  rrfK?: number;
  score?: "linear" | "organic";
  scopes?: string[];
  kinds?: Kind[];
  /** The previous user turn, prepended to a query under 45 characters. */
  previous?: string;
  /** uses + 1 and weight + 0.02 on each hit. Default true. */
  strengthen?: boolean;
  place?: [number, number, number];
  valence?: number;
  weights?: { rel?: number; rec?: number; imp?: number };
  /** Recency time constant in hours for the linear scorer. Default 72. */
  tauH?: number;
  vecFloor?: number;
}

export interface Hit {
  item: StoredItem;
  score: number;
  terms: CoreHit;
}

export interface Recall {
  query: string;
  hits: Hit[];
  /** Every fused candidate, ranked, with its terms: the recall inspector rows. */
  trace: (CoreHit & { text: string; kind: Kind })[];
  mode: Status["mode"];
}

export interface ExportData {
  format: "hackbuild-memory";
  version: 1;
  id: string;
  items: StoredItem[];
  core: string[];
}

/** Opens or creates the memory named id. */
export async function open(id: string, opts: OpenOptions): Promise<Memory> {
  const notes: string[] = [];
  let sink = opts.sink;
  if (!sink) {
    try {
      sink = await indexedDbSink(id, opts.indexedDB ? { indexedDB: opts.indexedDB } : {});
    } catch (e) {
      notes.push(`indexeddb failed (${(e as Error).message}). memory lasts until the page closes.`);
      sink = memorySink();
    }
  }
  const m = new Memory(id, opts, sink, notes);
  await m.load();
  return m;
}

export class Memory {
  readonly core: CoreMemory;
  private readonly index: CoreIndex;
  private readonly items = new Map<number, StoredItem>();
  private scopeCodes = new Map<string, number>();
  private nextId = 1;
  private embedder: Embedder | null;
  private readonly now: () => number;
  private readonly status_: Status;

  constructor(
    readonly id: string,
    private readonly opts: OpenOptions,
    readonly sink: MemorySink,
    notes: string[],
  ) {
    this.embedder = opts.embed ?? null;
    this.now = opts.now ?? (() => Date.now());
    this.index = opts.core.index(this.embedder?.dim ?? 0);
    this.core = new CoreMemory();
    if (!this.embedder) notes.push("no embedder. recall is keyword only.");
    this.status_ = { mode: this.embedder ? "hybrid" : "keyword", sink: sink.kind, simd: opts.core.simd, notes };
  }

  get status(): Status {
    return { ...this.status_, notes: [...this.status_.notes] };
  }

  get size(): number {
    return this.items.size;
  }

  /** @internal */
  async load(): Promise<void> {
    this.scopeCodes = new Map(Object.entries((await this.sink.getKv<Record<string, number>>("scopes")) ?? {}));
    this.core.lines = (await this.sink.getKv<string[]>("core")) ?? [];
    const items = await this.sink.loadItems();
    // ids are never reused, also after the highest ids were removed
    this.nextId = Math.max(this.nextId, (await this.sink.getKv<number>("nextId")) ?? 1);
    for (const it of items) {
      this.items.set(it.id, it);
      this.nextId = Math.max(this.nextId, it.id + 1);
    }
    const vecs = await this.vectorsFor(items);
    for (const it of items) this.index.upsert(this.coreItem(it, vecs.get(it.id)));
  }

  /** Cached vectors under the embedder id; the rest are embedded and cached. */
  private async vectorsFor(items: StoredItem[]): Promise<Map<number, Float32Array>> {
    const e = this.embedder;
    if (!e || !items.length) return new Map();
    const have = await this.sink.getVectors(e.id, items.map((i) => i.id));
    const missing = items.filter((i) => !have.has(i.id));
    const fresh = new Map<number, Float32Array>();
    const batch = this.opts.batch ?? 12;
    try {
      for (let i = 0; i < missing.length; i += batch) {
        const part = missing.slice(i, i + batch);
        const vs = await e.embed(part.map((p) => p.text));
        part.forEach((p, j) => {
          const v = vs[j];
          if (v && v.length === e.dim) fresh.set(p.id, v);
        });
        await Promise.resolve();
      }
    } catch (err) {
      this.dropEmbedder(err);
      return new Map();
    }
    if (fresh.size) await this.sink.putVectors(e.id, fresh);
    for (const [k, v] of fresh) have.set(k, v);
    return have;
  }

  private dropEmbedder(err: unknown): void {
    this.embedder = null;
    this.status_.mode = "keyword";
    this.status_.notes.push(`embedder failed (${(err as Error)?.message ?? String(err)}). recall is keyword only.`);
  }

  private async embedOne(text: string): Promise<Float32Array | null> {
    if (!this.embedder) return null;
    try {
      const [v] = await this.embedder.embed([text]);
      return v ?? null;
    } catch (err) {
      this.dropEmbedder(err);
      return null;
    }
  }

  private scope(name: string): number {
    let c = this.scopeCodes.get(name);
    if (c === undefined) {
      c = this.scopeCodes.size;
      this.scopeCodes.set(name, c);
      void this.sink.putKv("scopes", Object.fromEntries(this.scopeCodes));
    }
    return c;
  }

  private coreItem(it: StoredItem, vector?: Float32Array | null) {
    return {
      id: it.id,
      scope: this.scope(it.scope),
      kind: kindCode(it.kind),
      created: it.created / HOUR,
      lastUsed: it.lastUsed / HOUR,
      importance: it.importance,
      arousal: it.arousal,
      valence: it.valence,
      novelty: it.novelty,
      uses: it.uses,
      weight: it.weight,
      place: it.place,
      text: it.text,
      vector: vector ?? undefined,
    };
  }

  /** Writes a memory, or strengthens its near duplicate. */
  async add(text: string, o: AddOptions = {}): Promise<{ id: number; merged: boolean }> {
    const t = this.now();
    const kind = o.kind ?? "episode";
    const scope = o.scope ?? this.opts.scopes?.[0] ?? "self";
    const vec = await this.embedOne(text);
    if (o.dedup ?? true) {
      const dup = this.index.findDup(
        text,
        vec,
        kindCode(kind),
        this.scope(scope),
        t / HOUR,
        (o.dupWindowMs ?? 60_000) / HOUR,
        o.dupCosine ?? 0.93,
      );
      const it = dup === null ? undefined : this.items.get(dup);
      if (it) {
        it.uses += 1;
        it.importance = Math.max(it.importance, o.importance ?? 0);
        it.lastUsed = Math.max(it.lastUsed, t);
        this.index.upsert(this.coreItem(it, (await this.sink.getVectors(this.embedder?.id ?? "", [it.id])).get(it.id) ?? null));
        await this.sink.putItems([it]);
        return { id: it.id, merged: true };
      }
    }
    const item: StoredItem = {
      id: this.nextId++,
      text,
      kind,
      scope,
      created: t,
      lastUsed: t,
      importance: o.importance ?? 0.4,
      arousal: o.arousal ?? 0,
      valence: o.valence ?? 0,
      novelty: o.novelty ?? 0,
      uses: 0,
      weight: 1,
      ...(o.place ? { place: o.place } : {}),
      ...(o.section ? { section: o.section } : {}),
      ...(o.entities ? { entities: o.entities } : {}),
      ...(o.meta ? { meta: o.meta } : {}),
    };
    this.items.set(item.id, item);
    this.index.upsert(this.coreItem(item, vec));
    await this.sink.putItems([item]);
    await this.sink.putKv("nextId", this.nextId);
    if (vec && this.embedder) await this.sink.putVectors(this.embedder.id, new Map([[item.id, vec]]));
    return { id: item.id, merged: false };
  }

  get(id: number): StoredItem | undefined {
    const it = this.items.get(id);
    return it ? structuredClone(it) : undefined;
  }

  all(): StoredItem[] {
    return [...this.items.values()].map((i) => structuredClone(i));
  }

  async remove(ids: number[]): Promise<void> {
    for (const id of ids) {
      this.items.delete(id);
      this.index.remove(id);
    }
    await this.sink.deleteItems(ids);
  }

  /** Hybrid recall with a full trace of the fused candidates. */
  async recall(q: string, o: RecallOptions = {}): Promise<Recall> {
    const query = expandQuery(q, o.previous);
    const vec = await this.embedOne(query);
    const cand = o.cand ?? 18;
    const k = o.k ?? 6;
    const scopes = o.scopes ?? this.opts.scopes;
    const all = this.index.recall(query, vec, {
      now: this.now() / HOUR,
      k: cand * 2,
      cand,
      rrfK: o.rrfK ?? 60,
      scorer: o.score ?? "linear",
      scopes: scopes?.map((s) => this.scope(s)),
      kinds: o.kinds?.map(kindCode),
      place: o.place,
      valence: o.valence ?? 0,
      wRel: o.weights?.rel ?? 0.55,
      wRec: o.weights?.rec ?? 0.2,
      wImp: o.weights?.imp ?? 0.25,
      tauH: o.tauH ?? 72,
      vecFloor: o.vecFloor ?? 0.12,
    });
    const trace = all.map((h) => ({ ...h, text: this.items.get(h.id)?.text ?? "", kind: this.items.get(h.id)?.kind ?? KINDS[0] }));
    const hits: Hit[] = [];
    for (const h of all.slice(0, k)) {
      const item = this.items.get(h.id);
      if (item) hits.push({ item: structuredClone(item), score: h.score, terms: h });
    }
    if (o.strengthen ?? true) await this.strengthen(hits.map((h) => h.item.id));
    return { query, hits, trace, mode: this.status_.mode };
  }

  private async strengthen(ids: number[]): Promise<void> {
    if (!ids.length) return;
    const nowH = this.now() / HOUR;
    const changed: StoredItem[] = [];
    for (const id of ids) {
      if (!this.index.touch(id, nowH)) continue;
      const n = this.index.numbers(id);
      const it = this.items.get(id);
      if (!n || !it) continue;
      it.lastUsed = n[1]! * HOUR;
      it.uses = n[6]!;
      it.weight = n[7]!;
      changed.push(it);
    }
    await this.sink.putItems(changed);
  }

  /** Drops items whose kind retention is under floor (rule, lore and doc never decay). */
  async decay(floor = 0.05): Promise<number[]> {
    const gone = this.index.decay(this.now() / HOUR, floor);
    for (const id of gone) this.items.delete(id);
    await this.sink.deleteItems(gone);
    return gone;
  }

  /** Merges stored near duplicates by vector, keeping the older item. */
  async mergeNear(threshold = 0.95): Promise<[number, number][]> {
    const pairs = this.index.mergeNear(threshold);
    const changed: StoredItem[] = [];
    for (const [keep, drop] of pairs) {
      const k = this.items.get(keep);
      const n = this.index.numbers(keep);
      if (k && n) {
        k.created = n[0]! * HOUR;
        k.lastUsed = n[1]! * HOUR;
        k.importance = n[2]!;
        k.uses = n[6]!;
        k.weight = n[7]!;
        changed.push(k);
      }
      this.items.delete(drop);
    }
    await this.sink.putItems(changed);
    await this.sink.deleteItems(pairs.map((p) => p[1]));
    return pairs;
  }

  /**
   * Folds old episodes of a scope into one gist once there are more than
   * min of them, keeping the newest keep. summarize gets the folded texts
   * oldest first; without it the gist is a word count summary.
   */
  async consolidate(o: { keep?: number; min?: number; scope?: string; summarize?: (texts: string[]) => Promise<string> } = {}): Promise<{ id: number; folded: number } | null> {
    const keep = o.keep ?? 14;
    const min = o.min ?? 22;
    const scope = o.scope ?? this.opts.scopes?.[0] ?? "self";
    const eps = [...this.items.values()].filter((i) => i.kind === "episode" && i.scope === scope).sort((a, b) => a.created - b.created || a.id - b.id);
    if (eps.length <= min) return null;
    const fold = eps.slice(0, eps.length - keep);
    const texts = fold.map((f) => f.text);
    let text: string;
    try {
      text = o.summarize ? (await o.summarize(texts)).trim() : gistOf(texts);
    } catch {
      text = gistOf(texts);
    }
    if (!text) text = gistOf(texts);
    await this.remove(fold.map((f) => f.id));
    const r = await this.add(text, {
      kind: "gist",
      scope,
      importance: Math.max(...fold.map((f) => f.importance)),
      dedup: false,
    });
    return { id: r.id, folded: fold.length };
  }

  /** Recall, select and budget in one call: core, summary, recalled lines and recent turns. */
  async assemble(o: {
    budgetTokens: number;
    estimate?: (s: string) => number;
    fixed?: string[];
    sections?: Section[];
    core?: boolean;
    summary?: string;
    recent?: string[];
    query?: string;
    previous?: string;
    recall?: RecallOptions;
    select?: { k?: number; maxChars?: number; perSection?: number; dedup?: number };
  }): Promise<Assembled & { recalled: string[] }> {
    let recalled: string[] = [];
    if (o.query) {
      const r = await this.recall(o.query, { ...(o.recall ?? {}), ...(o.previous ? { previous: o.previous } : {}) });
      recalled = select(
        r.hits.map((h) => ({ text: h.item.text, section: h.item.section ?? h.item.kind })),
        o.select ?? {},
      );
    }
    const a = assembleSections({ ...o, coreText: o.core === false ? "" : this.core.text(), recalled });
    return { ...a, recalled };
  }

  /** Adds a pinned fact and persists the core block. */
  async remember(fact: string): Promise<boolean> {
    const ok = this.core.append(fact);
    if (ok) await this.sink.putKv("core", this.core.lines);
    return ok;
  }

  /** Items and core as JSON. Vectors are left out; import re-embeds. */
  export(): ExportData {
    return { format: "hackbuild-memory", version: 1, id: this.id, items: this.all(), core: [...this.core.lines] };
  }

  /** Loads an export. replace (default) clears this memory first. */
  async import(data: ExportData, o: { replace?: boolean } = {}): Promise<number> {
    if (data.format !== "hackbuild-memory" || data.version !== 1) throw new Error("memory: not a hackbuild-memory version 1 export");
    if (o.replace ?? true) {
      await this.remove([...this.items.keys()]);
      this.core.lines = [];
    }
    for (const it of data.items) if (!KINDS.includes(it.kind)) throw new Error(`memory: unknown kind ${JSON.stringify(it.kind)} in import`);
    const incoming = data.items.map((it) => ({ ...it, id: this.nextId++ }));
    for (const it of incoming) this.items.set(it.id, it);
    await this.sink.putItems(incoming);
    await this.sink.putKv("nextId", this.nextId);
    const vecs = await this.vectorsFor(incoming);
    for (const it of incoming) this.index.upsert(this.coreItem(it, vecs.get(it.id)));
    for (const l of data.core) this.core.append(l);
    await this.sink.putKv("core", this.core.lines);
    return incoming.length;
  }

  close(): void {
    this.index.dispose();
    this.sink.close();
  }
}

const STOP = new Set(
  "a an and are as at be but by for from had has have he her his i in is it its me my of on or our she so that the their them then they this to was we were what when with you your".split(" "),
);

/** A gist without a model: the most frequent words and three samples. */
export function gistOf(texts: string[]): string {
  const count = new Map<string, number>();
  for (const t of texts)
    for (const w of t.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [])
      if (w.length > 2 && !STOP.has(w)) count.set(w, (count.get(w) ?? 0) + 1);
  const top = [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, 6).map((e) => e[0]);
  const step = Math.max(1, Math.floor(texts.length / 3));
  const samples = [texts[0], texts[step], texts[2 * step]].filter((s, i, a): s is string => !!s && a.indexOf(s) === i).map((s) => `"${s.slice(0, 80)}"`);
  return `${texts.length} earlier moments. often about ${top.join(", ") || "nothing named"}. for example ${samples.join("; ")}.`;
}

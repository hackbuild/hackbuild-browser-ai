// The memory: items in a sink, mirrored into a wasm core index, recalled
// by BM25 plus vectors fused by reciprocal rank.

import { type Core, type CoreHit, type CoreIndex, type Kind, KINDS, kindCode } from "./core.js";
import type { Embedder } from "./embed.js";
import { assembleSections, CoreMemory, expandQuery, select, type Assembled, type Section } from "./assemble.js";
import { indexedDbSink, memorySink, type MemorySink, type StoredItem } from "./sink.js";
import { howScored, scoreParts, termWeights, tokenize, type RecallParams, type RecallTrace, type TraceRow } from "./trace.js";

const HOUR = 3_600_000;

/** Options for `open`: the loaded core, the embedder, the sink, the scopes and the injected clock. */
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

/** How a memory is running: hybrid or keyword recall, IndexedDB or a Map, SIMD on or off, and why. */
export interface Status {
  mode: "hybrid" | "keyword";
  sink: "indexeddb" | "memory";
  simd: boolean;
  /** Why recall is keyword only, or why the sink is a Map, in lowercase. */
  notes: string[];
}

/** Options for `Memory.add`: kind, scope, importance, emotion, novelty and the other fields stored on the item. */
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
  /** Cosine at or above this is a duplicate. Default 0.93 (inferred). */
  dupCosine?: number;
  /** Equal text within this many ms is a duplicate. Default 60 000. */
  dupWindowMs?: number;
}

/** Options for `Memory.recall`: how many hits, the candidate pool, the scorer, scope and kind filters and the turns to skip. */
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
  /** User turns still in view: a memory whose meta.said is one of them is skipped and the next takes its place. */
  skipSaid?: string[];
}

/** One recalled item with its final score and the core's per stage numbers. */
export interface Hit {
  item: StoredItem;
  score: number;
  terms: CoreHit;
}

/** The result of `Memory.recall`: the hits, every fused candidate as a trace row, and the mode it ran in. */
export interface Recall {
  query: string;
  hits: Hit[];
  /** Every fused candidate, ranked, with its terms: the recall inspector rows. `parts` times `weight` is the score. */
  trace: (CoreHit & { text: string; kind: Kind; weight: number; parts: Record<string, number>; skipped: boolean })[];
  mode: Status["mode"];
  /** What the recall ran with; `Memory.trace` reads it. */
  params: RecallParams;
}

/** The fields `Memory.edit` changes on one item; new text is embedded again. */
export interface EditPatch {
  text?: string;
  kind?: Kind;
  scope?: string;
  importance?: number;
  section?: string;
  entities?: string[];
  meta?: Record<string, unknown>;
}

/** Options for `Memory.compact`: the decay floor, the merge cosine and the episode folding, each of which can be turned off. */
export interface CompactOptions {
  /** Retention floor for decay; false skips decay. Default 0.05. */
  decay?: number | false;
  /** Cosine for merging stored near duplicates; false skips it. Default 0.95. */
  merge?: number | false;
  /** Episode folding into a gist; false skips it. Default on with consolidate's defaults. */
  consolidate?: Parameters<Memory["consolidate"]>[0] | false;
}

/** What `Memory.compact` did: item counts before and after, the ids decayed, the pairs merged and the gist made. */
export interface CompactReport {
  before: number;
  after: number;
  decayed: number[];
  merged: [number, number][];
  gist: { id: number; folded: number } | null;
}

/** The part of the browser's StorageManager the usage line reads. */
export interface StorageLike {
  estimate?: () => Promise<{ usage?: number; quota?: number }>;
  persisted?: () => Promise<boolean>;
  persist?: () => Promise<boolean>;
}

/** What `Memory.usage` reports: item counts by kind, core lines, a computed byte estimate and the browser's storage estimate. */
export interface Usage {
  items: number;
  byKind: Record<Kind, number>;
  coreLines: number;
  /** Bytes of item json plus one float32 vector per item when an embedder is loaded (computed estimate; the store's real overhead is unknown). */
  bytes: number;
  /** The whole origin, from navigator.storage.estimate (vendor estimate); null where the browser gives none. */
  browser: { usage: number | null; quota: number | null; persisted: boolean | null } | null;
}

/** An exchange worth keeping, as a note: null under 3 meaningful words; the reply cut at 160 characters on a word boundary. */
export function exchangeNote(said: string, reply: string, o: { minWords?: number; replyChars?: number } = {}): { text: string; meta: { said: string } } | null {
  const s = said.trim();
  if (tokenize(s).length < (o.minWords ?? 3)) return null;
  const max = o.replyChars ?? 160;
  const r = reply.trim().replace(/\s+/g, " ");
  const short = r.length > max ? `${r.slice(0, max).replace(/\s\S*$/, "")}...` : r;
  return { text: short ? `They said: "${s}" I answered: "${short}"` : `They said: "${s}"`, meta: { said: s } };
}

/** The JSON `Memory.export` gives and `Memory.import` takes: items without vectors and the core memory lines. */
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

/** One agent's memory: add, recall, assemble, edit, compact and export, over the wasm core and a sink. Made by `open`. */
export class Memory {
  readonly core: CoreMemory;
  private readonly index: CoreIndex;
  private readonly items = new Map<number, StoredItem>();
  private scopeCodes = new Map<string, number>();
  /** The last scope table write; awaited before a write returns, so a reopen sees it. */
  private scopesSaved: Promise<void> = Promise.resolve();
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
      const table = Object.fromEntries(this.scopeCodes);
      this.scopesSaved = this.scopesSaved.then(() => this.sink.putKv("scopes", table));
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
    await this.scopesSaved;
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
    const params: RecallParams = {
      scorer: o.score ?? "linear",
      weights: { rel: o.weights?.rel ?? 0.55, rec: o.weights?.rec ?? 0.2, imp: o.weights?.imp ?? 0.25 },
      tauH: o.tauH ?? 72,
      rrfK: o.rrfK ?? 60,
      cand,
      k,
      vecFloor: o.vecFloor ?? 0.12,
      now: this.now(),
      scopes: scopes ? [...scopes] : null,
      kinds: o.kinds ? [...o.kinds] : null,
      place: o.place ?? null,
      valence: o.valence ?? 0,
      skipSaid: o.skipSaid ? [...o.skipSaid] : [],
    };
    const all = this.index.recall(query, vec, {
      now: params.now / HOUR,
      k: cand * 2,
      cand,
      rrfK: params.rrfK,
      scorer: params.scorer,
      scopes: scopes?.map((s) => this.scope(s)),
      kinds: o.kinds?.map(kindCode),
      place: o.place,
      valence: params.valence,
      wRel: params.weights.rel,
      wRec: params.weights.rec,
      wImp: params.weights.imp,
      tauH: params.tauH,
      vecFloor: params.vecFloor,
    });
    const skip = new Set(params.skipSaid.map((t) => t.trim()));
    const trace = all.map((h) => {
      const it = this.items.get(h.id);
      const said = it?.meta?.said;
      return {
        ...h,
        text: it?.text ?? "",
        kind: it?.kind ?? KINDS[0],
        weight: it?.weight ?? 1,
        parts: it ? scoreParts(h, it, params) : {},
        skipped: typeof said === "string" && skip.has(said.trim()),
      };
    });
    const hits: Hit[] = [];
    for (const h of trace) {
      if (hits.length >= k) break;
      const item = this.items.get(h.id);
      if (!item || h.skipped) continue;
      const { text: _t, kind: _k, weight: _w, parts: _p, skipped: _s, ...terms } = h;
      hits.push({ item: structuredClone(item), score: h.score, terms });
    }
    if (o.strengthen ?? true) await this.strengthen(hits.map((h) => h.item.id));
    return { query, hits, trace, mode: this.status_.mode, params };
  }

  /**
   * The recall trace view's object for a recall: per query term weights
   * over the memories the recall could see, and per candidate its rank,
   * used mark, score parts and per term BM25 contributions. Texts are read
   * now, so an edit after the recall shows in the terms.
   */
  trace(r: Recall): RecallTrace {
    const p = r.params;
    const docs = [...this.items.values()].filter((it) => (!p.scopes || p.scopes.includes(it.scope)) && (!p.kinds || p.kinds.includes(it.kind)));
    const { terms, byId } = termWeights(r.query, docs);
    const used = new Set(r.hits.map((h) => h.item.id));
    const rows: TraceRow[] = r.trace.map((h, i) => ({ ...h, rank: i + 1, used: used.has(h.id), terms: byId.get(h.id) ?? [] }));
    return { query: r.query, mode: r.mode, params: p, terms, rows, how: howScored(r.mode, p, rows.length, used.size) };
  }

  /** A recall for the inspector: nothing is strengthened unless asked. */
  async explain(q: string, o: RecallOptions = {}): Promise<RecallTrace> {
    return this.trace(await this.recall(q, { strengthen: false, ...o }));
  }

  /** Changes one memory by hand. New text is embedded again and every cached vector of the old text is dropped. Null when the id is gone. */
  async edit(id: number, patch: EditPatch): Promise<StoredItem | null> {
    const it = this.items.get(id);
    if (!it) return null;
    if (patch.kind !== undefined && !KINDS.includes(patch.kind)) throw new Error(`memory: unknown kind ${JSON.stringify(patch.kind)}`);
    const text = patch.text?.trim();
    if (patch.text !== undefined && !text) throw new Error("memory: an edit cannot empty the text. forget the memory instead.");
    const retext = text !== undefined && text !== it.text;
    if (text !== undefined) it.text = text;
    if (patch.kind !== undefined) it.kind = patch.kind;
    if (patch.scope !== undefined) it.scope = patch.scope;
    if (patch.importance !== undefined) it.importance = Math.min(1, Math.max(0, patch.importance));
    if (patch.section !== undefined) it.section = patch.section;
    if (patch.entities !== undefined) it.entities = [...patch.entities];
    if (patch.meta !== undefined) it.meta = { ...patch.meta };
    it.edited = this.now();
    let vec: Float32Array | null = null;
    if (retext) {
      vec = await this.embedOne(it.text);
      await this.sink.deleteItems([id]);
    } else if (this.embedder) {
      vec = (await this.sink.getVectors(this.embedder.id, [id])).get(id) ?? null;
    }
    this.index.upsert(this.coreItem(it, vec));
    await this.sink.putItems([it]);
    if (retext && vec && this.embedder) await this.sink.putVectors(this.embedder.id, new Map([[id, vec]]));
    return structuredClone(it);
  }

  /** Writes a note of one exchange (kind episode, meta.said), or nothing when the user turn is too short. */
  async addExchange(said: string, reply: string, o: AddOptions & { minWords?: number; replyChars?: number } = {}): Promise<{ id: number; merged: boolean } | null> {
    const { minWords, replyChars, ...add } = o;
    const n = exchangeNote(said, reply, { ...(minWords !== undefined ? { minWords } : {}), ...(replyChars !== undefined ? { replyChars } : {}) });
    if (!n) return null;
    return this.add(n.text, { kind: "episode", ...add, meta: { ...(add.meta ?? {}), said: n.meta.said } });
  }

  /** Decay, near duplicate merge and episode folding in one call, with what each removed. */
  async compact(o: CompactOptions = {}): Promise<CompactReport> {
    const before = this.items.size;
    const decayed = o.decay === false ? [] : await this.decay(o.decay ?? 0.05);
    const merged = o.merge === false || !this.embedder ? [] : await this.mergeNear(o.merge ?? 0.95);
    const gist = o.consolidate === false ? null : await this.consolidate(o.consolidate ?? {});
    return { before, after: this.items.size, decayed, merged, gist };
  }

  /** Counts and an estimate of the bytes this memory holds, plus the browser's estimate for the origin when it gives one. */
  async usage(o: { storage?: StorageLike | null } = {}): Promise<Usage> {
    const byKind = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
    const enc = new TextEncoder();
    let bytes = 0;
    for (const it of this.items.values()) {
      byKind[it.kind]++;
      bytes += enc.encode(JSON.stringify(it)).length;
    }
    bytes += enc.encode(JSON.stringify(this.core.lines)).length;
    if (this.embedder) bytes += this.items.size * this.embedder.dim * 4;
    const st = o.storage === undefined ? (globalThis as { navigator?: { storage?: StorageLike } }).navigator?.storage : o.storage;
    let browser: Usage["browser"] = null;
    if (st?.estimate) {
      try {
        const e = await st.estimate();
        const persisted = st.persisted ? await st.persisted().catch(() => null) : null;
        browser = { usage: e.usage ?? null, quota: e.quota ?? null, persisted };
      } catch {
        browser = null;
      }
    }
    return { items: this.items.size, byKind, coreLines: this.core.lines.length, bytes, browser };
  }

  /** Asks the browser not to clear this origin's storage. False when it says no or cannot. */
  async persist(o: { storage?: StorageLike | null } = {}): Promise<boolean> {
    const st = o.storage === undefined ? (globalThis as { navigator?: { storage?: StorageLike } }).navigator?.storage : o.storage;
    if (!st?.persist) return false;
    try {
      return await st.persist();
    } catch {
      return false;
    }
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
    await this.scopesSaved;
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

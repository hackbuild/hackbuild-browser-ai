/**
 * The talk views around a chat: MemoryPane (what is stored, search, sources,
 * protect, forget, export, import, erase), SourcesDrop (files and folders
 * into memory), PersonaRack (a persona in three parts sent in priority order
 * and trimmed to a budget, with presets), VoiceRow (spoken replies) and
 * SessionMenu (clear, export and import of chats). Each binds a library
 * object to hackbuild-ui classes; none holds a model.
 */

import { type Kind, type StoredItem, type EditPatch, type ExportData, type Recall } from "@hackbuild/memory";
import { memoryCounts, scoreText, PERSONA_TEMPLATE, insertTemplate, costLine, tokenEstimate } from "@virgilvox/hackbuild-ui/vanilla";
import type { ChatList } from "./chat.js";
import type { PersonaRack, Persona, VoiceRow } from "./talk.js";
import { download, esc, listeners, type Mounted } from "./dom.js";

/* ---------- MemoryPane ---------- */

/** What a memory pane needs from a store; a `Memory` from @hackbuild/memory fits. */
export interface MemoryLike {
  all(): StoredItem[];
  add(text: string, o?: { kind?: Kind; section?: string; meta?: Record<string, unknown> }): Promise<unknown>;
  remove(ids: number[]): Promise<void>;
  edit(id: number, patch: EditPatch): Promise<unknown>;
  recall(q: string, o?: { k?: number }): Promise<Recall>;
  export(): ExportData;
  import(data: ExportData, o?: { replace?: boolean }): Promise<number>;
}

/** A memory pane over a host: `refresh` after the store changes elsewhere, `used` to mark what the last reply used. */
export interface MemoryPaneHandle extends Mounted {
  refresh(): void;
  used(labels: readonly string[]): void;
}

/** True when an item is kept out of cleanup: decay never drops it. */
export const isProtected = (it: StoredItem) => it.meta?.protected === true;

/** Protect an item from cleanup (it becomes lore, which never decays) or give it back its kind. */
export async function protect(mem: Pick<MemoryLike, "edit">, it: StoredItem, on: boolean): Promise<void> {
  if (on === isProtected(it)) return;
  const meta = { ...(it.meta ?? {}) };
  if (on) await mem.edit(it.id, { kind: "lore", meta: { ...meta, protected: true, was: it.kind } });
  else {
    const was = (meta.was as Kind | undefined) ?? "fact";
    delete meta.protected;
    delete meta.was;
    await mem.edit(it.id, { kind: was, meta });
  }
}

const sourceOf = (it: StoredItem) => (typeof it.meta?.source === "string" ? (it.meta.source as string).split("/")[0]! : it.kind === "doc" ? it.section ?? "file" : "notes");

/** The memory pane: counts, search, a source filter, add a note, the list with protect and forget, export, import, erase. */
export function mountMemoryPane(host: HTMLElement, mem: MemoryLike, o: { name?: string; onChange?: () => void } = {}): MemoryPaneHandle {
  const l = listeners();
  let query = "";
  let source = "";
  let armed = 0;
  let wipe = false;
  let used = new Set<string>();
  let hits: Map<number, number> | null = null;
  let seq = 0;
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  const box = document.createElement("div");
  host.replaceChildren(box, file);
  const changed = () => (o.onChange?.(), draw());
  const draw = () => {
    const all = mem.all();
    const sources = [...new Set(all.map(sourceOf))];
    let shown = all.filter((it) => !source || sourceOf(it) === source);
    if (hits) shown = shown.filter((it) => hits!.has(it.id)).sort((a, b) => hits!.get(b.id)! - hits!.get(a.id)!);
    else shown = shown.slice().sort((a, b) => b.created - a.created);
    const focus = document.activeElement === box.querySelector("[data-q]");
    box.innerHTML =
      `<section class="hb-mempanel" aria-label="${esc(o.name ?? "memory")}">` +
      `<div class="hb-mempanel-sec"><p class="hb-mempanel-counts">${esc(memoryCounts(all.map((it) => ({ id: String(it.id), text: it.text, kind: it.kind }))) || "nothing stored")}</p></div>` +
      `<div class="hb-mempanel-sec"><input class="hb-input" type="search" data-q placeholder="search memory" aria-label="search memory" value="${esc(query)}">` +
      (sources.length > 1 ? `<div class="hb-chipgroup" role="group" aria-label="source"><button type="button" class="hb-chip${source ? "" : " is-on"}" data-src="" aria-pressed="${!source}">all</button>${sources.map((s) => `<button type="button" class="hb-chip${s === source ? " is-on" : ""}" data-src="${esc(s)}" aria-pressed="${s === source}">${esc(s)}</button>`).join("")}</div>` : "") +
      `</div>` +
      `<div class="hb-mempanel-sec"><textarea class="hb-textarea" rows="2" data-note placeholder="a fact to keep" aria-label="add a note"></textarea><div class="hb-mempanel-row"><button type="button" class="hb-btn hb-btn-sm" data-add>add</button></div></div>` +
      `<div class="hb-mempanel-sec"><h3 class="hb-mempanel-hd">${query ? "matches" : "notes"} (${shown.length})</h3>` +
      (shown.length
        ? `<div class="hb-mempanel-list">${shown
            .slice(0, 200)
            .map((it) => {
              const p = isProtected(it);
              const u = used.has(it.text);
              return (
                `<div class="hb-mem${u ? " is-used" : ""}${p ? " is-pinned" : ""}"><div class="hb-mem-body">${p ? `<span class="hb-mem-pin">kept</span>` : ""}<span class="hb-mem-kind">${esc(p ? String(it.meta?.was ?? it.kind) : it.kind)}${hits?.has(it.id) ? `<b class="hb-mem-score">${esc(scoreText(hits.get(it.id)!))}</b>` : ""}</span><span class="hb-mem-text">${esc(it.text.length > 280 ? `${it.text.slice(0, 277)}...` : it.text)}</span>` +
                `<span class="hb-mem-when">${esc([u ? "used last reply" : "", sourceOf(it) === "notes" ? "" : sourceOf(it)].filter(Boolean).join(", "))}</span></div>` +
                `<div class="hb-mem-acts"><button type="button" class="hb-mem-act${p ? " is-on" : ""}" data-keep="${it.id}" aria-pressed="${p}" aria-label="${p ? "let cleanup drop it" : "keep from cleanup"}" title="${p ? "kept from cleanup" : "keep"}">keep</button><button type="button" class="hb-mem-act is-forget${armed === it.id ? " is-armed" : ""}" data-forget="${it.id}">${armed === it.id ? "forget?" : "forget"}</button></div></div>`
              );
            })
            .join("")}</div>`
        : `<p class="hb-mempanel-empty">${query ? "nothing matches. try other words." : "nothing stored yet. add a note, drop a file, or talk and it fills."}</p>`) +
      `</div>` +
      `<div class="hb-mempanel-foot"><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-export>export</button><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-import>import</button>${all.length ? `<button type="button" class="hb-btn hb-btn-2 hb-btn-sm hb-mempanel-wipe${wipe ? " is-armed" : ""}" data-wipe>${wipe ? "erase everything?" : "erase all"}</button>` : ""}</div></section>`;
    if (focus) {
      const q = box.querySelector<HTMLInputElement>("[data-q]")!;
      q.focus();
      q.setSelectionRange(q.value.length, q.value.length);
    }
  };
  const search = async () => {
    const mine = ++seq;
    if (!query.trim()) hits = null;
    else {
      const r = await mem.recall(query, { k: 50 });
      if (mine !== seq) return;
      hits = new Map(r.hits.map((h) => [h.item.id, h.score]));
    }
    draw();
  };
  l.on(box, "input", (e) => {
    const t = e.target as HTMLElement;
    if (t.matches("[data-q]")) {
      query = (t as HTMLInputElement).value;
      void search();
    }
  });
  l.on(box, "keydown", (e) => {
    const ke = e as KeyboardEvent;
    if ((ke.target as HTMLElement).matches("[data-note]") && ke.key === "Enter" && !ke.shiftKey) {
      ke.preventDefault();
      box.querySelector<HTMLElement>("[data-add]")?.click();
    }
  });
  l.on(box, "click", (e) => {
    const t = e.target as Element;
    const src = t.closest<HTMLElement>("[data-src]");
    if (src) return ((source = src.dataset.src ?? ""), draw());
    const all = () => mem.all();
    const keep = t.closest<HTMLElement>("[data-keep]");
    if (keep) {
      const it = all().find((x) => x.id === Number(keep.dataset.keep));
      if (it) void protect(mem, it, !isProtected(it)).then(changed);
      return;
    }
    const fg = t.closest<HTMLElement>("[data-forget]");
    if (fg) {
      const id = Number(fg.dataset.forget);
      if (armed !== id) return ((armed = id), draw());
      armed = 0;
      void mem.remove([id]).then(changed);
      return;
    }
    if (t.closest("[data-add]")) {
      const ta = box.querySelector<HTMLTextAreaElement>("[data-note]")!;
      const text = ta.value.trim();
      if (text) void mem.add(text, { kind: "fact" }).then(changed);
      return;
    }
    if (t.closest("[data-export]")) return download(`memory-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(mem.export(), null, 2), "application/json");
    if (t.closest("[data-import]")) return file.click();
    if (t.closest("[data-wipe]")) {
      if (!wipe) return ((wipe = true), draw());
      wipe = false;
      void mem.remove(all().map((x) => x.id)).then(changed);
    }
  });
  l.on(file, "change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    void f
      .text()
      .then((t) => mem.import(JSON.parse(t) as ExportData, { replace: false }))
      .then(changed)
      .catch((err: unknown) => {
        box.querySelector(".hb-mempanel-foot")?.insertAdjacentHTML("beforeend", `<p class="hb-error" role="alert">that file did not import: ${esc(err instanceof Error ? err.message : String(err))}</p>`);
      });
  });
  draw();
  return {
    refresh: () => void search(),
    used(labels) {
      used = new Set(labels);
      draw();
    },
    dispose: () => l.off(),
  };
}

/* ---------- SourcesDrop ---------- */

type Entry = { isFile: boolean; isDirectory: boolean; file?(ok: (f: File) => void, bad: (e: unknown) => void): void; createReader?(): { readEntries(ok: (es: Entry[]) => void, bad: (e: unknown) => void): void } };
async function walk(e: Entry, out: File[], path: string, depth = 0): Promise<void> {
  if (e.isFile && e.file) {
    const f = await new Promise<File>((ok, bad) => e.file!(ok, bad));
    out.push(path ? Object.assign(new File([f], f.name, { type: f.type }), { webkitRelativePath: `${path}/${f.name}` }) : f);
  } else if (e.isDirectory && e.createReader && depth < 8) {
    const r = e.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, bad) => r.readEntries(ok, bad));
      if (!batch.length) break;
      for (const c of batch) await walk(c, out, path ? `${path}/${(e as unknown as { name: string }).name}` : (e as unknown as { name: string }).name, depth + 1);
    }
  }
}

/** Options for a sources drop: what reads the files into memory, and a line per file. */
export interface SourcesDropOptions {
  /** @hackbuild/memory `ingest(mem, files, o)` bound to a store. */
  ingest: (files: File[], o: { onFile: (e: { name: string; chunks: number; note?: string }) => void }) => Promise<{ files: number; chunks: number }>;
  accept?: string;
}

/** A drop zone for sources: files or a whole folder of text, pdf, docx, zip and mail go into memory; a line per file says what came in. */
export function mountSourcesDrop(host: HTMLElement, o: SourcesDropOptions): Mounted {
  const l = listeners();
  const pick = (dir: boolean) => {
    const i = document.createElement("input");
    i.type = "file";
    i.hidden = true;
    i.multiple = true;
    if (dir) i.setAttribute("webkitdirectory", "");
    else i.accept = o.accept ?? ".txt,.md,.csv,.json,.html,.htm,.pdf,.docx,.zip,.eml,text/*";
    return i;
  };
  const files = pick(false);
  const dir = pick(true);
  const zone = document.createElement("div");
  const log = document.createElement("ul");
  zone.className = "hb-dropzone";
  zone.innerHTML = `<p class="hb-note">drop files or a folder: text, pdf, docx, zip, mail. they are read here and kept in this browser.</p><div class="hb-toolbar"><button type="button" class="hb-btn hb-btn-sm" data-files>add files</button><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-dir>a folder</button></div>`;
  log.className = "hb-list";
  log.setAttribute("aria-live", "polite");
  host.replaceChildren(zone, log, files, dir);
  const line = (t: string, err = false) => log.insertAdjacentHTML("afterbegin", `<li${err ? ` class="hb-error"` : ""}>${esc(t)}</li>`);
  const run = (list: File[]) => {
    if (!list.length) return;
    zone.classList.add("is-busy");
    line(`reading ${list.length} file${list.length === 1 ? "" : "s"}`);
    o.ingest(list, { onFile: (e) => line(e.note ? `${e.name}: ${e.note}` : `${e.name}: ${e.chunks} part${e.chunks === 1 ? "" : "s"}`, !!e.note && e.note.startsWith("failed")) })
      .then((r) => line(`done. ${r.files} file${r.files === 1 ? "" : "s"}, ${r.chunks} parts in memory.`))
      .catch((err: unknown) => line(`stopped: ${err instanceof Error ? err.message : String(err)}`, true))
      .finally(() => zone.classList.remove("is-busy"));
  };
  l.on(zone, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-files]")) files.click();
    else if (t.closest("[data-dir]")) dir.click();
  });
  for (const i of [files, dir])
    l.on(i, "change", () => {
      run([...(i.files ?? [])]);
      i.value = "";
    });
  l.on(zone, "dragover", (e) => (e.preventDefault(), zone.classList.add("is-over")));
  l.on(zone, "dragleave", () => zone.classList.remove("is-over"));
  l.on(zone, "drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    const dt = (e as DragEvent).dataTransfer;
    const entries = [...(dt?.items ?? [])].map((i) => (i.webkitGetAsEntry?.() as unknown as Entry | null)).filter((x): x is Entry => x !== null && x !== undefined);
    if (!entries.length) return run([...(dt?.files ?? [])]);
    const out: File[] = [];
    void Promise.all(entries.map((en) => walk(en, out, "").catch(() => undefined))).then(() => run(out));
  });
  return { dispose: () => l.off() };
}

/* ---------- PersonaRack ---------- */

/** The persona rack: presets one press away, name, the three parts with their cost, the template, save, and the persona as a file. */
export function mountPersonaRack(host: HTMLElement, rack: PersonaRack): Mounted {
  const l = listeners();
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  const box = document.createElement("div");
  host.replaceChildren(box, file);
  let err = "";
  const field = (key: keyof Persona, label: string, hint: string, rows: number, v: string) =>
    `<div class="hb-field"><span class="hb-field-head"><label class="hb-label" for="pr-${key}">${label}</label></span><textarea id="pr-${key}" class="hb-textarea" rows="${rows}" data-k="${key}" placeholder="${esc(hint)}">${esc(v)}</textarea><span class="hb-field-foot"><span class="hb-hint">${esc(costLine(tokenEstimate(v)))}</span></span></div>`;
  const draw = () => {
    if (box.contains(document.activeElement) && (document.activeElement as HTMLElement).matches("[data-k]")) return;
    const { persona: p, presets, on, builtIn } = rack.snapshot();
    box.innerHTML =
      `<div class="hb-persona"><div class="hb-persona-presets"><div class="hb-persona-chips" role="group" aria-label="personas">${presets
        .map((x, i) => `<span class="hb-persona-chip${i === on ? " is-on" : ""}"><button type="button" class="hb-persona-chip-n" data-load="${i}" aria-pressed="${i === on}">${esc(x.label)}</button>${i < builtIn ? "" : `<button type="button" class="hb-persona-chip-x" data-rm="${i}" aria-label="remove ${esc(x.label)}">&times;</button>`}</span>`)
        .join("")}</div></div>` +
      `<div class="hb-field"><span class="hb-field-head"><label class="hb-label" for="pr-name">name</label></span><input id="pr-name" class="hb-input" data-k="name" value="${esc(p.name)}" autocomplete="off"></div>` +
      field("profile", "profile", "who you are talking to and how to answer. always sent.", 5, p.profile) +
      `<div class="hb-persona-row"><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-tpl>insert template</button></div>` +
      field("notes", "extra notes", "sent after memory; dropped before the profile when room runs out.", 3, p.notes) +
      field("rules", "extra rules", "dropped first when room runs out.", 3, p.rules) +
      `<form class="hb-persona-save" data-save><input class="hb-input" data-label placeholder="${esc(p.name || "preset name")}" aria-label="preset name" autocomplete="off"><button type="submit" class="hb-btn hb-btn-2 hb-btn-sm">save</button></form>` +
      `<div class="hb-persona-row"><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-import>import</button><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-export>export</button></div>${err ? `<p class="hb-error" role="alert">${esc(err)}</p>` : ""}</div>`;
  };
  l.on(box, "input", (e) => {
    const t = e.target as HTMLInputElement;
    const k = t.dataset.k as keyof Persona | undefined;
    if (k) {
      rack.set({ [k]: t.value });
      const foot = t.parentElement?.querySelector(".hb-hint");
      if (foot) foot.textContent = costLine(tokenEstimate(t.value));
    }
  });
  l.on(box, "focusout", () => setTimeout(draw, 0));
  l.on(box, "submit", (e) => {
    e.preventDefault();
    rack.save(box.querySelector<HTMLInputElement>("[data-label]")?.value ?? "");
  });
  l.on(box, "click", (e) => {
    const t = e.target as Element;
    const ld = t.closest<HTMLElement>("[data-load]");
    if (ld) return rack.load(Number(ld.dataset.load));
    const rm = t.closest<HTMLElement>("[data-rm]");
    if (rm) return rack.removePreset(Number(rm.dataset.rm));
    if (t.closest("[data-tpl]")) {
      const p = rack.snapshot().persona;
      rack.set({ profile: insertTemplate(p.profile, PERSONA_TEMPLATE, p.name) });
      return draw();
    }
    if (t.closest("[data-export]")) {
      const p = rack.snapshot().persona;
      return download(`${(p.name || "persona").replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.persona.json`, JSON.stringify({ v: 1, name: p.name, prompt: p.profile, notes: p.notes, rules: p.rules, ...(p.first ? { first: p.first } : {}) }, null, 2), "application/json");
    }
    if (t.closest("[data-import]")) file.click();
  });
  l.on(file, "change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    void f.text().then((t) => {
      try {
        const j = JSON.parse(t) as Record<string, unknown>;
        const profile = typeof j.prompt === "string" ? j.prompt : typeof j.system_prompt === "string" ? j.system_prompt : typeof j.description === "string" ? j.description : "";
        if (!profile && typeof j.name !== "string") throw new Error("no name or prompt in it");
        err = "";
        rack.set({ name: String(j.name ?? "assistant"), profile, notes: String(j.notes ?? ""), rules: String(j.rules ?? ""), ...(typeof j.first === "string" ? { first: j.first } : {}) });
      } catch (e2) {
        err = `that file is not a persona: ${e2 instanceof Error ? e2.message : String(e2)}`;
      }
      draw();
    });
  });
  l.add(rack.subscribe(draw));
  return { dispose: () => l.off() };
}

/* ---------- VoiceRow ---------- */

/** The voice row: auto speak, voice, rate, pitch, test and stop. */
export function mountVoiceRow(host: HTMLElement, row: VoiceRow, o: { test?: string } = {}): Mounted {
  const l = listeners();
  const draw = () => {
    if (host.contains(document.activeElement) && (document.activeElement as HTMLElement).matches("input[type=range]")) return;
    const s = row.snapshot();
    host.innerHTML =
      `<div class="hb-panel"><label class="hb-check"><input type="checkbox" data-auto${s.auto ? " checked" : ""}> speak each reply</label>` +
      `<div class="hb-field"><span class="hb-field-head"><label class="hb-label" for="vr-voice">voice</label></span><select id="vr-voice" class="hb-select" data-voice><option value="">system default</option>${s.voices.map((v) => `<option${v === s.voice ? " selected" : ""}>${esc(v)}</option>`).join("")}</select></div>` +
      `<div class="hb-slider"><span class="hb-label">rate</span><span class="hb-readout">${s.rate.toFixed(1)}</span><input type="range" min="0.5" max="2" step="0.1" value="${s.rate}" data-rate aria-label="rate"></div>` +
      `<div class="hb-slider"><span class="hb-label">pitch</span><span class="hb-readout">${s.pitch.toFixed(1)}</span><input type="range" min="0" max="2" step="0.1" value="${s.pitch}" data-pitch aria-label="pitch"></div>` +
      `<div class="hb-toolbar">${s.speaking ? `<button type="button" class="hb-btn hb-btn-sm" data-stop>stop</button>` : `<button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-test>test</button>`}</div>${s.error ? `<p class="hb-error" role="alert">${esc(s.error)}</p>` : ""}</div>`;
  };
  l.on(host, "input", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches("[data-rate]")) row.set({ rate: Number(t.value) });
    else if (t.matches("[data-pitch]")) row.set({ pitch: Number(t.value) });
    const r = t.parentElement?.querySelector(".hb-readout");
    if (r && t.type === "range") r.textContent = Number(t.value).toFixed(1);
  });
  l.on(host, "change", (e) => {
    const t = e.target as HTMLInputElement;
    if (t.matches("[data-auto]")) row.set({ auto: t.checked });
    else if (t.matches("[data-voice]")) row.set({ voice: t.value });
    else if (t.type === "range") draw();
  });
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-test]")) void row.speak(o.test ?? "this is how replies will sound.");
    else if (t.closest("[data-stop]")) row.stop();
  });
  l.add(row.subscribe(draw));
  return { dispose: () => (row.stop(), l.off()) };
}

/* ---------- SessionMenu ---------- */

/** The session menu of a chat list: clear the open chat, export it as markdown, every chat as json, and import. */
export function mountSessionMenu(host: HTMLElement, list: ChatList, o: { onImport?: (n: number) => void } = {}): Mounted {
  const l = listeners();
  const file = document.createElement("input");
  file.type = "file";
  file.accept = ".json,application/json";
  file.hidden = true;
  const box = document.createElement("div");
  host.replaceChildren(box, file);
  let armed = false;
  let note = "";
  const draw = () => {
    const has = list.thread.snapshot().turns.length > 0;
    box.innerHTML =
      `<div class="hb-toolbar" role="group" aria-label="session">${has ? `<button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-md>save as markdown</button>` : ""}<button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-json>export chats</button><button type="button" class="hb-btn hb-btn-2 hb-btn-sm" data-import>import chats</button>${has ? `<button type="button" class="hb-btn hb-btn-2 hb-btn-sm${armed ? " is-armed" : ""}" data-clear>${armed ? "clear this chat?" : "clear"}</button>` : ""}</div>${note ? `<p class="hb-note" role="status">${esc(note)}</p>` : ""}`;
  };
  l.on(box, "click", (e) => {
    const t = e.target as Element;
    const day = new Date().toISOString().slice(0, 10);
    if (t.closest("[data-md]")) return download(`chat-${day}.md`, list.thread.markdown(), "text/markdown");
    if (t.closest("[data-json]")) return download(`chats-${day}.json`, JSON.stringify(list.dump(), null, 2), "application/json");
    if (t.closest("[data-import]")) return file.click();
    if (t.closest("[data-clear]")) {
      if (!armed) return ((armed = true), draw());
      armed = false;
      list.thread.clear();
    }
  });
  l.on(file, "change", () => {
    const f = file.files?.[0];
    file.value = "";
    if (!f) return;
    void f.text().then((t) => {
      try {
        const data = JSON.parse(t);
        list.restore(data);
        note = `${data.chats.length} chat${data.chats.length === 1 ? "" : "s"} imported.`;
        o.onImport?.(data.chats.length);
      } catch (err) {
        note = `that file did not import: ${err instanceof Error ? err.message : String(err)}`;
      }
      draw();
    });
  });
  l.add(list.subscribe(() => draw()));
  return { dispose: () => l.off() };
}

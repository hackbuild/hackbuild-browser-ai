/**
 * TranscribeDrop, TranscriptView and their rack parts in the DOM: the drop zone is the page until a file is in
 * it, then the transcript is. Lines carry their time, edit in place (one
 * undo step each), and export as txt, srt, vtt and json once there is text.
 */

import { clockTime, droppedLine, stripStatus } from "@virgilvox/hackbuild-ui/vanilla";
import { ICON, download, esc, listeners, type Mounted, show } from "./dom.js";
import type { Channel, ExportKind, QueueSnapshot, TranscribeQueue } from "./transcribe.js";

/**
 * Options for a transcript: speaker fields, a seek callback for the times, and whether dropped
 * lines show in place.
 */
export interface TranscriptViewOptions {
  /** Speaker fields beside each line. Off by default: they are inputs, and a subject keeps few controls. */
  speakers?: boolean;
  /** Times as buttons that seek a player. */
  onSeek?: (seconds: number) => void;
  /** Show dropped lines in place. */
  showDropped?: boolean;
}

/** The HTML of one channel's transcript, or an empty note when there is none. */
export function transcriptHtml(c: Channel | undefined, o: TranscriptViewOptions = {}): string {
  if (!c) return `<p class="hb-lay-empty-note">nothing yet. drop a file.</p>`;
  const st = stripStatus(c.status);
  const head = `<div class="hb-panel-hd-inst" role="status">${esc(c.name)}, ${esc(st.word)}${c.status === "working" ? `, ${c.pct}%` : ""}</div>${c.error ? `<p class="hb-lay-empty-note">${esc(c.error)}</p>` : ""}`;
  if (!c.segments.length) return `<section class="hb-panel">${head}</section>`;
  const drops = c.dropped.length ? `<li class="hb-tseg-note">${esc(droppedLine(c.dropped))}</li>` : "";
  const rows = c.segments
    .map((s, i) => {
      const t = clockTime(s.start);
      const time = o.onSeek ? `<button type="button" class="hb-tseg-t" data-seek="${s.start}" aria-label="play from ${t}">${t}</button>` : `<span class="hb-tseg-t">${t}</span>`;
      const who = o.speakers ? `<input class="hb-tseg-who" data-who="${i}" placeholder="speaker" aria-label="speaker at ${t}" value="${esc(s.speaker ?? "")}">` : s.speaker ? `<b>${esc(s.speaker)}: </b>` : "";
      return `<li><div class="hb-tseg"><span class="hb-tseg-body">${time}${who}<span class="hb-tseg-text" contenteditable="true" role="textbox" aria-label="text at ${t}" data-line="${i}">${esc(s.text)}</span>${s.edited ? `<span class="hb-tseg-why">edited</span>` : ""}</span></div></li>`;
    })
    .join("");
  const dropped = o.showDropped ? c.dropped.map((d) => `<li><div class="hb-tseg is-dropped"><span class="hb-tseg-body"><span class="hb-tseg-t">${clockTime(d.start)}</span><span class="hb-tseg-text">${esc(d.text)}</span><span class="hb-tseg-why">[${esc(d.why)}]</span></span></div></li>`).join("") : "";
  return `<section class="hb-panel">${head}<ol class="hb-transcript is-edit" aria-label="transcript">${drops}${rows}${dropped}</ol></section>`;
}

const pickedOf = (s: QueueSnapshot) => s.channels.find((c) => c.id === s.selected);

/** The selected channel's transcript over a host. */
export function mountTranscriptView(host: HTMLElement, queue: TranscribeQueue, o: TranscriptViewOptions = {}): Mounted {
  const l = listeners();
  let drawn = "";
  const draw = (s: QueueSnapshot) => {
    // a line being typed in is not redrawn under the caret
    if (host.contains(document.activeElement) && (document.activeElement as HTMLElement).isContentEditable) return;
    const html = transcriptHtml(pickedOf(s), o);
    if (html !== drawn) host.innerHTML = drawn = html;
  };
  const commit = (el: HTMLElement) => {
    const s = queue.snapshot();
    const c = pickedOf(s);
    if (!c) return;
    if (el.dataset.line !== undefined) queue.edit(c.id, Number(el.dataset.line), { text: (el.textContent ?? "").trim() });
    else if (el.dataset.who !== undefined) queue.edit(c.id, Number(el.dataset.who), { speaker: (el as HTMLInputElement).value.trim() });
  };
  l.on(host, "focusout", (e) => {
    commit(e.target as HTMLElement);
    draw(queue.snapshot());
  });
  l.on(host, "keydown", (e) => {
    const ke = e as KeyboardEvent;
    const el = ke.target as HTMLElement;
    if (ke.key === "Enter" && el.isContentEditable) {
      ke.preventDefault();
      el.blur();
    }
  });
  l.on(host, "click", (e) => {
    const seek = (e.target as Element).closest<HTMLElement>("[data-seek]");
    if (seek) o.onSeek?.(Number(seek.dataset.seek));
  });
  l.add(queue.subscribe(draw));
  return { dispose: () => l.off() };
}

/**
 * Options for `mountTranscribeDrop`: accepted types, empty state words and a sample button, plus
 * the transcript view options.
 */
export interface TranscribeDropOptions extends TranscriptViewOptions {
  accept?: string;
  title?: string;
  note?: string;
  pickLabel?: string;
  /** A "choose a folder" button; a dropped folder is read whole either way. */
  folders?: boolean;
  /** A sample a person can try with no file; the page queues it. */
  sampleLabel?: string;
  onSample?: () => void;
}

/** A mounted drop zone whose `pick` opens the file picker. */
export interface TranscribeDropHandle extends Mounted {
  /** Open the file picker: the add files verb. */
  pick(): void;
  /** Open the folder picker. */
  pickFolder(): void;
}

const AV = /\.(mp4|m4v|mov|webm|mkv|avi|mpe?g|ogv|m4a|mp3|wav|flac|ogg|opus|aac|wma|3gp)$/i;
/** A file a speech run can read: audio or video by type or by name. */
export const isMedia = (f: { name: string; type: string }) => /^(audio|video)\//.test(f.type) || AV.test(f.name);

type Entry = { isFile: boolean; isDirectory: boolean; name: string; file?(ok: (f: File) => void, bad: (e: unknown) => void): void; createReader?(): { readEntries(ok: (es: Entry[]) => void, bad: (e: unknown) => void): void } };
async function walk(e: Entry, out: File[], depth = 0): Promise<void> {
  if (e.isFile && e.file) out.push(await new Promise<File>((ok, bad) => e.file!(ok, bad)));
  else if (e.isDirectory && e.createReader && depth < 8) {
    const r = e.createReader();
    for (;;) {
      const batch = await new Promise<Entry[]>((ok, bad) => r.readEntries(ok, bad));
      if (!batch.length) break;
      for (const c of batch) await walk(c, out, depth + 1);
    }
  }
}
/** The files of a drop, with dropped folders read through, media only. */
export async function droppedFiles(dt: DataTransfer | null | undefined): Promise<File[]> {
  if (!dt) return [];
  const entries = [...(dt.items ?? [])].map((i) => (i.webkitGetAsEntry?.() as unknown as Entry | null)).filter((x): x is Entry => x !== null && x !== undefined);
  if (!entries.length) return [...dt.files].filter(isMedia);
  const out: File[] = [];
  for (const e of entries) await walk(e, out).catch(() => undefined);
  return out.filter(isMedia);
}

/** The drop zone that becomes the transcript. */
export function mountTranscribeDrop(host: HTMLElement, queue: TranscribeQueue, o: TranscribeDropOptions = {}): TranscribeDropHandle {
  const l = listeners();
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  input.multiple = true;
  input.accept = o.accept ?? "audio/*,video/*";
  const dir = document.createElement("input");
  dir.type = "file";
  dir.hidden = true;
  dir.setAttribute("webkitdirectory", "");
  const zone = document.createElement("div");
  const result = document.createElement("div");
  host.replaceChildren(zone, result, input, dir);
  zone.className = "hb-lay-drop";
  // the result scrolls inside the subject, as the drop first layout's transcript does
  result.className = "hb-lay-scroll";
  zone.innerHTML =
    `<div class="hb-lay-empty"><span class="hb-lay-empty-name">${esc(o.title ?? "drop audio or video")}</span>` +
    `<p class="hb-lay-empty-note">${esc(o.note ?? "any length. the words are worked out on this machine and the file never leaves it.")}</p>` +
    `<div class="hb-lay-empty-acts"><button type="button" class="hb-btn hb-btn-go" data-pick>${esc(o.pickLabel ?? "choose a file")}</button>${o.folders ? `<button type="button" class="hb-btn" data-folder>a folder</button>` : ""}${o.sampleLabel ? `<button type="button" class="hb-btn" data-sample>${esc(o.sampleLabel)}</button>` : ""}</div></div>`;
  const view = mountTranscriptView(result, queue, o);
  const take = (list: FileList | null | undefined) => {
    const files = list ? [...list].filter(isMedia) : [];
    if (files.length) queue.add(files);
  };
  l.on(host, "dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-hot");
  });
  l.on(host, "dragleave", () => zone.classList.remove("is-hot"));
  l.on(host, "drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-hot");
    void droppedFiles((e as DragEvent).dataTransfer).then((fs) => fs.length && queue.add(fs));
  });
  l.on(dir, "change", () => {
    take(dir.files);
    dir.value = "";
  });
  l.on(input, "change", () => {
    take(input.files);
    input.value = "";
  });
  l.on(zone, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-pick]")) input.click();
    else if (t.closest("[data-folder]")) dir.click();
    else if (t.closest("[data-sample]")) o.onSample?.();
  });
  l.add(
    queue.subscribe((s) => {
      const empty = s.channels.length === 0;
      show(zone, empty);
      show(result, !empty);
    }),
  );
  return {
    pick: () => input.click(),
    pickFolder: () => dir.click(),
    dispose() {
      l.off();
      view.dispose();
    },
  };
}

/** The queue as hackbuild-ui strips: name, state, figures, progress, remove; run and stop. */
export function mountTranscribeQueue(host: HTMLElement, queue: TranscribeQueue): Mounted {
  const l = listeners();
  const draw = (s: QueueSnapshot) => {
    const strips = s.channels
      .map((c, i) => {
        const st = stripStatus(c.status);
        return (
          `<li class="hb-qstrip is-${st.tone || "idle"}${c.id === s.selected ? " is-sel" : ""}${c.status === "done" ? " is-done" : ""}">` +
          `<button type="button" class="hb-qstrip-main" data-sel="${c.id}" aria-pressed="${c.id === s.selected}"><span class="hb-qstrip-n">${String(i + 1).padStart(2, "0")}</span><span class="hb-qstrip-body"><span class="hb-qstrip-hd"><span class="hb-qstrip-name">${esc(c.name)}</span><span class="hb-qstrip-stat">${esc(st.word)}</span></span>` +
          (c.meta.length || c.error ? `<span class="hb-qstrip-meta">${c.meta.map((m) => `<span>${m.label ? `${esc(m.label)} ` : ""}<b${m.tone ? ` class="is-${m.tone}"` : ""}>${esc(m.value)}</b></span>`).join("")}${c.error ? `<span class="is-lo">${esc(c.error)}</span>` : ""}</span>` : "") +
          (c.status === "working" ? `<span class="hb-qstrip-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${c.pct}" aria-label="${esc(c.name)} progress"><i style="--hb-v:${c.pct / 100}"></i></span>` : "") +
          `</span></button>` +
          (s.running ? "" : `<button type="button" class="hb-qstrip-x" data-rm="${c.id}" aria-label="remove ${esc(c.name)}" title="remove">${ICON.x}</button>`) +
          `</li>`
        );
      })
      .join("");
    const queued = s.channels.some((c) => c.status === "queued");
    host.innerHTML =
      `<ol class="hb-qstrips" aria-label="files">${strips || `<li class="hb-qstrip-empty">no files yet. drop audio or video.</li>`}</ol>` +
      (s.running || queued || s.channels.length ? `<div class="hb-toolbar">${s.running ? `<button type="button" class="hb-btn" data-stop>stop</button>` : queued ? `<button type="button" class="hb-btn" data-run>transcribe</button>` : ""}${s.channels.length && !s.running ? `<button type="button" class="hb-btn" data-clear>clear</button>` : ""}</div>` : "");
  };
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const sel = t.closest<HTMLElement>("[data-sel]");
    if (sel) return queue.select(Number(sel.dataset.sel));
    const rm = t.closest<HTMLElement>("[data-rm]");
    if (rm) return queue.remove(Number(rm.dataset.rm));
    if (t.closest("[data-run]")) void queue.start();
    else if (t.closest("[data-stop]")) queue.stop();
    else if (t.closest("[data-clear]")) queue.clear();
  });
  l.add(queue.subscribe(draw));
  return { dispose: () => l.off() };
}

/** Exports and undo for the selected transcript. Nothing shows until there is text; undo shows once there is a change. */
/** `go` makes the first export the one pink action: the next thing to do once there is text. */
export function mountTranscriptExports(host: HTMLElement, queue: TranscribeQueue, o: { save?: (name: string, text: string, type: string) => void; go?: boolean } = {}): Mounted {
  const l = listeners();
  const kinds: ExportKind[] = ["txt", "srt", "vtt", "json"];
  const draw = (s: QueueSnapshot) => {
    const c = pickedOf(s);
    const has = !!c?.segments.length;
    host.innerHTML = has
      ? `<div class="hb-toolbar" role="group" aria-label="export">${kinds.map((k, i) => `<button type="button" class="hb-btn${o.go && i === 0 ? " hb-btn-go" : ""}" data-ex="${k}">${o.go && i === 0 ? `save ${k}` : k}</button>`).join("")}<button type="button" class="hb-btn" data-copy>${ICON.copy}copy</button>${s.canUndo ? `<button type="button" class="hb-iconbtn" data-undo aria-label="undo the last edit" title="undo">${ICON.undo}</button>` : ""}${s.canRedo ? `<button type="button" class="hb-iconbtn" data-redo aria-label="redo" title="redo">${ICON.redo}</button>` : ""}</div>`
      : "";
  };
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const ex = t.closest<HTMLElement>("[data-ex]");
    if (ex) {
      const f = queue.exportAs(ex.dataset.ex as ExportKind);
      if (f) (o.save ?? download)(f.name, f.text, f.type);
      return;
    }
    const cp = t.closest<HTMLElement>("[data-copy]");
    if (cp) {
      const f = queue.exportAs("txt");
      if (f) void navigator.clipboard?.writeText(f.text).then(() => (cp.lastChild!.textContent = "copied")).catch(() => (cp.lastChild!.textContent = "copy blocked"));
      return;
    }
    if (t.closest("[data-undo]")) queue.undo();
    else if (t.closest("[data-redo]")) queue.redo();
  });
  l.add(queue.subscribe(draw));
  return { dispose: () => l.off() };
}

/**
 * ExportMenu: the selected transcript as txt, srt, vtt or json, a copy, and
 * every finished transcript as one zip with a manifest, plus undo and redo of
 * edits. Nothing shows until there is text; undo shows once there is a change.
 */
export function mountExportMenu(host: HTMLElement, queue: TranscribeQueue, o: { save?: (name: string, data: string | Uint8Array, type: string) => void; tool?: string } = {}): Mounted {
  const l = listeners();
  const save = o.save ?? ((name: string, data: string | Uint8Array, type: string) => download(name, typeof data === "string" ? data : new Blob([data as BlobPart], { type }), type));
  const draw = (s: QueueSnapshot) => {
    const c = pickedOf(s);
    const done = s.channels.filter((x) => x.segments.length).length;
    host.innerHTML = c?.segments.length
      ? `<div class="hb-toolbar" role="group" aria-label="export">${(["txt", "srt", "vtt", "json"] as const).map((k) => `<button type="button" class="hb-btn" data-ex="${k}">${k}</button>`).join("")}<button type="button" class="hb-btn" data-copy>${ICON.copy}copy</button>${done ? `<button type="button" class="hb-btn" data-zip>all ${done} as zip</button>` : ""}${s.canUndo ? `<button type="button" class="hb-iconbtn" data-undo aria-label="undo the last edit" title="undo">${ICON.undo}</button>` : ""}${s.canRedo ? `<button type="button" class="hb-iconbtn" data-redo aria-label="redo" title="redo">${ICON.redo}</button>` : ""}</div>`
      : "";
  };
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const ex = t.closest<HTMLElement>("[data-ex]");
    if (ex) {
      const f = queue.exportAs(ex.dataset.ex as ExportKind);
      if (f) save(f.name, f.text, f.type);
      return;
    }
    if (t.closest("[data-zip]")) {
      const z = queue.zip(o.tool ? { tool: o.tool } : {});
      if (z) save(z.name, z.data, "application/zip");
      return;
    }
    const cp = t.closest<HTMLElement>("[data-copy]");
    if (cp) {
      const f = queue.exportAs("txt");
      if (f) void navigator.clipboard?.writeText(f.text).then(() => (cp.lastChild!.textContent = "copied")).catch(() => (cp.lastChild!.textContent = "copy blocked"));
      return;
    }
    if (t.closest("[data-undo]")) queue.undo();
    else if (t.closest("[data-redo]")) queue.redo();
  });
  l.add(queue.subscribe(draw));
  return { dispose: () => l.off() };
}

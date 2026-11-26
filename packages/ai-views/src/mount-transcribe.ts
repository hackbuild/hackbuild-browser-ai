/**
 * TranscribeDrop, TranscriptView and their rack parts in the DOM, after the
 * earlier transcription tool: the drop zone is the page until a file is in
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
  /** A sample a person can try with no file; the page queues it. */
  sampleLabel?: string;
  onSample?: () => void;
}

/** A mounted drop zone whose `pick` opens the file picker. */
export interface TranscribeDropHandle extends Mounted {
  /** Open the file picker: the add files verb. */
  pick(): void;
}

/** The drop zone that becomes the transcript. */
export function mountTranscribeDrop(host: HTMLElement, queue: TranscribeQueue, o: TranscribeDropOptions = {}): TranscribeDropHandle {
  const l = listeners();
  const input = document.createElement("input");
  input.type = "file";
  input.hidden = true;
  input.multiple = true;
  input.accept = o.accept ?? "audio/*,video/*";
  const zone = document.createElement("div");
  const result = document.createElement("div");
  host.replaceChildren(zone, result, input);
  zone.className = "hb-lay-drop";
  // the result scrolls inside the subject, as the drop first layout's transcript does
  result.className = "hb-lay-scroll";
  zone.innerHTML =
    `<div class="hb-lay-empty"><span class="hb-lay-empty-name">${esc(o.title ?? "drop audio or video")}</span>` +
    `<p class="hb-lay-empty-note">${esc(o.note ?? "any length. the words are worked out on this machine and the file never leaves it.")}</p>` +
    `<div class="hb-lay-empty-acts"><button type="button" class="hb-btn hb-btn-go" data-pick>${esc(o.pickLabel ?? "choose a file")}</button>${o.sampleLabel ? `<button type="button" class="hb-btn" data-sample>${esc(o.sampleLabel)}</button>` : ""}</div></div>`;
  const view = mountTranscriptView(result, queue, o);
  const take = (list: FileList | null | undefined) => {
    const files = list ? [...list] : [];
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
    take((e as DragEvent).dataTransfer?.files);
  });
  l.on(input, "change", () => {
    take(input.files);
    input.value = "";
  });
  l.on(zone, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-pick]")) input.click();
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

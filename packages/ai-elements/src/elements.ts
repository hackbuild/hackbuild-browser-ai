/**
 * The custom elements. Each class is built inside a factory from the
 * page's HTMLElement, so importing this module defines nothing and runs in
 * Node; `define()` in define.ts registers them. Data comes in through
 * properties; actions go out as CustomEvents.
 */

import type { Env } from "@hackbuild/ai-env";
import type { ChatEngine, ChatMessage } from "@hackbuild/chat";
import type { Recall } from "@hackbuild/memory";
import type { ModelRecord } from "@hackbuild/models";
import type { Progress } from "@hackbuild/weights";
import { HB_CSS } from "./hb-sheet.js";
import { appendDelta, escapeHtml as e, finishLine, maskKey, modelRows, pillFor, progressText, traceRows, type ChatLine, type Pill } from "./view.js";

/**
 * Styling. Each shadow root adopts the hackbuild-ui class layer (hb-sheet.ts,
 * generated from the vendored package) as one constructable stylesheet
 * shared by every element; no fetch, so it works from file://. Every token
 * in it falls back to its hackbuild-ui value, so a page themes the elements
 * by setting `--hb-*` tokens on an element or any ancestor, and a page
 * without hackbuild-ui still gets its look. Fonts come from the page: an
 * `@font-face` inside a shadow root does not load, so a page links
 * hackbuild-ui `fonts-inline.css` or gets the fallback faces.
 */
export const HOST_CSS = `
:host { display: block; background: transparent; font-family: var(--hb-body, 'Special Elite', 'Courier New', monospace); font-size: 14px; line-height: 1.6; color: var(--hb-ink, #1a1a1a); }
:host([hidden]) { display: none; }
.hb-sum { font-family: var(--hb-utility, 'IBM Plex Mono', ui-monospace, monospace); font-size: 11.5px; color: var(--hb-ink-3, #6b6459); margin: 0 0 var(--hb-s2, 8px); }
.hb-pills { display: flex; flex-wrap: wrap; gap: var(--hb-s1, 4px) var(--hb-s2, 8px); }
.hb-table td.t { font-family: var(--hb-body, 'Special Elite', 'Courier New', monospace); min-width: 18ch; }
.hb-table td.n { white-space: nowrap; }
.hb-composer-acts .hb-btn { display: inline-flex; align-items: center; gap: var(--hb-s1, 4px); }
`;

let sheet: CSSStyleSheet | null | undefined;
function adopted(root: ShadowRoot): boolean {
  if (sheet === undefined) {
    try {
      sheet = new CSSStyleSheet();
      sheet.replaceSync(`${HB_CSS}\n${HOST_CSS}`);
    } catch {
      sheet = null;
    }
  }
  if (!sheet || !("adoptedStyleSheets" in root)) return false;
  if (root.adoptedStyleSheets[0] !== sheet) root.adoptedStyleSheets = [sheet];
  return true;
}

/** Writes markup into the root; without constructable sheets the CSS goes in a style element. */
function paint(root: ShadowRoot, html: string): void {
  root.innerHTML = adopted(root) ? html : `<style>${HB_CSS}\n${HOST_CSS}</style>${html}`;
}

/** Inline SVG icons, 14 px, stroked in currentColor. */
export const ICONS = {
  stop: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="currentColor"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7 3l4 4-4 4" stroke="currentColor" fill="none" stroke-width="1.6"/></svg>`,
} as const;

export interface ModelPickerElement extends HTMLElement {
  records: ModelRecord[];
  env: Env | undefined;
  selected: string | null;
  render(): void;
}
export interface DownloadBarElement extends HTMLElement {
  progress: Progress | null;
  state: "running" | "paused" | "done" | "failed";
  error: string;
  render(): void;
}
export interface StatusPillsElement extends HTMLElement {
  pills: Parameters<typeof pillFor>[0][];
  update(s: Parameters<typeof pillFor>[0]): void;
  render(): void;
}
export interface ChatPanelElement extends HTMLElement {
  engine: ChatEngine | null;
  system: string;
  readonly messages: ChatMessage[];
  readonly transcript: readonly ChatLine[];
  readonly apiKey: string;
  keyField: boolean;
  clear(): void;
  stop(): void;
  send(text: string): Promise<void>;
  streamText(src: AsyncIterable<string>): Promise<void>;
  render(): void;
}
export interface MemoryInspectorElement extends HTMLElement {
  recall: Pick<Recall, "trace" | "hits" | "query" | "mode"> | null;
  render(): void;
}

type Base = new () => HTMLElement;

function shadow(el: HTMLElement): ShadowRoot {
  return el.shadowRoot ?? el.attachShadow({ mode: "open" });
}

function emit(el: HTMLElement, name: string, detail?: unknown): void {
  el.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true }));
}

/** hb-model-picker: records and env in, `hb-pick` { id } out. Models the env cannot run are disabled with the reason. */
export function modelPickerClass(B: Base): new () => ModelPickerElement {
  return class ModelPicker extends B {
    #records_: ModelRecord[] = [];
    #env_: Env | undefined;
    #selected_: string | null = null;
    set records(v: ModelRecord[]) {
      this.#records_ = v;
      this.render();
    }
    get records(): ModelRecord[] {
      return this.#records_;
    }
    set env(v: Env | undefined) {
      this.#env_ = v;
      this.render();
    }
    set selected(id: string | null) {
      this.#selected_ = id;
      this.render();
    }
    get selected(): string | null {
      return this.#selected_;
    }
    connectedCallback() {
      this.render();
    }
    render() {
      const rows = modelRows(this.#records_, this.#env_);
      const r = shadow(this);
      paint(
        r,
        `<ul class="hb-models" role="listbox" aria-label="models">${
        rows.length
          ? rows
              .map(
                  (m) => `<li class="hb-model" role="option" data-id="${e(m.id)}" aria-selected="${m.id === this.#selected_}" aria-disabled="${m.disabled !== null}">
<span class="hb-model-name">${e(m.label)}</span><button class="hb-btn hb-btn-2 hb-btn-sm" type="button" data-id="${e(m.id)}" ${m.disabled ? "disabled" : ""}>${m.id === this.#selected_ ? "in use" : "use"}</button>
<span class="hb-model-meta">${e(m.size)}. ${e(m.devices)}${m.first ? `, first try ${e(m.first)}` : ""}</span>
<span class="hb-model-lic">${e(m.licence)}</span>${m.disabled ? `<span class="hb-model-why">${e(m.disabled)}</span>` : ""}</li>`,
                )
                .join("")
            : `<li class="hb-model"><span class="hb-model-meta">no models registered.</span></li>`
        }</ul>`,
      );
      r.querySelectorAll<HTMLButtonElement>("button[data-id]").forEach((b) =>
        b.addEventListener("click", () => {
          this.#selected_ = b.dataset.id ?? null;
          emit(this, "hb-pick", { id: this.#selected_ });
          this.render();
        }),
      );
    }
  };
}

/** hb-download-bar: `progress` in; `hb-cancel` and `hb-resume` out. An unknown total shows an indeterminate bar counting MB. */
export function downloadBarClass(B: Base): new () => DownloadBarElement {
  return class DownloadBar extends B {
    #p: Progress | null = null;
    #state_: "running" | "paused" | "done" | "failed" = "running";
    #error_ = "";
    set progress(v: Progress | null) {
      this.#p = v;
      if (v && v.total !== null && v.loaded >= v.total) this.#state_ = "done";
      this.render();
    }
    get progress(): Progress | null {
      return this.#p;
    }
    /** Mark the download stopped: a paused one offers resume, a failed one shows the reason. */
    set state(s: "running" | "paused" | "done" | "failed") {
      this.#state_ = s;
      this.render();
    }
    set error(msg: string) {
      this.#error_ = msg;
      this.#state_ = "failed";
      this.render();
    }
    connectedCallback() {
      this.render();
    }
    render() {
      const v = this.#p ? progressText(this.#p) : { text: "waiting to start", fraction: 0 };
      const label = this.#state_ === "failed" ? `download failed. ${this.#error_}`.trim() : this.#state_ === "paused" ? `paused. ${v.text}` : this.#state_ === "done" ? "downloaded." : v.text;
      const r = shadow(this);
      // the running download is the one pink of the view; stopped states take the meter states of the class layer
      const state = this.#state_ === "running" ? (v.fraction === null ? " is-busy" : "") : this.#state_ === "paused" ? " is-paused" : this.#state_ === "done" ? " is-done" : " is-failed";
      const pct = this.#state_ === "done" ? 100 : v.fraction === null ? null : Math.round(v.fraction * 100);
      const act =
        this.#state_ === "running"
          ? `<button class="hb-btn hb-btn-2 hb-btn-sm" type="button" data-a="cancel">cancel</button>`
          : this.#state_ === "paused" || this.#state_ === "failed"
            ? `<button class="hb-btn hb-btn-2 hb-btn-sm" type="button" data-a="resume">resume</button>`
            : "";
      paint(
        r,
        `<div class="hb-progress${state}"><div class="hb-progress-hd"><span class="hb-progress-text" role="status">${e(label)}</span>${
          pct === null ? "" : `<span class="hb-progress-pct">${pct}%</span>`
        }${act}</div>
<div class="hb-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${pct === null ? "" : `aria-valuenow="${pct}"`}><i style="width:${pct ?? 30}%"></i></div></div>`,
      );
      r.querySelector<HTMLButtonElement>("button[data-a]")?.addEventListener("click", (ev) => {
        const a = (ev.currentTarget as HTMLButtonElement).dataset.a!;
        this.#state_ = a === "cancel" ? "paused" : "running";
        emit(this, `hb-${a}`, { key: this.#p?.key ?? null });
        this.render();
      });
    }
  };
}

/** Pill kind to the class layer state: busy and loading never spend the pink. */
const PILL_CLASS: Record<Pill["kind"], string> = { loading: " is-busy", busy: " is-busy", ready: " is-ok", failed: " is-err", "patch-missed": " is-warn", idle: "" };

/** hb-status-pills: set `pills` with engine or hub status objects; each shows its state dot and its line. */
export function statusPillsClass(B: Base): new () => StatusPillsElement {
  return class StatusPills extends B {
    #pills_: Pill[] = [];
    /** Replace all pills. Items may be EngineStatus, HubStatus or Pill shaped. */
    set pills(v: Parameters<typeof pillFor>[0][]) {
      this.#pills_ = v.map(pillFor);
      this.render();
    }
    get pills(): Pill[] {
      return this.#pills_;
    }
    /** Add or replace the pill with the same id. */
    update(s: Parameters<typeof pillFor>[0]): void {
      const p = pillFor(s);
      const i = this.#pills_.findIndex((x) => x.id === p.id);
      if (i >= 0) this.#pills_[i] = p;
      else this.#pills_.push(p);
      this.render();
    }
    connectedCallback() {
      this.render();
    }
    render() {
      const r = shadow(this);
      paint(r, `<div class="hb-pills">${this.#pills_.map((p) => `<span class="hb-pill${PILL_CLASS[p.kind]}" data-kind="${p.kind}" title="${e(p.kind)}">${e(p.text)}</span>`).join("")}</div>`);
    }
  };
}

/**
 * hb-chat-panel: set `engine` (a ChatEngine) or call `streamText(iterable)`.
 * Think text is kept in a collapsed block. `hb-send` { text } fires before
 * the engine runs; `hb-reply` { text } after. The optional key field keeps
 * the key in this element only and shows its first and last 4 characters.
 */
export function chatPanelClass(B: Base): new () => ChatPanelElement {
  return class ChatPanel extends B {
    engine: ChatEngine | null = null;
    system = "";
    #lines: ChatLine[] = [];
    #abort: AbortController | null = null;
    #key_ = "";
    #showKey = false;
    get messages(): ChatMessage[] {
      const m: ChatMessage[] = this.system ? [{ role: "system", content: this.system }] : [];
      for (const l of this.#lines) if (l.text) m.push({ role: l.role, content: l.text });
      return m;
    }
    get transcript(): readonly ChatLine[] {
      return this.#lines;
    }
    /** The typed key; it never leaves this element unless the page reads it. */
    get apiKey(): string {
      return this.#key_;
    }
    /** Show the key field (for remote endpoints). */
    set keyField(on: boolean) {
      this.#showKey = on;
      this.render();
    }
    connectedCallback() {
      this.render();
    }
    clear(): void {
      this.#lines = [];
      this.render();
    }
    stop(): void {
      this.#abort?.abort();
    }
    async send(text: string): Promise<void> {
      const t = text.trim();
      if (!t || this.#abort) return;
      this.#lines = [...this.#lines, { role: "user", text: t, think: "", done: true }];
      emit(this, "hb-send", { text: t });
      this.render();
      if (!this.engine) {
        this.#lines = finishLine(appendDelta(this.#lines, {}), "no model loaded. pick one first.");
        this.render();
        return;
      }
      const engine = this.engine;
      await this.#run(async (signal, push) => {
        const it = engine.stream(this.messages, { signal });
        for (;;) {
          const r = await it.next();
          if (r.done) return r.value.finish === "abort" ? "stopped." : r.value.finish === "length" ? "cut at the token limit." : undefined;
          const ev = r.value;
          if (ev.type === "text") push({ text: ev.text });
          else if (ev.type === "think") push({ think: ev.text });
        }
      });
    }
    /** Stream any async iterable of text into a new assistant line. */
    async streamText(src: AsyncIterable<string>): Promise<void> {
      await this.#run(async (signal, push) => {
        for await (const t of src) {
          if (signal.aborted) return "stopped.";
          push({ text: t });
        }
        return undefined;
      });
    }
    async #run(fn: (signal: AbortSignal, push: (d: { text?: string; think?: string }) => void) => Promise<string | undefined>): Promise<void> {
      if (this.#abort) return; // one reply at a time
      this.#abort = new AbortController();
      this.#lines = appendDelta(this.#lines, {});
      this.render();
      let note: string | undefined;
      try {
        note = await fn(this.#abort.signal, (d) => {
          this.#lines = appendDelta(this.#lines, d);
          this.#renderLast();
        });
      } catch (err) {
        note = this.#abort.signal.aborted ? "stopped." : `the model failed. ${err instanceof Error ? err.message : String(err)}`.toLowerCase();
      }
      this.#abort = null;
      this.#lines = finishLine(this.#lines, note);
      emit(this, "hb-reply", { text: this.#lines[this.#lines.length - 1]?.text ?? "" });
      this.render();
    }
    #lineHtml(l: ChatLine): string {
      const cls = l.role === "user" ? " is-user" : l.role === "system" ? " is-system" : l.done ? "" : " is-streaming";
      const who = l.role === "user" ? "you" : l.role === "system" ? "note" : "model";
      // a stop the person asked for is plain; every other note names a failure
      const note = l.note ? `<span class="hb-msg-note${l.note === "stopped." ? "" : " is-err"}">${e(l.note)}</span>` : "";
      return `<div class="hb-msg${cls}" data-role="${l.role}"><span class="hb-msg-who">${who}</span>${
        l.think ? `<details class="hb-think"><summary>thinking</summary><pre>${e(l.think)}</pre></details>` : ""
      }<div class="hb-msg-text">${e(l.text)}</div>${note}</div>`;
    }
    #renderLast(): void {
      const box = this.shadowRoot?.querySelector(".hb-chat-log");
      const last = this.#lines[this.#lines.length - 1];
      const node = box?.lastElementChild;
      if (!box || !last || !node) return this.render();
      node.outerHTML = this.#lineHtml(last);
      box.scrollTop = box.scrollHeight;
    }
    render() {
      const r = shadow(this);
      const busy = this.#abort !== null;
      // keep what the user is typing across a re-render
      const was = r.querySelector("textarea");
      const draft = was ? { v: was.value, a: was.selectionStart, b: was.selectionEnd, focus: r.activeElement === was } : null;
      const keyRow = this.#showKey
        ? `<div class="hb-chat-key"><label class="hb-ctl">api key <input class="hb-input" type="password" autocomplete="off" placeholder="api key" aria-label="api key"></label><span class="hb-msg-note">${
            this.#key_ ? `key ${e(maskKey(this.#key_))}. it stays in this browser.` : "your key stays in this browser."
          }</span></div>`
        : "";
      paint(
        r,
        `<section class="hb-chat" aria-label="chat">${keyRow}<div class="hb-chat-log" role="log" aria-live="polite">${this.#lines.map((l) => this.#lineHtml(l)).join("")}</div>
<form class="hb-composer"><textarea class="hb-textarea" rows="2" aria-label="message" placeholder="${this.engine ? "type a message" : "no model loaded"}"></textarea><div class="hb-composer-acts">${
          busy
            ? `<button class="hb-btn hb-btn-2" type="button" data-a="stop" aria-label="stop">${ICONS.stop} stop</button>`
            : `<button class="hb-btn" type="submit" aria-label="send">${ICONS.send} send</button>`
        }</div></form></section>`,
      );
      const ta = r.querySelector("textarea")!;
      if (draft) {
        ta.value = draft.v;
        if (draft.focus) {
          ta.focus();
          ta.setSelectionRange(draft.a, draft.b);
        }
      }
      r.querySelector("form")!.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const v = ta.value;
        ta.value = "";
        void this.send(v);
      });
      ta.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.shiftKey) {
          ev.preventDefault();
          r.querySelector("form")!.requestSubmit();
        }
      });
      r.querySelector('button[data-a="stop"]')?.addEventListener("click", () => this.stop());
      const key = r.querySelector<HTMLInputElement>(".hb-chat-key input");
      key?.addEventListener("change", () => {
        this.#key_ = key.value.trim();
        key.value = "";
        emit(this, "hb-key", { set: this.#key_.length > 0 });
        this.render();
      });
    }
  };
}

/** hb-memory-inspector: set `recall` (a memory Recall); one row per fused candidate with its ranks and scores. Rows handed to the model are marked. */
export function memoryInspectorClass(B: Base): new () => MemoryInspectorElement {
  return class MemoryInspector extends B {
    #recall_: Pick<Recall, "trace" | "hits" | "query" | "mode"> | null = null;
    set recall(v: Pick<Recall, "trace" | "hits" | "query" | "mode"> | null) {
      this.#recall_ = v;
      this.render();
    }
    connectedCallback() {
      this.render();
    }
    render() {
      const r = shadow(this);
      const rec = this.#recall_;
      const rows = rec ? traceRows(rec) : [];
      paint(
        r,
        rec
          ? `<div class="hb-sum" role="status">query "${e(rec.query)}", ${rec.mode} recall, ${rows.length} candidates, ${rows.filter((x) => x.used).length} used (computed).</div>
<div class="hb-scroll-x"><table class="hb-table"><thead><tr><th class="num">#</th><th>kind</th><th>text</th><th>bm25</th><th>cosine</th><th class="num">rrf</th><th class="num">score</th></tr></thead><tbody>${rows
              .map(
                (x) =>
                  `<tr class="${x.used ? "is-mark" : ""}" data-used="${x.used}"><td class="num">${x.rank}</td><td>${e(x.kind)}</td><td class="t">${e(x.text)}</td><td class="n">${e(x.bm25)}</td><td class="n">${e(
                    x.cos,
                  )}</td><td class="num">${x.rrf}</td><td class="num">${x.score}</td></tr>`,
              )
              .join("")}</tbody></table></div>`
          : `<div class="hb-empty">no recall yet. ask something to see what memory finds.</div>`,
      );
    }
  };
}

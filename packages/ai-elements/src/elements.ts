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
import { appendDelta, escapeHtml as e, finishLine, maskKey, modelRows, pillFor, progressText, traceRows, type ChatLine, type Pill } from "./view.js";

/** Theme tokens. Pages override any of them on the element or an ancestor. */
export const TOKENS = `
:host {
  --hb-bg: #ffffff; --hb-fg: #1b1d21; --hb-muted: #5d6470; --hb-line: #d9dde3;
  --hb-accent: #2463eb; --hb-ok: #1a7f4b; --hb-warn: #a35c00; --hb-bad: #c0352b;
  --hb-radius: 6px; --hb-font: system-ui, sans-serif; --hb-mono: ui-monospace, monospace;
  display: block; font: 13px/1.4 var(--hb-font); color: var(--hb-fg); background: var(--hb-bg);
}
@media (prefers-color-scheme: dark) {
  :host(:not([data-theme="light"])) {
    --hb-bg: #15171b; --hb-fg: #e6e8eb; --hb-muted: #9aa3ae; --hb-line: #2c3038;
    --hb-accent: #6d9bff; --hb-ok: #4cc38a; --hb-warn: #e0a440; --hb-bad: #ff6b5e;
  }
}
:host([data-theme="dark"]) {
  --hb-bg: #15171b; --hb-fg: #e6e8eb; --hb-muted: #9aa3ae; --hb-line: #2c3038;
  --hb-accent: #6d9bff; --hb-ok: #4cc38a; --hb-warn: #e0a440; --hb-bad: #ff6b5e;
}
button { font: inherit; color: inherit; background: transparent; border: 1px solid var(--hb-line); border-radius: var(--hb-radius); padding: 3px 9px; cursor: pointer; }
button:disabled { opacity: .5; cursor: not-allowed; }
.muted { color: var(--hb-muted); }
`;

/** Inline SVG icons, 14 px, stroked in currentColor. */
export const ICONS = {
  stop: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><rect x="3" y="3" width="8" height="8" fill="currentColor"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M2 7h9M7 3l4 4-4 4" stroke="currentColor" fill="none" stroke-width="1.6"/></svg>`,
  dot: `<svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true"><circle cx="4" cy="4" r="3.2" fill="currentColor"/></svg>`,
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
      r.innerHTML = `<style>${TOKENS}
ul { list-style: none; margin: 0; padding: 0; }
li { border: 1px solid var(--hb-line); border-radius: var(--hb-radius); padding: 6px 8px; margin: 0 0 6px; }
li[aria-selected="true"] { border-color: var(--hb-accent); }
li[aria-disabled="true"] { opacity: .6; }
.top { display: flex; justify-content: space-between; gap: 8px; }
.why { color: var(--hb-warn); }
</style>
<ul role="listbox" aria-label="models">${
        rows.length
          ? rows
              .map(
                (m) => `<li role="option" data-id="${e(m.id)}" aria-selected="${m.id === this.#selected_}" aria-disabled="${m.disabled !== null}">
<div class="top"><b>${e(m.label)}</b><button data-id="${e(m.id)}" ${m.disabled ? "disabled" : ""}>${m.id === this.#selected_ ? "in use" : "use"}</button></div>
<div class="muted">${e(m.size)}. ${e(m.devices)}${m.first ? `, first try ${e(m.first)}` : ""}</div>
<div class="muted">${e(m.licence)}</div>${m.disabled ? `<div class="why">${e(m.disabled)}</div>` : ""}</li>`,
              )
              .join("")
          : `<li class="muted">no models registered.</li>`
      }</ul>`;
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
      r.innerHTML = `<style>${TOKENS}
.track { height: 6px; border-radius: 3px; background: var(--hb-line); overflow: hidden; margin: 4px 0; }
.fill { height: 100%; background: var(--hb-accent); }
.ind .fill { width: 30%; animation: slide 1.2s linear infinite; }
@keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(340%); } }
@media (prefers-reduced-motion: reduce) { .ind .fill { animation: none; width: 100%; opacity: .4; } }
.row { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.failed { color: var(--hb-bad); }
</style>
<div class="row"><span class="${this.#state_ === "failed" ? "failed" : "muted"}" role="status">${e(label)}</span><span>${
        this.#state_ === "running" ? `<button data-a="cancel">cancel</button>` : this.#state_ === "paused" || this.#state_ === "failed" ? `<button data-a="resume">resume</button>` : ""
      }</span></div>
<div class="track ${v.fraction === null && this.#state_ === "running" ? "ind" : ""}" role="progressbar" aria-valuemin="0" aria-valuemax="100" ${
        v.fraction !== null ? `aria-valuenow="${Math.round(v.fraction * 100)}"` : ""
      }><div class="fill" style="width:${v.fraction === null ? 30 : Math.round(v.fraction * 100)}%"></div></div>`;
      r.querySelector<HTMLButtonElement>("button[data-a]")?.addEventListener("click", (ev) => {
        const a = (ev.currentTarget as HTMLButtonElement).dataset.a!;
        this.#state_ = a === "cancel" ? "paused" : "running";
        emit(this, `hb-${a}`, { key: this.#p?.key ?? null });
        this.render();
      });
    }
  };
}

/** hb-status-pills: set `pills` with engine or hub status objects; each shows a coloured dot and its line. */
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
      r.innerHTML = `<style>${TOKENS}
:host { background: transparent; }
span.p { display: inline-flex; align-items: center; gap: 5px; border: 1px solid var(--hb-line); border-radius: 999px; padding: 1px 8px; margin: 0 4px 4px 0; }
.loading, .busy { color: var(--hb-accent); } .ready { color: var(--hb-ok); } .failed { color: var(--hb-bad); } .patch-missed { color: var(--hb-warn); } .idle { color: var(--hb-muted); }
.t { color: var(--hb-fg); }
</style>${this.#pills_.map((p) => `<span class="p ${p.kind}" title="${e(p.kind)}">${ICONS.dot}<span class="t">${e(p.text)}</span></span>`).join("")}`;
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
      return `<div class="m ${l.role}">${l.think ? `<details><summary>thinking</summary><pre>${e(l.think)}</pre></details>` : ""}<div class="t">${e(l.text)}${
        l.done ? "" : `<span class="cursor" aria-hidden="true"></span>`
      }</div>${l.note ? `<div class="note">${e(l.note)}</div>` : ""}</div>`;
    }
    #renderLast(): void {
      const box = this.shadowRoot?.querySelector(".log");
      const last = this.#lines[this.#lines.length - 1];
      const node = box?.lastElementChild;
      if (!box || !last || !node) return this.render();
      node.outerHTML = this.#lineHtml(last);
      box.scrollTop = box.scrollHeight;
    }
    render() {
      const r = shadow(this);
      const busy = this.#abort !== null;
      r.innerHTML = `<style>${TOKENS}
.log { max-height: var(--hb-chat-height, 360px); overflow-y: auto; padding: 4px 0; }
.m { margin: 0 0 8px; padding: 6px 8px; border-radius: var(--hb-radius); white-space: pre-wrap; }
.user { background: color-mix(in srgb, var(--hb-accent) 12%, transparent); }
.assistant { border: 1px solid var(--hb-line); }
details { color: var(--hb-muted); margin-bottom: 4px; } pre { white-space: pre-wrap; font: 12px/1.4 var(--hb-mono); margin: 4px 0 0; }
.note { color: var(--hb-warn); font-size: 12px; margin-top: 4px; }
.cursor { display: inline-block; width: 6px; height: 1em; background: var(--hb-muted); vertical-align: text-bottom; }
form { display: flex; gap: 6px; } textarea, input { flex: 1; font: inherit; color: inherit; background: var(--hb-bg); border: 1px solid var(--hb-line); border-radius: var(--hb-radius); padding: 5px 7px; }
.key { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
</style>${
        this.#showKey
          ? `<div class="key"><input type="password" autocomplete="off" placeholder="api key" aria-label="api key"><span class="muted">${
              this.#key_ ? `key ${e(maskKey(this.#key_))}. it stays in this browser.` : "your key stays in this browser."
            }</span></div>`
          : ""
      }<div class="log" role="log" aria-live="polite">${this.#lines.map((l) => this.#lineHtml(l)).join("")}</div>
<form><textarea rows="2" aria-label="message" placeholder="${this.engine ? "type a message" : "no model loaded"}"></textarea>${
        busy ? `<button type="button" data-a="stop" aria-label="stop">${ICONS.stop}</button>` : `<button type="submit" aria-label="send">${ICONS.send}</button>`
      }</form>`;
      const ta = r.querySelector("textarea")!;
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
      const key = r.querySelector<HTMLInputElement>(".key input");
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
      r.innerHTML = `<style>${TOKENS}
table { border-collapse: collapse; width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 3px 6px; border-bottom: 1px solid var(--hb-line); vertical-align: top; }
th { color: var(--hb-muted); font-weight: 500; }
tr.used td:first-child { box-shadow: inset 3px 0 0 var(--hb-accent); }
td.n { font-family: var(--hb-mono); font-size: 12px; white-space: nowrap; }
</style>${
        rec
          ? `<div class="muted">query "${e(rec.query)}", ${rec.mode} recall, ${rows.length} candidates, ${rows.filter((x) => x.used).length} used (computed).</div>
<table><thead><tr><th>#</th><th>kind</th><th>text</th><th>bm25</th><th>cosine</th><th>rrf</th><th>score</th></tr></thead><tbody>${rows
              .map(
                (x) =>
                  `<tr class="${x.used ? "used" : ""}"><td class="n">${x.rank}</td><td>${e(x.kind)}</td><td>${e(x.text)}</td><td class="n">${e(x.bm25)}</td><td class="n">${e(
                    x.cos,
                  )}</td><td class="n">${x.rrf}</td><td class="n">${x.score}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : `<div class="muted">no recall yet. ask something to see what memory finds.</div>`
      }`;
    }
  };
}

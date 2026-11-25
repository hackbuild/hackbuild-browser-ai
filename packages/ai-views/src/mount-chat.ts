/**
 * ChatPane and Composer in the DOM, after the earlier chat tools: the
 * thread as hackbuild-ui messages, the reasoning in a fold that is open
 * while it streams, the memory a reply used in a fold under it, copy and
 * redo on the last reply only, and a composer whose send is the one pink
 * action and turns into stop while a reply streams.
 */

import { composerKey, coarsePointer, autosize, pinned } from "@virgilvox/hackbuild-ui/vanilla";
import type { ChatThread, ThreadSnapshot, Turn } from "./chat.js";
import { ICON, esc, listeners, scroller, type Mounted } from "./dom.js";

export interface ChatPaneOptions {
  /** The reply's name in its head. */
  name?: string;
  /** The empty state, in Permanent Marker. */
  emptyName?: string;
  emptyNote?: string;
}

const paras = (t: string) =>
  t
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<div class="hb-msg-text">${esc(p).replace(/\n/g, "<br>")}</div>`)
    .join("");

export function turnHtml(t: Turn, o: { name: string; last: boolean; busy: boolean }): string {
  if (t.role === "user") {
    return `<div class="hb-msg is-user" data-turn="${t.id}"><span class="hb-msg-who"><span class="hb-msg-name">you</span></span><div class="hb-msg-parts">${paras(t.text)}</div></div>`;
  }
  const live = !t.done;
  const think = t.think
    ? `<details class="hb-think is-think"${live && !t.text ? " open" : ""}><summary>${live && !t.text ? "thinking" : `reasoning (${t.think.length} chars)`}</summary><pre aria-live="off">${esc(t.think)}</pre></details>`
    : "";
  const body = t.text ? paras(t.text) : live && !t.think ? `<div class="hb-msg-pending">thinking</div>` : "";
  const mem = t.mem?.length
    ? `<details class="hb-msg-used"><summary>memory used (${t.mem.length})</summary><ul>${t.mem.map((m) => `<li><span class="hb-msg-used-item">${esc(m.label)}</span>${m.score !== undefined ? `<span class="hb-msg-used-score">${m.score.toFixed(2)}</span>` : ""}</li>`).join("")}</ul></details>`
    : "";
  const acts =
    t.done && t.text && o.last && !o.busy
      ? `<div class="hb-msg-acts" role="group" aria-label="reply actions"><button type="button" class="hb-msg-act" data-copy="${t.id}">${ICON.copy}copy</button><button type="button" class="hb-msg-act" data-redo>${ICON.redoMsg}redo</button></div>`
      : "";
  return (
    `<div class="hb-msg" data-turn="${t.id}"><span class="hb-msg-who"><span class="hb-msg-name">${esc(o.name)}</span>${t.stats ? `<span class="hb-msg-stats" title="${esc(t.stats)}">${esc(t.stats.replace(/ \((measured|inferred|vendor|unknown)\)$/, ""))}</span>` : ""}</span>` +
    `${think}<div class="hb-msg-parts">${body}</div>${t.note ? `<span class="hb-msg-note">${esc(t.note)}</span>` : ""}${mem}${acts}</div>`
  );
}

/** The thread over a host, with the empty state inside it. */
export function mountChatPane(host: HTMLElement, thread: ChatThread, o: ChatPaneOptions = {}): Mounted {
  const name = o.name ?? "reply";
  const l = listeners();
  const draw = (s: ThreadSnapshot) => {
    const sc = scroller(host);
    const stick = pinned(sc);
    if (!s.turns.length) {
      host.innerHTML = `<div class="hb-lay-convempty"><h2 class="hb-lay-convempty-name">${esc(o.emptyName ?? "what are we working on?")}</h2>${o.emptyNote ? `<p class="hb-lay-convempty-note">${esc(o.emptyNote)}</p>` : ""}</div>`;
      return;
    }
    // keep folds a person opened open across redraws
    const open = new Set([...host.querySelectorAll<HTMLDetailsElement>("details[open]")].map((d) => `${d.closest<HTMLElement>("[data-turn]")?.dataset.turn}:${d.className}`));
    const last = s.turns[s.turns.length - 1];
    host.innerHTML = s.turns.map((t) => turnHtml(t, { name, last: t === last, busy: s.busy })).join("");
    for (const d of host.querySelectorAll<HTMLDetailsElement>("details")) {
      if (open.has(`${d.closest<HTMLElement>("[data-turn]")?.dataset.turn}:${d.className}`)) d.open = true;
    }
    if (stick) sc.scrollTop = sc.scrollHeight;
  };
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const copy = t.closest<HTMLElement>("[data-copy]");
    if (copy) {
      const turn = thread.snapshot().turns.find((x) => String(x.id) === copy.dataset.copy);
      if (turn) void navigator.clipboard?.writeText(turn.text).then(() => (copy.lastChild!.textContent = "copied")).catch(() => (copy.lastChild!.textContent = "copy blocked"));
      return;
    }
    if (t.closest("[data-redo]")) void thread.regenerate();
  });
  l.add(thread.subscribe(draw));
  return { dispose: () => l.off() };
}

export interface ComposerOptions {
  placeholder?: string;
  label?: string;
}

/** The composer: Enter sends (Shift Enter adds a line, Escape stops), send is the one pink, stop replaces it while a reply streams. */
export function mountComposer(host: HTMLElement, thread: ChatThread, o: ComposerOptions = {}): Mounted {
  host.innerHTML = `<form class="hb-convbox"><textarea rows="1" aria-label="${esc(o.label ?? "message")}" placeholder="${esc(o.placeholder ?? "say something")}"></textarea><span data-act></span></form>`;
  const form = host.querySelector("form")!;
  const area = host.querySelector("textarea")!;
  const act = host.querySelector<HTMLElement>("[data-act]")!;
  let busy = false;
  const drawAct = () => {
    act.innerHTML = busy ? `<button type="button" class="hb-btn" data-stop>stop</button>` : `<button type="submit" class="hb-btn hb-btn-go">send</button>`;
  };
  const send = () => {
    const text = area.value.trim();
    if (!text || busy) return;
    area.value = "";
    autosize(area);
    void thread.send(text);
  };
  const l = listeners();
  l.on(form, "submit", (e) => {
    e.preventDefault();
    send();
  });
  l.on(act, "click", (e) => {
    if ((e.target as Element).closest("[data-stop]")) thread.stop();
  });
  l.on(area, "input", () => autosize(area));
  l.on(area, "keydown", (e) => {
    const k = composerKey(e as KeyboardEvent, { busy, empty: !area.value, coarse: coarsePointer() });
    if (k === "send") {
      e.preventDefault();
      send();
    } else if (k === "stop") thread.stop();
  });
  l.add(
    thread.subscribe((s) => {
      if (s.busy === busy && act.firstChild) return;
      busy = s.busy;
      drawAct();
    }),
  );
  return { dispose: () => l.off() };
}

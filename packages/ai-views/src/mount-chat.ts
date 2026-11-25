/**
 * ChatPane and Composer in the DOM, after the earlier chat tools: the
 * thread as hackbuild-ui messages, the reasoning in a fold that is open
 * while it streams, the memory a reply used in a fold under it, copy and
 * redo on the last reply only, and a composer whose send is the one pink
 * action and turns into stop while a reply streams.
 */

import { composerKey, coarsePointer, autosize, pinned, contextUse, listMeta } from "@virgilvox/hackbuild-ui/vanilla";
import { contextSegments, type ChatList, type ChatListSnapshot, type ChatThread, type ThreadSnapshot, type Turn } from "./chat.js";
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

/** The chat list rail (hackbuild-ui HbConversationList markup): new, open, rename, delete with a second press. */
export function mountChatList(host: HTMLElement, list: ChatList, o: { label?: string } = {}): Mounted {
  const l = listeners();
  let armed = "";
  let renaming = "";
  const head = o.label ?? "chats";
  const draw = (s: ChatListSnapshot) => {
    host.innerHTML =
      `<nav class="hb-convs" aria-label="${esc(head)}"><div class="hb-convs-hd"><span>${esc(head)}</span><button type="button" class="hb-convs-new" data-new aria-label="new chat">${ICON.plus}</button></div><ul class="hb-convs-list">` +
      s.items
        .map((c) =>
          renaming === c.id
            ? `<li class="hb-convs-item"><form class="hb-convs-rename" data-rename="${esc(c.id)}"><input class="hb-input" aria-label="chat name" value="${esc(c.title)}"></form></li>`
            : `<li class="hb-convs-item"${c.id === s.current ? ' aria-current="true"' : ""}><button type="button" class="hb-convs-open" data-open="${esc(c.id)}"><span class="hb-convs-title">${esc(c.title)}</span><span class="hb-convs-meta">${esc(listMeta({ updated: c.updated, count: c.count }))}</span></button><span class="hb-convs-acts"><button type="button" class="hb-convs-act" data-ren="${esc(c.id)}" aria-label="rename ${esc(c.title)}" title="rename">${ICON.pen}</button><button type="button" class="hb-convs-act is-del${armed === c.id ? " is-armed" : ""}" data-del="${esc(c.id)}" aria-label="${armed === c.id ? `press again to delete ${esc(c.title)}` : `delete ${esc(c.title)}`}">${armed === c.id ? "delete?" : ICON.trash}</button></span></li>`,
        )
        .join("") +
      `</ul></nav>`;
    host.querySelector<HTMLInputElement>(".hb-convs-rename input")?.focus();
  };
  const redraw = () => draw(list.snapshot());
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-new]")) return void list.create();
    const open = t.closest<HTMLElement>("[data-open]")?.dataset.open;
    if (open) return list.open(open);
    const ren = t.closest<HTMLElement>("[data-ren]")?.dataset.ren;
    if (ren) return ((renaming = ren), redraw());
    const del = t.closest<HTMLElement>("[data-del]")?.dataset.del;
    if (del) {
      if (armed === del) return ((armed = ""), list.remove(del));
      armed = del;
      redraw();
    }
  });
  l.on(host, "submit", (e) => {
    e.preventDefault();
    const f = (e.target as HTMLElement).closest<HTMLFormElement>("[data-rename]");
    if (f) list.rename(f.dataset.rename!, f.querySelector("input")!.value);
    renaming = "";
    redraw();
  });
  l.add(list.subscribe(draw));
  return { dispose: () => l.off() };
}

/** The context meter (hackbuild-ui `.hb-ctxmeter`): what the next request carries against the model's context. */
export function mountContextMeter(host: HTMLElement, thread: ChatThread, o: { budget?: number | (() => number); system?: string | (() => string) } = {}): Mounted {
  const l = listeners();
  const val = <T,>(v: T | (() => T) | undefined, d: T) => (typeof v === "function" ? (v as () => T)() : (v ?? d));
  const draw = (s: ThreadSnapshot) => {
    const use = contextUse(contextSegments(s, val(o.system, "")), val(o.budget, 4096));
    host.innerHTML =
      `<div class="hb-ctxmeter is-${use.tone}"><div class="hb-ctxmeter-hd"><span class="hb-ctxmeter-label">context</span><span class="hb-ctxmeter-words">${esc(use.words)}</span></div>` +
      `<div class="hb-ctxmeter-bar" role="meter" aria-label="context used" aria-valuemin="0" aria-valuemax="${use.budget}" aria-valuenow="${use.used}" aria-valuetext="${esc(use.words)}">${use.rows.map((r, n) => `<i class="hb-ctxmeter-p${n % 6}" style="width:${Math.min(100, r.fraction * 100)}%"></i>`).join("")}</div>` +
      `<ul class="hb-ctxmeter-legend">${use.rows.map((r, n) => `<li><i class="hb-ctxmeter-p${n % 6}" aria-hidden="true"></i>${esc(r.label)} <b>${r.tokens.toLocaleString("en-US")}</b></li>`).join("")}</ul></div>`;
  };
  l.add(thread.subscribe(draw));
  return { dispose: () => l.off() };
}

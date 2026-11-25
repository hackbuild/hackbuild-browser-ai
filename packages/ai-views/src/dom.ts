/** Small DOM helpers shared by the mount functions. Light DOM only: the page's hackbuild-ui stylesheet draws everything. */

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

/** Shows or hides a part. Kit classes set display, which beats the hidden attribute, so this writes display. */
export function show(el: HTMLElement, on: boolean): void {
  el.hidden = !on;
  el.style.display = on ? "" : "none";
}

/** One handle per mount: redraw with new data, then tear down. */
export interface Mounted {
  dispose(): void;
}

/** Listeners that come off together. */
export function listeners() {
  const offs: (() => void)[] = [];
  return {
    on<K extends keyof HTMLElementEventMap>(el: EventTarget, type: K | string, fn: (e: HTMLElementEventMap[K]) => void) {
      el.addEventListener(type, fn as EventListener);
      offs.push(() => el.removeEventListener(type, fn as EventListener));
    },
    add(off: () => void) {
      offs.push(off);
    },
    off() {
      for (const f of offs.splice(0)) f();
    },
  };
}

/** The nearest ancestor that scrolls, else the element. */
export function scroller(el: HTMLElement): HTMLElement {
  for (let p: HTMLElement | null = el; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if ((o === "auto" || o === "scroll") && p.scrollHeight > p.clientHeight) return p;
  }
  return el.closest<HTMLElement>(".hb-lay-subject") ?? el;
}

/** Saves text as a file through a link press. */
export function download(name: string, text: string | Blob, type = "text/plain"): void {
  const blob = typeof text === "string" ? new Blob([text], { type }) : text;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/** Inline SVG icons, stroked in currentColor, 16 px. */
const svg = (d: string, size = 16) =>
  `<svg class="hb-icon is-stroke" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" aria-hidden="true">${d}</svg>`;
export const ICON = {
  undo: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>'),
  redo: svg('<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>'),
  zoomIn: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M11 8v6M8 11h6"/>'),
  zoomOut: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3M8 11h6"/>'),
  fit: svg('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  x: svg('<path d="M6 6l12 12M18 6 6 18"/>', 13),
  copy: svg('<rect x="9" y="9" width="11" height="11"/><path d="M5 15V4h11"/>', 14),
  redoMsg: svg('<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>', 14),
  point: svg('<circle cx="12" cy="12" r="3"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>', 18),
  wand: svg('<path d="m3 21 12-12M15 3v3M18 6h3M19 2l-1 1M14 9l1 1"/>', 18),
  brush: svg('<path d="M18 3 9 12l3 3 9-9z"/><path d="M9 12c-3 0-5 2-5 5 0 2-1 3-2 4 4 0 8-1 9-4"/>', 18),
  lasso: svg('<ellipse cx="12" cy="9" rx="8" ry="5"/><path d="M7 13c-1 2 0 4 2 4s2 3 0 5"/>', 18),
  all: svg('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>', 18),
  camera: svg('<path d="M3 7h4l2-3h6l2 3h4v13H3z"/><circle cx="12" cy="13" r="4"/>'),
  menu: svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
} as const;

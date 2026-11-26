/**
 * MaskStudio, after the earlier mask studio: drop an image, press a thing
 * to cut it out (a click segment model such as SlimSAM), fix the mask by
 * hand with the wand, brush and lasso of hackbuild-ui maskEditor (x swaps
 * add and erase, [ and ] size the brush, ctrl z undoes), zoom and fit, and
 * export the mask, a matte or the cutout. With a segment everything model
 * (FastSAM) one press finds every object; each lands in the found list and
 * a press adds it to the mask. Models are functions the page passes, so
 * stubs run the studio with no weights.
 */

import { INSTANCE_COLOURS, MASK_TOOLS, maskEditor, strokeIcon, type MaskEditorHandle, type MaskEditorState, type MaskMode, type MaskOutput, type MaskPixels, type MaskTool } from "@virgilvox/hackbuild-ui/vanilla";
import { ICON, download, esc, listeners, type Mounted, show } from "./dom.js";

/** One object a segment model found: a mask in image pixels (0 or 255), its word and score. */
export interface FoundMask {
  mask: Uint8Array;
  label: string;
  score: number;
}

/** The segment models a mask studio calls: a click segment for one point and a segment everything. */
export interface MaskModels {
  /** Click segment: the mask under one point, in image pixels. */
  segment?: (image: MaskPixels, point: { x: number; y: number }) => Promise<Uint8Array | null>;
  /** Segment everything: every object at once. */
  everything?: (image: MaskPixels) => Promise<FoundMask[]>;
}

/** A mask studio tool: the click segment point or one of the hackbuild-ui mask tools. */
export type StudioTool = "point" | MaskTool;

/**
 * What a mask studio shows: tool, mode, sizes, undo state, coverage, zoom, found and saved masks,
 * image size and the last error.
 */
export interface StudioState {
  ready: boolean;
  tool: StudioTool;
  mode: MaskMode;
  size: number;
  tolerance: number;
  canUndo: boolean;
  canRedo: boolean;
  coverage: number;
  zoom: number;
  busy: string;
  found: (FoundMask & { on: boolean; colour: string })[];
  /** Masks put aside with a name and a small preview, newest first. */
  saved: { id: number; name: string; thumb: string; coverage: number }[];
  width: number;
  height: number;
  /** The last failure, in words. */
  error: string;
}

/**
 * A mounted mask studio: image, tools, undo, grow and shrink, saved masks, found objects, export,
 * and a subscription to its state.
 */
export interface MaskStudio extends Mounted {
  setImage(src: string | HTMLImageElement | HTMLCanvasElement | ImageBitmap | MaskPixels): Promise<void>;
  setTool(t: StudioTool): void;
  setMode(m: MaskMode): void;
  setSize(px: number): void;
  setTolerance(pct: number): void;
  undo(): void;
  redo(): void;
  invert(): void;
  clear(): void;
  /** Grow, shrink or round off the mask, one undo step each. */
  expand(px?: number): void;
  shrink(px?: number): void;
  smooth(r?: number): void;
  /** Put the current mask aside; restore puts it back as one undo step. */
  save(name?: string): void;
  restore(id: number): void;
  forget(id: number): void;
  /** The current mask as ImageData (alpha by default), null before an image. */
  mask(kind?: MaskOutput): ImageData | null;
  zoom(dir: 1 | -1 | 0): void;
  everything(): Promise<void>;
  /** The click segment model at a point in image pixels, as a press with the point tool. */
  cutAt(x: number, y: number, mode?: MaskMode): Promise<void>;
  /** Add or take out one found object. */
  toggleFound(index: number): void;
  /** The mask, matte or cutout as a png Blob. */
  exportAs(kind: MaskOutput): Promise<Blob | null>;
  hasEverything: boolean;
  hasSegment: boolean;
  state(): StudioState;
  subscribe(fn: (s: StudioState) => void): () => void;
  setModels(m: MaskModels): void;
  /** Open the file picker. */
  pick(): void;
}

const ZOOMS = [0.5, 0.75, 1, 1.5, 2, 3, 4];

/**
 * Options for `mountMaskStudio`: the segment models, empty state words, a sample button and the
 * export file name.
 */
export interface MaskStudioOptions {
  models?: MaskModels;
  title?: string;
  note?: string;
  sampleLabel?: string;
  onSample?: () => void;
  /** Name of exported files, without extension. */
  name?: string;
}

/** Pixels of a drawable, for a model. */
function pixelsOf(src: CanvasImageSource & { width: number; height: number }): MaskPixels {
  const c = document.createElement("canvas");
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height);
  return { width: d.width, height: d.height, data: d.data };
}

/** A 48 px wide preview of a matte, as a data url. */
function thumbOf(img: ImageData): string {
  const c = document.createElement("canvas");
  c.width = img.width;
  c.height = img.height;
  c.getContext("2d")?.putImageData(img, 0, 0);
  const t = document.createElement("canvas");
  t.width = 48;
  t.height = Math.max(1, Math.round((48 * img.height) / Math.max(1, img.width)));
  t.getContext("2d")?.drawImage(c, 0, 0, t.width, t.height);
  return t.toDataURL("image/png");
}

/**
 * Mounts a mask studio on a host: drop or open an image, then cut masks with the point, wand, brush
 * and lasso tools or a segment model.
 */
export function mountMaskStudio(host: HTMLElement, o: MaskStudioOptions = {}): MaskStudio {
  let models = o.models ?? {};
  const l = listeners();
  host.innerHTML =
    `<div class="hb-lay-empty" data-empty><span class="hb-lay-empty-name">${esc(o.title ?? "drop an image")}</span><p class="hb-lay-empty-note">${esc(o.note ?? "press a thing to cut it out. the picture stays on this machine.")}</p><div class="hb-lay-empty-acts"><button type="button" class="hb-btn hb-btn-go" data-pick>open an image</button>${o.sampleLabel ? `<button type="button" class="hb-btn" data-sample>${esc(o.sampleLabel)}</button>` : ""}</div></div>` +
    `<div class="hb-mask is-fill" data-studio hidden><div class="hb-mask-well"><div class="hb-mask-frame"><canvas class="hb-mask-canvas" tabindex="0" role="img" aria-label="image and mask"></canvas><p class="hb-mask-hint" aria-live="polite"></p></div></div></div>` +
    `<input type="file" accept="image/*" hidden>`;
  const empty = host.querySelector<HTMLElement>("[data-empty]")!;
  const studio = host.querySelector<HTMLElement>("[data-studio]")!;
  const well = host.querySelector<HTMLElement>(".hb-mask-well")!;
  const frame = host.querySelector<HTMLElement>(".hb-mask-frame")!;
  const canvas = host.querySelector("canvas")!;
  const hint = host.querySelector<HTMLElement>(".hb-mask-hint")!;
  const input = host.querySelector<HTMLInputElement>("input[type=file]")!;
  const subs = new Set<(s: StudioState) => void>();
  let tool: StudioTool = models.segment ? "point" : "wand";
  let zoom = 1;
  let busy = "";
  let error = "";
  let pixels: MaskPixels | null = null;
  let found: StudioState["found"] = [];
  let saved: (StudioState["saved"][number] & { bytes: Uint8Array })[] = [];
  let savedSeq = 0
  let ed: MaskEditorState | null = null;

  const state = (): StudioState => ({
    ready: !!ed?.ready,
    tool,
    mode: ed?.mode ?? "add",
    size: ed?.size ?? 24,
    tolerance: ed?.tolerance ?? 6,
    canUndo: !!ed?.canUndo,
    canRedo: !!ed?.canRedo,
    coverage: ed?.coverage ?? 0,
    zoom,
    busy,
    found,
    saved: saved.map(({ bytes: _b, ...rest }) => rest),
    width: ed?.width ?? 0,
    height: ed?.height ?? 0,
    error,
  });
  const emit = () => {
    const s = state();
    hint.textContent = s.busy || s.error || (tool === "point" ? "press a thing to cut it out. x takes it away instead." : (MASK_TOOLS.find((t) => t.id === tool)?.hint ?? ""));
    for (const fn of subs) fn(s);
  };
  const editor: MaskEditorHandle = maskEditor(canvas, { tool: tool === "point" ? "wand" : tool, onError: (e) => ((error = `the image did not load: ${e.message}`), emit()) });
  l.add(editor.subscribe((s) => ((ed = s), emit())));
  // the well fills the subject (.hb-mask.is-fill); at fit the frame is as large as the well holds at the image's ratio
  const applyZoom = () => {
    const ratio = ed && ed.height ? ed.width / ed.height : 4 / 3;
    const fitW = Math.max(1, Math.min(well.clientWidth, well.clientHeight * ratio));
    studio.style.setProperty("--hb-mask-ratio", String(ratio));
    studio.style.setProperty("--hb-mask-w", `${Math.round(fitW * zoom)}px`);
    studio.classList.toggle("is-zoomed", zoom > 1);
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => applyZoom()) : null;
  ro?.observe(well);
  l.add(() => ro?.disconnect());


  // a press with the point tool asks the click segment model, before the editor sees it
  const cut = async (x: number, y: number, erase: boolean) => {
    if (!ed?.ready || !pixels || !models.segment) return;
    busy = "cutting it out";
    error = "";
    emit();
    try {
      const m = await models.segment(pixels, { x, y });
      if (!m) return;
      const cur = editor.mask();
      for (let i = 0; i < cur.length; i++) cur[i] = erase ? (m[i] ? 0 : cur[i]!) : m[i] || cur[i] ? 255 : 0;
      editor.setMask(cur);
    } catch (err) {
      error = `the cut failed: ${err instanceof Error ? err.message : String(err)}`;
    } finally {
      busy = "";
      emit();
    }
  };
  const onPoint = (e: Event) => {
    if (tool !== "point") return;
    e.stopImmediatePropagation();
    e.preventDefault();
    const pe = e as PointerEvent;
    const r = canvas.getBoundingClientRect();
    if (!ed?.ready) return;
    const x = Math.round(((pe.clientX - r.left) / r.width) * ed.width);
    const y = Math.round(((pe.clientY - r.top) / r.height) * ed.height);
    void cut(x, y, (ed.mode === "erase") !== pe.shiftKey);
  };
  // capture, so it runs before the editor's own handler on the canvas
  canvas.addEventListener("pointerdown", onPoint, true);
  l.add(() => canvas.removeEventListener("pointerdown", onPoint, true));

  const take = (f: File | undefined) => {
    if (!f) return;
    const url = URL.createObjectURL(f);
    void studioApi.setImage(url).finally(() => URL.revokeObjectURL(url));
  };
  l.on(input, "change", () => {
    take(input.files?.[0]);
    input.value = "";
  });
  l.on(host, "dragover", (e) => e.preventDefault());
  l.on(host, "drop", (e) => {
    e.preventDefault();
    take((e as DragEvent).dataTransfer?.files?.[0]);
  });
  l.on(empty, "click", (e) => {
    const t = e.target as Element;
    if (t.closest("[data-pick]")) input.click();
    else if (t.closest("[data-sample]")) o.onSample?.();
  });

  const studioApi: MaskStudio = {
    async setImage(src) {
      error = "";
      found = [];
      saved = [];
      let drawable: (CanvasImageSource & { width: number; height: number }) | null = null;
      if (typeof src === "string") {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.src = src;
        await img.decode();
        drawable = img;
      } else if ("data" in src && !(src instanceof HTMLCanvasElement)) {
        pixels = src as MaskPixels;
      } else drawable = src as CanvasImageSource & { width: number; height: number };
      if (drawable) pixels = pixelsOf(drawable);
      show(empty, false);
      // .hb-mask sets display, so the hidden attribute would not hide it
      show(studio, true);
      await editor.setImage(pixels!);
      zoom = 1;
      applyZoom();
      emit();
      canvas.focus({ preventScroll: true });
    },
    setTool(t) {
      if (t === "point" && !models.segment) return;
      tool = t;
      if (t !== "point") editor.setTool(t);
      canvas.dataset.tool = t;
      emit();
    },
    setMode: (m) => editor.setMode(m),
    setSize: (px) => editor.setSize(px),
    setTolerance: (p) => editor.setTolerance(p),
    undo: () => void editor.undo(),
    redo: () => void editor.redo(),
    invert: () => editor.invert(),
    clear: () => editor.clear(),
    expand: (px) => editor.expand(px),
    shrink: (px) => editor.shrink(px),
    smooth: (r) => editor.smooth(r),
    save(name) {
      if (!ed?.ready || !ed.coverage) return;
      const bytes = editor.mask();
      const id = ++savedSeq;
      saved = [{ id, name: name ?? `mask ${id}`, thumb: thumbOf(editor.toImageData("matte")), coverage: ed.coverage, bytes }, ...saved];
      emit();
    },
    restore(id) {
      const m = saved.find((x) => x.id === id);
      if (m && ed?.ready && m.bytes.length === ed.width * ed.height) editor.setMask(m.bytes);
    },
    forget(id) {
      saved = saved.filter((x) => x.id !== id);
      emit();
    },
    mask: (kind = "alpha") => (ed?.ready ? editor.toImageData(kind) : null),
    zoom(dir) {
      if (dir === 0) zoom = 1;
      else {
        const i = ZOOMS.indexOf(zoom);
        zoom = ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + dir))]!;
      }
      applyZoom();
      emit();
    },
    async everything() {
      if (!models.everything || !pixels) return;
      busy = "finding every object";
      error = "";
      emit();
      try {
        const list = await models.everything(pixels);
        found = list.map((f, i) => ({ ...f, on: false, colour: INSTANCE_COLOURS[i % INSTANCE_COLOURS.length]! }));
      } catch (e) {
        error = `segment everything failed: ${e instanceof Error ? e.message : String(e)}`;
      } finally {
        busy = "";
        emit();
      }
    },
    cutAt: (x, y, mode) => cut(x, y, (mode ?? ed?.mode) === "erase"),
    toggleFound(i) {
      const f = found[i];
      if (!f) return;
      found = found.map((x, k) => (k === i ? { ...x, on: !x.on } : x));
      const cur = editor.mask();
      for (let p = 0; p < cur.length; p++) if (f.mask[p]) cur[p] = f.on ? 0 : 255;
      editor.setMask(cur);
    },
    async exportAs(kind) {
      if (!ed?.ready) return null;
      return editor.toBlob(kind);
    },
    get hasEverything() {
      return !!models.everything;
    },
    get hasSegment() {
      return !!models.segment;
    },
    state,
    subscribe(fn) {
      subs.add(fn);
      fn(state());
      return () => subs.delete(fn);
    },
    setModels(m) {
      const hadSegment = !!models.segment;
      models = m;
      if (m.segment && !hadSegment) {
        tool = "point";
        canvas.dataset.tool = "point";
      }
      if (tool === "point" && !m.segment) studioApi.setTool("wand");
      emit();
    },
    pick: () => input.click(),
    dispose() {
      l.off();
      editor.dispose();
      subs.clear();
    },
  };
  canvas.dataset.tool = tool;
  emit();
  return studioApi;
}

/** The tool rail of a studio: point (when a click model is set), wand, brush, lasso, and segment everything (when that model is set). */
export function mountMaskTools(host: HTMLElement, studio: MaskStudio): Mounted {
  const l = listeners();
  const draw = (s: StudioState) => {
    const tools: { id: StudioTool; label: string; key: string; icon: string }[] = [
      ...(studio.hasSegment ? [{ id: "point" as const, label: "cut out a thing", key: "a", icon: "crosshairs" }] : []),
      ...MASK_TOOLS.map((t) => ({ id: t.id, label: t.label, key: t.key, icon: t.icon })),
    ];
    host.innerHTML = tools.map((t) => `<button type="button" class="hb-iconbtn" data-tool="${t.id}" aria-label="${esc(t.label)} (${t.key})" title="${esc(t.label)} (${t.key})" aria-pressed="${s.tool === t.id}" aria-keyshortcuts="${t.key}">${strokeIcon(t.icon as never, { size: 18 })}</button>`).join("");
  };
  l.on(host, "click", (e) => {
    const t = (e.target as Element).closest<HTMLElement>("[data-tool]");
    if (t) studio.setTool(t.dataset.tool as StudioTool);
  });
  l.on(document, "keydown", (e) => {
    const ke = e as KeyboardEvent;
    const typing = !!(ke.target as HTMLElement).closest?.("input,textarea,[contenteditable]");
    if (!typing && !ke.ctrlKey && !ke.metaKey && studio.state().ready) {
      if (ke.key === "+" || ke.key === "=") return studio.zoom(1);
      if (ke.key === "-") return studio.zoom(-1);
      if (ke.key === "0") return studio.zoom(0);
    }
    if (ke.key === "a" && !ke.ctrlKey && !ke.metaKey && studio.hasSegment && !(ke.target as HTMLElement).closest?.("input,textarea,[contenteditable]")) studio.setTool("point");
  });
  l.add(studio.subscribe(draw));
  return { dispose: () => l.off() };
}

/** The verb row on the canvas: undo and redo once there is a change, zoom once there is an image. */
export function mountMaskVerbs(host: HTMLElement, studio: MaskStudio): Mounted {
  const l = listeners();
  let last = "";
  const draw = (s: StudioState) => {
    const html = s.ready
      ? `${s.canUndo ? `<button type="button" class="hb-iconbtn" data-v="undo" aria-label="undo" title="undo (ctrl z)">${ICON.undo}</button>` : ""}${s.canRedo ? `<button type="button" class="hb-iconbtn" data-v="redo" aria-label="redo" title="redo (ctrl shift z)">${ICON.redo}</button>` : ""}` +
        // zoom out and fit show once zoomed in, so the row stays short
        (s.zoom !== 1 ? `<button type="button" class="hb-iconbtn" data-v="out" aria-label="zoom out" title="zoom out (-)">${ICON.zoomOut}</button><button type="button" class="hb-iconbtn" data-v="fit" aria-label="fit, now ${Math.round(s.zoom * 100)} percent" title="fit (0)">${ICON.fit}</button>` : "") +
        `<button type="button" class="hb-iconbtn" data-v="in" aria-label="zoom in" title="zoom in (+)">${ICON.zoomIn}</button>`
      : "";
    if (html !== last) host.innerHTML = last = html;
    host.hidden = !html;
  };
  l.on(host, "click", (e) => {
    const v = (e.target as Element).closest<HTMLElement>("[data-v]")?.dataset.v;
    if (v === "undo") studio.undo();
    else if (v === "redo") studio.redo();
    else if (v === "in") studio.zoom(1);
    else if (v === "out") studio.zoom(-1);
    else if (v === "fit") studio.zoom(0);
  });
  l.add(studio.subscribe(draw));
  return { dispose: () => l.off() };
}

/** The rack parts: what was found, the mask tools' settings, and the exports once there is a mask. */
export function mountMaskRack(host: HTMLElement, studio: MaskStudio, part: "found" | "mask" | "saved" | "export", o: { name?: string } = {}): Mounted {
  const l = listeners();
  let last = "";
  const draw = (s: StudioState) => {
    let html = "";
    if (part === "found") {
      html = s.found.length
        ? `<div class="hb-inst"><ul class="hb-inst-list">${s.found.map((f, i) => `<li class="hb-inst-row${f.on ? " is-on" : ""}" style="--hb-inst-c:${f.colour}"><button type="button" class="hb-inst-pick" data-found="${i}" aria-pressed="${f.on}"><span class="hb-inst-sw"></span><span class="hb-inst-name">${esc(f.label)}</span><span class="hb-inst-score">${Math.round(f.score * 100)}%</span></button></li>`).join("")}</ul></div>`
        : `<p class="hb-lay-empty-note">${s.ready ? (studio.hasEverything ? "find every object at once, or press a thing on the picture." : "press a thing to cut it out.") : "nothing yet. open an image or try the sample."}</p>` +
          (s.ready && studio.hasEverything && !s.busy ? `<button type="button" class="hb-btn hb-btn-go" data-all>find every object</button>` : "");
      html += s.ready ? `<div class="hb-kv"><span class="hb-label">mask keeps</span><span class="hb-readout">${Math.round(s.coverage * 100)}%</span></div>` : "";
    } else if (part === "mask") {
      html =
        `<div class="hb-seg is-toggle" role="group" aria-label="mode">${(["add", "erase"] as const).map((m) => `<button type="button" data-mode="${m}" class="${s.mode === m ? "is-on" : ""}" aria-pressed="${s.mode === m}">${m}<span class="hb-mask-key" aria-hidden="true">x</span></button>`).join("")}</div>` +
        (s.tool === "brush" || s.tool === "eraser" ? `<label class="hb-field"><span class="hb-label">brush, ${s.size} px</span><input class="hb-range" type="range" min="4" max="160" step="2" value="${s.size}" data-size></label>` : "") +
        (s.tool === "wand" || s.tool === "flood" ? `<label class="hb-field"><span class="hb-label">reach, ${s.tolerance}</span><input class="hb-range" type="range" min="0" max="100" step="1" value="${s.tolerance}" data-tol></label>` : "") +
        (s.coverage > 0 ? `<div class="hb-toolbar"><button type="button" class="hb-btn" data-op="smooth">smooth</button><button type="button" class="hb-btn" data-op="expand">expand</button><button type="button" class="hb-btn" data-op="shrink">shrink</button><button type="button" class="hb-btn" data-op="invert">invert</button><button type="button" class="hb-btn" data-op="clear">clear</button></div>` : "");
    } else if (part === "saved") {
      html =
        (s.coverage > 0 ? `<div class="hb-toolbar"><button type="button" class="hb-btn" data-op="save">save this mask</button></div>` : "") +
        (s.saved.length
          ? `<div class="hb-inst"><ul class="hb-inst-list">${s.saved.map((m) => `<li class="hb-inst-row"><button type="button" class="hb-inst-pick" data-restore="${m.id}"><img class="hb-inst-sw" src="${m.thumb}" alt=""><span class="hb-inst-name">${esc(m.name)}</span><span class="hb-inst-score">${Math.round(m.coverage * 100)}%</span></button><button type="button" class="hb-inst-act" data-forget="${m.id}" aria-label="forget ${esc(m.name)}" title="forget">${ICON.x}</button></li>`).join("")}</ul></div>`
          : `<p class="hb-lay-empty-note">no saved masks. save one to come back to it.</p>`);
    } else {
      html =
        s.coverage > 0
          ? `<div class="hb-toolbar" role="group" aria-label="export"><button type="button" class="hb-btn" data-ex="cutout">cutout png</button><button type="button" class="hb-btn" data-ex="alpha">mask png</button><button type="button" class="hb-btn" data-ex="matte">matte png</button></div>`
          : `<p class="hb-lay-empty-note">exports show once there is a mask.</p>`;
    }
    if (html !== last) host.innerHTML = last = html;
  };
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const f = t.closest<HTMLElement>("[data-found]");
    if (f) return studio.toggleFound(Number(f.dataset.found));
    const m = t.closest<HTMLElement>("[data-mode]");
    if (m) return studio.setMode(m.dataset.mode as MaskMode);
    const op = t.closest<HTMLElement>("[data-op]")?.dataset.op;
    if (op === "invert") return studio.invert();
    if (op === "clear") return studio.clear();
    if (op === "smooth") return studio.smooth();
    if (op === "expand") return studio.expand();
    if (op === "shrink") return studio.shrink();
    if (op === "save") return studio.save();
    const restore = t.closest<HTMLElement>("[data-restore]");
    if (restore) return studio.restore(Number(restore.dataset.restore));
    const forget = t.closest<HTMLElement>("[data-forget]");
    if (forget) return studio.forget(Number(forget.dataset.forget));
    const ex = t.closest<HTMLElement>("[data-ex]");
    if (ex) {
      const kind = ex.dataset.ex as MaskOutput;
      return void studio.exportAs(kind).then((b) => b && download(`${o.name ?? "mask"}-${kind}.png`, b));
    }
    if (t.closest("[data-all]")) void studio.everything();
  });
  l.on(host, "input", (e) => {
    const i = e.target as HTMLInputElement;
    if (i.dataset.size !== undefined) studio.setSize(Number(i.value));
    if (i.dataset.tol !== undefined) studio.setTolerance(Number(i.value));
  });
  l.add(studio.subscribe(draw));
  return { dispose: () => l.off() };
}

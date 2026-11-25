/**
 * ModelSelect in the DOM: the closed line (or the bar chip) with its one
 * pink "load, <size>", and the sheet in a drawer with search, the three
 * filters, grouped rows, options and the sheet's own "your own" forms. Rows come from
 * useModelPick; hackbuild-ui modelSelect, modelSheet and drawer draw them.
 */

import { canLoad, drawer, lineWords, loadLabel, modelSelect, modelSheet, type ModelRow } from "@virgilvox/hackbuild-ui/vanilla";
import { esc, listeners, type Mounted } from "./dom.js";
import type { JobsPick, ModelPick, PickSnapshot } from "./pick.js";

/** The sheet of one pick, in a drawer on the body. Opens on `open()`. */
export function pickSheet(pick: ModelPick): Mounted & { open(): void } {
  const doc = document;
  const root = doc.createElement("div");
  root.className = "hb-drawer hb";
  const s0 = pick.snapshot();
  root.innerHTML = `<div class="hb-drawer-panel" role="dialog" aria-modal="true"><div class="hb-drawer-hd"><span>${esc(s0.title)}</span><button type="button" class="hb-iconbtn" aria-label="close" data-hb-close><svg class="hb-icon is-stroke" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div><div class="hb-msheet-host"></div></div>`;
  doc.body.append(root);
  const body = root.querySelector<HTMLElement>(".hb-msheet-host")!;
  const sheet = modelSheet(body, {
    rows: s0.rows,
    chosen: s0.chosen,
    title: s0.title,
    onChoose: (id) => pick.choose(id),
    onLoad: (id) => void pick.load(id).catch(() => undefined),
    onCancel: (id) => pick.cancel(id),
    onRemove: (id) => void pick.remove(id),
    onOption: (id, k, v) => pick.option(id, k, v),
    onCustom: (kind, values) => void pick.custom(kind, values),
  });
  const l = listeners();
  const handle = drawer(root, { side: "auto", breakpoint: 641, label: s0.title });
  l.add(
    pick.subscribe((s) => sheet.update(s.rows, s.chosen)),
  );
  return {
    open: () => handle.open(),
    dispose() {
      l.off();
      sheet.dispose();
      handle.dispose();
      root.remove();
    },
  };
}

export interface ModelSelectOptions {
  /** "line" (default): the one line and the pink load. "chip": the one model chip of the bar. */
  variant?: "line" | "chip";
  /** Draw the pink load. Off on a gate, whose own button is the pink action. */
  go?: boolean;
}

function chipWords(s: PickSnapshot): string {
  const w = lineWords(s.row, s.empty);
  return w.state ? `${w.name}, ${w.state}` : w.name;
}

/** The closed picker over a host; pressing it opens the sheet. */
export function mountModelSelect(host: HTMLElement, pick: ModelPick, o: ModelSelectOptions = {}): Mounted {
  const sheet = pickSheet(pick);
  host.classList.add("hb-msel-host");
  const l = listeners();
  if (o.variant === "chip") {
    const draw = (s: PickSnapshot) => {
      const words = chipWords(s);
      host.innerHTML = `<button type="button" class="hb-msel-chip${s.row?.state ? ` is-${s.row.state}` : ""}" aria-haspopup="dialog" aria-label="model: ${esc(words)}"><span>${esc(words)}</span></button>`;
    };
    l.on(host, "click", (e) => {
      if ((e.target as Element).closest(".hb-msel-chip")) sheet.open();
    });
    l.add(pick.subscribe(draw));
  } else {
    const inner = document.createElement("div");
    host.replaceChildren(inner);
    const s0 = pick.snapshot();
    const sel = modelSelect(inner, { rows: s0.rows, chosen: s0.chosen, go: o.go ?? true, empty: s0.empty, onOpen: () => sheet.open(), onLoad: (id) => void pick.load(id).catch(() => undefined) });
    l.add(pick.subscribe((s) => sel.update(s.rows, s.chosen)));
    l.add(() => sel.dispose());
  }
  return {
    dispose() {
      l.off();
      sheet.dispose();
    },
  };
}

/** The words of a gate's one pink button for a pick: "load, 1.7 gb", then "ready". */
export function gateWords(row: ModelRow | undefined): string {
  return row && canLoad(row) ? loadLabel(row) : row?.state === "loaded" ? "ready" : loadLabel(row);
}

/** Several jobs: one line per job, presets with totals, and one pink "load all, <total>". */
export function mountModelJobs(host: HTMLElement, jobs: JobsPick, o: { go?: boolean } = {}): Mounted {
  const sheets = new Map([...jobs.picks].map(([job, p]) => [job, pickSheet(p)]));
  host.classList.add("hb-msel-host");
  const draw = () => {
    const presets = jobs.presets();
    const all = jobs.all();
    host.innerHTML =
      `<div class="hb-msel-jobs">` +
      (presets.length ? `<div class="hb-msel-presets" role="group" aria-label="presets">${presets.map((p) => `<button type="button" class="hb-chip" data-preset="${esc(p.id)}">${esc(p.label)}, ${esc(p.total)}</button>`).join("")}</div>` : "") +
      jobs
        .lines()
        .map((j) => {
          const w = lineWords(j.row, "no model");
          return `<div class="hb-msel-job"><span class="hb-msel-joblabel">${esc(j.label)}${j.required ? "<b> required</b>" : ""}</span><button type="button" class="hb-msel-line" data-job="${j.job}" aria-haspopup="dialog" aria-label="${esc(j.label)}: ${esc(w.name)}"><span class="hb-msel-name">${esc(w.name)}</span>${w.meta ? `<span class="hb-msel-meta">${esc(w.meta)}</span>` : ""}${w.state ? `<span class="hb-msel-state${j.row?.state === "loaded" ? " is-loaded" : ""}">${esc(w.state)}</span>` : ""}</button></div>`;
        })
        .join("") +
      ((o.go ?? true) && all.ids.length ? `<div class="hb-msel"><button type="button" class="hb-btn hb-btn-go" data-all>${esc(all.label)}</button></div>` : "") +
      `</div>`;
  };
  const l = listeners();
  l.on(host, "click", (e) => {
    const t = e.target as Element;
    const job = t.closest<HTMLElement>("[data-job]")?.dataset.job;
    if (job) return sheets.get(job as never)?.open();
    const pre = t.closest<HTMLElement>("[data-preset]")?.dataset.preset;
    if (pre) return jobs.applyPreset(pre);
    if (t.closest("[data-all]")) void jobs.loadAll();
  });
  l.add(jobs.subscribe(draw));
  draw();
  return {
    dispose() {
      l.off();
      for (const s of sheets.values()) s.dispose();
    },
  };
}

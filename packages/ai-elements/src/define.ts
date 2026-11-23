/** Register the elements under a prefix. Nothing registers on import. */

import { chatPanelClass, downloadBarClass, memoryInspectorClass, modelPickerClass, statusPillsClass } from "./elements.js";

export const ELEMENT_NAMES = ["model-picker", "download-bar", "status-pills", "chat-panel", "memory-inspector"] as const;

export interface DefineTarget {
  get(name: string): unknown;
  define(name: string, ctor: CustomElementConstructor): void;
}

/**
 * Define hb-model-picker, hb-download-bar, hb-status-pills, hb-chat-panel
 * and hb-memory-inspector (or another prefix). Names already defined are
 * left alone. Returns the tag names.
 */
export function define(prefix = "hb", registry?: DefineTarget, Base?: new () => HTMLElement): string[] {
  const reg = registry ?? (globalThis as { customElements?: DefineTarget }).customElements;
  const B = Base ?? (globalThis as { HTMLElement?: new () => HTMLElement }).HTMLElement;
  if (!reg || !B) throw new Error("no custom elements in this environment");
  const make = { "model-picker": modelPickerClass, "download-bar": downloadBarClass, "status-pills": statusPillsClass, "chat-panel": chatPanelClass, "memory-inspector": memoryInspectorClass };
  return ELEMENT_NAMES.map((n) => {
    const tag = `${prefix}-${n}`;
    if (!reg.get(tag)) reg.define(tag, make[n](B) as unknown as CustomElementConstructor);
    return tag;
  });
}

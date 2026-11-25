/**
 * @hackbuild/ai-elements is deprecated: its elements live on in
 * @hackbuild/ai-views, which binds the same packages to hackbuild-ui. This
 * entry re-exports the views' custom elements and says so once on define().
 * The model picker, download bar, status pills and chat panel of 0.1 are
 * gone; use <model-select>, <chat-pane> and <chat-composer> from ai-views.
 */

import { define as defineViews, type DefineTarget } from "@hackbuild/ai-views/elements";

/** Written once to the console by define(). */
export const DEPRECATION = "@hackbuild/ai-elements is deprecated. use @hackbuild/ai-views: <model-select>, <chat-pane>, <chat-composer>, <memory-inspector> and the other views.";

let told = false;

/** Registers the ai-views elements under the prefix (default hb) and notes the deprecation once. */
export function define(prefix = "hb", registry?: DefineTarget, Base?: new () => HTMLElement): string[] {
  if (!told) {
    told = true;
    console.warn(DEPRECATION);
  }
  return defineViews(prefix, registry, Base);
}

export { ELEMENT_NAMES, mountMemoryInspector, type DefineTarget, type MemoryInspector } from "@hackbuild/ai-views/elements";
export { traceRows, inspectorHtml, type TraceRow, type RecallLike } from "@hackbuild/ai-views";

/**
 * The selection rasterisers of the mask studio, re-exported from the
 * hackbuild-ui mask tools (`@virgilvox/hackbuild-ui/vanilla`, an optional
 * peer, which is why they sit on this subpath), plus wrappers that return
 * a vision {@link Mask} (255 inside) so the results feed the mask
 * operations, cutouts and instance export of `@hackbuild/vision`.
 */

import { ellipseFill, polygonFill, rectFill, wandSelect, type MaskPixels, type MaskPt } from "@virgilvox/hackbuild-ui/vanilla";
import { selectionToMask } from "./masks.js";
import type { Mask, Pixels } from "./types.js";

export {
  wandSelect,
  polygonFill,
  rectFill,
  ellipseFill,
  pointInPolygon,
  colourDistance,
  applySelection,
  morphMask,
  smoothMask,
  invertMask,
  stampDisc,
  strokeSegment,
  type MaskPixels,
  type MaskPt,
  type MaskMode,
} from "@virgilvox/hackbuild-ui/vanilla";

const asUi = (px: Pixels): MaskPixels => ({ width: px.width, height: px.height, data: px.data instanceof Uint8ClampedArray ? px.data : new Uint8ClampedArray(px.data.buffer, px.data.byteOffset, px.data.byteLength) });

/** Magic wand: pixels within `tolerance` percent of the colour at x, y; `contiguous` (default) floods through 4 neighbours, off takes every such pixel. */
export function wandMask(px: Pixels, x: number, y: number, tolerance: number, contiguous = true): Mask {
  return selectionToMask(wandSelect(asUi(px), x, y, tolerance, contiguous), px.width, px.height);
}

/** Flood fill: the contiguous patch of one colour under x, y, within `tolerance` percent (the wand with contiguous on, as the flood tool). */
export function floodMask(px: Pixels, x: number, y: number, tolerance = 0): Mask {
  return wandMask(px, x, y, tolerance, true);
}

/** Lasso or polygon: every pixel whose centre lies inside the path (even odd). Under three points selects nothing. */
export function polygonMask(width: number, height: number, points: readonly MaskPt[]): Mask {
  return selectionToMask(polygonFill(width, height, [...points]), width, height);
}

/** The lasso is a freehand polygon; the same rasteriser. */
export const lassoMask = polygonMask;

/** The rectangle between two corners, in image pixels. */
export function rectMask(width: number, height: number, a: MaskPt, b: MaskPt): Mask {
  return selectionToMask(rectFill(width, height, a, b), width, height);
}

/** The ellipse that fills the box between two corners. */
export function ellipseMask(width: number, height: number, a: MaskPt, b: MaskPt): Mask {
  return selectionToMask(ellipseFill(width, height, a, b), width, height);
}

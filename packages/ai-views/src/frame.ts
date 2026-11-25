/**
 * What FrameView draws over a frame, as data: boxes from a detector,
 * landmark points from a face, hand or pose model, and a caption from a
 * vision language model. Coordinates are in source pixels. Pure, so the
 * mapping onto a tile that crops (object-fit cover) is tested in Node.
 */

export interface FrameBox {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  /** 0 to 1. */
  score?: number;
}

export interface FrameLandmarks {
  points: { x: number; y: number }[];
  /** Index pairs to join with lines. */
  edges?: [number, number][];
  label?: string;
}

export interface FrameResults {
  boxes?: FrameBox[];
  landmarks?: FrameLandmarks[];
  caption?: string;
  /** Short words for a tile corner: "3 found", "12 ms". */
  tag?: string;
}

/** Source to view pixels for object-fit cover (crop) or contain (bars). */
export function fitMap(src: { w: number; h: number }, view: { w: number; h: number }, fit: "cover" | "contain" = "cover"): { scale: number; dx: number; dy: number } {
  if (src.w <= 0 || src.h <= 0) return { scale: 1, dx: 0, dy: 0 };
  const sx = view.w / src.w;
  const sy = view.h / src.h;
  const scale = fit === "cover" ? Math.max(sx, sy) : Math.min(sx, sy);
  return { scale, dx: (view.w - src.w * scale) / 2, dy: (view.h - src.h * scale) / 2 };
}

/** A box in view pixels; mirrored for a selfie view. */
export function toView(b: FrameBox, m: { scale: number; dx: number; dy: number }, viewW: number, mirror = false): FrameBox {
  const x = b.x * m.scale + m.dx;
  const w = b.w * m.scale;
  return { ...b, x: mirror ? viewW - x - w : x, y: b.y * m.scale + m.dy, w, h: b.h * m.scale };
}

/** "cup 94%", or the label alone, or the score alone. */
export function boxWords(b: FrameBox): string {
  const pct = b.score !== undefined ? `${Math.round(Math.min(1, Math.max(0, b.score)) * 100)}%` : "";
  return [b.label ?? "", pct].filter(Boolean).join(" ");
}

/** The corner tag: the caller's words, else how many boxes and landmark sets were found. */
export function frameTag(r: FrameResults): string {
  if (r.tag) return r.tag;
  const n = (r.boxes?.length ?? 0) + (r.landmarks?.length ?? 0);
  return n ? `${n} found` : "";
}

/** One colour per label, stable across frames, from a palette. */
export function labelColour(label: string | undefined, palette: readonly string[]): string {
  let h = 0;
  for (const c of label ?? "") h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length]!;
}

/**
 * Overlap add for models that take fixed length segments (htdemucs in
 * an earlier August build): segments of S samples on a stride of
 * S (1 - overlap), a linear crossfade over min(S - stride, S / 4) at each
 * end, weights floored at 1e-4, and a division by the summed weights.
 */

export interface Segment {
  start: number;
  /** Real samples in this segment; the model input is zero padded to S. */
  len: number;
}

export function planSegments(total: number, size: number, overlap: number): { segments: Segment[]; stride: number; fade: number } {
  const ov = Math.max(0, Math.min(0.6, overlap));
  const stride = Math.max(1, Math.floor(size * (1 - ov)));
  const fade = Math.max(1, Math.min(size - stride, Math.floor(size * 0.25)));
  const segments: Segment[] = [];
  for (let start = 0; start < total; start += stride) segments.push({ start, len: Math.min(size, total - start) });
  if (!segments.length) segments.push({ start: 0, len: 0 });
  return { segments, stride, fade };
}

/** Crossfade weight of sample i in a segment of len samples. */
export function fadeWeight(i: number, len: number, fade: number): number {
  return Math.max(1e-4, Math.min(Math.min(i / fade, 1), Math.min((len - i) / fade, 1)));
}

/** Accumulates weighted segment outputs into `tracks` by `channels` buffers of `total` samples. */
export class OverlapAdd {
  readonly out: Float32Array[][];
  private readonly w: Float32Array;
  constructor(
    readonly total: number,
    readonly tracks: number,
    readonly channels: number,
    readonly fade: number,
  ) {
    this.out = Array.from({ length: tracks }, () => Array.from({ length: channels }, () => new Float32Array(total)));
    this.w = new Float32Array(total);
  }

  /**
   * Add one segment. `data` is laid out [track][channel][sample] with
   * `stride` samples per channel row (the model's segment length).
   */
  add(seg: Segment, data: ArrayLike<number>, stride: number): void {
    for (let i = 0; i < seg.len; i++) {
      const w = fadeWeight(i, seg.len, this.fade);
      this.w[seg.start + i]! += w;
      for (let t = 0; t < this.tracks; t++)
        for (let c = 0; c < this.channels; c++) this.out[t]![c]![seg.start + i]! += data[(t * this.channels + c) * stride + i]! * w;
    }
  }

  /** Divide by the summed weights. Call once. */
  finish(): Float32Array[][] {
    for (const tr of this.out)
      for (const ch of tr)
        for (let i = 0; i < this.total; i++) {
          const w = this.w[i]!;
          if (w > 0) ch[i]! /= w;
        }
    return this.out;
  }
}

/**
 * transformers.js reports progress per file. A status line wants one
 * fraction across files, and an MB count when totals are unknown (an earlier relief bench
 * summed loaded over total by file name).
 */

export interface FileProgressEvent {
  status?: string;
  file?: string;
  name?: string;
  loaded?: number;
  total?: number;
  progress?: number;
}

export interface MergedProgress {
  loaded: number;
  /** null while no file has reported a total. */
  total: number | null;
  fraction: number | null;
  files: number;
  /** "downloading 42% of 96 MB" or "downloading 12 MB" (computed). */
  line: string;
}

export function progressMerger(onUpdate: (p: MergedProgress) => void): (ev: FileProgressEvent) => void {
  const files = new Map<string, [number, number | null]>();
  return (ev) => {
    if (ev.status !== "progress" && ev.status !== "done") return;
    const key = ev.file ?? ev.name ?? "?";
    const prev = files.get(key);
    const total = typeof ev.total === "number" && ev.total > 0 ? ev.total : (prev?.[1] ?? null);
    const loaded = ev.status === "done" && total !== null ? total : (ev.loaded ?? prev?.[0] ?? 0);
    files.set(key, [loaded, total]);
    let a = 0;
    let b = 0;
    let known = false;
    for (const [l, t] of files.values()) {
      a += l;
      if (t !== null) {
        b += t;
        known = true;
      }
    }
    const mb = (n: number) => (n / 1048576).toFixed(0);
    const fraction = known && b > 0 ? Math.min(1, a / b) : null;
    onUpdate({
      loaded: a,
      total: known ? b : null,
      fraction,
      files: files.size,
      line: fraction === null ? `downloading ${mb(a)} MB` : `downloading ${Math.round(fraction * 100)}% of ${mb(b)} MB`,
    });
  };
}

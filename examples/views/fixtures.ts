// Fixtures and stub providers shared by the view demos. Nothing here
// downloads: the loader only moves a progress bar, the chat engine is
// scripted, the transcriber returns fixed lines, and the mask and frame
// models answer from the drawn sample.
import type { Env } from "@hackbuild/ai-env";
import type { Loader } from "@hackbuild/ai-views";

/** A machine with an 8 gb class gpu, as a probe would report it (fixture). */
export const FIXTURE_ENV = {
  webgpu: true,
  f16: true,
  adapter: null,
  maxBufferBytes: null,
  isolated: false,
  protocol: "https",
  opfs: true,
  cacheStorage: true,
  indexedDB: true,
  threads: 1,
  deviceMemoryGB: 8,
  promptApi: false,
} as unknown as Env;

/** Moves the progress to full over about a second; fetches nothing. */
export const stubLoader: Loader = (_rec, ctx) =>
  new Promise((ok, bad) => {
    let f = 0;
    const t = setInterval(() => {
      f = Math.min(1, f + 0.2);
      ctx.onProgress(f);
      if (f >= 1) {
        clearInterval(t);
        ok(undefined);
      }
    }, 180);
    ctx.signal.addEventListener("abort", () => (clearInterval(t), bad(new Error("aborted"))));
  });

/** A drawn sample: a cup on a table, 800 by 600. */
export function sampleCanvas(): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 800;
  c.height = 600;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efe9db";
  g.fillRect(0, 0, 800, 600);
  g.fillStyle = "#d9d0bd";
  g.fillRect(0, 420, 800, 180);
  g.fillStyle = "#c3251f";
  g.beginPath();
  g.moveTo(330, 260);
  g.lineTo(470, 260);
  g.lineTo(470, 410);
  g.lineTo(330, 410);
  g.closePath();
  g.fill();
  g.fillStyle = "#2f5fa7";
  g.beginPath();
  g.arc(600, 380, 60, 0, Math.PI * 2);
  g.fill();
  return c;
}

/** The shapes in the sample, in its pixels: what the stub models find. */
export const SAMPLE_THINGS = [
  { label: "cup", score: 0.94, x: 330, y: 260, w: 140, h: 150 },
  { label: "ball", score: 0.81, x: 540, y: 320, w: 120, h: 120 },
];

/** A mask of the sample's things under a point, 0 or 255 per pixel. */
export function sampleMask(w: number, h: number, pick: (x: number, y: number) => boolean): Uint8Array {
  const m = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (pick(x, y)) m[y * w + x] = 255;
  return m;
}

/** Exposes the page's sample loader to the screen gate and the smokes. */
export function exposeSample(fn: () => Promise<void> | void): void {
  (window as unknown as { hbSample: () => Promise<void> }).hbSample = async () => {
    await fn();
  };
}

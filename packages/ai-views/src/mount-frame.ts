/**
 * FrameView and CameraFeed, after the eyes view of an earlier room: a
 * frame in a hackbuild-ui camera tile with what the models found drawn
 * over it (boxes with their word and score, landmark points and lines),
 * a count in the corner and the caption under it. CameraFeed opens the
 * camera into a tile and hands frames to the page at a set rate.
 */

import { INSTANCE_COLOURS, cameraFault, closeCamera, openCamera } from "@virgilvox/hackbuild-ui/vanilla";
import { esc, listeners, type Mounted, show } from "./dom.js";
import { boxWords, fitMap, frameTag, labelColour, toView, type FrameResults } from "./frame.js";

type Source = HTMLImageElement | HTMLVideoElement | HTMLCanvasElement;

export interface FrameView extends Mounted {
  /** An image url, or a live element (a camera video); null shows the empty tile. */
  setSource(src: string | Source | null): Promise<void>;
  setResults(r: FrameResults): void;
  setMirror(on: boolean): void;
  /** Draw again, as after a resize or a new video frame. */
  paint(): void;
}

export interface FrameViewOptions {
  empty?: string;
  mirror?: boolean;
  /** Ink of the drawn boxes' word strip; default the paper token. */
  palette?: readonly string[];
}

const css = (el: Element, name: string, fb: string) => {
  try {
    return getComputedStyle(el).getPropertyValue(name).trim() || fb;
  } catch {
    return fb;
  }
};

export function mountFrameView(host: HTMLElement, o: FrameViewOptions = {}): FrameView {
  host.innerHTML = `<div class="hb-frameview"><figure class="hb-camtile" aria-label="frame"><div class="hb-camtile-none" role="status">${esc(o.empty ?? "no frame yet")}</div><canvas aria-hidden="true"></canvas><span class="hb-camtile-tag is-tl" hidden></span></figure><p class="hb-frameview-cap" data-caption aria-live="polite" hidden></p></div>`;
  const fig = host.querySelector("figure")!;
  const canvas = host.querySelector("canvas")!;
  const none = host.querySelector<HTMLElement>(".hb-camtile-none")!;
  const tag = host.querySelector<HTMLElement>(".hb-camtile-tag")!;
  const cap = host.querySelector<HTMLElement>("[data-caption]")!;
  const palette = o.palette ?? INSTANCE_COLOURS;
  let src: Source | null = null;
  let results: FrameResults = {};
  let mirror = !!o.mirror;
  const l = listeners();

  const size = () => {
    const s = src as (Source & { naturalWidth?: number; videoWidth?: number }) | null;
    if (!s) return { w: 0, h: 0 };
    if (s instanceof HTMLVideoElement) return { w: s.videoWidth, h: s.videoHeight };
    if (s instanceof HTMLImageElement) return { w: s.naturalWidth, h: s.naturalHeight };
    return { w: s.width, h: s.height };
  };
  const paint = () => {
    const r = fig.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, r.width, r.height);
    const sz = size();
    const m = fitMap(sz, { w: r.width, h: r.height }, "cover");
    if (src instanceof HTMLImageElement || src instanceof HTMLCanvasElement) {
      g.save();
      if (mirror) {
        g.translate(r.width, 0);
        g.scale(-1, 1);
      }
      g.drawImage(src, m.dx, m.dy, sz.w * m.scale, sz.h * m.scale);
      g.restore();
    }
    const ink = css(fig, "--hb-void", "#0a0a0a");
    const paper = css(fig, "--hb-paper", "ivory");
    const slime = css(fig, "--hb-slime", "#a6e22e");
    g.font = `11px ${css(fig, "--hb-utility", "ui-monospace, monospace")}`;
    g.textBaseline = "top";
    for (const b of results.boxes ?? []) {
      const v = toView(b, m, r.width, mirror);
      const c = labelColour(b.label, palette);
      g.lineWidth = 3;
      g.strokeStyle = ink;
      g.strokeRect(v.x, v.y, v.w, v.h);
      g.lineWidth = 2;
      g.strokeStyle = c;
      g.strokeRect(v.x, v.y, v.w, v.h);
      const words = boxWords(b);
      if (words) {
        const tw = g.measureText(words).width + 8;
        const ty = v.y >= 16 ? v.y - 16 : v.y;
        g.fillStyle = c;
        g.fillRect(v.x - 1, ty, tw, 16);
        g.fillStyle = ink;
        g.fillText(words, v.x + 3, ty + 2);
      }
    }
    for (const set of results.landmarks ?? []) {
      const pts = set.points.map((p) => toView({ x: p.x, y: p.y, w: 0, h: 0 }, m, r.width, mirror));
      g.strokeStyle = slime;
      g.lineWidth = 1.5;
      for (const [a, b] of set.edges ?? []) {
        const pa = pts[a];
        const pb = pts[b];
        if (!pa || !pb) continue;
        g.beginPath();
        g.moveTo(pa.x, pa.y);
        g.lineTo(pb.x, pb.y);
        g.stroke();
      }
      for (const p of pts) {
        g.fillStyle = ink;
        g.fillRect(p.x - 2.5, p.y - 2.5, 5, 5);
        g.fillStyle = paper;
        g.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
      }
    }
  };
  const ro = typeof ResizeObserver === "function" ? new ResizeObserver(() => paint()) : null;
  ro?.observe(fig);
  l.add(() => ro?.disconnect());
  let video: HTMLVideoElement | null = null;
  let raf = 0;
  const loop = () => {
    paint();
    raf = requestAnimationFrame(loop);
  };
  l.add(() => cancelAnimationFrame(raf));

  const view: FrameView = {
    async setSource(s) {
      cancelAnimationFrame(raf);
      video?.remove();
      video = null;
      if (typeof s === "string") {
        const img = new Image();
        img.src = s;
        await img.decode();
        src = img;
      } else src = s;
      if (src instanceof HTMLVideoElement) {
        // the video sits under the canvas; the canvas draws only the marks
        video = src;
        video.classList.add("hb-camtile-video");
        fig.classList.toggle("is-mirror", mirror);
        fig.prepend(video);
        raf = requestAnimationFrame(loop);
      }
      show(none, !src);
      const sz = size();
      if (sz.w && sz.h) fig.style.setProperty("--hb-camtile-ar", `${sz.w} / ${sz.h}`);
      paint();
    },
    setResults(r) {
      results = r;
      const t = frameTag(r);
      show(tag, !!t);
      tag.textContent = t;
      show(cap, !!r.caption);
      cap.textContent = r.caption ?? "";
      paint();
    },
    setMirror(on) {
      mirror = on;
      fig.classList.toggle("is-mirror", on && !!video);
      paint();
    },
    paint,
    dispose: () => l.off(),
  };
  return view;
}

export interface CameraFeed extends Mounted {
  start(): Promise<void>;
  stop(): void;
  readonly video: HTMLVideoElement;
  readonly live: boolean;
  subscribe(fn: (s: { live: boolean; error: string }) => void): () => void;
}

export interface CameraFeedOptions {
  /** Called with the video this many times a second while live. Default 4. */
  fps?: number;
  onFrame?: (video: HTMLVideoElement) => void | Promise<void>;
  facingMode?: "user" | "environment";
  /** Draw the video in a tile of its own; off when a FrameView shows it. */
  tile?: boolean;
}

export function mountCameraFeed(host: HTMLElement, o: CameraFeedOptions = {}): CameraFeed {
  const video = document.createElement("video");
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  const tile = o.tile ?? true;
  if (tile) {
    host.innerHTML = `<figure class="hb-camtile is-mirror" aria-label="camera"><div class="hb-camtile-none" role="status">camera off</div></figure>`;
    video.className = "hb-camtile-video";
    host.querySelector("figure")!.prepend(video);
  }
  const none = host.querySelector<HTMLElement>(".hb-camtile-none");
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let error = "";
  let working = false;
  const subs = new Set<(s: { live: boolean; error: string }) => void>();
  const emit = () => {
    if (none) {
      show(none, !stream);
      none.textContent = error || "camera off";
      host.querySelector("figure")?.classList.toggle("is-denied", !!error);
    }
    for (const fn of subs) fn({ live: !!stream, error });
  };
  const feed: CameraFeed = {
    video,
    get live() {
      return !!stream;
    },
    async start() {
      if (stream) return;
      error = "";
      try {
        stream = await openCamera({ facingMode: o.facingMode ?? "user", width: { ideal: 640 }, height: { ideal: 480 } });
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        timer = setInterval(() => {
          if (working || !o.onFrame || video.readyState < 2) return;
          working = true;
          void Promise.resolve(o.onFrame(video)).finally(() => (working = false));
        }, 1000 / (o.fps ?? 4));
      } catch (e) {
        error = cameraFault(e).text;
        stream = null;
      }
      emit();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
      closeCamera(stream);
      stream = null;
      video.srcObject = null;
      emit();
    },
    subscribe(fn) {
      subs.add(fn);
      fn({ live: !!stream, error });
      return () => subs.delete(fn);
    },
    dispose() {
      feed.stop();
      subs.clear();
    },
  };
  emit();
  return feed;
}

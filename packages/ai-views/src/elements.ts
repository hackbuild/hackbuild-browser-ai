/**
 * @hackbuild/ai-views/elements: the views as custom elements for a plain
 * HTML page, and the mount functions they sit on. Light DOM, drawn with
 * the page's hackbuild-ui stylesheet; each element carries `.hb-view`
 * (display contents), so a layout region of hackbuild-ui places its parts. Nothing
 * registers on import: the page calls define().
 *
 *   <model-select job="chat" variant="chip"></model-select>
 *   <chat-pane id="chat"></chat-pane> <chat-composer for="chat"></chat-composer>
 *   <transcribe-drop id="t"></transcribe-drop> <transcript-exports for="t"></transcript-exports>
 *   <mask-studio id="m"></mask-studio> <mask-tools for="m"></mask-tools>
 *   <frame-view id="f"></frame-view> <camera-feed for="f"></camera-feed>
 */

import type { ChatEngine } from "@hackbuild/chat";
import type { Env } from "@hackbuild/ai-env";
import type { ModelRecord } from "@hackbuild/models";
import { chatList, type ChatList, type ChatThread } from "./chat.js";
import type { Mounted } from "./dom.js";
import { isJob, type Job } from "./jobs.js";
import { useJobsPick, useModelPick, type JobsPick, type Loader, type ModelPick, type PickPreset } from "./pick.js";
import { mountChatList, mountChatPane, mountComposer, mountContextMeter } from "./mount-chat.js";
import { mountCameraFeed, mountFrameView, type CameraFeed, type FrameView } from "./mount-frame.js";
import { mountMaskRack, mountMaskStudio, mountMaskTools, mountMaskVerbs, type MaskModels, type MaskStudio } from "./mount-mask.js";
import { mountModelJobs, mountModelSelect } from "./mount-model.js";
import { mountTranscribeDrop, mountTranscribeQueue, mountTranscriptExports, mountTranscriptView, type TranscribeDropHandle } from "./mount-transcribe.js";
import { transcribeQueue, type TranscribeQueue, type Transcriber } from "./transcribe.js";
import { mountMemoryInspector, type MemoryInspector, type RecallLike } from "./memory.js";

export { mountModelSelect, mountModelJobs, pickSheet, gateWords, type ModelSelectOptions } from "./mount-model.js";
export { mountChatPane, mountComposer, mountChatList, mountContextMeter, turnHtml, type ChatPaneOptions, type ComposerOptions } from "./mount-chat.js";
export { mountTranscribeDrop, mountTranscriptView, mountTranscribeQueue, mountTranscriptExports, transcriptHtml, type TranscribeDropOptions, type TranscribeDropHandle, type TranscriptViewOptions } from "./mount-transcribe.js";
export { mountMaskStudio, mountMaskTools, mountMaskVerbs, mountMaskRack, type MaskStudio, type MaskModels, type MaskStudioOptions, type FoundMask, type StudioState, type StudioTool } from "./mount-mask.js";
export { mountFrameView, mountCameraFeed, type FrameView, type FrameViewOptions, type CameraFeed, type CameraFeedOptions } from "./mount-frame.js";
export { mountMemoryInspector, type MemoryInspector } from "./memory.js";

type Base = new () => HTMLElement;

/** The tag names define() registers, before any prefix. */
export const ELEMENT_NAMES = [
  "model-select",
  "model-jobs",
  "chat-pane",
  "chat-composer",
  "chat-list",
  "chat-context",
  "transcribe-drop",
  "transcript-view",
  "transcribe-queue",
  "transcript-exports",
  "mask-studio",
  "mask-tools",
  "mask-verbs",
  "mask-rack",
  "frame-view",
  "camera-feed",
  "memory-inspector",
] as const;
/** A tag name `define` registers, before any prefix. */
export type ElementName = (typeof ELEMENT_NAMES)[number];

/** The element a `for` attribute names, once it is upgraded. */
async function target<T>(el: HTMLElement, key: string): Promise<T | null> {
  const id = el.getAttribute("for");
  const t = id ? el.ownerDocument.getElementById(id) : null;
  if (!t) return null;
  if (t.localName.includes("-")) await customElements.whenDefined(t.localName);
  return ((t as unknown as Record<string, T>)[key] ?? null) as T | null;
}

function shell(B: Base) {
  return class extends B {
    protected mounted: Mounted | null = null;
    connectedCallback() {
      // .hb-view: display contents, so a layout region of hackbuild-ui places the view's parts
      this.classList.add("hb-view");
      void this.mount();
    }
    disconnectedCallback() {
      this.mounted?.dispose();
      this.mounted = null;
    }
    protected async mount(): Promise<void> {}
    protected emit(type: string, detail?: unknown) {
      this.dispatchEvent(new CustomEvent(type, { detail, bubbles: true }));
    }
  };
}

/**
 * The `<model-select>` element: set `pick`, `env`, `loader` or `records` on it before or after it
 * connects.
 */
export interface ModelSelectElement extends HTMLElement {
  pick: ModelPick;
  env: Env | undefined;
  loader: Loader | undefined;
  records: readonly ModelRecord[] | undefined;
}

function classes(B: Base): Record<ElementName, CustomElementConstructor> {
  const S = shell(B);
  class ModelSelectEl extends S {
    #pick: ModelPick | null = null;
    #env: Env | undefined;
    #loader: Loader | undefined;
    #records: readonly ModelRecord[] | undefined;
    get pick(): ModelPick {
      if (!this.#pick) {
        const job = this.getAttribute("job");
        this.#pick = useModelPick(isJob(job) ? job : "chat", { ...(this.#env ? { env: this.#env } : {}), ...(this.#loader ? { loader: this.#loader } : {}), ...(this.#records ? { records: this.#records } : {}), ...(this.getAttribute("chosen") ? { chosen: this.getAttribute("chosen")! } : {}) });
        this.watch(this.#pick);
      }
      return this.#pick;
    }
    set pick(p: ModelPick) {
      this.#pick = p;
      this.watch(p);
      if (this.isConnected) void this.remount();
    }
    #off: (() => void) | null = null;
    /** choose on a new choice; loaded and failed once per load, when a row leaves loading. */
    private watch(p: ModelPick) {
      this.#off?.();
      let chosen = p.snapshot().chosen;
      const was = new Map(p.snapshot().rows.map((r) => [r.id, r.state]));
      this.#off = p.subscribe((s) => {
        if (s.chosen !== chosen) this.emit("choose", { id: s.chosen });
        chosen = s.chosen;
        for (const r of s.rows) {
          const before = was.get(r.id);
          if (before === "loading" && r.state === "loaded") this.emit("loaded", { id: r.id, result: p.result(r.id) });
          if (before === "loading" && r.state === "error") this.emit("failed", { id: r.id, error: p.error(r.id) });
          was.set(r.id, r.state);
        }
      });
    }
    get env() {
      return this.#env;
    }
    set env(v) {
      this.#env = v;
      this.#pick?.update({ env: v });
    }
    get loader() {
      return this.#loader;
    }
    set loader(v) {
      this.#loader = v;
      if (v) this.#pick?.update({ loader: v });
    }
    get records() {
      return this.#records;
    }
    set records(v) {
      this.#records = v;
      if (v) this.#pick?.update({ records: v });
    }
    private async remount() {
      this.mounted?.dispose();
      await this.mount();
    }
    protected override async mount() {
      this.mounted = mountModelSelect(this, this.pick, { variant: this.getAttribute("variant") === "chip" ? "chip" : "line", go: this.getAttribute("go") !== "false" });
    }
  }
  class ModelJobsEl extends S {
    #jobs: JobsPick | null = null;
    #opts: { env?: Env; loader?: Loader; records?: readonly ModelRecord[]; presets: readonly PickPreset[] } = { presets: [] };
    /** One pick per job in the jobs attribute, built on first use with the properties set so far. */
    get jobs(): JobsPick {
      if (!this.#jobs) {
        const names = (this.getAttribute("jobs") ?? "chat").split(",").map((s) => s.trim()).filter(isJob) as Job[];
        const required = new Set((this.getAttribute("required") ?? "").split(",").map((s) => s.trim()));
        const { presets, ...shared } = this.#opts;
        this.#jobs = useJobsPick(names.map((job) => ({ job, required: required.has(job) })), presets, shared);
      }
      return this.#jobs;
    }
    set env(v: Env) {
      this.#opts.env = v;
      this.#jobs?.update({ env: v });
    }
    set loader(v: Loader) {
      this.#opts.loader = v;
      this.#jobs?.update({ loader: v });
    }
    set records(v: readonly ModelRecord[]) {
      this.#opts.records = v;
      this.#jobs?.update({ records: v });
    }
    set presets(v: readonly PickPreset[]) {
      this.#opts.presets = v;
      this.#jobs?.setPresets(v);
    }
    protected override async mount() {
      this.mounted = mountModelJobs(this, this.jobs, { go: this.getAttribute("go") !== "false" });
    }
  }
  class ChatPaneEl extends S {
    #thread: ChatThread | null = null;
    #list: ChatList | null = null;
    /** The chats this pane shows, the open one in the pane; a chat-list element switches between them. */
    get list(): ChatList {
      return (this.#list ??= chatList());
    }
    set list(l: ChatList) {
      this.#list = l;
      this.thread = l.thread;
    }
    get thread(): ChatThread {
      return (this.#thread ??= this.list.thread);
    }
    set thread(t: ChatThread) {
      this.#thread = t;
      if (this.isConnected) {
        this.mounted?.dispose();
        void this.mount();
      }
    }
    set engine(e: ChatEngine | null) {
      if (this.#list) this.#list.setEngine(e);
      else this.thread.setEngine(e);
    }
    protected override async mount() {
      const name = this.getAttribute("name");
      const en = this.getAttribute("empty-name");
      const note = this.getAttribute("empty-note");
      this.mounted = mountChatPane(this, this.thread, { ...(name ? { name } : {}), ...(en ? { emptyName: en } : {}), ...(note ? { emptyNote: note } : {}) });
    }
  }
  class ChatListEl extends S {
    protected override async mount() {
      const l = await target<ChatList>(this, "list");
      if (l) this.mounted = mountChatList(this, l, this.getAttribute("label") ? { label: this.getAttribute("label")! } : {});
    }
  }
  class ChatContextEl extends S {
    protected override async mount() {
      const t = await target<ChatThread>(this, "thread");
      const budget = () => Number(this.getAttribute("budget") ?? 4096);
      if (t) this.mounted = mountContextMeter(this, t, { budget, system: () => (this as unknown as { system?: string }).system ?? "" });
    }
  }
  class ComposerEl extends S {
    protected override async mount() {
      const t = await target<ChatThread>(this, "thread");
      const ph = this.getAttribute("placeholder");
      if (t) this.mounted = mountComposer(this, t, ph ? { placeholder: ph } : {});
    }
  }
  const stub: Transcriber = async () => {
    throw new Error("no speech model loaded. pick one and load it.");
  };
  class TranscribeDropEl extends S {
    #queue: TranscribeQueue | null = null;
    get queue(): TranscribeQueue {
      return (this.#queue ??= transcribeQueue({ run: stub }));
    }
    set transcriber(t: Transcriber) {
      this.queue.setTranscriber(t);
    }
    pick() {
      (this.mounted as TranscribeDropHandle | null)?.pick();
    }
    protected override async mount() {
      const sample = this.getAttribute("sample-label");
      const title = this.getAttribute("title-text");
      this.mounted = mountTranscribeDrop(this, this.queue, {
        ...(this.getAttribute("accept") ? { accept: this.getAttribute("accept")! } : {}),
        ...(title ? { title } : {}),
        ...(sample ? { sampleLabel: sample, onSample: () => this.emit("sample") } : {}),
      });
    }
  }
  const forQueue = (mount: (host: HTMLElement, q: TranscribeQueue) => Mounted) =>
    class extends S {
      protected override async mount() {
        const q = await target<TranscribeQueue>(this, "queue");
        if (q) this.mounted = mount(this, q);
      }
    };
  class MaskStudioEl extends S {
    #studio: MaskStudio | null = null;
    #models: MaskModels = {};
    get studio(): MaskStudio {
      if (!this.#studio) {
        const sample = this.getAttribute("sample-label");
        this.#studio = mountMaskStudio(this, { models: this.#models, ...(sample ? { sampleLabel: sample, onSample: () => this.emit("sample") } : {}) });
      }
      return this.#studio;
    }
    set models(m: MaskModels) {
      this.#models = m;
      this.#studio?.setModels(m);
    }
    protected override async mount() {
      this.mounted = this.studio;
    }
    override disconnectedCallback() {
      super.disconnectedCallback();
      this.#studio = null;
    }
  }
  const forStudio = (mount: (host: HTMLElement, s: MaskStudio, el: HTMLElement) => Mounted) =>
    class extends S {
      protected override async mount() {
        const s = await target<MaskStudio>(this, "studio");
        if (s) this.mounted = mount(this, s, this);
      }
    };
  class FrameViewEl extends S {
    #view: FrameView | null = null;
    get view(): FrameView {
      return (this.#view ??= mountFrameView(this, { mirror: this.hasAttribute("mirror"), ...(this.getAttribute("empty") ? { empty: this.getAttribute("empty")! } : {}) }));
    }
    protected override async mount() {
      this.mounted = this.view;
    }
    override disconnectedCallback() {
      super.disconnectedCallback();
      this.#view = null;
    }
  }
  class CameraFeedEl extends S {
    #feed: CameraFeed | null = null;
    get feed(): CameraFeed {
      return (this.#feed ??= mountCameraFeed(this, { fps: Number(this.getAttribute("fps") ?? 4), tile: !this.hasAttribute("for"), onFrame: (v) => this.emit("frame", { video: v }) }));
    }
    protected override async mount() {
      const feed = this.feed;
      this.mounted = feed;
      // with for, the camera shows in that frame view
      const view = await target<FrameView>(this, "view");
      if (view) feed.subscribe((s) => void view.setSource(s.live ? feed.video : null).catch(() => undefined));
    }
    override disconnectedCallback() {
      super.disconnectedCallback();
      this.#feed = null;
    }
  }
  class MemoryInspectorEl extends S {
    #recall: RecallLike | null = null;
    set recall(r: RecallLike | null) {
      this.#recall = r;
      (this.mounted as MemoryInspector | null)?.set(r);
    }
    protected override async mount() {
      this.mounted = mountMemoryInspector(this, this.#recall);
    }
  }
  return {
    "model-select": ModelSelectEl,
    "model-jobs": ModelJobsEl,
    "chat-pane": ChatPaneEl,
    "chat-composer": ComposerEl,
    "chat-list": ChatListEl,
    "chat-context": ChatContextEl,
    "transcribe-drop": TranscribeDropEl,
    "transcript-view": forQueue((h, q) => mountTranscriptView(h, q)),
    "transcribe-queue": forQueue(mountTranscribeQueue),
    "transcript-exports": forQueue((h, q) => mountTranscriptExports(h, q, { go: h.hasAttribute("go") })),
    "mask-studio": MaskStudioEl,
    "mask-tools": forStudio(mountMaskTools),
    "mask-verbs": forStudio(mountMaskVerbs),
    "mask-rack": forStudio((h, s, el) => mountMaskRack(h, s, (el.getAttribute("part") as "found" | "mask" | "saved" | "export") ?? "found")),
    "frame-view": FrameViewEl,
    "camera-feed": CameraFeedEl,
    "memory-inspector": MemoryInspectorEl,
  };
}

/** The part of a custom element registry `define` uses; `customElements` satisfies it. */
export interface DefineTarget {
  get(name: string): unknown;
  define(name: string, ctor: CustomElementConstructor): void;
}

/**
 * Register the elements, bare (`<model-select>`) or under a prefix
 * (`define("hb")` gives `<hb-model-select>`). Names already defined are
 * left alone. Returns the tag names.
 */
export function define(prefix = "", registry?: DefineTarget, Base?: Base): string[] {
  const reg = registry ?? (globalThis as { customElements?: DefineTarget }).customElements;
  const B = Base ?? (globalThis as { HTMLElement?: Base }).HTMLElement;
  if (!reg || !B) throw new Error("no custom elements in this environment");
  const make = classes(B);
  return ELEMENT_NAMES.map((n) => {
    const tag = prefix ? `${prefix}-${n}` : n;
    if (!reg.get(tag)) reg.define(tag, make[n]);
    return tag;
  });
}

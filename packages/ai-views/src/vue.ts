/**
 * @hackbuild/ai-views/vue: the views as Vue 3 components. Each one mounts
 * the same function the custom element does on a host that shows as
 * `.hb-view` (display contents), so the look is one code path; props in, events out.
 * Vue is an optional peer: only this entry imports it.
 */

import { defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch, type PropType } from "vue";
import type { Env } from "@hackbuild/ai-env";
import type { Mounted } from "./dom.js";
import type { ChatList as ChatListState, ChatThread } from "./chat.js";
import type { Job } from "./jobs.js";
import { useModelPick, type JobsPick, type Loader, type ModelPick } from "./pick.js";
import type { TranscribeQueue as Queue } from "./transcribe.js";
import type { FrameResults } from "./frame.js";
import { mountModelJobs, mountModelSelect } from "./mount-model.js";
import { mountChatList, mountChatPane, mountComposer, mountContextMeter } from "./mount-chat.js";
import { mountTranscribeDrop, mountTranscribeQueue, mountTranscriptExports, mountTranscriptView } from "./mount-transcribe.js";
import { mountMaskRack, mountMaskStudio, mountMaskTools, mountMaskVerbs, type MaskModels, type MaskStudio as Studio } from "./mount-mask.js";
import { mountMemoryInspector, type RecallLike } from "./memory.js";
import { mountCameraFeed, mountFrameView, type CameraFeed as Feed, type FrameView as View } from "./mount-frame.js";

// .hb-view of hackbuild-ui: display contents, so the parts sit in the layout region
const contents = { class: "hb-view" };

/** A component whose host runs `mount` once it is in the document, and again when `deps` change. */
type Emit = (e: any, ...a: unknown[]) => void;
function hosted<P>(setupMount: (host: HTMLElement, props: P, emit: Emit) => Mounted, deps: (props: P) => unknown[] = () => []) {
  return (props: P, { emit }: { emit: Emit }) => {
    const el = ref<HTMLElement | null>(null);
    let m: Mounted | null = null;
    const run = () => {
      m?.dispose();
      if (el.value) m = setupMount(el.value, props, emit);
    };
    onMounted(run);
    watch(() => deps(props), run);
    onBeforeUnmount(() => m?.dispose());
    return () => h("div", { ...contents, ref: el });
  };
}

export const ModelSelect = defineComponent({
  name: "ModelSelect",
  props: {
    job: { type: String as PropType<Job>, default: "chat" },
    pick: { type: Object as PropType<ModelPick>, default: undefined },
    variant: { type: String as PropType<"line" | "chip">, default: "line" },
    go: { type: Boolean, default: true },
    env: { type: Object as PropType<Env>, default: undefined },
    loader: { type: Function as PropType<Loader>, default: undefined },
  },
  emits: ["choose", "pick", "loaded", "failed"],
  setup: hosted<{ job: Job; pick?: ModelPick | undefined; variant: "line" | "chip"; go: boolean; env?: Env | undefined; loader?: Loader | undefined }>(
    (host, p, emit) => {
      const pick = p.pick ?? useModelPick(p.job, { ...(p.env ? { env: p.env } : {}), ...(p.loader ? { loader: p.loader } : {}) });
      emit("pick", pick);
      const was = new Map(pick.snapshot().rows.map((r) => [r.id, r.state]));
      const off = pick.subscribe((s) => {
        emit("choose", s.chosen);
        for (const r of s.rows) {
          if (was.get(r.id) === "loading" && r.state === "loaded") emit("loaded", r.id, pick.result(r.id));
          if (was.get(r.id) === "loading" && r.state === "error") emit("failed", r.id, pick.error(r.id));
          was.set(r.id, r.state);
        }
      });
      const m = mountModelSelect(host, pick, { variant: p.variant, go: p.go });
      return { dispose: () => (off(), m.dispose()) };
    },
    (p) => [p.job, p.pick, p.variant, p.go],
  ),
});

export const ChatPane = defineComponent({
  name: "ChatPane",
  props: {
    thread: { type: Object as PropType<ChatThread>, required: true },
    name: { type: String, default: "reply" },
    emptyName: { type: String, default: "what are we working on?" },
    emptyNote: { type: String, default: "" },
  },
  setup: hosted<{ thread: ChatThread; name: string; emptyName: string; emptyNote: string }>(
    (host, p) => mountChatPane(host, p.thread, { name: p.name, emptyName: p.emptyName, emptyNote: p.emptyNote }),
    (p) => [p.thread],
  ),
});

export const Composer = defineComponent({
  name: "Composer",
  props: { thread: { type: Object as PropType<ChatThread>, required: true }, placeholder: { type: String, default: "say something" } },
  setup: hosted<{ thread: ChatThread; placeholder: string }>((host, p) => mountComposer(host, p.thread, { placeholder: p.placeholder }), (p) => [p.thread]),
});

export const TranscribeDrop = defineComponent({
  name: "TranscribeDrop",
  props: {
    queue: { type: Object as PropType<Queue>, required: true },
    accept: { type: String, default: "audio/*,video/*" },
    sampleLabel: { type: String, default: "" },
  },
  emits: ["sample"],
  setup: hosted<{ queue: Queue; accept: string; sampleLabel: string }>(
    (host, p, emit) => mountTranscribeDrop(host, p.queue, { accept: p.accept, ...(p.sampleLabel ? { sampleLabel: p.sampleLabel, onSample: () => emit("sample") } : {}) }),
    (p) => [p.queue],
  ),
});

export const TranscriptView = defineComponent({
  name: "TranscriptView",
  props: { queue: { type: Object as PropType<Queue>, required: true }, exports: { type: Boolean, default: false } },
  setup: hosted<{ queue: Queue; exports: boolean }>((host, p) => (p.exports ? mountTranscriptExports(host, p.queue) : mountTranscriptView(host, p.queue)), (p) => [p.queue, p.exports]),
});

export const MaskStudio = defineComponent({
  name: "MaskStudio",
  props: { models: { type: Object as PropType<MaskModels>, default: () => ({}) }, sampleLabel: { type: String, default: "" } },
  emits: ["studio", "sample"],
  setup(props, { emit }) {
    const el = ref<HTMLElement | null>(null);
    const studio = shallowRef<Studio | null>(null);
    onMounted(() => {
      studio.value = mountMaskStudio(el.value!, { models: props.models, ...(props.sampleLabel ? { sampleLabel: props.sampleLabel, onSample: () => emit("sample") } : {}) });
      emit("studio", studio.value);
    });
    watch(
      () => props.models,
      (m) => studio.value?.setModels(m),
    );
    onBeforeUnmount(() => {
      studio.value?.dispose();
    });
    // a page places the rail and verbs with MaskTools on the studio the studio event hands it
    return () => h("div", { ...contents, ref: el });
  },
});

export const MaskTools = defineComponent({
  name: "MaskTools",
  props: { studio: { type: Object as PropType<Studio>, required: true } },
  setup: hosted<{ studio: Studio }>((host, p) => mountMaskTools(host, p.studio), (p) => [p.studio]),
});

export const MaskVerbs = defineComponent({
  name: "MaskVerbs",
  props: { studio: { type: Object as PropType<Studio>, required: true } },
  setup: hosted<{ studio: Studio }>((host, p) => mountMaskVerbs(host, p.studio), (p) => [p.studio]),
});

export const MaskRack = defineComponent({
  name: "MaskRack",
  props: {
    studio: { type: Object as PropType<Studio>, required: true },
    part: { type: String as PropType<"found" | "mask" | "saved" | "export">, default: "found" },
    name: { type: String, default: "mask" },
  },
  setup: hosted<{ studio: Studio; part: "found" | "mask" | "saved" | "export"; name: string }>((host, p) => mountMaskRack(host, p.studio, p.part, { name: p.name }), (p) => [p.studio, p.part]),
});

export const ModelJobs = defineComponent({
  name: "ModelJobs",
  props: {
    jobs: { type: Object as PropType<JobsPick>, required: true },
    go: { type: Boolean, default: true },
  },
  setup: hosted<{ jobs: JobsPick; go: boolean }>((host, p) => mountModelJobs(host, p.jobs, { go: p.go }), (p) => [p.jobs, p.go]),
});

export const TranscribeQueue = defineComponent({
  name: "TranscribeQueue",
  props: { queue: { type: Object as PropType<Queue>, required: true } },
  setup: hosted<{ queue: Queue }>((host, p) => mountTranscribeQueue(host, p.queue), (p) => [p.queue]),
});

export const MemoryInspector = defineComponent({
  name: "MemoryInspector",
  props: { recall: { type: Object as PropType<RecallLike | null>, default: null } },
  setup(props) {
    const el = ref<HTMLElement | null>(null);
    let m: ReturnType<typeof mountMemoryInspector> | null = null;
    onMounted(() => (m = mountMemoryInspector(el.value!, props.recall)));
    watch(
      () => props.recall,
      (r) => m?.set(r),
    );
    onBeforeUnmount(() => m?.dispose());
    return () => h("div", { ...contents, ref: el });
  },
});

export const ChatList = defineComponent({
  name: "ChatList",
  props: { list: { type: Object as PropType<ChatListState>, required: true }, label: { type: String, default: "chats" } },
  setup: hosted<{ list: ChatListState; label: string }>((host, p) => mountChatList(host, p.list, { label: p.label }), (p) => [p.list]),
});

export const ContextMeter = defineComponent({
  name: "ContextMeter",
  props: { thread: { type: Object as PropType<ChatThread>, required: true }, budget: { type: Number, default: 4096 }, system: { type: String, default: "" } },
  setup: hosted<{ thread: ChatThread; budget: number; system: string }>((host, p) => mountContextMeter(host, p.thread, { budget: () => p.budget, system: () => p.system }), (p) => [p.thread]),
});

export const FrameView = defineComponent({
  name: "FrameView",
  props: {
    source: { type: [String, Object] as PropType<string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>, default: null },
    results: { type: Object as PropType<FrameResults>, default: () => ({}) },
    mirror: { type: Boolean, default: false },
  },
  emits: ["view"],
  setup(props, { emit }) {
    const el = ref<HTMLElement | null>(null);
    let view: View | null = null;
    onMounted(() => {
      view = mountFrameView(el.value!, { mirror: props.mirror });
      emit("view", view);
      if (props.source) void view.setSource(props.source).then(() => view?.setResults(props.results));
      else view.setResults(props.results);
    });
    watch(
      () => props.source,
      (s) => void view?.setSource(s ?? null),
    );
    watch(
      () => props.results,
      (r) => view?.setResults(r),
    );
    watch(
      () => props.mirror,
      (m) => view?.setMirror(m),
    );
    onBeforeUnmount(() => view?.dispose());
    return () => h("div", { ...contents, ref: el });
  },
});

export const CameraFeed = defineComponent({
  name: "CameraFeed",
  props: { fps: { type: Number, default: 4 } },
  emits: ["feed", "frame"],
  setup: hosted<{ fps: number }>(
    (host, p, emit) => {
      const feed: Feed = mountCameraFeed(host, { fps: p.fps, onFrame: (v) => emit("frame", v) });
      emit("feed", feed);
      return feed;
    },
    (p) => [p.fps],
  ),
});

# vue

## Variables

### CameraFeed

```ts
const CameraFeed: DefineComponent<{
  fps: number;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("feed" | "frame")[], "feed" | "frame", PublicProps, ToResolvedProps<{
  fps: number;
}, ("feed" | "frame")[]>, {
  fps: number;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component that opens the camera; emits `feed` with the feed and `frame` with the video at `fps`.

***

### ChatList

```ts
const ChatList: DefineComponent<{
  label: string;
  list: ChatList;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  label: string;
  list: ChatList;
}, {
}>, {
  label: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the chat list rail of a `chatList`.

***

### ChatPane

```ts
const ChatPane: DefineComponent<{
  emptyName: string;
  emptyNote: string;
  name: string;
  thread: ChatThread;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  emptyName: string;
  emptyNote: string;
  name: string;
  thread: ChatThread;
}, {
}>, {
  emptyName: string;
  emptyNote: string;
  name: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the turns of a chat thread.

***

### Composer

```ts
const Composer: DefineComponent<{
  placeholder: string;
  thread: ChatThread;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  placeholder: string;
  thread: ChatThread;
}, {
}>, {
  placeholder: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the message box of a chat thread.

***

### ContextMeter

```ts
const ContextMeter: DefineComponent<{
  budget: number;
  system: string;
  thread: ChatThread;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  budget: number;
  system: string;
  thread: ChatThread;
}, {
}>, {
  budget: number;
  system: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component that shows what the next request carries against the context budget.

***

### ExportMenu

```ts
const ExportMenu: DefineComponent<{
  go: boolean;
  queue: TranscribeQueue;
  tool: string;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  go: boolean;
  queue: TranscribeQueue;
  tool: string;
}, {
}>, {
  go: boolean;
  tool: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the export menu of a transcribe queue: four formats, copy, all as zip, undo and redo.

***

### FrameView

```ts
const FrameView: DefineComponent<ExtractPropTypes<{
  mirror: {
     default: boolean;
     type: BooleanConstructor;
  };
  results: {
     default: () => object;
     type: PropType<FrameResults>;
  };
  source: {
     default: null;
     type: PropType<string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, "view"[], "view", PublicProps, ToResolvedProps<ExtractPropTypes<{
  mirror: {
     default: boolean;
     type: BooleanConstructor;
  };
  results: {
     default: () => object;
     type: PropType<FrameResults>;
  };
  source: {
     default: null;
     type: PropType<string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null>;
  };
}>, "view"[]>, {
  mirror: boolean;
  results: FrameResults;
  source: string | HTMLImageElement | HTMLVideoElement | HTMLCanvasElement | null;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component that draws a frame with boxes, landmarks and a caption; emits `view` with the
mounted view.

***

### MaskRack

```ts
const MaskRack: DefineComponent<{
  name: string;
  part: "found" | "mask" | "saved" | "export";
  studio: MaskStudio;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  name: string;
  part: "found" | "mask" | "saved" | "export";
  studio: MaskStudio;
}, {
}>, {
  name: string;
  part: "found" | "mask" | "saved" | "export";
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for one rack part of a mask studio: found, mask, saved or export.

***

### MaskStudio

```ts
const MaskStudio: DefineComponent<ExtractPropTypes<{
  models: {
     default: () => object;
     type: PropType<MaskModels>;
  };
  sampleLabel: {
     default: string;
     type: StringConstructor;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("sample" | "studio")[], "sample" | "studio", PublicProps, ToResolvedProps<ExtractPropTypes<{
  models: {
     default: () => object;
     type: PropType<MaskModels>;
  };
  sampleLabel: {
     default: string;
     type: StringConstructor;
  };
}>, ("sample" | "studio")[]>, {
  models: MaskModels;
  sampleLabel: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a mask studio; emits `studio` with the mounted studio and `sample` when the
sample button is pressed.

***

### MaskTools

```ts
const MaskTools: DefineComponent<{
  studio: MaskStudio;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  studio: MaskStudio;
}, {
}>, {
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the tool rail of a mask studio.

***

### MaskVerbs

```ts
const MaskVerbs: DefineComponent<{
  studio: MaskStudio;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  studio: MaskStudio;
}, {
}>, {
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the undo, redo and zoom row of a mask studio.

***

### MemoryInspector

```ts
const MemoryInspector: DefineComponent<ExtractPropTypes<{
  recall: {
     default: null;
     type: PropType<RecallLike | null>;
  };
}>, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<ExtractPropTypes<{
  recall: {
     default: null;
     type: PropType<RecallLike | null>;
  };
}>, {
}>, {
  recall: RecallLike | null;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component that shows a recall trace as a table.

***

### MemoryPane

```ts
const MemoryPane: DefineComponent<{
  memory: MemoryLike;
  name: string;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("change" | "pane")[], "change" | "pane", PublicProps, ToResolvedProps<{
  memory: MemoryLike;
  name: string;
}, ("change" | "pane")[]>, {
  name: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a memory pane over a store; emits `pane` with the handle (refresh, used).

***

### ModelJobs

```ts
const ModelJobs: DefineComponent<{
  go: boolean;
  jobs: JobsPick;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  go: boolean;
  jobs: JobsPick;
}, {
}>, {
  go: boolean;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a jobs rack: a line per job, presets and load all.

***

### ModelSelect

```ts
const ModelSelect: DefineComponent<{
  env?: Env;
  go: boolean;
  job: Job;
  loader?: Loader;
  pick?: ModelPick;
  variant: "line" | "chip";
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("choose" | "pick" | "loaded" | "failed")[], "choose" | "pick" | "loaded" | "failed", PublicProps, ToResolvedProps<{
  env?: Env;
  go: boolean;
  job: Job;
  loader?: Loader;
  pick?: ModelPick;
  variant: "line" | "chip";
}, ("choose" | "pick" | "loaded" | "failed")[]>, {
  env: Env;
  go: boolean;
  job: Job;
  loader: Loader;
  pick: ModelPick;
  variant: "line" | "chip";
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a model picker of one job; emits `pick`, `choose`, `loaded` and `failed`.

***

### PersonaRack

```ts
const PersonaRack: DefineComponent<{
  rack: PersonaRack;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  rack: PersonaRack;
}, {
}>, {
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a persona rack.

***

### SessionMenu

```ts
const SessionMenu: DefineComponent<{
  list: ChatList;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, "import"[], "import", PublicProps, ToResolvedProps<{
  list: ChatList;
}, "import"[]>, {
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the session menu of a chat list; emits `import` with the number of chats.

***

### SourcesDrop

```ts
const SourcesDrop: DefineComponent<{
  accept: string;
  ingest: (files, o) => Promise<{
     chunks: number;
     files: number;
  }>;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  accept: string;
  ingest: (files, o) => Promise<{
     chunks: number;
     files: number;
  }>;
}, {
}>, {
  accept: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a sources drop: files and folders into memory through `ingest`.

***

### TranscribeDrop

```ts
const TranscribeDrop: DefineComponent<{
  accept: string;
  folders: boolean;
  note: string;
  queue: TranscribeQueue;
  sampleLabel: string;
  showDropped: boolean;
  title: string;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, ("drop" | "sample")[], "drop" | "sample", PublicProps, ToResolvedProps<{
  accept: string;
  folders: boolean;
  note: string;
  queue: TranscribeQueue;
  sampleLabel: string;
  showDropped: boolean;
  title: string;
}, ("drop" | "sample")[]>, {
  accept: string;
  folders: boolean;
  note: string;
  sampleLabel: string;
  showDropped: boolean;
  title: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the drop zone that becomes the transcript; emits `sample` and `drop` (the handle, whose `pick` opens the file picker).

***

### TranscribeQueue

```ts
const TranscribeQueue: DefineComponent<{
  queue: TranscribeQueue;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  queue: TranscribeQueue;
}, {
}>, {
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the file list of a transcribe queue.

***

### TranscriptView

```ts
const TranscriptView: DefineComponent<{
  exports: boolean;
  queue: TranscribeQueue;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  exports: boolean;
  queue: TranscribeQueue;
}, {
}>, {
  exports: boolean;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for the selected transcript, or its export buttons when `exports` is set.

***

### VoiceRow

```ts
const VoiceRow: DefineComponent<{
  row: VoiceRow;
  test: string;
}, () => VNode<RendererNode, RendererElement, {
[key: string]: any;
}>, {
}, {
}, {
}, ComponentOptionsMixin, ComponentOptionsMixin, {
}, string, PublicProps, ToResolvedProps<{
  row: VoiceRow;
  test: string;
}, {
}>, {
  test: string;
}, {
}, {
}, {
}, string, ComponentProvideOptions, true, {
}, any>;
```

Vue component for a voice row.

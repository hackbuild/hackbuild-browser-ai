# @hackbuild/ai-views

Views that bind the browser AI packages to the hack.build design system
(hackbuild-ui): a model picker per job, a chat pane and composer, a drop
first transcriber, a mask studio, a frame view and a camera feed. Each
ships as a Vue component and as a custom element, so a plain HTML page
can use it. The views draw in light DOM with the page's hackbuild-ui
stylesheet and never style locally. Code MIT; this README CC-BY-4.0 with
the code samples also MIT. It replaces @hackbuild/ai-elements.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/ai-views

## Use

    import { define } from "@hackbuild/ai-views/elements";
    define();                                    // define("hb") gives <hb-model-select> and so on

    <model-select job="chat" variant="chip"></model-select>
    <chat-pane id="chat"></chat-pane>
    <chat-composer for="chat"></chat-composer>

    document.querySelector("chat-pane").engine = engine;   // a @hackbuild/chat engine

In Vue:

    import { ModelSelect, ChatPane, Composer } from "@hackbuild/ai-views/vue";
    import { chatThread } from "@hackbuild/ai-views";
    const thread = chatThread({ engine });
    // <ModelSelect job="chat" variant="chip" /> <ChatPane :thread="thread" /> <Composer :thread="thread" />

## Entries

- `@hackbuild/ai-views`: node safe. `JOBS`, `jobRecords(job)`, `rowOf`
  (a record as a hackbuild-ui ModelRow), `useModelPick(job)`,
  `useJobsPick(jobs, presets)`, `weightsLoader(store)`, `chatThread`,
  `transcribeQueue`, the frame geometry and `traceRows`.
- `@hackbuild/ai-views/elements`: the mount functions and `define()`.
- `@hackbuild/ai-views/vue`: `ModelSelect`, `ChatPane`, `Composer`,
  `TranscribeDrop`, `TranscriptView`, `MaskStudio`, `MaskTools`,
  `FrameView`, `CameraFeed`. Vue is an optional peer.

## Views

| view | element | after | what it does |
|---|---|---|---|
| ModelSelect | `<model-select job variant go>` | ferrule, arbor, hackle | one line with the choice and one pink "load, size"; the bar chip; a sheet with search, the fits, uncensored and no download filters, groups, the row detail and the "your own" forms. `<model-jobs jobs>` gives a line per job, presets with totals and "load all" |
| ChatPane, Composer | `<chat-pane>`, `<chat-composer for>` | clevis, chatbot-forge | the thread, reasoning in a fold, memory used per reply, copy and redo on the last reply; Enter sends, Escape stops |
| TranscribeDrop, TranscriptView | `<transcribe-drop>`, `<transcript-view for>`, `<transcribe-queue for>`, `<transcript-exports for>` | scribe | the drop zone becomes the transcript; a queue of files; lines with their time, edit in place with undo; txt, srt, vtt, json |
| MaskStudio | `<mask-studio>`, `<mask-tools for>`, `<mask-verbs for>`, `<mask-rack for part>` | an earlier mask studio and a fastsam selector | click segment, wand, brush, lasso, segment everything, undo, zoom, mask, matte and cutout png |
| FrameView, CameraFeed | `<frame-view>`, `<camera-feed for>` | the eyes of an earlier room | boxes with word and score, landmarks, a count and the caption over a frame; the camera at a set rate |
| memory inspector | `<memory-inspector>` | ai-elements | one row per fused recall candidate, the used ones marked |

Jobs and their records: chat (40 records, computed), speech to text (6),
vision language (SmolVLM 256M and 500M, SmolVLM2 256M video, LFM2-VL
450M, Gemma 4 E2B), detector (EfficientDet lite0, YOLOv10 n, s and m),
masks (SlimSAM, FastSAM-s), image (SD-Turbo, SD 1.5, SDXL-Turbo), voice
(Kokoro, Pocket TTS, the vocal tract, the system voice), depth, embed,
landmarks and face swap (scrfd, ArcFace, inswapper). Every record carries
its weight licence; the non commercial ones are marked in the picker.

## What is verified, and what is not

- Verified (2026-11-25, `npx vitest run packages/ai-views`): every job
  has the records above with a speed word and a verdict; rows carry size,
  memory, backend, marks, detail and options, and a row that does not fit
  names why; a pick loads with progress, cancels and keeps a failure's
  words; presets total their download; the chat thread streams with the
  reasoning apart and memory used; the queue runs, edits with undo and
  exports; the frame mapping crops and mirrors; define registers every
  element.
- Verified headless (2026-11-25, `node tools/smoke-views.mjs`): one smoke
  per demo page on stub providers with no weights.
- Not verified: a real model through any view in this package (the
  demos use stubs); touch drawing on a phone; screen readers.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 10,633 bytes | 11,164 bytes |
| `dist/single/elements.iife.js` (single file build) | 77,473 bytes | 81,346 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

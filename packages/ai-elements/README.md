# @hackbuild/ai-elements

Web components for pages that run models in a tab: a model picker, a
download bar, status pills, a chat panel and a memory inspector. No
framework, shadow DOM, theming through CSS custom properties, icons as
inline SVG. Nothing registers on import; the page calls `define()`. Code
MIT; this README CC-BY-4.0 with the code samples also MIT.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/ai-elements

## Use

    import { define } from "@hackbuild/ai-elements";
    define();            // hb-model-picker, hb-download-bar, hb-status-pills, hb-chat-panel, hb-memory-inspector
    // define("my") gives my-model-picker and so on

    const picker = document.querySelector("hb-model-picker");
    picker.env = await probe();                         // @hackbuild/ai-env
    picker.records = hub.registry.list();               // each shows size with its source word and the weight licence
    picker.addEventListener("hb-pick", (e) => load(e.detail.id));

    bar.progress = p;                                   // @hackbuild/weights Progress; null total shows an indeterminate bar
    bar.addEventListener("hb-cancel", ...); bar.addEventListener("hb-resume", ...);

    pills.update(status);                               // speak EngineStatus, hub status, or { id, kind, text }

    chat.engine = engine;                               // @hackbuild/chat ChatEngine; or chat.streamText(asyncIterable)
    chat.keyField = true;                               // the key stays in this element; shown as its first and last 4 characters
    chat.addEventListener("hb-reply", (e) => speaker.say(e.detail.text));

    inspector.recall = await mem.recall(query);         // @hackbuild/memory Recall: one row per fused candidate

## Elements

- Model picker: a record whose ladder has no rung this env can run is
  disabled with the reason, for example "no webgpu adapter. this model
  needs it." Rows show size (with measured, vendor, inferred or unknown),
  devices, the first rung this device would try, and the weight licence
  with commercial use.
- Download bar: percent and MB when the total is known, MB counted with
  an indeterminate bar when it is not, a resuming state, cancel and resume
  events, and a failed state that names the error. The moving bar stops
  under reduced motion.
- Status pills: loading, ready, busy, failed (including a watchdog trip)
  and patch missed, each with a coloured dot.
- Chat panel: streams text, keeps think text in a collapsed block, a stop
  button while a reply streams, notes for stop, token limit and failure,
  Enter sends and Shift Enter adds a line.
- Memory inspector: the recall query, mode, and per candidate kind, text,
  BM25 rank and score, cosine rank and value, RRF and final score, with
  the rows handed to the model marked.
- Theme: `--hb-bg`, `--hb-fg`, `--hb-muted`, `--hb-line`, `--hb-accent`,
  `--hb-ok`, `--hb-warn`, `--hb-bad`, `--hb-radius`, `--hb-font`,
  `--hb-mono`, `--hb-chat-height`. Dark follows the system unless the
  element carries `data-theme="light"`; `data-theme="dark"` forces it.

Every string a person reads is built by pure functions in `view.ts`
(`modelRows`, `disableReason`, `progressText`, `pillFor`, `traceRows`,
`maskKey`, `appendDelta`), exported for pages that draw their own UI.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/ai-elements` passes, 12 tests, in
  Node 22.18.0: sizes, licence lines, disable reasons, first rungs,
  progress text, pills, trace rows, key masking, streaming chat state,
  escaping, theme tokens and `define()` against a fake registry.

### Not verified by anything

- Looked at in a browser: no. No element has been rendered, so layout,
  the dark theme, focus order, screen reader output and the chat stream's
  repaint cost are unchecked.
- The elements' DOM code (rendering, events, the key field) has no test;
  only the view model functions do.

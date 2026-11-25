# @hackbuild/ai-elements

Deprecated: use [@hackbuild/ai-views](../ai-views/README.md), whose views
bind the same packages to hackbuild-ui and ship as Vue components and
custom elements. `define()` writes one deprecation note to the console.
The model picker, download bar, status pills and chat panel here are
replaced by `<model-select>`, `<chat-pane>` and `<chat-composer>`; they
stay until the example pages that use them move to ai-views.

Web components for pages that run models in a tab: a model picker, a
download bar, status pills, a chat panel and a memory inspector. No
framework, shadow DOM styled with the hack.build design system
(hackbuild-ui), theming through its CSS custom properties, icons as
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

- Model picker: hackbuild-ui `HbModelList` markup (rows variant) with its
  vanilla `modelList` behaviour: a search field, groups, one radio per
  row, arrows and Home and End. Each row carries the fit of
  `@hackbuild/models` `fitOf` against `env` and `estimate`, the shape
  `{ fit, ok, reason }`; a row that does not fit is off with the reason,
  for example "no webgpu adapter here." Set `fits` to pass fits worked
  out elsewhere. Rows show size with measured, vendor, inferred or
  unknown, the fit chip, and the licence as recorded.
- Download bar: idle until a download starts, with no action; then percent and MB when the total is known, MB counted with
  an indeterminate bar when it is not, a resuming state, cancel and resume
  events, and a failed state that names the error. The moving bar stops
  under reduced motion.
- Status pills: loading, ready, busy, failed (including a watchdog trip)
  and patch missed, each with its state dot. Busy and loading blink ink,
  so a row of pills never spends the one pink of the view.
- Chat panel: streams text, keeps think text in a collapsed block, a stop
  button while a reply streams, notes for stop, token limit and failure,
  Enter sends and Shift Enter adds a line.
- Memory inspector: the recall query, mode, and per candidate kind, text,
  BM25 rank and score, cosine rank and value, RRF and final score, with
  the rows handed to the model marked.

## Styling and theming

Each shadow root adopts the hackbuild-ui class layer (version 0.9.3,
commit 23b6969, vendored in `tools/vendor`) as one constructable
stylesheet shared by every element, and renders that layer's markup:
`.hb-models` for the picker, `.hb-progress` for the download bar,
`.hb-pill` for the pills, `.hb-chat` with `.hb-composer` for the chat
panel, `.hb-table` with `tr.is-mark` for the inspector. The sheet is a
string in the bundle (`src/hb-sheet.ts`, written by
`node tools/gen-hb-sheet.mjs` on every build), so nothing is fetched and
the elements work from `file://`. It holds only the rules the elements
can match: a rule naming an `hb-` class that no element source writes is
dropped, which takes the sheet from 275 KB to 22 KB of CSS (measured). A browser without constructable stylesheets gets
the same CSS in a style element.

The page does not need the hackbuild-ui styles. The picker imports
`modelList` and the catalogue words from `@virgilvox/hackbuild-ui/vanilla`
(a peer; the single file builds inline it). The theming surface is the
hackbuild-ui token set, `--hb-paper`, `--hb-ink`, `--hb-pink`, `--hb-ok`,
`--hb-warn`, `--hb-err`, `--hb-body`, `--hb-utility`, `--hb-chat-h` and
the rest (`TOKENS` lists all 101 with their defaults). No element declares
a token on `:host`; every `var(--hb-*)` in the sheet carries the hackbuild-ui value
as its fallback. So:

- on a bare page the elements look like hackbuild-ui;
- on a page that loads hackbuild-ui, the page's `:root` tokens reach in
  and nothing differs;
- a page with its own palette sets the tokens on the element or any
  ancestor: `hb-chat-panel { --hb-ink: #222; --hb-chat-h: 480px }`.

Version 0.1.0 set `--hb-ok` and `--hb-warn` on `:host` with its own
values. Those names are hackbuild-ui tokens too, so inside the elements
they shadowed the design system's green and amber. They are no longer
declared; they default to hackbuild-ui `#1f9d55` and `#c77700`, and a
page value wins. The other 0.1.0 tokens are gone: `--hb-bg` is
`--hb-paper-raised`, `--hb-fg` is `--hb-ink`, `--hb-muted` is
`--hb-ink-3`, `--hb-line` is `--hb-ink`, `--hb-accent` is `--hb-pink`,
`--hb-bad` is `--hb-err`, `--hb-font` is `--hb-body`, `--hb-mono` is
`--hb-utility`, `--hb-chat-height` is `--hb-chat-h`, and `--hb-radius`
has no successor (radius is zero). The dark theme and `data-theme` are
gone with them: hackbuild-ui defines no dark palette.

Fonts come from the page. An `@font-face` inside a shadow root does not
load, so link hackbuild-ui `fonts-inline.css` (works offline and from
`file://`) or the elements fall back to Courier New and the system
monospace.

The layer is mobile first: on a phone the buttons are 44 px tall, the
composer and key field are 16 px so iOS does not zoom, and chat turns
take the full width; at 641 px and up with a fine pointer they compact.

Every string a person reads is built by pure functions in `view.ts`
(`modelRows`, `disableReason`, `progressText`, `pillFor`, `traceRows`,
`maskKey`, `appendDelta`), exported for pages that draw their own UI.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `npx vitest run packages/ai-elements` passes, 12 tests, in
  Node 22.18.0: sizes, licence lines, disable reasons, first rungs,
  progress text, pills, trace rows, key masking, streaming chat state,
  escaping, token defaults and the shadow sheet (2026-11-23), and
  `define()` against a fake registry.
- 2026-11-23: the five elements rendered on the examples page in Chrome
  150 with the hackbuild-ui 0.4.3 sheet adopted, screenshotted at 320,
  360 (Android profile, touch), 390 (iPhone profile, touch), 768, 1024,
  1280 and 1440 px: no sideways scroll, every control in the shadow roots
  at least 44 px tall on the phone profiles, fields 16 px there (measured
  by a layout script, looked at by the builder in the screenshots). The
  `?auto` page check passes: the 23 MB download, 500 scripted tokens and
  500 tokens from Qwen2.5 0.5B (Apache-2.0) stream through the restyled
  elements.

### Not verified by anything

- Focus order and screen reader output: not checked. Safari and Firefox:
  not run.
- The elements' DOM code (rendering, events, the key field) has no test;
  only the view model functions do.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 14,397 bytes | 15,116 bytes |
| `dist/single/index.iife.js` (single file build) | 17,611 bytes | 18,491 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

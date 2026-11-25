# @hackbuild/ai-elements

Deprecated: use [@hackbuild/ai-views](../ai-views/README.md). The views
there bind the same packages to hackbuild-ui and ship each one as a Vue
component and a custom element. Code MIT; this README CC-BY-4.0.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/ai-views

## What is left here

`define(prefix = "hb")` registers the ai-views custom elements under the
prefix and writes one deprecation note to the console. `ELEMENT_NAMES`,
`mountMemoryInspector`, `traceRows` and `inspectorHtml` are re-exported.
The model picker, download bar, status pills and chat panel of 0.1 are
gone; use `<model-select>`, `<chat-pane>` and `<chat-composer>` from
ai-views, which draw with the page's hackbuild-ui stylesheet in light DOM.
The example pages that used them (chat, devices, embed, imagegen, speak,
transcribe, vision) now use ai-views or a hackbuild-ui progress line.

## What is verified, and what is not

- Verified (2026-11-25, `npx vitest run packages/ai-elements`): define
  registers every ai-views element under the prefix and warns once.
- Not verified: anything in a browser here; the views are checked under
  ai-views.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 582 bytes | 611 bytes |
| `dist/single/index.iife.js` (single file build) | 87,305 bytes | 91,670 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

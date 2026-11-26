# @hackbuild/ai-elements

Deprecated: use [@hackbuild/ai-views](../ai-views/README.md), which draws the same views with hackbuild-ui as custom elements and Vue components.

[![npm](https://img.shields.io/npm/v/@hackbuild/ai-elements)](https://www.npmjs.com/package/@hackbuild/ai-elements) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 0.6 kB measured](https://img.shields.io/badge/gzip-0.6%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- `define(prefix = "hb")` registers the ai-views custom elements under the prefix and writes one deprecation note to the console.
- `ELEMENT_NAMES`, `mountMemoryInspector`, `traceRows` and `inspectorHtml` are re-exported from ai-views.
- The model picker, download bar, status pills and chat panel of 0.1 are gone; use `<model-select>`, `<chat-pane>` and `<chat-composer>` from ai-views.

## Install

```sh
npm install @hackbuild/ai-views
```

Existing code that imports the old name keeps working with `npm install @hackbuild/ai-elements`.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0. This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-25 | `npx vitest run packages/ai-elements` | pass: define registers every ai-views element under the prefix and warns once |

### Not verified by anything

- Anything in a browser here; the views are checked under ai-views.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 582 bytes | 611 bytes |
| `dist/single/index.iife.js` (single file build) | 93,023 bytes | 97,674 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

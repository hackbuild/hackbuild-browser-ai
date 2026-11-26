# @hackbuild/biosignal

Filter EEG, train a Riemannian classifier on it and cross validate it without leaks, in a Rust wasm core that runs in your tab.

[![npm](https://img.shields.io/npm/v/@hackbuild/biosignal)](https://www.npmjs.com/package/@hackbuild/biosignal) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 2.9 kB measured](https://img.shields.io/badge/gzip-2.9%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Band passes each channel with zero phase biquads, with an optional mains notch and its harmonic.
- Turns each window into one shrunk covariance per frequency band.
- Trains a tangent space classifier on those covariances and gives class probabilities per window.
- Cross validates with folds that hold whole trials, so windows from one trial never sit on both sides.
- Exports the trained model as plain JSON and loads it back.

## Install

```sh
npm install @hackbuild/biosignal
```

No dependencies and no peers. The wasm core ships in the package as `wasm/biosignal.wasm` and as base64 in the `@hackbuild/biosignal/inline` subpath.

## Quick start

```ts
import { epochsFromEvents, loadBiosignal } from "@hackbuild/biosignal";
import { BIOSIGNAL_WASM_BASE64 } from "@hackbuild/biosignal/inline";

// the wasm core, inlined so nothing is fetched
const bs = await loadBiosignal({ base64: BIOSIGNAL_WASM_BASE64 });

// continuous EEG at 256 Hz, one Float32Array per channel, and labelled events
const channels: Float32Array[] = [new Float32Array(256 * 60), new Float32Array(256 * 60)];
const events = [{ at: 256, label: 0 }, { at: 256 * 10, label: 1 }];
const epochs = epochsFromEvents(channels, events, 256, 4, 64); // 4 windows per trial

// alpha and beta bands; folds hold whole trials, so no window leaks across
const bands = [{ lo: 8, hi: 12 }, { lo: 13, hi: 30 }];
console.log("accuracy per fold", bs.crossValidate(epochs, bands, 256, { classes: 2 }));

// train on everything, then save the model as JSON (reload with bs.load)
const model = bs.train(epochs, bands, 256, { classes: 2 });
console.log(model.predict(epochs[0]!), JSON.stringify(model.toJSON()).length, "bytes of json");
```

## Live example

The package page runs the core in the tab: [hackbuild-browser-ai/biosignal](https://hackbuild.github.io/hackbuild-browser-ai/biosignal/).

## Concepts

### the core comes from a url, bytes or base64

`loadBiosignal` takes `{ url }`, `{ bytes }` or `{ base64 }`. The `@hackbuild/biosignal/inline` subpath exports `BIOSIGNAL_WASM_BASE64` so a page loads nothing extra; `@hackbuild/biosignal/biosignal.wasm` is the same core as a file for your bundler to serve. The core is built from `crates/biosignal` for wasm32 with SIMD128; `bs.simd` says whether that build is the one loaded.

### filters run forward then backward

`bandpass` runs high pass and low pass biquads forward then backward, so the output has no phase shift. Pass a notch frequency (50 or 60 Hz) to also remove it and its harmonic (Q 30); 0 means no notch.

### features are covariances on a manifold

Each window is filtered per band and turned into a covariance shrunk toward its mean eigenvalue (0.08 by default). The reference is the log-Euclidean mean per band; tangent vectors take the upper triangle with off diagonals times sqrt 2. A multinomial logistic regression runs on the standardized features with Adam and L2, by default 0.05 L2, 150 epochs and learning rate 0.14 (the earlier biosignal build's settings).

### cross validation folds by trial

`epochsFromEvents` cuts `per` windows from each event, stepping by `step` samples, and gives every window of one event the same trial id. `crossValidate` keeps a trial's windows in one fold and fits the reference on the training fold only. `byTrial: false` reports the leaky window level number for comparison.

### a slot for a neural model

`EegNetRunner` is the interface a neural model (EEGNet in earlier builds) would fill. No runner is built here.

## API overview

| export | what it does |
|---|---|
| [`loadBiosignal`](../../docs/api/biosignal/README.md#loadbiosignal) | instantiate the wasm core |
| [`Biosignal`](../../docs/api/biosignal/README.md#biosignal) | filters, covariances, training, cross validation and model reload |
| [`Classifier`](../../docs/api/biosignal/README.md#classifier) | probabilities and the predicted class for one window, JSON export |
| [`epochsFromEvents`](../../docs/api/biosignal/README.md#epochsfromevents) | cut labelled windows from continuous data |
| [`Epoch`](../../docs/api/biosignal/README.md#epoch) | one window: channels by samples, label and trial id |
| [`Band`](../../docs/api/biosignal/README.md#band) | a frequency band in Hz |
| [`TrainOptions`](../../docs/api/biosignal/README.md#trainoptions) | class count, L2, epochs and learning rate |
| [`ModelJson`](../../docs/api/biosignal/README.md#modeljson) | the exported model |
| [`EegNetRunner`](../../docs/api/biosignal/README.md#eegnetrunner) | the slot for a neural model |

The full reference is in [docs/api/biosignal](../../docs/api/biosignal/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| wasm core | WebAssembly with SIMD128 | yes (inferred) | yes (inferred) | yes (inferred) | unknown |
| threads | none | not used | not used | not used | not used |
| WebGPU | none | not used | not used | not used | not used |

The core is single threaded and needs no WebGPU. There is no scalar fallback build; a browser without wasm SIMD128 cannot instantiate it (inferred). It also runs in Node 22, where the tests run it.

## Errors and troubleshooting

| message | cause | what to do |
|---|---|---|
| `train: no epochs` (or `crossValidate: ...`) | the epoch list is empty | check that your events fall inside the data; windows past the end are skipped |
| `train: no bands` | the band list is empty | pass at least one `{ lo, hi }` |
| `train: every epoch needs N channels and channels times samples values` | epochs differ in channel count, or `data` has the wrong length | cut every epoch from the same channels, `data.length` equal to channels times samples |
| `train: label L is outside 0 to K` | a label is not below `classes` | number classes from 0 and set `classes` to their count |
| `not a hackbuild biosignal model, or a newer version` | `load` got other JSON | pass the object from `toJSON()` |
| `model values do not match their header` | the model JSON was cut or edited | export it again |
| `model was dropped` | `proba` after `dispose()` | load the model again |
| `biosignal wasm: http 404 for ...` | the wasm URL did not load | serve `wasm/biosignal.wasm`, or pass `{ base64: BIOSIGNAL_WASM_BASE64 }` |

## Works with

- [@hackbuild/audio-dsp](../audio-dsp/README.md) is the Rust wasm core for audio filters; this package keeps its own EEG filters.
- [@hackbuild/devices](../devices/README.md) probes what the browser can run before you load a core.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-biosignal` passes 4 tests (2 unit,
  2 integration) under rustc 1.95: deterministic math against the host
  libm, cross validation over 90 percent on a seeded rhythm fixture and at
  chance on labels independent of the class, trials never split across
  folds, log and exp round trip, zero self distance. `cargo clippy -D
  warnings` passes natively and for wasm32.
- 2026-11-22: `npx vitest run packages/biosignal` passes 3 tests under
  Node 22.18.0, including native and wasm parity: the fixture, filter
  output, covariance, Riemannian distance, trained probabilities and per
  fold accuracies give the same bits from the wasm build (simd128 on);
  JSON export and reload; epoching by event.

### Not verified by anything

- Real EEG recordings and headsets; accuracy on any public data set.
- EEGNet training, tflite export and the TFLite Micro sketch of earlier builds: not built.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 2,900 bytes | 3,045 bytes |
| `wasm/biosignal.wasm` | 22,644 bytes | 23,776 bytes |
| `dist/single/index.iife.js` (single file build) | 2,998 bytes | 3,147 bytes |

Measured 2026-11-25 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)); this README is CC-BY-4.0 with its code samples also MIT. This package downloads no weights; models are trained in the tab.

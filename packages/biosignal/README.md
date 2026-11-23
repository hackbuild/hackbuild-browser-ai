# @hackbuild/biosignal

EEG in a tab, from COLLET: zero phase filters, shrunk covariances and a
Riemannian tangent space classifier with leak free cross validation, in a
Rust core built for wasm32 with SIMD128 (`crates/biosignal`). Code MIT;
this README CC-BY-4.0 with the code samples also MIT. No weights here;
models are trained in the tab.

    npm install @hackbuild/biosignal

    import { loadBiosignal, epochsFromEvents } from "@hackbuild/biosignal";
    import { BIOSIGNAL_WASM_BASE64 } from "@hackbuild/biosignal/inline";

    const bs = await loadBiosignal({ base64: BIOSIGNAL_WASM_BASE64 });
    const epochs = epochsFromEvents(channels, events, 256, 4, 64);  // 4 windows per trial
    const bands = [{ lo: 8, hi: 12 }, { lo: 13, hi: 30 }];
    const acc = bs.crossValidate(epochs, bands, 256, { classes: 2 }, 0.08, 50);  // folds hold whole trials
    const model = bs.train(epochs, bands, 256, { classes: 2 }, 0.08, 50);
    const json = model.toJSON();                                    // reload with bs.load(json)

- Filters: high pass and low pass biquads run forward then backward, plus
  a notch and its harmonic (Q 30).
- Covariance shrunk toward its mean eigenvalue (0.08 by default); the
  reference is the log-Euclidean mean per band; tangent vectors take the
  upper triangle with off diagonals times sqrt 2; multinomial logistic
  regression on standardized features with Adam and L2 (COLLET's 0.05,
  150 epochs, 0.14).
- Cross validation folds by trial so windows from one trial never sit on
  both sides; the reference is fitted on the training fold only.
  `byTrial: false` reports the leaky window level number for comparison.
- `EegNetRunner` is the slot for a neural model (COLLET's EEGNet on
  tfjs); no runner is built here.

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
- EEGNet training, tflite export and the TFLite Micro sketch COLLET
  produced: not built.

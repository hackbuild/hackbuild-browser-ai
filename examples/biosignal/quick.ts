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

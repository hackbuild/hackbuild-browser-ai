import { epochsFromEvents, loadBiosignal } from "@hackbuild/biosignal";
import { BIOSIGNAL_WASM_BASE64 } from "@hackbuild/biosignal/inline";

// the wasm core, inlined so nothing is fetched
const bs = await loadBiosignal({ base64: BIOSIGNAL_WASM_BASE64 });
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  // a CSV at 256 Hz: one row per sample, one column per channel, then a label where a trial starts
  const rows = (await input.files![0]!.text()).trim().split("\n").map((l) => l.trim().split(","));
  const n = rows[0]!.length - 1;
  const channels = Array.from({ length: n }, (_, c) => Float32Array.from(rows, (r) => Number(r[c])));
  const events = rows.flatMap((r, at) => (r[n] ? [{ at, label: Number(r[n]) }] : []));
  const epochs = epochsFromEvents(channels, events, 256, 4, 64); // 4 windows of 1 s per trial
  // alpha and beta bands; folds hold whole trials, so no window leaks across
  const bands = [{ lo: 8, hi: 12 }, { lo: 13, hi: 30 }];
  console.log("accuracy per fold", bs.crossValidate(epochs, bands, 256, { classes: 2 }));
  // train on everything, then save the model as JSON (reload with bs.load)
  const model = bs.train(epochs, bands, 256, { classes: 2 });
  console.log(model.predict(epochs[0]!), JSON.stringify(model.toJSON()).length, "bytes of json");
};

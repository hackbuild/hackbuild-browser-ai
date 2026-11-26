import { loadOrt, ortProvider } from "@hackbuild/devices";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { attachStems, separate } from "@hackbuild/stems";
import { openWeightStore } from "@hackbuild/weights";

// a hub with the htdemucs records (weights MIT, stated from the record); onnxruntime-web loads at runtime, weights go through the store
const hub = createHub();
attachStems(hub);
hub.provide("ort", ortProvider({ runtime: loadOrt(), store: await openWeightStore() }).factory);

// a picked song at 44.1 kHz stereo, separated on the fast tier with progress per segment
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const { channels } = await decodeAudio(input.files![0]!, 44100);
  const left = channels[0]!;
  const { stems, rtf } = await separate(hub, left, channels[1] ?? left, { model: "htdemucs-fast", onProgress: (p) => console.log(`segment ${p.done} of ${p.total}`) });
  console.log(`vocals ${stems.vocals.left.length} samples, ${rtf.toFixed(2)}x realtime`);
};

import { loadOrt, ortProvider } from "@hackbuild/devices";
import { createHub } from "@hackbuild/models";
import { attachStems, separate } from "@hackbuild/stems";
import { openWeightStore } from "@hackbuild/weights";

// a hub with the htdemucs records (weights MIT); onnxruntime-web loads at runtime
const hub = createHub();
attachStems(hub);
const store = await openWeightStore();
hub.provide("ort", ortProvider({ runtime: loadOrt(), store }).factory);

// a 44.1 kHz stereo mix, for example from decodeAudio in @hackbuild/media
const left = new Float32Array(44100 * 10);
const right = new Float32Array(44100 * 10);

// separate on the fast tier, with progress per segment
const { stems, rtf } = await separate(hub, left, right, { model: "htdemucs-fast", onProgress: (p) => console.log(`segment ${p.done} of ${p.total}`) });
console.log(`vocals ${stems.vocals.left.length} samples, ${rtf.toFixed(2)}x realtime`);

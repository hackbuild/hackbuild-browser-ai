import { probe } from "@hackbuild/ai-env";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { asSrt, attachTranscribe, defaultTranscribeId, toMono, transcribe, TRANSCRIBE_RECORDS } from "@hackbuild/transcribe";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// a hub with the whisper and moonshine records; transformers.js comes in through the devices loader, weights through the store with each record's licence
const hub = createHub({ env: await probe() });
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache: transformersCache(await openWeightStore(), { licenceFor: (url) => TRANSCRIBE_RECORDS.find((r) => r.source.modelId && url.includes(r.source.modelId))?.licence ?? null }) }).factory);
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => { // 16 kHz mono from the picked file, then whisper: large-v3-turbo with webgpu, base.en without
  const { channels } = await decodeAudio(input.files![0]!, 16000);
  const out = await transcribe(hub, dsp, toMono(channels), { model: defaultTranscribeId(hub.env?.webgpu ?? false), language: "en" });
  console.log(asSrt(out.segments), out.dropped.length, "lines dropped");
};

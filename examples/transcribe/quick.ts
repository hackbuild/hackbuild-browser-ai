import { probe } from "@hackbuild/ai-env";
import { loadDsp } from "@hackbuild/audio-dsp";
import { AUDIO_DSP_WASM_BASE64 } from "@hackbuild/audio-dsp/inline";
import { loadTransformers, tjsProvider } from "@hackbuild/devices";
import { decodeAudio } from "@hackbuild/media";
import { createHub } from "@hackbuild/models";
import { asSrt, attachTranscribe, defaultTranscribeId, toMono, transcribe } from "@hackbuild/transcribe";
import { openWeightStore, transformersCache } from "@hackbuild/weights";

// a hub with the whisper and moonshine records; transformers.js comes in through the devices loader, weights through the store
const env = await probe();
const hub = createHub({ env });
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers(), cache: transformersCache(await openWeightStore(), { licenceFor: () => "MIT" }) }).factory);

// 16 kHz mono from a dropped file, then whisper (weights MIT): large-v3-turbo with webgpu, base.en without
const dsp = await loadDsp({ base64: AUDIO_DSP_WASM_BASE64 });
const { channels } = await decodeAudio(new File([], "talk.mp3"), 16000);
const out = await transcribe(hub, dsp, toMono(channels), { model: defaultTranscribeId(env.webgpu), language: "en" });
console.log(asSrt(out.segments), out.dropped.length, "lines dropped");

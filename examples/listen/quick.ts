import { loadOrt, loadTransformers, tjsProvider } from "@hackbuild/devices";
import { createListener, hubTranscriber, micBlocks, openMic, sileroVad, VAD_RECORDS, type OrtLike } from "@hackbuild/listen";
import { createHub } from "@hackbuild/models";
import { attachTranscribe } from "@hackbuild/transcribe";
import { openWeightStore } from "@hackbuild/weights";

// ask for the microphone first, so the prompt shows before any download
const stream = await openMic();
const ctx = new AudioContext();
// Silero VAD v5 (weights MIT) on onnxruntime-web, its bytes cached by the weight store
const silero = VAD_RECORDS[0]!.source;
const bytes = await (await openWeightStore()).once({ url: silero.url!, sha256: silero.sha256!, licence: "MIT" });
const vad = await sileroVad((await loadOrt()()) as unknown as OrtLike, bytes);
// Whisper (weights MIT) through the models hub turns each utterance into text; mic blocks feed the listener
const hub = createHub();
attachTranscribe(hub);
hub.provide("tjs", tjsProvider({ runtime: loadTransformers() }).factory);
const listener = createListener({ vad, inputRate: ctx.sampleRate, transcribe: hubTranscriber(hub, { model: "whisper-base.en" }), onUtterance: (u) => console.log(u.bargeIn ? "barge in:" : "heard:", u.text) });
listener.start();
await micBlocks(ctx, stream, (b) => listener.push(b));

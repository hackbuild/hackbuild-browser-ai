import { importEsm } from "@hackbuild/ai-env";
import { bellowsEngine, createSpeaker, renderedWav, webSpeechEngine, type BellowsVoiceModule } from "@hackbuild/speak";

// one AudioContext, made after a click so the browser lets it play
const ctx = new AudioContext();

// the bellows voice first (a vocal tract model, no weights, code MIT), the system voice as fallback
const bellows = bellowsEngine({ runtime: () => importEsm<BellowsVoiceModule>("https://cdn.jsdelivr.net/npm/bellows-voice@0.8.0/dist/engine.js/+esm"), rng: Math.random });
const speaker = createSpeaker({ ctx, engines: [bellows, webSpeechEngine()], onProgress: (p) => console.log("reached", p.offset, p.kind) });

// feed a reply as it streams; the last call says it is complete
speaker.feed("Hello there, this is the first clause.");
speaker.feed("Hello there, this is the first clause. And here is the rest.", true);
await speaker.done();

// render a line offline and keep it as a wav
const wav = renderedWav(await speaker.render("Saved to a file."));
console.log("wav", wav.size, "bytes");

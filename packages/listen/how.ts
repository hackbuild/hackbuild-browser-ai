// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/listen"],
  what: `speech in for a talking character: microphone blocks become utterances through a vad state machine, each utterance goes to a transcriber and the phantom text filter, and speech that clears a stricter bar while the character talks is a barge in.`,
  how: [
    `frames: input is brought to 16 khz (the transcribe package's fir decimator for 32 and 48 khz, its windowed sinc resampler for 44.1, 24 and 22.05 khz) and cut into 512 sample frames (32 ms, computed).`,
    `machine: an utterance starts on a frame at or over the positive threshold, keeps 300 ms of audio from before the start, is confirmed after 250 ms of speech frames and ends after 600 ms under the negative threshold; too little speech is a misfire. utterances are cut at 24 s.`,
    `barge in: while \`setTalking(true)\`, thresholds swap to positive 0.85 and 450 ms of speech (from 0.5 and 250 ms), so the character's own voice from the speakers does not count. the confirmed event in that state calls \`onBargeIn\`; the utterance is still transcribed and carries \`bargeIn: true\`.`,
  ],
  install: "npm install @hackbuild/listen",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/listen`,
  code: `import { openMic, micBlocks, createListener, sileroVad, energyVad, hubTranscriber } from "@hackbuild/listen";

const stream = await openMic();              // ask first, so the prompt shows before any download
const ctx = new AudioContext();
const vad = await sileroVad(ort, sileroBytes); // Silero VAD v5, weights MIT; or energyVad() with no weights
const listener = createListener({
  vad,
  inputRate: ctx.sampleRate,
  transcribe: hubTranscriber(hub, { model: "whisper-base.en" }), // Whisper, weights MIT
  onUtterance: (u) => u.text && agent.heard(u.text),
  onBargeIn: () => speaker.stop(),
});
listener.start();
await micBlocks(ctx, stream, (b) => listener.push(b));
speaker = createSpeaker({ ..., onSpeaking: (b) => listener.setTalking(b) });`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/listen/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/listen" },
};
export default how;

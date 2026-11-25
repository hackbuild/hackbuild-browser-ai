// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/speak"],
  what: `speech out for a character in a tab. a speaker takes the reply while it streams, cuts it into segments, runs them through the first engine in a chain that works (kokoro, pocket tts, the system voice), plays pcm back to back on one audiocontext through one analyser, and reports progress as offsets in the caller's text when the voice reaches them.`,
  how: [
    `offsets: \`feed(text)\` takes the visible reply (action tags already removed by @hackbuild/structured's tag parser). every \`Progress\` and \`TimedEvent\` offset is in that text. \`speakable()\` strips think blocks (also unclosed ones), code fences, markdown marks, link targets, emoji and variation selectors, reads bare urls as "link", applies a caller lexicon, collapses whitespace, and keeps a map from each spoken character back to the input.`,
    `segments: the first ends at a clause (\`,\` \`;\` \`:\`) once 24 characters long, so speech starts early; later ones end at a sentence, or at the last clause or space before 160 characters. abbreviations (dr., e.g.) and decimals do not end a sentence; an open word at the stream's edge waits.`,
    `pipelining: one loop synthesizes segment n+1 while n plays. chunks are scheduled at max(now + 40 ms, end of the last chunk) with a 96 sample fade at the start and end of each segment.`,
  ],
  install: "npm install @hackbuild/speak",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/speak`,
  code: `import { createSpeaker, kokoroEngine, pocketEngine, webSpeechEngine } from "@hackbuild/speak";
import { runtimeLoader } from "@hackbuild/devices";

const ctx = new AudioContext();
const speaker = createSpeaker({
  ctx,
  engines: [
    pocketEngine(),                                                       // Pocket TTS, weights CC-BY-4.0, pinned build
    // Kokoro 82M, weights Apache-2.0; opt in, its phonemizer is GPL (below)
    kokoroEngine({ runtime: runtimeLoader(["https://cdn.jsdelivr.net/npm/kokoro-js@1.2.1/+esm"]), allowGplPhonemizer: true }),
    webSpeechEngine(),                                                    // system voice
  ],
  onProgress: (p) => director.reached(p.offset),   // action cues, same offsets as the tag parser
  onTimed: (t) => lips.push(t),                     // words or phonemes on the audio clock
  onSpeaking: (b) => listener.setTalking(b),        // barge in threshold swap
  onStatus: (s) => show(s),
});

for await (const ev of chat.stream(messages)) if (ev.type === "text") speaker.feed(visible += tags.feed(ev.text).text);
speaker.feed(visible, true);
speaker.analyser;   // the one output node for a level or viseme driver
speaker.stop();     // barge in`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/speak/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/speak" },
};
export default how;

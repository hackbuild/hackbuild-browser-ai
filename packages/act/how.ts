// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/act"],
  what: `a speech timeline action grammar for characters driven by a language model. tags the model places in its reply (\`[happy]\`, \`*waves*\`, \`[mood: sad]\`, \`[happy, wave]\`) are taken out of the spoken text and fire when the voice reaches the spot where they sat. names are limited to what the avatar can realize: moods (expression presets), gestures (one shot clips) and postures (held clips). no model ships here.`,
  how: [
    `\`bindActs\` turns an expression list and a clip library into the three lists \`buildVocabulary\` takes, plus a map from each name back to its clips.`,
    `classes: \`classifyClip\` sorts a clip into idle, talk, gesture, posture, dance, reaction, locomotion, action or odd through eight ordered rules (\`CLIP_RULES\`, data an app can extend) over folder and name, then a \`walk\` analysis tag; a user tag naming a class wins. gesture, dance and reaction clips become gestures, posture clips postures, idle and talk clips loops; locomotion, action and odd clips stay out of replies.`,
    `names: a clip name that says what it is decides alone ("sits down" with a nod analysis tag binds to sit); tags place only opaque names. past the cap (default 14) the kinds of movement come first, most common first.`,
  ],
  install: "npm install @hackbuild/act",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/act`,
  code: `import { buildVocabulary, createDirector, promptBlock, grammar } from "@hackbuild/act";

const vocab = buildVocabulary({
  expressions: ["happy", "sad", "angry", "surprised", "relaxed"],
  gestures: ["wave", "nod", "shrug"],
  postures: ["sit", "stand"],
});
const system = \`\${persona}\\n\\n\${promptBlock(vocab)}\`;   // short category names only
const gbnf = grammar(vocab, "gbnf");                    // or "json-schema"

const director = createDirector({ vocab, mode: "hybrid", fire: (cue) => avatar.play(cue) });
director.begin();
for await (const ev of chat.stream(messages, { signal })) {
  if (ev.type === "text") voice.feed(director.feed(ev.text).text);
}
voice.feed(director.finish().text, true);
voice.onProgress = (offset) => director.reached(offset);
history.push({ role: "assistant", content: rawReply });   // keep the tags`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/act/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/act" },
};
export default how;

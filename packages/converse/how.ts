// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/converse"],
  what: `the conversation core: one turn loop over a streaming chat engine, the history rules small models need, stop, redo, edit and remove, memory and camera lines kept on the turn they belong to, cue replay when a reply is spoken again, and the versioned chat session schema with a debounced store. framework free; state changes come out as events.`,
  how: [
    `the engine, director and speaker are taken by shape (\`ConverseEngine\`, \`DirectorLike\`, \`SpeakerLike\`), so this package imports none of chat, act or speak; a \`ChatEngine\`, an act \`Director\` and a speak \`Speaker\` fit.`,
    `a reply with no letter or digit stays out of the next request: small models copy it.`,
    `a leading assistant greeting is shown and never sent, so the request starts with a user turn.`,
  ],
  install: "npm install @hackbuild/converse",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/converse`,
  code: `import { scripted } from "@hackbuild/chat";
import { createConversation } from "@hackbuild/converse";

const conv = createConversation({
  engine: scripted({ replies: ["[wave] hi"] }), // any ChatEngine
  now: () => Date.now(),
  system: "you are a dog",
  greeting: "woof. what are we doing",
  director,                                     // createDirector from @hackbuild/act, optional
  speaker,                                      // a Speaker from @hackbuild/speak, optional
  memory: { recall: (text) => recallLines(text) },
  seen: () => cameraNote(),
  sink: { load: (id) => docs.get(id), save: (s) => docs.put(s.id, s) },
});
conv.on((e) => render(e));                      // change, text, think, done, error, busy
await conv.restore();
await conv.send("walk time");
// new Speaker({ ..., onProgress: (p) => conv.reached(p.offset) })`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/converse/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/converse" },
};
export default how;

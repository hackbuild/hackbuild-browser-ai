// how this works: the fold of the package page and of the suite tool. Plain data, no imports;
// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.
const how: HowDoc = {
  packages: ["@hackbuild/character"],
  what: `character cards for agents and chat characters in a browser tab. a rust core (\`crates/character\`, compiled to wasm32) reads and writes character card v2 and v3 as json, inside png text chunks and as charx archives, and keeps a versioned profile extension that tells an app which body, voice and action names a character has. the same crate builds a native cli. no character content, avatar or voice reference ships here.`,
  how: [
    `v1 (top level name, description, personality, scenario, first_mes, mes_example), v2 (\`spec: "chara_card_v2"\`) and v3 (\`spec: "chara_card_v3"\`, \`spec_version: "3.0"\`) are read. \`upgrade\` gives v3 with every required field present and typed, book entries given \`use_regex: false\` when missing, and keys it does not know kept at the end of \`data\`. \`downgrade\` gives v2 and drops what v2 has no place for: assets, nickname, group only greetings, multilingual notes, source, dates and \`use_regex\`.`,
    `\`validate\` names each problem by path and checks the profile extension too. it does not change the card.`,
    `png: text chunks \`chara\` (v2) and \`ccv3\` (v3) holding base64 utf-8 json. reading takes text, ztxt and itxt, prefers \`ccv3\`, and accepts raw json where a writer skipped the base64. writing removes old card chunks, writes both by default (\`mode: "v3"\` or \`"v2"\` for one) just before iend, and copies every other chunk unchanged; pixels are never decoded. with no image a plain 64 by 64 png is used. crcs are checked on read.`,
    `a locked character carries \`lock\` in its profile: \`{ algo: "pbkdf2-sha256", iterations, salt, hash }\`, made by \`makeLock\` in \`@hackbuild/memory/seal\`. it holds a password verifier, never the password. the key is optional: \`migrate\` leaves it out when absent, so older files stay valid, and drops it with a note when it is not an object. there is no recovery for a lost password.`,
  ],
  install: "npm install @hackbuild/character",
  today: `git clone https://github.com/hackbuild/hackbuild-browser-ai
cd hackbuild-browser-ai && npm ci && npm run build
npm pack -w @hackbuild/character`,
  code: `import { loadCharacterCore, fillMacros, activeLore, profileOf } from "@hackbuild/character";
import { CHARACTER_WASM_BASE64 } from "@hackbuild/character/inline";

const core = await loadCharacterCore({ base64: CHARACTER_WASM_BASE64 }); // or { url } or { bytes }

const r = core.read(new Uint8Array(await file.arrayBuffer())); // PNG, CHARX or JSON, detected from the bytes
r.format; r.source; r.spec; r.assets;                          // "png", "ccv3", "chara_card_v3", []
const card = core.upgrade(r.card);                              // any version to V3, normalized
core.validate(card);                                            // [] or "data.tags[0]: not a string", ...

const { card: ready, notes } = core.migrate(card, { create: true });
const p = profileOf(ready);                                     // avatar, voice, actions, behavior, memory

const png = core.writePng(ready, { image: portraitBytes });     // chara (V2) and ccv3 (V3) chunks
const charx = core.writeCharx(ready, [
  { path: "assets/avatar/body.vrm", bytes: vrmBytes },          // the caller's own files
]);
core.entry(charx, "assets/avatar/body.vrm");

fillMacros(ready.data.first_mes, { char: ready.data.name, user: "Sam" });
activeLore(ready.data.character_book, lastTurns, { budgetChars: 1200 });`,
  links: { page: "https://hackbuild.github.io/hackbuild-browser-ai/character/", source: "https://github.com/hackbuild/hackbuild-browser-ai/tree/main/packages/character" },
};
export default how;

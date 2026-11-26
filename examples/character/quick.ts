import { activeLore, fillMacros, loadCharacterCore, profileOf } from "@hackbuild/character";
import { CHARACTER_WASM_BASE64 } from "@hackbuild/character/inline";

// load the wasm core from the inlined base64 (or pass { url } or { bytes })
const core = await loadCharacterCore({ base64: CHARACTER_WASM_BASE64 });

// read a card the user picks: PNG, CHARX or JSON, detected from the bytes
const input = document.querySelector<HTMLInputElement>("input[type=file]")!;
input.onchange = async () => {
  const read = core.read(new Uint8Array(await input.files![0]!.arrayBuffer()));
  // any version to V3, then add or update the profile extension
  const { card, notes } = core.migrate(core.upgrade(read.card), { create: true });
  console.log(read.format, read.spec, notes, core.validate(card), profileOf(card)?.voice.engine);
  // fill the greeting and pick the lorebook entries the last turns activate
  console.log(fillMacros(card.data.first_mes, { char: card.data.name, user: "Sam" }));
  console.log(activeLore(card.data.character_book, "the last few turns of chat", { budgetChars: 1200 }));
  // write it back as a PNG with both card chunks
  console.log(core.writePng(card).length, "bytes");
};

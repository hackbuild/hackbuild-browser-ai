# @hackbuild/character

Read, upgrade, check and write character cards in the tab, as JSON, PNG or CHARX, with a profile that names a character's body, voice and actions.

[![npm](https://img.shields.io/npm/v/@hackbuild/character)](https://www.npmjs.com/package/@hackbuild/character) [![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](../../LICENSE) ![gzip 3.1 kB measured](https://img.shields.io/badge/gzip-3.1%20kB-blue) ![types included](https://img.shields.io/badge/types-included-blue)

## What it does

- Reads Character Card V1, V2 and V3 from JSON, from PNG text chunks and from CHARX archives, detecting the format from the bytes.
- Upgrades any card to V3, downgrades to V2, and lists every problem with a card by path.
- Writes cards into PNG text chunks and CHARX archives, with the same bytes for the same input.
- Keeps a versioned profile extension for avatar, voice, action vocabulary, behaviour, memory and an optional lock, and migrates old ones.
- Fills `{{char}}` and `{{user}}` macros and picks the lorebook entries a passage of chat activates.

## Install

```sh
npm install @hackbuild/character
```

No dependencies and no peers. The card work runs in a Rust core compiled to wasm32; the `@hackbuild/character/inline` subpath carries it as base64, and `@hackbuild/character/character.wasm` is the file for a URL load. No character content, avatar or voice reference ships here.

## Quick start

```ts
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
```

## Live example

The character page of the suite uses this package: [hackbuild-suite character](https://hackbuild.github.io/hackbuild-suite/#/character). The package page is at [hackbuild-browser-ai/character](https://hackbuild.github.io/hackbuild-browser-ai/character/).

## Concepts

### the core is wasm you load

`loadCharacterCore` takes `{ base64 }` (the inlined `CHARACTER_WASM_BASE64`), `{ url }` or `{ bytes }` and returns a `CharacterCore`; every method on it is synchronous after that. The core is `crates/character`, with no dependencies. Its wasm surface is `extern "C"` over linear memory: `cc_alloc`, `cc_free`, one call per operation returning 0 or 1, and the result or the error message at `cc_out_ptr` and `cc_out_len`. No bindgen and no threads, so it loads from file:// as bytes or inlined base64. The wasm is built at opt-level s and stripped; its gzip size is in the size budget below. Rebuild it with `npm run build:wasm -w @hackbuild/character`.

### card versions

V1 (top level name, description, personality, scenario, first_mes, mes_example), V2 (`spec: "chara_card_v2"`) and V3 (`spec: "chara_card_v3"`, `spec_version: "3.0"`) are read. `upgrade` gives V3 with every required field present and typed, book entries given `use_regex: false` when missing, and keys it does not know kept at the end of `data`. `downgrade` gives V2 and drops what V2 has no place for: assets, nickname, group only greetings, multilingual notes, source, dates and `use_regex`. `validate` names each problem by path, checks the profile extension too, and does not change the card. JSON keeps key order. Numbers are written as whole numbers under 2^53 and otherwise in the shortest round trip form, the same code on both targets.

### png cards

Cards live in text chunks `chara` (V2) and `ccv3` (V3) holding base64 UTF-8 JSON. Reading takes tEXt, zTXt and iTXt, prefers `ccv3`, and accepts raw JSON where a writer skipped the base64. CRCs are checked on read. Writing removes old card chunks, writes both by default (`mode: "v3"` or `"v2"` for one) just before IEND, and copies every other chunk unchanged; pixels are never decoded. With no image a plain 64 by 64 PNG is used.

### charx archives

A CHARX is a ZIP with `card.json`. Reading goes through the central directory and takes stored and deflate entries; the inflater is written from RFC 1951 in the crate, checks CRC-32 and caps output at 512 MB. Zip64 and encrypted entries are refused. Writing stores card.json (V3, indented) first and the files after it, with fixed 1980-01-01 timestamps so the same input gives the same bytes. Paths with `..`, a leading slash or a backslash are refused. Unless `refs: false`, each file the card does not list gets a `data.assets` record: type from `assets/<type>/...` (the layout the V3 spec suggests), else `x_file`, with the `embeded://` spelling the spec uses.

### the profile extension

Stored at `data.extensions.hackbuild`, where other card tools carry it along untouched. Version 1:

```ts
{ version: 1,
  avatar:   { uri, asset, kind: "vrm" | "glb" | "fbx" | "mmd" | "live2d", expressions: { mood: name }, wardrobe: { part: shown } },
  voice:    { engine, voiceId, rate (0.25 to 4), pitch (0 to 2), cloneRef },
  actions:  { moods: [], gestures: [], postures: [], aliases: { word: name } },
  behavior: { gaze, blink, breath, idle, ambientGestures },
  memory:   { enabled },
  lock?:    { algo: "pbkdf2-sha256", iterations, salt, hash } }
```

`migrate` picks every field from the default shape: unknown keys are dropped, missing keys take the default, a value of the wrong type takes the default, a number out of range is clamped, and a set of older or hand written spellings is carried over (`avatar.url`, `avatar.type`, `voice.id`, `voice.voice_id`, `voice.clone_ref`, `behavior.ambient_gestures`, a top level `motion` for `actions`). Each change comes back as a note. Migrating twice changes nothing. A key keeps its meaning in every version; a new meaning gets a new key and a version step. `migrateProfile` does the same for a bare profile object, and `profileOf` returns the extension as stored, so run `migrate` before trusting its shape.

`voice.cloneRef` points at a reference clip you supply, a CHARX path or a URL. This package never bundles a voice reference or an avatar. `actions` is the per avatar vocabulary that `@hackbuild/act` constrains tags to.

### locked characters

`lock` is present only on a locked character: the record `makeLock` in `@hackbuild/memory/seal` returns, a PBKDF2 SHA-256 salt and iteration count and a verifier, base64. It holds no password. Absent, `migrate` leaves it out, so files written before it stay valid; a value that is not an object is dropped with a note. There is no recovery for a lost password.

### macros and lorebooks

`fillMacros` replaces `{{char}}` and `{{user}}` in any case, and the older `<BOT>` and `<USER>`. `activeLore` returns the enabled entries that are constant or whose keys appear in the text (substring, or regular expression when `use_regex`, written `/source/flags` or bare), and for selective entries also a secondary key. They are ordered by `insertion_order`, then by priority, highest first; `budgetChars` stops adding entries once their content passes that many characters.

### the cli

The same crate builds a native CLI:

```sh
cargo run -p hackbuild-character --bin character -- read card.png
character upgrade card.json v3.json
character validate card.charx
character migrate card.png out.json --create
character write-png card.json out.png --image portrait.png --mode both
character charx-pack card.json out.charx assets/avatar/body.vrm=./body.vrm
character charx-unpack in.charx ./unpacked
```

## API overview

| export | what it does |
|---|---|
| [`loadCharacterCore`](../../docs/api/character/README.md#loadcharactercore) | load the wasm core from base64, a URL or bytes |
| [`CharacterCore`](../../docs/api/character/README.md#charactercore) | read, upgrade, downgrade, validate, migrate and write cards |
| [`CharacterError`](../../docs/api/character/README.md#charactererror) | the error a failed core call throws, with the core's message |
| [`profileOf`](../../docs/api/character/README.md#profileof) | the profile extension of a card as stored, or null |
| [`fillMacros`](../../docs/api/character/README.md#fillmacros) | replace `{{char}}` and `{{user}}` in card text |
| [`activeLore`](../../docs/api/character/README.md#activelore) | the lorebook entries a passage of chat activates |
| [`packAssets`](../../docs/api/character/README.md#packassets) | pack files in the format the core reads for CHARX writes |
| [`Profile`](../../docs/api/character/README.md#profile) | the profile extension shape, version 1 |
| [`Card`](../../docs/api/character/README.md#card) | a V2 or V3 card |
| [`ReadResult`](../../docs/api/character/README.md#readresult) | what `read` returns: format, source, spec, card and assets |

The full reference is in [docs/api/character](../../docs/api/character/README.md).

## Browser support

| feature | needs | Chrome | Safari | Firefox | phone |
|---|---|---|---|---|---|
| card core | WebAssembly | yes | yes | yes | yes (inferred) |
| `{ url }` load | fetch | yes | yes | yes | yes (inferred) |
| macros and lorebook | nothing | yes | yes | yes | yes |

No WebGPU and no wasm threads. The core also runs in Node and in a worker. Loading from file:// in a real page is unverified; the inlined base64 avoids a fetch there.

## Errors and troubleshooting

Every core failure throws `CharacterError` with the core's message.

| message | cause | what to do |
|---|---|---|
| `character wasm: http <status> for <url>` | the wasm URL did not load | check the URL, or load `{ base64: CHARACTER_WASM_BASE64 }` |
| `png: no png signature` | the bytes are not a PNG | pass the card file itself |
| `png: no chara or ccv3 text chunk` | a PNG with no card in it | the image carries no card; ask for a card PNG |
| `png: crc mismatch in <chunk>` | a damaged PNG | get the file again |
| `charx: no card.json` | a ZIP that is not a CHARX | pass a CHARX archive |
| `zip: zip64 archives are not read` | a Zip64 archive | write the archive without Zip64 |
| `zip: encrypted entries are not read` | an encrypted entry | decrypt the archive first |
| `zip: compression method <m> is not read` | an entry that is neither stored nor deflate | repack with stored or deflate |
| `inflate: output over the size cap` | an entry over 512 MB | split the asset or keep it outside the archive |
| `charx: unsafe or reserved path <p>` | an asset path with `..`, a leading slash or a backslash | use a relative path such as `assets/avatar/body.vrm` |
| `charx: no entry <name>` | `entry` asked for a file the archive lacks | list `read(...).assets` first |
| `card: unknown spec <spec>` | the JSON is no V1, V2 or V3 card | check the file is a character card |
| `card: migrate needs a v2 or v3 card; upgrade it first` | `migrate` on a V1 card | call `upgrade` first |
| `json: <problem> at byte <n>` | the card JSON does not parse | fix the JSON at that byte |

`validate` does not throw; it returns a list such as `data.tags[0]: not a string`.

## Works with

- [@hackbuild/act](../act/README.md) constrains mood, gesture and posture tags to the profile's `actions`.
- [@hackbuild/memory](../memory/README.md) makes the `lock` record with `makeLock` in `@hackbuild/memory/seal`.
- [@hackbuild/speak](../speak/README.md) can take `voice.engine`, `voice.voiceId`, `rate` and `pitch` from the profile.
- [@hackbuild/agent](../agent/README.md) and [@hackbuild/chat](../chat/README.md) can take the persona text and `activeLore` entries as context.

## Changelog and licences

Changes are in the repository [CHANGELOG](../../CHANGELOG.md). Code is MIT ([LICENSE](../../LICENSE)), the Rust core included; this README is CC-BY-4.0 with its code samples also MIT. Card fixtures are written for this repository (CC0). This package uses no model and no weights.

## What is verified, and what is not

### Verified on this machine

| date | check | result |
|---|---|---|
| 2026-11-22 | `cargo test -p hackbuild-character` with rustc 1.95 native | passes, 27 tests (23 unit, 2 parity, 2 CLI end to end) |
| 2026-11-22 | `cargo fmt --check` and `cargo clippy --workspace --all-targets -D warnings` | pass; clippy also passes for wasm32 with rustc 1.92 |
| 2026-11-22 | `npx vitest run packages/character` in Node 22.18.0 | passes, 46 tests |
| 2026-11-22 | native and wasm parity over all 35 cases in `crates/character/tests/parity.json` (read, upgrade, downgrade, validate, migrate on V1, V2 and V3 fixtures; PNG writes in three modes; CHARX writes with and without refs; a CHARX with a deflated entry; error cases) | the wasm build gives the same bytes as the native build |
| not dated | the inflater against Node's zlib (fixed and dynamic Huffman blocks) | passes |
| not dated | card fixtures | written for this repository (CC0); no third party character content is used |
| 2026-11-24 | the optional `lock` record (crate test `optional_lock` and `test/character.test.ts`) | absent stays absent, present survives `migrate` twice with no notes, a string is dropped with a note |

### Not verified by anything

- Cards and CHARX files written by other tools; only fixtures made here
  and Node zlib streams were read.
- Other card readers opening the PNG and CHARX files this package writes.
- Loading from file:// in a real page.
- Speed on large archives (a VRM of tens of MB inside a CHARX); no timing
  was taken.

## Size budget

| file | gzip (measured) | ceiling |
|---|---|---|
| `dist/index.js` (main entry, imports external) | 3,098 bytes | 3,252 bytes |
| `wasm/character.wasm` | 78,775 bytes | 82,713 bytes |
| `dist/single/index.iife.js` (single file build) | 3,183 bytes | 3,342 bytes |

Measured 2026-11-26 by `node tools/lint-packages.mjs` (gzip level 9) from the packed
tarball. Generated from `tools/size-budget.json`; CI fails when a file moves more than
5 percent from its row.

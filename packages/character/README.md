# @hackbuild/character

Character cards for agents and chat characters in a browser tab. A Rust core
(`crates/character`, compiled to wasm32) reads and writes Character Card
V2 and V3 as JSON, inside PNG text chunks and as CHARX archives, and keeps
a versioned profile extension that tells an app which body, voice and
action names a character has. The same crate builds a native CLI. Code
MIT; this README CC-BY-4.0 with the code samples also MIT. No character
content, avatar or voice reference ships here.

    # not on npm yet: the @hackbuild scope is unpublished; build from this repository
    npm install @hackbuild/character

## Use

    import { loadCharacterCore, fillMacros, activeLore, profileOf } from "@hackbuild/character";
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
    activeLore(ready.data.character_book, lastTurns, { budgetChars: 1200 });

## Cards

- V1 (top level name, description, personality, scenario, first_mes,
  mes_example), V2 (`spec: "chara_card_v2"`) and V3 (`spec:
  "chara_card_v3"`, `spec_version: "3.0"`) are read. `upgrade` gives V3
  with every required field present and typed, book entries given
  `use_regex: false` when missing, and keys it does not know kept at the
  end of `data`. `downgrade` gives V2 and drops what V2 has no place for:
  assets, nickname, group only greetings, multilingual notes, source,
  dates and `use_regex`.
- `validate` names each problem by path and checks the profile extension
  too. It does not change the card.
- PNG: text chunks `chara` (V2) and `ccv3` (V3) holding base64 UTF-8 JSON.
  Reading takes tEXt, zTXt and iTXt, prefers `ccv3`, and accepts raw JSON
  where a writer skipped the base64. Writing removes old card chunks,
  writes both by default (`mode: "v3"` or `"v2"` for one) just before
  IEND, and copies every other chunk unchanged; pixels are never decoded.
  With no image a plain 64 by 64 PNG is used. CRCs are checked on read.
- CHARX: a ZIP with `card.json`. Reading goes through the central
  directory and takes stored and deflate entries; the inflater is written
  from RFC 1951 in the crate, checks CRC-32 and caps output at 512 MB.
  Zip64 and encrypted entries are refused. Writing stores card.json (V3,
  indented) first and the files after it, with fixed 1980-01-01
  timestamps so the same input gives the same bytes. Paths with `..`, a
  leading slash or a backslash are refused. Unless `refs: false`, each
  file the card does not list gets a `data.assets` record: type from
  `assets/<type>/...` (the layout the V3 spec suggests), else `x_file`,
  with the `embeded://` spelling the spec uses.
- JSON keeps key order. Numbers are written as whole numbers under 2^53
  and otherwise in the shortest round trip form, the same code on both
  targets.

## Profile extension

Stored at `data.extensions.hackbuild`, where other card tools carry it
along untouched. Version 1:

    { version: 1,
      avatar:   { uri, asset, kind: "vrm" | "glb" | "fbx" | "mmd" | "live2d", expressions: { mood: name }, wardrobe: { part: shown } },
      voice:    { engine, voiceId, rate (0.25 to 4), pitch (0 to 2), cloneRef },
      actions:  { moods: [], gestures: [], postures: [], aliases: { word: name } },
      behavior: { gaze, blink, breath, idle, ambientGestures },
      memory:   { enabled } }

- `migrate` picks every field from the default shape: unknown keys are
  dropped, missing keys take the default, a value of the wrong type takes
  the default, a number out of range is clamped, and a set of older or
  hand written spellings is carried over (`avatar.url`, `avatar.type`,
  `voice.id`, `voice.voice_id`, `voice.clone_ref`,
  `behavior.ambient_gestures`, a top level `motion` for `actions`). Each
  change comes back as a note. Migrating twice changes nothing.
- A key keeps its meaning in every version; a new meaning gets a new key
  and a version step.
- `voice.cloneRef` points at a reference clip the caller supplies, a CHARX
  path or a URL. This package never bundles a voice reference or an
  avatar.
- `actions` is the per avatar vocabulary that `@hackbuild/act` constrains
  tags to.

## CLI

    cargo run -p hackbuild-character --bin character -- read card.png
    character upgrade card.json v3.json
    character validate card.charx
    character migrate card.png out.json --create
    character write-png card.json out.png --image portrait.png --mode both
    character charx-pack card.json out.charx assets/avatar/body.vrm=./body.vrm
    character charx-unpack in.charx ./unpacked

## Core (crates/character)

- No dependencies. The wasm surface is `extern "C"` over linear memory:
  `cc_alloc`, `cc_free`, one call per operation returning 0 or 1, the
  result or the error message at `cc_out_ptr` and `cc_out_len`. No
  bindgen, no threads, so it loads from file:// as bytes or inlined
  base64. `wasm/character.wasm` is 184 721 bytes (measured, opt-level s,
  stripped, rustc 1.92). Rebuild with `npm run build:wasm -w
  @hackbuild/character`.

## What is verified, and what is not

### Verified on this machine

- 2026-11-22: `cargo test -p hackbuild-character` passes, 27 tests (23
  unit, 2 parity, 2 CLI end to end) with rustc 1.95 native; `cargo fmt
  --check` and `cargo clippy --workspace --all-targets -D warnings` pass,
  and clippy passes for wasm32 with rustc 1.92.
- 2026-11-22: `npx vitest run packages/character` passes, 46 tests, in
  Node 22.18.0.
- 2026-11-22: native and wasm parity: the wasm build gives the same bytes
  as the native build for all 35 cases in `crates/character/tests/parity.json`
  (read, upgrade, downgrade, validate, migrate on V1, V2 and V3 fixtures;
  PNG writes in three modes; CHARX writes with and without refs; a CHARX
  with a deflated entry; error cases).
- The inflater against Node's zlib (fixed and dynamic Huffman blocks).
- Card fixtures are written for this repository (CC0); no third party
  character content is used.

### Not verified by anything

- Cards and CHARX files written by other tools; only fixtures made here
  and Node zlib streams were read.
- Other card readers opening the PNG and CHARX files this package writes.
- Loading from file:// in a real page.
- Speed on large archives (a VRM of tens of MB inside a CHARX); no timing
  was taken.

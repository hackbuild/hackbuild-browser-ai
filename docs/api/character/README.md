# @hackbuild/character

## Classes

### CharacterCore

The card operations. Every method is synchronous once the core is loaded.

#### Constructors

##### Constructor

```ts
new CharacterCore(x): CharacterCore;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |

###### Returns

[`CharacterCore`](#charactercore)

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-profileversion"></a> `profileVersion` | `readonly` | `number` | The profile extension version this core writes. |

#### Methods

##### blankPng()

```ts
blankPng(
   w, 
   h, 
   rgb?
): Uint8Array;
```

A one colour RGB PNG, `rgb` as 0xRRGGBB.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `w` | `number` | `undefined` |
| `h` | `number` | `undefined` |
| `rgb?` | `number` | `0xc8c8c4` |

###### Returns

`Uint8Array`

##### downgrade()

```ts
downgrade(card): Card & object;
```

Any card to V2; V3 only fields are dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`CardInput`](#cardinput) |

###### Returns

[`Card`](#card) & `object`

##### entry()

```ts
entry(charx, path): Uint8Array;
```

One file from a CHARX archive.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `charx` | `Uint8Array` |
| `path` | `string` |

###### Returns

`Uint8Array`

##### migrate()

```ts
migrate(card, o?): object;
```

Bring the profile extension to the current version; `create` adds a default one.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`CardInput`](#cardinput) |
| `o?` | \{ `create?`: `boolean`; \} |
| `o.create?` | `boolean` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `card` | [`Card`](#card) |
| `notes` | `string`[] |

##### migrateProfile()

```ts
migrateProfile(profile): object;
```

A bare profile object to the current version, with notes for every change.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `profile` | `unknown` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `notes` | `string`[] |
| `profile` | [`Profile`](#profile) |

##### raw()

```ts
raw(
   op, 
   a, 
   b?, 
   n?
): object;
```

One raw operation on bytes, as the parity fixture records them.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `op` | [`RawOp`](#rawop) | `undefined` |
| `a` | `Uint8Array` | `undefined` |
| `b?` | `Uint8Array` | `...` |
| `n?` | `number` | `0` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `code` | `number` |
| `out` | `Uint8Array` |

##### read()

```ts
read(bytes): ReadResult;
```

Read a card from PNG, CHARX or JSON bytes; the format is detected from the bytes.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bytes` | `Uint8Array` |

###### Returns

[`ReadResult`](#readresult)

##### upgrade()

```ts
upgrade(card): Card & object;
```

Any card (V1, V2, V3) to V3, normalized.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`CardInput`](#cardinput) |

###### Returns

[`Card`](#card) & `object`

##### validate()

```ts
validate(card): string[];
```

Problems with a card as written, each prefixed by its path. Empty when valid.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`CardInput`](#cardinput) |

###### Returns

`string`[]

##### writeCharx()

```ts
writeCharx(
   card, 
   assets?, 
   o?
): Uint8Array;
```

A CHARX archive: card.json as V3, then the assets, all stored. With
`refs` (default), assets the card does not list get `data.assets`
records typed from their `assets/<type>/` folder.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `card` | [`CardInput`](#cardinput) | `undefined` |
| `assets?` | readonly [`CharxAsset`](#charxasset)[] | `[]` |
| `o?` | \{ `refs?`: `boolean`; \} | `{}` |
| `o.refs?` | `boolean` | `undefined` |

###### Returns

`Uint8Array`

##### writePng()

```ts
writePng(card, o?): Uint8Array;
```

The card in a PNG: `chara` (V2) and `ccv3` (V3) text chunks by
default, before IEND, replacing old card chunks. Without an image a
plain 64 by 64 PNG is used.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`CardInput`](#cardinput) |
| `o?` | \{ `image?`: `Uint8Array`\<`ArrayBufferLike`\>; `mode?`: `"both"` \| `"v3"` \| `"v2"`; \} |
| `o.image?` | `Uint8Array`\<`ArrayBufferLike`\> |
| `o.mode?` | `"both"` \| `"v3"` \| `"v2"` |

###### Returns

`Uint8Array`

***

### CharacterError

The error every failed core call and a failed wasm fetch throw, carrying the core's message.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new CharacterError(message): CharacterError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |

###### Returns

[`CharacterError`](#charactererror)

###### Overrides

`Error.constructor`

## Interfaces

### CardAsset

One entry of a V3 card's `assets` list: its type, where it lives, a name and a file extension.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-ext"></a> `ext` | `string` | - |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-type"></a> `type` | `string` | icon, background, user_icon, emotion, or x_ followed by a custom name. |
| <a id="property-uri"></a> `uri` | `string` | `embeded://path` inside a CHARX, `ccdefault:`, a URL or a data URL. |

***

### CardDataV2

The `data` object of a V2 card: name, persona text, greetings, lorebook, tags and extensions.

#### Extended by

- [`CardDataV3`](#carddatav3)

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-alternate_greetings"></a> `alternate_greetings` | `string`[] |
| <a id="property-character_book"></a> `character_book?` | [`CharacterBook`](#characterbook) |
| <a id="property-character_version"></a> `character_version` | `string` |
| <a id="property-creator"></a> `creator` | `string` |
| <a id="property-creator_notes"></a> `creator_notes` | `string` |
| <a id="property-description"></a> `description` | `string` |
| <a id="property-extensions"></a> `extensions` | `Record`\<`string`, `unknown`\> & `object` |
| <a id="property-first_mes"></a> `first_mes` | `string` |
| <a id="property-mes_example"></a> `mes_example` | `string` |
| <a id="property-name-1"></a> `name` | `string` |
| <a id="property-personality"></a> `personality` | `string` |
| <a id="property-post_history_instructions"></a> `post_history_instructions` | `string` |
| <a id="property-scenario"></a> `scenario` | `string` |
| <a id="property-system_prompt"></a> `system_prompt` | `string` |
| <a id="property-tags"></a> `tags` | `string`[] |

***

### CardDataV3

The `data` object of a V3 card: the V2 fields plus group greetings, assets, nickname, sources and dates.

#### Extends

- [`CardDataV2`](#carddatav2)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-alternate_greetings-1"></a> `alternate_greetings` | `string`[] | - | [`CardDataV2`](#carddatav2).[`alternate_greetings`](#property-alternate_greetings) |
| <a id="property-assets"></a> `assets?` | [`CardAsset`](#cardasset)[] | - | - |
| <a id="property-character_book-1"></a> `character_book?` | [`CharacterBook`](#characterbook) | - | [`CardDataV2`](#carddatav2).[`character_book`](#property-character_book) |
| <a id="property-character_version-1"></a> `character_version` | `string` | - | [`CardDataV2`](#carddatav2).[`character_version`](#property-character_version) |
| <a id="property-creation_date"></a> `creation_date?` | `number` | Unix seconds. | - |
| <a id="property-creator-1"></a> `creator` | `string` | - | [`CardDataV2`](#carddatav2).[`creator`](#property-creator) |
| <a id="property-creator_notes-1"></a> `creator_notes` | `string` | - | [`CardDataV2`](#carddatav2).[`creator_notes`](#property-creator_notes) |
| <a id="property-creator_notes_multilingual"></a> `creator_notes_multilingual?` | `Record`\<`string`, `string`\> | - | - |
| <a id="property-description-1"></a> `description` | `string` | - | [`CardDataV2`](#carddatav2).[`description`](#property-description) |
| <a id="property-extensions-1"></a> `extensions` | `Record`\<`string`, `unknown`\> & `object` | - | [`CardDataV2`](#carddatav2).[`extensions`](#property-extensions) |
| <a id="property-first_mes-1"></a> `first_mes` | `string` | - | [`CardDataV2`](#carddatav2).[`first_mes`](#property-first_mes) |
| <a id="property-group_only_greetings"></a> `group_only_greetings` | `string`[] | - | - |
| <a id="property-mes_example-1"></a> `mes_example` | `string` | - | [`CardDataV2`](#carddatav2).[`mes_example`](#property-mes_example) |
| <a id="property-modification_date"></a> `modification_date?` | `number` | - | - |
| <a id="property-name-2"></a> `name` | `string` | - | [`CardDataV2`](#carddatav2).[`name`](#property-name-1) |
| <a id="property-nickname"></a> `nickname?` | `string` | - | - |
| <a id="property-personality-1"></a> `personality` | `string` | - | [`CardDataV2`](#carddatav2).[`personality`](#property-personality) |
| <a id="property-post_history_instructions-1"></a> `post_history_instructions` | `string` | - | [`CardDataV2`](#carddatav2).[`post_history_instructions`](#property-post_history_instructions) |
| <a id="property-scenario-1"></a> `scenario` | `string` | - | [`CardDataV2`](#carddatav2).[`scenario`](#property-scenario) |
| <a id="property-source"></a> `source?` | `string`[] | - | - |
| <a id="property-system_prompt-1"></a> `system_prompt` | `string` | - | [`CardDataV2`](#carddatav2).[`system_prompt`](#property-system_prompt) |
| <a id="property-tags-1"></a> `tags` | `string`[] | - | [`CardDataV2`](#carddatav2).[`tags`](#property-tags) |

***

### CardV2

A Character Card V2, `spec` set to `chara_card_v2`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data"></a> `data` | [`CardDataV2`](#carddatav2) |
| <a id="property-spec"></a> `spec` | `"chara_card_v2"` |
| <a id="property-spec_version"></a> `spec_version` | `"2.0"` |

***

### CardV3

A Character Card V3, `spec` set to `chara_card_v3` and `spec_version` 3.0.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-1"></a> `data` | [`CardDataV3`](#carddatav3) |
| <a id="property-spec-1"></a> `spec` | `"chara_card_v3"` |
| <a id="property-spec_version-1"></a> `spec_version` | `"3.0"` |

***

### CharacterBook

A lorebook: its entries plus optional scan depth, token budget and recursion settings.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-description-2"></a> `description?` | `string` |
| <a id="property-entries"></a> `entries` | [`LoreEntry`](#loreentry)[] |
| <a id="property-extensions-2"></a> `extensions` | `Record`\<`string`, `unknown`\> |
| <a id="property-name-3"></a> `name?` | `string` |
| <a id="property-recursive_scanning"></a> `recursive_scanning?` | `boolean` |
| <a id="property-scan_depth"></a> `scan_depth?` | `number` |
| <a id="property-token_budget"></a> `token_budget?` | `number` |

***

### CharxAsset

A file to put in a CHARX archive: its path inside the archive and its bytes.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bytes"></a> `bytes` | `Uint8Array` | - |
| <a id="property-path"></a> `path` | `string` | Path inside the archive, e.g. "assets/avatar/body.vrm". |

***

### Lock

A lock record: PBKDF2 SHA-256 settings and a verifier, base64 fields.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-algo"></a> `algo` | `"pbkdf2-sha256"` |
| <a id="property-hash"></a> `hash` | `string` |
| <a id="property-iterations"></a> `iterations` | `number` |
| <a id="property-salt"></a> `salt` | `string` |

***

### LoreEntry

One lorebook entry: the keys that activate it, the text it adds, and its ordering and matching settings.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-case_sensitive"></a> `case_sensitive?` | `boolean` | - |
| <a id="property-comment"></a> `comment?` | `string` | - |
| <a id="property-constant"></a> `constant?` | `boolean` | - |
| <a id="property-content"></a> `content` | `string` | - |
| <a id="property-enabled"></a> `enabled` | `boolean` | - |
| <a id="property-extensions-3"></a> `extensions` | `Record`\<`string`, `unknown`\> | - |
| <a id="property-id"></a> `id?` | `string` \| `number` | - |
| <a id="property-insertion_order"></a> `insertion_order` | `number` | - |
| <a id="property-keys"></a> `keys` | `string`[] | - |
| <a id="property-name-4"></a> `name?` | `string` | - |
| <a id="property-position"></a> `position?` | `"before_char"` \| `"after_char"` | - |
| <a id="property-priority"></a> `priority?` | `number` | - |
| <a id="property-secondary_keys"></a> `secondary_keys?` | `string`[] | - |
| <a id="property-selective"></a> `selective?` | `boolean` | - |
| <a id="property-use_regex"></a> `use_regex?` | `boolean` | V3: keys are regular expressions, written as `/source/flags` or bare. |

***

### LoreOptions

Options for `activeLore`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-budgetchars"></a> `budgetChars?` | `number` | Stop adding entries once their content passes this many characters. |

***

### Profile

What a card needs to drive a body and a voice. Version 1.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-actions"></a> `actions` | `object` | Action vocabulary, names the avatar can realize. |
| `actions.aliases` | `Record`\<`string`, `string`\> | - |
| `actions.gestures` | `string`[] | - |
| `actions.moods` | `string`[] | - |
| `actions.postures` | `string`[] | - |
| <a id="property-avatar"></a> `avatar` | `object` | - |
| `avatar.asset` | `string` | A CHARX asset path when the body ships inside the archive. |
| `avatar.expressions` | `Record`\<`string`, `string`\> | Mood name to the avatar's expression or morph name. |
| `avatar.kind` | [`AvatarKind`](#avatarkind) | - |
| `avatar.uri` | `string` | A URL or an `embeded://` CHARX path. |
| `avatar.wardrobe` | `Record`\<`string`, `boolean`\> | Wardrobe part name to shown or hidden. |
| <a id="property-behavior"></a> `behavior` | `object` | - |
| `behavior.ambientGestures` | `boolean` | - |
| `behavior.blink` | `boolean` | - |
| `behavior.breath` | `boolean` | - |
| `behavior.gaze` | `boolean` | - |
| `behavior.idle` | `boolean` | - |
| <a id="property-lock"></a> `lock?` | [`Lock`](#lock) | Present only on a locked character: the password verifier its sealed memory and files open with. Made by makeLock in "@hackbuild/memory/seal". Holds no password. There is no recovery. |
| <a id="property-memory"></a> `memory` | `object` | - |
| `memory.enabled` | `boolean` | - |
| <a id="property-version"></a> `version` | `number` | - |
| <a id="property-voice"></a> `voice` | `object` | - |
| `voice.cloneRef` | `string` | A reference clip the caller supplies (CHARX path or URL). Never bundled by this package. |
| `voice.engine` | `string` | Speech engine id, for example "kokoro", "pocket" or "system". |
| `voice.pitch` | `number` | 0 to 2. |
| `voice.rate` | `number` | 0.25 to 4. |
| `voice.voiceId` | `string` | - |

***

### ReadResult

What `CharacterCore.read` returns: the detected format, where the card came from, its spec, the card as stored and the CHARX files beside it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-assets-1"></a> `assets` | `object`[] | CHARX files other than card.json. |
| <a id="property-card"></a> `card` | `Record`\<`string`, `unknown`\> | As stored; call `upgrade` for V3. |
| <a id="property-format"></a> `format` | `"png"` \| `"charx"` \| `"json"` | - |
| <a id="property-source-1"></a> `source` | `string` | "ccv3" or "chara" for PNG, "card.json" for CHARX, "json". |
| <a id="property-spec-2"></a> `spec` | `"chara_card_v2"` \| `"chara_card_v3"` \| `"v1"` \| `"unknown"` | - |

## Type Aliases

### AvatarKind

```ts
type AvatarKind = "vrm" | "glb" | "fbx" | "mmd" | "live2d";
```

The avatar file kinds a profile can name: vrm, glb, fbx, mmd or live2d.

***

### Card

```ts
type Card = CardV2 | CardV3;
```

A V2 or V3 card.

***

### CardInput

```ts
type CardInput = Card | Record<string, unknown> | Uint8Array;
```

A card as an object, or card bytes (PNG, CHARX or JSON).

***

### CoreSource

```ts
type CoreSource = 
  | {
  url: string | URL;
}
  | {
  bytes: ArrayBuffer | Uint8Array;
}
  | {
  base64: string;
};
```

Where `loadCharacterCore` gets the wasm: a URL to fetch, bytes, or a base64 string such as `CHARACTER_WASM_BASE64`.

***

### RawOp

```ts
type RawOp = 
  | "read"
  | "entry"
  | "upgrade"
  | "downgrade"
  | "validate"
  | "migrate"
  | "migrate_profile"
  | "write_png"
  | "write_charx";
```

Names of the raw operations, as the parity fixture spells them.

## Functions

### activeLore()

```ts
function activeLore(
   book, 
   text, 
   o?
): LoreEntry[];
```

Entries a passage of recent chat activates: enabled entries that are
constant or whose keys appear (substring, or regex when use_regex),
and for selective entries also a secondary key. Ordered by
insertion_order, then by priority, highest first, for ties.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `book` | [`CharacterBook`](#characterbook) \| `undefined` |
| `text` | `string` |
| `o?` | [`LoreOptions`](#loreoptions) |

#### Returns

[`LoreEntry`](#loreentry)[]

***

### fillMacros()

```ts
function fillMacros(text, names): string;
```

Replace \{\{char\}\} and \{\{user\}\} (any case) and the older \<BOT\> and \<USER\>.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `names` | \{ `char`: `string`; `user`: `string`; \} |
| `names.char` | `string` |
| `names.user` | `string` |

#### Returns

`string`

***

### loadCharacterCore()

```ts
function loadCharacterCore(src): Promise<CharacterCore>;
```

Fetch or decode the character wasm, instantiate it and return a `CharacterCore`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`CoreSource`](#coresource) |

#### Returns

`Promise`\<[`CharacterCore`](#charactercore)\>

***

### packAssets()

```ts
function packAssets(assets): Uint8Array;
```

The pack format the core reads: per file a u32 LE name length, name, u32 LE data length, data.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `assets` | readonly [`CharxAsset`](#charxasset)[] |

#### Returns

`Uint8Array`

***

### profileOf()

```ts
function profileOf(card): Profile | null;
```

The profile extension as stored, or null. Run `migrate` before trusting its shape.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `card` | [`Card`](#card) \| `Record`\<`string`, `unknown`\> |

#### Returns

[`Profile`](#profile) \| `null`

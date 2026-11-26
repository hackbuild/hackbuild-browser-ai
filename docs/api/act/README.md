# @hackbuild/act

## Interfaces

### ActBinding

What `bindActs` returns: the lists for `buildVocabulary`, the clips behind each name, the loops and the clips kept out of replies.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-acts"></a> `acts` | `Required`\<[`AvatarActs`](#avataracts)\> | Lists for `buildVocabulary`. |
| <a id="property-all"></a> `all` | [`BoundClip`](#boundclip)[] | Every clip with its class. |
| <a id="property-clips"></a> `clips` | `Record`\<`string`, [`BoundClip`](#boundclip)[]\> | Lowercase vocabulary name to the clips that realize it. |
| <a id="property-loops"></a> `loops` | `object` | Loops: idle and talk clips. |
| `loops.idle` | [`BoundClip`](#boundclip)[] | - |
| `loops.talk` | [`BoundClip`](#boundclip)[] | - |
| <a id="property-manual"></a> `manual` | [`BoundClip`](#boundclip)[] | Clips kept out of replies (locomotion, action, odd). |

***

### ActVocabulary

The moods, gestures and postures one avatar can realize, with an alias table from other words to those names.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-aliases"></a> `aliases` | `Record`\<`string`, `string`\> | Lowercase word or phrase to a name in one of the three lists. |
| <a id="property-gestures"></a> `gestures` | `string`[] | - |
| <a id="property-moods"></a> `moods` | `string`[] | - |
| <a id="property-postures"></a> `postures` | `string`[] | - |

***

### AvatarActs

What an avatar can realize: expression presets, gesture clips and posture clips.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-expressions"></a> `expressions?` | readonly `string`[] |
| <a id="property-gestures-1"></a> `gestures?` | readonly `string`[] |
| <a id="property-postures-1"></a> `postures?` | readonly `string`[] |

***

### BindOptions

Options for `bindActs`: names per kind, clip rules and extra word buckets.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-buckets"></a> `buckets?` | `Readonly`\<`Record`\<`string`, readonly `string`[]\>\> | Extra word buckets (for instance `OPTIONAL_BUCKETS`). |
| <a id="property-max"></a> `max?` | `number` | Names per kind shown to the model. Default 14. |
| <a id="property-rules"></a> `rules?` | readonly [`ClipRule`](#cliprule)[] | - |

***

### BoundClip

A clip after binding: its class, the word buckets it sits in, and the label the model sees.

#### Extends

- [`ClipInfo`](#clipinfo)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-buckets-1"></a> `buckets` | `string`[] | Word table buckets this clip is placed in. | - |
| <a id="property-cls"></a> `cls` | [`ClipClass`](#clipclass) | - | - |
| <a id="property-description"></a> `description?` | `string` | Description, when the library has one; used for matching. | [`ClipInfo`](#clipinfo).[`description`](#property-description-1) |
| <a id="property-folder"></a> `folder?` | `string` | - | [`ClipInfo`](#clipinfo).[`folder`](#property-folder-1) |
| <a id="property-id"></a> `id` | `string` | Unique id the app maps back to a file or a clip. | [`ClipInfo`](#clipinfo).[`id`](#property-id-1) |
| <a id="property-label"></a> `label` | `string` | The name shown to the model for it. | - |
| <a id="property-name"></a> `name` | `string` | - | [`ClipInfo`](#clipinfo).[`name`](#property-name-1) |
| <a id="property-pose"></a> `pose?` | `boolean` | A single held pose rather than a moving clip. | [`ClipInfo`](#clipinfo).[`pose`](#property-pose-1) |
| <a id="property-tags"></a> `tags?` | readonly `string`[] | Motion analysis tags, such as "walk" or "nod". | [`ClipInfo`](#clipinfo).[`tags`](#property-tags-1) |
| <a id="property-usertags"></a> `userTags?` | readonly `string`[] | Tags a person set; a class name here wins. | [`ClipInfo`](#clipinfo).[`userTags`](#property-usertags-1) |

***

### ClipInfo

One clip of an avatar's library as the app describes it: id, name, folder, description and tags.

#### Extended by

- [`BoundClip`](#boundclip)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-description-1"></a> `description?` | `string` | Description, when the library has one; used for matching. |
| <a id="property-folder-1"></a> `folder?` | `string` | - |
| <a id="property-id-1"></a> `id` | `string` | Unique id the app maps back to a file or a clip. |
| <a id="property-name-1"></a> `name` | `string` | - |
| <a id="property-pose-1"></a> `pose?` | `boolean` | A single held pose rather than a moving clip. |
| <a id="property-tags-1"></a> `tags?` | readonly `string`[] | Motion analysis tags, such as "walk" or "nod". |
| <a id="property-usertags-1"></a> `userTags?` | readonly `string`[] | Tags a person set; a class name here wins. |

***

### ClipRule

A rule that puts a clip in a class when its folder and name match the pattern.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cls-1"></a> `cls` | [`ClipClass`](#clipclass) | - |
| <a id="property-re"></a> `re` | `RegExp` | Tested against "folder name" in lowercase words. |

***

### Cue

An act placed at an offset of the visible text, with the tag or sentence it came from.

#### Extended by

- [`FiredCue`](#firedcue)
- [`Suppressed`](#suppressed)

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-at"></a> `at` | `number` | Offset in the visible text. |
| <a id="property-kind"></a> `kind` | [`ActKind`](#actkind) | - |
| <a id="property-name-2"></a> `name` | `string` | - |
| <a id="property-raw"></a> `raw` | `string` | The tag as written, or the sentence it was inferred from. |
| <a id="property-source"></a> `source` | `"json"` \| `"tag"` \| `"infer"` \| `"replay"` | - |

***

### Director

Reads a streamed reply, returns the visible text for speech and fires each cue when speech reaches its offset.

#### Methods

##### begin()

```ts
begin(): void;
```

Start a new reply. Mood, posture and the gesture cooldown carry over.

###### Returns

`void`

##### feed()

```ts
feed(chunk): object;
```

Feed raw model text. Returns the visible text for speech and the cues placed in this chunk.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `chunk` | `string` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cues` | [`Cue`](#cue)[] |
| `text` | `string` |

##### finish()

```ts
finish(): object;
```

End of the reply stream.

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cues` | [`Cue`](#cue)[] |
| `text` | `string` |

##### json()

```ts
json(obj): object;
```

A JSON style reply: cues at offset 0 of the say text.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `obj` | `unknown` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cues` | [`Cue`](#cue)[] |
| `say` | `string` |

##### mood()

```ts
mood(): 
  | {
  name: string;
  weight: number;
}
  | null;
```

The current mood and its weight, or null when it has decayed.

###### Returns

  \| \{
  `name`: `string`;
  `weight`: `number`;
\}
  \| `null`

##### pending()

```ts
pending(): readonly Cue[];
```

Cues waiting for the voice.

###### Returns

readonly [`Cue`](#cue)[]

##### posture()

```ts
posture(): string | null;
```

###### Returns

`string` \| `null`

##### reached()

```ts
reached(offset): FiredCue[];
```

Speech reached this offset of the visible text. Returns the cues fired now.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `offset` | `number` |

###### Returns

[`FiredCue`](#firedcue)[]

##### record()

```ts
record(): ReplayRecord;
```

Cues that fired in this reply, for replaying the reply later.

###### Returns

[`ReplayRecord`](#replayrecord)

##### settle()

```ts
settle(): Promise<void>;
```

Wait for cues still being resolved or inferred by the embedder.

###### Returns

`Promise`\<`void`\>

***

### DirectorOptions

Options for `createDirector`: the vocabulary, the mode, the fire callback, an optional embedder and the timing settings.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-embedder"></a> `embedder?` | `Embedder` | Optional embedder for the resolver (floor 0.55) and the inferrer (floor 0.32, margin 0.07). |
| <a id="property-fire"></a> `fire` | (`cue`) => `void` | - |
| <a id="property-gesturecooldownms"></a> `gestureCooldownMs?` | `number` | Default 2500 ms (inferred, not measured). |
| <a id="property-inferrer"></a> `inferrer?` | [`Inferrer`](#inferrer) | - |
| <a id="property-mode"></a> `mode?` | `"tags"` \| `"hybrid"` \| `"off"` | "tags": explicit tags only. "hybrid": tags plus inference for untagged sentences. "off": strip tags, fire nothing. |
| <a id="property-mooddecayms"></a> `moodDecayMs?` | `number` | Time constant of the mood decay. Default 12000 ms (inferred). |
| <a id="property-moodfloor"></a> `moodFloor?` | `number` | A mood under this weight counts as gone. Default 0.15. |
| <a id="property-now"></a> `now?` | () => `number` | Clock in ms. Default Date.now. |
| <a id="property-onsuppressed"></a> `onSuppressed?` | (`cue`) => `void` | - |
| <a id="property-resolver"></a> `resolver?` | [`Resolver`](#resolver) | - |
| <a id="property-vocab"></a> `vocab` | [`ActVocabulary`](#actvocabulary) | - |

***

### FiredCue

A cue that fired, with the clock time in ms.

#### Extends

- [`Cue`](#cue)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-at-1"></a> `at` | `number` | Offset in the visible text. | [`Cue`](#cue).[`at`](#property-at) |
| <a id="property-kind-1"></a> `kind` | [`ActKind`](#actkind) | - | [`Cue`](#cue).[`kind`](#property-kind) |
| <a id="property-name-3"></a> `name` | `string` | - | [`Cue`](#cue).[`name`](#property-name-2) |
| <a id="property-raw-1"></a> `raw` | `string` | The tag as written, or the sentence it was inferred from. | [`Cue`](#cue).[`raw`](#property-raw) |
| <a id="property-source-1"></a> `source` | `"json"` \| `"tag"` \| `"infer"` \| `"replay"` | - | [`Cue`](#cue).[`source`](#property-source) |
| <a id="property-t"></a> `t` | `number` | Clock time it fired, ms. | - |

***

### Inferred

A mood or gesture inferred from an untagged sentence, with its score and the step that found it.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-kind-2"></a> `kind` | `"mood"` \| `"gesture"` |
| <a id="property-name-4"></a> `name` | `string` |
| <a id="property-score"></a> `score` | `number` |
| <a id="property-via"></a> `via` | `"embed"` \| `"keyword"` |

***

### Inferrer

Infers a mood or gesture from a sentence, by keywords and then by embedding.

#### Methods

##### infer()

```ts
infer(sentence): Promise<Inferred | null>;
```

Keyword step, then the embedding step.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `sentence` | `string` |

###### Returns

`Promise`\<[`Inferred`](#inferred) \| `null`\>

##### keyword()

```ts
keyword(sentence): Inferred | null;
```

Keyword step only.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `sentence` | `string` |

###### Returns

[`Inferred`](#inferred) \| `null`

***

### InferrerOptions

Options for `createInferrer`: keyword tables, weak phrases and words, and the embedding floor and margin.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-embedder-1"></a> `embedder?` | `Embedder` | - |
| <a id="property-floor"></a> `floor?` | `number` | Embedding floor. Default 0.32. |
| <a id="property-keywords"></a> `keywords?` | `Record`\<`string`, readonly `string`[]\> | - |
| <a id="property-margin"></a> `margin?` | `number` | Margin over the runner up. Default 0.07. |
| <a id="property-weak"></a> `weak?` | readonly `string`[] | - |
| <a id="property-weakwords"></a> `weakWords?` | readonly `string`[] | Single words skipped by the keyword step. Default `WEAK_WORDS`. |

***

### PromptOptions

Options for `promptBlock`: the reply style and how many names of each kind to list.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-max-1"></a> `max?` | `object` | Names listed per kind at most. Defaults 10 moods, 14 gestures, 6 postures. |
| `max.gestures?` | `number` | - |
| `max.moods?` | `number` | - |
| `max.postures?` | `number` | - |
| <a id="property-style"></a> `style?` | `"tags"` \| `"json"` | "tags": [name] inline in speech. "json": a say field plus mood, gesture, posture. |

***

### ReplayRecord

The cues that fired in one reply, by offset, for `replay`.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-cues"></a> `cues` | `object`[] |

***

### Resolved

A name resolved to the vocabulary: its kind, the avatar's name, and the step that found it.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-kind-3"></a> `kind` | [`ActKind`](#actkind) | - |
| <a id="property-name-5"></a> `name` | `string` | - |
| <a id="property-via-1"></a> `via` | `"exact"` \| `"alias"` \| `"words"` \| `"embed"` | How it resolved. |

***

### Resolver

Resolves a name a model wrote to a vocabulary name, lexically or with the embedding step.

#### Methods

##### resolve()

```ts
resolve(name, kind?): Resolved | null;
```

Lexical steps only; synchronous.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `kind?` | [`ActKind`](#actkind) \| `null` |

###### Returns

[`Resolved`](#resolved) \| `null`

##### resolveAsync()

```ts
resolveAsync(name, kind?): Promise<Resolved | null>;
```

Lexical steps, then the embedding step when an embedder was given.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `kind?` | [`ActKind`](#actkind) \| `null` |

###### Returns

`Promise`\<[`Resolved`](#resolved) \| `null`\>

***

### ResolverOptions

Options for `createResolver`: an optional embedder and its cosine floor.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-embedder-2"></a> `embedder?` | `Embedder` | - |
| <a id="property-floor-1"></a> `floor?` | `number` | Cosine floor for the embedding step. Default 0.55. |

***

### Suppressed

A cue that did not fire because it repeated the current mood or posture, or fell inside the gesture cooldown.

#### Extends

- [`Cue`](#cue)

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-at-2"></a> `at` | `number` | Offset in the visible text. | [`Cue`](#cue).[`at`](#property-at) |
| <a id="property-kind-4"></a> `kind` | [`ActKind`](#actkind) | - | [`Cue`](#cue).[`kind`](#property-kind) |
| <a id="property-name-6"></a> `name` | `string` | - | [`Cue`](#cue).[`name`](#property-name-2) |
| <a id="property-raw-2"></a> `raw` | `string` | The tag as written, or the sentence it was inferred from. | [`Cue`](#cue).[`raw`](#property-raw) |
| <a id="property-reason"></a> `reason` | `"repeat"` \| `"cooldown"` | - | - |
| <a id="property-source-2"></a> `source` | `"json"` \| `"tag"` \| `"infer"` \| `"replay"` | - | [`Cue`](#cue).[`source`](#property-source) |

## Type Aliases

### ActKind

```ts
type ActKind = "mood" | "gesture" | "posture";
```

The three kinds of act: a mood on the face, a one shot gesture, or a posture the body holds.

***

### ClipClass

```ts
type ClipClass = 
  | "idle"
  | "talk"
  | "gesture"
  | "posture"
  | "dance"
  | "reaction"
  | "locomotion"
  | "action"
  | "odd";
```

The nine classes a clip sorts into, from idle and talk loops to clips kept for playing by hand.

***

### WordTable

```ts
type WordTable = Readonly<Record<string, readonly string[]>>;
```

Bucket name to the words that name it.

## Variables

### ACTION\_WORDS

```ts
const ACTION_WORDS: WordTable;
```

Whole body moves and stances, also explicit only.

***

### CLIP\_CLASSES

```ts
const CLIP_CLASSES: readonly ClipClass[];
```

Every clip class, in order.

***

### CLIP\_RULES

```ts
const CLIP_RULES: readonly ClipRule[];
```

The eight rules, first match wins, narrow rules first. Data: an app adds
rules in front for its own library (vendor).

***

### CUE\_CLASSES

```ts
const CUE_CLASSES: ReadonlySet<ClipClass>;
```

Classes a reply may set off on its own. Locomotion, action and odd clips stay for playing by hand.

***

### CUE\_POSE\_SECONDS

```ts
const CUE_POSE_SECONDS: 6 = 6;
```

A pose picked by a cue relaxes back after this many seconds (vendor).

***

### DEFAULT\_ALIASES

```ts
const DEFAULT_ALIASES: Readonly<Record<string, string>>;
```

Common words for the usual names: the hand table below, then every word
of the word tables (hand entries win). Only entries whose target the
avatar has are kept.

***

### DEFAULT\_KEYWORDS

```ts
const DEFAULT_KEYWORDS: Readonly<Record<string, readonly string[]>>;
```

Keywords per common name: the hand table plus the mood and gesture word tables. Only names the vocabulary has are used.

***

### EMOTION\_WORDS

```ts
const EMOTION_WORDS: WordTable;
```

Mood buckets: the words that name each of eleven moods, from happy to excited.

***

### GESTURE\_WORDS

```ts
const GESTURE_WORDS: WordTable;
```

Conversational gestures: small moves that fit a sentence, so inference may fire them.

***

### KINDS

```ts
const KINDS: readonly ActKind[];
```

The act kinds in order: mood, gesture, posture.

***

### MOOD\_RELATIVES

```ts
const MOOD_RELATIVES: Readonly<Record<string, string>>;
```

Moods with no preset on many avatars, and the near relative to show instead.

***

### MOTION\_WORDS

```ts
const MOTION_WORDS: WordTable;
```

Everything a motion can be named for: gestures, postures and actions.

***

### NAMED\_BONUS

```ts
const NAMED_BONUS: 0.15 = 0.15;
```

A clip named for the thing ("Sitting 1" for sit) beats one that only carries it as a tag by this much (vendor).

***

### OPTIONAL\_BUCKETS

```ts
const OPTIONAL_BUCKETS: WordTable;
```

Buckets left out of the defaults; the owner of an app decides whether to turn them on.

***

### POSTURE\_WORDS

```ts
const POSTURE_WORDS: WordTable;
```

Postures change how the body rests: only an explicit tag takes one, never a word in passing ("i won't lie").

***

### WEAK\_PHRASES

```ts
const WEAK_PHRASES: readonly string[];
```

Phrases removed before keyword matching: they read as feeling words but are filler.

***

### WEAK\_WORDS

```ts
const WEAK_WORDS: readonly string[];
```

Single words too common to carry a feeling or a gesture on their own
("right", "sure", "love", "show"): skipped by the keyword step. 27
words (computed), plus "please", which the light
stemmer here folds onto "pleased".

## Functions

### aliasesFrom()

```ts
function aliasesFrom(...tables): Record<string, string>;
```

Word to bucket name over several tables; the first table that holds a word wins.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`tables` | `Readonly`\<`Record`\<`string`, readonly `string`[]\>\>[] |

#### Returns

`Record`\<`string`, `string`\>

***

### bindActs()

```ts
function bindActs(input, o?): ActBinding;
```

Bind an avatar's expressions and clips to `act`. Expressions pass
through as moods. Clip names in the vocabulary are word table buckets
where a clip falls in one, else its plain label.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `input` | \{ `clips?`: readonly [`ClipInfo`](#clipinfo)[]; `expressions?`: readonly `string`[]; \} |
| `input.clips?` | readonly [`ClipInfo`](#clipinfo)[] |
| `input.expressions?` | readonly `string`[] |
| `o?` | [`BindOptions`](#bindoptions) |

#### Returns

[`ActBinding`](#actbinding)

***

### bucketOf()

```ts
function bucketOf(table, text): string | null;
```

The bucket a word or phrase names, whole words only: "across" is not "cross", "understand" is not "stand".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | [`WordTable`](#wordtable) |
| `text` | `string` |

#### Returns

`string` \| `null`

***

### bucketsOf()

```ts
function bucketsOf(table, phrases): string[];
```

Every bucket a list of phrases touches.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `table` | [`WordTable`](#wordtable) |
| `phrases` | readonly `string`[] |

#### Returns

`string`[]

***

### buildVocabulary()

```ts
function buildVocabulary(avatar, opts?): ActVocabulary;
```

Build a vocabulary from what the avatar can do. `aliases` adds to or
overrides the defaults; an alias whose target the avatar lacks is
dropped, and a missing mood falls back to its near relative when the
avatar has that relative.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `avatar` | [`AvatarActs`](#avataracts) |
| `opts?` | \{ `aliases?`: `Record`\<`string`, `string`\>; `defaults?`: `boolean`; \} |
| `opts.aliases?` | `Record`\<`string`, `string`\> |
| `opts.defaults?` | `boolean` |

#### Returns

[`ActVocabulary`](#actvocabulary)

***

### classifyClip()

```ts
function classifyClip(c, rules?): ClipClass;
```

The class of one clip.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `c` | `Pick`\<[`ClipInfo`](#clipinfo), `"name"` \| `"folder"` \| `"tags"` \| `"userTags"`\> | `undefined` |
| `rules?` | readonly [`ClipRule`](#cliprule)[] | `CLIP_RULES` |

#### Returns

[`ClipClass`](#clipclass)

***

### cosine()

```ts
function cosine(a, b): number;
```

The cosine similarity of two vectors, 0 when either is all zeros.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `Float32Array` |
| `b` | `Float32Array` |

#### Returns

`number`

***

### createDirector()

```ts
function createDirector(o): Director;
```

Make a director over a vocabulary that places cues as the reply streams and fires them as speech reports offsets.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | [`DirectorOptions`](#directoroptions) |

#### Returns

[`Director`](#director)

***

### createInferrer()

```ts
function createInferrer(v, o?): Inferrer;
```

Make an inferrer over a vocabulary's moods and gestures; postures are never inferred.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `o?` | [`InferrerOptions`](#inferreroptions) |

#### Returns

[`Inferrer`](#inferrer)

***

### createResolver()

```ts
function createResolver(v, o?): Resolver;
```

Make a resolver over a vocabulary: exact name, alias, whole word overlap, then the nearest embedding above the floor.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `o?` | [`ResolverOptions`](#resolveroptions) |

#### Returns

[`Resolver`](#resolver)

***

### cuesFromJson()

```ts
function cuesFromJson(obj): object;
```

Cues from a JSON reply in the json style: all sit at offset 0 of the say text.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `obj` | `unknown` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `names` | `object`[] |
| `say` | `string` |

***

### grammar()

```ts
function grammar(v, format): string;
```

A GBNF grammar (llama.cpp and wllama) or a JSON Schema (WebLLM XGrammar,
remote json_schema) for replies that use only this vocabulary.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `format` | `"gbnf"` \| `"json-schema"` |

#### Returns

`string`

***

### idleLoop()

```ts
function idleLoop(clips): BoundClip | null;
```

The idle loop: a standing idle clip, calm names first; null when the library has none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `clips` | readonly [`BoundClip`](#boundclip)[] |

#### Returns

[`BoundClip`](#boundclip) \| `null`

***

### kindOf()

```ts
function kindOf(v, name): ActKind | null;
```

The kind of a vocabulary name, ignoring case, or null when the avatar has no such name.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `name` | `string` |

#### Returns

[`ActKind`](#actkind) \| `null`

***

### meaningfulWords()

```ts
function meaningfulWords(s): string[];
```

Meaningful words of a name: no numbers, no format noise, no one letter fragments.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`[]

***

### namesOf()

```ts
function namesOf(v, kind): string[];
```

The vocabulary's names of one kind.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `kind` | [`ActKind`](#actkind) |

#### Returns

`string`[]

***

### nameTokens()

```ts
function nameTokens(s): string[];
```

"HairRibbon_02" to ["hair", "ribbon", "02"]; "IdleHappyWave01" to ["idle", "happy", "wave", "01"].

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`[]

***

### pickClip()

```ts
function pickClip(
   binding, 
   name, 
   sentence, 
   o
): Promise<BoundClip | null>;
```

The clip for a resolved name that best fits what was said, or null when
the avatar has no clip for it. Without an embedder the draw is from the
clips named for the thing, through the injected `rng`; with one, the
sentence picks by meaning plus the named bonus.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `binding` | [`ActBinding`](#actbinding) |
| `name` | `string` |
| `sentence` | `string` |
| `o` | \{ `buckets?`: `Readonly`\<`Record`\<`string`, readonly `string`[]\>\>; `embedder?`: `Embedder`; `rng`: () => `number`; \} |
| `o.buckets?` | `Readonly`\<`Record`\<`string`, readonly `string`[]\>\> |
| `o.embedder?` | `Embedder` |
| `o.rng` | () => `number` |

#### Returns

`Promise`\<[`BoundClip`](#boundclip) \| `null`\>

***

### promptBlock()

```ts
function promptBlock(v, o?): string;
```

The system prompt lines that tell the model which tags it may use, in the tags or json style.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |
| `o?` | [`PromptOptions`](#promptoptions) |

#### Returns

`string`

***

### replay()

```ts
function replay(
   rec, 
   fire, 
   now?
): object;
```

Replay a recorded reply: the same cues fire at the same offsets when the
reply is spoken again, with no model and no inference.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | [`ReplayRecord`](#replayrecord) |
| `fire` | (`cue`) => `void` |
| `now?` | () => `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `reached()` | (`offset`) => [`FiredCue`](#firedcue)[] |

***

### stem()

```ts
function stem(w): string;
```

Light stemmer: lowercase and strip ing, ed, es, s (and a doubled final consonant after ing or ed).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `w` | `string` |

#### Returns

`string`

***

### surfaceForms()

```ts
function surfaceForms(v): string[];
```

Every surface form (names and alias words), longest first.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `v` | [`ActVocabulary`](#actvocabulary) |

#### Returns

`string`[]

***

### talkingLoop()

```ts
function talkingLoop(clips): BoundClip | null;
```

The loop to stand in while talking: a talk clip named as a standing
idle. Storytelling and explaining clips travel or slide their feet and
seated ones wait for postures, so only those qualify; null when the
library has none.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `clips` | readonly [`BoundClip`](#boundclip)[] |

#### Returns

[`BoundClip`](#boundclip) \| `null`

***

### words()

```ts
function words(s): string[];
```

The lowercase words of a string, letters and digits, with apostrophes removed.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`string`[]

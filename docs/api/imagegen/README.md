# @hackbuild/imagegen

## Classes

### FormError

Thrown when a request does not fit the model's form; the message is the copy to show.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new FormError(message?): FormError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message?` | `string` |

###### Returns

[`FormError`](#formerror)

###### Inherited from

`Error.constructor`

##### Constructor

```ts
new FormError(message?, options?): FormError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message?` | `string` |
| `options?` | `ErrorOptions` |

###### Returns

[`FormError`](#formerror)

###### Inherited from

`Error.constructor`

#### Properties

| Property | Modifier | Type | Default value | Overrides |
| ------ | ------ | ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `readonly` | `"FormError"` | `"FormError"` | `Error.name` |

## Interfaces

### EulerPlan

The timesteps of a run and their sigmas, from [eulerPlan](#eulerplan-1).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-sigmas"></a> `sigmas` | `number`[] | One more than timesteps; the last is 0. |
| <a id="property-timesteps"></a> `timesteps` | `number`[] | - |

***

### Generated

A generated image: RGBA pixels, its size, the seed used and the milliseconds spent in each stage.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-height"></a> `height` | `number` | - |
| <a id="property-ms"></a> `ms` | `object` | - |
| `ms.text` | `number` | - |
| `ms.unet` | `number` | - |
| `ms.vae` | `number` | - |
| <a id="property-rgba"></a> `rgba` | `Uint8ClampedArray` | RGBA, ready for new ImageData(rgba, width, height). |
| <a id="property-seed"></a> `seed` | `number` | - |
| <a id="property-width"></a> `width` | `number` | - |

***

### GenerateOptions

A [generate](#generate-1) request: prompt, steps, seed, size, guidance, spacing, abort signal, the graph call wrapper and a step callback.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-guidance"></a> `guidance?` | `number` | Classifier free guidance scale. Above 1 the UNet runs twice a step, on the negative and on the prompt, and the noise is uncond + guidance * (cond - uncond). SD-Turbo takes none (default 1). |
| <a id="property-negative"></a> `negative?` | `string` | Used only when guidance is above 1; the empty prompt when absent. |
| <a id="property-now"></a> `now?` | () => `number` | - |
| <a id="property-onstep"></a> `onStep?` | (`p`) => `void` | - |
| <a id="property-prompt"></a> `prompt` | `string` | - |
| <a id="property-rng"></a> `rng?` | [`Rng`](#rng) | Replaces the seeded noise source. |
| <a id="property-run"></a> `run?` | \<`T`\>(`fn`) => `Promise`\<`T`\> | Wraps each graph call, e.g. (fn) =\> hub.run(loaded, () =\> fn(), \{ frameBudgetMs: 12 \}). |
| <a id="property-seed-1"></a> `seed?` | `number` | - |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |
| <a id="property-size"></a> `size?` | `number` | Output side in pixels, a multiple of 8. Default 512. |
| <a id="property-spacing"></a> `spacing?` | [`Spacing`](#spacing) | Timestep spacing: "trailing" for SD-Turbo (default), "leading" for SD 1.5. |
| <a id="property-steps"></a> `steps?` | `number` | SD-Turbo is distilled for 1 to 4 steps. Default 1, at most 50. |

***

### ImageForm

What the generate form shows for a model: step range, guidance, negative prompt, sizes, spacing, a note, the tokenizer and the graph names.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-graphs"></a> `graphs` | `object` | Session keys of the graphs in the loaded ort model; `textEncoder2` for SDXL. |
| `graphs.textEncoder` | `string` | - |
| `graphs.textEncoder2?` | `string` | - |
| `graphs.unet` | `string` | - |
| `graphs.vaeDecoder` | `string` | - |
| <a id="property-guidance-1"></a> `guidance` | \| \{ `default`: `number`; `max`: `number`; `min`: `number`; `step`: `number`; \} \| `null` | Classifier free guidance; null when the model takes none and the field is hidden. |
| <a id="property-negative-1"></a> `negative` | `boolean` | Show a negative prompt field. Only models run with guidance use one. |
| <a id="property-note"></a> `note` | `string` | One line under the select saying what the model is. |
| <a id="property-pipeline"></a> `pipeline?` | `"sd"` \| `"sdxl"` | "sdxl" runs `generateXl` (two encoders, pooled embeddings, time ids); "sd" (default) runs `generate`. |
| <a id="property-sizes"></a> `sizes` | `number`[] | Output sides in pixels the graphs accept, the default first. |
| <a id="property-spacing-1"></a> `spacing` | [`Spacing`](#spacing) | - |
| <a id="property-steps-1"></a> `steps` | `object` | - |
| `steps.default` | `number` | - |
| `steps.max` | `number` | - |
| `steps.min` | `number` | - |
| <a id="property-tokenizer"></a> `tokenizer` | `string` | CLIP tokenizer the caller loads, transformers.js model id. |
| <a id="property-xl"></a> `xl?` | `Partial`\<[`XlIo`](#xlio)\> | Input and output names and dtypes for the SDXL pipeline, over `XL_IO`. |

***

### ImageGenerator

An image model loaded through the hub: its record, form and sessions, `generate` with the form applied, and `release`.

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-form"></a> `form` | `readonly` | [`ImageForm`](#imageform) |
| <a id="property-loaded"></a> `loaded` | `readonly` | `Loaded`\<[`ImagegenModel`](#imagegenmodel)\> |
| <a id="property-record"></a> `record` | `readonly` | `ModelRecord` |
| <a id="property-sessions"></a> `sessions` | `readonly` | [`Sessions`](#sessions) & `object` |

#### Methods

##### generate()

```ts
generate(tokenize, o): Promise<Generated>;
```

Generate with the form's defaults filled in; fields the model does not take are dropped.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `tokenize` | [`ClipTokenize`](#cliptokenize) |
| `o` | [`FormOptions`](#formoptions) |

###### Returns

`Promise`\<[`Generated`](#generated)\>

##### release()

```ts
release(): void;
```

###### Returns

`void`

***

### ImagegenModel

What the ort provider loads, structurally: the module and sessions by graph name.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-ort"></a> `ort` | [`OrtLike`](#ortlike) |
| <a id="property-sessions-1"></a> `sessions` | `Record`\<`string`, [`SessionLike`](#sessionlike)\> |

***

### OrtLike

The part of the onnxruntime-web module [generate](#generate-1) calls: the Tensor constructor.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-tensor"></a> `Tensor` | new (`type`, `data`, `dims`) => `unknown` |

***

### SessionLike

The part of an onnxruntime-web InferenceSession [generate](#generate-1) calls: `run` with named feeds.

#### Methods

##### run()

```ts
run(feeds): Promise<Record<string, {
  data: ArrayLike<number>;
  dims?: readonly number[];
}>>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `feeds` | `Record`\<`string`, `unknown`\> |

###### Returns

`Promise`\<`Record`\<`string`, \{
  `data`: `ArrayLike`\<`number`\>;
  `dims?`: readonly `number`[];
\}\>\>

***

### Sessions

The three graphs of a Stable Diffusion export: text encoder, UNet and VAE decoder.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-textencoder"></a> `textEncoder` | [`SessionLike`](#sessionlike) |
| <a id="property-unet"></a> `unet` | [`SessionLike`](#sessionlike) |
| <a id="property-vaedecoder"></a> `vaeDecoder` | [`SessionLike`](#sessionlike) |

***

### XlIo

Input and output names and dtypes of an SDXL export; [XL\_IO](#xl_io) holds the defaults.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-hidden1"></a> `hidden1` | `string` | Hidden state output of the first encoder; the penultimate layer of 12. |
| <a id="property-hidden2"></a> `hidden2` | `string` | Hidden state output of the second encoder; the penultimate layer of 32. |
| <a id="property-io"></a> `io` | `"float32"` \| `"float16"` | Float tensor dtype at every graph edge. |
| <a id="property-pad2"></a> `pad2` | `number` | Token id the second tokenizer pads with after the end token: 0, the exclamation mark token. |
| <a id="property-pooled"></a> `pooled` | `string` | Pooled projection output of the second encoder. |
| <a id="property-timestep"></a> `timestep` | `"float32"` \| `"float16"` \| `"int64"` | UNet timestep dtype. |
| <a id="property-vaescale"></a> `vaeScale` | `number` | The SDXL VAE latent scale. |

***

### XlSessions

The four graphs of an SDXL export: two text encoders, the UNet and the VAE decoder.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-textencoder-1"></a> `textEncoder` | [`SessionLike`](#sessionlike) |
| <a id="property-textencoder2"></a> `textEncoder2` | [`SessionLike`](#sessionlike) |
| <a id="property-unet-1"></a> `unet` | [`SessionLike`](#sessionlike) |
| <a id="property-vaedecoder-1"></a> `vaeDecoder` | [`SessionLike`](#sessionlike) |

## Type Aliases

### ClipTokenize

```ts
type ClipTokenize = (prompt) => Promise<ArrayLike<number>> | ArrayLike<number>;
```

Prompt to CLIP ids, padded or cut to 77 (transformers.js AutoTokenizer for Xenova/clip-vit-base-patch16 fits).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `prompt` | `string` |

#### Returns

`Promise`\<`ArrayLike`\<`number`\>\> \| `ArrayLike`\<`number`\>

***

### FormOptions

```ts
type FormOptions = Omit<GenerateOptions, "run" | "spacing"> & object;
```

A request to [ImageGenerator.generate](#generate): the generate options without `run` and `spacing`, plus hub run options.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `runOptions?` | `RunOptions` |

***

### ImagegenRecord

```ts
type ImagegenRecord = ModelRecord & object;
```

A models hub record with the [ImageForm](#imageform) for its model.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `form` | [`ImageForm`](#imageform) |

***

### Rng

```ts
type Rng = () => number;
```

The sampler SD-Turbo is distilled for, written from the published
diffusers description: 1000 step scaled linear betas (0.00085 to
0.012), sigma = sqrt((1 - alphaBar) / alphaBar), trailing timestep
spacing, and an Euler step on epsilon. Noise comes from a seeded
mulberry32 through Box-Muller, so the same seed gives the same image on
the same runtime.

#### Returns

`number`

***

### Spacing

```ts
type Spacing = "trailing" | "leading";
```

Timestep spacing: `trailing` for SD-Turbo, `leading` for SD 1.5.

## Variables

### IMAGEGEN\_PICKER\_RECORDS

```ts
const IMAGEGEN_PICKER_RECORDS: ImagegenRecord[];
```

Listed for pickers, not registered by attachImagegen, so routing by
capability keeps SD-Turbo: SDXL-Turbo runs on `generateXl`, and the
export's input and output names are inferred from its README and the
SDXL description, not read from the graphs. `loadImagegen(hub, { id:
"sdxl-turbo" })` adds it and loads it.

***

### IMAGEGEN\_RECORDS

```ts
const IMAGEGEN_RECORDS: ImagegenRecord[];
```

The image models [attachImagegen](#attachimagegen) registers: SD-Turbo and SD 1.5, each with its licence, size and form.

***

### VAE\_SCALE

```ts
const VAE_SCALE: 0.18215 = 0.18215;
```

The latent scale of the Stable Diffusion VAE; the final latent is divided by it before decoding.

***

### XL\_IO

```ts
const XL_IO: Readonly<XlIo>;
```

SDXL defaults: fp32 edges, int64 timestep, `hidden_states.11`, `hidden_states.31`, `text_embeds`, pad 0, scale 0.13025.

## Functions

### applyForm()

```ts
function applyForm(form, o): Omit<GenerateOptions, "run">;
```

Clamp a request to what the form allows, with the form's defaults.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `form` | [`ImageForm`](#imageform) |
| `o` | `Omit`\<[`GenerateOptions`](#generateoptions), `"run"`\> |

#### Returns

`Omit`\<[`GenerateOptions`](#generateoptions), `"run"`\>

***

### attachImagegen()

```ts
function attachImagegen(hub): void;
```

Add the image records to the hub's registry.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `hub` | `Hub` |

#### Returns

`void`

***

### euler()

```ts
function euler(
   latent, 
   plan, 
   eps, 
   signal?
): Promise<Float32Array<ArrayBufferLike>>;
```

Run the Euler loop. `eps(scaled, timestep)` is the UNet: it receives the
latent divided by sqrt(sigma^2 + 1) and returns predicted noise; the
step is latent += eps * (sigmaNext - sigma).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `latent` | `Float32Array` |
| `plan` | [`EulerPlan`](#eulerplan) |
| `eps` | (`scaled`, `timestep`, `step`) => `Promise`\<`ArrayLike`\<`number`\>\> |
| `signal?` | `AbortSignal` |

#### Returns

`Promise`\<`Float32Array`\<`ArrayBufferLike`\>\>

***

### eulerPlan()

```ts
function eulerPlan(steps, spacing?): EulerPlan;
```

The timesteps and sigmas for `steps` steps with the given spacing (trailing by default).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `steps` | `number` | `undefined` |
| `spacing?` | [`Spacing`](#spacing) | `"trailing"` |

#### Returns

[`EulerPlan`](#eulerplan)

***

### floatsOf()

```ts
function floatsOf(t): Float32Array;
```

An output's floats; fp16 outputs (type "float16" or Uint16Array data) are decoded.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `t` | `Out` |

#### Returns

`Float32Array`

***

### formOf()

```ts
function formOf(rec): ImageForm | null;
```

The form for a record, or null for a record without one (a stub).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` \| `undefined` |

#### Returns

[`ImageForm`](#imageform) \| `null`

***

### fromHalf()

```ts
function fromHalf(h): Float32Array;
```

IEEE 754 half bits to float32.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | `ArrayLike`\<`number`\> |

#### Returns

`Float32Array`

***

### gaussian()

```ts
function gaussian(rng): Rng;
```

Standard normal samples by Box-Muller over a uniform source.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rng` | [`Rng`](#rng) |

#### Returns

[`Rng`](#rng)

***

### generate()

```ts
function generate(
   ort, 
   s, 
   tokenize, 
   o
): Promise<Generated>;
```

Text to image: encode the prompt, run the seeded Euler loop over the UNet, decode the latent with the VAE and return RGBA. Throws when `size` is not a multiple of 8.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ort` | [`OrtLike`](#ortlike) |
| `s` | [`Sessions`](#sessions) |
| `tokenize` | [`ClipTokenize`](#cliptokenize) |
| `o` | [`GenerateOptions`](#generateoptions) |

#### Returns

`Promise`\<[`Generated`](#generated)\>

***

### generateXl()

```ts
function generateXl(
   ort, 
   s, 
   tokenize, 
   o
): Promise<Generated>;
```

SDXL-Turbo text to image: both encoders, the joined hidden states and
pooled embedding, the seeded Euler loop with `text_embeds` and
`time_ids` on every UNet call, then the VAE. Guidance above 1 runs the
UNet on the negative too. Throws when `size` is not a multiple of 8.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ort` | [`OrtLike`](#ortlike) |
| `s` | [`XlSessions`](#xlsessions) |
| `tokenize` | [`ClipTokenize`](#cliptokenize) |
| `o` | [`GenerateOptions`](#generateoptions) & `object` |

#### Returns

`Promise`\<[`Generated`](#generated)\>

***

### leadingTimesteps()

```ts
function leadingTimesteps(
   steps, 
   train?, 
   offset?
): number[];
```

Leading spacing with an offset of 1, the Euler default SD 1.5 ships
with: 1000 // steps apart from 0, reversed, plus 1. 4 steps are 751,
501, 251, 1.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `steps` | `number` | `undefined` |
| `train?` | `number` | `1000` |
| `offset?` | `number` | `1` |

#### Returns

`number`[]

***

### loadImagegen()

```ts
function loadImagegen(
   hub, 
   what?, 
   o?
): Promise<ImageGenerator>;
```

Load an image model through the hub: a record id (`{ id: "sd-1.5" }`)
or the capability ("imagegen", which the hub routes, or sends to the
stub in stub mode). A picker record named by id (`sdxl-turbo`) is added
to the registry first. A record without a form (the stub) gets
SD-Turbo's. An SDXL form runs `generateXl` behind the same interface.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `hub` | `Hub` | `undefined` |
| `what?` | \| `Capability` \| \{ `id`: `string`; \} | `"imagegen"` |
| `o?` | `UseOptions` | `{}` |

#### Returns

`Promise`\<[`ImageGenerator`](#imagegenerator)\>

***

### loadLabel()

```ts
function loadLabel(rec): string;
```

The load button label: names the model and its download size with the size's source.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rec` | `ModelRecord` |

#### Returns

`string`

***

### mulberry32()

```ts
function mulberry32(seed): Rng;
```

mulberry32: a 32 bit seeded generator in [0, 1).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |

#### Returns

[`Rng`](#rng)

***

### padIds()

```ts
function padIds(
   ids, 
   n?, 
   pad?
): Int32Array;
```

CLIP token ids padded or cut to `n` (77), padded with `pad` or the last id.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `ids` | `ArrayLike`\<`number`\> | `undefined` |
| `n?` | `number` | `77` |
| `pad?` | `number` | `undefined` |

#### Returns

`Int32Array`

***

### padIds2()

```ts
function padIds2(ids, pad?): Int32Array;
```

CLIP ids for the second encoder: up to the first end token, then `pad` to 77.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `ids` | `ArrayLike`\<`number`\> | `undefined` |
| `pad?` | `number` | `0` |

#### Returns

`Int32Array`

***

### sessionsOf()

```ts
function sessionsOf(m, form): Sessions & object;
```

The sessions of a loaded model, by the form's graph names: three, or four with SDXL's second text encoder.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`ImagegenModel`](#imagegenmodel) |
| `form` | [`ImageForm`](#imageform) |

#### Returns

[`Sessions`](#sessions) & `object`

***

### sigmas()

```ts
function sigmas(
   n?, 
   betaStart?, 
   betaEnd?
): Float64Array;
```

Sigma for each of the 1000 training timesteps. sigmas()[999] is about 14.6146 (computed).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `n?` | `number` | `1000` |
| `betaStart?` | `number` | `0.00085` |
| `betaEnd?` | `number` | `0.012` |

#### Returns

`Float64Array`

***

### stubImagegenModel()

```ts
function stubImagegenModel(): ImagegenModel;
```

A weightless model for stub pages and tests: the text encoder returns
zeros, the UNet predicts zero noise, and the VAE returns a flat grey, so
the whole flow (stages, timing cells, history) runs with no download.

#### Returns

[`ImagegenModel`](#imagegenmodel)

***

### toHalf()

```ts
function toHalf(f): Uint16Array;
```

Float32 to IEEE 754 half bits, round to nearest even.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | `ArrayLike`\<`number`\> |

#### Returns

`Uint16Array`

***

### toRgba()

```ts
function toRgba(
   nchw, 
   w, 
   h
): Uint8ClampedArray;
```

NCHW floats in [-1, 1] to RGBA bytes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `nchw` | `ArrayLike`\<`number`\> |
| `w` | `number` |
| `h` | `number` |

#### Returns

`Uint8ClampedArray`

***

### trailingTimesteps()

```ts
function trailingTimesteps(steps, train?): number[];
```

Trailing spacing: 1 step is [999], 4 steps are [999, 749, 499, 249].

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `steps` | `number` | `undefined` |
| `train?` | `number` | `1000` |

#### Returns

`number`[]

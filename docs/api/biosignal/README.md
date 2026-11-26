# @hackbuild/biosignal

## Classes

### Biosignal

The loaded wasm core: filtering, covariances, Riemannian distance, training, cross validation and model reload. Make one with [loadBiosignal](#loadbiosignal).

#### Constructors

##### Constructor

```ts
new Biosignal(x): Biosignal;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |

###### Returns

[`Biosignal`](#biosignal)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-simd"></a> `simd` | `readonly` | `boolean` |

#### Methods

##### bandpass()

```ts
bandpass(
   x, 
   fs, 
   lo, 
   hi, 
   notch?
): Float32Array;
```

Zero phase band pass, with a notch at `notch` Hz and its harmonic when given.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `x` | `Float32Array` | `undefined` |
| `fs` | `number` | `undefined` |
| `lo` | `number` | `undefined` |
| `hi` | `number` | `undefined` |
| `notch?` | `number` | `0` |

###### Returns

`Float32Array`

##### covariance()

```ts
covariance(
   data, 
   channels, 
   samples, 
   shrink?
): Float64Array;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | `Float32Array` | `undefined` |
| `channels` | `number` | `undefined` |
| `samples` | `number` | `undefined` |
| `shrink?` | `number` | `0.08` |

###### Returns

`Float64Array`

##### crossValidate()

```ts
crossValidate(
   epochs, 
   bands, 
   fs, 
   o, 
   shrink?, 
   notch?
): number[];
```

Accuracy per fold. Folds hold whole trials by default, so windows cut
from one trial never land on both sides; the reference mean is fitted
on the training fold only. `byTrial: false` shows the leaky number.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `epochs` | readonly [`Epoch`](#epoch)[] | `undefined` |
| `bands` | readonly [`Band`](#band)[] | `undefined` |
| `fs` | `number` | `undefined` |
| `o` | [`TrainOptions`](#trainoptions) & `object` | `undefined` |
| `shrink?` | `number` | `0.08` |
| `notch?` | `number` | `0` |

###### Returns

`number`[]

##### distance()

```ts
distance(
   a, 
   b, 
   n
): number;
```

Affine invariant Riemannian distance.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `a` | `Float64Array` |
| `b` | `Float64Array` |
| `n` | `number` |

###### Returns

`number`

##### features()

```ts
features(
   epochs, 
   bands, 
   fs, 
   shrink?, 
   notch?
): Float64Array;
```

One covariance per band per epoch, flattened [epoch][band][c][c].

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `epochs` | readonly [`Epoch`](#epoch)[] | `undefined` |
| `bands` | readonly [`Band`](#band)[] | `undefined` |
| `fs` | `number` | `undefined` |
| `shrink?` | `number` | `0.08` |
| `notch?` | `number` | `0` |

###### Returns

`Float64Array`

##### load()

```ts
load(m): Classifier;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`ModelJson`](#modeljson) |

###### Returns

[`Classifier`](#classifier)

##### synth()

```ts
synth(
   seed, 
   c, 
   t, 
   fs, 
   hz, 
   trials, 
   per
): Epoch[];
```

The seeded two class fixture the parity test uses.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `seed` | `number` |
| `c` | `number` |
| `t` | `number` |
| `fs` | `number` |
| `hz` | `number` |
| `trials` | `number` |
| `per` | `number` |

###### Returns

[`Epoch`](#epoch)[]

##### tangent()

```ts
tangent(
   c, 
   invSqrtRef, 
   n
): Float64Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | `Float64Array` |
| `invSqrtRef` | `Float64Array` |
| `n` | `number` |

###### Returns

`Float64Array`

##### train()

```ts
train(
   epochs, 
   bands, 
   fs, 
   o, 
   shrink?, 
   notch?
): Classifier;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `epochs` | readonly [`Epoch`](#epoch)[] | `undefined` |
| `bands` | readonly [`Band`](#band)[] | `undefined` |
| `fs` | `number` | `undefined` |
| `o` | [`TrainOptions`](#trainoptions) | `undefined` |
| `shrink?` | `number` | `0.08` |
| `notch?` | `number` | `0` |

###### Returns

[`Classifier`](#classifier)

***

### Classifier

A trained tangent space classifier: class probabilities and the predicted class for one epoch, JSON export, and `dispose` to free it in the core.

#### Constructors

##### Constructor

```ts
new Classifier(
   bs, 
   x, 
   h, 
   bands, 
   fs, 
   shrink, 
   notch, 
   channels
): Classifier;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `bs` | [`Biosignal`](#biosignal) |
| `x` | `Exports` |
| `h` | `number` |
| `bands` | readonly [`Band`](#band)[] |
| `fs` | `number` |
| `shrink` | `number` |
| `notch` | `number` |
| `channels` | `number` |

###### Returns

[`Classifier`](#classifier)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-bands"></a> `bands` | `readonly` | readonly [`Band`](#band)[] |
| <a id="property-channels"></a> `channels` | `readonly` | `number` |
| <a id="property-fs"></a> `fs` | `readonly` | `number` |
| <a id="property-notch"></a> `notch` | `readonly` | `number` |
| <a id="property-shrink"></a> `shrink` | `readonly` | `number` |

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### predict()

```ts
predict(e): number;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | [`Epoch`](#epoch) |

###### Returns

`number`

##### proba()

```ts
proba(e): number[];
```

Class probabilities for one epoch.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `e` | [`Epoch`](#epoch) |

###### Returns

`number`[]

##### toJSON()

```ts
toJSON(): ModelJson;
```

###### Returns

[`ModelJson`](#modeljson)

## Interfaces

### Band

A frequency band in Hz; each band gets its own band pass and covariance.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-hi"></a> `hi` | `number` |
| <a id="property-lo"></a> `lo` | `number` |

***

### EegNetRunner

Where a neural model (EEGNet on tfjs in an earlier biosignal build) plugs in. Not built here.

#### Methods

##### export()?

```ts
export?(): Promise<Uint8Array<ArrayBufferLike>>;
```

###### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

##### fit()

```ts
fit(epochs, classes): Promise<void>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `epochs` | readonly [`Epoch`](#epoch)[] |
| `classes` | `number` |

###### Returns

`Promise`\<`void`\>

##### proba()

```ts
proba(epoch): Promise<number[]>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `epoch` | [`Epoch`](#epoch) |

###### Returns

`Promise`\<`number`[]\>

***

### Epoch

A window: c channels by t samples, row major.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-channels-1"></a> `channels` | `number` | - |
| <a id="property-data"></a> `data` | `Float32Array` | - |
| <a id="property-label"></a> `label` | `number` | - |
| <a id="property-samples"></a> `samples` | `number` | - |
| <a id="property-trial"></a> `trial` | `number` | Trial id; windows of one trial stay in one fold. |

***

### ModelJson

The exported model: plain JSON, loadable with `Biosignal.load`.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-bands-1"></a> `bands` | [`Band`](#band)[] | - |
| <a id="property-fs-1"></a> `fs` | `number` | Sample rate the model was trained at, Hz. |
| <a id="property-kind"></a> `kind` | `"hackbuild-biosignal-riemann"` | - |
| <a id="property-notch-1"></a> `notch` | `number` | Notch frequency, 0 for none. |
| <a id="property-shrink-1"></a> `shrink` | `number` | - |
| <a id="property-values"></a> `values` | `number`[] | - |
| <a id="property-version"></a> `version` | `1` | - |

***

### TrainOptions

Classifier settings: the class count, and L2 weight (0.05), training epochs (150) and learning rate (0.14) by default.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-classes"></a> `classes` | `number` |
| <a id="property-epochs"></a> `epochs?` | `number` |
| <a id="property-l2"></a> `l2?` | `number` |
| <a id="property-lr"></a> `lr?` | `number` |

## Type Aliases

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

Where [loadBiosignal](#loadbiosignal) gets the wasm core: a URL, the bytes, or base64 text such as `BIOSIGNAL_WASM_BASE64`.

## Functions

### epochsFromEvents()

```ts
function epochsFromEvents(
   data, 
   events, 
   samples, 
   per?, 
   step?
): Epoch[];
```

Cut windows of `samples` from continuous [c][n] data at event sample indices; one trial per event, `per` windows stepping by `step`.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `data` | readonly `Float32Array`\<`ArrayBufferLike`\>[] | `undefined` |
| `events` | readonly `object`[] | `undefined` |
| `samples` | `number` | `undefined` |
| `per?` | `number` | `1` |
| `step?` | `number` | `samples` |

#### Returns

[`Epoch`](#epoch)[]

***

### loadBiosignal()

```ts
function loadBiosignal(src): Promise<Biosignal>;
```

Instantiate the biosignal wasm core from a URL, bytes or base64 and return a [Biosignal](#biosignal). Throws on an HTTP error when fetching.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`CoreSource`](#coresource) |

#### Returns

`Promise`\<[`Biosignal`](#biosignal)\>

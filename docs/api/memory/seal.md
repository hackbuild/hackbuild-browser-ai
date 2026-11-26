# seal

## Classes

### SealError

The error sealing throws, with a `code`: wrong-password, bad-lock, bad-envelope or rejected.

#### Extends

- `Error`

#### Constructors

##### Constructor

```ts
new SealError(message, code): SealError;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `string` |
| `code` | `"wrong-password"` \| `"bad-lock"` \| `"bad-envelope"` \| `"rejected"` |

###### Returns

[`SealError`](#sealerror)

###### Overrides

`Error.constructor`

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-code"></a> `code` | `readonly` | `"wrong-password"` \| `"bad-lock"` \| `"bad-envelope"` \| `"rejected"` |

***

### SealKey

A session key. Holds a non extractable HKDF key, never the password.

#### Properties

| Property | Modifier | Type | Description |
| ------ | ------ | ------ | ------ |
| <a id="property-id"></a> `id` | `readonly` | `string` | The lock salt, which names the key in the session cache. |

## Interfaces

### SealLock

The lock record: stored beside the sealed data, safe to show.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-algo"></a> `algo` | `"pbkdf2-sha256"` | - |
| <a id="property-hash"></a> `hash` | `string` | The HKDF verifier of the master, 32 bytes, base64. |
| <a id="property-iterations"></a> `iterations` | `number` | - |
| <a id="property-salt"></a> `salt` | `string` | 16 random bytes, base64. |

## Variables

### SEAL\_ITERATIONS

```ts
const SEAL_ITERATIONS: 210000 = 210_000;
```

The default PBKDF2 SHA-256 iteration count.

***

### SEAL\_OVERHEAD

```ts
const SEAL_OVERHEAD: 48 = 48;
```

Envelope bytes added to every sealed payload: magic 4, salt 16, iv 12, tag 16.

## Functions

### cachedKey()

```ts
function cachedKey(lock): SealKey | undefined;
```

The cached session key for a lock, or undefined until deriveKey or makeLock ran.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lock` | [`SealLock`](#seallock) |

#### Returns

[`SealKey`](#sealkey) \| `undefined`

***

### deriveKey()

```ts
function deriveKey(password, lock): Promise<SealKey>;
```

The session key for a lock: derives once, checks the password and
caches the key for the page's life. A wrong password throws
SealError "wrong-password".

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `password` | `string` |
| `lock` | [`SealLock`](#seallock) |

#### Returns

`Promise`\<[`SealKey`](#sealkey)\>

***

### forgetKey()

```ts
function forgetKey(lock?): void;
```

Drop one lock's cached key, or every cached key.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `lock?` | [`SealLock`](#seallock) |

#### Returns

`void`

***

### fromBase64()

```ts
function fromBase64(s): Bytes;
```

Decodes base64 into bytes; the inverse of `toBase64`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `s` | `string` |

#### Returns

`Bytes`

***

### isSealed()

```ts
function isSealed(b): boolean;
```

True when bytes start with the envelope magic.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `Uint8Array` |

#### Returns

`boolean`

***

### makeLock()

```ts
function makeLock(password, opts?): Promise<{
  key: SealKey;
  lock: SealLock;
}>;
```

A new lock for a password and its session key, cached. Store the lock
beside the data; the password is not kept.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `password` | `string` |
| `opts?` | \{ `iterations?`: `number`; \} |
| `opts.iterations?` | `number` |

#### Returns

`Promise`\<\{
  `key`: [`SealKey`](#sealkey);
  `lock`: [`SealLock`](#seallock);
\}\>

***

### open()

```ts
function open<T>(
   key, 
   sealed, 
   context?
): Promise<T>;
```

Open a sealed JSON value.

#### Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `unknown` |

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `key` | [`SealKey`](#sealkey) | `undefined` |
| `sealed` | `Uint8Array` | `undefined` |
| `context?` | `string` | `""` |

#### Returns

`Promise`\<`T`\>

***

### openBytes()

```ts
function openBytes(
   key, 
   sealed, 
   context?
): Promise<Bytes>;
```

Open sealed bytes. A wrong key, a changed byte or another context throws SealError.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `key` | [`SealKey`](#sealkey) | `undefined` |
| `sealed` | `Uint8Array` | `undefined` |
| `context?` | `string` | `""` |

#### Returns

`Promise`\<`Bytes`\>

***

### seal()

```ts
function seal(
   key, 
   value, 
   context?
): Promise<Bytes>;
```

Seal a JSON value.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `key` | [`SealKey`](#sealkey) | `undefined` |
| `value` | `unknown` | `undefined` |
| `context?` | `string` | `""` |

#### Returns

`Promise`\<`Bytes`\>

***

### sealBytes()

```ts
function sealBytes(
   key, 
   plain, 
   context?
): Promise<Bytes>;
```

Seal bytes. Output: "HBS1", salt 16, iv 12, ciphertext and tag 16, so
it is SEAL_OVERHEAD bytes longer than the input. `context` binds the
envelope to a place (an item id, a file name); open must pass the same.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `key` | [`SealKey`](#sealkey) | `undefined` |
| `plain` | `Uint8Array` | `undefined` |
| `context?` | `string` | `""` |

#### Returns

`Promise`\<`Bytes`\>

***

### sealedSink()

```ts
function sealedSink(inner, key): MemorySink;
```

Wrap a sink so every item, vector and kv value is sealed with `key`
(from deriveKey or makeLock in "@hackbuild/memory/seal"). Each envelope
is bound to its place, so a row moved to another id does not open.
A plain row in the inner sink throws.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `inner` | [`MemorySink`](index.md#memorysink) |
| `key` | [`SealKey`](#sealkey) |

#### Returns

[`MemorySink`](index.md#memorysink)

***

### toBase64()

```ts
function toBase64(b): string;
```

Base64 without spreading the whole array onto the stack.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `b` | `Uint8Array` |

#### Returns

`string`

***

### verifyLock()

```ts
function verifyLock(password, lock): Promise<boolean>;
```

True when the password opens the lock. Constant time compare of the verifier.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `password` | `string` |
| `lock` | [`SealLock`](#seallock) |

#### Returns

`Promise`\<`boolean`\>

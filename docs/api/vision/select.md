# select

## Variables

### lassoMask

```ts
const lassoMask: (width, height, points) => Mask = polygonMask;
```

The lasso is a freehand polygon; the same rasteriser.

Lasso or polygon: every pixel whose centre lies inside the path (even odd). Under three points selects nothing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `points` | readonly `MaskPt`[] |

#### Returns

[`Mask`](index.md#mask)

## Functions

### ellipseMask()

```ts
function ellipseMask(
   width, 
   height, 
   a, 
   b
): Mask;
```

The ellipse that fills the box between two corners.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `a` | `MaskPt` |
| `b` | `MaskPt` |

#### Returns

[`Mask`](index.md#mask)

***

### floodMask()

```ts
function floodMask(
   px, 
   x, 
   y, 
   tolerance?
): Mask;
```

Flood fill: the contiguous patch of one colour under x, y, within `tolerance` percent (the wand with contiguous on, as the flood tool).

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `px` | [`Pixels`](index.md#pixels) | `undefined` |
| `x` | `number` | `undefined` |
| `y` | `number` | `undefined` |
| `tolerance?` | `number` | `0` |

#### Returns

[`Mask`](index.md#mask)

***

### polygonMask()

```ts
function polygonMask(
   width, 
   height, 
   points
): Mask;
```

Lasso or polygon: every pixel whose centre lies inside the path (even odd). Under three points selects nothing.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `points` | readonly `MaskPt`[] |

#### Returns

[`Mask`](index.md#mask)

***

### rectMask()

```ts
function rectMask(
   width, 
   height, 
   a, 
   b
): Mask;
```

The rectangle between two corners, in image pixels.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `width` | `number` |
| `height` | `number` |
| `a` | `MaskPt` |
| `b` | `MaskPt` |

#### Returns

[`Mask`](index.md#mask)

***

### wandMask()

```ts
function wandMask(
   px, 
   x, 
   y, 
   tolerance, 
   contiguous?
): Mask;
```

Magic wand: pixels within `tolerance` percent of the colour at x, y; `contiguous` (default) floods through 4 neighbours, off takes every such pixel.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `px` | [`Pixels`](index.md#pixels) | `undefined` |
| `x` | `number` | `undefined` |
| `y` | `number` | `undefined` |
| `tolerance` | `number` | `undefined` |
| `contiguous?` | `boolean` | `true` |

#### Returns

[`Mask`](index.md#mask)

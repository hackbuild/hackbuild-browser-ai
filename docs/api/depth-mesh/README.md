# @hackbuild/depth-mesh

## Classes

### DepthMesh

The loaded wasm core: depth to cloud, relief heights and solids, surface nets, silhouette carving and voxel models for ICP. Make one with [loadDepthMesh](#loaddepthmesh).

#### Constructors

##### Constructor

```ts
new DepthMesh(x): DepthMesh;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |

###### Returns

[`DepthMesh`](#depthmesh)

#### Properties

| Property | Modifier | Type |
| ------ | ------ | ------ |
| <a id="property-simd"></a> `simd` | `readonly` | `boolean` |

#### Methods

##### carve()

```ts
carve(
   masks, 
   angles, 
   t, 
   resolution?, 
   smooth?
): Mesh;
```

Space carving from turntable silhouettes (one mask per angle, nonzero inside). Vertices in object units.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `masks` | readonly `Uint8Array`\<`ArrayBufferLike`\>[] | `undefined` |
| `angles` | readonly `number`[] | `undefined` |
| `t` | [`Turntable`](#turntable) | `undefined` |
| `resolution?` | `number` | `64` |
| `smooth?` | `number` | `1` |

###### Returns

[`Mesh`](#mesh)

##### cloud()

```ts
cloud(
   depth, 
   w, 
   h, 
   o
): Cloud;
```

Depth (0 to 1, larger nearer) to a camera space cloud with normals facing the camera.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `depth` | `Float32Array` |
| `w` | `number` |
| `h` | `number` |
| `o` | [`CloudOptions`](#cloudoptions) |

###### Returns

[`Cloud`](#cloud-1)

##### healPinches()

```ts
healPinches(
   h, 
   w, 
   ht
): number;
```

Fill corner to corner pinches in place; returns how many cells were filled.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `h` | `Float32Array` |
| `w` | `number` |
| `ht` | `number` |

###### Returns

`number`

##### heightfieldMesh()

```ts
heightfieldMesh(
   h, 
   w, 
   ht, 
   px, 
   x0?, 
   y0?, 
   z0?
): Mesh;
```

Closed heightfield solid: cell size px, origin (x0, y0), on the plane z0.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `h` | `Float32Array` | `undefined` |
| `w` | `number` | `undefined` |
| `ht` | `number` | `undefined` |
| `px` | `number` | `undefined` |
| `x0?` | `number` | `0` |
| `y0?` | `number` | `0` |
| `z0?` | `number` | `0` |

###### Returns

[`Mesh`](#mesh)

##### model()

```ts
model(voxel, cap?): VoxelModel;
```

A voxel model for ICP tracking. Call `dispose` when done.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `voxel` | `number` | `undefined` |
| `cap?` | `number` | `400_000` |

###### Returns

[`VoxelModel`](#voxelmodel)

##### morphOpen()

```ts
morphOpen(
   mask, 
   w, 
   h
): Uint8Array;
```

Erode then dilate with a 3 by 3 square.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `mask` | `Uint8Array` |
| `w` | `number` |
| `h` | `number` |

###### Returns

`Uint8Array`

##### relief()

```ts
relief(values, o): Float32Array;
```

Heights in mm, 0 where there is no relief.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `values` | `Float32Array` |
| `o` | [`ReliefOptions`](#reliefoptions) |

###### Returns

`Float32Array`

##### rodrigues()

```ts
rodrigues(w): number[];
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `w` | \[`number`, `number`, `number`\] |

###### Returns

`number`[]

##### surfaceNets()

```ts
surfaceNets(
   field, 
   dx, 
   dy, 
   dz, 
   smooth?
): Mesh;
```

Surface nets over a field (inside above zero), after `smooth` box blurs. Vertices in grid units.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `field` | `Float32Array` | `undefined` |
| `dx` | `number` | `undefined` |
| `dy` | `number` | `undefined` |
| `dz` | `number` | `undefined` |
| `smooth?` | `number` | `0` |

###### Returns

[`Mesh`](#mesh)

##### synthBox()

```ts
synthBox(
   theta, 
   extents, 
   t
): Uint8Array;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `theta` | `number` |
| `extents` | \[`number`, `number`, `number`\] |
| `t` | `Omit`\<[`Turntable`](#turntable), `"half"`\> |

###### Returns

`Uint8Array`

##### synthDepth()

```ts
synthDepth(w, h): Float32Array;
```

Fixtures for tests and demos: a sphere depth map, and a box silhouette on a turntable.

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `w` | `number` |
| `h` | `number` |

###### Returns

`Float32Array`

***

### VoxelModel

A voxel model a scan builds up: refine a frame's pose with `icp`, fold the frame in with `integrate`, read the points back, and `dispose` when done.

#### Constructors

##### Constructor

```ts
new VoxelModel(
   x, 
   h, 
   dm
): VoxelModel;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `x` | `Exports` |
| `h` | `number` |
| `dm` | [`DepthMesh`](#depthmesh) |

###### Returns

[`VoxelModel`](#voxelmodel)

#### Accessors

##### size

###### Get Signature

```ts
get size(): number;
```

###### Returns

`number`

#### Methods

##### dispose()

```ts
dispose(): void;
```

###### Returns

`void`

##### icp()

```ts
icp(
   c, 
   start?, 
   o?
): object;
```

Refine a pose for a cloud: two stages, coarse at 2 maxDist then fine.

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `c` | [`Cloud`](#cloud-1) | `undefined` |
| `start?` | [`Pose`](#pose) | `IDENTITY` |
| `o?` | \{ `iters?`: `number`; `maxDist?`: `number`; `normalDot?`: `number`; `step?`: `number`; \} | `{}` |
| `o.iters?` | `number` | `undefined` |
| `o.maxDist?` | `number` | `undefined` |
| `o.normalDot?` | `number` | `undefined` |
| `o.step?` | `number` | `undefined` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `error` | `number` |
| `inliers` | `number` |
| `pose` | [`Pose`](#pose) |

##### integrate()

```ts
integrate(c, pose?): void;
```

###### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `c` | [`Cloud`](#cloud-1) | `undefined` |
| `pose?` | [`Pose`](#pose) | `IDENTITY` |

###### Returns

`void`

##### points()

```ts
points(): Cloud;
```

###### Returns

[`Cloud`](#cloud-1)

## Interfaces

### Bounds

The smallest and largest x, y and z of a set of positions.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-max"></a> `max` | \[`number`, `number`, `number`\] |
| <a id="property-min"></a> `min` | \[`number`, `number`, `number`\] |

***

### Cloud

A point cloud: `count` xyz positions with a normal each.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-count"></a> `count` | `number` |
| <a id="property-normals"></a> `normals` | `Float32Array` |
| <a id="property-positions"></a> `positions` | `Float32Array` |

***

### CloudOptions

How [DepthMesh.cloud](#cloud) maps depth to distance: near and far, focal length, and the pixel stride and depth range kept.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dmax"></a> `dmax?` | `number` | - |
| <a id="property-dmin"></a> `dmin?` | `number` | - |
| <a id="property-far"></a> `far` | `number` | Distance of depth 0. |
| <a id="property-focal"></a> `focal` | `number` | Focal length in pixels at this depth map's width. |
| <a id="property-near"></a> `near` | `number` | Distance of depth 1, scene units. |
| <a id="property-stride"></a> `stride?` | `number` | - |

***

### DepthGrid

0 to 1 per pixel, larger is nearer.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data"></a> `data` | `ArrayLike`\<`number`\> |
| <a id="property-height"></a> `height` | `number` |
| <a id="property-width"></a> `width` | `number` |

***

### HeightSource

One entry of [HEIGHT\_SOURCES](#height_sources): the name, the label to show, whether it needs a depth model, and the options it reads.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-label"></a> `label` | `string` | The label for a height source select. |
| <a id="property-name"></a> `name` | [`HeightSourceName`](#heightsourcename) | - |
| <a id="property-needsmodel"></a> `needsModel` | `boolean` | Needs a depth model or a stored depth map. |
| <a id="property-params"></a> `params` | readonly (keyof [`ReliefParams`](#reliefparams))[] | Options that apply to this source. |

***

### MaskGrid

Any size; resampled to the relief grid, nonzero (128 and up for 8 bit masks) is set.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-1"></a> `data` | `ArrayLike`\<`number`\> |
| <a id="property-height-1"></a> `height` | `number` |
| <a id="property-width-1"></a> `width` | `number` |

***

### Mesh

A triangle mesh: xyz positions and three indices per triangle.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-indices"></a> `indices` | `Uint32Array` |
| <a id="property-positions-1"></a> `positions` | `Float32Array` |

***

### PhotoRelief

What [photoRelief](#photorelief-1) returns: the closed solid, the heights per cell, the cell size, the source used and status notes.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-cols"></a> `cols` | `number` | - |
| <a id="property-depth"></a> `depth?` | [`DepthGrid`](#depthgrid) | The depth map used, to store with the design so the model never reruns. |
| <a id="property-heights"></a> `heights` | `Float32Array` | Heights in mm per cell, row 0 at the top of the image; 0 is no relief. |
| <a id="property-mesh"></a> `mesh` | [`Mesh`](#mesh) | The closed solid in mm, centred on x and y, sitting on z = 0, image up is +y. |
| <a id="property-notes"></a> `notes` | \[`level`: `"ok"` \| `"warn"`, `text`: `string`\][] | Status lines: [level, text]. |
| <a id="property-px"></a> `px` | `number` | Cell size, mm. |
| <a id="property-rows"></a> `rows` | `number` | - |
| <a id="property-source"></a> `source` | [`HeightSourceName`](#heightsourcename) | The source used, after any fallback. |

***

### PhotoReliefOptions

Options for [photoRelief](#photorelief-1): the height source, a depth map or a call that makes one, the masks and brushes, and any relief settings to change.

#### Extends

- `Partial`\<[`ReliefParams`](#reliefparams)\>

#### Properties

| Property | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ |
| <a id="property-base"></a> `base?` | `number` | Lowest relief height, mm. Default 0.24. | [`ReliefParams`](#reliefparams).[`base`](#property-base-2) |
| <a id="property-bgcut"></a> `bgcut?` | `number` | Background cut 0 to 0.9, depth and brightness only. Default 0.25. | [`ReliefParams`](#reliefparams).[`bgcut`](#property-bgcut-2) |
| <a id="property-cells"></a> `cells?` | `number` | Grid cells across. Default the photo width, at most 256. | - |
| <a id="property-depth-1"></a> `depth?` | \| [`DepthGrid`](#depthgrid) \| ((`image`) => `Promise`\<[`DepthGrid`](#depthgrid)\>) | A depth map for the photo (stored with the design), or a call that makes one. | - |
| <a id="property-erase"></a> `erase?` | [`MaskGrid`](#maskgrid) | Erase brush: cells set here are cut. | - |
| <a id="property-gamma"></a> `gamma?` | `number` | Default 1. | [`ReliefParams`](#reliefparams).[`gamma`](#property-gamma-2) |
| <a id="property-heal"></a> `heal?` | `boolean` | Fill corner to corner pinches so the solid closes. Default true. | - |
| <a id="property-height-2"></a> `height?` | `number` | Highest relief height, mm. Default 2.4. | [`ReliefParams`](#reliefparams).[`height`](#property-height-4) |
| <a id="property-invert"></a> `invert?` | `boolean` | Depth and brightness: far or dark is high. Inflate: light art on dark is the silhouette. | [`ReliefParams`](#reliefparams).[`invert`](#property-invert-2) |
| <a id="property-keeplargest"></a> `keepLargest?` | `boolean` | Keep only the largest piece. | - |
| <a id="property-mask"></a> `mask?` | [`MaskGrid`](#maskgrid) | Relief only inside this mask, such as a segmentation mask. | - |
| <a id="property-restore"></a> `restore?` | [`MaskGrid`](#maskgrid) | Restore brush: cells set here come back even where erased. | - |
| <a id="property-smooth"></a> `smooth?` | `number` | Smoothing radius, mm. Default 0.3. | [`ReliefParams`](#reliefparams).[`smooth`](#property-smooth-1) |
| <a id="property-source-1"></a> `source` | [`HeightSourceName`](#heightsourcename) | - | - |
| <a id="property-threshold"></a> `threshold?` | `number` | Inflate: brightness below this is inside when the art has no alpha. Default 0.5. | [`ReliefParams`](#reliefparams).[`threshold`](#property-threshold-1) |
| <a id="property-width-2"></a> `width?` | `number` | Relief width on the print, mm. Default 30. | [`ReliefParams`](#reliefparams).[`width`](#property-width-3) |

***

### Pose

Row major rotation (9) and translation (3).

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-r"></a> `r` | `number`[] |
| <a id="property-t"></a> `t` | `number`[] |

***

### ReliefOptions

How [DepthMesh.relief](#relief) turns 0 to 1 values into heights in mm: range, gamma, background cut, invert and mask.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-base-1"></a> `base` | `number` | Lowest relief height, mm. |
| <a id="property-bgcut-1"></a> `bgcut?` | `number` | Background cut 0 to 0.98. |
| <a id="property-gamma-1"></a> `gamma?` | `number` | - |
| <a id="property-height-3"></a> `height` | `number` | Highest relief height, mm. |
| <a id="property-invert-1"></a> `invert?` | `boolean` | - |
| <a id="property-mask-1"></a> `mask?` | `Uint8Array`\<`ArrayBufferLike`\> | Nonzero cells are inside. |

***

### ReliefParams

The relief settings in mm and 0 to 1 units; [RELIEF\_DEFAULTS](#relief_defaults) holds the defaults.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-base-2"></a> `base` | `number` | Lowest relief height, mm. Default 0.24. |
| <a id="property-bgcut-2"></a> `bgcut` | `number` | Background cut 0 to 0.9, depth and brightness only. Default 0.25. |
| <a id="property-gamma-2"></a> `gamma` | `number` | Default 1. |
| <a id="property-height-4"></a> `height` | `number` | Highest relief height, mm. Default 2.4. |
| <a id="property-invert-2"></a> `invert` | `boolean` | Depth and brightness: far or dark is high. Inflate: light art on dark is the silhouette. |
| <a id="property-smooth-1"></a> `smooth` | `number` | Smoothing radius, mm. Default 0.3. |
| <a id="property-threshold-1"></a> `threshold` | `number` | Inflate: brightness below this is inside when the art has no alpha. Default 0.5. |
| <a id="property-width-3"></a> `width` | `number` | Relief width on the print, mm. Default 30. |

***

### RgbaImage

RGBA pixels, as ImageData has them.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-data-2"></a> `data` | `ArrayLike`\<`number`\> |
| <a id="property-height-5"></a> `height` | `number` |
| <a id="property-width-4"></a> `width` | `number` |

***

### Turntable

The turntable camera for [DepthMesh.carve](#carve): image size, focal length, distance to the axis and the carved cube's half size.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-dist"></a> `dist` | `number` | Camera to axis distance, object units. |
| <a id="property-focal-1"></a> `focal` | `number` | Focal length, pixels. |
| <a id="property-half"></a> `half` | `number` | Half size of the carved cube, object units. |
| <a id="property-height-6"></a> `height` | `number` | - |
| <a id="property-width-5"></a> `width` | `number` | - |

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

Where [loadDepthMesh](#loaddepthmesh) gets the wasm core: a URL, the bytes, or base64 text such as `DEPTH_MESH_WASM_BASE64`.

***

### HeightSourceName

```ts
type HeightSourceName = "depth" | "brightness" | "inflate";
```

The three height sources: Depth Anything depth, brightness, or an inflated silhouette.

## Variables

### HEIGHT\_SOURCES

```ts
const HEIGHT_SOURCES: readonly HeightSource[];
```

The height sources, in the order and words a height source select shows.

***

### IDENTITY

```ts
const IDENTITY: Pose;
```

The pose with no rotation and no translation.

***

### RELIEF\_DEFAULTS

```ts
const RELIEF_DEFAULTS: Readonly<ReliefParams>;
```

The default relief settings: 30 mm wide, 0.24 to 2.4 mm high, gamma 1, background cut 0.25, smoothing 0.3 mm, threshold 0.5.

## Functions

### bounds()

```ts
function bounds(pos): Bounds;
```

The axis aligned bounds of xyz positions.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pos` | `Float32Array` |

#### Returns

[`Bounds`](#bounds)

***

### brightnessHeight()

```ts
function brightnessHeight(
   img, 
   cols, 
   rows
): object;
```

Brightness per cell, 0 to 1, and coverage (alpha over 127).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `img` | [`RgbaImage`](#rgbaimage) |
| `cols` | `number` |
| `rows` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cover` | `Uint8Array` |
| `values` | `Float32Array` |

***

### cloudToPly()

```ts
function cloudToPly(c, colors?): Uint8Array;
```

A binary PLY of a point cloud with its normals and, when given, 0 to 1 colours.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `c` | [`Cloud`](#cloud-1) |
| `colors?` | `Float32Array`\<`ArrayBufferLike`\> |

#### Returns

`Uint8Array`

***

### depthHeight()

```ts
function depthHeight(
   d, 
   cols, 
   rows
): Float32Array;
```

Depth per cell, resampled bilinear from the map's own size.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `d` | [`DepthGrid`](#depthgrid) |
| `cols` | `number` |
| `rows` | `number` |

#### Returns

`Float32Array`

***

### fitToPrint()

```ts
function fitToPrint(m, sizeMM): Mesh;
```

Centre the mesh and scale it so its longest side is `sizeMM`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mesh`](#mesh) |
| `sizeMM` | `number` |

#### Returns

[`Mesh`](#mesh)

***

### inflateHeight()

```ts
function inflateHeight(
   img, 
   cols, 
   rows, 
   o?
): object;
```

Inflated silhouette per cell, 0 to 1: a dome sqrt(1 - (1 - t)^2) over
t, the distance to the outline over the largest distance. Art with transparency carries its shape in alpha; opaque art is
inside where darker than `threshold` (lighter with `invert`).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `img` | [`RgbaImage`](#rgbaimage) |
| `cols` | `number` |
| `rows` | `number` |
| `o?` | \{ `blur?`: `number`; `invert?`: `boolean`; `threshold?`: `number`; \} |
| `o.blur?` | `number` |
| `o.invert?` | `boolean` |
| `o.threshold?` | `number` |

#### Returns

`object`

| Name | Type |
| ------ | ------ |
| `cover` | `Uint8Array` |
| `values` | `Float32Array` |

***

### loadDepthMesh()

```ts
function loadDepthMesh(src): Promise<DepthMesh>;
```

Instantiate the depth-mesh wasm core from a URL, bytes or base64 and return a [DepthMesh](#depthmesh). Throws on an HTTP error when fetching.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | [`CoreSource`](#coresource) |

#### Returns

`Promise`\<[`DepthMesh`](#depthmesh)\>

***

### openEdges()

```ts
function openEdges(indices): number;
```

Edges used by other than exactly two triangles; 0 for a closed manifold surface.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `indices` | `Uint32Array` |

#### Returns

`number`

***

### photoRelief()

```ts
function photoRelief(
   dm, 
   image, 
   o
): Promise<PhotoRelief>;
```

Photo to relief in one call: a height source, the relief parameters,
the relief mask and the erase and restore brushes, then the closed
solid. Export it with `toStl`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dm` | [`DepthMesh`](#depthmesh) |
| `image` | [`RgbaImage`](#rgbaimage) |
| `o` | [`PhotoReliefOptions`](#photoreliefoptions) |

#### Returns

`Promise`\<[`PhotoRelief`](#photorelief)\>

***

### toObj()

```ts
function toObj(m, name?): string;
```

A Wavefront OBJ text of the mesh: one object named `name`, vertices and faces.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `m` | [`Mesh`](#mesh) | `undefined` |
| `name?` | `string` | `"mesh"` |

#### Returns

`string`

***

### toPly()

```ts
function toPly(p): Uint8Array;
```

Binary little endian PLY: vertices with optional normals and 0 to 1 colours, and faces when given.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `p` | \{ `colors?`: `Float32Array`\<`ArrayBufferLike`\>; `indices?`: `Uint32Array`\<`ArrayBufferLike`\>; `normals?`: `Float32Array`\<`ArrayBufferLike`\>; `positions`: `Float32Array`; \} |
| `p.colors?` | `Float32Array`\<`ArrayBufferLike`\> |
| `p.indices?` | `Uint32Array`\<`ArrayBufferLike`\> |
| `p.normals?` | `Float32Array`\<`ArrayBufferLike`\> |
| `p.positions` | `Float32Array` |

#### Returns

`Uint8Array`

***

### toStl()

```ts
function toStl(m): Uint8Array;
```

A binary STL of the mesh, with a face normal per triangle, in the mesh's own units.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mesh`](#mesh) |

#### Returns

`Uint8Array`

***

### trackGood()

```ts
function trackGood(
   r, 
   prev, 
   sampled, 
   maxDist?
): boolean;
```

The accept test for a tracked frame: enough inliers, low error, and no jump.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `r` | \{ `error`: `number`; `inliers`: `number`; `pose`: [`Pose`](#pose); \} | `undefined` |
| `r.error` | `number` | `undefined` |
| `r.inliers` | `number` | `undefined` |
| `r.pose` | [`Pose`](#pose) | `undefined` |
| `prev` | [`Pose`](#pose) | `undefined` |
| `sampled` | `number` | `undefined` |
| `maxDist?` | `number` | `0.03` |

#### Returns

`boolean`

***

### volume()

```ts
function volume(m): number;
```

Signed volume of a closed mesh (positive when faces wind outward).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `m` | [`Mesh`](#mesh) |

#### Returns

`number`

# @hackbuild/ai-elements

## Variables

### DEPRECATION

```ts
const DEPRECATION: "@hackbuild/ai-elements is deprecated. use @hackbuild/ai-views: <model-select>, <chat-pane>, <chat-composer>, <memory-inspector> and the other views." = "@hackbuild/ai-elements is deprecated. use @hackbuild/ai-views: <model-select>, <chat-pane>, <chat-composer>, <memory-inspector> and the other views.";
```

Written once to the console by define().

## Functions

### define()

```ts
function define(
   prefix?, 
   registry?, 
   Base?
): string[];
```

Registers the ai-views elements under the prefix (default hb) and notes the deprecation once.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `prefix?` | `string` | `"hb"` |
| `registry?` | `DefineTarget` | `undefined` |
| `Base?` | new () => `HTMLElement` | `undefined` |

#### Returns

`string`[]

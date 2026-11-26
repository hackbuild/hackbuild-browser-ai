# ingest

## Interfaces

### IngestOptions

Options for [readSources](#readsources) and [ingest](#ingest).

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-chunk"></a> `chunk?` | `number` | Characters per chunk. Default 900. |
| <a id="property-importer"></a> `importer?` | (`url`) => `Promise`\<`unknown`\> | Module importer for the CDN builds; default a native dynamic import. |
| <a id="property-maxbytes"></a> `maxBytes?` | `number` | Skip files larger than this many bytes. Default 25 MB. |
| <a id="property-modules"></a> `modules?` | `object` | Library modules in place of the CDN builds (tests). |
| `modules.jszip?` | () => `Promise`\<[`ZipLike`](#ziplike)\> | - |
| `modules.mammoth?` | () => `Promise`\<[`MammothLike`](#mammothlike)\> | - |
| `modules.pdfjs?` | () => `Promise`\<[`PdfLike`](#pdflike)\> | - |
| <a id="property-onfile"></a> `onFile?` | (`e`) => `void` | One line per file read, skipped or failed. |
| <a id="property-overlap"></a> `overlap?` | `number` | Characters two chunks share. Default 120. |
| <a id="property-signal"></a> `signal?` | `AbortSignal` | - |

***

### IngestTarget

What a store needs to take sources: add, with options. A `Memory` from `open` fits.

#### Methods

##### add()

```ts
add(text, o?): Promise<{
  id: number;
  merged: boolean;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `text` | `string` |
| `o?` | [`AddOptions`](index.md#addoptions) |

###### Returns

`Promise`\<\{
  `id`: `number`;
  `merged`: `boolean`;
\}\>

***

### MammothLike

The part of mammoth the reader uses.

#### Methods

##### extractRawText()

```ts
extractRawText(o): Promise<{
  value: string;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `o` | \{ `arrayBuffer`: `ArrayBuffer`; \} |
| `o.arrayBuffer` | `ArrayBuffer` |

###### Returns

`Promise`\<\{
  `value`: `string`;
\}\>

***

### PdfLike

The part of pdf.js the reader uses; tests pass a fake.

#### Properties

| Property | Type |
| ------ | ------ |
| <a id="property-globalworkeroptions"></a> `GlobalWorkerOptions?` | `object` |
| `GlobalWorkerOptions.workerSrc` | `string` |

#### Methods

##### getDocument()

```ts
getDocument(src): object;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `src` | \{ `data`: `Uint8Array`; \} |
| `src.data` | `Uint8Array` |

###### Returns

`object`

| Name | Type |
| ------ | ------ |
| `promise` | `Promise`\<\{ `numPages`: `number`; `getPage`(`n`): `Promise`\<\{ `getTextContent`(): `Promise`\<\{ `items`: `object`[]; \}\>; \}\>; \}\> |

***

### SourceText

One readable piece of a source: its name (a zip keeps the inner path) and its text.

#### Properties

| Property | Type | Description |
| ------ | ------ | ------ |
| <a id="property-name"></a> `name` | `string` | - |
| <a id="property-text"></a> `text` | `string` | - |
| <a id="property-type"></a> `type` | `string` | "pdf", "docx", "mail", "html", "text". |

***

### ZipLike

The part of JSZip the reader uses.

#### Methods

##### loadAsync()

```ts
loadAsync(data): Promise<{
  files: Record<string, {
     dir: boolean;
     name: string;
     async(t): Promise<Blob>;
  }>;
}>;
```

###### Parameters

| Parameter | Type |
| ------ | ------ |
| `data` | `ArrayBuffer` \| `Uint8Array`\<`ArrayBufferLike`\> |

###### Returns

`Promise`\<\{
  `files`: `Record`\<`string`, \{
     `dir`: `boolean`;
     `name`: `string`;
     `async`(`t`): `Promise`\<`Blob`\>;
  \}\>;
\}\>

## Type Aliases

### SourceFile

```ts
type SourceFile = Blob & object;
```

A file as the readers take it: a Blob with a name, and the folder path when it came from one.

#### Type Declaration

| Name | Type |
| ------ | ------ |
| `name` | `string` |
| `webkitRelativePath?` | `string` |

## Variables

### INGEST\_URLS

```ts
const INGEST_URLS: object;
```

Pinned CDN builds the readers import on first use.

#### Type Declaration

| Name | Type | Default value |
| ------ | ------ | ------ |
| <a id="property-jszip"></a> `jszip` | `"https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"` | `"https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm"` |
| <a id="property-mammoth"></a> `mammoth` | `"https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm"` | `"https://cdn.jsdelivr.net/npm/mammoth@1.8.0/+esm"` |
| <a id="property-pdfjs"></a> `pdfjs` | `"https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"` | `"https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs"` |
| <a id="property-pdfjsworker"></a> `pdfjsWorker` | `"https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"` | `"https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs"` |

## Functions

### chunkText()

```ts
function chunkText(
   text, 
   size?, 
   overlap?
): string[];
```

Splits text into chunks of about `size` characters on paragraph, then sentence, then word bounds, with `overlap` shared.

#### Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `text` | `string` | `undefined` |
| `size?` | `number` | `900` |
| `overlap?` | `number` | `120` |

#### Returns

`string`[]

***

### htmlText()

```ts
function htmlText(html): string;
```

Visible text of an html page: scripts and styles dropped, tags to spaces, entities decoded.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `html` | `string` |

#### Returns

`string`

***

### ingest()

```ts
function ingest(
   mem, 
   files, 
   o?
): Promise<{
  chunks: number;
  files: number;
}>;
```

Reads files and adds each chunk to memory as a "doc" item (docs never
decay), with the file name as its section and `meta.source`. Returns the
files read and the chunks added.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `mem` | [`IngestTarget`](#ingesttarget) |
| `files` | `Iterable`\<[`SourceFile`](#sourcefile)\> |
| `o?` | [`IngestOptions`](#ingestoptions) & `object` |

#### Returns

`Promise`\<\{
  `chunks`: `number`;
  `files`: `number`;
\}\>

***

### mailText()

```ts
function mailText(raw): string;
```

The readable body of a mail message (.eml): subject, from and date, then the
plain text part, or the html part as text when there is no plain one.
Quoted printable and base64 parts are decoded; attachments are skipped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `raw` | `string` |

#### Returns

`string`

***

### readSources()

```ts
function readSources(files, o?): Promise<SourceText[]>;
```

Reads files into text, one entry per readable file; a zip yields one per
readable file inside it. Files the readers do not know are reported
through `onFile` with a note and skipped.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `files` | `Iterable`\<[`SourceFile`](#sourcefile)\> |
| `o?` | [`IngestOptions`](#ingestoptions) |

#### Returns

`Promise`\<[`SourceText`](#sourcetext)[]\>

***

### sourceType()

```ts
function sourceType(f): "pdf" | "docx" | "zip" | "mail" | "html" | "text" | null;
```

What a file is, by name and type: pdf, docx, zip, mail, html, text, or null for one the readers skip.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `f` | \{ `name`: `string`; `type?`: `string`; \} |
| `f.name` | `string` |
| `f.type?` | `string` |

#### Returns

`"pdf"` \| `"docx"` \| `"zip"` \| `"mail"` \| `"html"` \| `"text"` \| `null`

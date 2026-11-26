#!/usr/bin/env node
// Pin every Hugging Face repo the records load to a commit, and record a
// SHA-256 per weight and config file at that commit. Writes
// packages/models/src/pins.ts.
//
//   node tools/pin-weights.mjs                  list sizes only
//   node tools/pin-weights.mjs --write          query the hub and write pins.ts
//   node tools/pin-weights.mjs --write --measure-mb 300
//   node tools/pin-weights.mjs --write --add   pin only repos missing from pins.ts
//
// A REPOS entry is a repo, or [repo, regex] to pin only the files a record
// loads (a GGUF repo holds every quant; a record loads one).
//
// LFS files carry their SHA-256 as the LFS oid (the X-Linked-ETag the hub
// sends on a HEAD of the resolve URL); those are labelled vendor. Small
// files kept in git are downloaded and hashed (measured). With
// --measure-mb N every LFS file up to N MB is downloaded, hashed and
// compared with the oid; a match is labelled measured, a mismatch fails.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const REPOS = [
  "HuggingFaceTB/SmolLM2-135M-Instruct",
  "HuggingFaceTB/SmolLM2-360M-Instruct",
  "onnx-community/gemma-3-270m-it-ONNX",
  "Qwen/Qwen2.5-0.5B-Instruct-GGUF",
  "Xenova/all-MiniLM-L6-v2",
  "Xenova/bge-small-en-v1.5",
  "minishlab/potion-base-8M",
  "onnx-community/depth-anything-v2-small",
  "Xenova/slimsam-77-uniform",
  "HuggingFaceTB/SmolVLM-256M-Instruct",
  "onnx-community/LFM2-VL-450M-ONNX",
  "onnx-community/whisper-large-v3-turbo",
  "onnx-community/whisper-base",
  "Xenova/whisper-small.en",
  "Xenova/whisper-base.en",
  "Xenova/whisper-tiny.en",
  "onnx-community/moonshine-base-ONNX",
  "onnx-community/Kokoro-82M-v1.0-ONNX",
  "StemSplitio/htdemucs-onnx",
  "schmuell/sd-turbo-ort-web",
  ["onnx-community/Qwen3-0.6B-ONNX", /^(config|generation_config|tokenizer|tokenizer_config)\.json$|^onnx\/model_q4(f16)?\.onnx$/],
  ["onnx-community/DeepSeek-R1-Distill-Qwen-1.5B-ONNX", /^(config|generation_config|tokenizer|tokenizer_config)\.json$|^onnx\/model_q4(f16)?\.onnx$/],
  ["mradermacher/Gemma-4-E4B-IT-ABLITERATED-UNCENSORED-PHILADELPHIA-CLASS-i1-GGUF", /\.i1-Q4_K_M\.gguf$/],
  ["mradermacher/Huihui-gemma-4-E2B-it-abliterated-GGUF", /\.Q4_K_M\.gguf$/],
  ["mradermacher/Huihui-Qwen3.5-4B-abliterated-GGUF", /\.Q4_K_M\.gguf$/],
  ["mradermacher/Hermes-3-Llama-3.2-3B-abliterated-i1-GGUF", /\.i1-(Q4_K_M|IQ3_M)\.gguf$/],
  ["mradermacher/Llama-3.2-3B-Instruct-uncensored-GGUF", /\.Q4_K_M\.gguf$/],
  ["mradermacher/Huihui-Qwen3.5-2B-abliterated-GGUF", /\.Q4_K_M\.gguf$/],
  ["mradermacher/Huihui-Qwen3.5-0.8B-abliterated-GGUF", /\.Q4_K_M\.gguf$/],
];

const KEEP = /(\.onnx|\.onnx_data|_data|\.json|\.gguf|\.safetensors|\.bin|\.txt|\.model)$/;
const SKIP = /(^|\/)(\.gitattributes|README\.md)$|^(?!onnx\/|voices\/|src\/silero_vad\/data\/|unet\/|vae_decoder\/|text_encoder\/)[^/]+\/.+$/;

const args = process.argv.slice(2);
const write = args.includes("--write");
const add = args.includes("--add");
const pinsFile = join(import.meta.dirname, "..", "packages", "models", "src", "pins.ts");
const mi = args.indexOf("--measure-mb");
const measureMb = mi >= 0 ? Number(args[mi + 1]) : 0;
const HF = "https://huggingface.co";

async function json(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

async function shaOnce(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const h = createHash("sha256");
  let n = 0;
  for await (const c of r.body) {
    h.update(c);
    n += c.byteLength;
  }
  return { hex: h.digest("hex"), bytes: n };
}

// the hub answers an occasional 502; try a file three times
async function sha(url) {
  for (let i = 0; ; i++) {
    try {
      return await shaOnce(url);
    } catch (e) {
      if (i >= 2) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (i + 1)));
    }
  }
}

// repos already pinned at their current head are kept from the last run, so a rerun only does the rest
const cacheFile = join(process.env.TMPDIR ?? "/tmp", "hackbuild-pin-weights.json");
let cache = {};
try {
  cache = JSON.parse(readFileSync(cacheFile, "utf8"));
} catch {
  /* first run */
}
const out = {};
if (add) {
  const text = readFileSync(pinsFile, "utf8");
  Object.assign(out, JSON.parse(text.slice(text.indexOf("= {", text.indexOf("export const PINS")) + 2, text.lastIndexOf(";"))));
}
let total = 0;
let measured = 0;
for (const entry of REPOS) {
  const [repo, only] = Array.isArray(entry) ? entry : [entry, null];
  if (add && out[repo]) continue;
  const { sha: rev } = await json(`${HF}/api/models/${repo}/revision/main`);
  if (write && cache[repo]?.revision === rev && cache[repo].measureMb === measureMb) {
    out[repo] = { revision: rev, files: cache[repo].files };
    console.error(`${repo} @ ${rev.slice(0, 7)}: kept from the last run`);
    continue;
  }
  const tree = await json(`${HF}/api/models/${repo}/tree/${rev}?recursive=true`);
  const files = {};
  for (const e of tree) {
    if (e.type !== "file" || !KEEP.test(e.path) || SKIP.test(e.path) || (only && !only.test(e.path))) continue;
    const url = `${HF}/${repo}/resolve/${rev}/${e.path}`;
    if (e.lfs) {
      total += e.size;
      let src = "vendor";
      if (write && measureMb && e.size <= measureMb * 1e6) {
        const m = await sha(url);
        if (m.hex !== e.lfs.oid || m.bytes !== e.size) throw new Error(`${url}: measured ${m.hex} ${m.bytes}, hub says ${e.lfs.oid} ${e.size}`);
        measured += e.size;
        src = "measured";
      }
      files[e.path] = [e.lfs.oid, e.size, src];
    } else if (write) {
      const m = await sha(url);
      files[e.path] = [m.hex, m.bytes, "measured"];
    } else files[e.path] = ["", e.size, "unknown"];
  }
  out[repo] = { revision: rev, files };
  if (write) {
    cache[repo] = { revision: rev, files, measureMb };
    writeFileSync(cacheFile, JSON.stringify(cache));
  }
  console.error(`${repo} @ ${rev.slice(0, 7)}: ${Object.keys(files).length} files`);
}
console.error(`lfs bytes ${total} (vendor), downloaded and hashed ${measured}`);

if (write) {
  const lines = [
    "// Generated by tools/pin-weights.mjs. Do not edit by hand; rerun the tool.",
    "// Each file: [sha256, bytes, source]. source is \"measured\" when the bytes",
    "// were downloaded and hashed, \"vendor\" when the SHA-256 is the hub's LFS oid.",
    "",
    "/** One pinned file as SHA-256, byte count and whether the hash was measured or taken from the vendor. */",
    "export type PinFile = readonly [sha256: string, bytes: number, source: \"measured\" | \"vendor\"];",
    "/** The pinned commit of a Hugging Face repo and the SHA-256 and size of each pinned file. */",
    "export interface RepoPin {",
    "  readonly revision: string;",
    "  readonly files: Readonly<Record<string, PinFile>>;",
    "}",
    "",
    "/** The date the pins were taken. */",
    `export const PINNED_AT = ${JSON.stringify(new Date().toISOString().slice(0, 10))};`,
    "",
    "/** Pinned commits and file hashes per Hugging Face repo, written by tools/pin-weights.mjs. */",
    "export const PINS: Readonly<Record<string, RepoPin>> = " + JSON.stringify(out, null, 2) + ";",
    "",
  ];
  writeFileSync(pinsFile, lines.join("\n"));
}

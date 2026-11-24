// Single file builds: one self contained file per package entry and
// subpath export, with sibling @hackbuild packages inlined and no bare
// imports left. Two forms: ESM (<entry>.js) for pages served over http,
// and a classic IIFE (<entry>.iife.js, global Hackbuild<Pkg>[<Entry>]) for
// pages opened from file://, where Chrome refuses module scripts and
// dynamic imports of file URLs (measured in Chrome 150, 2026-11-23).
// Output: packages/<pkg>/dist/single/
// usage: node tools/bundle.mjs [pkg...]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const pkgs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(root, "packages"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);

const alias = {};
for (const p of readdirSync(join(root, "packages"), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)) alias[`@hackbuild/${p}`] = join(root, "packages", p, "src", "index.ts");

const pascal = (s) => s.replace(/(^|[-_.])(\w)/g, (_, _d, c) => c.toUpperCase());
/** HackbuildAudioDsp for an index entry, HackbuildAudioDspInline for a subpath. */
export function globalName(pkg, entry) {
  return `Hackbuild${pascal(pkg)}${entry === "index" ? "" : pascal(entry)}`;
}

export async function bundle(pkg) {
  const dir = join(root, "packages", pkg);
  const meta = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
  const out = [];
  for (const key of Object.keys(meta.exports ?? {})) {
    const name = key === "." ? "index" : key.slice(2);
    const src = join(dir, "src", `${name}.ts`);
    if (!existsSync(src)) continue;
    await build({
      input: src,
      resolve: { alias },
      output: { file: join(dir, "dist", "single", `${name}.js`), format: "esm", codeSplitting: false },
      logLevel: "silent",
    });
    out.push(join(dir, "dist", "single", `${name}.js`));
    await build({
      input: src,
      resolve: { alias },
      output: { file: join(dir, "dist", "single", `${name}.iife.js`), format: "iife", name: globalName(pkg, name), codeSplitting: false },
      transform: { define: { "import.meta.url": "document.baseURI" } },
      logLevel: "silent",
    });
    out.push(join(dir, "dist", "single", `${name}.iife.js`));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of pkgs) for (const f of await bundle(p)) console.log(f.slice(root.length + 1));
}

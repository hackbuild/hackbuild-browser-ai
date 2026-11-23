// Single file builds: one self contained ESM file per package entry and
// subpath export, with sibling @hackbuild packages inlined and no bare
// imports left, so a page can load it from file:// with a script tag of
// type module or a dynamic import. Output: packages/<pkg>/dist/single/<entry>.js
// usage: node tools/bundle.mjs [pkg...]
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const pkgs = process.argv.slice(2).length ? process.argv.slice(2) : readdirSync(join(root, "packages"));

const alias = {};
for (const p of readdirSync(join(root, "packages"))) alias[`@hackbuild/${p}`] = join(root, "packages", p, "src", "index.ts");

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
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const p of pkgs) for (const f of await bundle(p)) console.log(f.slice(root.length + 1));
}

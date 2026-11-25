// Design D8: every package carries packages/<name>/how.ts, ships it in the
// tarball and keeps it out of the runtime entry.
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { test } from "node:test";

const pkgs = join(resolve(import.meta.dirname, "..", ".."), "packages");
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));

for (const name of readdirSync(pkgs).filter((n) => existsSync(join(pkgs, n, "package.json")))) {
  test(`${name} has how.ts, ships it and keeps it out of src`, () => {
    const how = join(pkgs, name, "how.ts");
    assert.ok(existsSync(how), `${name}/how.ts missing; run node tools/gen-how.mjs ${name}`);
    const text = readFileSync(how, "utf8");
    assert.doesNotMatch(text.split("const how: HowDoc")[0], /^\s*import\s/m, "how.ts is plain data and imports nothing");
    assert.match(text, /^export default how;$/m);
    const pkg = JSON.parse(readFileSync(join(pkgs, name, "package.json"), "utf8"));
    assert.ok(pkg.files.includes("how.ts"), `${name}: how.ts is not in files`);
    for (const f of walk(join(pkgs, name, "src"))) assert.doesNotMatch(readFileSync(f, "utf8"), /["']\.\.?\/(\.\.\/)*how(\.js|\.ts)?["']/, `${f} imports how.ts`);
  });
}

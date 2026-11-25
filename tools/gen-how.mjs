// gen-how: writes the skeleton of packages/<name>/how.ts from the package
// README, for every package that has no how.ts yet (--force rewrites them).
// The fields follow the HbHow props of hackbuild-ui plus the two lines of
// prose a package page shows: what it is (the README lead) and how it works
// (the first few notes after the first code sample). Read each result and fix
// it by hand; the script only cuts text out of the README.
// Usage: node tools/gen-how.mjs [name...] [--force]
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const repo = basename(root);
const args = process.argv.slice(2);
const force = args.includes("--force");
const only = args.filter((a) => !a.startsWith("--"));
const SITE = `https://hackbuild.github.io/${repo}/`;
const SOURCE = `https://github.com/hackbuild/${repo}/tree/main/packages/`;

// lowercase prose, but leave `code spans` as they are
const lower = (s) => s.split(/(`[^`]*`)/).map((part, i) => (i % 2 ? part : part.toLowerCase())).join("");
const flat = (lines) => lines.map((l) => l.trim()).join(" ").replace(/\s+/g, " ").trim();
// the licence sentences of the lead belong to the README, not the page
const dropLicence = (s) => s.replace(/\s*Code MIT;.*?also MIT\./, "").replace(/\s*No (weights|models)\b[^.]*\.(\s*[A-Z][^.]*trained in the tab\.)?/g, "").replace(/\s*Each model keeps its own licence\./, "").trim();
const tpl = (s) => "`" + s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${") + "`";

function parse(md) {
  const lines = md.split("\n");
  let i = 1;
  while (i < lines.length && !lines[i].trim()) i++;
  const lead = [];
  while (i < lines.length && lines[i].trim() && !lines[i].startsWith("    ")) lead.push(lines[i++]);
  const install = lines.find((l) => /^ {4}npm install /.test(l))?.trim() ?? "";
  const blocks = [];
  const notes = [];
  for (let j = i; j < lines.length; j++) {
    const l = lines[j];
    if (/^## What is verified/.test(l)) break;
    if (l.startsWith("    ")) {
      const b = [];
      while (j < lines.length && (lines[j].startsWith("    ") || (!lines[j].trim() && lines[j + 1]?.startsWith("    ")))) b.push(lines[j++].slice(4));
      j--;
      // the install lines may share a block with the first sample; keep the rest
      const code = b.filter((x) => !/^(# not on npm|npm install)/.test(x)).join("\n").trim();
      if (code) blocks.push(code);
      continue;
    }
    if (!blocks.length) continue;
    if (/^- /.test(l) || (/^[A-Za-z`]/.test(l) && !/^\|/.test(l))) {
      const n = [l.replace(/^- /, "")];
      while (lines[j + 1]?.trim() && /^ {2}\S|^[A-Za-z`(]/.test(lines[j + 1]) && !/^- /.test(lines[j + 1])) n.push(lines[++j]);
      notes.push(flat(n));
    }
  }
  return { lead: dropLicence(flat(lead)), install, code: blocks[0] ?? "", notes: notes.slice(0, 3) };
}

const names = readdirSync(join(root, "packages")).filter((n) => existsSync(join(root, "packages", n, "README.md")));
for (const name of only.length ? only : names) {
  const file = join(root, "packages", name, "how.ts");
  if (existsSync(file) && !force) continue;
  const pkg = JSON.parse(readFileSync(join(root, "packages", name, "package.json"), "utf8"));
  const r = parse(readFileSync(join(root, "packages", name, "README.md"), "utf8"));
  const body = [
    `// how this works: the fold of the package page and of the suite tool. Plain data, no imports;`,
    `// checked by tsconfig.how.json, shipped in the tarball, never imported by the runtime entry.`,
    `const how: HowDoc = {`,
    `  packages: [${JSON.stringify(pkg.name)}],`,
    `  what: ${tpl(lower(r.lead))},`,
    `  how: [`,
    ...r.notes.map((n) => `    ${tpl(lower(n))},`),
    `  ],`,
    `  install: ${JSON.stringify(r.install || `npm install ${pkg.name}`)},`,
    `  today: ${tpl(`git clone https://github.com/hackbuild/${repo}\ncd ${repo} && npm ci && npm run build\nnpm pack -w ${pkg.name}`)},`,
    `  code: ${tpl(r.code)},`,
    `  links: { page: ${JSON.stringify(`${SITE}${name}/`)}, source: ${JSON.stringify(`${SOURCE}${name}`)} },`,
    `};`,
    `export default how;`,
    ``,
  ];
  writeFileSync(file, body.join("\n"));
  console.log(`gen-how: ${name}/how.ts`);
}

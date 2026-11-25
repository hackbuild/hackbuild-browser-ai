// build-views: the demo page of each @hackbuild/ai-views view, written as a
// whole hackbuild-ui layout. tools/build-pages.mjs puts its own header and
// shell around a page, so a layout page would have to rebuild the body at run
// time; these pages are bare instead: examples/views/<name>/page.html is the
// body as written (the layout markup, the view elements in its regions) and
// examples/views/<name>/main.ts wires fixtures and stub providers. No weights
// load on any page.
//
// Output, after build-pages: <outDir>/views/<name>/index.html with its
// main.js, <outDir>/views/hb/ with the hackbuild-ui styles, and an index at
// <outDir>/views/index.html. `{{mark}}` in a page becomes the hack.build mark.
// Usage: node tools/build-views.mjs [outDir]
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { build } from "rolldown";

const root = resolve(import.meta.dirname, "..");
const src = join(root, "examples", "views");
const out = join(resolve(root, process.argv[2] ?? "_site"), "views");
const hbui = join(root, "node_modules", "@virgilvox", "hackbuild-ui");
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const mark = readFileSync(join(hbui, "assets", "brand", "hackbuild-mark.svg"), "utf8")
  .replace(/<title>[^<]*<\/title>\s*/, "")
  .replace("<svg ", '<svg class="hb-logo" width="28" height="28" aria-hidden="true" ')
  .replace(/ role="img" aria-label="[^"]*"/, "")
  .trim();

const pages = readdirSync(src, { withFileTypes: true })
  .filter((d) => d.isDirectory() && existsSync(join(src, d.name, "page.html")))
  .map((d) => {
    const html = readFileSync(join(src, d.name, "page.html"), "utf8");
    const title = /<!--\s*title:\s*(.+?)\s*-->/.exec(html)?.[1] ?? d.name;
    const what = /<!--\s*what:\s*(.+?)\s*-->/.exec(html)?.[1] ?? "";
    return { name: d.name, title, what, html: html.replace(/<!--[\s\S]*?-->\n?/g, "").replaceAll("{{mark}}", mark) };
  });

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "hb"), { recursive: true });
for (const f of ["hackbuild.css", "tokens.css", "fonts-inline.css"]) cpSync(join(hbui, "dist", "styles", f), join(out, "hb", f));

const input = Object.fromEntries(pages.map((p) => [p.name, join(src, p.name, "main.ts")]));
await build({
  input,
  output: { dir: out, format: "esm", entryFileNames: "[name]/main.js", chunkFileNames: "chunks/[name]-[hash].js", minify: process.env.HB_MINIFY !== "0" },
  logLevel: "warn",
});

const head = (title, up) =>
  `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<title>${esc(title)}</title>\n` +
  `<link rel="stylesheet" href="${up}hb/fonts-inline.css">\n<link rel="stylesheet" href="${up}hb/hackbuild.css">\n<link rel="icon" href="data:,">\n</head>\n`;
for (const p of pages) {
  writeFileSync(join(out, p.name, "index.html"), `${head(`${p.title}, ai-views`, "../")}<body class="hb">\n${p.html.trim()}\n<script type="module" src="./main.js"></script>\n</body>\n</html>\n`);
}
writeFileSync(
  join(out, "index.html"),
  `${head("ai-views", "./")}<body class="hb hb-halftone">\n<header class="hb-header">${mark}<h1>ai-views<span>.</span></h1></header>\n<main class="hb-shell">\n<p>one page per view of @hackbuild/ai-views, each in its hackbuild-ui layout, on fixtures and stub models. nothing downloads.</p>\n<ul class="hb-list">\n` +
    pages.map((p) => `<li class="hb-row"><a href="./${p.name}/">${esc(p.title)}</a><span>${esc(p.what)}</span></li>`).join("\n") +
    `\n</ul>\n</main>\n</body>\n</html>\n`,
);
console.log(`build-views: ${pages.length} pages into ${out.slice(root.length + 1)}`);

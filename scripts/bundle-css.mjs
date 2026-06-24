#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const publicDir = path.join(root, "public");
const cssDir = path.join(publicDir, "css");
const outFile = path.join(cssDir, "app.css");
const htmlFiles = ["index.html", "privacy-policy.html", "terms-of-service.html"];
const stylesheetRe = /<link\s+rel="stylesheet"\s+href="css\/([^"]+)"\s*\/?>\s*\n?/g;
const singleLink = '    <link rel="stylesheet" href="css/app.css" />\n';

function getStylesheetOrder(htmlPath) {
  const html = fs.readFileSync(htmlPath, "utf8");
  const files = [];
  for (const match of html.matchAll(stylesheetRe)) {
    if (!files.includes(match[1])) files.push(match[1]);
  }
  return files;
}

function replaceStylesheets(html) {
  if (!stylesheetRe.test(html)) return html;
  stylesheetRe.lastIndex = 0;
  return html.replace(stylesheetRe, "").replace(
    /(<link rel="icon"[^>]+>\n)/,
    `$1${singleLink}`
  );
}

const cssFiles = getStylesheetOrder(path.join(publicDir, "index.html"));
if (!cssFiles.length) {
  throw new Error("No stylesheet links found in public/index.html");
}

for (const file of cssFiles) {
  const filePath = path.join(cssDir, file);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing CSS source file: css/${file}`);
  }
}

const combined = cssFiles
  .map((file) => {
    const content = fs.readFileSync(path.join(cssDir, file), "utf8").trim();
    return `/* ${file} */\n${content}`;
  })
  .join("\n\n");

const { code } = await esbuild.transform(combined, {
  loader: "css",
  minify: true,
});

fs.writeFileSync(outFile, code);

const production = process.env.CI === "true" || process.argv.includes("--production");
if (!production) {
  console.log(`Wrote css/app.css (${cssFiles.length} sources). Re-run with CI=true or --production to update HTML and remove split files.`);
  process.exit(0);
}

for (const htmlFile of htmlFiles) {
  const htmlPath = path.join(publicDir, htmlFile);
  const html = fs.readFileSync(htmlPath, "utf8");
  fs.writeFileSync(htmlPath, replaceStylesheets(html));
}

for (const file of fs.readdirSync(cssDir)) {
  if (file.endsWith(".css") && file !== "app.css") {
    fs.unlinkSync(path.join(cssDir, file));
  }
}

console.log(`Bundled ${cssFiles.length} stylesheets into css/app.css`);

#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import postcss from "postcss";
import combine from "postcss-combine-duplicated-selectors";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cssDir = path.join(__dirname, "../..", "public", "css");

const targets = fs
  .readdirSync(cssDir)
  .filter((f) => f.endsWith(".css") && f !== "fonts.css")
  .map((f) => path.join(cssDir, f));

for (const file of targets) {
  const input = fs.readFileSync(file, "utf8");
  const result = await postcss([combine]).process(input, { from: file, to: file });
  fs.writeFileSync(file, result.css);
  console.log(`Deduped ${path.basename(file)}`);
}

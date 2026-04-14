import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "public", "src", "components", "ui-components.js");
let s = fs.readFileSync(p, "utf8");
if (s.includes("export function initializePage(ui, pageId)")) {
  console.log("skip: already patched");
  process.exit(0);
}
const marker = "function controlDeckExoticParticlesRenderTemplate(state)";
const j = s.indexOf(marker);
if (j < 0) throw new Error("marker not found");
const insert = fs.readFileSync(path.join(__dirname, "page-init-insert.txt"), "utf8");
s = s.slice(0, j) + insert + s.slice(j);
fs.writeFileSync(p, s);
console.log("ok");

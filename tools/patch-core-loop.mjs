import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const p = path.join(__dirname, "..", "public", "src", "components", "ui-components.js");
let s = fs.readFileSync(p, "utf8");
const start = s.indexOf("export class ModalOrchestrationUI {");
const end = s.indexOf("export function setupKeyboardShortcuts(ui)", start);
if (start < 0 || end < 0) throw new Error("markers");
const insert = fs.readFileSync(path.join(__dirname, "core-loop-insert.txt"), "utf8");
s = s.slice(0, start) + insert + s.slice(end);
fs.writeFileSync(p, s);
console.log("ok");

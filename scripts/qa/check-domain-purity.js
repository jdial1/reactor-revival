import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const domainDir = path.join(root, "public", "src", "domain");

const BANNED = [
  { re: /from\s+['"]valtio(?:\/[^'"]*)?['"]/, msg: "valtio import forbidden in domain/" },
  { re: /from\s+['"][^'"]*dom\/lit\.js['"]/, msg: "dom/lit import forbidden in domain/" },
  { re: /from\s+['"]lit-html(?:\/[^'"]*)?['"]/, msg: "lit-html import forbidden in domain/" },
  { re: /\bdocument\./, msg: "document.* forbidden in domain/" },
];

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

const errors = [];
for (const file of walk(domainDir)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  for (const { re, msg } of BANNED) {
    if (re.test(text)) errors.push(`${rel}: ${msg}`);
  }
}

if (errors.length) {
  console.error("check-domain-purity (Step 4d) failed:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

console.log("check-domain-purity: ok");

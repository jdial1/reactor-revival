import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const srcRoot = path.join(root, "public", "src");

const BANNED_PATHS = [
  "public/src/components/shell/heat-dom-sync.js",
];

const BANNED_SYMBOLS = [
  { re: /\bsyncReactorHeatVisualDom\b/, msg: "syncReactorHeatVisualDom deleted (Step 7d — Lit shell owns heat visuals)" },
  { re: /\b_applyHeatFromRatio\b/, msg: "_applyHeatFromRatio deleted (Step 7d — Lit shell owns heat visuals)" },
  { re: /\bclearHeatWarningClasses\b/, msg: "clearHeatWarningClasses deleted (Step 7d — Lit shell owns heat visuals)" },
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

for (const rel of BANNED_PATHS) {
  if (fs.existsSync(path.join(root, rel))) {
    errors.push(`${rel}: file must stay deleted (Step 7d heat dual-path)`);
  }
}

for (const file of walk(srcRoot)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file).replace(/\\/g, "/");
  for (const { re, msg } of BANNED_SYMBOLS) {
    if (re.test(text)) errors.push(`${rel}: ${msg}`);
  }
}

if (errors.length) {
  console.error("check-declarative-dom (Step 7d) failed:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

console.log("check-declarative-dom: ok");

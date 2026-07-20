import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const publicSrc = path.join(root, "public", "src");
const testsDir = path.join(root, "tests");

const FACADE_STOMP =
  /\.coreBridge\s*\??\.\s*(?:loadEconomyFromHost|syncGridFromGame|syncReactorScalarsFromGame|pushHostUpgradeLevelsForLoad)\b/;
const HARNESS_IMPORT =
  /bridge-test-harness/;

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

for (const file of walk(publicSrc)) {
  const text = fs.readFileSync(file, "utf8");
  const rel = path.relative(root, file);
  if (HARNESS_IMPORT.test(text)) {
    errors.push(`${rel}: production must not import bridge-test-harness`);
  }
  if (FACADE_STOMP.test(text)) {
    errors.push(`${rel}: host→session harness sync must not live on production bridge facade`);
  }
}

for (const file of walk(testsDir)) {
  if (file.endsWith(`${path.sep}bridge-test-harness.js`)) continue;
  const text = fs.readFileSync(file, "utf8");
  if (!FACADE_STOMP.test(text)) continue;
  errors.push(`${path.relative(root, file)}: call harness helpers, not coreBridge.* sync APIs`);
}

if (errors.length) {
  console.error("check-harness-exile (Step 3d) failed:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

console.log("check-harness-exile: ok");

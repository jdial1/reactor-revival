import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const testsDir = path.join(root, "tests");

const suspect = /\bexpect\s*\(\s*toNum\s*\(/;

function walk(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (e.isFile() && e.name.endsWith(".test.js")) out.push(full);
  }
  return out;
}

const files = walk(testsDir);
const hits = [];
for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  if (suspect.test(text)) hits.push(path.relative(root, file));
}

if (hits.length) {
  const msg = "check-expect-tonum: replace expect(toNum(...)) with expect(...).toBeDecimal(...) where appropriate";
  if (process.env.ENFORCE_EXPECT_DECIMAL === "1") {
    console.error(`${msg}:`);
    hits.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }
  console.warn(`${msg} (${hits.length} files). Set ENFORCE_EXPECT_DECIMAL=1 to fail CI.`);
}

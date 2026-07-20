#!/usr/bin/env node
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const baselinePath = path.join(root, "config/eslint-warning-baseline.json");

const run = spawnSync(
  "npx",
  ["eslint", "public/src", "-c", "config/eslint.config.js", "-f", "json"],
  { cwd: root, encoding: "utf8", shell: true, maxBuffer: 20 * 1024 * 1024 }
);

let results;
try {
  results = JSON.parse(run.stdout || "[]");
} catch {
  console.error("check-eslint-warning-budget: failed to parse eslint JSON");
  console.error(run.stderr || run.stdout);
  process.exit(1);
}

let errors = 0;
let warnings = 0;
for (const file of results) {
  errors += file.errorCount || 0;
  warnings += file.warningCount || 0;
}

if (errors > 0) {
  console.error(`check-eslint-warning-budget: ${errors} ESLint error(s)`);
  process.exit(1);
}

if (!fs.existsSync(baselinePath)) {
  fs.writeFileSync(baselinePath, `${JSON.stringify({ maxWarnings: warnings }, null, 2)}\n`);
  console.log(`check-eslint-warning-budget: wrote baseline maxWarnings=${warnings}`);
  process.exit(0);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const maxWarnings = Number(baseline.maxWarnings ?? 0);
if (warnings > maxWarnings) {
  console.error(
    `check-eslint-warning-budget: warnings ${warnings} > baseline ${maxWarnings} (Step 2d)`
  );
  process.exit(1);
}

console.log(`check-eslint-warning-budget: ok warnings=${warnings} baseline=${maxWarnings}`);

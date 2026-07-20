import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const baselinePath = path.join(root, "config", "knip-baseline.json");

function countUnusedExports(report) {
  let n = 0;
  for (const issue of report.issues || []) {
    n += (issue.exports || []).length;
  }
  return n;
}

function countUnusedFiles(report) {
  let n = 0;
  for (const issue of report.issues || []) {
    n += (issue.files || []).length;
  }
  return n;
}

function parseKnipJson(stdout) {
  const idx = stdout.indexOf("{");
  if (idx < 0) throw new Error("knip produced no JSON object");
  return JSON.parse(stdout.slice(idx));
}

if (!fs.existsSync(baselinePath)) {
  console.error("check-knip-baseline: missing config/knip-baseline.json");
  process.exit(1);
}

const baseline = JSON.parse(fs.readFileSync(baselinePath, "utf8"));
const maxExports = Number(baseline.unusedExports);
const maxFiles = Number(baseline.unusedFiles ?? 0);
if (!Number.isFinite(maxExports) || maxExports < 0) {
  console.error("check-knip-baseline: baseline.unusedExports must be a non-negative number");
  process.exit(1);
}

const result = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["knip", "--reporter", "json", "--no-exit-code"],
  { cwd: root, encoding: "utf8", shell: true }
);

if (result.error) {
  console.error("check-knip-baseline: failed to run knip:", result.error.message);
  process.exit(1);
}

const report = parseKnipJson(`${result.stdout || ""}\n${result.stderr || ""}`);
const unusedExports = countUnusedExports(report);
const unusedFiles = countUnusedFiles(report);

const errors = [];
if (unusedExports > maxExports) {
  errors.push(`unusedExports grew: ${unusedExports} > baseline ${maxExports}`);
}
if (unusedFiles > maxFiles) {
  errors.push(`unusedFiles grew: ${unusedFiles} > baseline ${maxFiles}`);
}

if (errors.length) {
  console.error("check-knip-baseline (Step 2d) failed:");
  errors.forEach((e) => console.error(`  ${e}`));
  process.exit(1);
}

console.log(
  `check-knip-baseline: ok (exports ${unusedExports}/${maxExports}, files ${unusedFiles}/${maxFiles})`
);

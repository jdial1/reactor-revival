import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BASELINE_PATH = path.resolve(__dirname, "../../tests/ui/screenshot-baseline.json");

export function hashFile(filePath) {
  const data = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    return { version: 1, expectedCount: 0, hashes: {} };
  }
  return JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
}

export function writeBaseline(baseline) {
  fs.mkdirSync(path.dirname(BASELINE_PATH), { recursive: true });
  fs.writeFileSync(BASELINE_PATH, `${JSON.stringify(baseline, null, 2)}\n`);
}

export function collectHashesFromDir(outputDir, expectedCount) {
  const hashes = {};
  const files = fs.readdirSync(outputDir).filter((name) => name.endsWith(".png")).sort();
  for (const name of files) {
    hashes[name] = hashFile(path.join(outputDir, name));
  }
  return { hashes, count: files.length, expectedCount };
}

export function verifyScreenshotHashes(outputDir, expectedCount, logStep = console.log) {
  const { hashes, count } = collectHashesFromDir(outputDir, expectedCount);
  if (count < expectedCount) {
    return { ok: false, reason: `capture incomplete (${count}/${expectedCount})` };
  }

  const baseline = loadBaseline();
  const baselineHashes = baseline.hashes ?? {};
  const baselineKeys = Object.keys(baselineHashes);

  if (baselineKeys.length === 0) {
    logStep("screenshot hash verify skipped — baseline hashes empty (set UPDATE_SCREENSHOT_BASELINE=1 after review)");
    return { ok: true, skipped: true, count };
  }

  const mismatches = [];
  const missing = [];
  for (const [name, expected] of Object.entries(baselineHashes)) {
    if (!hashes[name]) {
      missing.push(name);
      continue;
    }
    if (hashes[name] !== expected) {
      mismatches.push(name);
    }
  }

  if (missing.length || mismatches.length) {
    if (missing.length) logStep(`hash missing captures: ${missing.join(", ")}`);
    if (mismatches.length) logStep(`hash mismatches: ${mismatches.join(", ")}`);
    return { ok: false, reason: "screenshot hash drift", missing, mismatches, count };
  }

  logStep(`screenshot hash verify passed (${count} files)`);
  return { ok: true, count };
}

export function updateScreenshotBaseline(outputDir, expectedCount, logStep = console.log) {
  const { hashes, count } = collectHashesFromDir(outputDir, expectedCount);
  writeBaseline({ version: 1, expectedCount, hashes });
  logStep(`screenshot baseline updated (${count} hashes → ${path.relative(process.cwd(), BASELINE_PATH)})`);
  return { count };
}

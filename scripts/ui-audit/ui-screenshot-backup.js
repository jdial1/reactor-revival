import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { collectHashesFromDir } from "./ui-screenshot-hashes.js";
import { BASELINE_DIR, DEFAULT_OUTPUT_DIR, expectedScreenshotCount } from "./ui-screenshot-config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_NAME = "manifest.json";

export function baselineManifestPath(baselineDir = BASELINE_DIR) {
  return path.join(baselineDir, MANIFEST_NAME);
}

export function loadBaselineManifest(baselineDir = BASELINE_DIR) {
  const manifestPath = baselineManifestPath(baselineDir);
  if (!fs.existsSync(manifestPath)) return null;
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

export function writeBaselineManifest(baselineDir, manifest) {
  fs.mkdirSync(baselineDir, { recursive: true });
  fs.writeFileSync(baselineManifestPath(baselineDir), `${JSON.stringify(manifest, null, 2)}\n`);
}

export function backupUiScreenshots({
  sourceDir = DEFAULT_OUTPUT_DIR,
  baselineDir = BASELINE_DIR,
  force = process.env.SCREENSHOT_BACKUP_FORCE === "1",
  logStep = console.log,
} = {}) {
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`source dir missing: ${sourceDir}`);
  }

  const pngFiles = fs.readdirSync(sourceDir).filter((name) => name.endsWith(".png")).sort();
  if (pngFiles.length === 0) {
    throw new Error(`no PNG files in ${sourceDir}`);
  }

  const existing = loadBaselineManifest(baselineDir);
  if (existing && !force) {
    logStep(`baseline already exists (${existing.fileCount} files, ${existing.createdAt}) — set SCREENSHOT_BACKUP_FORCE=1 to overwrite`);
    return { skipped: true, baselineDir, manifest: existing };
  }

  fs.mkdirSync(baselineDir, { recursive: true });
  for (const name of pngFiles) {
    fs.copyFileSync(path.join(sourceDir, name), path.join(baselineDir, name));
  }

  const { hashes, count } = collectHashesFromDir(baselineDir, expectedScreenshotCount());
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    sourceDir: path.relative(process.cwd(), sourceDir),
    baselineDir: path.relative(process.cwd(), baselineDir),
    fileCount: count,
    expectedCount: expectedScreenshotCount(),
    files: pngFiles,
    hashes,
  };
  writeBaselineManifest(baselineDir, manifest);
  logStep(`backed up ${count} screenshots → ${path.relative(process.cwd(), baselineDir)}`);
  return { skipped: false, baselineDir, manifest };
}

export function assertBaselineExists(baselineDir = BASELINE_DIR) {
  const manifest = loadBaselineManifest(baselineDir);
  const pngCount = fs.existsSync(baselineDir)
    ? fs.readdirSync(baselineDir).filter((name) => name.endsWith(".png")).length
    : 0;
  if (!manifest || pngCount === 0) {
    throw new Error(
      `baseline missing at ${baselineDir} — run: npm run ui:screenshots:backup`
    );
  }
  return manifest;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = backupUiScreenshots({ logStep: (msg) => console.log(`[ui-screenshot-backup] ${msg}`) });
  if (result.skipped) process.exitCode = 0;
}

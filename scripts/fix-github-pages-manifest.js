import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const MANIFEST_PATH = path.join(__dirname, "..", "public", "manifest.json");
const REPO_NAME = "reactor-revival";

function log(message, color = "reset") {
  const colors = {
    green: "\x1b[32m",
    red: "\x1b[31m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    reset: "\x1b[0m",
  };
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function fixManifest() {
  try {
    log("🔧 Fixing manifest.json for deployment...", "blue");

    // Read current manifest
    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestContent);

    log(`Current start_url: ${manifest.start_url}`, "yellow");

    // Update start_url for GitHub Pages
    const newStartUrl = `/${REPO_NAME}/`;
    manifest.start_url = newStartUrl;

    // Update scope if it exists
    if (manifest.scope) {
      manifest.scope = `/${REPO_NAME}/`;
      log(`Updated scope: ${manifest.scope}`, "yellow");
    }

    // Update shortcuts URLs if they exist
    if (manifest.shortcuts) {
      manifest.shortcuts = manifest.shortcuts.map((shortcut) => {
        if (shortcut.url) {
          if (shortcut.url.startsWith("/") && !shortcut.url.startsWith(`/${REPO_NAME}/`)) {
            shortcut.url = `/${REPO_NAME}${shortcut.url}`;
          } else if (shortcut.url.startsWith("?")) {
            shortcut.url = `/${REPO_NAME}/${shortcut.url}`;
          }
        }
        return shortcut;
      });
      log("✅ Updated shortcuts URLs", "green");
    }

    // Write updated manifest
    const updatedManifestContent = JSON.stringify(manifest, null, 2);
    fs.writeFileSync(MANIFEST_PATH, updatedManifestContent, "utf8");

    log("✅ Manifest.json updated successfully!", "green");
    return true;
  } catch (error) {
    log(`❌ Failed to fix manifest: ${error.message}`, "red");
    return false;
  }
}

function validateManifest() {
  try {
    log("\n🔍 Validating updated manifest...", "blue");

    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestContent);

    // Check required fields
    const requiredFields = ["name", "short_name", "start_url", "display"];
    const missingFields = requiredFields.filter((field) => !manifest[field]);

    if (missingFields.length > 0) {
      log(`❌ Missing required fields: ${missingFields.join(", ")}`, "red");
      return false;
    }

    // Check start_url format
    if (!manifest.start_url.startsWith("/")) {
      log(`❌ start_url should start with "/": ${manifest.start_url}`, "red");
      return false;
    }

    log("✅ Manifest validation passed", "green");
    return true;
  } catch (error) {
    log(`❌ Manifest validation failed: ${error.message}`, "red");
    return false;
  }
}

// Main execution
function main() {
  log("🚀 GitHub Pages Manifest Fixer", "blue");
  log("=".repeat(40), "blue");

  const success = fixManifest();
  if (!success) {
    process.exit(1);
  }

  const isValid = validateManifest();
  if (!isValid) {
    process.exit(1);
  }

  log("\n🎉 Manifest is ready for deployment!", "green");
}

// Handle script execution
if (import.meta.url === path.toFileURL(process.argv[1]).href) {
  main();
}

export {
  fixManifest,
  validateManifest,
};

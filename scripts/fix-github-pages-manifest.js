const fs = require("fs");
const path = require("path");

// Configuration
const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const REPO_NAME = "reactor-revival"; // Change this if your repo name is different

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

function detectEnvironment() {
  // Check if we're in GitHub Actions
  if (process.env.GITHUB_ACTIONS === "true") {
    log("🔍 Detected GitHub Actions environment", "blue");
    return "github-pages";
  }

  // Check command line arguments
  const args = process.argv.slice(2);
  if (args.includes("--github-pages") || args.includes("--gh-pages")) {
    return "github-pages";
  }
  if (args.includes("--local") || args.includes("--dev")) {
    return "local";
  }

  // Default to local
  return "local";
}

function getStartUrlForEnvironment(environment) {
  switch (environment) {
    case "github-pages":
      return `/${REPO_NAME}/`;
    case "local":
    default:
      return "/";
  }
}

function fixManifest() {
  try {
    log("🔧 Fixing manifest.json for deployment...", "blue");

    // Read current manifest
    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestContent);

    log(`Current start_url: ${manifest.start_url}`, "yellow");

    // Detect environment
    const environment = detectEnvironment();
    const newStartUrl = getStartUrlForEnvironment(environment);

    log(`Target environment: ${environment}`, "blue");
    log(`New start_url: ${newStartUrl}`, "yellow");

    // Update start_url
    manifest.start_url = newStartUrl;

    // Also update scope if it exists and needs updating
    if (manifest.scope) {
      if (environment === "github-pages") {
        manifest.scope = `/${REPO_NAME}/`;
      } else {
        manifest.scope = "/";
      }
      log(`Updated scope: ${manifest.scope}`, "yellow");
    }

    // Update shortcuts URLs if they exist
    if (manifest.shortcuts) {
      manifest.shortcuts = manifest.shortcuts.map((shortcut) => {
        if (shortcut.url) {
          if (environment === "github-pages") {
            // Convert relative URLs to GitHub Pages format
            if (
              shortcut.url.startsWith("/") &&
              !shortcut.url.startsWith(`/${REPO_NAME}/`)
            ) {
              shortcut.url = `/${REPO_NAME}${shortcut.url}`;
            } else if (shortcut.url.startsWith("?")) {
              shortcut.url = `/${REPO_NAME}/${shortcut.url}`;
            }
          } else {
            // Convert back to local format
            shortcut.url = shortcut.url.replace(`/${REPO_NAME}`, "");
            if (shortcut.url === "") shortcut.url = "/";
          }
        }
        return shortcut;
      });
      log("✅ Updated shortcuts URLs", "green");
    }

    // Update share_target action if it exists
    if (manifest.share_target && manifest.share_target.action) {
      if (environment === "github-pages") {
        if (!manifest.share_target.action.startsWith(`/${REPO_NAME}/`)) {
          manifest.share_target.action = `/${REPO_NAME}${manifest.share_target.action}`;
        }
      } else {
        manifest.share_target.action = manifest.share_target.action.replace(
          `/${REPO_NAME}`,
          ""
        );
        if (manifest.share_target.action === "")
          manifest.share_target.action = "/";
      }
      log(
        `Updated share_target action: ${manifest.share_target.action}`,
        "yellow"
      );
    }

    // Update protocol handlers if they exist
    if (manifest.protocol_handlers) {
      manifest.protocol_handlers = manifest.protocol_handlers.map((handler) => {
        if (handler.url) {
          if (environment === "github-pages") {
            handler.url = handler.url.replace("/%s", `/${REPO_NAME}/%s`);
          } else {
            handler.url = handler.url.replace(`/${REPO_NAME}/%s`, "/%s");
          }
        }
        return handler;
      });
      log("✅ Updated protocol handlers", "green");
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

    // Check icons
    if (
      !manifest.icons ||
      !Array.isArray(manifest.icons) ||
      manifest.icons.length === 0
    ) {
      log("⚠️  Warning: No icons found in manifest", "yellow");
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
if (require.main === module) {
  main();
}

module.exports = {
  fixManifest,
  validateManifest,
  detectEnvironment,
  getStartUrlForEnvironment,
};

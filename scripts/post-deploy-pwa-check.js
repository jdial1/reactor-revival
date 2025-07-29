import https from "https";
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import our manifest validator (using dynamic import for ESM compatibility)
let validateManifestFromFile;

const initManifestValidator = async () => {
  if (!validateManifestFromFile) {
    try {
      const manifestValidatorModule = await import("../src/utils/manifestValidator.js");
      validateManifestFromFile = manifestValidatorModule.validateManifestFromFile;
    } catch (error) {
      console.warn("Could not load manifest validator:", error.message);
      // Fallback to basic validation
      validateManifestFromFile = async () => ({ isValid: true, score: 100, errors: [], warnings: [] });
    }
  }
};

// Configuration
const GITHUB_PAGES_URL = process.env.GITHUB_PAGES_URL || "https://jdial1.github.io/reactor-revival/";
const BASE_URL = GITHUB_PAGES_URL.replace(/\/$/, "");
const TIMEOUT = 30000; // 30 seconds

// Color codes for console output
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m",
};

function log(message, color = "reset") {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const protocol = urlObj.protocol === "https:" ? https : http;

    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method: options.method || "GET",
      headers: {
        "User-Agent": "PWA-Deployment-Checker/1.0",
        ...options.headers,
      },
      timeout: TIMEOUT,
    };

    const req = protocol.request(requestOptions, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
        });
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Request timeout after ${TIMEOUT}ms`));
    });

    if (options.body) {
      req.write(options.body);
    }
    req.end();
  });
}

async function checkManifest() {
  log("\n🔍 Checking manifest.json...", "blue");

  try {
    const manifestUrl = `${BASE_URL}/manifest.json`;
    const response = await makeRequest(manifestUrl);

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    const manifest = JSON.parse(response.body);

    // Basic validation
    const requiredFields = ["name", "short_name", "start_url", "icons"];
    const missingFields = requiredFields.filter((field) => !manifest[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Validate icons array
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      throw new Error("Icons field must be a non-empty array");
    }

    // Check for appropriate icon sizes
    const iconSizes = manifest.icons.map(icon => {
      const sizes = icon.sizes?.split("x") || [];
      return {
        width: parseInt(sizes[0]) || 0,
        height: parseInt(sizes[1]) || 0,
        purpose: icon.purpose || "any"
      };
    });

    const anyPurposeIcons = iconSizes.filter(icon => icon.purpose === "any");
    const has192Icon = anyPurposeIcons.some(icon => icon.width >= 192 && icon.height >= 192);
    const has512Icon = anyPurposeIcons.some(icon => icon.width >= 512 && icon.height >= 512);

    if (!has192Icon) {
      log("⚠️  No icon with size 192x192 or larger found", "yellow");
    }
    if (!has512Icon) {
      log("⚠️  No icon with size 512x512 or larger found", "yellow");
    }

    log("✅ Manifest.json is valid", "green");
    return true;
  } catch (error) {
    log(`❌ Manifest check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkServiceWorker() {
  log("\n🔍 Checking Service Worker...", "blue");

  try {
    const swUrl = `${BASE_URL}/sw.js`;
    const response = await makeRequest(swUrl);

    if (response.statusCode !== 200) {
      throw new Error(`Service Worker not accessible: HTTP ${response.statusCode}`);
    }

    log("✅ Service Worker is accessible", "green");
    return true;
  } catch (error) {
    log(`❌ Service Worker check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkBrowserCompatibility() {
  log("\n🔍 Checking browser compatibility...", "blue");

  try {
    // Check main JavaScript files for Node.js specific code
    const filesToCheck = ["/js/performance.js", "/js/app.js", "/js/game.js"];

    for (const file of filesToCheck) {
      const fileUrl = `${BASE_URL}${file}`;
      const response = await makeRequest(fileUrl);

      if (response.statusCode !== 200) {
        log(
          `⚠️ Could not check ${file}: HTTP ${response.statusCode}`,
          "yellow"
        );
        continue;
      }

      const content = response.body;

      // Check for problematic Node.js patterns
      const nodePatterns = [
        /process\.env(?!\s*\?\s*)/g, // process.env without proper browser check
        /require\s*\(/g, // CommonJS require
        /module\.exports/g, // CommonJS exports
        /global\./g, // Node.js global object
        /Buffer\(/g, // Node.js Buffer
        /__dirname/g, // Node.js __dirname
        /__filename/g, // Node.js __filename
      ];

      for (const pattern of nodePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          // Check if it's properly handled with browser compatibility checks
          const lines = content.split("\n");
          let hasProperCheck = false;

          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              // Look for browser compatibility checks nearby
              const contextLines = lines
                .slice(Math.max(0, i - 3), i + 4)
                .join("\n");
              if (
                contextLines.includes("typeof process") ||
                contextLines.includes("typeof window") ||
                contextLines.includes("typeof global")
              ) {
                hasProperCheck = true;
                break;
              }
            }
          }

          if (!hasProperCheck) {
            log(
              `❌ Found unguarded Node.js code in ${file}: ${matches[0]}`,
              "red"
            );
            return false;
          }
        }
      }
    }

    log("✅ No browser compatibility issues detected", "green");
    return true;
  } catch (error) {
    log(`❌ Browser compatibility check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkServiceWorkerRegistration() {
  log("\n🔍 Checking Service Worker registration logic...", "blue");

  try {
    const indexUrl = `${BASE_URL}/`;
    const response = await makeRequest(indexUrl);

    if (response.statusCode !== 200) {
      throw new Error(
        `Could not access index page: HTTP ${response.statusCode}`
      );
    }

    const content = response.body;

    // Check for GitHub Pages aware service worker registration
    const hasGitHubPagesLogic = (() => {
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = content.match(urlRegex) || [];
      return urls.some((url) => {
        try {
          const parsedUrl = new URL(url);
          return parsedUrl.host.endsWith("github.io");
        } catch {
          return false;
        }
      }) || content.includes("pathParts") || content.includes("repoName");
    })();

    const hasServiceWorkerRegistration = content.includes(
      "serviceWorker.register"
    );

    if (!hasServiceWorkerRegistration) {
      log("❌ No service worker registration found in index.html", "red");
      return false;
    }

    if (!hasGitHubPagesLogic) {
      log(
        "⚠️ Service worker registration may not handle GitHub Pages paths correctly",
        "yellow"
      );
      // This is a warning, not a failure
    }

    log("✅ Service Worker registration logic looks correct", "green");
    return true;
  } catch (error) {
    log(`❌ Service Worker registration check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkMainPage() {
  log("\n🔍 Checking main page...", "blue");

  try {
    const response = await makeRequest(`${BASE_URL}/`);

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    log("✅ Main page is accessible", "green");
    return true;
  } catch (error) {
    log(`❌ Main page check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkCriticalAssets() {
  log("\n🔍 Checking critical assets...", "blue");

  const criticalAssets = [
    "/css/main.css",
    "/manifest.json",
    "/sw.js",
    "/index.html",
  ];

  try {
    for (const asset of criticalAssets) {
      const assetUrl = `${BASE_URL}${asset}`;
      const response = await makeRequest(assetUrl);

      if (response.statusCode === 200) {
        log(`✅ ${asset}`, "green");
      } else {
        log(`❌ ${asset} - HTTP ${response.statusCode}`, "red");
        return false;
      }
    }

    log("");
    return true;
  } catch (error) {
    log(`❌ Critical assets check failed: ${error.message}`, "red");
    return false;
  }
}

async function runAllChecks() {
  log(`${colors.bold}🚀 PWA Deployment Check${colors.reset}`, "blue");
  log(`Target URL: ${BASE_URL}`, "yellow");
  log("=".repeat(50), "blue");

  const checkFunctions = [
    { name: "Manifest", fn: checkManifest },
    { name: "Service Worker", fn: checkServiceWorker },
    { name: "Main Page", fn: checkMainPage },
    { name: "Critical Assets", fn: checkCriticalAssets },
  ];

  const checkResults = [];
  let passedChecks = 0;

  for (const check of checkFunctions) {
    try {
      const result = await check.fn();
      checkResults.push({ name: check.name, passed: result });
      if (result) passedChecks++;
    } catch (error) {
      log(`❌ ${check.name} check crashed: ${error.message}`, "red");
      checkResults.push({ name: check.name, passed: false });
    }
  }

  // Summary
  log("\n" + "=".repeat(50), "blue");
  log(`${colors.bold}📋 Summary${colors.reset}`, "blue");

  checkResults.forEach((check) => {
    const status = check.passed ? "✅ PASS" : "❌ FAIL";
    const color = check.passed ? "green" : "red";
    log(`${status} ${check.name}`, color);
  });

  log(
    `\n${passedChecks}/${checkResults.length} checks passed`,
    passedChecks === checkResults.length ? "green" : "red"
  );

  if (passedChecks === checkResults.length) {
    log("\n🎉 All PWA checks passed!", "green");
    process.exit(0);
  } else {
    log("\n💥 Some PWA checks failed.", "red");
    process.exit(1);
  }
}

// Handle command line arguments
if (process.argv.length > 2) {
  const customUrl = process.argv[2];
  if (customUrl.startsWith("http")) {
    process.env.GITHUB_PAGES_URL = customUrl;
    log(`Using custom URL: ${customUrl}`, "yellow");
  }
}

// Run the checks
runAllChecks()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`💥 Fatal error during PWA checks: ${error.message}`, "red");
    process.exit(1);
  });

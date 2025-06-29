const https = require("https");
const fs = require("fs");
const path = require("path");
const http = require("http");

// Configuration
const GITHUB_PAGES_URL =
  process.env.GITHUB_PAGES_URL || "https://jdial1.github.io/reactor-revival/";
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

async function checkManifestStartUrl() {
  log("\n🔍 Checking manifest.json start_url configuration...", "blue");

  try {
    const manifestUrl = `${BASE_URL}/manifest.json`;
    const response = await makeRequest(manifestUrl);

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    const manifest = JSON.parse(response.body);
    const startUrl = manifest.start_url;

    log(`Local manifest start_url: ${startUrl}`, "yellow");
    log(`Deployed manifest start_url: ${startUrl}`, "yellow");

    // For GitHub Pages, start_url should match the repository path
    const expectedPath = BASE_URL.replace(/^https?:\/\/[^\/]+/, "") + "/";
    if (
      startUrl === expectedPath ||
      (startUrl === "/" && expectedPath === "/")
    ) {
      log(`✅ Manifest start_url is valid: ${startUrl}`, "green");
      return true;
    } else {
      log(
        `❌ Manifest start_url mismatch. Expected: ${expectedPath}, Got: ${startUrl}`,
        "red"
      );
      return false;
    }
  } catch (error) {
    log(`❌ Failed to check manifest: ${error.message}`, "red");
    return false;
  }
}

async function checkServiceWorker() {
  log("\n🔍 Checking Service Worker...", "blue");

  try {
    const swUrl = `${BASE_URL}/sw.js`;
    const response = await makeRequest(swUrl);

    if (response.statusCode !== 200) {
      throw new Error(
        `Service Worker not accessible: HTTP ${response.statusCode}`
      );
    }

    const swContent = response.body;

    // Check for expected Workbox patterns
    const hasWorkbox =
      swContent.includes("workbox") || swContent.includes("precache");
    const hasImportScripts = swContent.includes("importScripts");

    if (!hasWorkbox && !hasImportScripts) {
      throw new Error(
        "Service Worker does not contain expected Workbox patterns"
      );
    }

    log(
      "✅ Service Worker is accessible and contains expected patterns",
      "green"
    );
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
    const hasGitHubPagesLogic =
      content.includes("github.io") ||
      content.includes("pathParts") ||
      content.includes("repoName");

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
  log("\n🔍 Checking main page accessibility...", "blue");

  try {
    const response = await makeRequest(`${BASE_URL}/`);

    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }

    const content = response.body.toLowerCase();

    // Check for expected content
    const hasTitle = content.includes("reactor") || content.includes("revival");
    const hasManifest = content.includes("manifest.json");
    const hasAppScript = content.includes("js/app.js");

    if (!hasTitle || !hasManifest || !hasAppScript) {
      throw new Error("Page missing expected content");
    }

    log("✅ Main page is accessible and contains expected content", "green");
    return true;
  } catch (error) {
    log(`❌ Main page check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkPWAInstallability() {
  log("\n🔍 Checking PWA installability requirements...", "blue");

  try {
    const manifestUrl = `${BASE_URL}/manifest.json`;
    const response = await makeRequest(manifestUrl);

    if (response.statusCode !== 200) {
      throw new Error(`Manifest not accessible: HTTP ${response.statusCode}`);
    }

    const manifest = JSON.parse(response.body);

    // Check required fields for installability
    const requiredFields = [
      "name",
      "short_name",
      "start_url",
      "display",
      "icons",
    ];
    const missingFields = requiredFields.filter((field) => !manifest[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }

    // Check for sufficient icon sizes
    const hasLargeIcon = manifest.icons.some((icon) => {
      const sizes = icon.sizes.split("x");
      return parseInt(sizes[0]) >= 192;
    });

    if (!hasLargeIcon) {
      throw new Error("No icon with size >= 192x192");
    }

    log("✅ PWA manifest meets installability requirements", "green");
    return true;
  } catch (error) {
    log(`❌ PWA installability check failed: ${error.message}`, "red");
    return false;
  }
}

async function checkCriticalAssets() {
  log("\n🔍 Checking critical assets...", "blue");

  const criticalAssets = [
    "/css/main.css",
    "/js/app.js",
    "/js/game.js",
    "/pages/game.html",
    "/offline.html",
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

async function checkSecurity() {
  log("\n🔍 Checking HTTPS and security headers...", "blue");

  try {
    if (!BASE_URL.startsWith("https://")) {
      log("❌ Site is not served over HTTPS", "red");
      return false;
    }

    log("✅ Site is served over HTTPS", "green");

    const response = await makeRequest(`${BASE_URL}/`);
    const headers = response.headers;

    // Check for security headers (optional but recommended)
    const securityHeaders = {
      "strict-transport-security": "HSTS",
      "x-content-type-options": "x-content-type-options",
      "x-frame-options": "x-frame-options",
    };

    for (const [header, name] of Object.entries(securityHeaders)) {
      if (headers[header]) {
        log(`✅ ${name} header present`, "green");
      } else {
        log(`ℹ️  Optional security header missing: ${name}`, "blue");
      }
    }

    log("");
    return true;
  } catch (error) {
    log(`❌ Security check failed: ${error.message}`, "red");
    return false;
  }
}

async function runAllChecks() {
  log(`${colors.bold}🚀 PWA Post-Deployment Check${colors.reset}`, "blue");
  log(`Target URL: ${BASE_URL}`, "yellow");
  log("=".repeat(50), "blue");

  const checkFunctions = [
    { name: "Manifest Start URL", fn: checkManifestStartUrl },
    { name: "Service Worker", fn: checkServiceWorker },
    { name: "Browser Compatibility", fn: checkBrowserCompatibility },
    { name: "Service Worker Registration", fn: checkServiceWorkerRegistration },
    { name: "Main Page", fn: checkMainPage },
    { name: "PWA Installability", fn: checkPWAInstallability },
    { name: "Critical Assets", fn: checkCriticalAssets },
    { name: "HTTPS & Security", fn: checkSecurity },
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
    log("\n🎉 All PWA checks passed! Deployment is successful.", "green");
    process.exit(0);
  } else {
    log("\n💥 Some PWA checks failed. Please review the issues above.", "red");
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

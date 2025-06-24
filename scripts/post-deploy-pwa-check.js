const https = require("https");
const fs = require("fs");
const path = require("path");

// Configuration
const BASE_URL =
  process.env.GITHUB_PAGES_URL || "https://jdial1.github.io/reactor-revival";
const TIMEOUT = 10000; // 10 seconds

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

function makeRequest(url) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: TIMEOUT }, (response) => {
      let data = "";

      response.on("data", (chunk) => {
        data += chunk;
      });

      response.on("end", () => {
        resolve({
          statusCode: response.statusCode,
          headers: response.headers,
          data: data,
          url: url,
        });
      });
    });

    request.on("timeout", () => {
      request.destroy();
      reject(new Error(`Request timeout after ${TIMEOUT}ms`));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function checkManifestStartUrl() {
  log("\n🔍 Checking manifest.json start_url configuration...", "blue");

  try {
    // Read local manifest
    const localManifestPath = path.join(__dirname, "..", "manifest.json");
    const localManifest = JSON.parse(
      fs.readFileSync(localManifestPath, "utf8")
    );

    log(`Local manifest start_url: ${localManifest.start_url}`, "yellow");

    // Check deployed manifest
    const manifestUrl = `${BASE_URL}/manifest.json`;
    const response = await makeRequest(manifestUrl);

    if (response.statusCode !== 200) {
      throw new Error(`Failed to fetch manifest: HTTP ${response.statusCode}`);
    }

    const deployedManifest = JSON.parse(response.data);
    log(`Deployed manifest start_url: ${deployedManifest.start_url}`, "yellow");

    // Validate start_url
    const expectedStartUrls = [
      "/",
      "./",
      "/reactor-revival/",
      "./reactor-revival/",
    ];

    if (!expectedStartUrls.includes(deployedManifest.start_url)) {
      log(`❌ Invalid start_url: ${deployedManifest.start_url}`, "red");
      log(`Expected one of: ${expectedStartUrls.join(", ")}`, "yellow");
      return false;
    }

    log(
      `✅ Manifest start_url is valid: ${deployedManifest.start_url}`,
      "green"
    );
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
      throw new Error(`Service Worker not found: HTTP ${response.statusCode}`);
    }

    // Check if service worker contains expected content
    const swContent = response.data;
    const expectedPatterns = ["workbox", "precacheAndRoute", "registerRoute"];

    for (const pattern of expectedPatterns) {
      if (!swContent.includes(pattern)) {
        throw new Error(`Service Worker missing expected pattern: ${pattern}`);
      }
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

async function checkMainPage() {
  log("\n🔍 Checking main page accessibility...", "blue");

  try {
    const response = await makeRequest(BASE_URL);

    if (response.statusCode !== 200) {
      throw new Error(`Main page not accessible: HTTP ${response.statusCode}`);
    }

    const htmlContent = response.data;
    const expectedPatterns = [
      "Reactor Revival",
      "manifest.json",
      "js/app.js",
      "serviceWorker",
    ];

    for (const pattern of expectedPatterns) {
      if (!htmlContent.includes(pattern)) {
        throw new Error(`Main page missing expected content: ${pattern}`);
      }
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
    // Check manifest
    const manifestUrl = `${BASE_URL}/manifest.json`;
    const manifestResponse = await makeRequest(manifestUrl);

    if (manifestResponse.statusCode !== 200) {
      throw new Error("Manifest not accessible");
    }

    const manifest = JSON.parse(manifestResponse.data);

    // Check required PWA fields
    const requiredFields = [
      "name",
      "short_name",
      "start_url",
      "display",
      "icons",
    ];

    for (const field of requiredFields) {
      if (!manifest[field]) {
        throw new Error(`Manifest missing required field: ${field}`);
      }
    }

    // Check icons
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      throw new Error("Manifest must contain at least one icon");
    }

    // Check for required icon sizes
    const iconSizes = manifest.icons.map((icon) => icon.sizes);
    const hasRequiredSizes = iconSizes.some(
      (size) => size && (size.includes("192x192") || size.includes("512x512"))
    );

    if (!hasRequiredSizes) {
      log("⚠️  Warning: No 192x192 or 512x512 icons found", "yellow");
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
    "/css/app.css",
    "/js/app.js",
    "/js/game.js",
    "/pages/game.html",
    "/offline.html",
  ];

  let allPresent = true;

  for (const asset of criticalAssets) {
    try {
      const url = `${BASE_URL}${asset}`;
      const response = await makeRequest(url);

      if (response.statusCode === 200) {
        log(`✅ ${asset}`, "green");
      } else {
        log(`❌ ${asset} - HTTP ${response.statusCode}`, "red");
        allPresent = false;
      }
    } catch (error) {
      log(`❌ ${asset} - ${error.message}`, "red");
      allPresent = false;
    }
  }

  return allPresent;
}

async function checkHTTPSHeaders() {
  log("\n🔍 Checking HTTPS and security headers...", "blue");

  try {
    const response = await makeRequest(BASE_URL);

    // Check if we're on HTTPS
    if (!BASE_URL.startsWith("https://")) {
      log(
        "⚠️  Warning: Not using HTTPS - PWA features may be limited",
        "yellow"
      );
      return false;
    }

    // Check for service worker requirements
    const headers = response.headers;
    log("✅ Site is served over HTTPS", "green");

    // Optional: Check for additional security headers
    const securityHeaders = ["x-content-type-options", "x-frame-options"];

    for (const header of securityHeaders) {
      if (headers[header]) {
        log(`✅ Security header present: ${header}`, "green");
      } else {
        log(`ℹ️  Optional security header missing: ${header}`, "blue");
      }
    }

    return true;
  } catch (error) {
    log(`❌ HTTPS check failed: ${error.message}`, "red");
    return false;
  }
}

async function runAllChecks() {
  log(`${colors.bold}🚀 PWA Post-Deployment Check${colors.reset}`, "blue");
  log(`Target URL: ${BASE_URL}`, "yellow");
  log("=".repeat(50), "blue");

  const checks = [
    { name: "Manifest Start URL", fn: checkManifestStartUrl },
    { name: "Service Worker", fn: checkServiceWorker },
    { name: "Main Page", fn: checkMainPage },
    { name: "PWA Installability", fn: checkPWAInstallability },
    { name: "Critical Assets", fn: checkCriticalAssets },
    { name: "HTTPS & Security", fn: checkHTTPSHeaders },
  ];

  const results = [];

  for (const check of checks) {
    try {
      const result = await check.fn();
      results.push({ name: check.name, passed: result });
    } catch (error) {
      log(`❌ ${check.name} failed with error: ${error.message}`, "red");
      results.push({ name: check.name, passed: false, error: error.message });
    }
  }

  // Summary
  log("\n" + "=".repeat(50), "blue");
  log(`${colors.bold}📋 Summary${colors.reset}`, "blue");

  const passedChecks = results.filter((r) => r.passed).length;
  const totalChecks = results.length;

  results.forEach((result) => {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    const color = result.passed ? "green" : "red";
    log(`${status} ${result.name}`, color);
    if (result.error) {
      log(`    Error: ${result.error}`, "red");
    }
  });

  log(
    `\n${passedChecks}/${totalChecks} checks passed`,
    passedChecks === totalChecks ? "green" : "red"
  );

  if (passedChecks === totalChecks) {
    log("\n🎉 All PWA checks passed! Deployment is successful.", "green");
    return true;
  } else {
    log("\n💥 Some PWA checks failed. Please review the issues above.", "red");
    return false;
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
    log(`Fatal error: ${error.message}`, "red");
    process.exit(1);
  });

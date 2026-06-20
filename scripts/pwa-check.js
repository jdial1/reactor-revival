import fs from "fs";
import https from "https";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "..", "public");

const REPO_NAME = "reactor-revival";
const MANIFEST_PATH = path.join(publicDir, "manifest.json");

const DEFAULT_REMOTE_URL = "https://jdial1.github.io/reactor-revival/";
const TIMEOUT = 30000;
const MAX_RETRIES = 5;
const INITIAL_DELAY = 10000;

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

const PWA_ROOT_FILES = ["sw.js", "manifest.json", "browserconfig.xml"];

function runLocalRootCheck() {
  let ok = true;
  for (const file of PWA_ROOT_FILES) {
    const filePath = path.join(publicDir, file);
    if (fs.existsSync(filePath)) {
      console.log(`✅ Found: ${file}`);
    } else {
      console.warn(`❌ Missing: ${file}`);
      ok = false;
    }
  }
  process.exitCode = ok ? 0 : 1;
}

function fixManifest() {
  try {
    log("🔧 Fixing manifest.json for deployment...", "blue");
    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestContent);
    log(`Current start_url: ${manifest.start_url}`, "yellow");
    manifest.start_url = `/${REPO_NAME}/`;
    if (manifest.scope) {
      manifest.scope = `/${REPO_NAME}/`;
      log(`Updated scope: ${manifest.scope}`, "yellow");
    }
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
    fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), "utf8");
    log("✅ Manifest.json updated successfully!", "green");
    return true;
  } catch (error) {
    log(`❌ Failed to fix manifest: ${error.message}`, "red");
    return false;
  }
}

function validateManifestFile() {
  try {
    log("\n🔍 Validating updated manifest...", "blue");
    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    const manifest = JSON.parse(manifestContent);
    const requiredFields = ["name", "short_name", "start_url", "display"];
    const missingFields = requiredFields.filter((field) => !manifest[field]);
    if (missingFields.length > 0) {
      log(`❌ Missing required fields: ${missingFields.join(", ")}`, "red");
      return false;
    }
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

function runFixManifest() {
  log("🚀 GitHub Pages Manifest Fixer", "blue");
  log("=".repeat(40), "blue");
  if (!fixManifest()) process.exit(1);
  if (!validateManifestFile()) process.exit(1);
  log("\n🎉 Manifest is ready for deployment!", "green");
}

function getBaseUrl() {
  const fromEnv = process.env.GITHUB_PAGES_URL;
  if (fromEnv && fromEnv.trim()) {
    return fromEnv.replace(/\/$/, "");
  }
  return DEFAULT_REMOTE_URL.replace(/\/$/, "");
}

let BASE_URL = getBaseUrl();

async function retryWithBackoff(fn, maxRetries = MAX_RETRIES, initialDelay = INITIAL_DELAY) {
  let delay = initialDelay;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxRetries) throw error;
      log(`⚠️  Attempt ${attempt} failed: ${error.message}`, "yellow");
      log(`⏳ Waiting ${delay / 1000} seconds before retry...`, "yellow");
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay *= 2;
    }
  }
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
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function checkSiteAvailability() {
  log("\n🔍 Checking if site is available...", "blue");
  try {
    const response = await makeRequest(`${BASE_URL}/index.html`);
    if (response.statusCode === 200) {
      log("✅ Site is available!", "green");
      return true;
    }
    throw new Error(`HTTP ${response.statusCode}`);
  } catch (error) {
    throw new Error(`Site not available: ${error.message}`);
  }
}

async function checkManifest() {
  log("\n🔍 Checking manifest.json...", "blue");
  try {
    const response = await makeRequest(`${BASE_URL}/manifest.json`);
    if (response.statusCode !== 200) {
      throw new Error(`HTTP ${response.statusCode}`);
    }
    const manifest = JSON.parse(response.body);
    const requiredFields = ["name", "short_name", "start_url", "icons"];
    const missingFields = requiredFields.filter((field) => !manifest[field]);
    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(", ")}`);
    }
    if (!Array.isArray(manifest.icons) || manifest.icons.length === 0) {
      throw new Error("Icons field must be a non-empty array");
    }
    const iconSizes = manifest.icons.map((icon) => {
      const sizes = icon.sizes?.split("x") || [];
      return {
        width: parseInt(sizes[0]) || 0,
        height: parseInt(sizes[1]) || 0,
        purpose: icon.purpose || "any",
      };
    });
    const anyPurposeIcons = iconSizes.filter((icon) => icon.purpose === "any");
    const has192Icon = anyPurposeIcons.some((icon) => icon.width >= 192 && icon.height >= 192);
    const has512Icon = anyPurposeIcons.some((icon) => icon.width >= 512 && icon.height >= 512);
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
    const response = await makeRequest(`${BASE_URL}/sw.js`);
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
    const filesToCheck = ["/js/performance.js", "/js/app.js", "/js/game.js"];
    for (const file of filesToCheck) {
      const response = await makeRequest(`${BASE_URL}${file}`);
      if (response.statusCode !== 200) {
        log(`⚠️ Could not check ${file}: HTTP ${response.statusCode}`, "yellow");
        continue;
      }
      const content = response.body;
      const nodePatterns = [
        /process\.env(?!\s*\?\s*)/g,
        /require\s*\(/g,
        /module\.exports/g,
        /global\./g,
        /Buffer\(/g,
        /__dirname/g,
        /__filename/g,
      ];
      for (const pattern of nodePatterns) {
        const matches = content.match(pattern);
        if (matches) {
          const lines = content.split("\n");
          let hasProperCheck = false;
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              const contextLines = lines.slice(Math.max(0, i - 3), i + 4).join("\n");
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
            log(`❌ Found unguarded Node.js code in ${file}: ${matches[0]}`, "red");
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
    const response = await makeRequest(`${BASE_URL}/`);
    if (response.statusCode !== 200) {
      throw new Error(`Could not access index page: HTTP ${response.statusCode}`);
    }
    const content = response.body;
    const urlRegex = /https?:\/\/[^\s]+/g;
    const urls = content.match(urlRegex) || [];
    const hasGitHubPagesLogic =
      urls.some((url) => {
        try {
          return new URL(url).host.endsWith("github.io");
        } catch {
          return false;
        }
      }) ||
      content.includes("pathParts") ||
      content.includes("repoName");
    const hasServiceWorkerRegistration = content.includes("serviceWorker.register");
    if (!hasServiceWorkerRegistration) {
      log("❌ No service worker registration found in index.html", "red");
      return false;
    }
    if (!hasGitHubPagesLogic) {
      log(
        "⚠️ Service worker registration may not handle GitHub Pages paths correctly",
        "yellow"
      );
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
  const criticalAssets = ["/css/main.css", "/manifest.json", "/sw.js", "/index.html"];
  try {
    for (const asset of criticalAssets) {
      const response = await makeRequest(`${BASE_URL}${asset}`);
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

const CHECK_REGISTRY = {
  site: { name: "Site Availability", fn: checkSiteAvailability },
  manifest: { name: "Manifest", fn: checkManifest },
  sw: { name: "Service Worker", fn: checkServiceWorker },
  main: { name: "Main Page", fn: checkMainPage },
  assets: { name: "Critical Assets", fn: checkCriticalAssets },
  browser: { name: "Browser Compatibility", fn: checkBrowserCompatibility },
  swRegistration: { name: "SW Registration", fn: checkServiceWorkerRegistration },
};

const DEFAULT_CHECKS = ["site", "manifest", "sw", "main", "assets"];

async function runDiagnostics(checksToRun = DEFAULT_CHECKS) {
  const checkResults = [];
  let passedChecks = 0;
  let remaining = [...checksToRun];
  const siteIdx = remaining.indexOf("site");
  if (siteIdx >= 0) {
    try {
      await retryWithBackoff(checkSiteAvailability);
      checkResults.push({ name: CHECK_REGISTRY.site.name, passed: true });
      passedChecks++;
    } catch (error) {
      log(`💥 Site availability check failed after ${MAX_RETRIES} attempts: ${error.message}`, "red");
      log("💡 This might be due to GitHub Pages deployment delay. Try again in a few minutes.", "yellow");
      throw error;
    }
    remaining = remaining.filter((_, i) => i !== siteIdx);
  }
  for (const id of remaining) {
    const entry = CHECK_REGISTRY[id];
    if (!entry) continue;
    try {
      const result = await entry.fn();
      checkResults.push({ name: entry.name, passed: result });
      if (result) passedChecks++;
    } catch (error) {
      log(`❌ ${entry.name} check crashed: ${error.message}`, "red");
      checkResults.push({ name: entry.name, passed: false });
    }
  }
  return { checkResults, passedChecks };
}

async function runRemoteChecks(checksToRun = DEFAULT_CHECKS) {
  log(`${colors.bold}🚀 PWA Deployment Check${colors.reset}`, "blue");
  log(`Target URL: ${BASE_URL}`, "yellow");
  log("=".repeat(50), "blue");
  let checkResults;
  let passedChecks;
  try {
    const result = await runDiagnostics(checksToRun);
    checkResults = result.checkResults;
    passedChecks = result.passedChecks;
  } catch {
    process.exit(1);
  }
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
  }
  log("\n💥 Some PWA checks failed.", "red");
  process.exit(1);
}

function parseArgs(argv) {
  let fixManifestOnly = false;
  let remote = false;
  let checksToRun = DEFAULT_CHECKS;
  for (const arg of argv) {
    if (arg === "--fix-manifest") {
      fixManifestOnly = true;
    } else if (arg === "--remote") {
      remote = true;
    } else if (arg.startsWith("--checks=")) {
      checksToRun = arg
        .slice(9)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
    } else if (arg.startsWith("http")) {
      process.env.GITHUB_PAGES_URL = arg;
      BASE_URL = arg.replace(/\/$/, "");
      remote = true;
      log(`Using custom URL: ${arg}`, "yellow");
    }
  }
  return { fixManifestOnly, remote, checksToRun };
}

const args = process.argv.slice(2);
const { fixManifestOnly, remote, checksToRun } = parseArgs(args);

if (fixManifestOnly) {
  runFixManifest();
} else if (remote) {
  BASE_URL = getBaseUrl();
  runRemoteChecks(checksToRun).catch((error) => {
    log(`💥 Fatal error during PWA checks: ${error.message}`, "red");
    process.exit(1);
  });
} else {
  runLocalRootCheck();
}

import { getResourceUrl } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { VersionSchema } from "../../core/schemas.js";

async function fetchVersionFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return response.text();
}

function parseVersionFromResponse(text) {
  try {
    const data = JSON.parse(text);
    const parsed = VersionSchema.safeParse(data);
    return parsed.success ? parsed.data.version : "Unknown";
  } catch {
    return "Unknown";
  }
}

async function tryPrimaryVersionUrl() {
  const versionUrl = getResourceUrl("version.json");
  try {
    return await fetchVersionFromUrl(versionUrl);
  } catch (urlError) {
    logger.log('warn', 'splash', 'Primary URL failed, trying direct path:', urlError);
    return await fetchVersionFromUrl("/version.json");
  }
}

async function tryDirectOrAbsolutePath() {
  try {
    const directResponse = await fetch("./version.json");
    if (directResponse.ok) return parseVersionFromResponse(await directResponse.text());
  } catch (directError) {
    logger.warn("Could not load direct local version:", directError);
  }
  try {
    const absoluteResponse = await fetch("/version.json");
    if (absoluteResponse.ok) return parseVersionFromResponse(await absoluteResponse.text());
  } catch (absoluteError) {
    logger.log('warn', 'splash', 'Could not load absolute path version:', absoluteError);
  }
  return null;
}

async function tryLocalVersionFallback(versionChecker) {
  const localVersion = await versionChecker.getLocalVersion();
  if (localVersion) return localVersion;
  return await tryDirectOrAbsolutePath();
}

export async function fetchVersionForSplash(versionChecker) {
  try {
    const responseText = await tryPrimaryVersionUrl();
    return parseVersionFromResponse(responseText);
  } catch (error) {
    logger.warn("Could not load version info:", error);
    try {
      const fallback = await tryLocalVersionFallback(versionChecker);
      return fallback ?? "Unknown";
    } catch (localError) {
      logger.log('warn', 'splash', 'Could not load local version:', localError);
      return "Unknown";
    }
  }
}

export function addSplashStats(splashScreen, version, versionChecker) {
  const versionText = splashScreen.querySelector("#splash-version-text");
  if (versionText) {
    versionText.textContent = `v.${version}`;
    versionText.title = "Click to check for updates";
    versionText.style.cursor = "pointer";
    versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  }
}

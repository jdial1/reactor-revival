import { html } from "lit-html";
import { VersionSchema } from "../../schema/index.js";
import { getResourceUrl } from "../../dom/lit.js";
import { logger } from "../../core/logger.js";
import { bindLitRenderMulti } from "../../dom/lit-reactive.js";
import { pwaState } from "../../state/ui-state.js";
import { getUiElement } from "../shell/page-dom.js";
import { setClassFlag } from "../../dom/class-flags.js";

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
    logger.log("warn", "splash", "Primary URL failed, trying direct path:", urlError);
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
    logger.log("warn", "splash", "Could not load absolute path version:", absoluteError);
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
      logger.log("warn", "splash", "Could not load local version:", localError);
      return "Unknown";
    }
  }
}

export function mountSplashUserCountReactive(_splashScreen, ui) {
  const userCountEl = getUiElement(null, "user-count-text");
  if (!userCountEl || !ui?.uiState) return () => {};
  return bindLitRenderMulti(
    [{ state: ui.uiState, keys: ["user_count"] }],
    () => html`${ui.uiState?.user_count ?? 0}`,
    userCountEl
  );
}

export function addSplashStats(splashScreen, version, versionChecker, ui) {
  const versionText = getUiElement(null, "splash-version-text");
  if (!versionText) return () => {};
  versionText.style.cursor = "pointer";
  versionText.onclick = () => versionChecker.triggerVersionCheckToast();
  if (ui?.uiState) {
    return bindLitRenderMulti(
      [
        { state: ui.uiState, keys: ["version"] },
        { state: pwaState, keys: ["updateAvailable", "hasAcknowledgedUpdate"] },
      ],
      () => {
        const showNew = pwaState.updateAvailable && !pwaState.hasAcknowledgedUpdate;
        setClassFlag(versionText, "new-version", showNew);
        versionText.title = showNew ? "New version available — click for details" : "Click to check for updates";
        return html`v.${ui.uiState?.version ?? ""}`;
      },
      versionText
    );
  }
  versionText.textContent = `v.${version}`;
  return () => {};
}

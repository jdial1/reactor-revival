import path from "path";
import fs from "fs";
import { describe, it, expect, beforeEach, afterEach, vi } from "../helpers/setup.js";
import { VersionChecker } from "../../public/src/services.js";
import { StorageUtils } from "../../public/src/utils.js";

describe("Group 12: PWA, Service Worker & Versioning", () => {
  let versionChecker;

  beforeEach(() => {
    versionChecker = new VersionChecker({});
    StorageUtils.remove("reactor-last-notified-version");
    if (!navigator.serviceWorker || typeof navigator.serviceWorker.addEventListener !== "function") {
      Object.defineProperty(navigator, "serviceWorker", {
        value: new EventTarget(),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    StorageUtils.remove("reactor-last-notified-version");
  });

  it("locks strict version comparison logic for update toasts", () => {
    expect(versionChecker.isNewerVersion("25_07_28-2133", "25_07_28-2000")).toBe(true);
    expect(versionChecker.isNewerVersion("25_07_28-2000", "25_07_28-2133")).toBe(false);
    expect(versionChecker.isNewerVersion("1.4.0", "1.4.0")).toBe(false);
  });

  it("locks service worker navigation NetworkFirst plus offline fallback to index cache", () => {
    const swPath = path.resolve(__dirname, "../../src-sw.js");
    const swSource = fs.readFileSync(swPath, "utf-8");

    expect(swSource).toContain('request.mode === "navigate"');
    expect(swSource).toContain("new workbox.strategies.NetworkFirst");
    expect(swSource).toContain("workbox.routing.setCatchHandler");
    expect(swSource).toContain('return caches.match("/index.html")');
  });

  it("locks strict manifest requirements for start_url and maskable icon sizes", () => {
    const manifestPath = path.resolve(__dirname, "../../public/manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
    expect(typeof manifest.start_url).toBe("string");
    expect(manifest.start_url.length).toBeGreaterThan(0);
    expect(manifest.start_url.startsWith("/")).toBe(true);

    const maskableSizes = manifest.icons
      .filter((icon) => icon.purpose === "maskable")
      .map((icon) => icon.sizes);

    expect(maskableSizes).toContain("192x192");
    expect(maskableSizes).toContain("512x512");
  });

  it("checkForNewVersion calls handleNewVersion when deployed version sorts newer than local", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        headers: { get: () => "application/json" },
        json: async () => ({ version: "v-local" }),
      }))
    );
    vi.spyOn(versionChecker, "checkDeployedVersion").mockResolvedValue("v-remote");
    const spy = vi.spyOn(versionChecker, "handleNewVersion");
    await versionChecker.checkForNewVersion();
    expect(spy).toHaveBeenCalledWith("v-remote", "v-local");
  });

  it("startVersionChecking routes service worker NEW_VERSION_AVAILABLE to handleNewVersion", () => {
    const spy = vi.spyOn(versionChecker, "handleNewVersion");
    versionChecker.startVersionChecking();
    navigator.serviceWorker.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "NEW_VERSION_AVAILABLE", version: "sw-new", currentVersion: "sw-old" },
      })
    );
    expect(spy).toHaveBeenCalledWith("sw-new", "sw-old");
  });
});

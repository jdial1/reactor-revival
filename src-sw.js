"use strict";

importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js");

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

workbox.core.clientsClaim();

// This line is a placeholder. Workbox will replace it with the precache manifest.
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// Page Cache (Network First)
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Image Cache (Cache First)
workbox.routing.registerRoute(
  ({ request }) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: "images",
    plugins: [
      new workbox.expiration.ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 }),
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
    ],
  })
);

// Static Resources (Stale While Revalidate)
workbox.routing.registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style',
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: 'static-resources',
  })
);

// Handle offline fallback
workbox.routing.setCatchHandler(({ event }) => {
  if (event.request.destination === "document") {
    return caches.match("/offline.html");
  }
  return Response.error();
});

// Version checking for app updates
let versionCheckInterval;

function startVersionChecking() {
  // Clear any existing interval
  if (versionCheckInterval) {
    clearInterval(versionCheckInterval);
  }

  // Check for new version every 5 minutes
  versionCheckInterval = setInterval(async () => {
    try {
      const response = await fetch("/version.json", { cache: "no-cache" });
      if (response.ok) {
        const versionData = await response.json();
        const newVersion = versionData.version;

        // Get current version from cache
        const currentVersion = await getCurrentVersion();

        if (currentVersion && newVersion !== currentVersion) {
          console.log(`New version detected: ${newVersion}`);
          notifyClientsOfNewVersion(newVersion);
        }
      }
    } catch (error) {
      console.log("Version check failed:", error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

async function getCurrentVersion() {
  try {
    const cache = await caches.open("static-resources");
    const response = await cache.match("/version.json");
    if (response) {
      const data = await response.json();
      return data.version;
    }
  } catch (error) {
    console.log("Failed to get current version:", error);
  }
  return null;
}

function notifyClientsOfNewVersion(newVersion) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "NEW_VERSION_AVAILABLE",
        version: newVersion,
      });
    });
  });
}

// Start version checking when service worker activates
self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      startVersionChecking(),
    ])
  );
});

// -----------------------------
// Periodic Background Sync
// -----------------------------
async function handlePeriodicSync() {
  try {
    // Fetch a lightweight resource to refresh caches or notify clients of updates
    const res = await fetch("/version.json", { cache: "no-cache" });
    if (res.ok) {
      const versionData = await res.json();
      notifyClientsOfNewVersion(versionData.version);
    }
  } catch (e) {
    // Silent fail; periodic sync will retry later
    console.log("Periodic sync failed:", e);
  }
}

self.addEventListener("periodicsync", (event) => {
  if (event.tag === "reactor-periodic-sync") {
    event.waitUntil(handlePeriodicSync());
  }
});

// -----------------------------
// One-off Background Sync (fallback)
// -----------------------------
self.addEventListener("sync", (event) => {
  if (event.tag === "reactor-sync") {
    event.waitUntil(handlePeriodicSync());
  }
});

// -----------------------------
// Push Notifications
// -----------------------------
// Push notifications are disabled for GitHub Pages hosting (no server to send pushes)
"use strict";

importScripts("https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js");

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Allow clients to request immediate activation of the new service worker
self.addEventListener("message", (event) => {
  if (event && event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  } else if (event && event.data && event.data.type === "TRIGGER_VERSION_CHECK") {
    // Manually trigger version check
    checkForVersionUpdate();
  }
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
    return caches.match("/index.html");
  }
  return Response.error();
});

// Version checking for app updates
let versionCheckInterval;

// Get the correct base path for GitHub Pages deployment
function getBasePath() {
  // Check if we're on GitHub Pages
  const isGitHubPages = self.location.hostname.includes('github.io');

  if (isGitHubPages) {
    // Extract repository name from path
    const pathParts = self.location.pathname.split('/');
    const repoName = pathParts.length > 1 && pathParts[1] ? pathParts[1] : '';
    return repoName ? `/${repoName}` : '';
  }

  // For local development or other deployments
  return '';
}

function startVersionChecking() {
  // Clear any existing interval
  if (versionCheckInterval) {
    clearInterval(versionCheckInterval);
  }

  // Check for new version every 2 minutes
  versionCheckInterval = setInterval(async () => {
    await checkForVersionUpdate();
  }, 2 * 60 * 1000); // 2 minutes
}

async function checkForVersionUpdate() {
  try {
    // Get local version first
    const localVersion = await getCurrentVersion();
    if (!localVersion) {
      console.log("No local version found, skipping check");
      return;
    }

    // Check deployed version
    const deployedVersion = await getDeployedVersion();
    if (!deployedVersion) {
      console.log("Could not fetch deployed version");
      return;
    }

    console.log(`Version check: Local=${localVersion}, Deployed=${deployedVersion}`);

    if (deployedVersion !== localVersion) {
      console.log(`New version detected: ${deployedVersion} (current: ${localVersion})`);
      notifyClientsOfNewVersion(deployedVersion, localVersion);
      showUpdateNotification(deployedVersion);
    }
  } catch (error) {
    console.log("Version check failed:", error);
  }
}

function showUpdateNotification(version) {
  if (self.Notification && self.Notification.permission === 'granted') {
    const title = 'Reactor Revival Update';
    const options = {
      body: `Version ${version} is available! Click to reload.`,
      icon: 'img/parts/cells/cell_1_1.png',
      badge: 'img/parts/cells/cell_1_1-192x192-maskable.png',
      tag: 'reactor-update',
      renotify: true,
      data: {
        url: self.location.origin + getBasePath()
      }
    };
    self.registration.showNotification(title, options);
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      if (clientList.length > 0) {
        let client = clientList[0];
        for (let i = 0; i < clientList.length; i++) {
          if (clientList[i].focused) {
            client = clientList[i];
          }
        }
        return client.focus();
      }
      return self.clients.openWindow(event.notification.data.url || '/');
    })
  );
});

async function getDeployedVersion() {
  try {
    const basePath = getBasePath();
    const versionUrl = `${self.location.origin}${basePath}/version.json`;
    // The cache: "no-cache" header is the most important part here.
    const response = await fetch(versionUrl, { cache: "no-cache" });

    if (response.ok) {
      const versionData = await response.json();
      return versionData.version;
    }
  } catch (error) {
    console.log("Failed to get deployed version:", error);
  }
  return null;
}

async function getCurrentVersion() {
  try {
    const cache = await caches.open("static-resources");
    const basePath = getBasePath();
    const versionUrl = `${basePath}/version.json`;
    const response = await cache.match(versionUrl);
    if (response) {
      const data = await response.json();
      return data.version;
    }
  } catch (error) {
    console.log("Failed to get current version:", error);
  }
  return null;
}

function notifyClientsOfNewVersion(newVersion, currentVersion) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "NEW_VERSION_AVAILABLE",
        version: newVersion,
        currentVersion: currentVersion,
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
    // Use the same version checking logic as the interval
    await checkForVersionUpdate();
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
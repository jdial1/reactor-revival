"use strict";

importScripts(
  "https://storage.googleapis.com/workbox-cdn/releases/6.4.1/workbox-sw.js"
);

// Force activation
self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            return caches.delete(cacheName);
          })
        );
      }),
    ])
  );
});

workbox.core.clientsClaim();

// This line is a placeholder. Workbox will replace it with the precache manifest.
workbox.precaching.precacheAndRoute(self.__WB_MANIFEST);

// Cache strategy for pages
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages",
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 24 * 60 * 60, // 24 hours
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Cache strategy for images (including splash screen assets)
workbox.routing.registerRoute(
  ({ request }) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: "images",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 200,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 days
      }),
    ],
  })
);

// Cache strategy for styles
workbox.routing.registerRoute(
  ({ request }) => request.destination === "style",
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "styles",
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 20,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Cache strategy for scripts
workbox.routing.registerRoute(
  ({ request }) => request.destination === "script",
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "scripts",
    plugins: [
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 50,
        maxAgeSeconds: 7 * 24 * 60 * 60, // 7 days
      }),
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

// Handle offline fallback
workbox.routing.setCatchHandler(({ event }) => {
  switch (event.request.destination) {
    case "document":
      return caches.match("/offline.html");
    case "image":
      return caches.match("/img/misc/preview.png");
    default:
      return Response.error();
  }
});

// Version checking variables
let currentVersion = null;
let lastCheckedVersion = null;
let versionCheckInterval = null;

// Start version checking
function startVersionChecking() {
  if (versionCheckInterval) {
    clearInterval(versionCheckInterval);
  }

  // Check version every 30 seconds
  versionCheckInterval = setInterval(async () => {
    try {
      const response = await fetch('/version.json', { cache: 'no-cache' });
      const versionData = await response.json();
      const newVersion = versionData.version;

      if (currentVersion === null) {
        currentVersion = newVersion;
        lastCheckedVersion = newVersion;
      } else if (newVersion !== lastCheckedVersion) {
        // New version detected
        lastCheckedVersion = newVersion;
        notifyClientsOfNewVersion(newVersion);
      }
    } catch (error) {
      console.warn('Failed to check for new version:', error);
    }
  }, 30000); // Check every 30 seconds
}

// Notify all clients of new version
function notifyClientsOfNewVersion(newVersion) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) => {
      client.postMessage({
        type: "NEW_VERSION_AVAILABLE",
        version: newVersion
      });
    });
  });
}

// Handle messages
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({
      version: currentVersion || "Unknown"
    });
  }
  if (event.data && event.data.type === "START_VERSION_CHECKING") {
    startVersionChecking();
  }
  if (event.data && event.data.type === "STOP_VERSION_CHECKING") {
    if (versionCheckInterval) {
      clearInterval(versionCheckInterval);
      versionCheckInterval = null;
    }
  }
  // Handle splash screen related messages
  if (event.data && event.data.type === "SPLASH_READY") {
    // Notify all clients that splash screen is ready to hide
    self.clients.matchAll().then((clients) => {
      clients.forEach((client) => {
        client.postMessage({
          type: "HIDE_SPLASH",
        });
      });
    });
  }
  // ... any other custom message handling
});

// Start version checking when service worker installs
self.addEventListener('install', (event) => {
  startVersionChecking();
});
// ... keep any other custom event listeners if present

// --- NEW: Add Runtime Caching for Google Fonts ---
workbox.routing.registerRoute(
  ({ url }) => url.origin === "https://fonts.googleapis.com",
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "google-fonts-stylesheets",
  })
);
workbox.routing.registerRoute(
  ({ url }) => url.origin === "https://fonts.gstatic.com",
  new workbox.strategies.CacheFirst({
    cacheName: "google-fonts-webfonts",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxAgeSeconds: 60 * 60 * 24 * 365, // Cache for a year
        maxEntries: 30,
      }),
    ],
  })
);

// --- Runtime Caching for App Assets (Unchanged but will work better now) ---
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
    ],
  })
);

workbox.routing.registerRoute(
  ({ request }) => request.destination === "image",
  new workbox.strategies.CacheFirst({
    cacheName: "images",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({
        statuses: [0, 200],
      }),
      new workbox.expiration.ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

workbox.routing.registerRoute(
  ({ request }) =>
    request.destination === "script" || request.destination === "style",
  new workbox.strategies.StaleWhileRevalidate({
    cacheName: "static-resources",
  })
);

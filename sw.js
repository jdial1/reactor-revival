"use strict";

const CACHE_NAME = "reactor-pwa-v1.0";
const OFFLINE_PAGE = "offline.html";
const STATIC_ASSETS = [
  "index.html",
  "offline.html",
  "manifest.json",
  "css/app.css",
  "js/app.js",
  "js/game.js",
  "js/engine.js",
  "js/ui.js",
  "js/tooltip.js",
  "js/performance.js",
  "js/stateManager.js",
  "js/reactor.js",
  "js/tileset.js",
  "js/tile.js",
  "js/partset.js",
  "js/part.js",
  "js/upgradeset.js",
  "js/upgrade.js",
  "js/upgradeActions.js",
  "js/objective.js",
  "js/objectiveActions.js",
  "js/util.js",
  "js/hotkeys.js",
  "data/part_list.js",
  "data/upgrade_list.js",
  "data/objective_list.js",
  "data/help_text.js",
  "img/parts/cells/cell_1_1.png",
  "img/ui/icons/icon_power.png",
  "img/ui/icons/icon_heat.png",
  "img/ui/icons/icon_cash.png",
  "img/ui/icons/icon_time.png",
  "img/ui/icons/icon_inlet.png",
  "img/ui/icons/icon_outlet.png",
  "img/ui/icons/icon_vent.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.map((key) => key !== CACHE_NAME && caches.delete(key)))
      )
  );
  return self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
        .catch(() => {
          return caches.match(OFFLINE_PAGE);
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((response) => {
      return (
        response ||
        fetch(event.request).then((response) => {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, response.clone());
            return response;
          });
        })
      );
    })
  );
});

// Background sync for game data
self.addEventListener("sync", (event) => {
  if (event.tag === "background-sync") {
    console.log("[SW] Background sync triggered");
    event.waitUntil(doBackgroundSync());
  }
});

async function doBackgroundSync() {
  try {
    // Sync game data if needed
    const clients = await self.clients.matchAll();
    clients.forEach((client) => {
      client.postMessage({
        type: "background-sync",
        timestamp: Date.now(),
      });
    });
  } catch (error) {
    console.error("[SW] Background sync failed:", error);
  }
}

// Handle push notifications
self.addEventListener("push", (event) => {
  console.log("[SW] Push notification received");

  const options = {
    body: "Your reactor needs attention!",
    icon: "img/parts/cells/cell_1_1.png",
    badge: "img/parts/cells/cell_1_1.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "Open Reactor",
        icon: "img/parts/cells/cell_1_1.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "img/parts/cells/cell_1_1.png",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification("Reactor Clone", options));
});

// Handle notification clicks
self.addEventListener("notificationclick", (event) => {
  console.log("[SW] Notification clicked");

  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"));
  }
});

// Handle messages from the main thread
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({ version: CACHE_NAME });
  }
});

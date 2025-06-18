const CACHE_NAME = "reactor-game-v1.4.0";
const STATIC_CACHE = "reactor-static-v1.4.0";
const DYNAMIC_CACHE = "reactor-dynamic-v1.4.0";

// Files to cache immediately
const STATIC_FILES = [
  "/",
  "/index.html",
  "/css/app.css",
  "/js/app.js",
  "/js/game.js",
  "/js/engine.js",
  "/js/ui.js",
  "/js/tooltip.js",
  "/js/performance.js",
  "/js/stateManager.js",
  "/js/reactor.js",
  "/js/tileset.js",
  "/js/tile.js",
  "/js/partset.js",
  "/js/part.js",
  "/js/upgradeset.js",
  "/js/upgrade.js",
  "/js/upgradeActions.js",
  "/js/objective.js",
  "/js/objectiveActions.js",
  "/js/util.js",
  "/js/hotkeys.js",
  "/data/part_list.js",
  "/data/upgrade_list.js",
  "/data/objective_list.js",
  "/data/help_text.js",
  "/manifest.json",
  "/img/parts/cells/cell_1_1.png",
  "/img/ui/icons/icon_power.png",
  "/img/ui/icons/icon_heat.png",
  "/img/ui/icons/icon_cash.png",
  "/img/ui/icons/icon_time.png",
  "/img/ui/icons/icon_inlet.png",
  "/img/ui/icons/icon_outlet.png",
  "/img/ui/icons/icon_vent.png",
];

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static files");
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log("[SW] Static files cached successfully");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static files:", error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("[SW] Deleting old cache:", cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      })
      .then(() => {
        console.log("[SW] Service worker activated");
        return self.clients.claim();
      })
  );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Skip external requests
  if (url.origin !== location.origin) {
    return;
  }

  // Handle different types of requests
  if (request.destination === "image") {
    event.respondWith(handleImageRequest(request));
  } else if (
    request.destination === "script" ||
    request.destination === "style"
  ) {
    event.respondWith(handleStaticRequest(request));
  } else {
    event.respondWith(handlePageRequest(request));
  }
});

// Handle image requests with cache-first strategy
async function handleImageRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error("[SW] Image fetch failed:", error);
    // Return a fallback image if available
    return caches.match("/img/parts/cells/cell_1_1.png");
  }
}

// Handle static files with cache-first strategy
async function handleStaticRequest(request) {
  try {
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }

    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.error("[SW] Static file fetch failed:", error);
    throw error;
  }
}

// Handle page requests with network-first strategy
async function handlePageRequest(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch (error) {
    console.log("[SW] Network failed, serving from cache");
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    // Fallback to index.html for SPA routing
    return caches.match("/index.html");
  }
}

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
    icon: "/img/parts/cells/cell_1_1.png",
    badge: "/img/parts/cells/cell_1_1.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "Open Reactor",
        icon: "/img/parts/cells/cell_1_1.png",
      },
      {
        action: "close",
        title: "Close",
        icon: "/img/parts/cells/cell_1_1.png",
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

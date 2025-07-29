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
workbox.precaching.precacheAndRoute([{ "revision": "d61e82c5b137a5a737b5c25c17c2e3d3", "url": "index.html" }, { "revision": "20ac7fceecbe10975c305bc6718f65d0", "url": "offline.html" }, { "revision": "cab684bbc3223a06dabeaf426828747f", "url": "css/main.css" }, { "revision": "aab0c901f8339bb7bc35e57b8c602651", "url": "img/help/pa_spoiler.png" }, { "revision": "8be8a2d3f4c4afd492eea2756ef544f3", "url": "img/misc/lab.png" }, { "revision": "f2eae36df32c16267ce7fdd73d02374f", "url": "img/misc/preview.png" }, { "revision": "5f0e2caca996e04a7674826c6b69edab", "url": "img/misc/reactor_incremental.png" }, { "revision": "4db7e7a0681e79142400fa111a271c4a", "url": "img/misc/reactor_planner.png" }, { "revision": "58856725d38f0262ee2e9fd758a23596", "url": "img/parts/accelerators/accelerator_1.png" }, { "revision": "4f878924fb3d0e44695d25869a826cf9", "url": "img/parts/accelerators/accelerator_2.png" }, { "revision": "871f25e123870dc5596f6f131602da4a", "url": "img/parts/accelerators/accelerator_3.png" }, { "revision": "bbc38021547dce7a367f7816d6b1024c", "url": "img/parts/accelerators/accelerator_4.png" }, { "revision": "01e4e2bf6cd9d157e59ad6044a853596", "url": "img/parts/accelerators/accelerator_5.png" }, { "revision": "468848da96babe1d7be6a2a4750887ff", "url": "img/parts/accelerators/accelerator_6.png" }, { "revision": "dd2f18c75e2aaf02a9ad1f53480dfbc6", "url": "img/parts/capacitors/capacitor_1.png" }, { "revision": "4b30ae88e8c2f91dc8902332a4252191", "url": "img/parts/capacitors/capacitor_2.png" }, { "revision": "4788e5e76938b46264385bd46da8344d", "url": "img/parts/capacitors/capacitor_3.png" }, { "revision": "08aa86061c4cf2b51a6f57c1c879f1eb", "url": "img/parts/capacitors/capacitor_4.png" }, { "revision": "928071c411dbbe08be031f11261ae835", "url": "img/parts/capacitors/capacitor_5.png" }, { "revision": "581952de189f96d467128a90e46c6e15", "url": "img/parts/capacitors/capacitor_6.png" }, { "revision": "0a3365bd923db8f8199208ecc0a705f3", "url": "img/parts/cells/cell_1_1-192x192-maskable.png" }, { "revision": "66eb3c17b82f90079447b8064aa54f0b", "url": "img/parts/cells/cell_1_1-192x192.png" }, { "revision": "e21043a4f770063ad1381cbb83d42e51", "url": "img/parts/cells/cell_1_1-512x512-maskable.png" }, { "revision": "fb647186bf5c39e13cca7431f42bf054", "url": "img/parts/cells/cell_1_1-512x512.png" }, { "revision": "ea74a70fd54d49f540530fa70b4d8900", "url": "img/parts/cells/cell_1_1.png" }, { "revision": "7189ae48bb10f4854ff50d117fee4d2e", "url": "img/parts/cells/cell_1_2.png" }, { "revision": "f91c65a2122a73ec663bb56217f977da", "url": "img/parts/cells/cell_1_4.png" }, { "revision": "39ea70f56a7ec5075a1c945ac18f7e49", "url": "img/parts/cells/cell_2_1.png" }, { "revision": "a3f8ea285aed4684a19718955063b36d", "url": "img/parts/cells/cell_2_2.png" }, { "revision": "2e8b2a09c3cec259c24c10f4d497dd9c", "url": "img/parts/cells/cell_2_4.png" }, { "revision": "b63f6eb8b071583e28a2f97b1af25209", "url": "img/parts/cells/cell_3_1.png" }, { "revision": "83d64d73217b076a13495552f38286fb", "url": "img/parts/cells/cell_3_2.png" }, { "revision": "a7ff304540b0726c2817d0b052d8e61f", "url": "img/parts/cells/cell_3_4.png" }, { "revision": "55aab78cc9b0822d2defecac6d21a224", "url": "img/parts/cells/cell_4_1.png" }, { "revision": "fcf1355b8dc093687f4c9449a1748eb8", "url": "img/parts/cells/cell_4_2.png" }, { "revision": "33e748feee15d4ad0c84bc9e06fd2fbf", "url": "img/parts/cells/cell_4_4.png" }, { "revision": "4df63d1b6346319b9d08923a5c2a9f94", "url": "img/parts/cells/cell_5_1.png" }, { "revision": "2669c6dbfa65cefe874c75fa96348f4a", "url": "img/parts/cells/cell_5_2.png" }, { "revision": "b5da205167d4c9f4ab736ee042010038", "url": "img/parts/cells/cell_5_4.png" }, { "revision": "f33c4ea3ad3e24a96a5744f27f71b0ab", "url": "img/parts/cells/cell_6_1.png" }, { "revision": "5fdb17d8e4f462a60777b9cc587773d0", "url": "img/parts/cells/cell_6_2.png" }, { "revision": "23a236d9c0cfe2a03c9dfab02e06ca50", "url": "img/parts/cells/cell_6_4.png" }, { "revision": "d2ff14991568a3efafd710bd39535265", "url": "img/parts/cells/xcell_1_1.png" }, { "revision": "f4e8b6c155453ed43ab624e04058be8c", "url": "img/parts/cells/xcell_1_2.png" }, { "revision": "dae6f08cbbc1284e04f62c708ac7802b", "url": "img/parts/cells/xcell_1_4.png" }, { "revision": "78373e70670dff11ac46435c85b5b78b", "url": "img/parts/coolants/coolant_cell_1.png" }, { "revision": "570423e2bcd4672ea8483e80cb37f468", "url": "img/parts/coolants/coolant_cell_2.png" }, { "revision": "a0e987cffdb329642d0d56d74e6ca9b1", "url": "img/parts/coolants/coolant_cell_3.png" }, { "revision": "cf263237a0fcedf5334466c95f438dcf", "url": "img/parts/coolants/coolant_cell_4.png" }, { "revision": "b9c41600f1037ba06bafb387c64c6162", "url": "img/parts/coolants/coolant_cell_5.png" }, { "revision": "10faefaed29985c615c7337ccc5e1c38", "url": "img/parts/coolants/coolant_cell_6.png" }, { "revision": "9e27a0196f5ef1d3ce0a719e85068863", "url": "img/parts/exchangers/exchanger_1.png" }, { "revision": "92b86c791f66b493f47f84a0225cec43", "url": "img/parts/exchangers/exchanger_2.png" }, { "revision": "18341485113e90673acdfb5498206b5d", "url": "img/parts/exchangers/exchanger_3.png" }, { "revision": "1e0a41f0196951c6341700b5cd90da97", "url": "img/parts/exchangers/exchanger_4.png" }, { "revision": "6b1b7eba65bdbf0f0e302698288f0375", "url": "img/parts/exchangers/exchanger_5.png" }, { "revision": "64516f47c6667efa2f0fcb43256476dd", "url": "img/parts/exchangers/exchanger_6.png" }, { "revision": "90f1520a1767e50105520dfb205012cd", "url": "img/parts/inlets/inlet_1.png" }, { "revision": "f15404dc7611681aa463d2a6d0ac4463", "url": "img/parts/inlets/inlet_2.png" }, { "revision": "9ad19c3b850927e61cd834eb348410ea", "url": "img/parts/inlets/inlet_3.png" }, { "revision": "3b62f07d280fb0d4d1fd32da4d4bc44f", "url": "img/parts/inlets/inlet_4.png" }, { "revision": "8750b859c561358bfc62aedb420ecebf", "url": "img/parts/inlets/inlet_5.png" }, { "revision": "681323ea014b507e904a28c3467fa2a8", "url": "img/parts/inlets/inlet_6.png" }, { "revision": "eaf001cd58d1a750b8ce0f088eb9f51b", "url": "img/parts/outlets/outlet_1.png" }, { "revision": "fcf64a82d89c7b71762c091c197deaea", "url": "img/parts/outlets/outlet_2.png" }, { "revision": "fceca6297351e05e1ffa65a4da302807", "url": "img/parts/outlets/outlet_3.png" }, { "revision": "a7503536e0bb4f8abfccd802d56d9bc8", "url": "img/parts/outlets/outlet_4.png" }, { "revision": "ba0667e294cd7f807c1a34f162d96dbc", "url": "img/parts/outlets/outlet_5.png" }, { "revision": "f55ec009b2c05c079bbeaf0f1259a98d", "url": "img/parts/outlets/outlet_6.png" }, { "revision": "fcebb7acc68bf91ab8c820e450c2a267", "url": "img/parts/platings/plating_1.png" }, { "revision": "436dee2334598859b7ff0ab2eb9aa365", "url": "img/parts/platings/plating_2.png" }, { "revision": "b842c8cdf0cc485bdc28c4da4312a32b", "url": "img/parts/platings/plating_3.png" }, { "revision": "21d0d28e2bdec87ea1aa984a6c342228", "url": "img/parts/platings/plating_4.png" }, { "revision": "bd0da8e926cf770459dd9d5fe5af5170", "url": "img/parts/platings/plating_5.png" }, { "revision": "df398ac453b6ff0c36dfeba0896ac707", "url": "img/parts/platings/plating_6.png" }, { "revision": "8660a1f1dfa43643cc674c7dbeb5cb5a", "url": "img/parts/reflectors/reflector_1.png" }, { "revision": "aa9be0bed953799f01091e281df81444", "url": "img/parts/reflectors/reflector_2.png" }, { "revision": "ebb1c71614b449555e8d8f20f1dfa435", "url": "img/parts/reflectors/reflector_3.png" }, { "revision": "ce68fdc2e7f685f5d4a8491a8531a534", "url": "img/parts/reflectors/reflector_4.png" }, { "revision": "eb205b514899924467d78b83dedb0baf", "url": "img/parts/reflectors/reflector_5.png" }, { "revision": "23f8f36b74e44a09e1d56a7c6abc49a6", "url": "img/parts/reflectors/reflector_6.png" }, { "revision": "9b5d0c45ef02d9062a86d8536a89f639", "url": "img/parts/vents/vent_1.png" }, { "revision": "f26a17cf1e67eee98261a0b5eac7b85f", "url": "img/parts/vents/vent_2.png" }, { "revision": "04b683cd44ab653a71ce2f5693bdd5ac", "url": "img/parts/vents/vent_3.png" }, { "revision": "e898b73451f4f6d88993a92274291de0", "url": "img/parts/vents/vent_4.png" }, { "revision": "57ffdee2c95962ce5636d2af933914eb", "url": "img/parts/vents/vent_5.png" }, { "revision": "56a6282fc161f98dd4389dfcc035152d", "url": "img/parts/vents/vent_6.png" }, { "revision": "5e391efc14bd667f048d85296b1706a1", "url": "img/ui/borders/button/button_border_alt_active.png" }, { "revision": "cf44cde892a54cef55fcb55f189ebada", "url": "img/ui/borders/button/button_border_alt_down_active.png" }, { "revision": "2f84325c8141054a17760f976ca142aa", "url": "img/ui/borders/button/button_border_alt_down.png" }, { "revision": "f6272c6fc8dfc4883ba94593a3ab7cc6", "url": "img/ui/borders/button/button_border_alt.png" }, { "revision": "12543e18860d1c4f9e56e780089ce8b7", "url": "img/ui/borders/button/button_border.png" }, { "revision": "2f84325c8141054a17760f976ca142aa", "url": "img/ui/borders/button/small_button_down.png" }, { "revision": "e62f655357f844213996e68767881020", "url": "img/ui/borders/button/small_button_off.png" }, { "revision": "11bd051f12745ad29e0b6822a481fd56", "url": "img/ui/borders/button/small_button_on.png" }, { "revision": "f233442b298536953dd62b7be972aa81", "url": "img/ui/borders/panel/medium_panel.png" }, { "revision": "e2afbdc8ae45cba09819a3598bb6ecac", "url": "img/ui/borders/panel/panel_border_first_first.png" }, { "revision": "4706b1360be792a3031cd9df2dc2a9bb", "url": "img/ui/borders/panel/panel_border_first_last.png" }, { "revision": "ae7b7d712d5b63e027cbbaff37ecf32e", "url": "img/ui/borders/panel/panel_border_last_first.png" }, { "revision": "1dc1c046ae1fa7f5e19d36937f02f23e", "url": "img/ui/borders/panel/panel_border_last_last.png" }, { "revision": "71b531d21264310d8e3ad194044c035b", "url": "img/ui/borders/panel/panel_border_last_middle.png" }, { "revision": "78c4fc10f243892c75afd305f610e006", "url": "img/ui/borders/panel/panel_border.png" }, { "revision": "3c10d2b9500ffadf95e3a236b0f9b5a5", "url": "img/ui/connector_border.png" }, { "revision": "86a436af39b039fcc062b8d9367d4a82", "url": "img/ui/effects/explosion_map.png" }, { "revision": "011967d1edb90a2f2f9b66274722922f", "url": "img/ui/icons/icon_cash.png" }, { "revision": "676d8cc0082aedd62fa2299480dec8bc", "url": "img/ui/icons/icon_heat.png" }, { "revision": "27ed8c1ccdcf5155c9267ea6f0312888", "url": "img/ui/icons/icon_inlet.png" }, { "revision": "8aa70c4d4df82ee265b617e4b819b66c", "url": "img/ui/icons/icon_outlet.png" }, { "revision": "76922c70732d25613d0754eff9520ac7", "url": "img/ui/icons/icon_power.png" }, { "revision": "26db28a0129aee7313ef03cc83a10edb", "url": "img/ui/icons/icon_time.png" }, { "revision": "0873650a1327bced0369f8e3f402d0da", "url": "img/ui/icons/icon_vent.png" }, { "revision": "74e78be65c8a68e601754fe50e68bf3c", "url": "img/ui/inner/inner_border_alt_active.png" }, { "revision": "8afa1f6e7f25411033e814dee71cf966", "url": "img/ui/inner/inner_border_alt_down.png" }, { "revision": "88d0e196e695589048e43e47f7219950", "url": "img/ui/inner/inner_border_alt_flip_active.png" }, { "revision": "b168d0712a0d551025cc55c11cadb0d2", "url": "img/ui/inner/inner_border_alt_flip_down.png" }, { "revision": "34b979f45978370ccf4077f016b2052c", "url": "img/ui/inner/inner_border_alt_flip.png" }, { "revision": "4d294cdccfe695ba1e04661fabdb2a23", "url": "img/ui/inner/inner_border_alt.png" }, { "revision": "16993496182bae7b8fd16d3d51d60d65", "url": "img/ui/inner/inner_border.png" }, { "revision": "300c6d3f24eac5815284617ce9ebd0ae", "url": "img/ui/nav/nav_experimental.png" }, { "revision": "d93f67ee48784701098e6823d50bc64f", "url": "img/ui/nav/nav_normal.png" }, { "revision": "3a5fa7a8389088abcdbb8c062a6d4416", "url": "img/ui/nav/nav_pause.png" }, { "revision": "a3a31030b4ace97c18c5bbae9422d6dd", "url": "img/ui/nav/nav_play.png" }, { "revision": "f57bddbf8e23f270cb599e4d24f4cd40", "url": "img/ui/nav/nav_renew.png" }, { "revision": "2ba72fcc2c8f9452867ec32d3dd3f67a", "url": "img/ui/nav/nav_unrenew.png" }, { "revision": "0d7b9f74f1140589f881c9387d224f72", "url": "img/ui/status/status_bolt.png" }, { "revision": "c55c26fc5563d1130631794a8fb004b3", "url": "img/ui/status/status_infinity.png" }, { "revision": "3557b7a6406e519b5aa4fd5a29bf0277", "url": "img/ui/status/status_plus.png" }, { "revision": "ad6e47b56ca3acb7661cc40c042c6a3b", "url": "img/ui/status/status_star.png" }, { "revision": "260f48f11226d3f6ace9b378ce588278", "url": "img/ui/status/status_time.png" }, { "revision": "03c713d1ec4a6dfc61954fe1ed180c58", "url": "img/ui/tile.png" }, { "revision": "6ff9f83f5e645978dc80da68549c579d", "url": "img/upgrades/default.png" }, { "revision": "5dfc5d316bdf0c52fe14dd0cd45cf101", "url": "img/upgrades/upgrade_cols.png" }, { "revision": "6ff9f83f5e645978dc80da68549c579d", "url": "img/upgrades/upgrade_computer.png" }, { "revision": "42add1d3d02bafe205e787f141dad15a", "url": "img/upgrades/upgrade_flux.png" }, { "revision": "593a0bd5dadfca450449a7a709957253", "url": "img/upgrades/upgrade_rows.png" }, { "revision": "f7a7c7d278d8bb1c25f2508194358856", "url": "pages/about.html" }, { "revision": "8c03b9e7710e29dc167d9874f1ad1cf7", "url": "pages/game.html" }, { "revision": "beb0f53bd4fa7db890966b0c8429c131", "url": "pages/privacy-policy.html" }, { "revision": "4c540b35d42429d2935d84bd0889e9fa", "url": "pages/quick-start-modal.html" }, { "revision": "26bed0a86e37b736353f92c2178da56e", "url": "pages/reactor.html" }, { "revision": "0b329123d967599cc6e299835183a368", "url": "pages/research.html" }, { "revision": "cf8ab29f9434abb09cdcf9bdee2bae67", "url": "pages/splash.html" }, { "revision": "6571970976c8a6fe28aa42390b7d232f", "url": "pages/terms-of-service.html" }, { "revision": "a4a767c9c784147b003c814e28faccba", "url": "pages/upgrades.html" }, { "revision": "ae5e390366a214c2b1b4969a4bf6e18d", "url": "components/templates.html" }, { "revision": "2eb332d7f943f59aced502ac18d36775", "url": "manifest.json" }, { "revision": "74095fbde2d599ddcebfc2a3de8861a1", "url": "version.json" }, { "revision": "e647868246b70926c4d716f7640bd51a", "url": "lib/pako.min.js" }, { "revision": "c239b0ab41b4650523c8c1202a24878a", "url": "lib/zip.min.js" }]);

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
// Add fetch event listener for compatibility with tests
self.addEventListener("fetch", (event) => {
  // Let workbox handle the routing
  event.respondWith(
    workbox.routing.handleRequest(event.request)
  );
});

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

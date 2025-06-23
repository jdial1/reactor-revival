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
workbox.precaching.precacheAndRoute([{"revision":"b18f6a6b24926d9266b2b5dccc6e029e","url":"index.html"},{"revision":"20ac7fceecbe10975c305bc6718f65d0","url":"offline.html"},{"revision":"e00474d64e1eda9d4dfe31c4a8397ab7","url":"css/app.css"},{"revision":"c57844ac591220f33454422465c704c3","url":"js/app.js"},{"revision":"c075e6b33e84027353fa6a4fdbd5d20d","url":"js/engine.js"},{"revision":"8e7ddb57c97e376bac9d62e988afa4c2","url":"js/game.js"},{"revision":"c159fc84130a4342b484da88b5d71000","url":"js/hotkeys.js"},{"revision":"1221145c38dbc9548efee2841f1db08c","url":"js/objective.js"},{"revision":"e99f5489690f99d5fc74b594e207e95c","url":"js/objectiveActions.js"},{"revision":"b255808542187e401e767ab5a078352e","url":"js/pageRouter.js"},{"revision":"08e229cd6115fa3a57cf117b02dff764","url":"js/part.js"},{"revision":"5aa72246b88fdec2e097fe3caf99abbd","url":"js/partset.js"},{"revision":"2920936663db71c023d1c56e5f69a227","url":"js/performance.js"},{"revision":"7755b492c49cff26dadedd8b60a41b99","url":"js/pwa.js"},{"revision":"f924f389d2f26c54243ef2e7c8f282b5","url":"js/reactor.js"},{"revision":"bd315a4df60f3ea2698dc0e809c5041f","url":"js/stateManager.js"},{"revision":"40813514c7a359daf20828b608f2e9af","url":"js/tile.js"},{"revision":"2849e085203f8e71bfd243cdfe1106cc","url":"js/tileset.js"},{"revision":"183572ebc414358dad80815671a7cd09","url":"js/tooltip.js"},{"revision":"7abd7e2168d4724acb1b51d37dd11073","url":"js/ui.js"},{"revision":"2b3f4c50dd0a41cf9659d2d022ec47af","url":"js/upgrade.js"},{"revision":"5986b96066252a0171c63639b99f1416","url":"js/upgradeActions.js"},{"revision":"4d969efd754aa53876cdd1b3cffb78b5","url":"js/upgradeset.js"},{"revision":"b48250f73d3b7c2550cda514d74d0173","url":"js/util.js"},{"revision":"9f8890f59793908c334437676f9592fa","url":"data/help_text.js"},{"revision":"8e0047d74620c1c6a48f4777b9770789","url":"data/objective_list.js"},{"revision":"a2f2c2889dcc11695042c36e17738c88","url":"data/part_list.js"},{"revision":"2a84bb525648c3a3fdcd03a6fb30ffc1","url":"data/upgrade_list.js"},{"revision":"aab0c901f8339bb7bc35e57b8c602651","url":"img/help/pa_spoiler.png"},{"revision":"8be8a2d3f4c4afd492eea2756ef544f3","url":"img/misc/lab.png"},{"revision":"f2eae36df32c16267ce7fdd73d02374f","url":"img/misc/preview.png"},{"revision":"5f0e2caca996e04a7674826c6b69edab","url":"img/misc/reactor_incremental.png"},{"revision":"4db7e7a0681e79142400fa111a271c4a","url":"img/misc/reactor_planner.png"},{"revision":"aab0c901f8339bb7bc35e57b8c602651","url":"img/pa_spoiler.png"},{"revision":"58856725d38f0262ee2e9fd758a23596","url":"img/parts/accelerators/accelerator_1.png"},{"revision":"4f878924fb3d0e44695d25869a826cf9","url":"img/parts/accelerators/accelerator_2.png"},{"revision":"871f25e123870dc5596f6f131602da4a","url":"img/parts/accelerators/accelerator_3.png"},{"revision":"bbc38021547dce7a367f7816d6b1024c","url":"img/parts/accelerators/accelerator_4.png"},{"revision":"01e4e2bf6cd9d157e59ad6044a853596","url":"img/parts/accelerators/accelerator_5.png"},{"revision":"468848da96babe1d7be6a2a4750887ff","url":"img/parts/accelerators/accelerator_6.png"},{"revision":"dd2f18c75e2aaf02a9ad1f53480dfbc6","url":"img/parts/capacitors/capacitor_1.png"},{"revision":"4b30ae88e8c2f91dc8902332a4252191","url":"img/parts/capacitors/capacitor_2.png"},{"revision":"4788e5e76938b46264385bd46da8344d","url":"img/parts/capacitors/capacitor_3.png"},{"revision":"08aa86061c4cf2b51a6f57c1c879f1eb","url":"img/parts/capacitors/capacitor_4.png"},{"revision":"928071c411dbbe08be031f11261ae835","url":"img/parts/capacitors/capacitor_5.png"},{"revision":"581952de189f96d467128a90e46c6e15","url":"img/parts/capacitors/capacitor_6.png"},{"revision":"0a3365bd923db8f8199208ecc0a705f3","url":"img/parts/cells/cell_1_1-192x192-maskable.png"},{"revision":"66eb3c17b82f90079447b8064aa54f0b","url":"img/parts/cells/cell_1_1-192x192.png"},{"revision":"e21043a4f770063ad1381cbb83d42e51","url":"img/parts/cells/cell_1_1-512x512-maskable.png"},{"revision":"fb647186bf5c39e13cca7431f42bf054","url":"img/parts/cells/cell_1_1-512x512.png"},{"revision":"ea74a70fd54d49f540530fa70b4d8900","url":"img/parts/cells/cell_1_1.png"},{"revision":"7189ae48bb10f4854ff50d117fee4d2e","url":"img/parts/cells/cell_1_2.png"},{"revision":"f91c65a2122a73ec663bb56217f977da","url":"img/parts/cells/cell_1_4.png"},{"revision":"39ea70f56a7ec5075a1c945ac18f7e49","url":"img/parts/cells/cell_2_1.png"},{"revision":"a3f8ea285aed4684a19718955063b36d","url":"img/parts/cells/cell_2_2.png"},{"revision":"2e8b2a09c3cec259c24c10f4d497dd9c","url":"img/parts/cells/cell_2_4.png"},{"revision":"b63f6eb8b071583e28a2f97b1af25209","url":"img/parts/cells/cell_3_1.png"},{"revision":"83d64d73217b076a13495552f38286fb","url":"img/parts/cells/cell_3_2.png"},{"revision":"a7ff304540b0726c2817d0b052d8e61f","url":"img/parts/cells/cell_3_4.png"},{"revision":"55aab78cc9b0822d2defecac6d21a224","url":"img/parts/cells/cell_4_1.png"},{"revision":"fcf1355b8dc093687f4c9449a1748eb8","url":"img/parts/cells/cell_4_2.png"},{"revision":"33e748feee15d4ad0c84bc9e06fd2fbf","url":"img/parts/cells/cell_4_4.png"},{"revision":"4df63d1b6346319b9d08923a5c2a9f94","url":"img/parts/cells/cell_5_1.png"},{"revision":"2669c6dbfa65cefe874c75fa96348f4a","url":"img/parts/cells/cell_5_2.png"},{"revision":"b5da205167d4c9f4ab736ee042010038","url":"img/parts/cells/cell_5_4.png"},{"revision":"f33c4ea3ad3e24a96a5744f27f71b0ab","url":"img/parts/cells/cell_6_1.png"},{"revision":"5fdb17d8e4f462a60777b9cc587773d0","url":"img/parts/cells/cell_6_2.png"},{"revision":"23a236d9c0cfe2a03c9dfab02e06ca50","url":"img/parts/cells/cell_6_4.png"},{"revision":"d2ff14991568a3efafd710bd39535265","url":"img/parts/cells/xcell_1_1.png"},{"revision":"f4e8b6c155453ed43ab624e04058be8c","url":"img/parts/cells/xcell_1_2.png"},{"revision":"dae6f08cbbc1284e04f62c708ac7802b","url":"img/parts/cells/xcell_1_4.png"},{"revision":"78373e70670dff11ac46435c85b5b78b","url":"img/parts/coolants/coolant_1.png"},{"revision":"570423e2bcd4672ea8483e80cb37f468","url":"img/parts/coolants/coolant_2.png"},{"revision":"a0e987cffdb329642d0d56d74e6ca9b1","url":"img/parts/coolants/coolant_3.png"},{"revision":"cf263237a0fcedf5334466c95f438dcf","url":"img/parts/coolants/coolant_4.png"},{"revision":"b9c41600f1037ba06bafb387c64c6162","url":"img/parts/coolants/coolant_5.png"},{"revision":"10faefaed29985c615c7337ccc5e1c38","url":"img/parts/coolants/coolant_6.png"},{"revision":"78373e70670dff11ac46435c85b5b78b","url":"img/parts/coolants/coolant_cell_1.png"},{"revision":"570423e2bcd4672ea8483e80cb37f468","url":"img/parts/coolants/coolant_cell_2.png"},{"revision":"a0e987cffdb329642d0d56d74e6ca9b1","url":"img/parts/coolants/coolant_cell_3.png"},{"revision":"cf263237a0fcedf5334466c95f438dcf","url":"img/parts/coolants/coolant_cell_4.png"},{"revision":"b9c41600f1037ba06bafb387c64c6162","url":"img/parts/coolants/coolant_cell_5.png"},{"revision":"10faefaed29985c615c7337ccc5e1c38","url":"img/parts/coolants/coolant_cell_6.png"},{"revision":"9e27a0196f5ef1d3ce0a719e85068863","url":"img/parts/exchangers/exchanger_1.png"},{"revision":"92b86c791f66b493f47f84a0225cec43","url":"img/parts/exchangers/exchanger_2.png"},{"revision":"18341485113e90673acdfb5498206b5d","url":"img/parts/exchangers/exchanger_3.png"},{"revision":"1e0a41f0196951c6341700b5cd90da97","url":"img/parts/exchangers/exchanger_4.png"},{"revision":"6b1b7eba65bdbf0f0e302698288f0375","url":"img/parts/exchangers/exchanger_5.png"},{"revision":"64516f47c6667efa2f0fcb43256476dd","url":"img/parts/exchangers/exchanger_6.png"},{"revision":"90f1520a1767e50105520dfb205012cd","url":"img/parts/inlets/inlet_1.png"},{"revision":"f15404dc7611681aa463d2a6d0ac4463","url":"img/parts/inlets/inlet_2.png"},{"revision":"9ad19c3b850927e61cd834eb348410ea","url":"img/parts/inlets/inlet_3.png"},{"revision":"3b62f07d280fb0d4d1fd32da4d4bc44f","url":"img/parts/inlets/inlet_4.png"},{"revision":"8750b859c561358bfc62aedb420ecebf","url":"img/parts/inlets/inlet_5.png"},{"revision":"681323ea014b507e904a28c3467fa2a8","url":"img/parts/inlets/inlet_6.png"},{"revision":"eaf001cd58d1a750b8ce0f088eb9f51b","url":"img/parts/outlets/outlet_1.png"},{"revision":"fcf64a82d89c7b71762c091c197deaea","url":"img/parts/outlets/outlet_2.png"},{"revision":"fceca6297351e05e1ffa65a4da302807","url":"img/parts/outlets/outlet_3.png"},{"revision":"a7503536e0bb4f8abfccd802d56d9bc8","url":"img/parts/outlets/outlet_4.png"},{"revision":"ba0667e294cd7f807c1a34f162d96dbc","url":"img/parts/outlets/outlet_5.png"},{"revision":"f55ec009b2c05c079bbeaf0f1259a98d","url":"img/parts/outlets/outlet_6.png"},{"revision":"fcebb7acc68bf91ab8c820e450c2a267","url":"img/parts/platings/plating_1.png"},{"revision":"436dee2334598859b7ff0ab2eb9aa365","url":"img/parts/platings/plating_2.png"},{"revision":"b842c8cdf0cc485bdc28c4da4312a32b","url":"img/parts/platings/plating_3.png"},{"revision":"21d0d28e2bdec87ea1aa984a6c342228","url":"img/parts/platings/plating_4.png"},{"revision":"bd0da8e926cf770459dd9d5fe5af5170","url":"img/parts/platings/plating_5.png"},{"revision":"df398ac453b6ff0c36dfeba0896ac707","url":"img/parts/platings/plating_6.png"},{"revision":"8660a1f1dfa43643cc674c7dbeb5cb5a","url":"img/parts/reflectors/reflector_1.png"},{"revision":"aa9be0bed953799f01091e281df81444","url":"img/parts/reflectors/reflector_2.png"},{"revision":"ebb1c71614b449555e8d8f20f1dfa435","url":"img/parts/reflectors/reflector_3.png"},{"revision":"ce68fdc2e7f685f5d4a8491a8531a534","url":"img/parts/reflectors/reflector_4.png"},{"revision":"eb205b514899924467d78b83dedb0baf","url":"img/parts/reflectors/reflector_5.png"},{"revision":"23f8f36b74e44a09e1d56a7c6abc49a6","url":"img/parts/reflectors/reflector_6.png"},{"revision":"9b5d0c45ef02d9062a86d8536a89f639","url":"img/parts/vents/vent_1.png"},{"revision":"f26a17cf1e67eee98261a0b5eac7b85f","url":"img/parts/vents/vent_2.png"},{"revision":"04b683cd44ab653a71ce2f5693bdd5ac","url":"img/parts/vents/vent_3.png"},{"revision":"e898b73451f4f6d88993a92274291de0","url":"img/parts/vents/vent_4.png"},{"revision":"57ffdee2c95962ce5636d2af933914eb","url":"img/parts/vents/vent_5.png"},{"revision":"56a6282fc161f98dd4389dfcc035152d","url":"img/parts/vents/vent_6.png"},{"revision":"5e391efc14bd667f048d85296b1706a1","url":"img/ui/borders/button/button_border_alt_active.png"},{"revision":"cf44cde892a54cef55fcb55f189ebada","url":"img/ui/borders/button/button_border_alt_down_active.png"},{"revision":"2f84325c8141054a17760f976ca142aa","url":"img/ui/borders/button/button_border_alt_down.png"},{"revision":"f6272c6fc8dfc4883ba94593a3ab7cc6","url":"img/ui/borders/button/button_border_alt.png"},{"revision":"12543e18860d1c4f9e56e780089ce8b7","url":"img/ui/borders/button/button_border.png"},{"revision":"2f84325c8141054a17760f976ca142aa","url":"img/ui/borders/button/small_button_down.png"},{"revision":"e62f655357f844213996e68767881020","url":"img/ui/borders/button/small_button_off.png"},{"revision":"11bd051f12745ad29e0b6822a481fd56","url":"img/ui/borders/button/small_button_on.png"},{"revision":"f233442b298536953dd62b7be972aa81","url":"img/ui/borders/panel/medium_panel.png"},{"revision":"e2afbdc8ae45cba09819a3598bb6ecac","url":"img/ui/borders/panel/panel_border_first_first.png"},{"revision":"4706b1360be792a3031cd9df2dc2a9bb","url":"img/ui/borders/panel/panel_border_first_last.png"},{"revision":"ae7b7d712d5b63e027cbbaff37ecf32e","url":"img/ui/borders/panel/panel_border_last_first.png"},{"revision":"1dc1c046ae1fa7f5e19d36937f02f23e","url":"img/ui/borders/panel/panel_border_last_last.png"},{"revision":"71b531d21264310d8e3ad194044c035b","url":"img/ui/borders/panel/panel_border_last_middle.png"},{"revision":"78c4fc10f243892c75afd305f610e006","url":"img/ui/borders/panel/panel_border.png"},{"revision":"3c10d2b9500ffadf95e3a236b0f9b5a5","url":"img/ui/connector_border.png"},{"revision":"86a436af39b039fcc062b8d9367d4a82","url":"img/ui/effects/explosion_map.png"},{"revision":"011967d1edb90a2f2f9b66274722922f","url":"img/ui/icons/icon_cash.png"},{"revision":"676d8cc0082aedd62fa2299480dec8bc","url":"img/ui/icons/icon_heat.png"},{"revision":"27ed8c1ccdcf5155c9267ea6f0312888","url":"img/ui/icons/icon_inlet.png"},{"revision":"8aa70c4d4df82ee265b617e4b819b66c","url":"img/ui/icons/icon_outlet.png"},{"revision":"76922c70732d25613d0754eff9520ac7","url":"img/ui/icons/icon_power.png"},{"revision":"26db28a0129aee7313ef03cc83a10edb","url":"img/ui/icons/icon_time.png"},{"revision":"0873650a1327bced0369f8e3f402d0da","url":"img/ui/icons/icon_vent.png"},{"revision":"74e78be65c8a68e601754fe50e68bf3c","url":"img/ui/inner/inner_border_alt_active.png"},{"revision":"8afa1f6e7f25411033e814dee71cf966","url":"img/ui/inner/inner_border_alt_down.png"},{"revision":"88d0e196e695589048e43e47f7219950","url":"img/ui/inner/inner_border_alt_flip_active.png"},{"revision":"b168d0712a0d551025cc55c11cadb0d2","url":"img/ui/inner/inner_border_alt_flip_down.png"},{"revision":"34b979f45978370ccf4077f016b2052c","url":"img/ui/inner/inner_border_alt_flip.png"},{"revision":"4d294cdccfe695ba1e04661fabdb2a23","url":"img/ui/inner/inner_border_alt.png"},{"revision":"16993496182bae7b8fd16d3d51d60d65","url":"img/ui/inner/inner_border.png"},{"revision":"300c6d3f24eac5815284617ce9ebd0ae","url":"img/ui/nav/nav_experimental.png"},{"revision":"d93f67ee48784701098e6823d50bc64f","url":"img/ui/nav/nav_normal.png"},{"revision":"3a5fa7a8389088abcdbb8c062a6d4416","url":"img/ui/nav/nav_pause.png"},{"revision":"a3a31030b4ace97c18c5bbae9422d6dd","url":"img/ui/nav/nav_play.png"},{"revision":"f57bddbf8e23f270cb599e4d24f4cd40","url":"img/ui/nav/nav_renew.png"},{"revision":"2ba72fcc2c8f9452867ec32d3dd3f67a","url":"img/ui/nav/nav_unrenew.png"},{"revision":"0d7b9f74f1140589f881c9387d224f72","url":"img/ui/status/status_bolt.png"},{"revision":"c55c26fc5563d1130631794a8fb004b3","url":"img/ui/status/status_infinity.png"},{"revision":"3557b7a6406e519b5aa4fd5a29bf0277","url":"img/ui/status/status_plus.png"},{"revision":"ad6e47b56ca3acb7661cc40c042c6a3b","url":"img/ui/status/status_star.png"},{"revision":"260f48f11226d3f6ace9b378ce588278","url":"img/ui/status/status_time.png"},{"revision":"03c713d1ec4a6dfc61954fe1ed180c58","url":"img/ui/tile.png"},{"revision":"6ff9f83f5e645978dc80da68549c579d","url":"img/upgrades/default.png"},{"revision":"5dfc5d316bdf0c52fe14dd0cd45cf101","url":"img/upgrades/upgrade_cols.png"},{"revision":"6ff9f83f5e645978dc80da68549c579d","url":"img/upgrades/upgrade_computer.png"},{"revision":"42add1d3d02bafe205e787f141dad15a","url":"img/upgrades/upgrade_flux.png"},{"revision":"593a0bd5dadfca450449a7a709957253","url":"img/upgrades/upgrade_rows.png"},{"revision":"863ee6378b218174f48aa78ea2893be8","url":"pages/about.html"},{"revision":"735fde7cc8aad7d4d805b9cfc1cbd6c3","url":"pages/game.html"},{"revision":"aa0419bcf9840134ca1fcdad85302892","url":"pages/reactor.html"},{"revision":"4c84ef5807b77c09973c336b5cbcf027","url":"pages/research.html"},{"revision":"9d6c1b850a4408c3c53abe509d017771","url":"pages/upgrades.html"},{"revision":"8646dc14aa9a3a8f61e173ecb7022f25","url":"manifest.json"},{"revision":"0cbdfee909e735355f5fa6d1fc87f52b","url":"version.json"}]);

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

// Handle messages
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
  if (event.data && event.data.type === "GET_VERSION") {
    event.ports[0].postMessage({
      version: "1.0.0", // This should match your app version
    });
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

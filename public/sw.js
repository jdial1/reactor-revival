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
  } else if (event && event.data && event.data.type === "GET_VERSION") {
    // Get local version and send response
    getCurrentVersion().then(version => {
      event.ports[0].postMessage({
        type: 'VERSION_RESPONSE',
        version: version
      });
    }).catch(error => {
      console.warn("Failed to get current version:", error);
      event.ports[0].postMessage({
        type: 'VERSION_RESPONSE',
        version: null
      });
    });
  }
});

workbox.core.clientsClaim();

// This line is a placeholder. Workbox will replace it with the precache manifest.
workbox.precaching.precacheAndRoute([{ "revision": "e3582a4057519b66ea803987f819068d", "url": "index.html" }, { "revision": "5e80f7541c4fe269467a20409f2020b4", "url": "offline.html" }, { "revision": "f351c4d0f7fa633816257b4d575469ae", "url": "css/main.css" }, { "revision": "e8ba0b69d06999d197783fd477250109", "url": "data/flavor_text.json" }, { "revision": "74ccbdbf302e4ef6cc2359a54f79bf81", "url": "data/help_text.json" }, { "revision": "70bdde66a5eb0b2310c6e040f716b65c", "url": "data/objective_list.json" }, { "revision": "c0fa8344d7ff2d6eed1474e4f2ed6249", "url": "data/part_list.json" }, { "revision": "226a5f669545e53cab322d6c6932a1ff", "url": "data/upgrade_list.json" }, { "revision": "aab0c901f8339bb7bc35e57b8c602651", "url": "img/help/pa_spoiler.png" }, { "revision": "8be8a2d3f4c4afd492eea2756ef544f3", "url": "img/misc/lab.png" }, { "revision": "f2eae36df32c16267ce7fdd73d02374f", "url": "img/misc/preview.png" }, { "revision": "5f0e2caca996e04a7674826c6b69edab", "url": "img/misc/reactor_incremental.png" }, { "revision": "4db7e7a0681e79142400fa111a271c4a", "url": "img/misc/reactor_planner.png" }, { "revision": "58856725d38f0262ee2e9fd758a23596", "url": "img/parts/accelerators/accelerator_1.png" }, { "revision": "4f878924fb3d0e44695d25869a826cf9", "url": "img/parts/accelerators/accelerator_2.png" }, { "revision": "871f25e123870dc5596f6f131602da4a", "url": "img/parts/accelerators/accelerator_3.png" }, { "revision": "bbc38021547dce7a367f7816d6b1024c", "url": "img/parts/accelerators/accelerator_4.png" }, { "revision": "01e4e2bf6cd9d157e59ad6044a853596", "url": "img/parts/accelerators/accelerator_5.png" }, { "revision": "468848da96babe1d7be6a2a4750887ff", "url": "img/parts/accelerators/accelerator_6.png" }, { "revision": "dd2f18c75e2aaf02a9ad1f53480dfbc6", "url": "img/parts/capacitors/capacitor_1.png" }, { "revision": "4b30ae88e8c2f91dc8902332a4252191", "url": "img/parts/capacitors/capacitor_2.png" }, { "revision": "4788e5e76938b46264385bd46da8344d", "url": "img/parts/capacitors/capacitor_3.png" }, { "revision": "08aa86061c4cf2b51a6f57c1c879f1eb", "url": "img/parts/capacitors/capacitor_4.png" }, { "revision": "928071c411dbbe08be031f11261ae835", "url": "img/parts/capacitors/capacitor_5.png" }, { "revision": "581952de189f96d467128a90e46c6e15", "url": "img/parts/capacitors/capacitor_6.png" }, { "revision": "0a3365bd923db8f8199208ecc0a705f3", "url": "img/parts/cells/cell_1_1-192x192-maskable.png" }, { "revision": "66eb3c17b82f90079447b8064aa54f0b", "url": "img/parts/cells/cell_1_1-192x192.png" }, { "revision": "e21043a4f770063ad1381cbb83d42e51", "url": "img/parts/cells/cell_1_1-512x512-maskable.png" }, { "revision": "fb647186bf5c39e13cca7431f42bf054", "url": "img/parts/cells/cell_1_1-512x512.png" }, { "revision": "ea74a70fd54d49f540530fa70b4d8900", "url": "img/parts/cells/cell_1_1.png" }, { "revision": "7189ae48bb10f4854ff50d117fee4d2e", "url": "img/parts/cells/cell_1_2.png" }, { "revision": "f91c65a2122a73ec663bb56217f977da", "url": "img/parts/cells/cell_1_4.png" }, { "revision": "39ea70f56a7ec5075a1c945ac18f7e49", "url": "img/parts/cells/cell_2_1.png" }, { "revision": "a3f8ea285aed4684a19718955063b36d", "url": "img/parts/cells/cell_2_2.png" }, { "revision": "2e8b2a09c3cec259c24c10f4d497dd9c", "url": "img/parts/cells/cell_2_4.png" }, { "revision": "b63f6eb8b071583e28a2f97b1af25209", "url": "img/parts/cells/cell_3_1.png" }, { "revision": "83d64d73217b076a13495552f38286fb", "url": "img/parts/cells/cell_3_2.png" }, { "revision": "a7ff304540b0726c2817d0b052d8e61f", "url": "img/parts/cells/cell_3_4.png" }, { "revision": "55aab78cc9b0822d2defecac6d21a224", "url": "img/parts/cells/cell_4_1.png" }, { "revision": "fcf1355b8dc093687f4c9449a1748eb8", "url": "img/parts/cells/cell_4_2.png" }, { "revision": "33e748feee15d4ad0c84bc9e06fd2fbf", "url": "img/parts/cells/cell_4_4.png" }, { "revision": "4df63d1b6346319b9d08923a5c2a9f94", "url": "img/parts/cells/cell_5_1.png" }, { "revision": "2669c6dbfa65cefe874c75fa96348f4a", "url": "img/parts/cells/cell_5_2.png" }, { "revision": "b5da205167d4c9f4ab736ee042010038", "url": "img/parts/cells/cell_5_4.png" }, { "revision": "f33c4ea3ad3e24a96a5744f27f71b0ab", "url": "img/parts/cells/cell_6_1.png" }, { "revision": "5fdb17d8e4f462a60777b9cc587773d0", "url": "img/parts/cells/cell_6_2.png" }, { "revision": "23a236d9c0cfe2a03c9dfab02e06ca50", "url": "img/parts/cells/cell_6_4.png" }, { "revision": "d2ff14991568a3efafd710bd39535265", "url": "img/parts/cells/xcell_1_1.png" }, { "revision": "f4e8b6c155453ed43ab624e04058be8c", "url": "img/parts/cells/xcell_1_2.png" }, { "revision": "dae6f08cbbc1284e04f62c708ac7802b", "url": "img/parts/cells/xcell_1_4.png" }, { "revision": "78373e70670dff11ac46435c85b5b78b", "url": "img/parts/coolants/coolant_cell_1.png" }, { "revision": "570423e2bcd4672ea8483e80cb37f468", "url": "img/parts/coolants/coolant_cell_2.png" }, { "revision": "a0e987cffdb329642d0d56d74e6ca9b1", "url": "img/parts/coolants/coolant_cell_3.png" }, { "revision": "cf263237a0fcedf5334466c95f438dcf", "url": "img/parts/coolants/coolant_cell_4.png" }, { "revision": "b9c41600f1037ba06bafb387c64c6162", "url": "img/parts/coolants/coolant_cell_5.png" }, { "revision": "10faefaed29985c615c7337ccc5e1c38", "url": "img/parts/coolants/coolant_cell_6.png" }, { "revision": "9e27a0196f5ef1d3ce0a719e85068863", "url": "img/parts/exchangers/exchanger_1.png" }, { "revision": "92b86c791f66b493f47f84a0225cec43", "url": "img/parts/exchangers/exchanger_2.png" }, { "revision": "18341485113e90673acdfb5498206b5d", "url": "img/parts/exchangers/exchanger_3.png" }, { "revision": "1e0a41f0196951c6341700b5cd90da97", "url": "img/parts/exchangers/exchanger_4.png" }, { "revision": "6b1b7eba65bdbf0f0e302698288f0375", "url": "img/parts/exchangers/exchanger_5.png" }, { "revision": "64516f47c6667efa2f0fcb43256476dd", "url": "img/parts/exchangers/exchanger_6.png" }, { "revision": "90f1520a1767e50105520dfb205012cd", "url": "img/parts/inlets/inlet_1.png" }, { "revision": "f15404dc7611681aa463d2a6d0ac4463", "url": "img/parts/inlets/inlet_2.png" }, { "revision": "9ad19c3b850927e61cd834eb348410ea", "url": "img/parts/inlets/inlet_3.png" }, { "revision": "3b62f07d280fb0d4d1fd32da4d4bc44f", "url": "img/parts/inlets/inlet_4.png" }, { "revision": "8750b859c561358bfc62aedb420ecebf", "url": "img/parts/inlets/inlet_5.png" }, { "revision": "681323ea014b507e904a28c3467fa2a8", "url": "img/parts/inlets/inlet_6.png" }, { "revision": "eaf001cd58d1a750b8ce0f088eb9f51b", "url": "img/parts/outlets/outlet_1.png" }, { "revision": "fcf64a82d89c7b71762c091c197deaea", "url": "img/parts/outlets/outlet_2.png" }, { "revision": "fceca6297351e05e1ffa65a4da302807", "url": "img/parts/outlets/outlet_3.png" }, { "revision": "a7503536e0bb4f8abfccd802d56d9bc8", "url": "img/parts/outlets/outlet_4.png" }, { "revision": "ba0667e294cd7f807c1a34f162d96dbc", "url": "img/parts/outlets/outlet_5.png" }, { "revision": "f55ec009b2c05c079bbeaf0f1259a98d", "url": "img/parts/outlets/outlet_6.png" }, { "revision": "fcebb7acc68bf91ab8c820e450c2a267", "url": "img/parts/platings/plating_1.png" }, { "revision": "436dee2334598859b7ff0ab2eb9aa365", "url": "img/parts/platings/plating_2.png" }, { "revision": "b842c8cdf0cc485bdc28c4da4312a32b", "url": "img/parts/platings/plating_3.png" }, { "revision": "21d0d28e2bdec87ea1aa984a6c342228", "url": "img/parts/platings/plating_4.png" }, { "revision": "bd0da8e926cf770459dd9d5fe5af5170", "url": "img/parts/platings/plating_5.png" }, { "revision": "df398ac453b6ff0c36dfeba0896ac707", "url": "img/parts/platings/plating_6.png" }, { "revision": "8660a1f1dfa43643cc674c7dbeb5cb5a", "url": "img/parts/reflectors/reflector_1.png" }, { "revision": "aa9be0bed953799f01091e281df81444", "url": "img/parts/reflectors/reflector_2.png" }, { "revision": "ebb1c71614b449555e8d8f20f1dfa435", "url": "img/parts/reflectors/reflector_3.png" }, { "revision": "ce68fdc2e7f685f5d4a8491a8531a534", "url": "img/parts/reflectors/reflector_4.png" }, { "revision": "eb205b514899924467d78b83dedb0baf", "url": "img/parts/reflectors/reflector_5.png" }, { "revision": "23f8f36b74e44a09e1d56a7c6abc49a6", "url": "img/parts/reflectors/reflector_6.png" }, { "revision": "5781299fa17a81c108f557242105e14c", "url": "img/parts/valves/valve_1_1.png" }, { "revision": "63af6557f14a5d8d1baa7b97b073e62d", "url": "img/parts/valves/valve_1_2.png" }, { "revision": "94ed81804d0e6d780f55a8c7a0a70a2a", "url": "img/parts/valves/valve_1_3.png" }, { "revision": "e8890928b539c5eb7de645e45b3a8e4d", "url": "img/parts/valves/valve_1_4.png" }, { "revision": "b621b679a3446e3e01e723f7c4a8c88a", "url": "img/parts/valves/valve_2_1.png" }, { "revision": "59b89fa5e8ababb171b22ab0e73a96a5", "url": "img/parts/valves/valve_2_2.png" }, { "revision": "73cf7616e32f795a1d0c1fd44592cfa9", "url": "img/parts/valves/valve_2_3.png" }, { "revision": "1760b0577b01be3071f1e59ae5a3bbb0", "url": "img/parts/valves/valve_2_4.png" }, { "revision": "21215fc8b3f2f8db523ef54972ca68a7", "url": "img/parts/valves/valve_3_1.png" }, { "revision": "67c6e98a6a71d23dc2ec7558be29a73b", "url": "img/parts/valves/valve_3_2.png" }, { "revision": "916e71bd58df9f9e46f512ba8284b1d3", "url": "img/parts/valves/valve_3_3.png" }, { "revision": "869e3e7ba633e20b19c28a3bccf3cfaf", "url": "img/parts/valves/valve_3_4.png" }, { "revision": "132cbb966cc1a5090c006e41cee3fa48", "url": "img/parts/valves/valve_4_1.png" }, { "revision": "a31e5da0ee4716d28d578cfaa8c1beef", "url": "img/parts/valves/valve_4_2.png" }, { "revision": "c60324ce7aed89534895e25ed48e295d", "url": "img/parts/valves/valve_4_3.png" }, { "revision": "209e6e04aa7da7812287de59207bdb7d", "url": "img/parts/valves/valve_4_4.png" }, { "revision": "c33818bafcc84728b2690568ab420b41", "url": "img/parts/valves/valve_5_1.png" }, { "revision": "c7890d505f6fca3d84bb0cdb5932bb9a", "url": "img/parts/valves/valve_5_2.png" }, { "revision": "03f28471207add9045b542fd927d0756", "url": "img/parts/valves/valve_5_3.png" }, { "revision": "696cc92751d7fc74a17a30cd7b3579b4", "url": "img/parts/valves/valve_5_4.png" }, { "revision": "9b5d0c45ef02d9062a86d8536a89f639", "url": "img/parts/vents/vent_1.png" }, { "revision": "f26a17cf1e67eee98261a0b5eac7b85f", "url": "img/parts/vents/vent_2.png" }, { "revision": "04b683cd44ab653a71ce2f5693bdd5ac", "url": "img/parts/vents/vent_3.png" }, { "revision": "e898b73451f4f6d88993a92274291de0", "url": "img/parts/vents/vent_4.png" }, { "revision": "57ffdee2c95962ce5636d2af933914eb", "url": "img/parts/vents/vent_5.png" }, { "revision": "56a6282fc161f98dd4389dfcc035152d", "url": "img/parts/vents/vent_6.png" }, { "revision": "5e391efc14bd667f048d85296b1706a1", "url": "img/ui/borders/button/button_border_alt_active.png" }, { "revision": "cf44cde892a54cef55fcb55f189ebada", "url": "img/ui/borders/button/button_border_alt_down_active.png" }, { "revision": "2f84325c8141054a17760f976ca142aa", "url": "img/ui/borders/button/button_border_alt_down.png" }, { "revision": "f6272c6fc8dfc4883ba94593a3ab7cc6", "url": "img/ui/borders/button/button_border_alt.png" }, { "revision": "12543e18860d1c4f9e56e780089ce8b7", "url": "img/ui/borders/button/button_border.png" }, { "revision": "2f84325c8141054a17760f976ca142aa", "url": "img/ui/borders/button/small_button_down.png" }, { "revision": "e62f655357f844213996e68767881020", "url": "img/ui/borders/button/small_button_off.png" }, { "revision": "11bd051f12745ad29e0b6822a481fd56", "url": "img/ui/borders/button/small_button_on.png" }, { "revision": "f233442b298536953dd62b7be972aa81", "url": "img/ui/borders/panel/medium_panel.png" }, { "revision": "e2afbdc8ae45cba09819a3598bb6ecac", "url": "img/ui/borders/panel/panel_border_first_first.png" }, { "revision": "4706b1360be792a3031cd9df2dc2a9bb", "url": "img/ui/borders/panel/panel_border_first_last.png" }, { "revision": "ae7b7d712d5b63e027cbbaff37ecf32e", "url": "img/ui/borders/panel/panel_border_last_first.png" }, { "revision": "1dc1c046ae1fa7f5e19d36937f02f23e", "url": "img/ui/borders/panel/panel_border_last_last.png" }, { "revision": "71b531d21264310d8e3ad194044c035b", "url": "img/ui/borders/panel/panel_border_last_middle.png" }, { "revision": "78c4fc10f243892c75afd305f610e006", "url": "img/ui/borders/panel/panel_border.png" }, { "revision": "3c10d2b9500ffadf95e3a236b0f9b5a5", "url": "img/ui/connector_border.png" }, { "revision": "86a436af39b039fcc062b8d9367d4a82", "url": "img/ui/effects/explosion_map.png" }, { "revision": "7648f49c43e6c3767c0e753d7a4ce664", "url": "img/ui/flow/flow-arrow-down.svg" }, { "revision": "cdb11c795a7995ca65c62553da832801", "url": "img/ui/flow/flow-arrow-left.svg" }, { "revision": "a09cbc1c5c67e5159406be33e18e9dbf", "url": "img/ui/flow/flow-arrow-right.svg" }, { "revision": "04f4e5031be9dd99b542988b5ee78444", "url": "img/ui/flow/flow-arrow-up.svg" }, { "revision": "d5a7805de484fbb9b60868e3a975b6bd", "url": "img/ui/icons/icon_cash_outline.svg" }, { "revision": "011967d1edb90a2f2f9b66274722922f", "url": "img/ui/icons/icon_cash.png" }, { "revision": "f4c6ba9d5a8511dd149611f4a9abbd5d", "url": "img/ui/icons/icon_copy.svg" }, { "revision": "e7edbc277fdfc3bc9a7943c52c0831b1", "url": "img/ui/icons/icon_deselect.svg" }, { "revision": "e174e100e6cc3ab59e62da9b3de34e2e", "url": "img/ui/icons/icon_dropper.svg" }, { "revision": "676d8cc0082aedd62fa2299480dec8bc", "url": "img/ui/icons/icon_heat.png" }, { "revision": "27ed8c1ccdcf5155c9267ea6f0312888", "url": "img/ui/icons/icon_inlet.png" }, { "revision": "8aa70c4d4df82ee265b617e4b819b66c", "url": "img/ui/icons/icon_outlet.png" }, { "revision": "8913f28b71fc4db8c4558c38d292e05c", "url": "img/ui/icons/icon_paste.svg" }, { "revision": "76922c70732d25613d0754eff9520ac7", "url": "img/ui/icons/icon_power.png" }, { "revision": "26db28a0129aee7313ef03cc83a10edb", "url": "img/ui/icons/icon_time.png" }, { "revision": "0873650a1327bced0369f8e3f402d0da", "url": "img/ui/icons/icon_vent.png" }, { "revision": "74e78be65c8a68e601754fe50e68bf3c", "url": "img/ui/inner/inner_border_alt_active.png" }, { "revision": "8afa1f6e7f25411033e814dee71cf966", "url": "img/ui/inner/inner_border_alt_down.png" }, { "revision": "88d0e196e695589048e43e47f7219950", "url": "img/ui/inner/inner_border_alt_flip_active.png" }, { "revision": "b168d0712a0d551025cc55c11cadb0d2", "url": "img/ui/inner/inner_border_alt_flip_down.png" }, { "revision": "34b979f45978370ccf4077f016b2052c", "url": "img/ui/inner/inner_border_alt_flip.png" }, { "revision": "4d294cdccfe695ba1e04661fabdb2a23", "url": "img/ui/inner/inner_border_alt.png" }, { "revision": "16993496182bae7b8fd16d3d51d60d65", "url": "img/ui/inner/inner_border.png" }, { "revision": "300c6d3f24eac5815284617ce9ebd0ae", "url": "img/ui/nav/nav_experimental.png" }, { "revision": "d93f67ee48784701098e6823d50bc64f", "url": "img/ui/nav/nav_normal.png" }, { "revision": "3a5fa7a8389088abcdbb8c062a6d4416", "url": "img/ui/nav/nav_pause.png" }, { "revision": "a3a31030b4ace97c18c5bbae9422d6dd", "url": "img/ui/nav/nav_play.png" }, { "revision": "f57bddbf8e23f270cb599e4d24f4cd40", "url": "img/ui/nav/nav_renew.png" }, { "revision": "2ba72fcc2c8f9452867ec32d3dd3f67a", "url": "img/ui/nav/nav_unrenew.png" }, { "revision": "0d7b9f74f1140589f881c9387d224f72", "url": "img/ui/status/status_bolt.png" }, { "revision": "c55c26fc5563d1130631794a8fb004b3", "url": "img/ui/status/status_infinity.png" }, { "revision": "3557b7a6406e519b5aa4fd5a29bf0277", "url": "img/ui/status/status_plus.png" }, { "revision": "ad6e47b56ca3acb7661cc40c042c6a3b", "url": "img/ui/status/status_star.png" }, { "revision": "260f48f11226d3f6ace9b378ce588278", "url": "img/ui/status/status_time.png" }, { "revision": "03c713d1ec4a6dfc61954fe1ed180c58", "url": "img/ui/tile.png" }, { "revision": "6ff9f83f5e645978dc80da68549c579d", "url": "img/upgrades/default.png" }, { "revision": "5dfc5d316bdf0c52fe14dd0cd45cf101", "url": "img/upgrades/upgrade_cols.png" }, { "revision": "6ff9f83f5e645978dc80da68549c579d", "url": "img/upgrades/upgrade_computer.png" }, { "revision": "42add1d3d02bafe205e787f141dad15a", "url": "img/upgrades/upgrade_flux.png" }, { "revision": "593a0bd5dadfca450449a7a709957253", "url": "img/upgrades/upgrade_rows.png" }, { "revision": "f7a7c7d278d8bb1c25f2508194358856", "url": "pages/about.html" }, { "revision": "82165e7b1d0a2652500ad9d51f743547", "url": "pages/game.html" }, { "revision": "beb0f53bd4fa7db890966b0c8429c131", "url": "pages/privacy-policy.html" }, { "revision": "ade6959f3c5a59fb043cbb5858bb1d2e", "url": "pages/quick-start-modal.html" }, { "revision": "d634bd69601b78ff9ba4190aea741702", "url": "pages/reactor.html" }, { "revision": "336cd0108b80431f7f03554aafc78ae1", "url": "pages/research.html" }, { "revision": "f686fbb7b616c6902053c395a5840643", "url": "pages/splash.html" }, { "revision": "6571970976c8a6fe28aa42390b7d232f", "url": "pages/terms-of-service.html" }, { "revision": "a4a767c9c784147b003c814e28faccba", "url": "pages/upgrades.html" }, { "revision": "5e93f4c269016585061e1696ab31d086", "url": "components/templates.html" }, { "revision": "59dd3465a228c77ffbc3b3d88a99d593", "url": "manifest.json" }, { "revision": "a7e5350512e22395121b28a0443cf15e", "url": "version.json" }, { "revision": "4536b7d081208d2464c4da9fcbe87c2a", "url": "lib/pako.min.js" }, { "revision": "f3df67c6bdc0cab3080d1c01220e3a36", "url": "lib/zip.min.js" }, { "revision": "c8147c662cf2cd2575a63c720ff92df8", "url": "src/app.js" }, { "revision": "761a25a6f36e19f10ccba18fb7ed60c0", "url": "src/components/buttonFactory.js" }, { "revision": "6ad76e5855b0bf42aff6be16d75ee5e5", "url": "src/components/domMapper.js" }, { "revision": "b7bca0ef7a9c049f8a57d23977a8c638", "url": "src/components/pageRouter.js" }, { "revision": "de870d7b8f6fababede649c81d46df69", "url": "src/components/tooltip.js" }, { "revision": "db61b938c76cc06d389ff1b9b05d867e", "url": "src/components/ui.js" }, { "revision": "885080aae05ed1617d3d508b96d92b67", "url": "src/core/engine.js" }, { "revision": "e4755787be81a3404f8c6e63eedd2aaa", "url": "src/core/game.js" }, { "revision": "71530d5d03b33e656f1664c2a3ad1d95", "url": "src/core/objective.js" }, { "revision": "86ffc39de9b67d2333e357de9515f9da", "url": "src/core/objectiveActions.js" }, { "revision": "196b7f763d0fc53a3fcb76784b946e8f", "url": "src/core/part.js" }, { "revision": "7f0527dd3938372762842c46501901ac", "url": "src/core/partset.js" }, { "revision": "f6f555e4a85648d9057681910a896d2a", "url": "src/core/performance.js" }, { "revision": "1d2f73761a0b604468347e1ee44d604a", "url": "src/core/reactor.js" }, { "revision": "90397dcf22c33aa8deabdcf9198fb4e3", "url": "src/core/stateManager.js" }, { "revision": "0779af6bcc9477f10c797ad7f8cd1d4c", "url": "src/core/tile.js" }, { "revision": "44e9223177f620c6a23ae2c4b951b431", "url": "src/core/tileset.js" }, { "revision": "5b895f95e516bcc2ec892b6610525d57", "url": "src/core/upgrade.js" }, { "revision": "6f2c8f893ad198016b905efd4873de7f", "url": "src/core/upgradeActions.js" }, { "revision": "3fdd965ce9314d59a6b09b07de059fa7", "url": "src/core/upgradeset.js" }, { "revision": "df9476267d61b49cc8dd93de4560a5a2", "url": "src/services/dataService.js" }, { "revision": "bb1b05df450dbfa525ff08d692816a29", "url": "src/services/google-drive-config.js" }, { "revision": "8b0621a413a59592fc084c4e9ebf7def", "url": "src/services/GoogleDriveSave.js" }, { "revision": "2fd481f2f6ed74b5a049ff9c97895b83", "url": "src/services/pwa.js" }, { "revision": "e27f3a78be1118e252c45d1f8cedc87d", "url": "src/services/templateLoader.js" }, { "revision": "c159fc84130a4342b484da88b5d71000", "url": "src/utils/hotkeys.js" }, { "revision": "82ef608aca516ffaf925d798cbd98a68", "url": "src/utils/logger.js" }, { "revision": "dcc3ca44335ac0b388e04d6d3f9ea618", "url": "src/utils/logging-controls.js" }, { "revision": "36506f480cb552e574c2e86dd2b6aa59", "url": "src/utils/manifestValidator.js" }, { "revision": "7e6cc7b7c8f5769bab6c825374ee963f", "url": "src/utils/util.js" }]);

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
    }
  } catch (error) {
    console.log("Version check failed:", error);
  }
}

async function getDeployedVersion() {
  try {
    // Use current origin for version check
    const basePath = getBasePath();
    const versionUrl = `${self.location.origin}${basePath}/version.json`;

    const response = await fetch(versionUrl, {
      cache: "no-cache",
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br, zstd',
        'Referer': self.location.origin + self.location.pathname,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:142.0) Gecko/20100101 Firefox/142.0'
      }
    });

    if (response.ok) {
      const versionData = await response.json();
      console.log(`Deployed version fetched: ${versionData.version}`);
      return versionData.version;
    } else {
      console.log(`Version check failed with status: ${response.status}`);
      return null;
    }
  } catch (error) {
    console.log("Failed to get deployed version:", error);
    return null;
  }
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
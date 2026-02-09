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
workbox.precaching.precacheAndRoute([{"revision":"1bdaebd8c30612fc4a075b7d6ffc6bb0","url":"index.html"},{"revision":"9b3d7c24178d4e44579f55fd9c878016","url":"css/main.css"},{"revision":"63e33ac5a570a7399107510069a0c711","url":"data/upgrade_list.json"},{"revision":"179c85ebbf83cbcc1bf77f37da31e024","url":"data/tech_tree.json"},{"revision":"bd1bbdbf3873e57751a34f7664f53669","url":"data/part_list.json"},{"revision":"6a7c0d10ba9215fbcccc2f51f66fa8e1","url":"data/objective_list.json"},{"revision":"279e767b491d702f4de6fb0c73d08ddc","url":"data/help_text.json"},{"revision":"e8ba0b69d06999d197783fd477250109","url":"data/flavor_text.json"},{"revision":"593a0bd5dadfca450449a7a709957253","url":"img/upgrades/upgrade_rows.png"},{"revision":"42add1d3d02bafe205e787f141dad15a","url":"img/upgrades/upgrade_flux.png"},{"revision":"6ff9f83f5e645978dc80da68549c579d","url":"img/upgrades/upgrade_computer.png"},{"revision":"5dfc5d316bdf0c52fe14dd0cd45cf101","url":"img/upgrades/upgrade_cols.png"},{"revision":"6ff9f83f5e645978dc80da68549c579d","url":"img/upgrades/default.png"},{"revision":"03c713d1ec4a6dfc61954fe1ed180c58","url":"img/ui/tile.png"},{"revision":"3c10d2b9500ffadf95e3a236b0f9b5a5","url":"img/ui/connector_border.png"},{"revision":"260f48f11226d3f6ace9b378ce588278","url":"img/ui/status/status_time.png"},{"revision":"ad6e47b56ca3acb7661cc40c042c6a3b","url":"img/ui/status/status_star.png"},{"revision":"3557b7a6406e519b5aa4fd5a29bf0277","url":"img/ui/status/status_plus.png"},{"revision":"c55c26fc5563d1130631794a8fb004b3","url":"img/ui/status/status_infinity.png"},{"revision":"0d7b9f74f1140589f881c9387d224f72","url":"img/ui/status/status_bolt.png"},{"revision":"2ba72fcc2c8f9452867ec32d3dd3f67a","url":"img/ui/nav/nav_unrenew.png"},{"revision":"f57bddbf8e23f270cb599e4d24f4cd40","url":"img/ui/nav/nav_renew.png"},{"revision":"a3a31030b4ace97c18c5bbae9422d6dd","url":"img/ui/nav/nav_play.png"},{"revision":"3a5fa7a8389088abcdbb8c062a6d4416","url":"img/ui/nav/nav_pause.png"},{"revision":"d93f67ee48784701098e6823d50bc64f","url":"img/ui/nav/nav_normal.png"},{"revision":"300c6d3f24eac5815284617ce9ebd0ae","url":"img/ui/nav/nav_experimental.png"},{"revision":"b168d0712a0d551025cc55c11cadb0d2","url":"img/ui/inner/inner_border_alt_flip_down.png"},{"revision":"88d0e196e695589048e43e47f7219950","url":"img/ui/inner/inner_border_alt_flip_active.png"},{"revision":"34b979f45978370ccf4077f016b2052c","url":"img/ui/inner/inner_border_alt_flip.png"},{"revision":"8afa1f6e7f25411033e814dee71cf966","url":"img/ui/inner/inner_border_alt_down.png"},{"revision":"74e78be65c8a68e601754fe50e68bf3c","url":"img/ui/inner/inner_border_alt_active.png"},{"revision":"4d294cdccfe695ba1e04661fabdb2a23","url":"img/ui/inner/inner_border_alt.png"},{"revision":"16993496182bae7b8fd16d3d51d60d65","url":"img/ui/inner/inner_border.png"},{"revision":"920b850000e7a1c1cb33429f6620ad54","url":"img/ui/icons/physicist.png"},{"revision":"78294a325922ff96b64a849c9a39f68a","url":"img/ui/icons/medium.png"},{"revision":"0873650a1327bced0369f8e3f402d0da","url":"img/ui/icons/icon_vent.png"},{"revision":"26db28a0129aee7313ef03cc83a10edb","url":"img/ui/icons/icon_time.png"},{"revision":"76922c70732d25613d0754eff9520ac7","url":"img/ui/icons/icon_power.png"},{"revision":"bb56c24c7f353f1d1e0c29afe250c878","url":"img/ui/icons/icon_paste.svg"},{"revision":"8aa70c4d4df82ee265b617e4b819b66c","url":"img/ui/icons/icon_outlet.png"},{"revision":"27ed8c1ccdcf5155c9267ea6f0312888","url":"img/ui/icons/icon_inlet.png"},{"revision":"676d8cc0082aedd62fa2299480dec8bc","url":"img/ui/icons/icon_heat.png"},{"revision":"e3e273b981d98c125810dcd9373e51a5","url":"img/ui/icons/icon_dropper.svg"},{"revision":"fed7a7aa34259466d9e087848d9bd6ae","url":"img/ui/icons/icon_deselect.svg"},{"revision":"630309453bb6b905d3c58bae7376b35f","url":"img/ui/icons/icon_copy.svg"},{"revision":"dfd30030a001801128c2304d2064cfba","url":"img/ui/icons/icon_cash_outline.svg"},{"revision":"011967d1edb90a2f2f9b66274722922f","url":"img/ui/icons/icon_cash.png"},{"revision":"8cb4b765c0364a4fe26393ab3aa409b3","url":"img/ui/icons/hard.png"},{"revision":"6eec5dbb4c39b28a1efd3608bc632700","url":"img/ui/icons/engineer.png"},{"revision":"5b05d1a1f5010f9a9c37fcc8866589ed","url":"img/ui/icons/easy.png"},{"revision":"a52127d620b751cca6f8d20f14141f57","url":"img/ui/icons/architect.png"},{"revision":"04f4e5031be9dd99b542988b5ee78444","url":"img/ui/flow/flow-arrow-up.svg"},{"revision":"a09cbc1c5c67e5159406be33e18e9dbf","url":"img/ui/flow/flow-arrow-right.svg"},{"revision":"cdb11c795a7995ca65c62553da832801","url":"img/ui/flow/flow-arrow-left.svg"},{"revision":"7648f49c43e6c3767c0e753d7a4ce664","url":"img/ui/flow/flow-arrow-down.svg"},{"revision":"86a436af39b039fcc062b8d9367d4a82","url":"img/ui/effects/explosion_map.png"},{"revision":"71b531d21264310d8e3ad194044c035b","url":"img/ui/borders/panel/panel_border_last_middle.png"},{"revision":"1dc1c046ae1fa7f5e19d36937f02f23e","url":"img/ui/borders/panel/panel_border_last_last.png"},{"revision":"ae7b7d712d5b63e027cbbaff37ecf32e","url":"img/ui/borders/panel/panel_border_last_first.png"},{"revision":"4706b1360be792a3031cd9df2dc2a9bb","url":"img/ui/borders/panel/panel_border_first_last.png"},{"revision":"e2afbdc8ae45cba09819a3598bb6ecac","url":"img/ui/borders/panel/panel_border_first_first.png"},{"revision":"78c4fc10f243892c75afd305f610e006","url":"img/ui/borders/panel/panel_border.png"},{"revision":"f233442b298536953dd62b7be972aa81","url":"img/ui/borders/panel/medium_panel.png"},{"revision":"11bd051f12745ad29e0b6822a481fd56","url":"img/ui/borders/button/small_button_on.png"},{"revision":"e62f655357f844213996e68767881020","url":"img/ui/borders/button/small_button_off.png"},{"revision":"2f84325c8141054a17760f976ca142aa","url":"img/ui/borders/button/small_button_down.png"},{"revision":"cf44cde892a54cef55fcb55f189ebada","url":"img/ui/borders/button/button_border_alt_down_active.png"},{"revision":"2f84325c8141054a17760f976ca142aa","url":"img/ui/borders/button/button_border_alt_down.png"},{"revision":"5e391efc14bd667f048d85296b1706a1","url":"img/ui/borders/button/button_border_alt_active.png"},{"revision":"f6272c6fc8dfc4883ba94593a3ab7cc6","url":"img/ui/borders/button/button_border_alt.png"},{"revision":"12543e18860d1c4f9e56e780089ce8b7","url":"img/ui/borders/button/button_border.png"},{"revision":"56a6282fc161f98dd4389dfcc035152d","url":"img/parts/vents/vent_6.png"},{"revision":"57ffdee2c95962ce5636d2af933914eb","url":"img/parts/vents/vent_5.png"},{"revision":"e898b73451f4f6d88993a92274291de0","url":"img/parts/vents/vent_4.png"},{"revision":"04b683cd44ab653a71ce2f5693bdd5ac","url":"img/parts/vents/vent_3.png"},{"revision":"f26a17cf1e67eee98261a0b5eac7b85f","url":"img/parts/vents/vent_2.png"},{"revision":"9b5d0c45ef02d9062a86d8536a89f639","url":"img/parts/vents/vent_1.png"},{"revision":"696cc92751d7fc74a17a30cd7b3579b4","url":"img/parts/valves/valve_5_4.png"},{"revision":"03f28471207add9045b542fd927d0756","url":"img/parts/valves/valve_5_3.png"},{"revision":"c7890d505f6fca3d84bb0cdb5932bb9a","url":"img/parts/valves/valve_5_2.png"},{"revision":"c33818bafcc84728b2690568ab420b41","url":"img/parts/valves/valve_5_1.png"},{"revision":"209e6e04aa7da7812287de59207bdb7d","url":"img/parts/valves/valve_4_4.png"},{"revision":"c60324ce7aed89534895e25ed48e295d","url":"img/parts/valves/valve_4_3.png"},{"revision":"a31e5da0ee4716d28d578cfaa8c1beef","url":"img/parts/valves/valve_4_2.png"},{"revision":"132cbb966cc1a5090c006e41cee3fa48","url":"img/parts/valves/valve_4_1.png"},{"revision":"869e3e7ba633e20b19c28a3bccf3cfaf","url":"img/parts/valves/valve_3_4.png"},{"revision":"916e71bd58df9f9e46f512ba8284b1d3","url":"img/parts/valves/valve_3_3.png"},{"revision":"67c6e98a6a71d23dc2ec7558be29a73b","url":"img/parts/valves/valve_3_2.png"},{"revision":"21215fc8b3f2f8db523ef54972ca68a7","url":"img/parts/valves/valve_3_1.png"},{"revision":"1760b0577b01be3071f1e59ae5a3bbb0","url":"img/parts/valves/valve_2_4.png"},{"revision":"73cf7616e32f795a1d0c1fd44592cfa9","url":"img/parts/valves/valve_2_3.png"},{"revision":"59b89fa5e8ababb171b22ab0e73a96a5","url":"img/parts/valves/valve_2_2.png"},{"revision":"b621b679a3446e3e01e723f7c4a8c88a","url":"img/parts/valves/valve_2_1.png"},{"revision":"e8890928b539c5eb7de645e45b3a8e4d","url":"img/parts/valves/valve_1_4.png"},{"revision":"94ed81804d0e6d780f55a8c7a0a70a2a","url":"img/parts/valves/valve_1_3.png"},{"revision":"63af6557f14a5d8d1baa7b97b073e62d","url":"img/parts/valves/valve_1_2.png"},{"revision":"5781299fa17a81c108f557242105e14c","url":"img/parts/valves/valve_1_1.png"},{"revision":"23f8f36b74e44a09e1d56a7c6abc49a6","url":"img/parts/reflectors/reflector_6.png"},{"revision":"eb205b514899924467d78b83dedb0baf","url":"img/parts/reflectors/reflector_5.png"},{"revision":"ce68fdc2e7f685f5d4a8491a8531a534","url":"img/parts/reflectors/reflector_4.png"},{"revision":"ebb1c71614b449555e8d8f20f1dfa435","url":"img/parts/reflectors/reflector_3.png"},{"revision":"aa9be0bed953799f01091e281df81444","url":"img/parts/reflectors/reflector_2.png"},{"revision":"8660a1f1dfa43643cc674c7dbeb5cb5a","url":"img/parts/reflectors/reflector_1.png"},{"revision":"df398ac453b6ff0c36dfeba0896ac707","url":"img/parts/platings/plating_6.png"},{"revision":"bd0da8e926cf770459dd9d5fe5af5170","url":"img/parts/platings/plating_5.png"},{"revision":"21d0d28e2bdec87ea1aa984a6c342228","url":"img/parts/platings/plating_4.png"},{"revision":"b842c8cdf0cc485bdc28c4da4312a32b","url":"img/parts/platings/plating_3.png"},{"revision":"436dee2334598859b7ff0ab2eb9aa365","url":"img/parts/platings/plating_2.png"},{"revision":"fcebb7acc68bf91ab8c820e450c2a267","url":"img/parts/platings/plating_1.png"},{"revision":"f55ec009b2c05c079bbeaf0f1259a98d","url":"img/parts/outlets/outlet_6.png"},{"revision":"ba0667e294cd7f807c1a34f162d96dbc","url":"img/parts/outlets/outlet_5.png"},{"revision":"a7503536e0bb4f8abfccd802d56d9bc8","url":"img/parts/outlets/outlet_4.png"},{"revision":"fceca6297351e05e1ffa65a4da302807","url":"img/parts/outlets/outlet_3.png"},{"revision":"fcf64a82d89c7b71762c091c197deaea","url":"img/parts/outlets/outlet_2.png"},{"revision":"eaf001cd58d1a750b8ce0f088eb9f51b","url":"img/parts/outlets/outlet_1.png"},{"revision":"681323ea014b507e904a28c3467fa2a8","url":"img/parts/inlets/inlet_6.png"},{"revision":"8750b859c561358bfc62aedb420ecebf","url":"img/parts/inlets/inlet_5.png"},{"revision":"3b62f07d280fb0d4d1fd32da4d4bc44f","url":"img/parts/inlets/inlet_4.png"},{"revision":"9ad19c3b850927e61cd834eb348410ea","url":"img/parts/inlets/inlet_3.png"},{"revision":"f15404dc7611681aa463d2a6d0ac4463","url":"img/parts/inlets/inlet_2.png"},{"revision":"90f1520a1767e50105520dfb205012cd","url":"img/parts/inlets/inlet_1.png"},{"revision":"64516f47c6667efa2f0fcb43256476dd","url":"img/parts/exchangers/exchanger_6.png"},{"revision":"6b1b7eba65bdbf0f0e302698288f0375","url":"img/parts/exchangers/exchanger_5.png"},{"revision":"1e0a41f0196951c6341700b5cd90da97","url":"img/parts/exchangers/exchanger_4.png"},{"revision":"18341485113e90673acdfb5498206b5d","url":"img/parts/exchangers/exchanger_3.png"},{"revision":"92b86c791f66b493f47f84a0225cec43","url":"img/parts/exchangers/exchanger_2.png"},{"revision":"9e27a0196f5ef1d3ce0a719e85068863","url":"img/parts/exchangers/exchanger_1.png"},{"revision":"10faefaed29985c615c7337ccc5e1c38","url":"img/parts/coolants/coolant_cell_6.png"},{"revision":"b9c41600f1037ba06bafb387c64c6162","url":"img/parts/coolants/coolant_cell_5.png"},{"revision":"cf263237a0fcedf5334466c95f438dcf","url":"img/parts/coolants/coolant_cell_4.png"},{"revision":"a0e987cffdb329642d0d56d74e6ca9b1","url":"img/parts/coolants/coolant_cell_3.png"},{"revision":"570423e2bcd4672ea8483e80cb37f468","url":"img/parts/coolants/coolant_cell_2.png"},{"revision":"78373e70670dff11ac46435c85b5b78b","url":"img/parts/coolants/coolant_cell_1.png"},{"revision":"dae6f08cbbc1284e04f62c708ac7802b","url":"img/parts/cells/xcell_1_4.png"},{"revision":"f4e8b6c155453ed43ab624e04058be8c","url":"img/parts/cells/xcell_1_2.png"},{"revision":"d2ff14991568a3efafd710bd39535265","url":"img/parts/cells/xcell_1_1.png"},{"revision":"23a236d9c0cfe2a03c9dfab02e06ca50","url":"img/parts/cells/cell_6_4.png"},{"revision":"5fdb17d8e4f462a60777b9cc587773d0","url":"img/parts/cells/cell_6_2.png"},{"revision":"f33c4ea3ad3e24a96a5744f27f71b0ab","url":"img/parts/cells/cell_6_1.png"},{"revision":"b5da205167d4c9f4ab736ee042010038","url":"img/parts/cells/cell_5_4.png"},{"revision":"2669c6dbfa65cefe874c75fa96348f4a","url":"img/parts/cells/cell_5_2.png"},{"revision":"4df63d1b6346319b9d08923a5c2a9f94","url":"img/parts/cells/cell_5_1.png"},{"revision":"33e748feee15d4ad0c84bc9e06fd2fbf","url":"img/parts/cells/cell_4_4.png"},{"revision":"fcf1355b8dc093687f4c9449a1748eb8","url":"img/parts/cells/cell_4_2.png"},{"revision":"55aab78cc9b0822d2defecac6d21a224","url":"img/parts/cells/cell_4_1.png"},{"revision":"a7ff304540b0726c2817d0b052d8e61f","url":"img/parts/cells/cell_3_4.png"},{"revision":"83d64d73217b076a13495552f38286fb","url":"img/parts/cells/cell_3_2.png"},{"revision":"b63f6eb8b071583e28a2f97b1af25209","url":"img/parts/cells/cell_3_1.png"},{"revision":"2e8b2a09c3cec259c24c10f4d497dd9c","url":"img/parts/cells/cell_2_4.png"},{"revision":"a3f8ea285aed4684a19718955063b36d","url":"img/parts/cells/cell_2_2.png"},{"revision":"39ea70f56a7ec5075a1c945ac18f7e49","url":"img/parts/cells/cell_2_1.png"},{"revision":"f91c65a2122a73ec663bb56217f977da","url":"img/parts/cells/cell_1_4.png"},{"revision":"7189ae48bb10f4854ff50d117fee4d2e","url":"img/parts/cells/cell_1_2.png"},{"revision":"ea74a70fd54d49f540530fa70b4d8900","url":"img/parts/cells/cell_1_1.png"},{"revision":"fb647186bf5c39e13cca7431f42bf054","url":"img/parts/cells/cell_1_1-512x512.png"},{"revision":"e21043a4f770063ad1381cbb83d42e51","url":"img/parts/cells/cell_1_1-512x512-maskable.png"},{"revision":"66eb3c17b82f90079447b8064aa54f0b","url":"img/parts/cells/cell_1_1-192x192.png"},{"revision":"0a3365bd923db8f8199208ecc0a705f3","url":"img/parts/cells/cell_1_1-192x192-maskable.png"},{"revision":"581952de189f96d467128a90e46c6e15","url":"img/parts/capacitors/capacitor_6.png"},{"revision":"928071c411dbbe08be031f11261ae835","url":"img/parts/capacitors/capacitor_5.png"},{"revision":"08aa86061c4cf2b51a6f57c1c879f1eb","url":"img/parts/capacitors/capacitor_4.png"},{"revision":"4788e5e76938b46264385bd46da8344d","url":"img/parts/capacitors/capacitor_3.png"},{"revision":"4b30ae88e8c2f91dc8902332a4252191","url":"img/parts/capacitors/capacitor_2.png"},{"revision":"dd2f18c75e2aaf02a9ad1f53480dfbc6","url":"img/parts/capacitors/capacitor_1.png"},{"revision":"468848da96babe1d7be6a2a4750887ff","url":"img/parts/accelerators/accelerator_6.png"},{"revision":"01e4e2bf6cd9d157e59ad6044a853596","url":"img/parts/accelerators/accelerator_5.png"},{"revision":"bbc38021547dce7a367f7816d6b1024c","url":"img/parts/accelerators/accelerator_4.png"},{"revision":"871f25e123870dc5596f6f131602da4a","url":"img/parts/accelerators/accelerator_3.png"},{"revision":"4f878924fb3d0e44695d25869a826cf9","url":"img/parts/accelerators/accelerator_2.png"},{"revision":"58856725d38f0262ee2e9fd758a23596","url":"img/parts/accelerators/accelerator_1.png"},{"revision":"4db7e7a0681e79142400fa111a271c4a","url":"img/misc/reactor_planner.png"},{"revision":"5f0e2caca996e04a7674826c6b69edab","url":"img/misc/reactor_incremental.png"},{"revision":"f3cfbddfc11cbacb69bd7ae8dda189a1","url":"img/misc/preview.png"},{"revision":"8be8a2d3f4c4afd492eea2756ef544f3","url":"img/misc/lab.png"},{"revision":"aab0c901f8339bb7bc35e57b8c602651","url":"img/help/pa_spoiler.png"},{"revision":"2a6fa579510e86f9371757b35438e488","url":"pages/upgrades.html"},{"revision":"8cfa6511b076886a4f86d0379d2922e2","url":"pages/terms-of-service.html"},{"revision":"30b16915b1c0df3625f7d8739262597f","url":"pages/splash.html"},{"revision":"bfcdd9e47564634acbeb78d797be2b29","url":"pages/research.html"},{"revision":"dfc0d668352daf8abb45f6230743ce8b","url":"pages/reactor.html"},{"revision":"6de8c10c13b04c217f106c5501a0be78","url":"pages/quick-start-modal.html"},{"revision":"1893cf143fce03968f4889387af191a7","url":"pages/privacy-policy.html"},{"revision":"2c4b07573ef66a247ce47a72a8b6207b","url":"pages/leaderboard.html"},{"revision":"d261d248a798bc9f88e486aeb9b52d11","url":"pages/game.html"},{"revision":"45ead65890591ed5a78884a6ba09bfc2","url":"pages/debug-soundboard.html"},{"revision":"f7a7c7d278d8bb1c25f2508194358856","url":"pages/about.html"},{"revision":"43182e7a044beec9a180dce140a4ea97","url":"components/templates.html"},{"revision":"c93bb00016fb47107cf56856b55e17c2","url":"manifest.json"},{"revision":"a7e5350512e22395121b28a0443cf15e","url":"version.json"},{"revision":"c239b0ab41b4650523c8c1202a24878a","url":"lib/zip.min.js"},{"revision":"db21881f358f3b062530bed42a333346","url":"lib/sqlite3.js"},{"revision":"e647868246b70926c4d716f7640bd51a","url":"lib/pako.min.js"},{"revision":"4f60f7353226dd71dc7dec6225ed9034","url":"lib/break_infinity.min.js"},{"revision":"1ca949ab96d4f064706e25f142247cbc","url":"src/app.js"},{"revision":"65928f55d8a06327119f929632190728","url":"src/worker/physics.worker.js"},{"revision":"05a45eb7106b94cea1262337d67925df","url":"src/worker/gameLoop.worker.js"},{"revision":"1f092e4904777a32f105ced4667dacdb","url":"src/worker/buildHeatPayloadFromLayout.js"},{"revision":"8b28976c76b8dde335ca2759e369d765","url":"src/utils/util.js"},{"revision":"36506f480cb552e574c2e86dd2b6aa59","url":"src/utils/manifestValidator.js"},{"revision":"dcc3ca44335ac0b388e04d6d3f9ea618","url":"src/utils/logging-controls.js"},{"revision":"7520df98a86c438d004603f4bcd868ce","url":"src/utils/logger.js"},{"revision":"794a4ea07b908500fe46054c68047260","url":"src/utils/hotkeys.js"},{"revision":"af4d8ab2d57b6d04797ee1a594c36ec5","url":"src/utils/decimal.js"},{"revision":"9b79d47814eb2655531e74ea59eed66d","url":"src/utils/debugHistory.js"},{"revision":"fe549b2aa828df7d9972bbdddb8d49b8","url":"src/services/templateLoader.js"},{"revision":"e9d98789ceed1620559189f702fb844d","url":"src/services/SupabaseSave.js"},{"revision":"bcd906756ebc6fa2057d35925de1d8cc","url":"src/services/SupabaseAuth.js"},{"revision":"865dd16d0304d1bb59d67547ef14f992","url":"src/services/supabase-config.js"},{"revision":"190da36add2ad07d1715d483e7f44bde","url":"src/services/pwa.js"},{"revision":"b2a504fb4e451c8d4cb90e41b090c255","url":"src/services/leaderboardService.js"},{"revision":"1a9c42d8bdcdf47a8addcac9ebfac0e3","url":"src/services/leaderboard-config.js"},{"revision":"77b4d1ec2a4b5af2ecd9e34f54ae4dda","url":"src/services/GoogleDriveSave.js"},{"revision":"bb1b05df450dbfa525ff08d692816a29","url":"src/services/google-drive-config.js"},{"revision":"42f7c1c4a05db32b0d3b3584bd37659f","url":"src/services/dataService.js"},{"revision":"9e4a0680b1d90146a9e8827cd9432c53","url":"src/services/audioService.js"},{"revision":"8b154392d547bf53500d782027a95a6c","url":"src/core/upgradeset.js"},{"revision":"ed9fd3f931cd6f5721c038e231ede2a9","url":"src/core/upgradeActions.js"},{"revision":"b6237b8f61751a14c540b911177c98c7","url":"src/core/upgrade.js"},{"revision":"5f6a7f867a585f96b8445d9adb87ce62","url":"src/core/tileset.js"},{"revision":"5b538ffff3ccf8e7970c695feab11520","url":"src/core/tile.js"},{"revision":"975f7b218f328da502fa720868a4983d","url":"src/core/stateManager.js"},{"revision":"b2ee8d5d5e9ec5067acd0447ece39e81","url":"src/core/reactor.js"},{"revision":"f6f555e4a85648d9057681910a896d2a","url":"src/core/performance.js"},{"revision":"70935ca51866ee5dcd7455343a716cbd","url":"src/core/partset.js"},{"revision":"84a77f359c6e76bcdfa214ebf30b0f4f","url":"src/core/part.js"},{"revision":"33bf1f1cd429d9eb08dbbc6e95b891ef","url":"src/core/objectiveActions.js"},{"revision":"e55f86e1377e7c1ab6b767d9f682f6af","url":"src/core/objective.js"},{"revision":"c7907d8a384c4758957cc9467a8abe6d","url":"src/core/heatSystem.js"},{"revision":"06426a7e4f77db4633c470460cc451e6","url":"src/core/heatPayloadSchema.js"},{"revision":"23e5666259a6fc3ce48d658bec629fee","url":"src/core/heatCalculations.js"},{"revision":"ff67eb22dc13b1e805e22b7ba808c6f7","url":"src/core/game.js"},{"revision":"5a1aa2061ebecd088e0b6974f3815d1c","url":"src/core/engine.js"},{"revision":"ca8382da9b64355f1e97003fac93c4d7","url":"src/components/ui.js"},{"revision":"3c818346eadbe2597ee08af2badf042b","url":"src/components/tutorialManager.js"},{"revision":"00f0895c6d658257abd2b8252123667c","url":"src/components/tooltip.js"},{"revision":"23cb40cbe576f87b63373b4edfde62b9","url":"src/components/settingsModal.js"},{"revision":"49de2201312d657fb2cb17a9ca9d3175","url":"src/components/particleSystem.js"},{"revision":"6863c627da4c1db7b7d7abadf3261360","url":"src/components/pageRouter.js"},{"revision":"b0566aa069dde4b7e56dda1cec6c132c","url":"src/components/ModalManager.js"},{"revision":"4119d8043caa236ac31cf7c3d98a32d7","url":"src/components/InputManager.js"},{"revision":"e1261909a47b63d223c9df7affdc9355","url":"src/components/gridScaler.js"},{"revision":"f4f5465f296902ab3833870833958f39","url":"src/components/gridCanvasRenderer.js"},{"revision":"9d580821a3e446114972b16e1e175e65","url":"src/components/domMapper.js"},{"revision":"2646b77a1db6309e9ac25b91e0f43637","url":"src/components/buttonFactory.js"}]);

const coopCoepPlugin = {
  fetchDidSucceed: ({ response }) => {
    const newHeaders = new Headers(response.headers);
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
  cachedResponseWillBeUsed: ({ cachedResponse }) => {
    if (!cachedResponse) return null;
    const newHeaders = new Headers(cachedResponse.headers);
    newHeaders.set("Cross-Origin-Opener-Policy", "same-origin");
    newHeaders.set("Cross-Origin-Embedder-Policy", "credentialless");
    return new Response(cachedResponse.body, {
      status: cachedResponse.status,
      statusText: cachedResponse.statusText,
      headers: newHeaders,
    });
  },
};

// Page Cache (Network First)
workbox.routing.registerRoute(
  ({ request }) => request.mode === "navigate",
  new workbox.strategies.NetworkFirst({
    cacheName: "pages",
    plugins: [
      new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }),
      coopCoepPlugin,
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
      notifyClientsOfNewVersion(deployedVersion, localVersion);
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
    const basePath = getBasePath();
    const versionUrl = `${self.location.origin}${basePath}/version.json`;
    let response = null;
    if (typeof workbox !== "undefined" && workbox.precaching && workbox.precaching.getCacheKeyForURL) {
      const cacheKey = workbox.precaching.getCacheKeyForURL(versionUrl);
      if (cacheKey) {
        const cacheNames = await caches.keys();
        for (const name of cacheNames) {
          const cache = await caches.open(name);
          response = await cache.match(cacheKey);
          if (response) break;
        }
      }
    }
    if (!response) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        response = await cache.match(versionUrl);
        if (response) break;
      }
    }
    if (!response) {
      response = await fetch(versionUrl, { cache: "force-cache" });
    }
    if (response && response.ok) {
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
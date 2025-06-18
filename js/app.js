import { Game } from "./game.js";
import { ObjectiveManager } from "./objective.js";
import { TooltipManager } from "./tooltip.js";
import { on } from "./util.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // Load static version from deployment-generated file
  fetch("/version.json")
    .then((response) => response.json())
    .then((data) => {
      const versionElement = document.getElementById("app_version");
      if (versionElement && data.version) {
        versionElement.textContent = data.version;
      }
    })
    .catch((error) => {
      console.warn("Could not load version file:", error);
      // Fallback to current date/time if version file is not available
      const now = new Date();
      const fallbackVersion =
        now.getFullYear().toString().slice(-2) +
        "_" +
        String(now.getMonth() + 1).padStart(2, "0") +
        "_" +
        String(now.getDate()).padStart(2, "0") +
        "_" +
        String(now.getHours()).padStart(2, "0") +
        "_" +
        String(now.getMinutes()).padStart(2, "0");
      const versionElement = document.getElementById("app_version");
      if (versionElement) {
        versionElement.textContent = fallbackVersion + " (dev)";
      }
    });

  const ui = new UI();
  if (!ui) {
    console.error("UI object could not be created.");
    return;
  }
  const game = new Game(ui);
  if (!ui.init(game)) {
    console.error("Failed to initialize UI. Aborting game initialization.");
    return;
  }
  const tiles = game.tileset.initialize();
  tiles.forEach((t) => ui.stateManager.handleTileAdded(game, t));
  const parts = game.partset.initialize();
  parts.forEach((p) => ui.stateManager.handlePartAdded(game, p));
  const upgrades = game.upgradeset.initialize();
  upgrades.forEach((u) => ui.stateManager.handleUpgradeAdded(game, u));
  game.set_defaults();
  game.objectives_manager = new ObjectiveManager(game);
  game.tooltip_manager = new TooltipManager("#main", "#tooltip", game);
  game.engine = new Engine(game);
  game.initialize_new_game_state();
  game.objectives_manager.start();
  game.engine.start();
  ui.stateManager.setVar("max_heat", game.reactor.max_heat, true);
  ui.stateManager.setVar("max_power", game.reactor.max_power, true);

  const setupTooltipEvents = (parentElement, itemSelector, getObject) => {
    if (!parentElement) return;
    const showHandler = function () {
      const obj = getObject(this);
      const tileContext = this.tile;
      if (obj) game.tooltip_manager.show(obj, tileContext, false, this);
      else game.tooltip_manager.hide();
    };
    const hideHandler = () => game.tooltip_manager.hide();
    on(parentElement, itemSelector, "mouseover", showHandler);
    on(parentElement, itemSelector, "mouseout", hideHandler);
    on(parentElement, itemSelector, "focus", showHandler);
    on(parentElement, itemSelector, "blur", hideHandler);
  };

  on(
    document.getElementById("parts_tab_contents"),
    ".part",
    "click",
    function () {
      if (this._part) game.tooltip_manager.show(this._part, null, true);
    }
  );

  const setupUpgradeClickHandler = (container) => {
    if (!container) return;
    on(container, ".upgrade", "click", function (e) {
      const upgrade_obj = this.upgrade_object;
      if (!upgrade_obj) return;
      if (e.shiftKey) {
        let result;
        do {
          result = game.upgradeset.purchaseUpgrade(upgrade_obj.id);
        } while (result && e.shiftKey);
        if (
          game.tooltip_manager.isLocked &&
          game.tooltip_manager.current_obj === upgrade_obj
        ) {
          game.tooltip_manager.update();
        }
      } else {
        game.tooltip_manager.show(upgrade_obj, null, true);
      }
    });
  };

  setupUpgradeClickHandler(document.getElementById("upgrades_content_wrapper"));
  setupUpgradeClickHandler(
    document.getElementById("experimental_upgrades_content_wrapper")
  );

  const reactorEl = document.getElementById("reactor");
  if (reactorEl) {
    setupTooltipEvents(reactorEl, ".tile", (el) =>
      el.tile && el.tile.part ? el.tile.part : null
    );
  }

  document.addEventListener(
    "click",
    (e) => {
      if (game.tooltip_manager.isLocked) {
        const tooltipEl = document.getElementById("tooltip");
        if (
          !tooltipEl.contains(e.target) &&
          !e.target.closest(".upgrade, .part")
        ) {
          game.tooltip_manager.closeView();
        }
      }
    },
    true
  );

  const coolBtn = document.getElementById("reduceHeatBtnInfoBar");
  let coolBtnInterval = null;
  let coolBtnTimeout = null;
  function startCoolRepeat(e) {
    e.preventDefault();
    if (coolBtnInterval) return;
    game.manual_reduce_heat_action();
    coolBtnTimeout = setTimeout(() => {
      coolBtnInterval = setInterval(() => {
        game.manual_reduce_heat_action();
      }, 120);
    }, 350);
  }
  function stopCoolRepeat() {
    if (coolBtnTimeout) clearTimeout(coolBtnTimeout);
    if (coolBtnInterval) clearInterval(coolBtnInterval);
    coolBtnTimeout = null;
    coolBtnInterval = null;
  }
  if (coolBtn) {
    console.log("coolBtn", coolBtn);
    coolBtn.addEventListener("mousedown", startCoolRepeat);
    coolBtn.addEventListener("touchstart", startCoolRepeat, { passive: false });
    coolBtn.addEventListener("mouseup", stopCoolRepeat);
    coolBtn.addEventListener("mouseleave", stopCoolRepeat);
    coolBtn.addEventListener("touchend", stopCoolRepeat, { passive: true });
    coolBtn.addEventListener("touchcancel", stopCoolRepeat, { passive: true });
  }
  const sellBtn = document.getElementById("sellBtnInfoBar");
  if (sellBtn) {
    console.log("sellBtn", sellBtn);
    sellBtn.addEventListener("click", () => game.sell_action());
  }
  window.reboot = (refund_ep = false) => game.reboot_action(refund_ep);
});

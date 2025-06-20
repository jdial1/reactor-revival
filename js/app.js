import { Game } from "./game.js";
import { ObjectiveManager } from "./objective.js";
import { TooltipManager } from "./tooltip.js";
import { on } from "./util.js";
import { UI } from "./ui.js";
import { Engine } from "./engine.js";
import { PWA } from "./pwa.js";
import help_text from "../data/help_text.js";

document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  // Initialize PWA
  const pwa = new PWA();

  // Load static version from deployment-generated file
  // Try multiple paths to handle different server configurations
  const versionPaths = ["/version.json", "./version.json", "version.json"];

  const loadVersion = async () => {
    for (const path of versionPaths) {
      try {
        const response = await fetch(path);
        if (response.ok) {
          const data = await response.json();
          console.log("Version data:", data);
          const versionElement = document.getElementById("app_version");
          if (versionElement && data.version) {
            versionElement.textContent = data.version;
            // Also update about section version
            const aboutVersionElement =
              document.getElementById("about_version");
            if (aboutVersionElement) {
              aboutVersionElement.textContent = data.version;
            }
            return; // Successfully loaded version
          }
        }
      } catch (error) {
        // Continue to next path
        continue;
      }
    }

    // Fallback to current date/time if no version file is available (local development)
    console.log("No version file found, using development fallback");
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
  };

  loadVersion();

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

  // Show quick start modal on first start
  function showQuickStartModal() {
    console.log("showQuickStartModal");
    // if (localStorage.getItem("reactorGameQuickStartShown")) return;
    const modal = document.createElement("div");
    modal.id = "quick-start-modal";
    modal.innerHTML = `
      <div class="quick-start-overlay">
        <div class="quick-start-content pixel-panel">
          <h2 class="quick-start-title">Welcome to Reactor!</h2>
          <div class="quick-start-section">
            <h3>Key Concepts:</h3>
            <ul class="quick-start-list">
              <li><b>Heat</b> <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>: must be managed or your reactor will melt down.</li>
              <li><b>Power</b> <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>: can be sold for money.</li>
              <li><b>Tick</b> <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>: Each game tick processes heat, power, and component actions.</li>
              <li><b>Pulse</b>: A single update cycle (tick) of the reactor.</li>
            </ul>
          </div>
          <div class="quick-start-section">
            <h3>Quick Actions:</h3>
            <div class="quick-start-actions">
              <div><b>Manual Cooling:</b> Click the <b>Heat</b> <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'> bar to reduce heat instantly.</div>
              <div><b>Selling Power:</b> Click the <b>Power</b> <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'> bar to convert power to money.</div>
            </div>
          </div>
          <div class="quick-start-tutorial-note">
            <b>Follow the objectives at the top to continue the tutorial!</b>
          </div>
          <button id="quick-start-close" class="pixel-btn btn-start">Got it!</button>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    document.getElementById("quick-start-close").onclick = () => {
      modal.remove();
      localStorage.setItem("reactorGameQuickStartShown", "1");
    };
  }

  if (!game.loadGame()) {
    game.initialize_new_game_state();
  }

  showQuickStartModal();

  game.objectives_manager.start();
  game.engine.start();
  ui.stateManager.setVar("max_heat", game.reactor.max_heat, true);
  ui.stateManager.setVar("max_power", game.reactor.max_power, true);
  game.pwa = pwa;

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
    // Add click handler for mobile/tap support
    on(reactorEl, ".tile", "click", function () {
      if (this.tile && this.tile.part) {
        game.tooltip_manager.show(this.tile.part, this.tile, true, this);
      }
    });
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

  const SAVE_INTERVAL = 5 * 60 * 1000;
  setInterval(() => {
    game.saveGame();
  }, SAVE_INTERVAL);

  // Lock parts panel open on wide screens and remove parts button from top nav
  function updatePartsPanelForScreen() {
    const partsSection = document.getElementById("parts_section");
    const partsPanelToggle = document.getElementById("parts_panel_toggle");
    const partsButton = document.querySelector(
      '.styled-button[data-toggle="parts_panel"]'
    );
    if (window.innerWidth > 900) {
      if (partsSection) partsSection.classList.remove("collapsed");
      if (partsPanelToggle) partsPanelToggle.style.display = "none";
      if (partsButton) partsButton.style.display = "none";
    } else {
      if (partsPanelToggle) partsPanelToggle.style.display = "";
      if (partsButton) partsButton.style.display = "";
    }
  }
  // Call immediately after DOM is ready and after all DOM elements are available
  updatePartsPanelForScreen();
  window.addEventListener("resize", updatePartsPanelForScreen);

  // Add info icons and tooltips to control buttons
  function addControlHelpTooltips() {
    const controlMap = [
      { id: "auto_sell_toggle", help: "autoSell" },
      { id: "auto_buy_toggle", help: "autoBuy" },
      { id: "time_flux_toggle", help: "timeFlux" },
      { id: "heat_control_toggle", help: "heatController" },
      { id: "pause_toggle", help: "pause" },
    ];
    controlMap.forEach(({ id, help }) => {
      const btn = document.getElementById(id);
      if (!btn) return;
      // Only add if not already present
      if (!btn.querySelector(".info-button")) {
        const infoButton = document.createElement("button");
        infoButton.className = "info-button pixel-btn-small";
        infoButton.textContent = "❓";
        infoButton.title = "Click for information";
        btn.appendChild(infoButton);
        // Tooltip event: only on click
        infoButton.addEventListener("click", (e) => {
          e.stopPropagation();
          // Get button label without the info icon
          let label = btn.cloneNode(true);
          label.querySelector(".info-button")?.remove();
          let title = label.textContent.trim();
          game.tooltip_manager.show(
            {
              title: title,
              description: help_text.controls[help],
            },
            null,
            true,
            infoButton
          );
        });
      }
    });
  }

  // ... after game.engine.start();
  addControlHelpTooltips();
});

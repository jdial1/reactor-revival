import { toDecimal } from "../../utils/decimal.js";
import { setDecimal } from "../../core/store.js";
import { getCompactLayout } from "./copyPaste/layoutSerializer.js";

export class SandboxUI {
  constructor(ui) {
    this.ui = ui;
  }

  toggleSandbox() {
    if (!this.ui.game) return;
    if (this.ui.game.isSandbox) {
      window.location.href = window.location.origin + window.location.pathname;
    } else {
      this.enterSandbox();
    }
  }

  compactTo2DLayout(compact) {
    if (!compact || !compact.size || !compact.parts) return null;
    const { rows, cols } = compact.size;
    const layout = [];
    for (let r = 0; r < rows; r++) {
      layout[r] = [];
      for (let c = 0; c < cols; c++) layout[r][c] = null;
    }
    compact.parts.forEach((p) => {
      if (p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols) {
        layout[p.r][p.c] = { id: p.id, t: p.t, lvl: p.lvl || 1 };
      }
    });
    return layout;
  }

  enterSandbox() {
    const ui = this.ui;
    if (!ui.game || ui.game.isSandbox) return;
    const layout = getCompactLayout(ui.game);
    if (!layout) return;
    ui.game._mainState = {
      layout,
      money: ui.game.state.current_money,
      ep: ui.game.state.current_exotic_particles,
      rows: ui.game.rows,
      cols: ui.game.cols
    };
    ui.game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) tile.clearPart();
    });
    if (ui.game._sandboxState?.layout) {
      const prevSuppress = ui.game._suppressPlacementCounting;
      ui.game._suppressPlacementCounting = true;
      const layout2D = this.compactTo2DLayout(ui.game._sandboxState.layout);
      if (layout2D && (ui.game._sandboxState.rows === ui.game.rows && ui.game._sandboxState.cols === ui.game.cols)) {
        ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
      } else if (layout2D && (ui.game._sandboxState.rows !== ui.game.rows || ui.game._sandboxState.cols !== ui.game.cols)) {
        ui.game.rows = ui.game._sandboxState.rows;
        ui.game.cols = ui.game._sandboxState.cols;
        ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
      }
      ui.game._suppressPlacementCounting = prevSuppress;
    }
    ui.game.isSandbox = true;
    ui.game.reactor.current_heat = 0;
    ui.game.reactor.current_power = 0;
    ui.stateManager.setVar("exotic_particles", Infinity);
    ui.stateManager.setVar("current_heat", 0);
    ui.stateManager.setVar("current_power", 0);
    document.body.classList.add("reactor-sandbox");
    ui.partsPanelUI.unlockAllPartsForTesting();
    ui.game.upgradeset.check_affordability(ui.game);
    ui.coreLoopUI.runUpdateInterfaceLoop();
    if (ui._updateSandboxButton) ui._updateSandboxButton();
  }

  exitSandbox() {
    const ui = this.ui;
    if (!ui.game || !ui.game.isSandbox || !ui.game._mainState) return;
    const layout = getCompactLayout(ui.game);
    const hasParts = (layout?.parts?.length ?? 0) > 0;
    if (hasParts && typeof confirm === "function" && confirm("Save blueprint layout before exiting? You can add it to My Layouts.")) {
      const defaultName = `Sandbox ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
      const name = (typeof prompt === "function" ? prompt("Name for this layout:", defaultName) : null) || defaultName;
      ui.layoutStorageUI.addToMyLayouts(name.trim() || defaultName, JSON.stringify(layout, null, 2));
    }
    ui.game._sandboxState = {
      layout,
      rows: ui.game.rows,
      cols: ui.game.cols
    };
    const main = ui.game._mainState;
    if (main.rows !== ui.game.rows || main.cols !== ui.game.cols) {
      ui.game.rows = main.rows;
      ui.game.cols = main.cols;
    }
    ui.game.tileset.tiles_list.forEach((tile) => {
      if (tile.enabled && tile.part) tile.clearPart();
    });
    const prevSuppress = ui.game._suppressPlacementCounting;
    ui.game._suppressPlacementCounting = true;
    const layout2D = this.compactTo2DLayout(main.layout);
    if (layout2D) ui.copyPaste.pasteReactorLayout(layout2D, { skipCostDeduction: true });
    ui.game._suppressPlacementCounting = prevSuppress;
    const moneyVal = (main.money != null && typeof main.money.gt === "function") ? main.money : toDecimal(main.money ?? 0);
    const epVal = (main.ep != null && typeof main.ep.gt === "function") ? main.ep : toDecimal(main.ep ?? 0);
    setDecimal(ui.game.state, "current_money", moneyVal);
    ui.game.exoticParticleManager.exotic_particles = epVal;
    setDecimal(ui.game.state, "current_exotic_particles", epVal);
    ui.game.isSandbox = false;
    ui.stateManager.setVar("exotic_particles", main.ep);
    document.body.classList.remove("reactor-sandbox");
    ui.game.reactor.updateStats();
    ui.coreLoopUI.runUpdateInterfaceLoop();
    if (ui._updateSandboxButton) ui._updateSandboxButton();
  }

  initializeSandboxUpgradeButtons() {
    const ui = this.ui;
    const upgradesBuyAll = document.getElementById("upgrades_buy_all_btn");
    const upgradesClearAll = document.getElementById("upgrades_clear_all_btn");
    const researchBuyAll = document.getElementById("research_buy_all_btn");
    const researchClearAll = document.getElementById("research_clear_all_btn");
    if (upgradesBuyAll && ui.game?.upgradeset) {
      upgradesBuyAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.purchaseAllUpgrades();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (upgradesClearAll && ui.game?.upgradeset) {
      upgradesClearAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.clearAllUpgrades();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (researchBuyAll && ui.game?.upgradeset) {
      researchBuyAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.purchaseAllResearch();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
    if (researchClearAll && ui.game?.upgradeset) {
      researchClearAll.onclick = () => {
        if (ui.game.isSandbox) ui.game.upgradeset.clearAllResearch();
        ui.game.upgradeset.check_affordability(ui.game);
      };
    }
  }
}

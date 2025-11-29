import { Upgrade } from "./upgrade.js";
import dataService from "../services/dataService.js";

// Load upgrade data
let upgrade_templates = [];
let dataLoaded = false;

async function ensureDataLoaded() {
  if (!dataLoaded) {
    try {
      upgrade_templates = await dataService.loadUpgradeList();
      dataLoaded = true;
    } catch (error) {
      console.warn("Failed to load upgrade list:", error);
      upgrade_templates = [];
      dataLoaded = true;
    }
  }
  return upgrade_templates;
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
  }

  async initialize() {
    await ensureDataLoaded();
    this.reset();

    const data = upgrade_templates.default || upgrade_templates;
    this.game.logger?.debug("Upgrade data loaded:", data?.length, "upgrades");

    const fullUpgradeList = [...data, ...this._generateCellUpgrades()];

    fullUpgradeList.forEach((upgradeDef) => {
      const upgradeInstance = new Upgrade(upgradeDef, this.game);
      this.upgrades.set(upgradeInstance.id, upgradeInstance);
      this.upgradesArray.push(upgradeInstance);
    });

    return this.upgradesArray;
  }


  _generateCellUpgrades() {
    const generatedUpgrades = [];
    const allParts = this.game.partset.getAllParts();
    this.game.logger?.debug("All parts:", allParts.map(p => ({ id: p.id, level: p.level, hasCost: !!p.part.cell_tick_upgrade_cost })));

    const baseCellParts = allParts
      .filter((p) => p.part.cell_tick_upgrade_cost && p.level === 1);

    this.game.logger?.debug("Base cell parts for upgrades:", baseCellParts.map(p => p.id));

    const cellUpgradeTemplates = [
      { type: "cell_power", title: "Potent ", description: "s: +100% power.", actionId: "cell_power" },
      { type: "cell_tick", title: "Enriched ", description: "s: 2x duration.", actionId: "cell_tick" },
      { type: "cell_perpetual", title: "Perpetual ", description: "s: auto-replace at 1.5x normal price.", levels: 1, actionId: "cell_perpetual" },
    ];

    for (const template of cellUpgradeTemplates) {
      for (const part of baseCellParts) {
        const upgradeDef = {
          id: `${part.id}_${template.type}`,
          type: `${template.type}_upgrades`,
          title: template.title + part.title,
          description: part.title + template.description,
          levels: template.levels,
          cost: part.part[`${template.type}_upgrade_cost`],
          multiplier: part.part[`${template.type}_upgrade_multi`],
          actionId: template.actionId,
          classList: [part.id, template.type],
          part: part,
          icon: part.getImagePath(),
        };
        this.game.logger?.debug(`Generated upgrade: ${upgradeDef.id} with cost: ${upgradeDef.cost}`);
        generatedUpgrades.push(upgradeDef);
      }
    }
    this.game.logger?.debug("Total generated upgrades:", generatedUpgrades.length);
    return generatedUpgrades;
  }

  reset() {
    this.upgrades.clear();
    this.upgradesArray = [];
  }

  getUpgrade(id) {
    return this.upgrades.get(id);
  }

  getAllUpgrades() {
    return this.upgradesArray;
  }

  getUpgradesByType(type) {
    return this.upgradesArray.filter((upgrade) => upgrade.upgrade.type === type);
  }

  populateUpgrades() {
    this._populateUpgradeSection("upgrades_content_wrapper", (upgrade) => !upgrade.base_ecost);
  }

  populateExperimentalUpgrades() {
    this._populateUpgradeSection("experimental_upgrades_content_wrapper", (upgrade) => !!upgrade.base_ecost);
  }

  _populateUpgradeSection(wrapperId, filterFn) {
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    wrapper.querySelectorAll(".upgrade-group").forEach((el) => (el.innerHTML = ""));

    this.upgradesArray.filter(filterFn).forEach((upgrade) => {
      try {
        const upgType = upgrade?.upgrade?.type || "";
        const basePart = upgrade?.upgrade?.part;
        const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
        if (isCellUpgrade && basePart && basePart.category === "cell") {
          const show = this.game && typeof this.game.isPartUnlocked === "function"
            ? this.game.isPartUnlocked(basePart)
            : true;
          if (!show) {
            return;
          }
        }
      } catch (_) { }

      upgrade.$el = null;
      this.game.ui.stateManager.handleUpgradeAdded(this.game, upgrade);

      if (upgrade.$el) {
        upgrade.updateDisplayCost();
      }
    });

    if (this.game) {
      this.check_affordability(this.game);
    }
  }

  purchaseUpgrade(upgradeId) {
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade || !upgrade.affordable || upgrade.level >= upgrade.max_level) {
      return false;
    }

    const cost = upgrade.getCost();
    const ecost = upgrade.getEcost();
    let purchased = false;

    if (ecost > 0) {
      if (this.game.current_exotic_particles >= ecost) {
        this.game.current_exotic_particles -= ecost;
        this.game.ui.stateManager.setVar("current_exotic_particles", this.game.current_exotic_particles);
        purchased = true;
      }
    } else {
      if (this.game.current_money >= cost) {
        this.game.current_money -= cost;
        this.game.ui.stateManager.setVar("current_money", this.game.current_money);
        purchased = true;
      }
    }

    if (purchased) {
      upgrade.setLevel(upgrade.level + 1);
      this.game.debugHistory.add('upgrades', 'Upgrade purchased', { id: upgradeId, level: upgrade.level });
      if (upgrade.upgrade.type === "experimental_parts") {
        this.game.epart_onclick(upgrade);
      }
      this.game.saveGame(null, true); // true = isAutoSave
    }

    return purchased;
  }

  check_affordability(game) {
    if (!game) return;

    const hideUpgrades = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_unaffordable_upgrades") !== "false";
    const hideResearch = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_unaffordable_research") !== "false";

    this.upgradesArray.forEach((upgrade) => {
      let isAffordable = false;

      // During meltdown, make all upgrades unaffordable
      if (game.reactor && game.reactor.has_melted_down) {
        isAffordable = false;
      } else {
        const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);

        if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) {
          isAffordable = false;
        } else if (upgrade.base_ecost) {
          isAffordable = game.current_exotic_particles >= upgrade.current_ecost;
        } else {
          isAffordable = game.current_money >= upgrade.current_cost;
        }
      }

      upgrade.setAffordable(isAffordable);

      if (upgrade.$el) {
        const isResearch = !!upgrade.base_ecost;
        const shouldHide = isResearch ? hideResearch : hideUpgrades;
        const isMaxed = upgrade.level >= upgrade.max_level;

        if (shouldHide && !isAffordable && !isMaxed) {
          upgrade.$el.classList.add("hidden");
        } else {
          upgrade.$el.classList.remove("hidden");
        }
      }
    });
  }

  hasAffordableUpgrades() {
    return this.upgradesArray.some((upgrade) => !upgrade.base_ecost && upgrade.affordable && upgrade.level < upgrade.max_level);
  }

  hasAffordableResearch() {
    return this.upgradesArray.some((upgrade) => upgrade.base_ecost && upgrade.affordable && upgrade.level < upgrade.max_level);
  }
}

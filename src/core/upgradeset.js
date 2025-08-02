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
    console.log("Upgrade data loaded:", data?.length, "upgrades");
    console.log("First upgrade:", data?.[0]);

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
    console.log("All parts:", allParts.map(p => ({ id: p.id, level: p.level, hasCost: !!p.part.cell_tick_upgrade_cost })));

    const baseCellParts = allParts
      .filter((p) => p.part.cell_tick_upgrade_cost && p.level === 1);

    console.log("Base cell parts for upgrades:", baseCellParts.map(p => p.id));

    const cellUpgradeTemplates = [
      { type: "cell_power", title: "Potent ", description: "s produce 100% more power per level of upgrade.", actionId: "cell_power" },
      { type: "cell_tick", title: "Enriched ", description: "s last twice as long per level of upgrade.", actionId: "cell_tick" },
      { type: "cell_perpetual", title: "Perpetual ", description: "s auto-replace when depleted. Replacement costs 1.5x normal price.", levels: 1, actionId: "cell_perpetual" },
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
        console.log(`Generated upgrade: ${upgradeDef.id} with cost: ${upgradeDef.cost}`);
        generatedUpgrades.push(upgradeDef);
      }
    }
    console.log("Total generated upgrades:", generatedUpgrades.length);
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

    wrapper.innerHTML = ""; // Clear the entire wrapper

    const upgradesToPopulate = this.upgradesArray.filter(filterFn);

    // Group upgrades by their type
    const groupedUpgrades = upgradesToPopulate.reduce((groups, upgrade) => {
      const type = upgrade.upgrade.type || "other";
      if (!groups[type]) {
        groups[type] = [];
      }
      groups[type].push(upgrade);
      return groups;
    }, {});

    // Dynamically create categories and populate them
    for (const type in groupedUpgrades) {
      if (groupedUpgrades.hasOwnProperty(type)) {
        const upgrades = groupedUpgrades[type];

        // Create a title for the category
        const titleEl = document.createElement("h2");
        titleEl.textContent = type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
        wrapper.appendChild(titleEl);

        // Create a container for the upgrades in this category
        const container = document.createElement("div");
        container.id = type;
        container.className = "pixel-panel upgrade-group";
        wrapper.appendChild(container);

        upgrades.forEach((upgrade) => {
          // We need to append the element to the new container, not rely on handleUpgradeAdded
          const upgradeEl = upgrade.createElement(); // Assuming createElement is in Upgrade class
          if (upgradeEl) {
            container.appendChild(upgradeEl);
            upgrade.updateDisplayCost();
            upgrade.$el.classList.toggle("unaffordable", !upgrade.affordable);
          }
        });
      }
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
      if (upgrade.upgrade.type === "experimental_parts") {
        this.game.epart_onclick(upgrade);
      }
      this.game.saveGame();
    }

    return purchased;
  }

  check_affordability(game) {
    if (!game) return;
    this.upgradesArray.forEach((upgrade) => {
      let isAffordable = false;
      const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);

      if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) {
        isAffordable = false;
      } else if (upgrade.base_ecost) {
        isAffordable = game.current_exotic_particles >= upgrade.current_ecost;
      } else {
        isAffordable = game.current_money >= upgrade.current_cost;
      }

      upgrade.setAffordable(isAffordable);
    });
  }
}

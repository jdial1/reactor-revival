import { Upgrade } from "./upgrade.js";
import upgradeActions from "./upgradeActions.js";
import upgrade_templates from "../data/upgrade_list.js";
export class UpgradeSet {
  constructor(game) {
    "use strict";
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
  }
  initialize() {
    // Clear existing upgrades to prevent duplication
    this.upgrades.clear();
    this.upgradesArray = [];

    const full_upgrade_list = [...upgrade_templates];
    const baseCellParts = this.game.partset
      .getAllParts()
      .filter((p) => p.part.cell_tick_upgrade_cost && p.part.level === 1);
    const cellUpgradeTemplates = [
      {
        type: "cell_power",
        title: "Potent ",
        description: "s produce 100% more power per level of upgrade.",
        actionId: "cell_power",
      },
      {
        type: "cell_tick",
        title: "Enriched ",
        description: "s last twice as long per level of upgrade.",
        actionId: "cell_tick",
      },
      {
        type: "cell_perpetual",
        title: "Perpetual ",
        description:
          "s are automatically replaced when they become depleted. The replacement cell will cost 1.5 times the normal cost.",
        levels: 1,
        actionId: "cell_perpetual",
      },
    ];
    for (const template of cellUpgradeTemplates) {
      for (const part of baseCellParts) {
        full_upgrade_list.push({
          id: `${part.id}_${template.type}`,
          type: `${template.type}_upgrades`,
          title: template.title + part.title, // Use part.title directly
          description: part.title + template.description,
          levels: template.levels,
          cost: part.part[template.type + "_upgrade_cost"],
          multiplier: part.part[template.type + "_upgrade_multi"],
          actionId: template.actionId,
          classList: [part.id, template.type],
          part: part, // Use the Part instance, not part.part
          icon: part.getImagePath(),
        });
      }
    }
    full_upgrade_list.forEach((upgrade_def) => {
      const upgrade_obj = new Upgrade(upgrade_def, this.game);
      this.upgrades.set(upgrade_obj.id, upgrade_obj);
      this.upgradesArray.push(upgrade_obj);
    });
    return this.upgradesArray;
  }
  reset() {
    this.upgrades.forEach((upgrade) => upgrade.setLevel(0));
  }
  getUpgrade(id) {
    return this.upgrades.get(id);
  }
  getAllUpgrades() {
    return this.upgradesArray;
  }
  getUpgradesByType(type) {
    return this.upgradesArray.filter(
      (upgrade) => upgrade.upgrade.type === type
    );
  }
  populateUpgrades() {
    const wrapper = document.getElementById("upgrades_content_wrapper");
    if (wrapper) {
      wrapper
        .querySelectorAll(".upgrade-group")
        .forEach((el) => (el.innerHTML = ""));
    }
    this.upgradesArray.forEach((upgrade) => {
      if (!upgrade.base_ecost) {
        this.game.ui.stateManager.handleUpgradeAdded(this.game, upgrade);
      }
    });

    // Force update all upgrade elements to reflect current state
    this.upgradesArray.forEach((upgrade) => {
      if (!upgrade.base_ecost && upgrade.$el) {
        upgrade.updateDisplayCost();
        upgrade.$el.classList.toggle("unaffordable", !upgrade.affordable);
      }
    });
  }
  populateExperimentalUpgrades() {
    const wrapper = document.getElementById(
      "experimental_upgrades_content_wrapper"
    );
    if (wrapper) {
      wrapper
        .querySelectorAll(".upgrade-group")
        .forEach((el) => (el.innerHTML = ""));
    }
    this.upgradesArray.forEach((upgrade) => {
      if (upgrade.base_ecost) {
        this.game.ui.stateManager.handleUpgradeAdded(this.game, upgrade);
      }
    });

    // Force update all upgrade elements to reflect current state
    this.upgradesArray.forEach((upgrade) => {
      if (upgrade.base_ecost && upgrade.$el) {
        upgrade.updateDisplayCost();
        upgrade.$el.classList.toggle("unaffordable", !upgrade.affordable);
      }
    });
  }
  purchaseUpgrade(upgradeId) {
    const upgrade = this.getUpgrade(upgradeId);
    if (!upgrade || upgrade.level >= upgrade.max_level) {
      return false;
    }

    // Check if required upgrade is missing
    if (upgrade.erequires) {
      const required_upgrade = this.game.upgradeset.getUpgrade(upgrade.erequires);
      if (!required_upgrade || required_upgrade.level === 0) {
        return false;
      }
    }

    const cost = upgrade.getCost();
    const ecost = upgrade.getEcost();

    let purchased = false;
    if (ecost > 0) {
      // This is an experimental upgrade that costs EP
      if (this.game.current_exotic_particles >= ecost) {
        this.game.current_exotic_particles -= ecost;
        this.game.ui.stateManager.setVar(
          "current_exotic_particles",
          this.game.current_exotic_particles
        );
        purchased = true;
      }
    } else {
      // This is a regular upgrade that costs money
      if (this.game.current_money >= cost) {
        this.game.current_money -= cost;
        this.game.ui.stateManager.setVar(
          "current_money",
          this.game.current_money
        );
        purchased = true;
      }
    }

    if (purchased) {
      upgrade.setLevel(upgrade.level + 1);
      if (upgrade.upgrade.type === "experimental_parts") {
        this.game.epart_onclick(upgrade);
      }
      this.game.saveGame();
      return true;
    }

    return false;
  }
  check_affordability(game) {
    if (!game) return;
    this.upgradesArray.forEach((upgrade) => {
      let affordable = false;

      // First check if any required upgrade is missing
      if (upgrade.erequires) {
        const required_upgrade = game.upgradeset.getUpgrade(upgrade.erequires);
        if (!required_upgrade || required_upgrade.level === 0) {
          upgrade.setAffordable(false);
          return;
        }
      }

      // Then check if we can afford it
      if (upgrade.base_ecost) {
        affordable = game.current_exotic_particles >= upgrade.current_ecost;
      } else {
        affordable = game.current_money >= upgrade.current_cost;
      }
      upgrade.setAffordable(affordable);
    });
  }
}

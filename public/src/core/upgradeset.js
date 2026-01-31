import { Upgrade } from "./upgrade.js";
import dataService from "../services/dataService.js";

// Load upgrade data
let upgrade_templates = [];
let tech_tree_data = [];
let dataLoaded = false;

const OBJECTIVE_REQUIRED_UPGRADES = {
  improvedChronometers: ["chronometer"],
  investInResearch1: ["infused_cells", "unleashed_cells"],
};

async function ensureDataLoaded() {
  if (!dataLoaded) {
    try {
      upgrade_templates = await dataService.loadUpgradeList();
      tech_tree_data = await dataService.loadTechTree();
      dataLoaded = true;
    } catch (error) {
      console.warn("Failed to load upgrade list or tech tree:", error);
      upgrade_templates = [];
      tech_tree_data = [];
      dataLoaded = true;
    }
  }
  return { upgrade_templates, tech_tree_data };
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this.upgrades = new Map();
    this.upgradesArray = [];
    this.upgradeToTechTreeMap = new Map();
    this.restrictedUpgrades = new Set();
  }

  async initialize() {
    await ensureDataLoaded();
    this.reset();
    
    // Process tech tree data to build restriction maps
    const treeData = tech_tree_data.default || tech_tree_data || [];
    this.treeList = treeData;
    treeData.forEach(tree => {
      if (tree.upgrades) {
        tree.upgrades.forEach(upgradeId => {
          if (!this.upgradeToTechTreeMap.has(upgradeId)) {
            this.upgradeToTechTreeMap.set(upgradeId, new Set());
          }
          this.upgradeToTechTreeMap.get(upgradeId).add(tree.id);
          this.restrictedUpgrades.add(upgradeId);
        });
      }
    });

    const data = upgrade_templates;
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

  getDoctrineForUpgrade(upgradeId) {
    const treeIds = this.upgradeToTechTreeMap.get(upgradeId);
    if (!treeIds || treeIds.size !== 1) return null;
    const treeId = [...treeIds][0];
    const tree = (this.treeList || []).find(t => t.id === treeId);
    return tree ? { id: tree.id, icon: tree.icon } : null;
  }

  getAllUpgrades() {
    return this.upgradesArray;
  }

  getUpgradesByType(type) {
    return this.upgradesArray.filter((upgrade) => upgrade.upgrade.type === type);
  }

  populateUpgrades() {
    this._populateUpgradeSection("upgrades_content_wrapper", (upgrade) => !upgrade.base_ecost);
    this.updateSectionCounts();
  }

  populateExperimentalUpgrades() {
    this._populateUpgradeSection("experimental_upgrades_content_wrapper", (upgrade) => !!upgrade.base_ecost);
    this.updateSectionCounts();
  }

  _populateUpgradeSection(wrapperId, filterFn) {
    if (typeof document === "undefined") return;
    const wrapper = document.getElementById(wrapperId);
    if (!wrapper) return;

    wrapper.querySelectorAll(".upgrade-group").forEach((el) => (el.innerHTML = ""));

    this.upgradesArray.filter(filterFn).forEach((upgrade) => {
      // Check if upgrade is available for current tech tree
      if (!this.isUpgradeAvailable(upgrade.id)) {
        return;
      }

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
    if (!upgrade) {
      this.game.logger?.warn(`[Upgrade] Purchase failed: Upgrade '${upgradeId}' not found.`);
      return false;
    }
    if (!upgrade.affordable) {
      this.game.logger?.warn(`[Upgrade] Purchase failed: '${upgradeId}' not affordable. Money: ${this.game.current_money}, Cost: ${upgrade.getCost()}`);
      return false;
    }
    if (upgrade.level >= upgrade.max_level) {
      this.game.logger?.warn(`[Upgrade] Purchase failed: '${upgradeId}' already at max level (${upgrade.level})`);
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

      // Visual feedback: trigger purchase success animation
      if (upgrade.$el) {
        upgrade.$el.classList.remove("upgrade-purchase-success");
        void upgrade.$el.offsetWidth; // Force reflow to re-trigger animation
        upgrade.$el.classList.add("upgrade-purchase-success");
      }

      this.game.debugHistory.add('upgrades', 'Upgrade purchased', { id: upgradeId, level: upgrade.level });
      if (upgrade.upgrade.type === "experimental_parts") {
        this.game.epart_onclick(upgrade);
      }
      this.updateSectionCounts();
      this.game.saveGame(null, true); // true = isAutoSave
    }

    return purchased;
  }

  check_affordability(game) {
    if (!game) return;

    const hideUpgrades = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_unaffordable_upgrades") !== "false";
    const hideResearch = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_unaffordable_research") !== "false";
    const hideMaxUpgrades = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_max_upgrades") !== "false";
    const hideMaxResearch = typeof localStorage !== "undefined" && localStorage.getItem("reactor_hide_max_research") !== "false";

    let hasVisibleAffordableUpgrade = false;
    let hasVisibleAffordableResearch = false;
    let hasAnyUpgrade = false;
    let hasAnyResearch = false;

    this.upgradesArray.forEach((upgrade) => {
      // Visibility check based on tech tree
      if (!this.isUpgradeAvailable(upgrade.id)) {
        if (upgrade.$el) {
          upgrade.$el.classList.add("hidden");
        }
        return;
      }

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
        const shouldHideUnaffordable = isResearch ? hideResearch : hideUpgrades;
        const shouldHideMaxed = isResearch ? hideMaxResearch : hideMaxUpgrades;
        const isMaxed = upgrade.level >= upgrade.max_level;
        const isInDOM = upgrade.$el.isConnected;

        if (isInDOM) {
          if (isResearch) {
            hasAnyResearch = true;
            if (isAffordable && !isMaxed) {
              hasVisibleAffordableResearch = true;
            }
          } else {
            hasAnyUpgrade = true;
            if (isAffordable && !isMaxed) {
              hasVisibleAffordableUpgrade = true;
            }
          }
        }

        const shouldHide = (shouldHideUnaffordable && !isAffordable && !isMaxed) || (shouldHideMaxed && isMaxed);
        if (shouldHide) {
          upgrade.$el.classList.add("hidden");
        } else {
          upgrade.$el.classList.remove("hidden");
        }
      }
    });

    const upgradesBanner = typeof document !== "undefined" ? document.getElementById("upgrades_no_affordable_banner") : null;
    if (upgradesBanner) {
      if (hasAnyUpgrade && !hasVisibleAffordableUpgrade) {
        upgradesBanner.classList.remove("hidden");
      } else {
        upgradesBanner.classList.add("hidden");
      }
    }

    const researchBanner = typeof document !== "undefined" ? document.getElementById("research_no_affordable_banner") : null;
    if (researchBanner) {
      if (hasAnyResearch && !hasVisibleAffordableResearch) {
        researchBanner.classList.remove("hidden");
      } else {
        researchBanner.classList.add("hidden");
      }
    }
  }

  _isUpgradeRequiredByIncompleteObjective(upgradeId) {
    const objectives = this.game.objectives_manager?.objectives_data;
    if (!objectives?.length) return false;
    for (const obj of objectives) {
      if (obj.completed) continue;
      const checkId = obj.checkId;
      const required = OBJECTIVE_REQUIRED_UPGRADES[checkId];
      if (required?.includes(upgradeId)) return true;
      if (checkId === "experimentalUpgrade") {
        const upg = this.getUpgrade(upgradeId);
        if (upg?.upgrade?.type?.startsWith("experimental_")) return true;
      }
    }
    return false;
  }

  isUpgradeAvailable(upgradeId) {
    if (this.game.bypass_tech_tree_restrictions) return true;

    if (!this.restrictedUpgrades.has(upgradeId)) {
      return true;
    }

    const allowedTrees = this.upgradeToTechTreeMap.get(upgradeId);
    if (allowedTrees && allowedTrees.has(this.game.tech_tree)) {
      return true;
    }

    if (this._isUpgradeRequiredByIncompleteObjective(upgradeId)) {
      return true;
    }

    return false;
  }

  hasAffordableUpgrades() {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    return this.upgradesArray.some((upgrade) =>
      !upgrade.base_ecost &&
      !expandUpgradeIds.includes(upgrade.id) &&
      upgrade.affordable &&
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  hasAffordableResearch() {
    return this.upgradesArray.some((upgrade) => 
      upgrade.base_ecost && 
      upgrade.affordable && 
      upgrade.level < upgrade.max_level &&
      this.isUpgradeAvailable(upgrade.id)
    );
  }

  _getUpgradeContainerId(upgrade) {
    if (upgrade.base_ecost) {
      return upgrade.upgrade.type;
    }
    const normalizeKey = (key) => {
      if (key.endsWith("_upgrades")) {
        return key;
      }
      const map = {
        cell_power: "cell_power_upgrades",
        cell_tick: "cell_tick_upgrades",
        cell_perpetual: "cell_perpetual_upgrades",
        exchangers: "exchanger_upgrades",
        vents: "vent_upgrades",
        other: "other_upgrades",
      };
      return map[key] || key;
    };
    return normalizeKey(upgrade.upgrade.type);
  }

  _getSectionUpgradeGroups(sectionName) {
    const sectionMap = {
      "Cell Upgrades": ["cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades"],
      "Cooling Upgrades": ["vent_upgrades", "exchanger_upgrades"],
      "General Upgrades": ["other_upgrades"],
      "Laboratory": ["experimental_laboratory"],
      "Global Boosts": ["experimental_boost"],
      "Experimental Parts & Cells": ["experimental_parts", "experimental_cells", "experimental_cells_boost"],
      "Particle Accelerators": ["experimental_particle_accelerators"],
    };
    return sectionMap[sectionName] || [];
  }

  _countUpgradesInGroups(groupIds, isResearch) {
    if (typeof document === "undefined") return { total: 0, researched: 0 };
    let total = 0;
    let researched = 0;

    groupIds.forEach(groupId => {
      const container = document.getElementById(groupId);
      if (!container) return;

      const upgrades = this.upgradesArray.filter(upgrade => {
        if (isResearch !== !!upgrade.base_ecost) return false;
        if (!this.isUpgradeAvailable(upgrade.id)) return false;
        
        const containerId = this._getUpgradeContainerId(upgrade);
        if (containerId !== groupId) return false;

        const upgType = upgrade?.upgrade?.type || "";
        const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;
        if (isCellUpgrade) {
          const basePart = upgrade?.upgrade?.part;
          if (basePart && basePart.category === "cell") {
            if (this.game && typeof this.game.isPartUnlocked === "function") {
              return this.game.isPartUnlocked(basePart);
            }
            return true;
          }
        }
        return true;
      });

      upgrades.forEach(upgrade => {
        total += upgrade.max_level;
        researched += upgrade.level;
      });
    });

    return { total, researched };
  }

  updateSectionCounts() {
    const upgradeSections = [
      { name: "Cell Upgrades", isResearch: false },
      { name: "Cooling Upgrades", isResearch: false },
      { name: "General Upgrades", isResearch: false },
      { name: "Laboratory", isResearch: true },
      { name: "Global Boosts", isResearch: true },
      { name: "Experimental Parts & Cells", isResearch: true },
      { name: "Particle Accelerators", isResearch: true },
    ];

    upgradeSections.forEach(section => {
      const groupIds = this._getSectionUpgradeGroups(section.name);
      if (groupIds.length === 0) return;

      const { total, researched } = this._countUpgradesInGroups(groupIds, section.isResearch);
      
      if (typeof document === "undefined") return;
      const wrapper = section.isResearch 
        ? document.getElementById("experimental_upgrades_content_wrapper")
        : document.getElementById("upgrades_content_wrapper");
      
      if (!wrapper) return;

      const article = Array.from(wrapper.querySelectorAll("article")).find(art => {
        const h2 = art.querySelector("h2");
        if (!h2) return false;
        let headerText = h2.textContent.trim();
        const countSpan = h2.querySelector(".section-count");
        if (countSpan) {
          headerText = headerText.replace(countSpan.textContent, "").trim();
        }
        return headerText === section.name;
      });

      if (article) {
        let h2 = article.querySelector("h2");
        if (!h2) return;

        let countSpan = h2.querySelector(".section-count");
        if (!countSpan) {
          countSpan = document.createElement("span");
          countSpan.className = "section-count";
          h2.appendChild(countSpan);
        }
        countSpan.textContent = ` ${researched}/${total}`;
      }
    });
  }
}

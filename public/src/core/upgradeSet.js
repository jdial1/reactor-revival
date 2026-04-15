import { bundledGameData } from "../bundledStaticData.js";
import { toDecimal, toNumber } from "../utils.js";

function createUpgradeInstance(game, def) {
  return {
    id: def.id,
    title: def.title,
    _def: def,
    upgrade: def,
    level: 0,
    max_level: def.levels || def.max_level || 1,
    cost: def.cost || 0,
    ecost: def.ecost || 0,
    base_ecost: def.ecost || 0,
    affordable: false,
    erequires: def.erequires || null,
    type: def.type || "power",
    setLevel(l) {
      this.level = l;
      this.updateDisplayCost();
    },
    setAffordable(a) {
      this.affordable = a;
    },
    getCost() {
      if (this.level >= this.max_level) return toDecimal(Infinity);
      const base = this._def.cost ?? 0;
      const multi = this._def.multiplier ?? 1;
      return toDecimal(base).mul(toDecimal(multi).pow(this.level));
    },
    getEcost() {
      if (this.level >= this.max_level) return toDecimal(Infinity);
      const base = this._def.ecost ?? 0;
      const multi = this._def.ecost_multiplier ?? 1;
      return toDecimal(base).mul(toDecimal(multi).pow(this.level));
    },
    updateDisplayCost() {
      if (this.level >= this.max_level) {
        this.display_cost = "MAX";
        return;
      }
      const c = this._def.ecost ? this.getEcost() : this.getCost();
      this.display_cost = this._def.ecost ? `${c.toString()} EP` : `$${c.toString()}`;
    },
  };
}

export class UpgradeSet {
  constructor(game) {
    this.game = game;
    this._byId = new Map();
    this.upgradeToTechTreeMap = new Map();
    this._list = [];
  }

  async initialize() {
    this._byId.clear();
    this._list = [];
    const { upgrades, techTree } = bundledGameData;
    for (const def of upgrades) {
      const u = createUpgradeInstance(this.game, def);
      this._byId.set(def.id, u);
      this._list.push(u);
    }
    for (const tree of techTree) {
      const set = new Set(tree.upgrades || []);
      for (const uid of set) {
        if (!this.upgradeToTechTreeMap.has(uid)) {
          this.upgradeToTechTreeMap.set(uid, new Set());
        }
        this.upgradeToTechTreeMap.get(uid).add(tree.id);
      }
    }
    this.game.syncModifiersFromUpgrades();
  }

  getUpgrade(id) {
    if (id == null) return undefined;
    return this._byId.get(String(id));
  }

  getAllUpgrades() {
    return this._list.slice();
  }

  getUpgradesByType(t) {
    return this._list.filter((u) => u.type === t);
  }

  isUpgradeDoctrineLocked(id) {
    const trees = this.upgradeToTechTreeMap.get(id);
    const tt = this.game.tech_tree;
    if (!trees || trees.size === 0) return false;
    if (!tt) return true;
    return !trees.has(tt);
  }

  isUpgradeAvailable(id) {
    const u = this.getUpgrade(id);
    if (!u) return false;
    if (u.level >= u.max_level) return false;
    if (u.erequires) {
      const req = this.getUpgrade(u.erequires);
      if (req && req.level < 1) return false;
    }
    if (!this.game.bypass_tech_tree_restrictions) {
      const tree = bundledGameData.techTree.find((x) => x.id === this.game.tech_tree);
      if (!tree || !Array.isArray(tree.upgrades)) return false;
      if (!tree.upgrades.includes(id)) return false;
    }
    return true;
  }

  purchaseUpgrade(id) {
    const u = this.getUpgrade(id);
    if (!u || !this.isUpgradeAvailable(id)) return false;
    const g = this.game;
    const cost = u.base_ecost ? u.getEcost() : u.getCost();
    const wallet = u.base_ecost ? g.current_exotic_particles : g.current_money;
    if (!toDecimal(wallet || 0).gte(cost)) return false;
    if (u.base_ecost) {
      g.current_exotic_particles = toDecimal(g.current_exotic_particles || 0).sub(cost);
      if (g.state) g.state.current_exotic_particles = g.current_exotic_particles;
    } else {
      g.current_money = toDecimal(g.current_money || 0).sub(cost);
      if (g.state) g.state.current_money = g.current_money;
    }
    u.level++;
    u.updateDisplayCost();
    this.game.syncModifiersFromUpgrades();
    return true;
  }

  check_affordability(g) {
    for (const u of this._list) {
      if (u.level >= u.max_level) {
        u.affordable = false;
        continue;
      }
      const wallet = u.base_ecost || u.erequires ? g.current_exotic_particles : g.current_money;
      const cost = u.base_ecost || u.erequires ? u.getEcost() : u.getCost();
      u.affordable = toDecimal(wallet || 0).gte(cost);
    }
  }

  resyncFromLevels(levels) {
    if (!levels) return;
    for (const [id, lv] of Object.entries(levels)) {
      const u = this.getUpgrade(id);
      if (u) u.level = lv;
    }
    this.game.syncModifiersFromUpgrades();
  }
}

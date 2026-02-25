import { RESPEC_DOCTRINE_EP_COST, PERCENT_DIVISOR } from "../constants.js";
import { toDecimal } from "../../utils/decimal.js";
import { updateDecimal } from "../store.js";

export class DoctrineManager {
  constructor(game) {
    this.game = game;
  }

  getDoctrine() {
    if (!this.game.tech_tree || !this.game.upgradeset?.treeList) return null;
    return this.game.upgradeset.treeList.find((t) => t.id === this.game.tech_tree) ?? null;
  }

  applyDoctrineBonuses(doctrine) {
    if (!doctrine?.bonuses || typeof doctrine.bonuses !== "object") return;
    const b = doctrine.bonuses;
    if (typeof b.heat_tolerance_percent === "number") {
      const mult = 1 + b.heat_tolerance_percent / PERCENT_DIVISOR;
      this.game.reactor.base_max_heat *= mult;
      this.game.reactor.altered_max_heat = this.game.reactor.base_max_heat;
    }
  }

  respecDoctrine() {
    if (!this.game.tech_tree) return false;
    const cost = this.game.RESPER_DOCTRINE_EP_COST ?? RESPEC_DOCTRINE_EP_COST;
    const ep = this.game.state?.current_exotic_particles;
    const epVal = (ep != null && typeof ep.lt === "function") ? ep : toDecimal(ep ?? 0);
    if (epVal.lt(cost)) return false;
    const doctrine = this.getDoctrine();
    if (doctrine?.bonuses && typeof doctrine.bonuses.heat_tolerance_percent === "number") {
      const mult = 1 + doctrine.bonuses.heat_tolerance_percent / PERCENT_DIVISOR;
      this.game.reactor.base_max_heat /= mult;
      this.game.reactor.altered_max_heat = this.game.reactor.base_max_heat;
    }
    updateDecimal(this.game.state, "current_exotic_particles", (d) => d.sub(cost));
    const previousTree = this.game.tech_tree;
    this.game.tech_tree = null;
    this.game.upgradeset.resetDoctrineUpgradeLevels(previousTree);
    this.game.reactor.updateStats();
    this.game.emit("exoticParticlesChanged", {
      current_exotic_particles: this.game.state.current_exotic_particles,
      exotic_particles: this.game.exoticParticleManager.exotic_particles,
      total_exotic_particles: this.game.state.total_exotic_particles,
      reality_flux: this.game.state.reality_flux
    });
    this.game.saveManager.autoSave();
    return true;
  }
}

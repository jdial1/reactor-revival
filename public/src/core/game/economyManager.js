import { toDecimal } from "../../utils/decimal.js";
import { setDecimal, updateDecimal } from "../store.js";

export class EconomyManager {
  constructor(game, { prestigePerEp, prestigeCap }) {
    this.game = game;
    this.prestigePerEp = prestigePerEp;
    this.prestigeCap = prestigeCap;
  }

  getCurrentMoney() {
    return this.game.isSandbox ? Infinity : this.game.state.current_money;
  }

  setCurrentMoney(value) {
    if (this.game.isSandbox) return;
    setDecimal(this.game.state, "current_money", value);
  }

  getPrestigeMultiplier() {
    const ep = this.game.state.total_exotic_particles;
    const epNumber = ep && typeof ep.toNumber === "function" ? ep.toNumber() : Number(ep || 0);
    return 1 + Math.min(epNumber * this.prestigePerEp, this.prestigeCap);
  }

  addMoney(amount) {
    if (this.game.isSandbox) return;
    const multiplier = this.getPrestigeMultiplier();
    updateDecimal(this.game.state, "current_money", (d) => d.add(toDecimal(amount).mul(multiplier)));
  }
}

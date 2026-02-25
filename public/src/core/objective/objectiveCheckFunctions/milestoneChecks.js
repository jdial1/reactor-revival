import { boolProgress, compare, createProgress, progressWithCap } from "../objectiveCheckUtils.js";
import { toNumber } from "../../../utils/decimal.js";
import {
  FIRST_BILLION,
  TOTAL_MONEY_10B,
  HEAT_10M,
  INCOME_TARGET_50K,
  EP_TARGET_10,
  EP_TARGET_51,
  EP_TARGET_250,
  EP_TARGET_1000,
  SUSTAINED_POWER_TICKS_REQUIRED,
} from "../objectiveConstants.js";

const MONEY_1B = FIRST_BILLION;
const MONEY_10B = TOTAL_MONEY_10B;
const HEAT_THRESHOLD_10M = HEAT_10M;

export const milestoneChecks = {
  incomeMilestone50k: (game) => {
    const income = game.reactor.stats_cash || 0;
    return createProgress(income, INCOME_TARGET_50K, "", `$${income.toLocaleString()} / $50,000 per tick`);
  },
  firstBillion: (game) => {
    const money = toNumber(game.state.current_money) || 0;
    const done = compare(game.state.current_money, MONEY_1B, "gte");
    return { completed: done, percent: progressWithCap(money, FIRST_BILLION), text: `$${money.toLocaleString()} / $1,000,000,000` };
  },
  money10B: (game) => {
    const money = toNumber(game.state.current_money) || 0;
    const done = compare(game.state.current_money, MONEY_10B, "gte");
    return { completed: done, percent: progressWithCap(money, TOTAL_MONEY_10B), text: `$${money.toLocaleString()} / $10,000,000,000` };
  },
  masterHighHeat: (game) => {
    const om = game.objectives_manager;
    const tracking = om?.getSustainedTracking("masterHighHeat");
    const heat = game.reactor.stats_heat || 0;
    const heatOk = compare(game.reactor.current_heat, HEAT_THRESHOLD_10M, "gt");
    if (heatOk && !game.paused && !game.reactor.has_melted_down && game.engine && tracking) {
      if (tracking.startTick === 0) {
        om.updateSustainedTracking("masterHighHeat", game.engine.tick_count);
      }
      const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("masterHighHeat").startTick;
      return createProgress(
        elapsedTicks,
        SUSTAINED_POWER_TICKS_REQUIRED,
        "",
        `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`
      );
    }
    if (om) om.resetSustainedTracking("masterHighHeat");
    return { completed: false, percent: progressWithCap(heat, HEAT_10M), text: `${heat.toLocaleString()} / 10,000,000 Heat` };
  },
  ep10: (game) => {
    const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0;
    return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_10, "gte"), percent: progressWithCap(ep, EP_TARGET_10), text: `${ep} / 10 EP Generated` };
  },
  ep51: (game) => {
    const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0;
    return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_51, "gte"), percent: progressWithCap(ep, EP_TARGET_51), text: `${ep} / 51 EP Generated` };
  },
  ep250: (game) => {
    const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0;
    return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_250, "gte"), percent: progressWithCap(ep, EP_TARGET_250), text: `${ep} / 250 EP Generated` };
  },
  ep1000: (game) => {
    const ep = toNumber(game.exoticParticleManager.exotic_particles) || 0;
    return { completed: compare(game.exoticParticleManager.exotic_particles, EP_TARGET_1000, "gte"), percent: progressWithCap(ep, EP_TARGET_1000), text: `${ep} / 1,000 EP Generated` };
  },
  investInResearch1: (game) => {
    const a = game.upgradeset.getUpgrade("infused_cells")?.level > 0;
    const b = game.upgradeset.getUpgrade("unleashed_cells")?.level > 0;
    const done = a && b;
    const count = (a ? 1 : 0) + (b ? 1 : 0);
    return createProgress(count, 2, "upgrades");
  },
  reboot: (game) => {
    const totalOk = compare(game.state.total_exotic_particles, 0, "gt");
    const moneyOk = compare(game.state.current_money, game.base_money * 2, "lt");
    const epZero = compare(game.exoticParticleManager.exotic_particles, 0, "eq");
    const done = totalOk && moneyOk && epZero;
    return boolProgress(done, "Reboot complete!", "Perform a reboot");
  },
  experimentalUpgrade: (game) => {
    const done = game.upgradeset.getAllUpgrades().filter(
      (upg) => upg.upgrade.id !== "laboratory" && upg.upgrade.type !== "experimental_laboratory" && upg.upgrade.type.startsWith("experimental_") && upg.level > 0
    ).length > 0;
    return boolProgress(done, "Experimental upgrade purchased!", "Purchase an experimental upgrade");
  },
};

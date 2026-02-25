import { progressWithCap } from "../objectiveCheckUtils.js";
import { toNumber } from "../../../utils/decimal.js";
import { PERCENT_COMPLETE_MAX } from "../objectiveConstants.js";

export const infiniteChecks = {
  allObjectives: () => ({ completed: true, text: "All objectives completed!", percent: PERCENT_COMPLETE_MAX }),
  infinitePower: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    const target = obj?.target;
    if (target == null) return { completed: false, text: "Awaiting completion...", percent: 0 };
    const power = game.reactor?.stats_power ?? 0;
    const done = power >= target && !game.paused;
    return { completed: done, percent: progressWithCap(power, target), text: `${power.toLocaleString()} / ${target.toLocaleString()} Power` };
  },
  infiniteHeatMaintain: (game) => {
    const om = game.objectives_manager;
    const obj = om?.current_objective_def;
    if (obj?.target?.percent == null || !obj?.target?.ticks || !game.engine) return { completed: false, text: "Awaiting completion...", percent: 0 };
    const { percent, ticks } = obj.target;
    const reactor = game.reactor;
    const maxH = toNumber(reactor.max_heat);
    const curH = toNumber(reactor.current_heat);
    const heatOk = maxH > 0 && curH / maxH >= percent / PERCENT_COMPLETE_MAX && !game.paused && !reactor.has_melted_down;
    const tracking = om?.getSustainedTracking("infiniteHeatMaintain");
    if (heatOk && tracking) {
      if (tracking.startTick === 0) om.updateSustainedTracking("infiniteHeatMaintain", game.engine.tick_count);
      const elapsed = game.engine.tick_count - om.getSustainedTracking("infiniteHeatMaintain").startTick;
      const done = elapsed >= ticks;
      return { completed: done, percent: progressWithCap(elapsed, ticks), text: `${elapsed} / ${ticks} ticks at ${percent}%` };
    }
    if (om) om.resetSustainedTracking("infiniteHeatMaintain");
    return { completed: false, percent: 0, text: `Maintain ${percent}% heat (${((curH / maxH) * PERCENT_COMPLETE_MAX || 0).toFixed(0)}% now)` };
  },
  infiniteMoneyThorium: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 };
    const cells = game.tileset?.tiles_list?.filter((t) => t?.part?.category === "cell") ?? [];
    const nonThorium = cells.some((t) => t.part?.id !== "thorium3" && t.part?.type !== "quad_thorium_cell");
    if (cells.length === 0) return { completed: false, text: "Add Thorium cells to generate", percent: 0 };
    if (nonThorium) return { completed: false, text: "Only Thorium cells allowed", percent: 0 };
    const money = toNumber(game.state.current_money);
    const done = money >= obj.target;
    return { completed: done, percent: progressWithCap(money, obj.target), text: `$${money.toLocaleString()} / $${obj.target.toLocaleString()} (Thorium only)` };
  },
  infiniteHeat: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 };
    const heat = game.reactor?.stats_heat ?? 0;
    const done = heat >= obj.target;
    return { completed: done, percent: progressWithCap(heat, obj.target), text: `${heat.toLocaleString()} / ${obj.target.toLocaleString()} Heat` };
  },
  infiniteEP: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (obj?.target == null) return { completed: false, text: "Awaiting completion...", percent: 0 };
    const ep = toNumber(game.exoticParticleManager.exotic_particles);
    const done = ep >= obj.target;
    return { completed: done, percent: progressWithCap(ep, obj.target), text: `${ep} / ${obj.target} EP` };
  },
};

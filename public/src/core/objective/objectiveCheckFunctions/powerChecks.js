import { boolProgress, createProgress, progressWithCap } from "../objectiveCheckUtils.js";
import { countTilesByCategory } from "../objectiveTileCounters.js";
import { BALANCE } from "../../balanceConfig.js";
import {
  SUSTAINED_POWER_TICKS_REQUIRED,
  SUSTAINED_POWER_THRESHOLD,
  POWER_TARGET_200,
  POWER_TARGET_500,
  CELLS_TARGET_10,
} from "../objectiveConstants.js";

const POWER_THRESHOLD_1K = SUSTAINED_POWER_THRESHOLD;
const POWER_THRESHOLD_10K = BALANCE.powerThreshold10k;

export const powerChecks = {
  powerPerTick200: (game) => {
    const power = game.reactor.stats_power || 0;
    const done = power >= POWER_TARGET_200 && !game.paused;
    return { completed: done, ...createProgress(power, POWER_TARGET_200, "Power") };
  },
  improvedChronometers: (game) => {
    const done = game.upgradeset.getUpgrade("chronometer")?.level > 0;
    return boolProgress(done, "Chronometer unlocked!", "Unlock Chronometer");
  },
  potentUranium3: (game) => {
    const level = game.upgradeset.getUpgrade("uranium1_cell_power")?.level ?? 0;
    return createProgress(level, 3, "levels");
  },
  autoSell500: (game) => {
    const cash = game.reactor.stats_cash || 0;
    return createProgress(cash, POWER_TARGET_500, "$/tick");
  },
  sustainedPower1k: (game) => {
    const om = game.objectives_manager;
    const tracking = om?.getSustainedTracking("sustainedPower1k");
    const power = game.reactor.stats_power || 0;
    if (power >= POWER_THRESHOLD_1K && !game.paused && game.engine && tracking) {
      if (tracking.startTick === 0) {
        om.updateSustainedTracking("sustainedPower1k", game.engine.tick_count);
      }
      const elapsedTicks = game.engine.tick_count - om.getSustainedTracking("sustainedPower1k").startTick;
      const done = elapsedTicks >= SUSTAINED_POWER_TICKS_REQUIRED;
      return createProgress(
        elapsedTicks,
        SUSTAINED_POWER_TICKS_REQUIRED,
        "",
        `${elapsedTicks} / ${SUSTAINED_POWER_TICKS_REQUIRED} ticks steady`
      );
    }
    if (om) om.resetSustainedTracking("sustainedPower1k");
    return { completed: false, percent: 0, text: `${power.toLocaleString()} / 1,000 Power (hold ${SUSTAINED_POWER_TICKS_REQUIRED} ticks)` };
  },
  infrastructureUpgrade1: (game) => {
    const advancedCapacitors = game.tileset.tiles_list.filter(
      (tile) => tile?.part && tile?.activated && tile.part.id === "capacitor2"
    ).length;
    const advancedHeatVents = game.tileset.tiles_list.filter(
      (tile) => tile?.part && tile?.activated && tile.part.id === "vent2"
    ).length;
    const done = advancedCapacitors >= CELLS_TARGET_10 && advancedHeatVents >= CELLS_TARGET_10;
    const total = Math.min(advancedCapacitors, CELLS_TARGET_10) + Math.min(advancedHeatVents, CELLS_TARGET_10);
    return createProgress(total, CELLS_TARGET_10 * 2, "", `${advancedCapacitors}/10 Capacitors, ${advancedHeatVents}/10 Vents`);
  },
  powerPerTick500: (game) => {
    const power = game.reactor.stats_power || 0;
    const done = power >= POWER_TARGET_500 && !game.paused;
    return { completed: done, ...createProgress(power, POWER_TARGET_500, "Power") };
  },
  powerPerTick10k: (game) => {
    const power = game.reactor.stats_power || 0;
    const done = power >= POWER_THRESHOLD_10K && !game.paused;
    return { completed: done, percent: progressWithCap(power, POWER_THRESHOLD_10K), text: `${power.toLocaleString()} / ${POWER_THRESHOLD_10K.toLocaleString()} Power` };
  },
};

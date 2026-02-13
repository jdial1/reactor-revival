export const checkFunctions = {
  firstCell: (game) =>
    game.tileset.tiles_list.some(
      (tile) => tile && tile.part && tile.activated
    ),
  sellPower: (game) => game.sold_power,
  reduceHeat: (game) => game.sold_heat,
  ventNextToCell: (game) =>
    game.tileset.active_tiles_list.some((tile) => {
      if (tile?.part?.category === "cell" && tile.ticks > 0) {
        for (const neighbor of game.tileset.getTilesInRange(tile, 1)) {
          if (neighbor?.part?.category === "vent") return true;
        }
      }
      return false;
    }),
  purchaseUpgrade: (game) =>
    game.upgradeset.getAllUpgrades().some((upgrade) => upgrade.level > 0),
  purchaseDualCell: (game) =>
    game.tileset.tiles_list.some(
      (tile) => tile.part?.id === "uranium2" && tile.activated
    ),
  tenActiveCells: (game) =>
    game.tileset.tiles_list.filter(
      (tile) => tile.part?.category === "cell" && tile.ticks > 0
    ).length >= 10,
  perpetualUranium: (game) =>
    game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.level > 0,
  increaseMaxPower: (game) =>
    game.tileset.tiles_list.some((tile) => tile.part?.category === "capacitor"),
  powerPerTick200: (game) => game.reactor.stats_power >= 200 && !game.paused,
  improvedChronometers: (game) =>
    game.upgradeset.getUpgrade("chronometer")?.level > 0,
  fiveComponentKinds: (game) => {
    const categories = new Set(
      game.tileset.tiles_list.map((t) => t.part?.category).filter(Boolean)
    );
    return categories.size >= 5;
  },
  tenCapacitors: (game) =>
    game.tileset.tiles_list.filter(
      (tile) => tile.part?.category === "capacitor"
    ).length >= 10,
  powerPerTick500: (game) => game.reactor.stats_power >= 500 && !game.paused,
  potentUranium3: (game) =>
    game.upgradeset.getUpgrade("uranium1_cell_power")?.level >= 3,
  autoSell500: (game) => game.reactor.stats_cash >= 500,

  // New check functions for intermediary objectives
  sustainedPower1k: (game) => {
    const TICKS_REQUIRED = 30;
    if (!game.sustainedPower1k) game.sustainedPower1k = { startTick: 0 };
    if (game.reactor.stats_power >= 1000 && !game.paused && game.engine) {
      if (game.sustainedPower1k.startTick === 0) {
        game.sustainedPower1k.startTick = game.engine.tick_count;
      }
      return game.engine.tick_count - game.sustainedPower1k.startTick >= TICKS_REQUIRED;
    }
    game.sustainedPower1k.startTick = 0;
    return false;
  },
  infrastructureUpgrade1: (game) => {
    const advancedCapacitors = game.tileset.tiles_list.filter(
      (tile) => tile.part && tile.activated && tile.part.id === "capacitor2"
    ).length;
    const advancedHeatVents = game.tileset.tiles_list.filter(
      (tile) => tile.part && tile.activated && tile.part.id === "vent2"
    ).length;
    return advancedCapacitors >= 10 && advancedHeatVents >= 10;
  },
  fiveQuadPlutonium: (game) =>
    game.tileset.tiles_list.filter(
      (t) => t.part?.id === "plutonium3" && t.ticks > 0
    ).length >= 5,
  incomeMilestone50k: (game) => {
    return game.reactor.stats_cash >= 50000;
  },
  powerPerTick10k: (game) => game.reactor.stats_power >= 10000 && !game.paused,
  unlockThorium: (game) => {
    return (
      game.tileset.tiles_list.filter(
        (tile) =>
          tile.part &&
          tile.activated &&
          tile.ticks > 0 &&
          tile.part.id === "thorium3"
      ).length >= 5
    );
  },
  firstBillion: (game) => {
    return game.current_money && game.current_money.gte ? game.current_money.gte(1000000000) : game.current_money >= 1000000000;
  },
  money10B: (game) => game.current_money && game.current_money.gte ? game.current_money.gte(1e10) : game.current_money >= 1e10,
  unlockSeaborgium: (game) => {
    return (
      game.tileset.tiles_list.filter(
        (tile) =>
          tile.part &&
          tile.activated &&
          tile.ticks > 0 &&
          tile.part.id === "seaborgium3"
      ).length >= 5
    );
  },
  masterHighHeat: (game) => {
    const TICKS_REQUIRED = 30;
    if (!game.masterHighHeat) game.masterHighHeat = { startTick: 0 };
    const heatOk = game.reactor.current_heat && game.reactor.current_heat.gt ? game.reactor.current_heat.gt(10000000) : game.reactor.current_heat > 10000000;
    if (heatOk && !game.paused && !game.reactor.has_melted_down && game.engine) {
      if (game.masterHighHeat.startTick === 0) {
        game.masterHighHeat.startTick = game.engine.tick_count;
      }
      return game.engine.tick_count - game.masterHighHeat.startTick >= TICKS_REQUIRED;
    }
    game.masterHighHeat.startTick = 0;
    return false;
  },
  ep10: (game) => game.exotic_particles && game.exotic_particles.gte ? game.exotic_particles.gte(10) : game.exotic_particles >= 10,
  ep51: (game) => game.exotic_particles && game.exotic_particles.gte ? game.exotic_particles.gte(51) : game.exotic_particles >= 51,
  ep250: (game) => game.exotic_particles && game.exotic_particles.gte ? game.exotic_particles.gte(250) : game.exotic_particles >= 250,
  investInResearch1: (game) => {
    return (
      game.upgradeset.getUpgrade("infused_cells")?.level > 0 &&
      game.upgradeset.getUpgrade("unleashed_cells")?.level > 0
    );
  },
  reboot: (game) => {
    const totalOk = game.total_exotic_particles && game.total_exotic_particles.gt ? game.total_exotic_particles.gt(0) : game.total_exotic_particles > 0;
    const moneyOk = game.current_money && game.current_money.lt ? game.current_money.lt(game.base_money * 2) : game.current_money < game.base_money * 2;
    const epZero = game.exotic_particles && game.exotic_particles.eq ? game.exotic_particles.eq(0) : game.exotic_particles === 0;
    return totalOk && moneyOk && epZero;
  },
  completeChapter1: (game) => {
    // Check if all regular objectives in chapter 1 (indices 0-8) are completed
    if (!game.objectives_manager?.objectives_data) return false;

    for (let i = 0; i < 9; i++) {
      const objective = game.objectives_manager.objectives_data[i];
      if (objective && !objective.isChapterCompletion && !objective.completed) {
        return false;
      }
    }
    return true;
  },
  completeChapter2: (game) => {
    // Check if all regular objectives in chapter 2 (indices 10-18) are completed
    if (!game.objectives_manager?.objectives_data) return false;

    for (let i = 10; i < 19; i++) {
      const objective = game.objectives_manager.objectives_data[i];
      if (objective && !objective.isChapterCompletion && !objective.completed) {
        return false;
      }
    }
    return true;
  },
  completeChapter3: (game) => {
    // Check if all regular objectives in chapter 3 (indices 20-28) are completed
    if (!game.objectives_manager?.objectives_data) return false;

    for (let i = 20; i < 29; i++) {
      const objective = game.objectives_manager.objectives_data[i];
      if (objective && !objective.isChapterCompletion && !objective.completed) {
        return false;
      }
    }
    return true;
  },
  completeChapter4: (game) => {
    // Check if all regular objectives in chapter 4 (indices 30-35) are completed
    if (!game.objectives_manager?.objectives_data) return false;

    for (let i = 30; i < 36; i++) {
      const objective = game.objectives_manager.objectives_data[i];
      if (objective && !objective.isChapterCompletion && !objective.completed) {
        return false;
      }
    }
    return true;
  },
  experimentalUpgrade: (game) => {
    const experimentalUpgrades = game.upgradeset
      .getAllUpgrades()
      .filter(
        (upg) =>
          upg.upgrade.id !== "laboratory" &&
          upg.upgrade.type !== "experimental_laboratory" &&
          upg.upgrade.type.startsWith("experimental_") &&
          upg.level > 0
      );
    return experimentalUpgrades.length > 0;
  },
  fiveQuadDolorium: (game) =>
    game.tileset.tiles_list.filter(
      (t) => t.part?.id === "dolorium3" && t.ticks > 0
    ).length >= 5,
  ep1000: (game) => game.exotic_particles && game.exotic_particles.gte ? game.exotic_particles.gte(1000) : game.exotic_particles >= 1000,
  fiveQuadNefastium: (game) =>
    game.tileset.tiles_list.filter(
      (t) => t.part?.id === "nefastium3" && t.ticks > 0
    ).length >= 5,
  placeExperimentalPart: (game) =>
    game.tileset.tiles_list.some((tile) => tile.part?.experimental === true),
  allObjectives: (game) => true,
  infinitePower: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    return obj?.target != null && game.reactor?.stats_power >= obj.target && !game.paused;
  },
  infiniteHeatMaintain: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (obj?.target?.percent == null || !obj?.target?.ticks || !game.engine) return false;
    const { percent, ticks } = obj.target;
    const reactor = game.reactor;
    const maxH = reactor.max_heat && typeof reactor.max_heat.toNumber === "function" ? reactor.max_heat.toNumber() : Number(reactor.max_heat ?? 0);
    const curH = reactor.current_heat && typeof reactor.current_heat.toNumber === "function" ? reactor.current_heat.toNumber() : Number(reactor.current_heat ?? 0);
    const heatOk = maxH > 0 && curH / maxH >= percent / 100 && !game.paused && !reactor.has_melted_down;
    if (!game.infiniteHeatMaintain) game.infiniteHeatMaintain = { startTick: 0 };
    if (heatOk) {
      if (game.infiniteHeatMaintain.startTick === 0) game.infiniteHeatMaintain.startTick = game.engine.tick_count;
      if (game.engine.tick_count - game.infiniteHeatMaintain.startTick >= ticks) return true;
    } else {
      game.infiniteHeatMaintain.startTick = 0;
    }
    return false;
  },
  infiniteMoneyThorium: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (obj?.target == null) return false;
    const cells = game.tileset?.tiles_list?.filter((t) => t?.part?.category === "cell") ?? [];
    const nonThorium = cells.some((t) => t.part?.id !== "thorium3" && t.part?.type !== "quad_thorium_cell");
    if (cells.length === 0 || nonThorium) return false;
    const money = game.current_money && typeof game.current_money.toNumber === "function" ? game.current_money.toNumber() : Number(game.current_money ?? 0);
    return money >= obj.target;
  },
  infiniteHeat: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (!obj?.target != null) return false;
    const heat = game.reactor?.stats_heat ?? 0;
    return heat >= obj.target;
  },
  infiniteEP: (game) => {
    const obj = game.objectives_manager?.current_objective_def;
    if (!obj?.target != null) return false;
    const ep = game.exotic_particles && typeof game.exotic_particles.toNumber === "function" ? game.exotic_particles.toNumber() : Number(game.exotic_particles ?? 0);
    return ep >= obj.target;
  },
};

export function getObjectiveCheck(checkId) {
  return checkFunctions[checkId];
}

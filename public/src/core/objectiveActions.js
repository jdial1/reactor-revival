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
    if (!game.sustainedPower1k) game.sustainedPower1k = { startTime: 0 };
    if (game.reactor.stats_power >= 1000 && !game.paused) {
      if (game.sustainedPower1k.startTime === 0) {
        game.sustainedPower1k.startTime = Date.now();
      }
      return Date.now() - game.sustainedPower1k.startTime >= 30000;
    } else {
      game.sustainedPower1k.startTime = 0;
      return false;
    }
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
    return game.current_money >= 1000000000;
  },
  money10B: (game) => game.current_money >= 1e10,
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
    if (!game.masterHighHeat) game.masterHighHeat = { startTime: 0 };
    if (game.reactor.current_heat > 10000000 && !game.paused && !game.reactor.has_melted_down) {
      if (game.masterHighHeat.startTime === 0) {
        game.masterHighHeat.startTime = Date.now();
      }
      return Date.now() - game.masterHighHeat.startTime >= 300000; // 5 minutes
    } else {
      game.masterHighHeat.startTime = 0;
      return false;
    }
  },
  ep10: (game) => game.exotic_particles >= 10,
  ep51: (game) => game.exotic_particles >= 51,
  ep250: (game) => game.exotic_particles >= 250,
  investInResearch1: (game) => {
    return (
      game.upgradeset.getUpgrade("infused_cells")?.level > 0 &&
      game.upgradeset.getUpgrade("unleashed_cells")?.level > 0
    );
  },
  reboot: (game) =>
    game.total_exotic_particles > 0 &&
    game.current_money < game.base_money * 2 &&
    game.exotic_particles === 0,
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
  ep1000: (game) => game.exotic_particles >= 1000,
  fiveQuadNefastium: (game) =>
    game.tileset.tiles_list.filter(
      (t) => t.part?.id === "nefastium3" && t.ticks > 0
    ).length >= 5,
  placeExperimentalPart: (game) =>
    game.tileset.tiles_list.some((tile) => tile.part?.experimental === true),
  allObjectives: (game) => {
    // The "allObjectives" objective is automatically completed when we reach it
    // since it's the final objective that appears after all others are done
    return true;
  },
};

export function getObjectiveCheck(checkId) {
  return checkFunctions[checkId];
}

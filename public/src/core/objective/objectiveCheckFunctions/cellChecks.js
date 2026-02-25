import { boolProgress, createProgress } from "../objectiveCheckUtils.js";
import { countTilesByCategory, countActiveCellsByCategory } from "../objectiveTileCounters.js";
import { checkVentNextToCell } from "../objectiveGridUtils.js";
import { CELLS_TARGET_10, CELLS_TARGET_5 } from "../objectiveConstants.js";

export const cellChecks = {
  firstCell: (game) => {
    const hasCell = game.tileset.tiles_list.some((tile) => tile?.part && tile?.activated);
    return boolProgress(hasCell, "1 / 1 Cell Placed", "0 / 1 Cell Placed");
  },
  sellPower: (game) => {
    const power = game.reactor.stats_power || 0;
    return boolProgress(game.sold_power, "Power sold!", power > 0 ? "Power available to sell" : "No power to sell");
  },
  reduceHeat: (game) => {
    const heat = game.reactor.stats_heat || 0;
    return boolProgress(game.sold_heat, `${heat.toLocaleString()} / 0 Heat`, `${heat.toLocaleString()} / 0 Heat`);
  },
  ventNextToCell: (game) => {
    const done = checkVentNextToCell(game);
    return boolProgress(done, "Vent placed next to Cell", "Place a Vent next to a Cell");
  },
  purchaseUpgrade: (game) => {
    const done = game.upgradeset.getAllUpgrades().some((upgrade) => upgrade.level > 0);
    return boolProgress(done, "Upgrade purchased!", "Purchase an upgrade");
  },
  purchaseDualCell: (game) => {
    const done = game.tileset.tiles_list.some((tile) => tile.part?.id === "uranium2" && tile.activated);
    return boolProgress(done, "Dual Cell placed!", "Place a Dual Cell");
  },
  tenActiveCells: (game) => {
    const count = countActiveCellsByCategory(game, "cell");
    return createProgress(count, CELLS_TARGET_10, "Cells");
  },
  perpetualUranium: (game) => {
    const done = game.upgradeset.getUpgrade("uranium1_cell_perpetual")?.level > 0;
    return boolProgress(done, "Perpetual Uranium unlocked!", "Unlock Perpetual Uranium");
  },
  increaseMaxPower: (game) => {
    const done = game.tileset.tiles_list.some((tile) => tile.part?.category === "capacitor");
    return boolProgress(done, "Capacitor placed!", "Place a Capacitor");
  },
  fiveComponentKinds: (game) => {
    const categories = new Set(game.tileset.tiles_list.map((t) => t.part?.category).filter(Boolean));
    const count = categories.size;
    return createProgress(count, CELLS_TARGET_5, "Component types");
  },
  tenCapacitors: (game) => {
    const count = countTilesByCategory(game, "capacitor");
    return createProgress(count, CELLS_TARGET_10, "Capacitors");
  },
  fiveQuadPlutonium: (game) => {
    const count = game.tileset.tiles_list.filter((t) => t.part?.id === "plutonium3" && t.ticks > 0).length;
    return createProgress(count, CELLS_TARGET_5, "Quad Plutonium Cells");
  },
  unlockThorium: (game) => {
    const count = game.tileset.tiles_list.filter(
      (tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "thorium3"
    ).length;
    return createProgress(count, CELLS_TARGET_5, "Quad Thorium Cells");
  },
  unlockSeaborgium: (game) => {
    const count = game.tileset.tiles_list.filter(
      (tile) => tile?.part && tile?.activated && tile.ticks > 0 && tile.part.id === "seaborgium3"
    ).length;
    return createProgress(count, CELLS_TARGET_5, "Quad Seaborgium Cells");
  },
  fiveQuadDolorium: (game) => {
    const count = game.tileset.tiles_list.filter((t) => t.part?.id === "dolorium3" && t.ticks > 0).length;
    return createProgress(count, CELLS_TARGET_5, "Quad Dolorium Cells");
  },
  fiveQuadNefastium: (game) => {
    const count = game.tileset.tiles_list.filter((t) => t.part?.id === "nefastium3" && t.ticks > 0).length;
    return createProgress(count, CELLS_TARGET_5, "Quad Nefastium Cells");
  },
  placeExperimentalPart: (game) => {
    const done = game.tileset.tiles_list.some((tile) => tile.part?.experimental === true);
    return boolProgress(done, "Experimental part placed!", "Place an experimental part");
  },
};

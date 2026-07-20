import { toDecimal } from "@app/simUtils.js";
import { patchGameState, setDecimal, withHostEconomyHydrate } from "@app/state.js";
import { dispatchPlayerIntent } from "@app/bridge/bridge-intents.js";
import {
  hydrateSessionFromHost as harnessHydrateSession,
  loadEconomyFromHost,
  pushHostUpgradeLevelsForLoad,
  setReactorHeat as harnessSetReactorHeat,
  setReactorPower as harnessSetReactorPower,
  setTileHeat as harnessSetTileHeat,
  setTileTicks as harnessSetTileTicks,
  syncGridFromGame,
} from "./bridge-test-harness.js";

export function hydrateSessionFromHost(game) {
  harnessHydrateSession(game);
}

export function grantInfiniteResources(game) {
  withHostEconomyHydrate(game, () => {
    game.current_money = 1e30;
    setDecimal(game.state, "current_exotic_particles", toDecimal(1e20));
    setDecimal(game.state, "total_exotic_particles", toDecimal(1e20));
    game.exoticParticleManager.exotic_particles = toDecimal(1e20);
  });
  loadEconomyFromHost(game);
  patchGameState(game, {
    current_money: game.current_money,
    current_exotic_particles: game.state.current_exotic_particles,
  });
  game.partset?.check_affordability?.(game);
  game.upgradeset?.check_affordability?.(game);
}

export function syncGridState(game, { activeTiles = false } = {}) {
  game.reactor.updateStats();
  syncGridFromGame(game);

  if (activeTiles) {
    game.tileset.updateActiveTiles();
  }
}

export function getFlatIndex(gameOrRow, rowOrCol, colOrCols) {
  const g = gameOrRow;
  if (g?.tileset?.gridIndex && typeof rowOrCol === "number" && typeof colOrCols === "number") {
    return g.tileset.gridIndex(rowOrCol, colOrCols);
  }
  const row = gameOrRow;
  const col = rowOrCol;
  const cols = colOrCols;
  return row * cols + col;
}

export function setGridDimensions(game, { rows, cols }) {
  game.rows = rows;
  game.cols = cols;
  game.base_rows = rows;
  game.base_cols = cols;
  game.tileset.updateActiveTiles();
}

export function setTileHeat(game, tile, heat) {
  if (!tile) return;
  harnessSetTileHeat(game, tile.row, tile.col, heat);
}

export function setTileTicks(game, tile, ticks) {
  if (!tile) return;
  harnessSetTileTicks(game, tile.row, tile.col, ticks);
}

export function setReactorHeat(game, heat) {
  harnessSetReactorHeat(game, heat);
}

export function setReactorPower(game, power) {
  harnessSetReactorPower(game, power);
}

export async function setTilePart(tile, part) {
  if (!tile?.game || !part?.id) return false;
  if (tile.part) return false;
  if (tile.game.partset?.isPartDoctrineLocked?.(part)) return false;
  const { placed } = await dispatchPlayerIntent(tile.game, tile.game.engine, {
    type: "PLACE_PART",
    payload: { row: tile.row, col: tile.col, id: part.id },
  });
  return placed.length > 0;
}

export async function clearTilePart(tile) {
  if (!tile?.part || !tile.game) return;
  await dispatchPlayerIntent(tile.game, tile.game.engine, {
    type: "REMOVE_PART",
    payload: { row: tile.row, col: tile.col },
  });
}

export async function placePart(game, row, col, partId, tileState) {
    const tile = game.tileset.getTile(row, col);
    if (!tile) throw new Error(`Tile at ${row},${col} does not exist`);
    const part = game.partset.getPartById(partId);
    if (!part) throw new Error(`Part ${partId} does not exist`);

    if (!(await setTilePart(tile, part))) {
      throw new Error(`Failed to place ${partId} at ${row},${col}`);
    }
    if (tileState) {
        if (tileState.heat !== undefined) setTileHeat(game, tile, tileState.heat);
        if (tileState.heat_contained !== undefined) setTileHeat(game, tile, tileState.heat_contained);
        if (tileState.ticks !== undefined) setTileTicks(game, tile, tileState.ticks);
        else if (part.category === "cell") setTileTicks(game, tile, part.ticks);
        if (tileState.activated !== undefined) {
          const inst = game.coreBridge?.session?.grid?.getComponentAt?.(row, col);
          if (inst && game.coreBridge.session.grid.tileHeatMap) {
            game.coreBridge.session.grid.tileHeatMap.setActivated(row, col, tileState.activated);
          }
          tile.activated = tileState.activated;
        } else {
          tile.activated = true;
        }
    } else if (part.category === "cell" && tile.part) {
        setTileTicks(game, tile, part.ticks);
        tile.activated = true;
    }
    tile.recalculateEffectiveValues?.();
    return tile;
}

export function setUpgradeLevel(game, upgradeId, level) {
  const upgrade = game.upgradeset.getUpgrade(upgradeId);
  if (!upgrade) throw new Error(`Upgrade ${upgradeId} not found`);
  upgrade.setLevel(level);
  pushHostUpgradeLevelsForLoad(game);
  return upgrade;
}

export function forcePurchaseUpgrade(game, upgradeId, level = 1) {
    const upgrade = game.upgradeset.getUpgrade(upgradeId);
    if (!upgrade) throw new Error(`Upgrade ${upgradeId} not found`);
    
    // Check if already at max level
    if (upgrade.level >= upgrade.max_level) {
        return true; // Already maxed, consider it successful
    }
    
    // Handle requirements
    if (upgrade.erequires) {
        const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);
        if (requiredUpgrade && requiredUpgrade.level === 0) {
            // Recursively purchase required upgrade
            forcePurchaseUpgrade(game, upgrade.erequires, 1);
        }
    }
    
    const isEpUpgrade = !!(upgrade.base_ecost?.gt?.(0) || (Number(upgrade.base_ecost) > 0));
    const currentCost = isEpUpgrade ? upgrade.current_ecost : upgrade.current_cost;
    const costNum = (typeof currentCost?.toNumber === 'function' ? currentCost.toNumber() : Number(currentCost));

    if (isEpUpgrade) {
        const epNum = (typeof game.current_exotic_particles?.toNumber === 'function' ? game.current_exotic_particles.toNumber() : Number(game.current_exotic_particles));
        game.current_exotic_particles = Math.max(epNum, costNum * 10 + 100);
        patchGameState(game, { current_exotic_particles: game.current_exotic_particles });
    } else {
        const moneyNum = (typeof game.current_money?.toNumber === 'function' ? game.current_money.toNumber() : Number(game.current_money));
        game.current_money = Math.max(moneyNum, costNum * 10 + 10000);
        patchGameState(game, { current_money: game.current_money });
    }
    loadEconomyFromHost(game);

    const wasBypass = game.bypass_tech_tree_restrictions;
    game.bypass_tech_tree_restrictions = true;
    const wasAffordable = upgrade.affordable;
    upgrade.affordable = true;

    const ecost = upgrade.current_ecost;
    const costVal = upgrade.current_cost;
    const hasEnoughResources = isEpUpgrade
        ? (game.current_exotic_particles?.gte ? game.current_exotic_particles.gte(ecost) : Number(game.current_exotic_particles) >= (ecost?.toNumber ? ecost.toNumber() : ecost))
        : (game.current_money?.gte ? game.current_money.gte(costVal) : Number(game.current_money) >= (costVal?.toNumber ? costVal.toNumber() : costVal));
    
    if (!hasEnoughResources) {
        game.bypass_tech_tree_restrictions = wasBypass;
        upgrade.affordable = wasAffordable;
        throw new Error(`Upgrade ${upgradeId} requires more resources. Money: ${game.current_money}, Cost: ${upgrade.current_cost}, EP: ${game.current_exotic_particles}, ECost: ${upgrade.current_ecost}`);
    }

    const success = game.upgradeset.purchaseUpgrade(upgradeId);

    if (!success) {
        if (level > 0 && upgrade.level < upgrade.max_level) {
            upgrade.setLevel(Math.min(level, upgrade.max_level));
            pushHostUpgradeLevelsForLoad(game);
            game.bypass_tech_tree_restrictions = wasBypass;
            return true;
        }
        game.bypass_tech_tree_restrictions = wasBypass;
        upgrade.affordable = wasAffordable;
        throw new Error(`Failed to purchase upgrade ${upgradeId}. Level: ${upgrade.level}, Max Level: ${upgrade.max_level}`);
    }

    game.bypass_tech_tree_restrictions = wasBypass;
    if (level > 1) {
        upgrade.setLevel(level);
        pushHostUpgradeLevelsForLoad(game);
    }

    return success;
}

export function runTicks(game, count) {
    for (let i = 0; i < count; i++) {
        game.engine.tick();
    }
}

export function unlockAllUpgrades(game) {
    game.upgradeset.getAllUpgrades().forEach(u => {
        if (u.max_level > 0) {
            u.setLevel(1);
        }
    });
    pushHostUpgradeLevelsForLoad(game);
}

export function maxOutUpgrades(game, filterFn = null) {
    game.upgradeset.getAllUpgrades().forEach(u => {
        if (!filterFn || filterFn(u)) {
            u.setLevel(u.max_level);
        }
    });
    pushHostUpgradeLevelsForLoad(game);
    game.reactor.updateStats();
}

export async function clearGrid(game) {
  game.tileset.clearAllTiles();
  syncGridState(game);
}

export function setTechTreeState(game, { doctrineId, bypassRestrictions } = {}) {
  if (doctrineId !== undefined) {
    game.tech_tree = doctrineId;
  }
  if (bypassRestrictions !== undefined) {
    game.bypass_tech_tree_restrictions = bypassRestrictions;
  }
  game.partset?.check_affordability?.(game);
  game.upgradeset?.check_affordability?.(game);
}

export function withTechTree(game, doctrineId, fn) {
  const prevTree = game.tech_tree;
  const prevBypass = game.bypass_tech_tree_restrictions;
  game.tech_tree = doctrineId;
  game.bypass_tech_tree_restrictions = false;
  game.upgradeset.check_affordability(game);
  try {
    return fn();
  } finally {
    game.tech_tree = prevTree;
    game.bypass_tech_tree_restrictions = prevBypass;
    game.upgradeset.check_affordability(game);
  }
}

export async function assembleHeatChain(
  game,
  partIds,
  startRow,
  startCol,
  { axis = "horizontal", heatByIndex } = {}
) {
  const tiles = [];
  for (let i = 0; i < partIds.length; i++) {
    const row = axis === "horizontal" ? startRow : startRow + i;
    const col = axis === "horizontal" ? startCol + i : startCol;
    const tile = await placePart(game, row, col, partIds[i]);
    if (heatByIndex && heatByIndex[i] !== undefined) {
      setTileHeat(game, tile, heatByIndex[i]);
    }
    tiles.push(tile);
  }
  game.reactor?.updateStats?.();
  return tiles;
}

export function runManualActionUntil(game, action, predicate, { maxSteps = 100000 } = {}) {
  let steps = 0;
  while (!predicate(game) && steps < maxSteps) {
    action(game);
    steps++;
  }
  if (steps >= maxSteps) {
    throw new Error(`runManualActionUntil: exceeded ${maxSteps} steps`);
  }
  return steps;
}


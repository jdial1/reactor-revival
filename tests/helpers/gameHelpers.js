import { toDecimal } from "@app/utils.js";
import { patchGameState, setDecimal, withHostEconomyHydrate } from "@app/state.js";

export function hydrateSessionFromHost(game) {
  game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
  game.coreBridge?.loadEconomyFromHost?.();
  game.coreBridge?.syncGridFromGame?.();
}

export function grantInfiniteResources(game) {
  withHostEconomyHydrate(game, () => {
    game.current_money = 1e30;
    setDecimal(game.state, "current_exotic_particles", toDecimal(1e20));
    setDecimal(game.state, "total_exotic_particles", toDecimal(1e20));
    game.exoticParticleManager.exotic_particles = toDecimal(1e20);
  });
  game.coreBridge?.loadEconomyFromHost?.();
  patchGameState(game, {
    current_money: game.current_money,
    current_exotic_particles: game.state.current_exotic_particles,
  });
  game.partset?.check_affordability?.(game);
  game.upgradeset?.check_affordability?.(game);
}

export function syncGridState(game, { activeTiles = false } = {}) {
  game.reactor.updateStats();
  game.coreBridge?.syncGridFromGame?.();

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

export async function placePart(game, row, col, partId, tileState) {
    const tile = game.tileset.getTile(row, col);
    if (!tile) throw new Error(`Tile at ${row},${col} does not exist`);
    const part = game.partset.getPartById(partId);
    if (!part) throw new Error(`Part ${partId} does not exist`);

    if (!(await tile.setPart(part))) {
      throw new Error(`Failed to place ${partId} at ${row},${col}`);
    }
    if (tileState) {
        if (tileState.heat !== undefined) tile.heat_contained = tileState.heat;
        if (tileState.heat_contained !== undefined) tile.heat_contained = tileState.heat_contained;
        if (tileState.ticks !== undefined) tile.ticks = tileState.ticks;
        else if (part.category === "cell") tile.ticks = part.ticks;
        tile.activated = tileState.activated !== undefined ? tileState.activated : true;
        game.coreBridge?.syncGridFromGame?.();
    } else if (part.category === "cell" && tile.part) {
        tile.ticks = part.ticks;
        tile.activated = true;
        game.coreBridge?.syncGridFromGame?.();
    }
    tile.recalculateEffectiveValues?.();
    return tile;
}

export function setUpgradeLevel(game, upgradeId, level) {
  const upgrade = game.upgradeset.getUpgrade(upgradeId);
  if (!upgrade) throw new Error(`Upgrade ${upgradeId} not found`);
  upgrade.setLevel(level);
  game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
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
    
    upgrade.updateDisplayCost();
    const isEpUpgrade = !!(upgrade.base_ecost?.gt?.(0) || (Number(upgrade.base_ecost) > 0));
    const currentCost = isEpUpgrade ? upgrade.getEcost() : upgrade.getCost();
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
    game.coreBridge?.loadEconomyFromHost?.();

    upgrade.updateDisplayCost();

    const wasBypass = game.bypass_tech_tree_restrictions;
    game.bypass_tech_tree_restrictions = true;
    const wasAffordable = upgrade.affordable;
    upgrade.setAffordable(true);

    const ecost = upgrade.getEcost();
    const costVal = upgrade.getCost();
    const hasEnoughResources = isEpUpgrade
        ? (game.current_exotic_particles?.gte ? game.current_exotic_particles.gte(ecost) : Number(game.current_exotic_particles) >= (ecost?.toNumber ? ecost.toNumber() : ecost))
        : (game.current_money?.gte ? game.current_money.gte(costVal) : Number(game.current_money) >= (costVal?.toNumber ? costVal.toNumber() : costVal));
    
    if (!hasEnoughResources) {
        game.bypass_tech_tree_restrictions = wasBypass;
        upgrade.setAffordable(wasAffordable);
        throw new Error(`Upgrade ${upgradeId} requires more resources. Money: ${game.current_money}, Cost: ${upgrade.getCost()}, EP: ${game.current_exotic_particles}, ECost: ${upgrade.getEcost()}`);
    }

    const success = game.upgradeset.purchaseUpgrade(upgradeId);

    if (!success) {
        if (level > 0 && upgrade.level < upgrade.max_level) {
            upgrade.setLevel(Math.min(level, upgrade.max_level));
            game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
            game.bypass_tech_tree_restrictions = wasBypass;
            return true;
        }
        game.bypass_tech_tree_restrictions = wasBypass;
        upgrade.setAffordable(wasAffordable);
        throw new Error(`Failed to purchase upgrade ${upgradeId}. Level: ${upgrade.level}, Max Level: ${upgrade.max_level}`);
    }

    game.bypass_tech_tree_restrictions = wasBypass;
    if (level > 1) {
        upgrade.setLevel(level);
        game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
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
    game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
}

export function maxOutUpgrades(game, filterFn = null) {
    game.upgradeset.getAllUpgrades().forEach(u => {
        if (!filterFn || filterFn(u)) {
            u.setLevel(u.max_level);
        }
    });
    game.coreBridge?.pushHostUpgradeLevelsForLoad?.();
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
      tile.heat_contained = heatByIndex[i];
    }
    tiles.push(tile);
  }
  game.reactor?.updateStats?.();
  game.coreBridge?.syncGridFromGame?.();
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


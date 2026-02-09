export async function placePart(game, row, col, partId) {
    const tile = game.tileset.getTile(row, col);
    if (!tile) throw new Error(`Tile at ${row},${col} does not exist`);
    const part = game.partset.getPartById(partId);
    if (!part) throw new Error(`Part ${partId} does not exist`);
    
    await tile.setPart(part);
    tile.activated = true;
    if (part.category === "cell") {
        tile.ticks = part.ticks;
    }
    return tile;
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
    const currentCost = upgrade.base_ecost ? upgrade.getEcost() : upgrade.getCost();
    const costNum = (typeof currentCost?.toNumber === 'function' ? currentCost.toNumber() : Number(currentCost));

    if (upgrade.base_ecost) {
        const epNum = (typeof game.current_exotic_particles?.toNumber === 'function' ? game.current_exotic_particles.toNumber() : Number(game.current_exotic_particles));
        game.current_exotic_particles = Math.max(epNum, costNum * 10 + 100);
        game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
    } else {
        const moneyNum = (typeof game.current_money?.toNumber === 'function' ? game.current_money.toNumber() : Number(game.current_money));
        game.current_money = Math.max(moneyNum, costNum * 10 + 10000);
        game.ui.stateManager.setVar("current_money", game.current_money);
    }

    upgrade.updateDisplayCost();

    const wasBypass = game.bypass_tech_tree_restrictions;
    game.bypass_tech_tree_restrictions = true;
    const wasAffordable = upgrade.affordable;
    upgrade.setAffordable(true);

    const ecost = upgrade.getEcost();
    const costVal = upgrade.getCost();
    const hasEnoughResources = upgrade.base_ecost
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
}

export function maxOutUpgrades(game, filterFn = null) {
    game.upgradeset.getAllUpgrades().forEach(u => {
        if (!filterFn || filterFn(u)) {
            u.setLevel(u.max_level);
        }
    });
    game.reactor.updateStats();
}

export async function clearGrid(game) {
    game.tileset.clearAllTiles();
    game.engine.markPartCacheAsDirty();
    game.engine._updatePartCaches();
}


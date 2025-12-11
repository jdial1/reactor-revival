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
    
    // Ensure we have enough resources
    if (upgrade.base_ecost) {
        game.current_exotic_particles = Math.max(game.current_exotic_particles, currentCost * 10 + 100);
        game.ui.stateManager.setVar("current_exotic_particles", game.current_exotic_particles);
    } else {
        game.current_money = Math.max(game.current_money, currentCost * 10 + 10000);
        game.ui.stateManager.setVar("current_money", game.current_money);
    }
    
    upgrade.updateDisplayCost();
    
    // Temporarily mark as affordable to bypass check_affordability restrictions
    const wasAffordable = upgrade.affordable;
    upgrade.setAffordable(true);
    
    // Verify we actually have enough resources
    const hasEnoughResources = upgrade.base_ecost 
        ? game.current_exotic_particles >= upgrade.getEcost()
        : game.current_money >= upgrade.getCost();
    
    if (!hasEnoughResources) {
        upgrade.setAffordable(wasAffordable);
        throw new Error(`Upgrade ${upgradeId} requires more resources. Money: ${game.current_money}, Cost: ${upgrade.getCost()}, EP: ${game.current_exotic_particles}, ECost: ${upgrade.getEcost()}`);
    }
    
    const success = game.upgradeset.purchaseUpgrade(upgradeId);
    
    if (!success) {
        upgrade.setAffordable(wasAffordable);
        throw new Error(`Failed to purchase upgrade ${upgradeId}. Level: ${upgrade.level}, Max Level: ${upgrade.max_level}`);
    }
    
    if (level > 1 && success) {
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


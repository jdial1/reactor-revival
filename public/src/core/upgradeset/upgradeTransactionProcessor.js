import { logger } from "../../utils/logger.js";
import { updateDecimal } from "../store.js";

export function runPurchaseUpgrade(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: Upgrade '${upgradeId}' not found.`);
    return false;
  }
  if (!upgradeset.isUpgradeAvailable(upgradeId)) {
    return false;
  }
  if (!upgrade.affordable) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' not affordable. Money: ${upgradeset.game.state.current_money}, Cost: ${upgrade.getCost()}`);
    return false;
  }
  if (upgrade.level >= upgrade.max_level) {
    logger.log('warn', 'game', `[Upgrade] Purchase failed: '${upgradeId}' already at max level (${upgrade.level})`);
    return false;
  }

  const cost = upgrade.getCost();
  const ecost = upgrade.getEcost();
  let purchased = false;

  if (upgradeset.game.isSandbox) {
    purchased = true;
  } else   if (ecost.gt(0)) {
    if (upgradeset.game.state.current_exotic_particles.gte(ecost)) {
      updateDecimal(upgradeset.game.state, "current_exotic_particles", (d) => d.sub(ecost));
      upgradeset.game.ui?.stateManager?.setVar("current_exotic_particles", upgradeset.game.state.current_exotic_particles);
      purchased = true;
    }
  } else {
    if (upgradeset.game.state.current_money.gte(cost)) {
      updateDecimal(upgradeset.game.state, "current_money", (d) => d.sub(cost));
      upgradeset.game.ui?.stateManager?.setVar("current_money", upgradeset.game.state.current_money);
      purchased = true;
    }
  }

  if (purchased) {
    upgrade.setLevel(upgrade.level + 1);
    upgradeset.game.emit?.("upgradePurchased", { upgrade });
    upgradeset.game.debugHistory.add("upgrades", "Upgrade purchased", { id: upgradeId, level: upgrade.level });
    if (upgrade.upgrade.type === "experimental_parts") {
      upgradeset.game.epart_onclick(upgrade);
    }
    upgradeset.updateSectionCounts();
    if (!upgradeset.game.isSandbox) upgradeset.game.saveManager.autoSave();
  }

  return purchased;
}

export function runPurchaseUpgradeToMax(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.game.isSandbox) return 0;
  if (!upgradeset.isUpgradeAvailable(upgradeId)) return 0;
  let count = 0;
  while (upgrade.level < upgrade.max_level && runPurchaseUpgrade(upgradeset, upgradeId)) {
    count++;
  }
  return count;
}

export function runPurchaseAllUpgrades(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => (u.base_ecost.eq ? u.base_ecost.eq(0) : !u.base_ecost) && upgradeset.isUpgradeAvailable(u.id);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runPurchaseUpgradeToMax(upgradeset, u.id));
}

export function runPurchaseAllResearch(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.gt && u.base_ecost.gt(0) && upgradeset.isUpgradeAvailable(u.id);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runPurchaseUpgradeToMax(upgradeset, u.id));
}

export function runClearAllUpgrades(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.eq ? u.base_ecost.eq(0) : !u.base_ecost;
  upgradeset.upgradesArray.filter(filter).forEach((u) => runResetUpgradeLevel(upgradeset, u.id));
}

export function runClearAllResearch(upgradeset) {
  if (!upgradeset.game.isSandbox) return;
  const filter = (u) => u.base_ecost.gt && u.base_ecost.gt(0);
  upgradeset.upgradesArray.filter(filter).forEach((u) => runResetUpgradeLevel(upgradeset, u.id));
}

export function runResetUpgradeLevel(upgradeset, upgradeId) {
  const upgrade = upgradeset.getUpgrade(upgradeId);
  if (!upgrade || !upgradeset.game.isSandbox) return;
  if (upgrade.level === 0) return;
  upgrade.setLevel(0);
  upgradeset.updateSectionCounts();
}

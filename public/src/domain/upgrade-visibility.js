export function isCellUpgradeVisible(upgrade, game) {
  const upgType = upgrade?.upgrade?.type || "";
  const basePart = upgrade?.upgrade?.part;
  const isCellUpgrade = typeof upgType === "string" && upgType.indexOf("cell_") === 0;

  if (!isCellUpgrade || !basePart || basePart.category !== "cell") return true;

  const unlockManager = game?.unlockManager;
  if (unlockManager && typeof unlockManager.isPartUnlocked === "function") {
    return unlockManager.isPartUnlocked(basePart);
  }
  return true;
}

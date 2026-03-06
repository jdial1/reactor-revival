import { toNumber } from "../../utils/mathUtils.js";
import { toDecimal } from "../../utils/decimal.js";
import { getAffordabilitySettings } from "../../core/preferencesStore.js";

function handleUnavailableUpgrade(upgrade, hideOtherDoctrine) {
  if (!upgrade.$el) return;
  if (hideOtherDoctrine) upgrade.$el.classList.add("hidden");
  else {
    upgrade.$el.classList.remove("hidden");
    upgrade.$el.classList.add("doctrine-locked");
  }
  upgrade.setAffordable(false);
  upgrade.setAffordProgress(0);
}

function computeAffordable(upgrade, upgradeset, game) {
  if (game.isSandbox) {
    return !upgrade.erequires || (upgradeset.getUpgrade(upgrade.erequires)?.level ?? 0) > 0;
  }
  if (game.reactor && game.reactor.has_melted_down) return false;
  const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);
  if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) return false;
  if (upgrade.base_ecost && upgrade.base_ecost.gt(0)) {
    return toDecimal(game.state.current_exotic_particles).gte(upgrade.current_ecost);
  }
  return toDecimal(game.state.current_money).gte(upgrade.current_cost);
}

function isMaxLevelOrMeltedDown(upgrade, game) {
  return upgrade.level >= upgrade.max_level || game.reactor?.has_melted_down === true;
}

function usesExoticParticles(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function getProgressRatio(current, cost) {
  const n = toNumber(current);
  const c = toNumber(cost);
  return Math.min(1, n / c);
}

function getCurrentAndCost(upgrade, game) {
  const useEp = usesExoticParticles(upgrade);
  const raw = useEp ? game.state.current_exotic_particles : game.state.current_money;
  const current = toDecimal(raw);
  const cost = useEp ? upgrade.current_ecost : upgrade.current_cost;
  if (!cost || !cost.gt(0)) return null;
  return { current, cost };
}

function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (isMaxLevelOrMeltedDown(upgrade, game)) return 0;
  const pair = getCurrentAndCost(upgrade, game);
  if (!pair) return 0;
  return getProgressRatio(pair.current, pair.cost);
}

function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost && upgrade.base_ecost.gt && upgrade.base_ecost.gt(0));
}

function applyUpgradeVisibility(upgrade, isAffordable, settings) {
  if (!upgrade.$el) return { isResearch: false, isInDOM: false, isMaxed: false };
  const isResearch = isResearchUpgrade(upgrade);
  const shouldHideUnaffordable = isResearch ? settings.hideResearch : settings.hideUpgrades;
  const shouldHideMaxed = isResearch ? settings.hideMaxResearch : settings.hideMaxUpgrades;
  const isMaxed = upgrade.level >= upgrade.max_level;
  const isInDOM = upgrade.$el.isConnected;
  const shouldHide =
    (shouldHideUnaffordable && !isAffordable && !isMaxed) || (shouldHideMaxed && isMaxed);
  if (shouldHide) upgrade.$el.classList.add("hidden");
  else upgrade.$el.classList.remove("hidden");
  return { isResearch, isInDOM, isMaxed };
}

function emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch) {
  game?.emit?.("upgradesAffordabilityChanged", {
    hasAnyUpgrade,
    hasVisibleAffordableUpgrade,
    hasAnyResearch,
    hasVisibleAffordableResearch,
  });
}

export function runCheckAffordability(upgradeset, game) {
  if (!game) return;
  const settings = getAffordabilitySettings();
  let hasVisibleAffordableUpgrade = false;
  let hasVisibleAffordableResearch = false;
  let hasAnyUpgrade = false;
  let hasAnyResearch = false;

  upgradeset.upgradesArray.forEach((upgrade) => {
    if (!upgradeset.isUpgradeAvailable(upgrade.id)) {
      handleUnavailableUpgrade(upgrade, settings.hideOtherDoctrine);
      return;
    }

    if (upgrade.$el) upgrade.$el.classList.remove("doctrine-locked");

    const isAffordable = computeAffordable(upgrade, upgradeset, game);
    upgrade.setAffordable(isAffordable);
    upgrade.setAffordProgress(computeAffordProgress(upgrade, game, isAffordable));

    const { isResearch, isInDOM, isMaxed } = applyUpgradeVisibility(upgrade, isAffordable, settings);
    if (isInDOM) {
      if (isResearch) {
        hasAnyResearch = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableResearch = true;
      } else {
        hasAnyUpgrade = true;
        if (isAffordable && !isMaxed) hasVisibleAffordableUpgrade = true;
      }
    }
  });

  emitAffordabilityBanners(game, hasAnyUpgrade, hasVisibleAffordableUpgrade, hasAnyResearch, hasVisibleAffordableResearch);
}

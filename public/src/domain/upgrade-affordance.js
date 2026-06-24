import { toDecimal, toNumber } from "../simUtils.js";
import { getAffordabilitySettings } from "../state/preferences.js";

export function computeAffordable(upgrade, upgradeset, game) {
  if (game.reactor && game.reactor.has_melted_down) return false;
  const requiredUpgrade = game.upgradeset.getUpgrade(upgrade.erequires);
  if (upgrade.erequires && (!requiredUpgrade || requiredUpgrade.level === 0)) return false;
  if (upgrade.base_ecost?.gt?.(0)) {
    return toDecimal(game.state.current_exotic_particles).gte(upgrade.current_ecost);
  }
  return toDecimal(game.state.current_money).gte(upgrade.current_cost);
}

function isMaxLevelOrMeltedDown(upgrade, game) {
  return upgrade.level >= upgrade.max_level || game.reactor?.has_melted_down === true;
}

function usesExoticParticles(upgrade) {
  return Boolean(upgrade.base_ecost?.gt?.(0));
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

export function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (isMaxLevelOrMeltedDown(upgrade, game)) return 0;
  const pair = getCurrentAndCost(upgrade, game);
  if (!pair) return 0;
  return getProgressRatio(pair.current, pair.cost);
}

export function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost?.gt?.(0));
}

export function getAffordanceFlags(upgrade, upgradeset, game, settings) {
  const available = upgradeset.isUpgradeAvailable(upgrade.id);
  if (!available) {
    return { available: false, affordable: false, progress: 0, isResearch: isResearchUpgrade(upgrade), isMaxed: false, hidden: false, doctrineLocked: true };
  }
  const affordable = computeAffordable(upgrade, upgradeset, game);
  const progress = computeAffordProgress(upgrade, game, affordable);
  const isResearch = isResearchUpgrade(upgrade);
  const isMaxed = upgrade.level >= upgrade.max_level;
  const shouldHideUnaffordable = isResearch ? settings.hideResearch : settings.hideUpgrades;
  const shouldHideMaxed = isResearch ? settings.hideMaxResearch : settings.hideMaxUpgrades;
  const hidden = (shouldHideUnaffordable && !affordable && !isMaxed) || (shouldHideMaxed && isMaxed);
  return { available: true, affordable, progress, isResearch, isMaxed, hidden, doctrineLocked: false };
}

export function runCheckAffordabilityCore(upgradeset, game) {
  if (!game) return null;
  const settings = getAffordabilitySettings();
  let hasVisibleAffordableUpgrade = false;
  let hasVisibleAffordableResearch = false;
  let hasAnyUpgrade = false;
  let hasAnyResearch = false;
  const rows = [];

  upgradeset.upgradesArray.forEach((upgrade) => {
    const flags = getAffordanceFlags(upgrade, upgradeset, game, settings);
    upgrade._affordHidden = flags.hidden;
    if (!flags.available) {
      upgrade.setAffordable(false);
      upgrade.setAffordProgress(0);
      rows.push({ upgrade, flags });
      return;
    }
    upgrade.setAffordable(flags.affordable);
    upgrade.setAffordProgress(flags.progress);
    if (flags.isResearch) {
      hasAnyResearch = true;
      if (flags.affordable && !flags.isMaxed) hasVisibleAffordableResearch = true;
    } else {
      hasAnyUpgrade = true;
      if (flags.affordable && !flags.isMaxed) hasVisibleAffordableUpgrade = true;
    }
  });

  return {
    rows,
    hasAnyUpgrade,
    hasVisibleAffordableUpgrade,
    hasAnyResearch,
    hasVisibleAffordableResearch,
  };
}

let _refreshUpgradeCards = null;

export function setUpgradeCardRefreshHandler(fn) {
  _refreshUpgradeCards = fn;
}

export function runCheckAffordability(upgradeset, game) {
  const snapshot = runCheckAffordabilityCore(upgradeset, game);
  if (!snapshot) return;
  _refreshUpgradeCards?.(upgradeset);
  const uiState = game?.ui?.uiState;
  if (uiState) {
    uiState.has_affordable_upgrades = snapshot.hasVisibleAffordableUpgrade;
    uiState.has_affordable_research = snapshot.hasVisibleAffordableResearch;
    uiState.upgrades_banner_visibility = {
      upgradesHidden: !(snapshot.hasAnyUpgrade && !snapshot.hasVisibleAffordableUpgrade),
      researchHidden: !(snapshot.hasAnyResearch && !snapshot.hasVisibleAffordableResearch),
    };
  }
}

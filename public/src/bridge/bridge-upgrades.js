import { toNumber, toDecimal, getDecimal } from "../simUtils.js";
import { getAffordabilitySettings } from "../state/preferences.js";
import { getActiveBridge } from "./active.js";

const Decimal = getDecimal();

export function projectUpgradeCosts(upgrade) {
  if (!upgrade) return;
  const bridge = getActiveBridge(upgrade.game);
  if (bridge) {
    upgrade.level = bridge.getUpgradeLevel(upgrade.id) ?? 0;
  }
  if (!bridge) {
    upgrade.current_cost = upgrade.base_cost;
    upgrade.current_ecost = upgrade.base_ecost;
    return;
  }
  const preview = bridge.previewUpgrade(upgrade.id);
  if (!preview || preview.reason === "max_level" || upgrade.level >= upgrade.max_level) {
    upgrade.current_cost = Decimal.MAX_VALUE;
    upgrade.current_ecost = Decimal.MAX_VALUE;
    return;
  }
  const isEp = preview.currency === "ep" || preview.currency === "exotic_particles";
  const cost = toDecimal(preview.costDecimal ?? preview.cost);
  upgrade.current_cost = isEp ? toDecimal(0) : cost;
  upgrade.current_ecost = isEp ? cost : toDecimal(0);
}

export function projectAllUpgradeCosts(upgradeset) {
  const list = upgradeset?.upgradesArray;
  if (!list) return;
  for (let i = 0; i < list.length; i++) projectUpgradeCosts(list[i]);
}

export function mergeSessionUpgradeLevel(session, id, level) {
  if (!session?.setUpgradeLevels || !id) return;
  const prev = typeof session.systems?.upgrades?.serialize === "function"
    ? session.systems.upgrades.serialize()
    : [];
  const next = [];
  let found = false;
  for (let i = 0; i < prev.length; i++) {
    const entry = prev[i];
    if (!entry?.id) continue;
    if (entry.id === id) {
      found = true;
      if (level > 0) next.push({ id, level });
      continue;
    }
    if (entry.level > 0) next.push({ id: entry.id, level: entry.level });
  }
  if (!found && level > 0) next.push({ id, level });
  session.setUpgradeLevels(next);
}

export function hydrateUpgradeLevelsFromHost(bridge) {
  const session = bridge.session;
  const upgradeset = bridge.game?.upgradeset;
  if (!session?.setUpgradeLevels || !upgradeset?.upgradesArray) return;
  const levels = [];
  for (let i = 0; i < upgradeset.upgradesArray.length; i++) {
    const upg = upgradeset.upgradesArray[i];
    const hostLevel = upg.level || 0;
    if (hostLevel > 0) levels.push({ id: upg.id, level: hostLevel });
  }
  session.setUpgradeLevels(levels);
}

export function projectUpgradeLevelsToHost(bridge) {
  const session = bridge.session;
  const upgradeset = bridge.game?.upgradeset;
  if (!session || !upgradeset?.upgradesArray) return;
  for (let i = 0; i < upgradeset.upgradesArray.length; i++) {
    const upg = upgradeset.upgradesArray[i];
    if (!upg) continue;
    const level = session.getUpgradeLevel?.(upg.id) ?? 0;
    if (upg.level !== level) upg.setLevel(level, { deferSync: true, skipSessionSync: true });
    else projectUpgradeCosts(upg);
  }
  bridge.game.syncModifiersFromUpgrades?.({ skipGrid: true });
}

function computeAffordable(upgrade, upgradeset, game) {
  if (game.reactor?.has_melted_down) return false;
  if (!upgradeset.isUpgradeAvailable(upgrade.id)) return false;
  const preview = game.coreBridge?.previewUpgrade?.(upgrade.id);
  if (!preview) return false;
  return !!preview.canPurchase;
}

function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost?.gt?.(0));
}

function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (upgrade.level >= upgrade.max_level || game.reactor?.has_melted_down) return 0;
  const preview = game.coreBridge?.previewUpgrade?.(upgrade.id);
  if (!preview || preview.cost == null || !(preview.cost > 0)) return 0;
  const isEp = preview.currency === "ep" || preview.currency === "exotic_particles";
  const raw = isEp ? game.state.current_exotic_particles : game.state.current_money;
  return Math.min(1, toNumber(raw) / toNumber(preview.cost));
}

function getAffordanceFlags(upgrade, upgradeset, game, settings) {
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
      upgrade.affordable = false;
      upgrade.afford_progress = 0;
      rows.push({ upgrade, flags });
      return;
    }
    upgrade.affordable = flags.affordable;
    upgrade.afford_progress = flags.progress;
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
  projectAllUpgradeCosts(upgradeset);
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

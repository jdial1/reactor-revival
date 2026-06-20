import { toDecimal, toNumber } from "./utils.js";
import { getAffordabilitySettings } from "./state.js";

const partElements = new WeakMap();
const upgradeElements = new WeakMap();

function getPartEl(part) {
  return partElements.get(part) ?? null;
}

function isLiveUpgradeDomNode(el) {
  if (!el || el.nodeType !== 1) return false;
  try {
    return el.isConnected && !!el.closest(".page:not(.hidden)");
  } catch {
    return false;
  }
}

function findLiveUpgradeElement(upgrade) {
  if (typeof document === "undefined" || !upgrade?.id) return null;
  const id = String(upgrade.id).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  const selector = `[data-id="${id}"]`;
  for (const container of document.querySelectorAll(".upgrade-group")) {
    if (!container.isConnected) continue;
    const page = container.closest(".page");
    if (!page || page.classList.contains("hidden")) continue;
    const live = container.querySelector(selector);
    if (live && live.nodeType === 1) return live;
  }
  return null;
}

function getUpgradeEl(upgrade) {
  const cached = upgradeElements.get(upgrade);
  if (isLiveUpgradeDomNode(cached)) return cached;
  if (cached) upgradeElements.delete(upgrade);
  const live = findLiveUpgradeElement(upgrade);
  if (live) upgradeElements.set(upgrade, live);
  return live ?? null;
}

export function bindPartElement(part, el) {
  if (el && el.nodeType === 1) partElements.set(part, el);
  else partElements.delete(part);
}

export function bindUpgradeElement(upgrade, el) {
  if (isLiveUpgradeDomNode(el) || (el && el.nodeType === 1 && el.isConnected)) {
    upgradeElements.set(upgrade, el);
  } else {
    upgradeElements.delete(upgrade);
  }
}

export function getUpgradeElement(upgrade) {
  return getUpgradeEl(upgrade);
}

export function getPartElement(part) {
  return getPartEl(part);
}

function handleUnavailableUpgrade(upgrade) {
  const el = getUpgradeEl(upgrade);
  if (!isLiveUpgradeDomNode(el)) return;
  el.classList.remove("hidden");
  el.classList.add("doctrine-locked");
  upgrade.setAffordable(false);
  upgrade.setAffordProgress(0);
}

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

function computeAffordProgress(upgrade, game, isAffordable) {
  if (isAffordable) return 1;
  if (isMaxLevelOrMeltedDown(upgrade, game)) return 0;
  const pair = getCurrentAndCost(upgrade, game);
  if (!pair) return 0;
  return getProgressRatio(pair.current, pair.cost);
}

function isResearchUpgrade(upgrade) {
  return Boolean(upgrade.base_ecost?.gt?.(0));
}

function applyUpgradeVisibility(upgrade, isAffordable, settings) {
  const el = getUpgradeEl(upgrade);
  if (!isLiveUpgradeDomNode(el)) return { isResearch: false, isInDOM: false, isMaxed: false };
  const isResearch = isResearchUpgrade(upgrade);
  const shouldHideUnaffordable = isResearch ? settings.hideResearch : settings.hideUpgrades;
  const shouldHideMaxed = isResearch ? settings.hideMaxResearch : settings.hideMaxUpgrades;
  const isMaxed = upgrade.level >= upgrade.max_level;
  const isInDOM = el.isConnected;
  const shouldHide =
    (shouldHideUnaffordable && !isAffordable && !isMaxed) || (shouldHideMaxed && isMaxed);
  if (shouldHide) el.classList.add("hidden");
  else el.classList.remove("hidden");
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
      handleUnavailableUpgrade(upgrade);
      return;
    }

    const el = getUpgradeEl(upgrade);
    if (el) el.classList.remove("doctrine-locked");

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

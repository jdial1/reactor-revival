import { numFormat as fmt } from "../../utils/util.js";
import { getIconifyFn, formatDescriptionBulleted, colorizeBonus } from "./tooltipFormatter.js";
import { getUpgradeBonusLines } from "./tooltipUpgradeBonusBuilder.js";
import { getDetailedStats } from "./tooltipStatsBuilder.js";

function buildMobileStatsArray(obj, tile) {
  const stats = [];
  if (obj.upgrade) {
    const isMaxed = obj.level >= obj.max_level;
    stats.push(isMaxed ? "MAX" : `Level ${obj.level}/${obj.max_level}`);
  }
  if (obj.cost !== undefined || obj.upgrade?.cost !== undefined) {
    const cost = obj.cost ?? obj.upgrade?.cost;
    stats.push(
      `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(cost)}`
    );
  }
  if (
    tile?.display_power !== undefined ||
    obj.power !== undefined ||
    obj.base_power !== undefined
  ) {
    const power = tile?.display_power ?? obj.power ?? obj.base_power;
    if (power > 0)
      stats.push(
        `<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(power)}`
      );
  }
  if (
    tile?.display_heat !== undefined ||
    obj.heat !== undefined ||
    obj.base_heat !== undefined
  ) {
    const heat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
    if (heat > 0)
      stats.push(
        `<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(heat, 0)}`
      );
  }
  if (obj.ticks > 0)
    stats.push(
      `<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(obj.ticks)}`
    );
  return stats;
}

function applyMobileStatsToElement(mobileStatsEl, stats, obj) {
  if (!mobileStatsEl) return;
  if (obj.upgrade) {
    mobileStatsEl.style.display = '';
    mobileStatsEl.innerHTML = stats.join(" ");
  } else {
    mobileStatsEl.style.display = 'none';
    mobileStatsEl.innerHTML = '';
  }
}

function applyMobileDescription(descEl, obj, iconify) {
  if (!descEl) return;
  const description = obj.description || obj.upgrade?.description;
  if (description) {
    descEl.innerHTML = formatDescriptionBulleted(description, iconify);
    if (obj.upgrade) descEl.classList.add("is-inset");
  } else {
    descEl.innerHTML = "";
  }
}

function applyMobileBonusLines(contentEl, descEl, obj, tile, game, iconify) {
  const mobileBonusLines = getUpgradeBonusLines(obj, tile, game);
  if (mobileBonusLines.length === 0) return;
  let bonusEl = contentEl.querySelector('[data-role="bonus-lines"]');
  if (!bonusEl) {
    bonusEl = document.createElement('div');
    bonusEl.setAttribute('data-role', 'bonus-lines');
    bonusEl.className = 'tooltip-bonuses';
    descEl?.insertAdjacentElement('afterend', bonusEl);
  }
  bonusEl.innerHTML = mobileBonusLines
    .map(line => `<div class="tooltip-bonus-line">${colorizeBonus(line, iconify)}</div>`)
    .join("");
}

function applyMobileUpgradeStatus(upgradeStatusEl, obj) {
  if (!upgradeStatusEl) return;
  if (obj.upgrade) {
    if (obj.level >= obj.max_level)
      upgradeStatusEl.textContent = "Maximum Level Reached";
    else if (!obj.affordable)
      upgradeStatusEl.innerHTML =
        '<span class="tooltip-mobile-unaffordable">Cannot Afford Upgrade</span>';
    else upgradeStatusEl.textContent = "";
  } else {
    upgradeStatusEl.textContent = "";
  }
}

export function populateMobileTooltip(contentEl, obj, tile, game) {
  const iconify = getIconifyFn();
  const titleEl = contentEl.querySelector('[data-role="title"]');
  if (titleEl) titleEl.textContent = obj.title || obj.upgrade?.title;
  const stats = buildMobileStatsArray(obj, tile);
  applyMobileStatsToElement(
    contentEl.querySelector('[data-role="mobile-stats"]'),
    stats,
    obj
  );
  const descEl = contentEl.querySelector('[data-role="description"]');
  applyMobileDescription(descEl, obj, iconify);
  applyMobileBonusLines(contentEl, descEl, obj, tile, game, iconify);
  applyMobileUpgradeStatus(
    contentEl.querySelector('[data-role="mobile-upgrade-status"]'),
    obj
  );
}

function buildDesktopSummaryItems(obj, tile) {
  const items = [];
  const summaryPower = tile?.display_power ?? obj.power ?? obj.base_power;
  const summaryHeat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
  if (obj.cost !== undefined) {
    items.push(
      `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(obj.cost)}</span>`
    );
  }
  if (summaryPower > 0)
    items.push(
      `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(summaryPower)}</span>`
    );
  if (summaryHeat > 0)
    items.push(
      `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(summaryHeat, 0)}</span>`
    );
  if (obj.base_containment > 0 || obj.containment > 0)
    items.push(
      `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='max heat'>Max: ${fmt(obj.base_containment || obj.containment, 0)}</span>`
    );
  if (obj.ticks > 0)
    items.push(
      `<span class='tooltip-summary-item'><img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(obj.ticks)}</span>`
    );
  return items;
}

function applyDesktopSummary(summaryEl, summaryItems, obj) {
  if (!summaryEl) return;
  if (obj.upgrade) {
    summaryEl.style.display = "";
    summaryEl.innerHTML = summaryItems.join("");
  } else {
    summaryEl.style.display = "none";
    summaryEl.innerHTML = "";
  }
}

function applyDesktopDescription(descEl, obj, iconify) {
  if (!descEl) return;
  const description = obj.description || obj.upgrade?.description;
  if (description) {
    descEl.innerHTML = formatDescriptionBulleted(description, iconify);
    if (obj.upgrade) descEl.classList.add("is-inset");
  } else {
    descEl.innerHTML = "";
  }
}

function applyDesktopBonusLines(contentEl, descEl, obj, tile, game, iconify) {
  const bonusLines = getUpgradeBonusLines(obj, tile, game);
  if (bonusLines.length === 0) return;
  let bonusEl = contentEl.querySelector('[data-role="bonus-lines"]');
  if (!bonusEl) {
    bonusEl = document.createElement("div");
    bonusEl.setAttribute("data-role", "bonus-lines");
    bonusEl.className = "tooltip-bonuses";
    descEl?.insertAdjacentElement("afterend", bonusEl);
  }
  bonusEl.innerHTML = bonusLines
    .map((line) => `<div class="tooltip-bonus-line">${colorizeBonus(line, iconify)}</div>`)
    .join("");
}

function applyDesktopStats(statsEl, stats, iconify) {
  if (!statsEl) return;
  const statsHtml = Array.from(stats.entries())
    .map(([key, value]) => `<dt>${iconify(key)}</dt><dd>${iconify(value)}</dd>`)
    .join("");
  statsEl.innerHTML = statsHtml;
}

export function populateDesktopTooltip(contentEl, obj, tile, game) {
  const iconify = getIconifyFn();
  const titleEl = contentEl.querySelector('[data-role="title"]');
  if (titleEl) titleEl.textContent = obj.title || obj.upgrade?.title;
  const summaryItems = buildDesktopSummaryItems(obj, tile);
  applyDesktopSummary(
    contentEl.querySelector('[data-role="desktop-summary"]'),
    summaryItems,
    obj
  );
  const descEl = contentEl.querySelector('[data-role="description"]');
  applyDesktopDescription(descEl, obj, iconify);
  applyDesktopBonusLines(contentEl, descEl, obj, tile, game, iconify);
  const stats = getDetailedStats(obj, tile, game);
  applyDesktopStats(contentEl.querySelector('[data-role="desktop-stats"]'), stats, iconify);
}

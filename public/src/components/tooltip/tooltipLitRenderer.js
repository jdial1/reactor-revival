import { html } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { getIconifyFn, formatDescriptionBulleted, colorizeBonus } from "./tooltipFormatter.js";
import { getUpgradeBonusLines } from "./tooltipUpgradeBonusBuilder.js";
import { getDetailedStats } from "./tooltipStatsBuilder.js";
import { unsafeHTML, styleMap } from "../../utils/litHelpers.js";

function buildMobileStatsArray(obj, tile) {
  const stats = [];
  if (obj.upgrade) {
    const isMaxed = obj.level >= obj.max_level;
    stats.push(isMaxed ? "MAX" : `Level ${obj.level}/${obj.max_level}`);
  }
  if (obj.cost !== undefined || obj.upgrade?.cost !== undefined) {
    const cost = obj.cost ?? obj.upgrade?.cost;
    stats.push(`<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(cost)}`);
  }
  if (tile?.display_power !== undefined || obj.power !== undefined || obj.base_power !== undefined) {
    const power = tile?.display_power ?? obj.power ?? obj.base_power;
    if (power > 0) stats.push(`<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(power)}`);
  }
  if (tile?.display_heat !== undefined || obj.heat !== undefined || obj.base_heat !== undefined) {
    const heat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
    if (heat > 0) stats.push(`<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(heat, 0)}`);
  }
  if (obj.ticks > 0) stats.push(`<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(obj.ticks)}`);
  return stats;
}

function buildDesktopSummaryItems(obj, tile) {
  const items = [];
  const summaryPower = tile?.display_power ?? obj.power ?? obj.base_power;
  const summaryHeat = tile?.display_heat ?? obj.heat ?? obj.base_heat;
  if (obj.cost !== undefined) items.push(`<span class='tooltip-summary-item'><img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(obj.cost)}</span>`);
  if (summaryPower > 0) items.push(`<span class='tooltip-summary-item'><img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>${fmt(summaryPower)}</span>`);
  if (summaryHeat > 0) items.push(`<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>${fmt(summaryHeat, 0)}</span>`);
  if (obj.base_containment > 0 || obj.containment > 0) items.push(`<span class='tooltip-summary-item'><img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='max heat'>Max: ${fmt(obj.base_containment || obj.containment, 0)}</span>`);
  if (obj.ticks > 0) items.push(`<span class='tooltip-summary-item'><img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>${fmt(obj.ticks)}</span>`);
  return items;
}

function getBuyCostText(obj) {
  if (obj.current_ecost !== undefined) return ` 🧬 ${fmt(obj.current_ecost)} EP`;
  if (obj.ecost !== undefined) return ` 🧬 ${fmt(obj.ecost)} EP`;
  if (obj.base_ecost !== undefined) return ` 🧬 ${fmt(obj.base_ecost)} EP`;
  if (obj.current_cost !== undefined) return ` <img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(obj.current_cost)}`;
  if (obj.cost !== undefined) return ` <img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(obj.cost)}`;
  return "";
}

export function tooltipContentTemplate(obj, tile, game, isMobile, onBuy) {
  if (!obj) return html``;
  const iconify = getIconifyFn();
  const title = obj.title || obj.upgrade?.title || "";

  if (isMobile) {
    const stats = buildMobileStatsArray(obj, tile);
    const statsHtml = obj.upgrade ? stats.join(" ") : "";
    const description = obj.description || obj.upgrade?.description;
    const descHtml = description ? formatDescriptionBulleted(description, iconify) : "";
    const bonusLines = getUpgradeBonusLines(obj, tile, game);
    const bonusHtml = bonusLines.map((line) => `<div class="tooltip-bonus-line">${colorizeBonus(line, iconify)}</div>`).join("");
    let upgradeStatus = "";
    if (obj.upgrade) {
      if (obj.level >= obj.max_level) upgradeStatus = "Maximum Level Reached";
      else if (!obj.affordable) upgradeStatus = '<span class="tooltip-mobile-unaffordable">Cannot Afford Upgrade</span>';
    }
    return html`
      <div data-role="title" class="tooltip-title" style="margin-bottom: 0.5em; font-size: 1.1em; font-weight: bold;">${title}</div>
      <div data-role="mobile-stats" class="tooltip-summary-row" style=${obj.upgrade ? "" : "display: none"}>${unsafeHTML(statsHtml)}</div>
      <p data-role="description" class=${obj.upgrade ? "is-inset" : ""}>${unsafeHTML(descHtml)}</p>
      ${bonusLines.length ? html`<div data-role="bonus-lines" class="tooltip-bonuses">${unsafeHTML(bonusHtml)}</div>` : ""}
      <div data-role="mobile-upgrade-status" style="min-height: 1rem; font-size: 0.7rem;">${unsafeHTML(upgradeStatus)}</div>
      <footer id="tooltip_actions"></footer>
    `;
  }

  const summaryItems = buildDesktopSummaryItems(obj, tile);
  const summaryHtml = obj.upgrade ? summaryItems.join("") : "";
  const description = obj.description || obj.upgrade?.description;
  const descHtml = description ? formatDescriptionBulleted(description, iconify) : "";
  const bonusLines = getUpgradeBonusLines(obj, tile, game);
  const bonusHtml = bonusLines.map((line) => `<div class="tooltip-bonus-line">${colorizeBonus(line, iconify)}</div>`).join("");
  const stats = getDetailedStats(obj, tile, game);
  const statsHtml = Array.from(stats.entries()).map(([k, v]) => `<dt>${iconify(k)}</dt><dd>${iconify(v)}</dd>`).join("");

  const buyBtn = obj.upgrade && obj.level < obj.max_level && onBuy ? html`<button class="" ?disabled=${!obj.affordable} @click=${onBuy}>Buy ${unsafeHTML(getBuyCostText(obj))}</button>` : "";
  return html`
    <div data-role="title" class="tooltip-title" style="margin-bottom: 0.5em; font-size: 1.1em; font-weight: bold;">${title}</div>
    <div data-role="desktop-summary" class="tooltip-summary-row" style=${styleMap({ display: obj.upgrade ? "" : "none" })}>${unsafeHTML(summaryHtml)}</div>
    <p data-role="description" class=${obj.upgrade ? "is-inset" : ""}>${unsafeHTML(descHtml)}</p>
    ${bonusLines.length ? html`<div data-role="bonus-lines" class="tooltip-bonuses">${unsafeHTML(bonusHtml)}</div>` : ""}
    <dl class="tooltip-stats" data-role="desktop-stats">${unsafeHTML(statsHtml)}</dl>
    <footer id="tooltip_actions">${buyBtn}</footer>
  `;
}

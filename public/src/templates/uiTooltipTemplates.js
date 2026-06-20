import { html } from "lit-html";
import { styleMap, unsafeHTML, when } from "../utils.js";

export const tutorialOverlayTemplate = html`
  <div class="tutorial-spotlight-top"></div>
  <div class="tutorial-spotlight-left"></div>
  <div class="tutorial-spotlight-right"></div>
  <div class="tutorial-spotlight-bottom"></div>
  <div class="tutorial-focus-border"></div>
  <div class="tutorial-pointer" aria-hidden="true">
    <svg class="tutorial-pointer-svg" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 4l4 8-2 2 2 10 4-6 4 8 4-12-6-4-4-2-4-4z" fill="rgb(255 220 160)" stroke="rgb(180 140 80)" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>
  </div>
`;

export function tutorialCalloutTemplate(message, onSkip, onHardSkip) {
  return html`
    <div class="tutorial-message">${message}</div>
    <button type="button" class="tutorial-skip-btn" @click=${onSkip}>Skip</button>
    <button type="button" class="tutorial-hard-skip-btn" @click=${onHardSkip}>Hard Skip</button>
  `;
}

export function mobileTooltipContentTemplate({ title, hasUpgrade, statsHtml, descHtml, hasBonusLines, bonusHtml, upgradeStatus }) {
  return html`
    <div data-role="title" class="tooltip-title" style="margin-bottom: 0.5em; font-size: 1.1em; font-weight: bold;">${title}</div>
    <div data-role="mobile-stats" class="tooltip-summary-row" style=${hasUpgrade ? "" : "display: none"}>${unsafeHTML(statsHtml)}</div>
    <p data-role="description" class=${hasUpgrade ? "is-inset" : ""}>${unsafeHTML(descHtml)}</p>
    ${when(hasBonusLines, () => html`<div data-role="bonus-lines" class="tooltip-bonuses">${unsafeHTML(bonusHtml)}</div>`)}
    <div data-role="mobile-upgrade-status" style="min-height: 1rem; font-size: 0.7rem;">${unsafeHTML(upgradeStatus)}</div>
    <footer id="tooltip_actions"></footer>
  `;
}

export function desktopTooltipContentTemplate({ title, hasUpgrade, summaryHtml, descHtml, hasBonusLines, bonusHtml, statsHtml, buyBtn }) {
  return html`
    <div data-role="title" class="tooltip-title" style="margin-bottom: 0.5em; font-size: 1.1em; font-weight: bold;">${title}</div>
    <div data-role="desktop-summary" class="tooltip-summary-row" style=${styleMap({ display: hasUpgrade ? "" : "none" })}>${unsafeHTML(summaryHtml)}</div>
    <p data-role="description" class=${hasUpgrade ? "is-inset" : ""}>${unsafeHTML(descHtml)}</p>
    ${when(hasBonusLines, () => html`<div data-role="bonus-lines" class="tooltip-bonuses">${unsafeHTML(bonusHtml)}</div>`)}
    <dl class="tooltip-stats" data-role="desktop-stats">${unsafeHTML(statsHtml)}</dl>
    <footer id="tooltip_actions">${buyBtn}</footer>
  `;
}

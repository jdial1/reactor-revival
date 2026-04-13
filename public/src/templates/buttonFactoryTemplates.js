import { html, nothing } from "lit-html";
import { repeat } from "../utils.js";

function formatPartDescription(description) {
  return String(description ?? "").replace(/(?<=\.)\s+(?=[A-Z+])/g, "\n");
}

export function upgradeCardTemplate({
  cardClass,
  upgradeId,
  doctrineId,
  doctrineLocked,
  iconPath,
  overlayPath,
  isHeat,
  title,
  isMaxed,
  descContent,
  doctrineIcon,
  header,
  ariaLabel,
  onBuyClick,
  costDisplay,
}) {
  return html`
    <div class=${cardClass}
         data-id=${upgradeId}
         data-doctrine=${doctrineId}
         data-doctrine-locked=${doctrineLocked ? "true" : nothing}>
      <div class="upgrade-header">
        <div class="upgrade-icon-wrapper">
          <div class="image" style="background-image: url('${iconPath}')"></div>
          ${overlayPath ? html`<img class="status-overlay ${isHeat ? "status-heat" : ""}" src=${overlayPath} alt="">` : nothing}
        </div>
        <div class="upgrade-details">
          <div class="upgrade-title">${title}</div>
          <div class="upgrade-description" style="display: ${isMaxed ? "none" : ""}">${descContent}</div>
        </div>
        <div class="upgrade-doctrine-icon" style="background-image: url('${doctrineIcon}')" data-doctrine=${doctrineId}></div>
      </div>
      <div class="upgrade-footer">
        <div class="upgrade-level-info">
          ${header ? html`<span class="level-text cathode-readout">${header}</span>` : html`<span class="level-text cathode-readout"></span>`}
        </div>
        <button class="pixel-btn upgrade-action-btn industrial-btn"
                ?disabled=${doctrineLocked || isMaxed}
                aria-label=${ariaLabel}
                @click=${onBuyClick}>
          <span class="action-text">Buy</span>
          <span class="cost-display cathode-readout">${costDisplay}</span>
        </button>
      </div>
    </div>
  `;
}

export function partDetailsBlockTemplate({
  partTitle,
  stats,
  description,
  bonusLines,
}) {
  return html`
    <div class="part-details">
      <div class="part-details-title">${partTitle}</div>
      <div class="part-details-stats">${stats}</div>
      <div class="part-details-desc">${formatPartDescription(description)}</div>
      <div class="part-details-bonuses">
        ${repeat(bonusLines, (line, index) => `${index}-${line}`, (line) => html`<span class="bonus-line">${line}</span>`)}
      </div>
    </div>
  `;
}

export function partButtonTemplate({
  btnClass,
  id,
  title,
  ariaLabel,
  disabled,
  onClick,
  imagePath,
  costText,
  tierStyle,
  tierProgress,
  partTitle,
  stats,
  description,
  bonusLines,
}) {
  return html`
    <button class=${btnClass}
            id=${id}
            title=${title || nothing}
            aria-label=${ariaLabel}
            ?disabled=${disabled}
            @click=${onClick}>
      <div class="image" style="background-image: url('${imagePath}')"></div>
      <div class="part-price">${costText}</div>
      <div class="tier-progress" style=${tierStyle}>${tierProgress}</div>
      ${partDetailsBlockTemplate({ partTitle, stats, description, bonusLines })}
    </button>
  `;
}

export function partStatIconTemplate({
  src,
  alt,
}) {
  return html`<img src=${src} class="icon-inline" alt=${alt}>`;
}

export function partStatTemplate({
  className,
  content,
}) {
  return html`<span class=${className}>${content}</span>`;
}

export function closeButtonTemplate({
  onClick,
}) {
  return html`
    <button class="modal-close-btn" @click=${onClick}>
      ✖
    </button>
  `;
}

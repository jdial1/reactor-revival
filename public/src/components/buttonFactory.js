import { html, render, nothing } from "lit-html";
import { numFormat } from "../utils/util.js";
import { classMap, styleMap, unsafeHTML } from "../utils/litHelpers.js";
import { getUpgradeBonusLines } from "../core/part/partUpgradeBonusBuilder.js";

function getUpgradeIconOverlay(upgrade) {
  try {
    const classes = Array.isArray(upgrade.upgrade?.classList) ? upgrade.upgrade.classList : [];
    const title = (upgrade.title || "").toLowerCase();
    const desc = (upgrade.description || "").toLowerCase();
    const type = (upgrade.type || upgrade.upgrade?.type || "").toLowerCase();
    const actionId = (upgrade.actionId || upgrade.upgrade?.actionId || "").toLowerCase();

    let iconPath = null;
    let isHeat = false;

    if (classes.includes("cell_perpetual") || title.includes("perpetual") || actionId.includes("perpetual")) {
      iconPath = "img/ui/status/status_infinity.png";
    }

    if (!iconPath && (classes.includes("cell_tick") || title.includes("enriched") || actionId.includes("tick") ||
      desc.includes("tick") || desc.includes("duration") || desc.includes("last") || desc.includes("per second") || title.includes("clock") || title.includes("chronometer"))) {
      iconPath = "img/ui/icons/icon_time.png";
    }

    if (!iconPath) {
      const heatTerms = ["heat", "vent", "exchange", "containment", "hold", "heatsink", "coolant", "thermal", "inlet", "outlet", "exchanger", "venting"];
      const powerTerms = ["power", "potent", "reflection", "transformer", "grid", "capacitor", "capacitance", "accelerator"];
      const hasHeat = heatTerms.some(t => title.includes(t) || desc.includes(t) || type.includes(t) || actionId.includes(t));
      const hasPower = powerTerms.some(t => title.includes(t) || desc.includes(t) || type.includes(t) || actionId.includes(t) || classes.includes("cell_power"));
      if (hasHeat) {
        iconPath = "img/ui/icons/icon_heat.png";
        isHeat = true;
      } else if (hasPower) {
        iconPath = "img/ui/icons/icon_power.png";
      }
    }

    if (!iconPath) iconPath = "img/ui/status/status_star.png";
    return { iconPath, isHeat };
  } catch (_) {
    return { iconPath: null, isHeat: false };
  }
}

export function renderToNode(template) {
  const container = document.createElement("div");
  render(template, container);
  return container.firstElementChild || container;
}

export const StartButton = (disabled, onClick) => html`
  <button id="splash-new-game-btn" class="splash-btn splash-btn-start" ?disabled=${disabled} @click=${onClick}>
    New Game
  </button>
`;

export const LoadGameButtonFullWidth = (saveData, playedTimeStr, isCloudSynced, onClick) => html`
  <button id="splash-load-game-btn" class="splash-btn splash-btn-load splash-btn-full-width" @click=${onClick}>
    <div class="load-game-header"><span>Load Local Game</span></div>
    <div class="load-game-details">
      <div class="money">$${numFormat(saveData?.current_money ?? 0)}</div>
      <div class="played-time">${playedTimeStr}</div>
    </div>
  </button>
`;

export const LoadGameButton = (saveData, playedTimeStr, isCloudSynced, onClick) => html`
  <button id="splash-load-game-btn" class="splash-btn splash-btn-load" @click=${onClick}>
    <div class="load-game-header"><span>Load Local Game</span></div>
    <div class="load-game-details">
      <div class="money">$${numFormat(saveData?.current_money ?? 0)}</div>
      <div class="played-time">${playedTimeStr}</div>
    </div>
    <div class="synced-label" style=${styleMap({ display: isCloudSynced ? "" : "none" })}></div>
  </button>
`;

export const LoadGameUploadRow = (saveData, playedTimeStr, isCloudSynced, onLoadClick, onUploadClick) => html`
  <div class="splash-btn-group">
    <button id="splash-load-game-btn" class="splash-btn splash-btn-load splash-btn-left" @click=${onLoadClick}>
      <div class="load-game-header"><span>Load Local Game</span></div>
      <div class="load-game-details">
        <div class="money">$${numFormat(saveData?.current_money ?? 0)}</div>
        <div class="played-time">${playedTimeStr}</div>
      </div>
      <div class="synced-label" style=${styleMap({ display: isCloudSynced ? "" : "none" })}></div>
    </button>
    <button id="splash-upload-option-btn" class="splash-btn splash-btn-cloud upload-option-button splash-btn-right" title="Upload local save to Google Drive" @click=${onUploadClick}>
      <div class="upload-text">Upload</div>
    </button>
  </div>
`;

export const BuyButton = (upgrade, onClick) => {
  const isEp = upgrade?.erequires || (upgrade?.base_ecost != null && Number(upgrade.base_ecost) > 0);
  const costDisplay = isEp ? `${upgrade.current_ecost ?? 0} 🧬 EP` : (upgrade?.display_cost ?? upgrade?.current_cost ?? "");
  const ariaLabel = upgrade?.title ? `Buy ${upgrade.title}` : "Buy";
  const disabled = upgrade ? !upgrade.affordable : false;
  return html`
    <button class="pixel-btn" ?disabled=${disabled} aria-label=${ariaLabel} @click=${onClick}>
      Buy
      <img src="img/ui/icons/icon_cash.png" class="icon-inline" alt="cash" style=${styleMap({ display: isEp ? "none" : "" })} />
      <span class="cost-text">${costDisplay}</span>
    </button>
  `;
};

export const TooltipCloseButton = (onClick) => html`
  <button id="tooltip_close_btn" title="Close" aria-label="Close tooltip" @click=${onClick}>×</button>
`;

export const HelpButton = (onClick, title = "Click for information") => html`
  <button class="help-btn" title=${title} aria-label=${title} @click=${onClick}>?</button>
`;

export const UploadToCloudButton = (onClick) => html`
  <button class="splash-btn splash-btn-cloud upload-option-button" @click=${onClick}>
    <div class="upload-text">Upload</div>
  </button>
`;

export const LoadFromCloudButton = (onClick) => html`
  <button id="splash-load-cloud-btn" class="splash-btn splash-btn-cloud" @click=${onClick}>
    Load Cloud Save
  </button>
`;

export const GoogleSignInButton = (onClick) => html`
  <button id="splash-signin-btn" class="splash-btn splash-btn-google google-signin-button" @click=${onClick}>
    <span>Google Sign In</span>
  </button>
`;

export const GoogleSignOutButton = (onClick) => html`
  <button id="splash-signout-btn" class="splash-btn splash-btn-cloud google-signout-button" @click=${onClick}>
    Sign Out
  </button>
`;

export const CloudSaveButton = (saveData, playedTimeStr, onClick) => html`
  <button class="contrast splash-cloud-button" @click=${onClick}>
    <div class="load-game-header">Load Cloud Save</div>
    <div class="load-game-details">
      <div class="money">$${numFormat(saveData?.current_money ?? 0)}</div>
      <div class="played-time">${playedTimeStr}</div>
    </div>
  </button>
`;

export const LoadingButton = (text, spinnerClass = "loading-spinner") => html`
  <button class="splash-btn splash-btn-load" disabled>
    <div class="loading-container">
      <div class=${spinnerClass}></div>
      <span class="loading-text">${text ?? ""}</span>
    </div>
  </button>
`;

export const InstallButton = (onClick) => html`
  <button class="contrast" @click=${onClick}>Install App</button>
`;

const BASE_DOCTRINE_ICON = "img/ui/status/status_star.png";

function getDoctrineIcon(upgrade, doctrineSource) {
  if (typeof doctrineSource === "string") return { icon: doctrineSource, id: "base" };
  if (typeof doctrineSource === "function") {
    const d = doctrineSource(upgrade.id);
    return { icon: d?.icon ?? BASE_DOCTRINE_ICON, id: d?.id ?? "base" };
  }
  return { icon: BASE_DOCTRINE_ICON, id: "base" };
}

export const UpgradeCard = (upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick } = {}) => {
  const isMaxed = upgrade.level >= upgrade.max_level;
  const { icon: doctrineIcon, id: doctrineId } = getDoctrineIcon(upgrade, doctrineSource);
  const doctrineLocked = upgrade.game?.upgradeset && !upgrade.game.upgradeset.isUpgradeAvailable(upgrade.id);
  const isSandbox = !!upgrade.game?.isSandbox;
  const header = isMaxed ? "MAX" : `Level ${upgrade.level}/${upgrade.max_level}`;
  const rawDesc = isMaxed ? "" : (upgrade.description || "");
  const descHtml = upgrade.game?.ui?.stateManager ? upgrade.game.ui.stateManager.addPartIconsToTitle(rawDesc) : rawDesc;
  const costDisplay = isMaxed ? "" : (upgrade.display_cost ?? upgrade.cost ?? "");
  const ariaLabel = doctrineLocked
    ? `Locked – ${upgrade.game?.upgradeset?.getDoctrineForUpgrade(upgrade.id)?.title || upgrade.game?.upgradeset?.getDoctrineForUpgrade(upgrade.id)?.id || "other doctrine"}`
    : isMaxed ? `${upgrade.title} is maxed out` : `Buy ${upgrade.title} for ${costDisplay}`;
  const iconPath = upgrade.upgrade?.icon ?? upgrade.icon ?? "img/ui/status/status_star.png";
  const { iconPath: overlayPath, isHeat } = getUpgradeIconOverlay(upgrade);
  const extraClasses = (upgrade.upgrade?.classList ?? []).join(" ");
  const cardClassMap = { "upgrade-card": true, "doctrine-locked": doctrineLocked, unaffordable: doctrineLocked };
  extraClasses.split(" ").filter(Boolean).forEach((c) => (cardClassMap[c] = true));
  const cardClass = classMap(cardClassMap);
  return html`
    <div class=${cardClass}
         data-id=${upgrade.id}
         data-doctrine=${doctrineId}
         data-doctrine-locked=${doctrineLocked ? "true" : nothing}>
      <div class="upgrade-header">
        <div class="upgrade-icon-wrapper">
          <div class="image" style="background-image: url('${iconPath}')"></div>
          ${overlayPath ? html`<img class="status-overlay ${isHeat ? "status-heat" : ""}" src=${overlayPath} alt="">` : nothing}
        </div>
        <div class="upgrade-details">
          <div class="upgrade-title">${upgrade.title}</div>
          <div class="upgrade-description" style=${styleMap({ display: isMaxed ? "none" : "" })}>${unsafeHTML(descHtml)}</div>
        </div>
        <div class="upgrade-doctrine-icon" style="background-image: url('${doctrineIcon}')" data-doctrine=${doctrineId}></div>
      </div>
      <div class="upgrade-footer">
        <div class="upgrade-level-info">
          <span class="level-text">${header}</span>
        </div>
        <button class="pixel-btn upgrade-action-btn"
                ?disabled=${doctrineLocked || isMaxed}
                aria-label=${ariaLabel}
                @click=${onBuyClick}>
          <span class="action-text">Buy</span>
          <span class="cost-display">${costDisplay}</span>
        </button>
        <div class="sandbox-upgrade-actions" style=${styleMap({ display: isSandbox ? "" : "none" })}>
          <button class="pixel-btn sandbox-buy-max-btn" type="button" @click=${onBuyMaxClick ?? (() => {})}>Buy Max</button>
          <button class="pixel-btn sandbox-reset-btn" type="button" @click=${onResetClick ?? (() => {})}>Reset</button>
        </div>
      </div>
    </div>
  `;
};

function buildPartStats(part) {
  const fmt = numFormat;
  const cashIcon = html`<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='$'>`;
  const powerIcon = html`<img src='img/ui/icons/icon_power.png' class='icon-inline' alt='pwr'>`;
  const heatIcon = html`<img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>`;
  const tickIcon = html`<img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>`;
  const stats = [];
  if (part.erequires) {
    stats.push(html`<span class="stat-cost">${fmt(part.cost)} EP</span>`);
  } else {
    stats.push(html`<span class="stat-cost">${cashIcon}${fmt(part.cost)}</span>`);
  }
  if (part.power > 0) stats.push(html`<span class="stat-power">${powerIcon}${fmt(part.power)}</span>`);
  if (part.heat > 0) stats.push(html`<span class="stat-heat">${heatIcon}${fmt(part.heat, 0)}</span>`);
  if (part.vent > 0) stats.push(html`<span class="stat-vent">${fmt(part.vent, 0)} vent</span>`);
  if (part.containment > 0) stats.push(html`<span class="stat-cont">${heatIcon}${fmt(part.containment, 0)} cap</span>`);
  if (part.transfer > 0) stats.push(html`<span class="stat-xfer">${fmt(part.transfer, 0)} xfer</span>`);
  if (part.ticks > 0) stats.push(html`<span class="stat-tick">${tickIcon}${fmt(part.ticks)}</span>`);
  if (part.reactor_power > 0) stats.push(html`<span class="stat-rpower">${powerIcon}${fmt(part.reactor_power)} cap</span>`);
  if (part.power_increase > 0) stats.push(html`<span class="stat-boost">+${fmt(part.power_increase)}%${powerIcon}</span>`);
  return stats;
}

export const PartButton = (part, onClick, onMouseEnter = () => {}, onMouseLeave = () => {}, opts = {}) => {
  const costText = part.erequires ? `${numFormat(part.cost)} EP` : numFormat(part.cost);
  const locked = opts.locked ?? false;
  const doctrineLocked = opts.doctrineLocked ?? false;
  const tierProgress = opts.tierProgress ?? "";
  const partActive = opts.partActive ?? false;
  const btnClass = classMap({
    part: true,
    "pixel-btn": true,
    "is-square": true,
    part_active: partActive,
    [part.className]: !!part.className,
    [`part_${part.id}`]: true,
    [`category_${part.category}`]: !!part.category,
    unaffordable: !part.affordable,
    "locked-by-tier": locked,
    "doctrine-locked": doctrineLocked,
  });
  const tierStyle = styleMap({ display: locked ? "block" : "none" });
  const stats = buildPartStats(part);
  const bonusLines = getUpgradeBonusLines(part, { tile: null, game: part.game });
  const bonusHtml = bonusLines.length > 0
    ? bonusLines.map((line) => `<span class="bonus-line">${line}</span>`).join("")
    : "";
  return html`
    <button class=${btnClass}
            id="part_btn_${part.id}"
            title=${part.title || ""}
            aria-label="${part.title || "Part button"}, Cost: ${costText}"
            ?disabled=${!part.affordable || locked}
            @click=${onClick}
            @mouseenter=${onMouseEnter}
            @mouseleave=${onMouseLeave}>
      <div class="image" style="background-image: url('${part.getImagePath()}')"></div>
      <div class="part-price">${costText}</div>
      <div class="tier-progress" style=${tierStyle}>${tierProgress}</div>
      <div class="part-details">
        <div class="part-details-title">${part.title || ""}</div>
        <div class="part-details-stats">${stats}</div>
        <div class="part-details-desc">${part.description || ""}</div>
        <div class="part-details-bonuses">${bonusHtml ? unsafeHTML(bonusHtml) : nothing}</div>
      </div>
    </button>
  `;
};

export const CloseButton = (modal, onClick) => html`
  <button class="modal-close-btn" @click=${onClick}>
    ✖
  </button>
`;

export function createNewGameButton(onClick) {
  return renderToNode(StartButton(false, onClick));
}

export function createLoadGameButton(saveData, playedTimeStr, isCloudSynced, onClick) {
  return renderToNode(LoadGameButton(saveData, playedTimeStr, isCloudSynced, onClick));
}

export function createLoadGameButtonFullWidth(saveData, playedTimeStr, isCloudSynced, onClick) {
  return renderToNode(LoadGameButtonFullWidth(saveData, playedTimeStr, isCloudSynced, onClick));
}

export function createUploadToCloudButton(onClick) {
  return renderToNode(UploadToCloudButton(onClick));
}

export function createLoadFromCloudButton(onClick) {
  return renderToNode(LoadFromCloudButton(onClick));
}

export function createGoogleSignInButton(onClick) {
  return renderToNode(GoogleSignInButton(onClick));
}

export function createGoogleSignOutButton(onClick) {
  return renderToNode(GoogleSignOutButton(onClick));
}

export function createLoadGameUploadRow(saveData, playedTimeStr, isCloudSynced, onLoadClick, onUploadClick) {
  return renderToNode(LoadGameUploadRow(saveData, playedTimeStr, isCloudSynced, onLoadClick, onUploadClick));
}

export function createTooltipCloseButton(onClick) {
  return renderToNode(TooltipCloseButton(onClick));
}

export function createHelpButton(onClick, title = "Click for information") {
  return renderToNode(HelpButton(onClick, title));
}

export function createUpgradeButton(upgrade, doctrineSource) {
  return renderToNode(UpgradeCard(upgrade, doctrineSource, () => {}));
}

export function createPartButton(part) {
  return renderToNode(PartButton(part, () => {}));
}

export function createBuyButton(upgrade, onClick) {
  return renderToNode(BuyButton(upgrade, onClick));
}

export function createCloudSaveButton(saveData, playedTimeStr, onClick) {
  return renderToNode(CloudSaveButton(saveData, playedTimeStr, onClick));
}

export function createLoadingButton(text, spinnerClass = "loading-spinner") {
  return renderToNode(LoadingButton(text, spinnerClass));
}

export function createGoogleSignInButtonWithIcon(onClick = () => {}) {
  const template = html`
    <button @click=${onClick}>
      <div class="google-signin-container">
        <svg width="24" height="24" viewBox="0 0 24 24" class="google-icon">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        <span>Google Sign In</span>
      </div>
    </button>
  `;
  return renderToNode(template);
}

export function createInstallButton(onClick) {
  return renderToNode(InstallButton(onClick));
}

export function createCloseButton(modal) {
  return renderToNode(CloseButton(modal, () => modal.remove()));
}

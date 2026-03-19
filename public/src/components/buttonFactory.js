import { html, render, nothing } from "lit-html";
import { numFormat, classMap, styleMap, unsafeHTML } from "../utils.js";
import { getUpgradeBonusLines } from "../logic.js";
import { interpolateTemplate } from "../templates/templateUtils.js";
import {
  startButtonTemplate,
  loadGameButtonFullWidthTemplate,
  loadGameButtonTemplate,
  loadGameUploadRowTemplate,
  tooltipCloseButtonTemplate,
  helpButtonTemplate,
  uploadToCloudButtonTemplate,
  loadFromCloudButtonTemplate,
  googleSignInButtonTemplate,
  googleSignOutButtonTemplate,
  cloudSaveButtonTemplate,
  loadingButtonTemplate,
  installButtonTemplate,
  googleSignInIconButtonTemplate,
} from "../templates/buttonTemplates.js";
import {
  upgradeCardTemplate,
  partButtonTemplate,
  partStatIconTemplate,
  partStatTemplate,
  closeButtonTemplate,
  googleSignInIconButtonWrapperTemplate,
} from "../templates/buttonFactoryTemplates.js";

function toTemplateHtml(template, values) {
  return unsafeHTML(interpolateTemplate(template, values));
}

function withTemplateTarget(e, selector, onClick) {
  const target = e.target.closest(selector);
  if (!target) return;
  const wrappedEvent = Object.create(e);
  Object.defineProperty(wrappedEvent, "currentTarget", { value: target });
  onClick(wrappedEvent);
}

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
  <span @click=${(e) => withTemplateTarget(e, "#splash-new-game-btn", onClick)}>
    ${toTemplateHtml(startButtonTemplate, { disabledAttr: disabled ? " disabled" : "" })}
  </span>
`;

export const LoadGameButtonFullWidth = (saveData, playedTimeStr, isCloudSynced, onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "#splash-load-game-btn", onClick)}>
    ${toTemplateHtml(loadGameButtonFullWidthTemplate, {
      currentMoney: numFormat(saveData?.current_money ?? 0),
      playedTime: playedTimeStr,
    })}
  </span>
`;

export const LoadGameButton = (saveData, playedTimeStr, isCloudSynced, onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "#splash-load-game-btn", onClick)}>
    ${toTemplateHtml(loadGameButtonTemplate, {
      currentMoney: numFormat(saveData?.current_money ?? 0),
      playedTime: playedTimeStr,
      syncedStyle: isCloudSynced ? "" : "display:none;",
    })}
  </span>
`;

export const LoadGameUploadRow = (saveData, playedTimeStr, isCloudSynced, onLoadClick, onUploadClick) => html`
  <span
    @click=${(e) => {
      withTemplateTarget(e, "#splash-load-game-btn", onLoadClick);
      withTemplateTarget(e, "#splash-upload-option-btn", onUploadClick);
    }}
  >
    ${toTemplateHtml(loadGameUploadRowTemplate, {
      currentMoney: numFormat(saveData?.current_money ?? 0),
      playedTime: playedTimeStr,
      syncedStyle: isCloudSynced ? "" : "display:none;",
    })}
  </span>
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
  <span @click=${(e) => withTemplateTarget(e, "#tooltip_close_btn", onClick)}>
    ${toTemplateHtml(tooltipCloseButtonTemplate)}
  </span>
`;

export const HelpButton = (onClick, title = "Click for information") => html`
  <span @click=${(e) => withTemplateTarget(e, "button.help-btn", onClick)}>
    ${toTemplateHtml(helpButtonTemplate, { title })}
  </span>
`;

export const UploadToCloudButton = (onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "button.upload-option-button", onClick)}>
    ${toTemplateHtml(uploadToCloudButtonTemplate)}
  </span>
`;

export const LoadFromCloudButton = (onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "#splash-load-cloud-btn", onClick)}>
    ${toTemplateHtml(loadFromCloudButtonTemplate)}
  </span>
`;

export const GoogleSignInButton = (onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "#splash-signin-btn", onClick)}>
    ${toTemplateHtml(googleSignInButtonTemplate)}
  </span>
`;

export const GoogleSignOutButton = (onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "#splash-signout-btn", onClick)}>
    ${toTemplateHtml(googleSignOutButtonTemplate)}
  </span>
`;

export const CloudSaveButton = (saveData, playedTimeStr, onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "button.splash-cloud-button", onClick)}>
    ${toTemplateHtml(cloudSaveButtonTemplate, {
      currentMoney: numFormat(saveData?.current_money ?? 0),
      playedTime: playedTimeStr,
    })}
  </span>
`;

export const LoadingButton = (text, spinnerClass = "loading-spinner") => html`
  ${toTemplateHtml(loadingButtonTemplate, { spinnerClass, text: text ?? "" })}
`;

export const InstallButton = (onClick) => html`
  <span @click=${(e) => withTemplateTarget(e, "button.contrast", onClick)}>
    ${toTemplateHtml(installButtonTemplate)}
  </span>
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

export const UpgradeCard = (upgrade, doctrineSource, onBuyClick, { onBuyMaxClick, onResetClick, useReactiveLevelAndCost } = {}) => {
  const isMaxed = upgrade.level >= upgrade.max_level;
  const { icon: doctrineIcon, id: doctrineId } = getDoctrineIcon(upgrade, doctrineSource);
  const doctrineLocked = upgrade.game?.upgradeset && !upgrade.game.upgradeset.isUpgradeAvailable(upgrade.id);
  const isSandbox = !!upgrade.game?.isSandbox;
  const header = useReactiveLevelAndCost ? "" : (isMaxed ? "MAX" : `Level ${upgrade.level}/${upgrade.max_level}`);
  const rawDesc = isMaxed ? "" : (upgrade.description || "");
  const descHtml = upgrade.game?.ui?.stateManager ? upgrade.game.ui.stateManager.addPartIconsToTitle(rawDesc) : rawDesc;
  const costDisplay = useReactiveLevelAndCost ? "" : (isMaxed ? "" : (upgrade.display_cost ?? upgrade.cost ?? ""));
  const ariaLabel = doctrineLocked
    ? `Locked – ${upgrade.game?.upgradeset?.getDoctrineForUpgrade(upgrade.id)?.title || upgrade.game?.upgradeset?.getDoctrineForUpgrade(upgrade.id)?.id || "other doctrine"}`
    : isMaxed ? `${upgrade.title} is maxed out` : `Buy ${upgrade.title} for ${costDisplay}`;
  const iconPath = upgrade.upgrade?.icon ?? upgrade.icon ?? "img/ui/status/status_star.png";
  const { iconPath: overlayPath, isHeat } = getUpgradeIconOverlay(upgrade);
  const extraClasses = (upgrade.upgrade?.classList ?? []).join(" ");
  const cardClassMap = { "upgrade-card": true, "doctrine-locked": doctrineLocked, unaffordable: doctrineLocked };
  extraClasses.split(" ").filter(Boolean).forEach((c) => (cardClassMap[c] = true));
  const cardClass = classMap(cardClassMap);
  return upgradeCardTemplate({
    cardClass,
    upgradeId: upgrade.id,
    doctrineId,
    doctrineLocked,
    iconPath,
    overlayPath,
    isHeat,
    title: upgrade.title,
    isMaxed,
    descContent: unsafeHTML(descHtml),
    doctrineIcon,
    header,
    ariaLabel,
    onBuyClick,
    costDisplay,
    isSandbox,
    onBuyMaxClick,
    onResetClick,
  });
};

function buildPartStats(part) {
  const fmt = numFormat;
  const cashIcon = partStatIconTemplate({ src: "img/ui/icons/icon_cash.png", alt: "$" });
  const powerIcon = partStatIconTemplate({ src: "img/ui/icons/icon_power.png", alt: "pwr" });
  const heatIcon = partStatIconTemplate({ src: "img/ui/icons/icon_heat.png", alt: "heat" });
  const tickIcon = partStatIconTemplate({ src: "img/ui/icons/icon_time.png", alt: "tick" });
  const stats = [];
  if (part.erequires) {
    stats.push(partStatTemplate({ className: "stat-cost", content: `${fmt(part.cost)} EP` }));
  } else {
    stats.push(partStatTemplate({ className: "stat-cost", content: html`${cashIcon}${fmt(part.cost)}` }));
  }
  if (part.power > 0) stats.push(partStatTemplate({ className: "stat-power", content: html`${powerIcon}${fmt(part.power)}` }));
  if (part.heat > 0) stats.push(partStatTemplate({ className: "stat-heat", content: html`${heatIcon}${fmt(part.heat, 0)}` }));
  if (part.vent > 0) stats.push(partStatTemplate({ className: "stat-vent", content: `${fmt(part.vent, 0)} vent` }));
  if (part.containment > 0) stats.push(partStatTemplate({ className: "stat-cont", content: html`${heatIcon}${fmt(part.containment, 0)} cap` }));
  if (part.transfer > 0) stats.push(partStatTemplate({ className: "stat-xfer", content: `${fmt(part.transfer, 0)} xfer` }));
  if (part.ticks > 0) stats.push(partStatTemplate({ className: "stat-tick", content: html`${tickIcon}${fmt(part.ticks)}` }));
  if (part.reactor_power > 0) stats.push(partStatTemplate({ className: "stat-rpower", content: html`${powerIcon}${fmt(part.reactor_power)} cap` }));
  if (part.power_increase > 0) stats.push(partStatTemplate({ className: "stat-boost", content: html`+${fmt(part.power_increase)}%${powerIcon}` }));
  return stats;
}

export const PartButton = (part, onClick, opts = {}) => {
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
  return partButtonTemplate({
    btnClass,
    id: `part_btn_${part.id}`,
    title: part.title || "",
    ariaLabel: `${part.title || "Part button"}, Cost: ${costText}`,
    disabled: !part.affordable || locked,
    onClick,
    imagePath: part.getImagePath(),
    costText,
    tierStyle,
    tierProgress,
    partTitle: part.title || "",
    stats,
    description: part.description || "",
    bonusLines,
  });
};

export const CloseButton = (modal, onClick) => closeButtonTemplate({ onClick });

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
  const template = googleSignInIconButtonWrapperTemplate({
    onWrapperClick: (e) => withTemplateTarget(e, "button", onClick),
    iconButtonContent: toTemplateHtml(googleSignInIconButtonTemplate),
  });
  return renderToNode(template);
}

export function createInstallButton(onClick) {
  return renderToNode(InstallButton(onClick));
}

export function createCloseButton(modal) {
  return renderToNode(CloseButton(modal, () => modal.remove()));
}

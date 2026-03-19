import { html, render } from "lit-html";
import { StorageUtils, numFormat as fmt, unsafeHTML, logger, MOBILE_BREAKPOINT_PX, BaseComponent } from "../utils.js";
import { getUpgradeBonusLines as getUpgradeBonusLinesCore } from "../logic.js";
import {
  tutorialOverlayTemplate,
  tutorialCalloutTemplate,
  mobileTooltipContentTemplate,
  desktopTooltipContentTemplate,
} from "../templates/uiTooltipTemplates.js";

function renderTutorialCallout(container, message, onSkip, onHardSkip) {
  if (!container?.isConnected) return;
  try {
    render(tutorialCalloutTemplate(message, onSkip, onHardSkip), container);
  } catch (_) {}
}

const TUTORIAL_STEP_KEY = "reactorTutorialStep";
const TUTORIAL_HARD_SKIP_KEY = "reactorTutorialHardSkipped";

const CLAIM_STEP = {
  key: "claim_objective",
  message: "Click Claim to complete the objective",
  onEnter(game) {
    const toast = document.getElementById("objectives_toast_btn");
    const uiState = game?.ui?.uiState;
    if (uiState && !uiState.objectives_toast_expanded) {
      uiState.objectives_toast_expanded = true;
    } else if (toast && !toast.classList.contains("is-expanded")) {
      toast.classList.add("is-expanded");
      toast.setAttribute("aria-expanded", "true");
    }
  },
};

export class TutorialManager {
  constructor(game) {
    this.game = game;
    this.currentStep = -1;
    this.overlay = null;
    this.callout = null;
    this._resumeStepIndex = null;
    this._claimStepActive = false;
    this.isMobile = () => typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    this.steps = [
      {
        key: "place_cell",
        message: "Click to select your Uranium Cell",
        mobileMessage: "Tap to select your Uranium Cell",
        completion: () => this.game?.ui?.stateManager?.getClickedPart()?.id === "uranium1",
        onEnter: () => {},
      },
      {
        key: "place_on_reactor",
        message: "Place the cell on the reactor grid",
        completion: () =>
          this.game?.tileset?.active_tiles_list?.some(
            (t) => t.part?.category === "cell"
          ),
        onEnter: () => {},
      },
      {
        key: "see_heat_rise",
        message: "Watch heat rise as your cell generates power",
        completion: () => (this.game?.reactor?.current_heat ?? 0) > 0,
        onEnter: () => {
          if (this.game?.paused) this.game.resume();
        },
      },
      {
        key: "sell_power",
        message: "Sell your power for credits",
        completion: () => this.game?.sold_power === true,
        onEnter: () => {},
      },
      {
        key: "place_vent",
        message: "Place a Heat Vent to cool the cell",
        mobileMessage: "Tap to select the Heat Vent, then place it",
        completion: () =>
          this.game?.tileset?.active_tiles_list?.some(
            (t) => t.part?.category === "vent"
          ),
        onEnter: () => {
          if (!this.isMobile()) this.ensureHeatTabAndPanel();
        },
      },
    ];
  }

  ensurePartsPanelOpen(expand) {
    const section = document.getElementById("parts_section");
    const tabPower = document.getElementById("tab_power");
    const ui = this.game?.ui;
    const collapsed = ui?.uiState?.parts_panel_collapsed ?? section?.classList.contains("collapsed");
    if (collapsed && expand) {
      if (ui?.uiState) ui.uiState.parts_panel_collapsed = false;
      else if (section) section.classList.remove("collapsed");
      if (section?.previousElementSibling?.id === "control_deck_build_fab") return;
      if (ui?.partsPanelUI?.updatePartsPanelBodyClass) ui.partsPanelUI.updatePartsPanelBodyClass();
    }
    if (tabPower && !tabPower.classList.contains("active")) {
      tabPower.click();
    }
  }

  ensureHeatTabAndPanel() {
    this.ensurePartsPanelOpen(true);
    const tabHeat = document.getElementById("tab_heat");
    if (tabHeat && !tabHeat.classList.contains("active")) {
      tabHeat.click();
    }
  }

  hasClaimableObjective() {
    if (this.game?.isSandbox) return false;
    const def = this.game?.objectives_manager?.current_objective_def;
    return !!def?.completed;
  }

  persistStep(stepIndex) {
    if (stepIndex >= 0 && stepIndex < this.steps.length) {
      StorageUtils.set(TUTORIAL_STEP_KEY, stepIndex);
    }
  }

  clearPersistedStep() {
    StorageUtils.remove(TUTORIAL_STEP_KEY);
  }

  getSelectorForStep(step) {
    if (step.selector) return step.selector;
    if (typeof step.getSelector === "function") return step.getSelector();
    return null;
  }

  getTargetElement(step) {
    if (step.key === "claim_objective") {
      const el = this.game?.ui?.getTutorialTarget?.("claim_objective");
      if (el) return el;
    }
    if (step.key && this.game?.ui?.getTutorialTarget) {
      const el = this.game.ui.getTutorialTarget(step.key);
      if (el) return el;
    }
    const sel = this.getSelectorForStep(step);
    return sel ? document.querySelector(sel) : null;
  }

  getGridTileForStep(step) {
    if (step.gridTile && typeof step.gridTile.row === "number" && typeof step.gridTile.col === "number")
      return step.gridTile;
    if (step.key && this.game?.ui?.getTutorialGridTile)
      return this.game.ui.getTutorialGridTile(step.key);
    return null;
  }

  getTileRectForStep(step) {
    const tile = this.getGridTileForStep(step);
    if (!tile || !this.game?.ui?.getTileRectInViewport) return null;
    return this.game.ui.getTileRectInViewport(tile.row, tile.col);
  }

  updatePointer(tileRect) {
    if (!this.pointer) return;
    if (!tileRect) {
      this.pointer.classList.remove("visible");
      return;
    }
    const centerX = tileRect.left + tileRect.width / 2;
    const centerY = tileRect.top + tileRect.height / 2;
    const tipOffsetX = 10;
    const tipOffsetY = 28;
    this.pointer.style.left = `${centerX - tipOffsetX}px`;
    this.pointer.style.top = `${centerY - tipOffsetY}px`;
    this.pointer.classList.add("visible");
  }

  createOverlay() {
    if (this.overlay) return;
    this.overlay = document.createElement("div");
    this.overlay.id = "tutorial-overlay";
    this.overlay.className = "tutorial-overlay";
    render(tutorialOverlayTemplate, this.overlay);
    this.pointer = this.overlay.querySelector(".tutorial-pointer");
    this.callout = document.createElement("div");
    this.callout.id = "tutorial-callout";
    this.callout.className = "tutorial-callout";
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.callout);
  }

  updateSpotlight(rect) {
    if (!this.overlay) return;
    const padding = 8;
    const r = {
      top: Math.max(0, rect.top - padding),
      left: Math.max(0, rect.left - padding),
      width: rect.width + padding * 2,
      height: rect.height + padding * 2,
    };
    r.right = r.left + r.width;
    r.bottom = r.top + r.height;
    const [top, left, right, bottom] = this.overlay.children;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const focusBorder = this.overlay.querySelector(".tutorial-focus-border");
    top.style.cssText = `top:0;left:0;width:100%;height:${r.top}px`;
    left.style.cssText = `top:${r.top}px;left:0;width:${r.left}px;height:${r.height}px`;
    right.style.cssText = `top:${r.top}px;left:${r.right}px;width:${w - r.right}px;height:${r.height}px`;
    bottom.style.cssText = `top:${r.bottom}px;left:0;width:100%;height:${h - r.bottom}px`;
    if (focusBorder) focusBorder.style.cssText = `top:${r.top}px;left:${r.left}px;width:${r.width}px;height:${r.height}px`;
  }

  updateCallout(message, targetRect) {
    if (!this.callout) return;
    renderTutorialCallout(this.callout, message, () => this.skip(), () => this.hardSkip());
    const rect = this.callout.getBoundingClientRect();
    let top = 16;
    let left = 16;
    if (targetRect) {
      if (targetRect.bottom + rect.height + 12 < window.innerHeight) {
        top = targetRect.bottom + 12;
        left = targetRect.left + (targetRect.width - rect.width) / 2;
      } else if (targetRect.top - rect.height - 12 > 0) {
        top = targetRect.top - rect.height - 12;
        left = targetRect.left + (targetRect.width - rect.width) / 2;
      }
    }
    this.callout.style.top = `${Math.max(8, top)}px`;
    this.callout.style.left = `${Math.max(8, Math.min(left, window.innerWidth - rect.width - 8))}px`;
  }

  showStep(stepIndex) {
    const step = this.steps[stepIndex];
    if (!step) return this.complete();
    this.currentStep = stepIndex;
    if (typeof step.onEnter === "function") step.onEnter();
    const target = this.getTargetElement(step);
    if (!target) {
      this.advance();
      return;
    }
    this.createOverlay();
    this.overlay.classList.add("visible");
    this.callout.classList.add("visible");
    const message = (this.isMobile() && step.mobileMessage) ? step.mobileMessage : step.message;
    const tileRect = this.getTileRectForStep(step);
    const useGridTile = !!tileRect;
    const update = () => {
      const rect = useGridTile ? this.getTileRectForStep(step) : target.getBoundingClientRect();
      if (!rect) return;
      this.updateSpotlight(rect);
      this.updateCallout(message, rect);
      this.updatePointer(useGridTile ? rect : null);
    };
    update();
    this._resizeListener = () => update();
    this._scrollListener = () => update();
    window.addEventListener("resize", this._resizeListener);
    window.addEventListener("scroll", this._scrollListener, true);
  }

  hideSpotlight() {
    this.updatePointer(null);
    if (this.overlay) this.overlay.classList.remove("visible");
    if (this.callout) this.callout.classList.remove("visible");
    window.removeEventListener("resize", this._resizeListener);
    window.removeEventListener("scroll", this._scrollListener, true);
  }

  advance() {
    this.advanceFrom(this.currentStep);
  }

  advanceFrom(fromIndex) {
    this.hideSpotlight();
    const next = fromIndex + 1;
    if (next >= this.steps.length) return this.complete().catch(() => {});
    this.persistStep(next);
    if (this.hasClaimableObjective()) {
      this._resumeStepIndex = next;
      this._claimStepActive = true;
      this.showClaimStep();
    } else {
      this.showStep(next);
    }
  }

  showClaimStep() {
    this.currentStep = -1;
    document.body.classList.add("tutorial-claim-step");
    CLAIM_STEP.onEnter(this.game);
    const target = this.game?.ui?.getTutorialTarget?.("claim_objective");
    if (!target) {
      document.body.classList.remove("tutorial-claim-step");
      this._claimStepActive = false;
      if (this._resumeStepIndex !== null) {
        const next = this._resumeStepIndex;
        this._resumeStepIndex = null;
        this.showStep(next);
      }
      return;
    }
    this.createOverlay();
    this.overlay.classList.add("visible");
    this.callout.classList.add("visible");
    const update = () => {
      const t = this.game?.ui?.getTutorialTarget?.("claim_objective");
      if (!t) return;
      const rect = t.getBoundingClientRect();
      this.updateSpotlight(rect);
      this.updateCallout(CLAIM_STEP.message, rect);
    };
    setTimeout(update, 50);
    this._resizeListener = () => update();
    this._scrollListener = () => update();
    window.addEventListener("resize", this._resizeListener);
    window.addEventListener("scroll", this._scrollListener, true);
  }

  async complete() {
    document.body.classList.remove("tutorial-claim-step");
    this.hideSpotlight();
    this.currentStep = -1;
    this._claimStepActive = false;
    this._resumeStepIndex = null;
    if (this.game?.off && this._onObjectiveClaimed) this.game.off("objectiveClaimed", this._onObjectiveClaimed);
    this._onObjectiveClaimed = null;
    this.clearPersistedStep();
    if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
    if (this.callout?.parentNode) this.callout.parentNode.removeChild(this.callout);
    this.overlay = null;
    this.callout = null;
    StorageUtils.set("reactorTutorialCompleted", 1);
  }

  skip() {
    this.complete().catch(() => {});
  }

  hardSkip() {
    if (this.game) this.game.bypass_tech_tree_restrictions = true;
    StorageUtils.set(TUTORIAL_HARD_SKIP_KEY, 1);
    this.complete().catch(() => {});
  }

  _exitClaimStepAndResume() {
    document.body.classList.remove("tutorial-claim-step");
    this.hideSpotlight();
    this._claimStepActive = false;
    if (this._resumeStepIndex !== null) {
      const next = this._resumeStepIndex;
      this._resumeStepIndex = null;
      this.showStep(next);
    }
  }

  tick() {
    if (this._claimStepActive) {
      if (!this.hasClaimableObjective()) this._exitClaimStepAndResume();
      return;
    }
    if (this.currentStep < 0) return;
    const step = this.steps[this.currentStep];
    if (step?.completion && step.completion()) this.advance();
  }

  start() {
    if (this.currentStep >= 0) return;
    this._onObjectiveClaimed = () => {
      if (this._claimStepActive) this._exitClaimStepAndResume();
    };
    if (this.game?.on) this.game.on("objectiveClaimed", this._onObjectiveClaimed);
    const saved = StorageUtils.get(TUTORIAL_STEP_KEY);
    const stepIndex = saved !== null && saved !== undefined ? Number(saved) : NaN;
    if (Number.isFinite(stepIndex) && stepIndex >= 0 && stepIndex < this.steps.length) {
      this.showStep(stepIndex);
    } else {
      this.showStep(0);
    }
  }
}

function applyMobileTooltipPosition(tooltipEl) {
  const partsPanel = document.getElementById("parts_section");
  const margin = 8;
  const sidePadding = 8;
  const gap = 8;
  const top = margin;
  const isPartsPanelOpen = partsPanel && !partsPanel.classList.contains("collapsed");
  const partsPanelWidth = isPartsPanelOpen && partsPanel ? partsPanel.getBoundingClientRect().width : 0;
  const leftPosition = isPartsPanelOpen ? partsPanelWidth + gap : sidePadding;
  const rightPadding = sidePadding;
  const viewportWidth = window.innerWidth;
  const maxWidth = viewportWidth - leftPosition - rightPadding;
  tooltipEl.style.left = `${leftPosition}px`;
  tooltipEl.style.right = `${rightPadding}px`;
  tooltipEl.style.width = "";
  tooltipEl.style.maxWidth = `${maxWidth}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.style.transform = "none";
  tooltipEl.style.boxSizing = "border-box";
}

function clearDesktopTooltipPosition(tooltipEl) {
  tooltipEl.style.top = "";
  tooltipEl.style.left = "";
  tooltipEl.style.right = "";
  tooltipEl.style.transform = "";
}

function getIconifyFn() {
  return (str) => {
    if (!str) return str;
    const withIcons = str
      .replace(/\bpower\b/gi, "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>")
      .replace(/\bheat\b/gi, "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>")
      .replace(/\bticks?\b/gi, (match) => `${match} <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='tick'>`)
      .replace(/\$(\d+)/g, "<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'> $1")
      .replace(/\bEP\b/g, "🧬 $&");
    const numWithUnit = "(?:\\d[\\d,.]*?(?:\\s*[kKmMbBtTqQ])?|\\d[\\d,.]*?(?:e[+\\-]?\\d+)?)";
    const rePower = new RegExp(`(\\b${numWithUnit}\\b)\\s+(power)\\s+(<img[^>]+alt=['\" ]power['\"][^>]*>)`, 'gi');
    const reHeat = new RegExp(`(\\b${numWithUnit}\\b)\\s+(heat)\\s+(<img[^>]+alt=['\" ]heat['\"][^>]*>)`, 'gi');
    const reTick = new RegExp(`(\\b${numWithUnit}\\b)\\s+(ticks?)\\s+(<img[^>]+alt=['\" ]tick['\"][^>]*>)`, 'gi');
    return withIcons
      .replace(rePower, '<span class="num power-num">$1</span> $2 $3')
      .replace(reHeat, '<span class="num heat-num">$1</span> $2 $3')
      .replace(reTick, '<span class="num tick-num">$1</span> $2 $3');
  };
}

function formatDescriptionBulleted(description, iconifyFn) {
  const raw = String(description || "").trim();
  const cleaned = raw.replace(/\.+$/, '');
  const parts = cleaned
    .split(/\.\s+(?=[A-Z(0-9])/g)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.replace(/\.+$/, ''));
  if (parts.length === 0) return '';
  return parts.map(line => `<div class="tooltip-bullet">${iconifyFn(line)}</div>`).join("");
}

function colorizeBonus(line, iconifyFn) {
  if (!line) return line;
  let result = line
    .replace(/([+][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="pos">$1</span>')
    .replace(/([-][0-9]+(?:\.[0-9]+)?%?)/g, '<span class="neg">$1</span>')
    .replace(/([+][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="pos">$1</span>')
    .replace(/([-][0-9]+(?:\.[0-9]+)?(?:\/[a-z]+)?)/gi, '<span class="neg">$1</span>');
  result = result.replace(/\b(venting|max heat|transfer|EP heat cap)\b/gi, (m) => iconifyFn(m));
  result = result
    .replace(/\bpower\b/gi, "$& <img src='img/ui/icons/icon_power.png' class='icon-inline' alt='power'>")
    .replace(/(?<!max\s)\bheat\b/gi, "$& <img src='img/ui/icons/icon_heat.png' class='icon-inline' alt='heat'>")
    .replace(/\bduration\b/gi, "$& <img src='img/ui/icons/icon_time.png' class='icon-inline' alt='time'>");
  return result;
}

function getUpgradeBonusLines(obj, tile, game) {
  return getUpgradeBonusLinesCore(obj, { tile, game });
}

function setMaxOrLockedStatus(stats, obj, game) {
  if (obj.upgrade) {
    if (obj.level >= obj.max_level) stats.set("", "MAX");
    return;
  }
  if (obj.cost !== undefined && obj.erequires && !game.upgradeset.getUpgrade(obj.erequires)?.level) {
    stats.set("", "LOCKED");
  }
}

function setBaseHeatStats(stats, obj, tile) {
  const maxHeat = obj.containment || "∞";
  const maxHeatDisplay = maxHeat === "∞" ? maxHeat : fmt(maxHeat, 0);
  stats.set("Heat", `${fmt(tile.heat_contained || 0, 0)} / ${maxHeatDisplay}`);
}

function setVentCoolingStats(stats, segment) {
  const totalVentRate = segment.vents.reduce((sum, vent) => sum + vent.getEffectiveVentValue(), 0);
  stats.set("Cooling", `${fmt(totalVentRate, 1)}/tick`);
}

function setOutletTransferStats(stats, segment, game) {
  const totalOutletRate = segment.outlets.reduce((sum, o) => sum + o.getEffectiveTransferValue(), 0);
  const reactorFullness = game.reactor.max_heat > 0 ? game.reactor.current_heat / game.reactor.max_heat : 0;
  const effective = totalOutletRate * reactorFullness * (1 - segment.fullnessRatio);
  stats.set("Transfer", `${fmt(effective, 1)}/tick`);
}

function setInletTransferStats(stats, segment, game) {
  const totalInletRate = segment.inlets.reduce((sum, i) => sum + i.getEffectiveTransferValue(), 0);
  const reactorFullness = game.reactor.max_heat > 0 ? game.reactor.current_heat / game.reactor.max_heat : 0;
  const effective = totalInletRate * segment.fullnessRatio * (1 - reactorFullness);
  stats.set("Transfer", `${fmt(effective, 1)}/tick`);
}

function calculateSellValue(obj, tile) {
  let sell_value = obj.cost;
  if (obj.ticks > 0) {
    sell_value = Math.ceil((tile.ticks / obj.ticks) * obj.cost);
  } else if (obj.containment > 0) {
    sell_value = obj.cost - Math.ceil((tile.heat_contained / obj.containment) * obj.cost);
  }
  return sell_value;
}

function setHeatAndSegmentStats(stats, obj, tile, game) {
  if (!tile?.activated || (!obj.containment && tile.heat_contained <= 0)) return;
  setBaseHeatStats(stats, obj, tile);
  if (!game.engine?.heatManager) return;
  const segment = game.engine.heatManager.getSegmentForTile(tile);
  if (!segment) return;
  stats.set("Segment", `${fmt(segment.fullnessRatio * 100, 1)}% full`);
  if (obj.category === "vent" && segment.vents.length > 0) {
    setVentCoolingStats(stats, segment);
  } else if (obj.category === "heat_outlet" && segment.outlets.length > 0) {
    setOutletTransferStats(stats, segment, game);
  } else if (obj.category === "heat_inlet" && segment.inlets.length > 0) {
    setInletTransferStats(stats, segment, game);
  }
}

function setTransferSellAndEpStats(stats, obj, tile) {
  if (!tile?.activated) return;
  if ((obj.category === "heat_outlet" || obj.category === "heat_inlet") && !stats.has("Transfer")) {
    stats.set("Max Transfer", `${fmt(tile.getEffectiveTransferValue(), 1)}/tick`);
  }
  if (obj.category !== "cell") {
    const sell_value = calculateSellValue(obj, tile);
    stats.set("Sells for", `<img src='img/ui/icons/icon_cash.png' class='icon-inline' alt='cash'>${fmt(Math.max(0, sell_value))}`);
  }
  if (obj.category === "particle_accelerator") {
    stats.set("EP Chance", `${fmt(tile.display_chance, 2)}%`);
    stats.set("EP Heat %", `${fmt(tile.display_chance_percent_of_total, 2)}% of max`);
  }
}

function getDetailedStats(obj, tile, game) {
  const stats = new Map();
  setMaxOrLockedStatus(stats, obj, game);
  setHeatAndSegmentStats(stats, obj, tile, game);
  setTransferSellAndEpStats(stats, obj, tile);
  return stats;
}

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

function tooltipContentTemplate(obj, tile, game, isMobile, onBuy) {
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
    return mobileTooltipContentTemplate({
      title,
      hasUpgrade: !!obj.upgrade,
      statsHtml,
      descHtml,
      hasBonusLines: bonusLines.length > 0,
      bonusHtml,
      upgradeStatus,
    });
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
  return desktopTooltipContentTemplate({
    title,
    hasUpgrade: !!obj.upgrade,
    summaryHtml,
    descHtml,
    hasBonusLines: bonusLines.length > 0,
    bonusHtml,
    statsHtml,
    buyBtn,
  });
}

export class TooltipManager extends BaseComponent {
  constructor(main_element_selector, tooltip_element_selector, game) {
    super();
    this.$main = document.querySelector(main_element_selector);
    this.$tooltip = document.querySelector(tooltip_element_selector);
    this.$tooltipContent = document.getElementById("tooltip_data");
    this.game = game;

    if (!this.$main || !this.$tooltip || !this.$tooltipContent) {
      logger.log('error', 'ui', 'TooltipManager: A required element was not found.');
    }

    this.tooltip_task = null;
    this.tooltip_showing = false;
    this.current_obj = null;
    this.current_tile_context = null;
    this.isLocked = false;
    this.lastRenderedObj = null;
    this.lastRenderedTileContext = null;
    this._lastTooltipContent = null;
    this.isMobile = window.innerWidth <= 768;
    this.needsLiveUpdates = false;
    this._resizeHandler = () => {
      const wasMobile = this.isMobile;
      this.isMobile = window.innerWidth <= 768;
      if (wasMobile !== this.isMobile && this.current_obj) {
        this.update();
      }
    };
    this._tooltipClickHandler = (e) => {
      if (e.target.id === "tooltip_close_btn") this.closeView();
    };

    window.addEventListener("resize", this._resizeHandler);
    this.$tooltip.addEventListener("click", this._tooltipClickHandler);
  }

  teardown() {
    if (typeof window !== "undefined") {
      window.removeEventListener("resize", this._resizeHandler);
    }
    if (this.$tooltip) {
      this.$tooltip.removeEventListener("click", this._tooltipClickHandler);
    }
  }

  show(obj, tile_context, isClick = false, anchorEl = null) {
    if (this.isLocked && !isClick) return;
    clearTimeout(this.tooltip_task);

    if (!obj) {
      this.hide();
      return;
    }

    if (isClick) {
      this.isLocked = true;
    } else if (this.isLocked) {
      return;
    }

    this.current_obj = obj;
    this.current_tile_context = tile_context;
    this.needsLiveUpdates = this._shouldTooltipUpdateLive(obj, tile_context);
    const uiState = this.game?.ui?.uiState;
    if (uiState) uiState.hovered_entity = { obj, tile: tile_context, game: this.game, isMobile: this.isMobile };

    if (!this.tooltip_showing) {
      this.isVisible = true;
      this.$main.classList.add("tooltip_showing");
      this.setElementVisible(this.$tooltip, true);
      this.tooltip_showing = true;
    }

    if (
      this.lastRenderedObj !== obj ||
      this.lastRenderedTileContext !== tile_context
    ) {
      this.update();
      this.lastRenderedObj = obj;
      this.lastRenderedTileContext = tile_context;
    }

    if (window.innerWidth > 768) {
      clearDesktopTooltipPosition(this.$tooltip);
    } else {
      applyMobileTooltipPosition(this.$tooltip);
    }
  }

  reposition() {
    if (this.tooltip_showing && this.current_obj && window.innerWidth <= 768) {
      this.show(this.current_obj, this.current_tile_context, this.isLocked, null);
    }
  }

  hide() {
    if (this.isLocked) return;
    clearTimeout(this.tooltip_task);
    this.tooltip_task = setTimeout(() => this._hide(), 200);
    this.lastRenderedObj = null;
    this.lastRenderedTileContext = null;
  }

  closeView() {
    this.isLocked = false;
    this._hide();
  }

  _hide() {
    const uiState = this.game?.ui?.uiState;
    if (uiState) uiState.hovered_entity = null;
    this.current_obj = null;
    this.current_tile_context = null;
    if (this.tooltip_showing) {
      this.isVisible = false;
      this.$main.classList.remove("tooltip_showing");
      this.setElementVisible(this.$tooltip, false);
      this.tooltip_showing = false;
    }
  }

  async update() {
    this.game.performance.markStart("tooltip_update_total");
    if (!this.tooltip_showing || !this.current_obj) return;

    const onBuy = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.game.upgradeset.purchaseUpgrade(this.current_obj.id)) {
        if (this.game.audio) this.game.audio.play("upgrade");
        this.update();
      } else {
        if (this.game.audio) this.game.audio.play("error");
      }
    };
    const template = tooltipContentTemplate(this.current_obj, this.current_tile_context, this.game, this.isMobile, onBuy);
    try {
      render(template, this.$tooltipContent);
    } catch (_) {}
    this.game.performance.markEnd("tooltip_update_total");
  }

  _shouldTooltipUpdateLive(obj, tile_context) {
    if (obj.upgrade) {
      return false;
    }
    if (tile_context && tile_context.activated) {
      return true;
    }
    return false;
  }

  updateUpgradeAffordability() {
    if (this.tooltip_showing && this.current_obj?.upgrade && this.isLocked) {
      this.update();
    }
  }
}

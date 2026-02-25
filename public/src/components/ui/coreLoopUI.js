import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { MOBILE_BREAKPOINT_PX } from "../../core/constants.js";

const pageElements = {
  global: [
    "main", "info_bar", "info_heat", "info_power", "info_money", "info_heat_denom", "info_power_denom",
    "info_bar_heat_btn", "info_bar_power_btn", "info_heat_desktop", "info_power_desktop", "info_money_desktop",
    "info_heat_denom_desktop", "info_power_denom_desktop", "info_bar_heat_btn_desktop", "info_bar_power_btn_desktop",
    "info_ep", "info_ep_desktop", "info_ep_value", "info_ep_value_desktop", "parts_tab_contents",
    "cells", "reflectors", "capacitors", "vents", "heatExchangers", "heatInlets", "heatOutlets", "coolantCells",
    "reactorPlatings", "particleAccelerators", "overflowValves", "topupValves", "checkValves",
    "objectives_toast_btn", "objectives_toast_title", "reactor_control_deck", "control_deck_power_btn",
    "control_deck_heat_btn", "control_deck_money", "control_deck_power", "control_deck_heat",
    "mobile_passive_top_bar", "mobile_passive_ep", "mobile_passive_money_value", "mobile_passive_pause_btn",
    "control_deck_build_fab", "tooltip", "tooltip_data"
  ],
  reactor_section: ["reactor", "reactor_background", "reactor_wrapper", "reactor_section", "parts_section", "meltdown_banner"],
  upgrades_section: ["upgrades_section", "upgrades_content_wrapper", "cell_power_upgrades", "cell_tick_upgrades", "cell_perpetual_upgrades", "vent_upgrades", "exchanger_upgrades"],
  experimental_upgrades_section: ["experimental_upgrades_section", "experimental_upgrades_content_wrapper", "exotic_particles_display", "current_exotic_particles", "total_exotic_particles", "experimental_laboratory", "experimental_boost", "experimental_particle_accelerators", "experimental_cells", "experimental_cells_boost", "experimental_parts"],
  about_section: ["about_section"],
  privacy_policy_section: ["privacy_policy_section"],
  soundboard_section: ["soundboard_section", "sound_warning_intensity", "sound_warning_value"]
};

export class CoreLoopUI {
  constructor(ui) {
    this.ui = ui;
  }

  scheduleDomUpdate(fn) {
    if (typeof fn === "function") this.ui._pendingDomUpdates.push(fn);
  }

  processUpdateQueue() {
    const ui = this.ui;
    while (ui._pendingDomUpdates?.length) {
      const fn = ui._pendingDomUpdates.shift();
      try { fn(); } catch (e) { logger.log('warn', 'ui', 'pending DOM update error:', e); }
    }
    this.applyStateToDom();
  }

  cacheDOMElements(pageId = null) {
    const ui = this.ui;
    let elementsToCache = [...pageElements.global];
    if (pageId && pageElements[pageId]) {
      elementsToCache = [...elementsToCache, ...pageElements[pageId]];
    } else if (!pageId) {
      const domIdsElements = ui.dom_ids || [];
      elementsToCache = [...new Set([...pageElements.global, ...domIdsElements])];
    }
    elementsToCache.forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        ui.DOMElements[id] = el;
        const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
        ui.DOMElements[camelCaseKey] = el;
      } else {
        if (pageElements.global.includes(id)) {
          logger.log('warn', 'ui', `Global element with id '${id}' not found in DOM.`);
        }
      }
    });
    return true;
  }

  getElement(id) {
    const ui = this.ui;
    if (ui.DOMElements[id]) return ui.DOMElements[id];
    const el = document.getElementById(id);
    if (el) {
      ui.DOMElements[id] = el;
      const camelCaseKey = id.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
      ui.DOMElements[camelCaseKey] = el;
      return el;
    }
    return null;
  }

  getTutorialTarget(stepKey) {
    const ui = this.ui;
    if (!ui.game) return null;
    const mobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    switch (stepKey) {
      case "place_cell": {
        const slots = ui.stateManager?.getQuickSelectSlots?.() ?? [];
        const uraniumSlotIndex = slots.findIndex((s) => s.partId === "uranium1");
        const idx = uraniumSlotIndex >= 0 ? uraniumSlotIndex : 0;
        return document.querySelector(`.quick-select-slot[data-index="${idx}"]`);
      }
      case "place_on_reactor":
        return this.getElement("reactor_wrapper") || document.getElementById("reactor_wrapper");
      case "see_heat_rise":
        return document.getElementById("control_deck_heat_btn")?.offsetParent ? document.getElementById("control_deck_heat_btn") : document.getElementById("info_bar_heat_btn_desktop");
      case "sell_power":
        return document.getElementById("control_deck_power_btn")?.offsetParent ? document.getElementById("control_deck_power_btn") : document.getElementById("info_bar_power_btn_desktop");
      case "place_vent":
        return mobile ? document.querySelector(".quick-select-slot[data-index=\"1\"]") : document.getElementById("part_btn_vent1");
      case "claim_objective": {
        const toast = document.getElementById("objectives_toast_btn");
        if (!toast?.classList.contains("is-complete")) return null;
        return toast.classList.contains("is-expanded") ? toast.querySelector(".objectives-claim-pill") || toast : toast;
      }
      default:
        return null;
    }
  }

  getTutorialGridTile(stepKey) {
    const ui = this.ui;
    if (stepKey !== "place_on_reactor" || !ui.game) return null;
    const g = ui.gridCanvasRenderer;
    if (!g) return null;
    const rows = g.getRows();
    const cols = g.getCols();
    if (!rows || !cols) return null;
    return { row: Math.floor(rows / 2), col: Math.floor(cols / 2) };
  }

  getTileRectInViewport(row, col) {
    const ui = this.ui;
    const g = ui.gridCanvasRenderer;
    const canvas = g?.getCanvas();
    if (!canvas || row == null || col == null) return null;
    const rect = canvas.getBoundingClientRect();
    const rows = g.getRows();
    const cols = g.getCols();
    if (!rows || !cols) return null;
    const width = rect.width / cols;
    const height = rect.height / rows;
    return {
      top: rect.top + row * height,
      left: rect.left + col * width,
      width,
      height,
      bottom: rect.top + (row + 1) * height,
      right: rect.left + (col + 1) * width,
    };
  }

  getDisplayValue(game, configKey) {
    const state = game?.state;
    const reactor = game?.reactor;
    if (!state) return undefined;
    if (configKey === "exotic_particles") return game?.exoticParticleManager?.exotic_particles;
    if (configKey === "total_heat") return state.stats_heat_generation;
    if (configKey === "heat_controlled") return reactor?.heat_controlled;
    if (configKey === "auto_sell_multiplier") return reactor?.auto_sell_multiplier;
    if (configKey === "vent_multiplier_eff") return reactor?.vent_multiplier_eff;
    if (configKey === "manual_override_mult") return reactor?.manual_override_mult;
    if (configKey === "override_end_time") return reactor?.override_end_time;
    if (configKey === "power_to_heat_ratio") return reactor?.power_to_heat_ratio;
    if (configKey === "flux_accumulator_level") return reactor?.flux_accumulator_level;
    return state[configKey];
  }

  applyStateToDom() {
    const ui = this.ui;
    const game = ui.game;
    const config = ui.var_objs_config;
    if (!config || !game?.state) return;
    const sm = ui.stateManager;
    for (const configKey of Object.keys(config)) {
      const val = this.getDisplayValue(game, configKey);
      if (val === undefined) continue;
      if (sm) sm.vars.set(configKey, val);
      const cfg = config[configKey];
      if (!cfg) continue;
      if (!cfg.rolling && cfg.dom) {
        let textContent = cfg.num ? fmt(val, cfg.places) : val;
        if (cfg.prefix) textContent = cfg.prefix + textContent;
        cfg.dom.textContent = textContent;
      }
      cfg.onupdate?.(val);
    }
    ui.objectivesUI.updateObjectiveDisplay();
  }

  updateRollingNumbers(dt) {
    this.ui.infoBarUI.updateRollingNumbers(dt);
  }

  initVarObjsConfig() {
    this.ui.controlDeckUI.initVarObjsConfig();
  }

  runUpdateInterfaceLoop(timestamp = 0) {
    const ui = this.ui;
    if (ui._updateLoopStopped || typeof document === 'undefined' || !document) return;
    if (typeof document.getElementById !== 'function') return;

    if (!ui._lastUiTime) ui._lastUiTime = timestamp;
    const dt = timestamp - ui._lastUiTime;
    ui._lastUiTime = timestamp;

    while (ui._pendingDomUpdates.length) {
      const fn = ui._pendingDomUpdates.shift();
      try { fn(); } catch (e) { logger.log('warn', 'ui', 'pending DOM update error:', e); }
    }
    this.applyStateToDom();
    this.updateRollingNumbers(dt);
    if (ui.particleSystem && ui._particleCtx) {
      ui.particleSystem.update(dt);
      ui._particleCtx.clearRect(0, 0, ui._particleCanvas.width, ui._particleCanvas.height);
      ui.particleSystem.draw(ui._particleCtx);
    }

    if (ui.game?.objectives_manager) {
      const checkId = ui.game.objectives_manager.current_objective_def?.checkId;
      const toastBtn = ui.DOMElements.objectives_toast_btn;
      if (checkId === "sustainedPower1k" && toastBtn?.classList.contains("is-expanded")) {
        ui.objectivesUI.updateObjectiveDisplay();
      }
    }

    if (timestamp - ui.last_interface_update > ui.update_interface_interval) {
      ui.last_interface_update = timestamp;
      ui.performanceUI.recordFrame();

      if (ui.gridCanvasRenderer && ui.game) {
        ui.gridCanvasRenderer.render(ui.game);
      }

      if (ui.game) {
        const moneyVal = ui.game.state.current_money;
        const exoticVal = ui.game.state.current_exotic_particles;
        const moneyChanged = moneyVal && typeof moneyVal.eq === "function" ? !moneyVal.eq(ui.last_money) : ui.last_money !== moneyVal;
        const exoticParticlesChanged = exoticVal && exoticVal.eq ? !exoticVal.eq(ui.last_exotic_particles) : ui.last_exotic_particles !== exoticVal;
        if (moneyChanged || exoticParticlesChanged) {
          ui.last_money = moneyVal != null ? moneyVal : ui.game.state.current_money;
          ui.last_exotic_particles = exoticVal != null ? exoticVal : ui.game.state.current_exotic_particles;
          ui.game.partset.check_affordability(ui.game);
          ui.game.upgradeset.check_affordability(ui.game);
          if (ui.game.tooltip_manager) ui.game.tooltip_manager.updateUpgradeAffordability();
          ui.navIndicatorsUI.updateNavIndicators();
          if (typeof ui.partsPanelUI?.updateQuickSelectSlots === "function") ui.partsPanelUI.updateQuickSelectSlots();
        }
        ui.navIndicatorsUI.updateLeaderboardIcon();
      }

      ui.pauseStateUI.updatePauseState();
      ui.infoBarUI.updateActiveBuffs();
      ui.deviceFeatures.updateAppBadge();

      if (ui.game?.tooltip_manager?.tooltip_showing && ui.game?.tooltip_manager?.needsLiveUpdates) {
        ui.game.tooltip_manager.update();
      }

      ui.heatVisualsUI.drawHeatFlowOverlay();
    }

    ui.update_interface_task = requestAnimationFrame((ts) => ui.coreLoopUI.runUpdateInterfaceLoop(ts));
  }
}

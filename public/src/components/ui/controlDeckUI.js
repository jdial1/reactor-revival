import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";

export class ControlDeckUI {
  constructor(ui) {
    this.ui = ui;
    this.toggle_buttons_config = {
      auto_sell: { id: "auto_sell_toggle", stateProperty: "auto_sell" },
      auto_buy: { id: "auto_buy_toggle", stateProperty: "auto_buy" },
      time_flux: { id: "time_flux_toggle", stateProperty: "time_flux" },
      heat_control: {
        id: "heat_control_toggle",
        stateProperty: "heat_control",
      },
      pause: { id: "pause_toggle", stateProperty: "pause" },
    };
  }

  initVarObjsConfig() {
    const ui = this.ui;
    const controlDeck = this;
    const getInfoElement = (mobileId, desktopId) => {
      const isDesktop = window.innerWidth >= 901;
      const elementId = isDesktop ? desktopId : mobileId;
      return document.getElementById(elementId);
    };

    ui.var_objs_config = {
      current_money: {
        rolling: true,
        num: true,
        onupdate: (val) => {
          ui.displayValues.money.target = val;
          ui.mobileInfoBarUI.updateControlDeckValues();
        },
      },
      current_power: {
        rolling: true,
        num: true,
        onupdate: (val) => {
          ui.displayValues.power.target = val;
          ui.infoBarUI.updatePowerDenom();
          ui.mobileInfoBarUI.updateControlDeckValues();
        },
      },
      max_power: {
        dom: getInfoElement("info_power_denom", "info_power_denom_desktop"),
        num: true,
        onupdate: () => ui.infoBarUI.updatePowerDenom(),
      },
      current_heat: {
        rolling: true,
        num: true,
        places: 2,
        onupdate: (val) => {
          ui.displayValues.heat.target = val;
          ui.infoBarUI.updateHeatDenom();
          ui.mobileInfoBarUI.updateControlDeckValues();
        },
      },
      max_heat: {
        dom: getInfoElement("info_heat_denom", "info_heat_denom_desktop"),
        num: true,
        onupdate: () => ui.infoBarUI.updateHeatDenom(),
      },
      exotic_particles: {
        num: true,
        onupdate: (val) => {
          if (ui.DOMElements.reboot_exotic_particles) {
            ui.DOMElements.reboot_exotic_particles.textContent = fmt(val);
          }
        },
      },
      current_exotic_particles: {
        rolling: true,
        num: true,
        onupdate: (val) => {
          ui.displayValues.ep.target = val;
          const shouldShow = val > 0;
          const mobileEl = document.getElementById("info_ep");
          const desktopEl = document.getElementById("info_ep_desktop");
          if (mobileEl) {
            const content = mobileEl.querySelector(".ep-content");
            if (content) content.style.display = shouldShow ? "flex" : "none";
          }
          if (desktopEl) {
            const content = desktopEl.querySelector(".ep-content");
            if (content) content.style.display = shouldShow ? "flex" : "none";
          }
          if (ui.DOMElements.current_exotic_particles) {
            ui.DOMElements.current_exotic_particles.textContent = fmt(val);
          }
          ui.mobileInfoBarUI.updateMobilePassiveTopBar();
        },
      },
      total_exotic_particles: {
        dom: ui.DOMElements.total_exotic_particles,
        num: true,
        onupdate: (val) => {
          if (ui.DOMElements.total_exotic_particles) {
            ui.DOMElements.total_exotic_particles.textContent = fmt(val);
          }
          const rebootVal = ui.game?.exoticParticleManager?.exotic_particles ?? 0;
          const valNum = typeof val?.toNumber === "function" ? val.toNumber() : Number(val ?? 0);
          const rebootNum = typeof rebootVal?.toNumber === "function" ? rebootVal.toNumber() : Number(rebootVal ?? 0);
          if (ui.DOMElements.refund_exotic_particles) {
            ui.DOMElements.refund_exotic_particles.textContent = fmt(valNum + rebootNum);
          }
        },
      },
      stats_power: {
        dom: ui.DOMElements.stats_power,
        num: true,
        onupdate: () => ui.infoBarUI.updatePowerDenom(),
      },
      total_heat: {
        dom: ui.DOMElements.stats_heat,
        num: true,
        places: 0,
        onupdate: () => ui.infoBarUI.updateHeatDenom(),
      },
      engine_status: {
        onupdate: (val) => {
          const indicator = ui.DOMElements.engine_status_indicator;
          if (!indicator) return;
          indicator.classList.remove("engine-running", "engine-paused", "engine-stopped", "engine-tick");
          if (val === "running") indicator.classList.add("engine-running");
          else if (val === "paused") indicator.classList.add("engine-paused");
          else if (val === "stopped") indicator.classList.add("engine-stopped");
          else if (val === "tick") {
            indicator.classList.add("engine-tick");
            setTimeout(() => {
              if (indicator.classList.contains("engine-tick")) {
                indicator.classList.remove("engine-tick");
                const currentStatus = ui.game.engine.running
                  ? (ui.game.paused ? "paused" : "running")
                  : "stopped";
                indicator.classList.add(`engine-${currentStatus}`);
              }
            }, 100);
          }
        },
      },
      stats_outlet: {
        dom: ui.DOMElements.stats_outlet,
        num: true,
        places: 0,
      },
      stats_inlet: { dom: ui.DOMElements.stats_inlet, num: true, places: 0 },
      stats_vent: {
        dom: ui.DOMElements.stats_vent,
        num: true,
        places: 0,
        onupdate: () => ui.infoBarUI.updateHeatDenom(),
      },
      stats_net_heat: {
        onupdate: () => ui.infoBarUI.updateHeatDenom(),
      },
      stats_total_part_heat: {
        dom: ui.DOMElements.stats_total_part_heat,
        num: true,
        places: 0,
      },
      auto_sell: {
        onupdate: (val) =>
          controlDeck.updateToggleButtonState(controlDeck.toggle_buttons_config.auto_sell, val),
      },
      auto_buy: {
        onupdate: (val) =>
          controlDeck.updateToggleButtonState(controlDeck.toggle_buttons_config.auto_buy, val),
      },
      heat_control: {
        onupdate: (val) =>
          controlDeck.updateToggleButtonState(controlDeck.toggle_buttons_config.heat_control, val),
      },
      time_flux: {
        onupdate: (val) =>
          controlDeck.updateToggleButtonState(controlDeck.toggle_buttons_config.time_flux, val),
      },
      pause: {
        id: "pause_toggle",
        stateProperty: "pause",
        onupdate: (val) => {
          controlDeck.updateToggleButtonState(controlDeck.toggle_buttons_config.pause, val);
          const pauseBtn = ui.DOMElements.pause_toggle;
          if (pauseBtn) {
            if (val) {
              pauseBtn.classList.add("paused");
              pauseBtn.title = "Resume";
            } else {
              pauseBtn.classList.remove("paused");
              pauseBtn.title = "Pause";
            }
          }
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
          if (ui.game && ui.game.engine) {
            if (val) {
              ui.game.engine.stop();
              ui.stateManager.setVar("engine_status", "paused");
            } else {
              ui.game.engine.start();
              ui.stateManager.setVar("engine_status", "running");
            }
          }
          ui.deviceFeatures.updateWakeLockState();
        },
      },
      melting_down: {
        onupdate: (val) => {
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
        },
      },
    };
  }

  initializeToggleButtons() {
    const ui = this.ui;
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const button = ui.DOMElements[config.id];
      if (button) {
        button.onclick = () => {
          const currentState = ui.stateManager.getVar(config.stateProperty);
          const newState = !currentState;
          logger.log('debug', 'ui', `[TOGGLE] Button "${config.stateProperty}" clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}`);
          if (config.stateProperty === "time_flux") {
            const accumulator = ui.game?.engine?.time_accumulator || 0;
            const queuedTicks = accumulator > 0 ? Math.floor(accumulator / (ui.game?.loop_wait || 1000)) : 0;
            logger.log('debug', 'ui', `[TIME FLUX] Button clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}, Accumulator: ${accumulator.toFixed(0)}ms, Queued ticks: ${queuedTicks}, game.time_flux before: ${ui.game?.time_flux}`);
          }
          ui.stateManager.setVar(config.stateProperty, newState);
        };
      } else {
        logger.log('warn', 'ui', `Toggle button #${config.id} not found.`);
      }
    }
    this.updateAllToggleBtnStates();
    const updatePauseButtonText = () => {
      const isPaused = ui.stateManager.getVar("pause");
      const pauseBtn = ui.DOMElements.pause_toggle;
      if (pauseBtn) {
        if (isPaused) {
          pauseBtn.classList.add("paused");
          pauseBtn.title = "Resume";
        } else {
          pauseBtn.classList.remove("paused");
          pauseBtn.title = "Pause";
        }
      }
    };
    updatePauseButtonText();
    const origSetVar = ui.stateManager.setVar.bind(ui.stateManager);
    ui.stateManager.setVar = (key, value, ...args) => {
      origSetVar(key, value, ...args);
      if (key === "pause") {
        this.updateAllToggleBtnStates();
        updatePauseButtonText();
        ui.mobileInfoBarUI.updateMobilePassiveTopBar();
      }
    };
  }

  updateAllToggleBtnStates() {
    for (const buttonKey in this.toggle_buttons_config) {
      const config = this.toggle_buttons_config[buttonKey];
      const isActive = this.ui.stateManager.getVar(config.stateProperty);
      logger.log('debug', 'ui', `Updating button "${config.stateProperty}" to ${isActive ? "ON" : "OFF"}`);
      this.updateToggleButtonState(config, isActive);
    }
  }

  syncToggleStatesFromGame() {
    const ui = this.ui;
    if (!ui.game) {
      logger.log('warn', 'ui', 'syncToggleStatesFromGame called but game is not available');
      return;
    }
    const toggleMappings = {
      auto_sell: () => ui.game.reactor?.auto_sell_enabled ?? false,
      auto_buy: () => ui.game.reactor?.auto_buy_enabled ?? false,
      heat_control: () => ui.game.reactor?.heat_controlled ?? false,
      time_flux: () => ui.game.time_flux ?? true,
      pause: () => ui.game.paused ?? false,
    };
    for (const [stateProperty, getValue] of Object.entries(toggleMappings)) {
      const gameValue = getValue();
      const currentState = ui.stateManager.getVar(stateProperty);
      if (currentState !== gameValue) {
        logger.log('debug', 'ui', `[TOGGLE] Syncing "${stateProperty}" from game: ${currentState} -> ${gameValue}`);
        ui.stateManager.setVar(stateProperty, gameValue);
      }
    }
  }

  updateToggleButtonState(config, isActive) {
    const button = this.ui.DOMElements[config.id];
    if (!button) return;
    button.classList.toggle("on", isActive);
  }

  updatePercentageBar(currentKey, maxKey, domElement) {
    if (!domElement) return;
    const current = this.ui.stateManager.getVar(currentKey) || 0;
    const max = this.ui.stateManager.getVar(maxKey) || 1;
    domElement.style.width = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
  }
}

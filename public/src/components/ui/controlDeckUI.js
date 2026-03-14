import { html, render } from "lit-html";
import { numFormat as fmt } from "../../utils/util.js";
import { logger } from "../../utils/logger.js";
import { classMap } from "../../utils/litHelpers.js";
import { ReactiveLitComponent } from "../ReactiveLitComponent.js";

export class ControlDeckUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('ControlDeck', this);
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

  _statsBarTemplate(state) {
    const vent = fmt(state.stats_vent ?? 0, 0);
    const power = fmt(state.stats_power ?? 0, 0);
    const heat = fmt(state.stats_heat_generation ?? 0, 0);
    return html`
      <li><strong title="Total heat venting per tick"><img src="img/ui/icons/icon_vent.png" alt="Vent" class="icon-inline" /><span id="stats_vent">${vent}</span></strong></li>
      <li><strong title="Power per tick"><img src="img/ui/icons/icon_power.png" alt="Power" class="icon-inline" /><span id="stats_power">${power}</span></strong></li>
      <li><strong title="Heat per tick"><img src="img/ui/icons/icon_heat.png" alt="Heat" class="icon-inline" /><span id="stats_heat">${heat}</span></strong></li>
    `;
  }

  _exoticParticlesTemplate(state) {
    return html`
      <div class="grid">
        <div>Current 🧬 EP: <strong><span id="current_exotic_particles">${fmt(state.current_exotic_particles ?? 0)}</span></strong></div>
        <div>Total 🧬 EP: <strong><span id="total_exotic_particles">${fmt(state.total_exotic_particles ?? 0)}</span></strong></div>
      </div>
    `;
  }

  mountExoticParticlesDisplayIfNeeded(ui) {
    if (this._epComponent) return;
    const epRoot = document.getElementById("exotic_particles_display");
    if (!epRoot || !ui.game?.state) return;
    this._epComponent = new ReactiveLitComponent(
      ui.game.state,
      ["current_exotic_particles", "total_exotic_particles"],
      (state) => this._exoticParticlesTemplate(state),
      epRoot
    );
    this._epUnmount = this._epComponent.mount();
  }

  _mountStatsBarReactive(ui) {
    const root = document.getElementById("reactor_stats");
    if (!root || !ui.game?.state) return;
    const renderFn = (state) => this._statsBarTemplate(state);
    this._statsBarComponent = new ReactiveLitComponent(
      ui.game.state,
      ["stats_vent", "stats_power", "stats_heat_generation"],
      renderFn,
      root
    );
    this._statsBarUnmount = this._statsBarComponent.mount();
    this.mountExoticParticlesDisplayIfNeeded(ui);
  }

  _mountEngineStatusReactive(ui) {
    const root = document.getElementById("engine_status_indicator_root");
    if (!root || !ui.game?.state) return;
    const renderFn = (state) => {
      const statusClass = classMap({
        "engine-running": state.engine_status === "running",
        "engine-paused": state.engine_status === "paused",
        "engine-stopped": state.engine_status === "stopped",
        "engine-tick": state.engine_status === "tick",
      });
      return html`<span id="engine_status_indicator" class=${statusClass}></span>`;
    };
    this._engineStatusComponent = new ReactiveLitComponent(
      ui.game.state,
      ["engine_status"],
      renderFn,
      root
    );
    this._engineStatusUnmount = this._engineStatusComponent.mount();
  }

  initVarObjsConfig() {
    const ui = this.ui;

    this._mountStatsBarReactive(ui);
    this._mountEngineStatusReactive(ui);
    ui.var_objs_config = {
      pause: {
        id: "pause_toggle",
        stateProperty: "pause",
        onupdate: (val) => {
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
          if (ui.uiState) ui.uiState.is_paused = !!val;
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
          ui.pauseStateUI?.updatePauseState?.();
        },
      },
      melting_down: {
        onupdate: (val) => {
          if (val) ui.gridInteractionUI.clearAllActiveAnimations();
        },
      },
    };
    ui.stateManager?.setupStateSubscriptions?.();
  }

  _controlsNavTemplate(state) {
    const ui = this.ui;
    const queuedTicks = ui.uiState?.time_flux_queued_ticks ?? 0;
    const timeFluxLabel = queuedTicks > 1 ? `Time Flux (${queuedTicks})` : "Time Flux";
    const timeFluxHasQueue = queuedTicks > 1;
    const toggleHandler = (stateProperty) => () => {
      const currentState = state[stateProperty];
      const newState = !currentState;
      logger.log("debug", "ui", `[TOGGLE] Button "${stateProperty}" clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}`);
      if (stateProperty === "time_flux" && ui.game) {
        const accumulator = ui.game.engine?.time_accumulator || 0;
        const queuedTicks = accumulator > 0 ? Math.floor(accumulator / (ui.game.loop_wait || 1000)) : 0;
        logger.log("debug", "ui", `[TIME FLUX] Button clicked: ${currentState ? "ON" : "OFF"} -> ${newState ? "ON" : "OFF"}, Accumulator: ${accumulator.toFixed(0)}ms, Queued ticks: ${queuedTicks}`);
      }
      ui.stateManager.setVar(stateProperty, newState);
    };
    return html`
      <button id="auto_sell_toggle" class=${classMap({ "pixel-btn": true, on: !!state.auto_sell })} title="Auto Sell" @click=${toggleHandler("auto_sell")}>
        <img src="img/ui/icons/icon_cash.png" alt="Auto Sell" class="control-icon" />
        <span class="control-text">Auto Sell</span>
      </button>
      <button id="auto_buy_toggle" class=${classMap({ "pixel-btn": true, on: !!state.auto_buy })} title="Auto Buy" @click=${toggleHandler("auto_buy")}>
        <img src="img/ui/icons/icon_cash_outline.svg" alt="Auto Buy" class="control-icon" />
        <span class="control-text">Auto Buy</span>
      </button>
      <button id="time_flux_toggle" class=${classMap({ "pixel-btn": true, on: !!state.time_flux, "has-queue": timeFluxHasQueue })} title=${timeFluxLabel} @click=${toggleHandler("time_flux")}>
        <img src="img/ui/icons/icon_time.png" alt="Time Flux" class="control-icon" />
        <span class="control-text">${timeFluxLabel}</span>
      </button>
      <button id="heat_control_toggle" class=${classMap({ "pixel-btn": true, on: !!state.heat_control })} title="Heat Ctrl" @click=${toggleHandler("heat_control")}>
        <img src="img/ui/icons/icon_heat.png" alt="Auto Heat" class="control-icon" />
        <span class="control-text">Auto Heat</span>
      </button>
      <button id="pause_toggle" class=${classMap({ "pixel-btn": true, on: !!state.pause, paused: !!state.pause })} title=${state.pause ? "Resume" : "Pause"} @click=${toggleHandler("pause")}>
        <img src="img/ui/nav/nav_pause.png" alt="Pause" class="control-icon pause-icon" />
        <img src="img/ui/nav/nav_play.png" alt="Resume" class="control-icon play-icon" />
        <span class="control-text">Pause</span>
      </button>
      <button id="user_account_btn_mobile" class="pixel-btn" title=${ui.uiState?.user_account_display?.title ?? "Account"}>
        <span class="control-icon" style="font-size: 1.5em;">${ui.uiState?.user_account_display?.icon ?? "👤"}</span>
        <span class="control-text">Account</span>
      </button>
    `;
  }

  initializeToggleButtons() {
    const ui = this.ui;
    const root = document.getElementById("controls_nav_root");
    if (root && ui.game?.state) {
      const renderFn = () => this._controlsNavTemplate(ui.game.state);
      this._controlsNavUnmount = ReactiveLitComponent.mountMulti(
        [
          { state: ui.game.state, keys: ["auto_sell", "auto_buy", "heat_control", "time_flux", "pause"] },
          ...(ui.uiState ? [{ state: ui.uiState, keys: ["time_flux_queued_ticks", "user_account_display"] }] : []),
        ],
        renderFn,
        root
      );
    } else if (root) {
      render(this._controlsNavTemplate({ auto_sell: false, auto_buy: true, time_flux: true, heat_control: false, pause: false }), root);
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

  updatePercentageBar(currentKey, maxKey, domElement) {
    if (!domElement) return;
    const current = this.ui.stateManager.getVar(currentKey) || 0;
    const max = this.ui.stateManager.getVar(maxKey) || 1;
    domElement.style.width = `${Math.min(100, Math.max(0, (current / max) * 100))}%`;
  }
}

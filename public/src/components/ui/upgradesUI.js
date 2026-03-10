import { html, render } from "lit-html";
import { escapeHtml } from "../../utils/stringUtils.js";
import { repeat, unsafeHTML } from "../../utils/litHelpers.js";

export class UpgradesUI {
  constructor(ui) {
    this.ui = ui;
    this.ui.registry.register('Upgrades', this);
  }

  getUpgradeContainer(locationKey) {
    return this.ui.DOMElements?.[locationKey] ?? this.ui.coreLoopUI?.getElement?.(locationKey) ?? document.getElementById(locationKey);
  }

  appendUpgrade(locationKey, upgradeEl) {
    const container = this.getUpgradeContainer(locationKey);
    if (container && upgradeEl) {
      container.appendChild(upgradeEl);
    }
  }

  showDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.remove("hidden");
      debugToggleBtn.textContent = "Hide Debug Info";
      this.updateDebugVariables();
    }
  }

  hideDebugPanel() {
    const ui = this.ui;
    const getEl = (id) => ui.coreLoopUI?.getElement?.(id) ?? ui.DOMElements?.[id];
    const debugSection = getEl("debug_section");
    const debugToggleBtn = getEl("debug_toggle_btn");
    if (debugSection && debugToggleBtn) {
      debugSection.classList.add("hidden");
      debugToggleBtn.textContent = "Show Debug Info";
    }
  }

  updateDebugVariables() {
    const ui = this.ui;
    const debugVariables = ui.coreLoopUI?.getElement?.("debug_variables") ?? ui.DOMElements?.debug_variables;
    if (!ui.game || !debugVariables) return;
    const gameVars = this.collectGameVariables();
    const sectionTemplate = ([fileName, variables]) => {
      const sortedEntries = Object.entries(variables).sort(([a], [b]) => a.localeCompare(b));
      return html`
        <div class="debug-section">
          <h4>${fileName}</h4>
          <div class="debug-variables-list">
            ${repeat(sortedEntries, ([k]) => k, ([key, value]) => html`
              <div class="debug-variable">
                <span class="debug-key">${escapeHtml(key)}:</span>
                <span class="debug-value">${unsafeHTML(this.formatDebugValue(value))}</span>
              </div>
            `)}
          </div>
        </div>
      `;
    };
    const entries = Object.entries(gameVars);
    const template = html`${repeat(entries, ([f]) => f, sectionTemplate)}`;
    render(template, debugVariables);
  }

  collectGameVariables() {
    const ui = this.ui;
    const vars = {
      "Game (game.js)": {},
      "Reactor (reactor.js)": {},
      "State Manager": {},
      "UI State": {},
      Performance: {},
      Tileset: {},
      Engine: {},
    };
    if (!ui.game) return vars;
    const game = ui.game;
    vars["Game (game.js)"]["version"] = game.version;
    vars["Game (game.js)"]["base_cols"] = game.base_cols;
    vars["Game (game.js)"]["base_rows"] = game.base_rows;
    vars["Game (game.js)"]["max_cols"] = game.max_cols;
    vars["Game (game.js)"]["max_rows"] = game.max_rows;
    vars["Game (game.js)"]["rows"] = game.rows;
    vars["Game (game.js)"]["cols"] = game.cols;
    vars["Game (game.js)"]["base_loop_wait"] = game.base_loop_wait;
    vars["Game (game.js)"]["base_manual_heat_reduce"] = game.base_manual_heat_reduce;
    vars["Game (game.js)"]["upgrade_max_level"] = game.upgrade_max_level;
    vars["Game (game.js)"]["base_money"] = game.base_money;
    vars["Game (game.js)"]["current_money"] = game.state.current_money;
    vars["Game (game.js)"]["protium_particles"] = game.protium_particles;
    vars["Game (game.js)"]["total_exotic_particles"] = game.state.total_exotic_particles;
    vars["Game (game.js)"]["exotic_particles"] = game.exoticParticleManager.exotic_particles;
    vars["Game (game.js)"]["current_exotic_particles"] = game.state.current_exotic_particles;
    vars["Game (game.js)"]["loop_wait"] = game.loop_wait;
    vars["Game (game.js)"]["paused"] = game.paused;
    vars["Game (game.js)"]["autoSellEnabled"] = game.autoSellEnabled;
    vars["Game (game.js)"]["isAutoBuyEnabled"] = game.isAutoBuyEnabled;
    vars["Game (game.js)"]["time_flux"] = game.time_flux;
    vars["Game (game.js)"]["sold_power"] = game.sold_power;
    vars["Game (game.js)"]["sold_heat"] = game.sold_heat;

    if (game.reactor) {
      const reactor = game.reactor;
      vars["Reactor (reactor.js)"]["base_max_heat"] = reactor.base_max_heat;
      vars["Reactor (reactor.js)"]["base_max_power"] = reactor.base_max_power;
      vars["Reactor (reactor.js)"]["current_heat"] = reactor.current_heat;
      vars["Reactor (reactor.js)"]["current_power"] = reactor.current_power;
      vars["Reactor (reactor.js)"]["max_heat"] = reactor.max_heat;
      vars["Reactor (reactor.js)"]["altered_max_heat"] = reactor.altered_max_heat;
      vars["Reactor (reactor.js)"]["max_power"] = reactor.max_power;
      vars["Reactor (reactor.js)"]["altered_max_power"] = reactor.altered_max_power;
      vars["Reactor (reactor.js)"]["auto_sell_multiplier"] = reactor.auto_sell_multiplier;
      vars["Reactor (reactor.js)"]["heat_power_multiplier"] = reactor.heat_power_multiplier;
      vars["Reactor (reactor.js)"]["heat_controlled"] = reactor.heat_controlled;
      vars["Reactor (reactor.js)"]["heat_outlet_controlled"] = reactor.heat_outlet_controlled;
      vars["Reactor (reactor.js)"]["vent_capacitor_multiplier"] = reactor.vent_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["vent_plating_multiplier"] = reactor.vent_plating_multiplier;
      vars["Reactor (reactor.js)"]["transfer_capacitor_multiplier"] = reactor.transfer_capacitor_multiplier;
      vars["Reactor (reactor.js)"]["transfer_plating_multiplier"] = reactor.transfer_plating_multiplier;
      vars["Reactor (reactor.js)"]["has_melted_down"] = reactor.has_melted_down;
      vars["Reactor (reactor.js)"]["stats_power"] = reactor.stats_power;
      vars["Reactor (reactor.js)"]["stats_heat_generation"] = reactor.stats_heat_generation;
      vars["Reactor (reactor.js)"]["stats_vent"] = reactor.stats_vent;
      vars["Reactor (reactor.js)"]["stats_inlet"] = reactor.stats_inlet;
      vars["Reactor (reactor.js)"]["stats_outlet"] = reactor.stats_outlet;
      vars["Reactor (reactor.js)"]["stats_total_part_heat"] = reactor.stats_total_part_heat;
      vars["Reactor (reactor.js)"]["vent_multiplier_eff"] = reactor.vent_multiplier_eff;
      vars["Reactor (reactor.js)"]["transfer_multiplier_eff"] = reactor.transfer_multiplier_eff;
    }

    if (game.tileset) {
      const tileset = game.tileset;
      vars["Tileset"]["max_rows"] = tileset.max_rows;
      vars["Tileset"]["max_cols"] = tileset.max_cols;
      vars["Tileset"]["rows"] = tileset.rows;
      vars["Tileset"]["cols"] = tileset.cols;
      vars["Tileset"]["tiles_list_length"] = tileset.tiles_list?.length || 0;
      vars["Tileset"]["active_tiles_list_length"] = tileset.active_tiles_list?.length || 0;
      vars["Tileset"]["tiles_with_parts"] = tileset.tiles_list?.filter((t) => t.part)?.length || 0;
    }

    if (game.engine) {
      const engine = game.engine;
      vars["Engine"]["running"] = engine.running;
      vars["Engine"]["tick_count"] = engine.tick_count;
      vars["Engine"]["last_tick_time"] = engine.last_tick_time;
      vars["Engine"]["tick_interval"] = engine.tick_interval;
    }

    if (ui.stateManager) {
      const stateVars = ui.stateManager.getAllVars();
      Object.entries(stateVars).forEach(([key, value]) => {
        vars["State Manager"][key] = value;
      });
    }

    vars["UI State"]["update_interface_interval"] = ui.update_interface_interval;
    vars["UI State"]["isDragging"] = ui.inputHandler?.isDragging ?? false;
    vars["UI State"]["lastTileModified"] = ui.inputHandler?.lastTileModified ? "Tile Object" : null;
    vars["UI State"]["longPressTimer"] = ui.inputHandler?.longPressTimer ? "Active" : null;
    vars["UI State"]["longPressDuration"] = ui.inputHandler?.longPressDuration ?? 500;
    vars["UI State"]["last_money"] = ui.last_money;
    vars["UI State"]["last_exotic_particles"] = ui.last_exotic_particles;
    vars["UI State"]["ctrl9HoldTimer"] = ui.ctrl9HoldTimer ? "Active" : null;
    vars["UI State"]["ctrl9HoldStartTime"] = ui.ctrl9HoldStartTime;
    vars["UI State"]["ctrl9MoneyInterval"] = ui.ctrl9MoneyInterval ? "Active" : null;
    vars["UI State"]["ctrl9BaseAmount"] = ui.ctrl9BaseAmount;
    vars["UI State"]["ctrl9ExponentialRate"] = ui.ctrl9ExponentialRate;
    vars["UI State"]["ctrl9IntervalMs"] = ui.ctrl9IntervalMs;
    if (ui.ctrl9HoldStartTime) {
      const holdDuration = Date.now() - ui.ctrl9HoldStartTime;
      const secondsHeld = holdDuration / 1000;
      vars["UI State"]["ctrl9SecondsHeld"] = secondsHeld.toFixed(2);
      vars["UI State"]["ctrl9CurrentAmount"] = Math.floor(
        ui.ctrl9BaseAmount * Math.pow(ui.ctrl9ExponentialRate, secondsHeld)
      );
    }
    vars["UI State"]["screen_resolution"] = `${window.innerWidth}x${window.innerHeight}`;
    vars["UI State"]["device_pixel_ratio"] = window.devicePixelRatio;

    if (game.performance) {
      const perf = game.performance;
      vars["Performance"]["enabled"] = perf.enabled;
      vars["Performance"]["marks"] = Object.keys(perf.marks || {}).length;
      vars["Performance"]["measures"] = Object.keys(perf.measures || {}).length;
    }

    return vars;
  }

  formatDebugValue(value) {
    if (value === null || value === undefined) {
      return "<span class='debug-null'>null</span>";
    }
    if (typeof value === "boolean") {
      return `<span class='debug-boolean'>${value}</span>`;
    }
    if (typeof value === "number") {
      return `<span class='debug-number'>${value}</span>`;
    }
    if (typeof value === "string") {
      return `<span class='debug-string'>"${escapeHtml(value)}"</span>`;
    }
    if (typeof value === "object") {
      if (Array.isArray(value)) {
        return `<span class='debug-array'>[${value.length} items]</span>`;
      }
      return `<span class='debug-object'>{${Object.keys(value).length} keys}</span>`;
    }
    return `<span class='debug-other'>${escapeHtml(String(value))}</span>`;
  }
}

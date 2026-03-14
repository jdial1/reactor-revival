import { MOBILE_BREAKPOINT_PX } from "./constants.js";
import { subscribeKey, setDecimal } from "./store.js";
import { logger } from "../utils/logger.js";
import { addPartIconsToTitle as addPartIconsToTitleHelper, getObjectiveScrollDuration as getObjectiveScrollDurationHelper, checkObjectiveTextScrolling as checkObjectiveTextScrollingHelper } from "./objective/objectiveUIHelper.js";
import { BaseComponent } from "../components/BaseComponent.js";

export class StateManager extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.quickSelectSlots = Array.from({ length: 5 }, () => ({ partId: null, locked: false }));
    this._stateUnsubscribes = [];
  }
  teardown() {
    const unsubs = this._stateUnsubscribes;
    if (unsubs.length) {
      unsubs.forEach((fn) => { try { fn(); } catch (_) {} });
      unsubs.length = 0;
    }
  }
  setGame(gameInstance) {
    this.teardown();
    this.game = gameInstance;
    if (this.ui) this.ui._firstFrameSyncDone = false;
    if (!gameInstance?.state) return;
    this.setupStateSubscriptions();
  }

  setupStateSubscriptions() {
    this.teardown();
    const state = this.game?.state;
    const ui = this.ui;
    const config = ui?.var_objs_config;
    if (!state || !config) return;
    const coreLoopUI = ui?.coreLoopUI;
    const getDisplayValue = (key) => coreLoopUI?.getDisplayValue?.(this.game, key);
    const stateKeyMap = {
      total_heat: "stats_heat_generation",
    };
    for (const configKey of Object.keys(config)) {
      const stateKey = stateKeyMap[configKey] ?? configKey;
      if (state[stateKey] === undefined) continue;
      const cfg = config[configKey];
      if (!cfg?.onupdate) continue;
      const unsub = subscribeKey(state, stateKey, () => {
        const val = getDisplayValue(configKey);
        if (val !== undefined) cfg.onupdate(val);
      });
      this._stateUnsubscribes.push(unsub);
    }
    if (state.engine_status !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "engine_status", (val) => {
        if (val === "tick") {
          setTimeout(() => {
            const g = this.game;
            const status = g?.engine?.running ? (g?.paused ? "paused" : "running") : "stopped";
            this.setVar("engine_status", status);
          }, 100);
        }
      }));
    }
    const heatKeys = ["current_heat", "max_heat"];
    for (const key of heatKeys) {
      if (state[key] !== undefined) {
        this._stateUnsubscribes.push(subscribeKey(state, key, () => {
          ui.heatVisualsUI?.updateHeatVisuals?.();
          ui.deviceFeatures?.updateAppBadge?.();
        }));
      }
    }
    if (state.pause !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "pause", () => ui.deviceFeatures?.updateAppBadge?.()));
    }
    ui.deviceFeatures?.updateAppBadge?.();
    const runAffordabilityCascade = () => {
      const g = this.game;
      if (!g) return;
      try {
        const moneyVal = g.state?.current_money;
        const epVal = g.state?.current_exotic_particles;
        if (ui.last_money !== undefined) ui.last_money = moneyVal;
        if (ui.last_exotic_particles !== undefined) ui.last_exotic_particles = epVal;
        g.partset?.check_affordability?.(g);
        g.upgradeset?.check_affordability?.(g);
        if (g.tooltip_manager) g.tooltip_manager.updateUpgradeAffordability?.();
        if (ui.uiState) {
          ui.uiState.has_affordable_upgrades = g.upgradeset?.hasAffordableUpgrades?.() ?? false;
          ui.uiState.has_affordable_research = g.upgradeset?.hasAffordableResearch?.() ?? false;
        }
        ui.navIndicatorsUI?.updateNavIndicators?.();
        if (typeof ui.partsPanelUI?.updateQuickSelectSlots === "function") ui.partsPanelUI.updateQuickSelectSlots();
      } catch (err) {
        const msg = err?.message ?? "";
        if (!msg.includes("ChildPart") || !msg.includes("parentNode")) throw err;
      }
    };
    if (state.current_money !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_money", runAffordabilityCascade));
    }
    if (state.current_exotic_particles !== undefined) {
      this._stateUnsubscribes.push(subscribeKey(state, "current_exotic_particles", runAffordabilityCascade));
    }
    runAffordabilityCascade();
  }
  setVar(key, value) {
    if (!this.game?.state) return;
    if (key === "exotic_particles") {
      this.game.exoticParticleManager.exotic_particles = value;
      return;
    }
    if (key === "total_heat") {
      this.game.state.stats_heat_generation = value;
      return;
    }
    const oldValue = this.game.state[key];
    const toggleKeys = ["pause", "auto_sell", "auto_buy", "time_flux", "heat_control"];
    const decimalKeys = ["current_heat", "current_power", "current_money", "current_exotic_particles", "total_exotic_particles", "reality_flux"];
    const isToggle = toggleKeys.includes(key);
    if (isToggle) value = Boolean(value);
    const isDecimalKey = decimalKeys.includes(key);
    if (!isDecimalKey && oldValue === value) return;

    if (isDecimalKey || (value != null && typeof value.gte === "function")) {
      setDecimal(this.game.state, key, value);
    } else {
      this.game.state[key] = value;
    }

    if (isToggle) {
      this.game.onToggleStateChange?.(key, value);
    }
  }
  getVar(key) {
    if (!this.game?.state) return undefined;
    if (key === "exotic_particles") return this.game.exoticParticleManager?.exotic_particles;
    if (key === "total_heat") return this.game.state.stats_heat_generation;
    return this.game.state[key];
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.ui?.uiState?.interaction) {
      this.ui.uiState.interaction.selectedPartId = part?.id ?? null;
    }
    if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
      this.game.state.parts_panel_version++;
    }
    if (this.game?.emit) this.game.emit("partSelected", { part });
    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile && part && !skipOpenPanel) {
      const uiState = this.ui?.uiState;
      if (uiState) uiState.parts_panel_collapsed = false;
      else {
        const partsSection = document.getElementById("parts_section");
        if (partsSection) partsSection.classList.remove("collapsed");
      }
      this.ui.partsPanelUI.updatePartsPanelBodyClass();
      const partsSection = document.getElementById("parts_section");
      if (partsSection) void partsSection.offsetHeight;
    }
    if (part) {
      const inQuickSelect = this.getQuickSelectSlots().some((s) => s.partId === part.id);
      if (!inQuickSelect) this.pushLastUsedPart(part);
    }
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.gridInteractionUI.clearSegmentHighlight();
    }
  }
  getClickedPart() {
    return this.clicked_part;
  }

  pushLastUsedPart(part) {
    const id = part?.id;
    if (!id) return;
    const slots = this.quickSelectSlots;
    const seen = new Set();
    const order = [id, ...slots.map((s) => s.partId).filter(Boolean).filter((pid) => {
      if (pid === id || seen.has(pid)) return false;
      seen.add(pid);
      return true;
    })].slice(0, 5);
    const lockedPartIds = new Set(slots.map((s, i) => slots[i].locked && s.partId).filter(Boolean));
    const available = order.filter((pid) => !lockedPartIds.has(pid));
    for (let i = 0; i < 5; i++) {
      if (slots[i].locked) continue;
      slots[i].partId = available.shift() ?? null;
    }
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  getQuickSelectSlots() {
    return this.quickSelectSlots.map((s) => ({ partId: s.partId, locked: s.locked }));
  }

  normalizeQuickSelectSlotsForUnlock() {
    const unlockManager = this.game?.unlockManager;
    if (!this.game?.partset || !unlockManager) return;
    for (let i = 0; i < this.quickSelectSlots.length; i++) {
      const s = this.quickSelectSlots[i];
      if (!s.partId) continue;
      const part = this.game.partset.getPartById(s.partId);
      if (!part || !unlockManager.isPartUnlocked(part)) {
        this.quickSelectSlots[i] = { partId: null, locked: false };
      }
    }
  }

  setQuickSelectLock(index, locked) {
    if (index < 0 || index > 4) return;
    this.quickSelectSlots[index].locked = locked;
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  setQuickSelectSlots(slots) {
    const normalized = Array.from({ length: 5 }, (_, i) => {
      const s = slots?.[i];
      return {
        partId: s?.partId ?? null,
        locked: !!s?.locked,
      };
    });
    this.quickSelectSlots = normalized;
    if (typeof this.ui.partsPanelUI?.updateQuickSelectSlots === "function") this.ui.partsPanelUI.updateQuickSelectSlots();
  }

  updatePartsPanelToggleIcon(_part) {}

  handleObjectiveCompleted() {
    const objectives = this.ui.registry?.get?.("Objectives");
    if (objectives?.markComplete) objectives.markComplete();
  }
  handleUpgradeAdded(game, upgrade_obj) {
    const expandUpgradeIds = ["expand_reactor_rows", "expand_reactor_cols"];
    if (expandUpgradeIds.includes(upgrade_obj.upgrade.id)) {
      return;
    }
    const normalizeKey = (key) => {
      const map = {
        cell_power: "cell_power_upgrades",
        cell_tick: "cell_tick_upgrades",
        cell_perpetual: "cell_perpetual_upgrades",
        exchangers: "exchanger_upgrades",
        vents: "vent_upgrades",
        other: "other_upgrades",
      };
      return map[key] || key;
    };
    const locationKey = normalizeKey(upgrade_obj.upgrade.type);
    const upgrades = this.ui.registry?.get?.("Upgrades");
    if (!upgrades?.getUpgradeContainer?.(locationKey)) {
      if (this.debugMode) {
        logger.log('warn', 'game', `Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
      }
      return;
    }
    const upgradeEl = upgrade_obj.createElement();
    if (upgradeEl) {
      upgrade_obj.$el = upgradeEl;
      upgradeEl.upgrade_object = upgrade_obj;
      upgrades.appendUpgrade(locationKey, upgradeEl);
    }
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    tile.tile_index = tile.row * game.max_cols + tile.col;
  }
  game_reset() {
    if (this.game?.state) {
      setDecimal(this.game.state, "current_money", this.game.base_money);
      setDecimal(this.game.state, "current_power", 0);
      setDecimal(this.game.state, "current_heat", 0);
      this.game.state.max_power = this.game.reactor.base_max_power;
      this.game.state.max_heat = this.game.reactor.base_max_heat;
    }
    // Ensure any progress-based gating resets as well
    try {
      if (this.game) {
        this.game.placedCounts = {};
        this.game._suppressPlacementCounting = false;
      }
    } catch (_) { }
  }

  getAllVars() {
    return { ...this.game?.state };
  }

  // Function to add part icons to objective titles
  addPartIconsToTitle(title) {
    return addPartIconsToTitleHelper(this.game, title);
  }

  handleObjectiveLoaded(objective, objectiveIndex = null) {
    const isNewGame = objectiveIndex === 0 && !this.game?._saved_objective_index;
    if (isNewGame && this.ui.uiState) {
      this.ui.uiState.objectives_toast_expanded = true;
    }
    if (!objective?.completed) {
      const toastBtn = this.ui.coreLoopUI?.getElement?.("objectives_toast_btn") ?? (typeof document !== "undefined" ? document.getElementById("objectives_toast_btn") : null);
      if (toastBtn) toastBtn.classList.remove("is-complete", "objective-completed");
    }
    if (objective?.title) {
      setTimeout(() => this.checkObjectiveTextScrolling(), 0);
    }
  }

  handleObjectiveUnloaded() {
    // No-op for now. Could add animation or clearing logic here if desired.
  }

  getObjectiveScrollDuration() {
    return getObjectiveScrollDurationHelper();
  }

  checkObjectiveTextScrolling() {
    const objectives = this.ui.registry?.get?.("Objectives");
    if (objectives?.checkTextScrolling) objectives.checkTextScrolling();
    else checkObjectiveTextScrollingHelper(this.ui.DOMElements);
  }
}

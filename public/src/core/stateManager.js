import { MOBILE_BREAKPOINT_PX } from "./constants.js";
import { logger } from "../utils/logger.js";
import { addPartIconsToTitle as addPartIconsToTitleHelper, getObjectiveScrollDuration as getObjectiveScrollDurationHelper, checkObjectiveTextScrolling as checkObjectiveTextScrollingHelper } from "./objective/objectiveUIHelper.js";
import { BaseComponent } from "../components/BaseComponent.js";

export class StateManager extends BaseComponent {
  constructor(ui) {
    super();
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.vars = new Map();
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
    const state = gameInstance?.state;
    if (!state) return;
    const storeKeys = [
      "current_money", "current_power", "current_heat", "current_exotic_particles",
      "total_exotic_particles", "reality_flux",
      "max_power", "max_heat", "stats_power", "stats_heat_generation",
      "stats_vent", "stats_inlet", "stats_outlet", "stats_net_heat",
      "stats_total_part_heat", "stats_cash", "engine_status",
      "power_delta_per_tick", "heat_delta_per_tick", "melting_down",
      "auto_sell", "auto_buy", "heat_control", "time_flux", "pause",
    ];
    for (const key of storeKeys) {
      if (state[key] !== undefined) this.setVar(key, state[key]);
    }
    const ep = gameInstance?.exoticParticleManager?.exotic_particles;
    if (ep !== undefined) this.setVar("exotic_particles", ep);
  }
  setVar(key, value) {
    const oldValue = this.vars.get(key);
    if (oldValue === value) {
      return;
    }
    this.vars.set(key, value);
    if (this.ui?.update_vars) this.ui.update_vars.set(key, value);
    if (this.game && this.game.onToggleStateChange) {
      if (
        [
          "pause",
          "auto_sell",
          "auto_buy",
          "time_flux",
          "heat_control",
        ].includes(key)
      ) {
        this.game.onToggleStateChange(key, value);
      }
    }
  }
  getVar(key) {
    return this.vars.get(key);
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    if (this.game?.emit) this.game.emit("partSelected", { part });
    const partActive = !!part;
    this.ui.DOMElements.main.classList.toggle("part_active", partActive);

    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
    if (isMobile) {
      const partsSection = !skipOpenPanel ? document.getElementById("parts_section") : null;
      if (partsSection && partActive) partsSection.classList.remove("collapsed");
      this.ui.partsPanelUI.updatePartsPanelBodyClass();
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
    const toastBtn = this.ui.DOMElements.objectives_toast_btn;
    if (!toastBtn) return;

    toastBtn.classList.add("is-complete");
    if (typeof this.ui.objectivesUI?.animateObjectiveCompletion === "function") {
      this.ui.objectivesUI.animateObjectiveCompletion();
    }
  }
  handlePartAdded(game, part_obj) {
    if (part_obj.erequires) {
      const required_upgrade = this.game?.upgradeset.getUpgrade(
        part_obj.erequires
      );
      if (!required_upgrade) return;
      const doctrineLocked = this.game?.partset?.isPartDoctrineLocked(part_obj);
      if (!doctrineLocked && required_upgrade.level < 1) return;
    }

    // Apply gating rules: show/hide and lock based on previous tier count
    const unlockManager = this.ui?.game?.unlockManager;
    const shouldShow = unlockManager ? unlockManager.shouldShowPart(part_obj) : true;
    if (!shouldShow) {
      return; // Do not render this part in the panel yet
    }

    // Use the Part class's createElement method for consistent element creation
    const part_el = part_obj.createElement();
    if (!part_el || typeof part_el.querySelector !== "function" || typeof part_el.classList?.add !== "function") {
      return;
    }
    part_obj.$el = part_el; // Assign the element back to the object
    part_el._part = part_obj; // Assign the object to the element for event handlers

    // Add/Update progress counter for parts that are shown but locked
    const prevCount = unlockManager ? unlockManager.getPreviousTierCount(part_obj) : 0;
    const unlocked = unlockManager ? unlockManager.isPartUnlocked(part_obj) : true;
    if (!unlocked) {
      part_el.classList.add("locked-by-tier");
      if (this.game?.partset?.isPartDoctrineLocked(part_obj)) {
        part_el.classList.add("doctrine-locked");
      }
      let counter = part_el.querySelector(".tier-progress");
      if (!counter) {
        counter = document.createElement("div");
        counter.className = "tier-progress";
        part_el.appendChild(counter);
      }
      counter.textContent = `${Math.min(prevCount, 10)}/10`;
      counter.style.display = "block";
      part_el.disabled = true;
    }
    else {
      // If this part just became unlocked, ensure the next tier becomes visible with its own counter
      // We simply hide this part's counter, as the next item will be handled separately when rendered
      const counter = part_el.querySelector(".tier-progress");
      if (counter) counter.style.display = "none";
    }

    let containerKey = part_obj.category + "s";
    const categoryToContainerMap = {
      coolant_cell: "coolantCells",
      reactor_plating: "reactorPlatings",
      heat_exchanger: "heatExchangers",
      heat_inlet: "heatInlets",
      heat_outlet: "heatOutlets",
      particle_accelerator: "particleAccelerators",
      valve: part_obj.valve_group ? part_obj.valve_group + "Valves" : "valves",
    };
    if (categoryToContainerMap[part_obj.category]) {
      containerKey = categoryToContainerMap[part_obj.category];
    }

    let container = this.ui.DOMElements[containerKey] || document.getElementById(containerKey);
    if (container && !this.ui.DOMElements[containerKey]) {
      this.ui.DOMElements[containerKey] = container;
    }

    if (container) {
      container.appendChild(part_el);
    } else {
      // Only log error in development mode or when debugging is explicitly enabled
      if (this.debugMode) {
        logger.log('warn', 'game', `Container ${containerKey} not found for part ${part_obj.id} (category: ${part_obj.category})`);
      }
    }
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
    let locationKey = normalizeKey(upgrade_obj.upgrade.type);
    
    let container = this.ui.DOMElements?.[locationKey] || document.getElementById(locationKey);
    if (!container) {
      if (this.debugMode) {
        logger.log('warn', 'game', `Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
      }
      return;
    }
    
    if (container && !this.ui.DOMElements?.[locationKey]) {
      this.ui.DOMElements[locationKey] = container;
    }
    
    const upgradeEl = upgrade_obj.createElement();
    if (upgradeEl) {
      upgrade_obj.$el = upgradeEl;
      upgradeEl.upgrade_object = upgrade_obj;
      container.appendChild(upgradeEl);
    }
  }
  handleTileAdded(game, tile_data) {
    const tile = tile_data;
    tile.tile_index = tile.row * game.max_cols + tile.col;
  }
  game_reset() {
    this.setVar("current_money", this.game.base_money);
    this.setVar("current_power", 0);
    this.setVar("current_heat", 0);
    this.setVar("max_power", this.game.reactor.base_max_power);
    this.setVar("max_heat", this.game.reactor.base_max_heat);
    // Ensure any progress-based gating resets as well
    try {
      if (this.game) {
        this.game.placedCounts = {};
        this.game._suppressPlacementCounting = false;
      }
    } catch (_) { }
  }

  getAllVars() {
    const vars = {};
    for (const [key, value] of this.vars.entries()) {
      vars[key] = value;
    }
    return vars;
  }

  // Function to add part icons to objective titles
  addPartIconsToTitle(title) {
    return addPartIconsToTitleHelper(this.game, title);
  }

  handleObjectiveLoaded(objective, objectiveIndex = null) {
    const toastTitleEl = this.ui.DOMElements.objectives_toast_title;
    const toastBtn = this.ui.DOMElements.objectives_toast_btn;
    if (toastTitleEl && objective.title) {
      const currentIndex = objectiveIndex !== null ? objectiveIndex : (this.game?.objectives_manager?.current_objective_index ?? 0);
      const objectiveNumber = currentIndex + 1;
      const displayTitle = `${objectiveNumber}: ${objective.title}`;
      toastTitleEl.textContent = displayTitle;
      this.checkObjectiveTextScrolling();
    }
    if (toastBtn) {
      toastBtn.classList.toggle("is-complete", !!objective.completed);
      toastBtn.classList.toggle("is-active", !objective.completed);
      const iconEl = toastBtn.querySelector(".objectives-toast-icon");
      if (iconEl) iconEl.textContent = objective.completed ? "!" : "?";
      const isNewGame = objectiveIndex === 0 && !this.game?._saved_objective_index;
      if (isNewGame && !toastBtn.classList.contains("is-expanded")) {
        toastBtn.classList.add("is-expanded");
        toastBtn.setAttribute("aria-expanded", "true");
      }
    }
  }

  handleObjectiveUnloaded() {
    // No-op for now. Could add animation or clearing logic here if desired.
  }

  getObjectiveScrollDuration() {
    return getObjectiveScrollDurationHelper();
  }

  // Always enable objective text scrolling
  checkObjectiveTextScrolling() {
    checkObjectiveTextScrollingHelper(this.ui.DOMElements);
  }
}

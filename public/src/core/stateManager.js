import { numFormat as fmt } from "../utils/util.js";
export class StateManager {
  constructor(ui) {
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.vars = new Map();
    this.quickSelectSlots = Array.from({ length: 5 }, () => ({ partId: null, locked: false }));
  }
  setGame(gameInstance) {
    this.game = gameInstance;
  }
  setVar(key, value) {
    const oldValue = this.vars.get(key);
    if (oldValue === value) {
      if (key === "time_flux") {
        console.log(`[TIME FLUX] StateManager.setVar: value unchanged (${value}), skipping`);
      }
      return;
    }
    if (key === "time_flux") {
      console.log(`[TIME FLUX] StateManager.setVar: ${oldValue} -> ${value}, game exists: ${!!this.game}, game.time_flux before: ${this.game?.time_flux}`);
    }
    this.vars.set(key, value);
    this.ui.update_vars.set(key, value);
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
        if (key === "time_flux") {
          console.log(`[TIME FLUX] StateManager calling game.onToggleStateChange("${key}", ${value})`);
        }
        this.game.onToggleStateChange(key, value);
      }
    }
  }
  getVar(key) {
    return this.vars.get(key);
  }
  setClickedPart(part, options = {}) {
    this.clicked_part = part;
    const partActive = !!part;
    this.ui.DOMElements.main.classList.toggle("part_active", partActive);

    this.updatePartsPanelToggleIcon(part);

    const skipOpenPanel = options.skipOpenPanel === true;
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 900;
    if (isMobile && !skipOpenPanel) {
      const partsSection = document.getElementById("parts_section");
      if (partsSection) {
        if (partActive) {
          partsSection.classList.remove("collapsed");
        }
        this.ui.updatePartsPanelBodyClass();
        void partsSection.offsetHeight;
      }
    } else if (isMobile && skipOpenPanel) {
      this.ui.updatePartsPanelBodyClass();
    }
    if (part) {
      const inQuickSelect = this.getQuickSelectSlots().some((s) => s.partId === part.id);
      if (!inQuickSelect) this.pushLastUsedPart(part);
    }
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.clearSegmentHighlight();
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
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
  }

  getQuickSelectSlots() {
    return this.quickSelectSlots.map((s) => ({ partId: s.partId, locked: s.locked }));
  }

  normalizeQuickSelectSlotsForUnlock() {
    if (!this.game?.partset || typeof this.game.isPartUnlocked !== "function") return;
    for (let i = 0; i < this.quickSelectSlots.length; i++) {
      const s = this.quickSelectSlots[i];
      if (!s.partId) continue;
      const part = this.game.partset.getPartById(s.partId);
      if (!part || !this.game.isPartUnlocked(part)) {
        this.quickSelectSlots[i] = { partId: null, locked: false };
      }
    }
  }

  setQuickSelectLock(index, locked) {
    if (index < 0 || index > 4) return;
    this.quickSelectSlots[index].locked = locked;
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
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
    if (typeof this.ui.updateQuickSelectSlots === "function") this.ui.updateQuickSelectSlots();
  }

  updatePartsPanelToggleIcon(_part) {}

  handleObjectiveCompleted() {
    const toastBtn = this.ui.DOMElements.objectives_toast_btn;
    if (!toastBtn) return;

    toastBtn.classList.add("is-complete");
    if (typeof this.ui.animateObjectiveCompletion === "function") {
      this.ui.animateObjectiveCompletion();
    }
  }
  handlePartAdded(game, part_obj) {
    if (part_obj.erequires) {
      const required_upgrade = this.game?.upgradeset.getUpgrade(
        part_obj.erequires
      );
      if (!required_upgrade || required_upgrade.level < 1) {
        return;
      }
    }

    // Apply gating rules: show/hide and lock based on previous tier count
    const shouldShow = this.ui?.game?.shouldShowPart(part_obj);
    if (!shouldShow) {
      return; // Do not render this part in the panel yet
    }

    // Use the Part class's createElement method for consistent element creation
    const part_el = part_obj.createElement();
    part_obj.$el = part_el; // Assign the element back to the object
    part_el._part = part_obj; // Assign the object to the element for event handlers

    // Add/Update progress counter for parts that are shown but locked
    const prevCount = this.ui?.game?.getPreviousTierCount(part_obj) || 0;
    const unlocked = this.ui?.game?.isPartUnlocked(part_obj);
    if (!unlocked) {
      part_el.classList.add("locked-by-tier");
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
        console.warn(`Container ${containerKey} not found for part ${part_obj.id} (category: ${part_obj.category})`);
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
        console.warn(`Container with ID '${locationKey}' not found for upgrade '${upgrade_obj.id}'`);
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
    if (typeof title !== 'string') return title;

    const partMappings = {
      'Quad Plutonium Cells': './img/parts/cells/cell_2_4.png',
      'Quad Thorium Cells': './img/parts/cells/cell_3_4.png',
      'Quad Seaborgium Cells': './img/parts/cells/cell_4_4.png',
      'Quad Dolorium Cells': './img/parts/cells/cell_5_4.png',
      'Quad Nefastium Cells': './img/parts/cells/cell_6_4.png',
      'Particle Accelerators': './img/parts/accelerators/accelerator_1.png',
      'Plutonium Cells': './img/parts/cells/cell_2_1.png',
      'Thorium Cells': './img/parts/cells/cell_3_1.png',
      'Seaborgium Cells': './img/parts/cells/cell_4_1.png',
      'Dolorium Cells': './img/parts/cells/cell_5_1.png',
      'Nefastium Cells': './img/parts/cells/cell_6_1.png',
      'Heat Vent': './img/parts/vents/vent_1.png',
      'Capacitors': './img/parts/capacitors/capacitor_1.png',
      'Dual Cell': './img/parts/cells/cell_1_2.png',
      'Uranium Cell': './img/parts/cells/cell_1_1.png',
      'Capacitor': './img/parts/capacitors/capacitor_1.png',
      'Cells': './img/parts/cells/cell_1_1.png',
      'Cell': './img/parts/cells/cell_1_1.png',
      'experimental part': './img/parts/cells/xcell_1_1.png',
      'Improved Chronometers upgrade': './img/upgrades/upgrade_flux.png',
      'Improved Chronometers': './img/upgrades/upgrade_flux.png',
      'Power': './img/ui/icons/icon_power.png',
      'Heat': './img/ui/icons/icon_heat.png',
      'Exotic Particles': '🧬'
    };

    let processedTitle = title;

    // Sort part mappings by length (longest first) to avoid partial matches
    const sortedMappings = Object.entries(partMappings).sort((a, b) => b[0].length - a[0].length);

    // Use a placeholder system to prevent nested replacements
    const placeholders = new Map();
    let placeholderCounter = 0;

    // Replace part names with icons + names (only first occurrence)
    for (const [partName, iconPath] of sortedMappings) {
      const isEmoji = iconPath.length === 1 || iconPath.match(/^[^a-zA-Z0-9./]/);
      const escapedPartName = partName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escapedPartName.replace(/\s+/g, '\\s+')}\\b`, 'i');
      if (isEmoji) {
        processedTitle = processedTitle.replace(regex, `${iconPath} ${partName}`);
      } else {
        // It's an image path, create img tag (only first occurrence)
        const iconHtml = `<img src=\"${iconPath}\" class=\"objective-part-icon\" alt=\"${partName}\" title=\"${partName}\">`;
        processedTitle = processedTitle.replace(regex, (match) => {
          const placeholder = `__PLACEHOLDER_${placeholderCounter}__`;
          placeholders.set(placeholder, `${iconHtml} ${partName}`);
          placeholderCounter++;
          return placeholder;
        });
      }
    }

    // Replace all placeholders with actual HTML
    for (const [placeholder, replacement] of placeholders) {
      processedTitle = processedTitle.replace(placeholder, replacement);
    }

    // Format all numbers in the title using numFormat
    processedTitle = processedTitle.replace(/\$?\d{1,3}(?:,\d{3})+|\$?\d{4,}/g, (match) => {
      // Remove $ for formatting, add back if present
      const hasDollar = match.startsWith('$');
      const numStr = match.replace(/[^\d]/g, '');
      const formatted = fmt(Number(numStr));
      return hasDollar ? ('$' + formatted) : formatted;
    });

    // Debug logging - only in development mode
    if (processedTitle !== title && typeof process !== 'undefined' && process.env.NODE_ENV === 'development') {
      this.game.logger?.debug('Part icons added to objective title:', {
        original: title,
        processed: processedTitle
      });
    }

    return processedTitle;
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
    const baseWidth = 900;
   const baseDuration = 8;
    const screenWidth = (typeof window !== 'undefined' && window.innerWidth) ? window.innerWidth : baseWidth;
    const duration = baseDuration * (screenWidth / baseWidth);
    return Math.max(5, Math.min(18, duration));
  }

  // Always enable objective text scrolling
  checkObjectiveTextScrolling() {
    const toastTitleEl = this.ui.DOMElements.objectives_toast_title;
    if (toastTitleEl) {
      const duration = this.getObjectiveScrollDuration();
      toastTitleEl.style.animation = `scroll-objective-title ${duration}s linear infinite`;
    }
  }
}

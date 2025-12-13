import { numFormat as fmt } from "../utils/util.js";
export class StateManager {
  constructor(ui) {
    this.ui = ui;
    this.clicked_part = null;
    this.game = null;
    this.vars = new Map();
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
  setClickedPart(part) {
    this.clicked_part = part;
    const partActive = !!part;
    this.ui.DOMElements.main.classList.toggle("part_active", partActive);

    // Update the parts panel toggle with selected part icon
    this.updatePartsPanelToggleIcon(part);

    // If the newly selected part is not a heat component, clear any active segment highlight
    const heatComponentCategories = ['vent', 'heat_exchanger', 'heat_inlet', 'heat_outlet', 'coolant_cell', 'reactor_plating'];
    if (!part || !heatComponentCategories.includes(part.category)) {
      this.ui.clearSegmentHighlight();
    }
  }
  getClickedPart() {
    return this.clicked_part;
  }

  updatePartsPanelToggleIcon(part) {
    const toggle = this.ui.DOMElements.parts_panel_toggle;
    if (!toggle) return;

    // Check if we're on desktop where the toggle is hidden
    const isDesktop = window.innerWidth > 900;
    if (isDesktop) {
      // On desktop, the toggle button is hidden, so we don't need to update it
      return;
    }

    // Remove existing selected part icon
    let icon = toggle.querySelector('.selected-part-icon');
    if (!icon) {
      icon = document.createElement('div');
      icon.className = 'selected-part-icon';
      toggle.appendChild(icon);
    }

    if (part) {
      // Set the part image as background
      icon.style.backgroundImage = `url('${part.getImagePath()}')`;
      icon.classList.add('visible');
      icon.title = `Selected: ${part.title}`;
    } else {
      // Hide the icon when no part is selected
      icon.classList.remove('visible');
      icon.style.backgroundImage = '';
      icon.title = '';
    }
  }

  handleObjectiveCompleted() {
    if (this.ui.DOMElements.objectives_section) {
      const section = this.ui.DOMElements.objectives_section;

      // Add completed class for green border and glow
      section.classList.add("completed");

      // Add flash class for completion animation
      section.classList.add("flash");

      if (typeof document !== 'undefined' && document.createElement && section && section.appendChild) {
        // Minimal confetti - just a few particles
        const confettiColors = [
          "rgba(89, 196, 53, 0.8)",
          "rgba(255, 255, 255, 0.6)",
        ];
        // Spawn fewer, subtler confetti
        for (let i = 0; i < 5; i++) {
          const conf = document.createElement("span");
          conf.className = "confetti";
          conf.style.background =
            confettiColors[Math.floor(Math.random() * confettiColors.length)];
          conf.style.left = `${30 + Math.random() * 40}%`;
          conf.style.top = `${20 + Math.random() * 20}%`;
          conf.style.transform = `rotate(${Math.random() * 180}deg)`;
          conf.style.animationDelay = `${Math.random() * 0.1}s`;
          
          try {
            section.appendChild(conf);
            setTimeout(() => conf.remove(), 800);
          } catch (e) {
            // Ignore append errors in test environments (e.g., node vs jsdom type mismatch)
          }
        }
      }

      setTimeout(() => {
        section.classList.remove("flash");
      }, 800);
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
    // Only add tiles within the current active area
    if (tile.row >= game.rows || tile.col >= game.cols) {
      // Remove from DOM if present
      if (tile.$el && tile.$el.parentNode) {
        tile.$el.parentNode.removeChild(tile.$el);
      }
      return;
    }
    // Create tile element if it doesn't exist
    let tile_el = tile.$el;
    if (!tile_el) {
      tile_el = document.createElement("button");
      tile_el.className = "tile";
      tile_el.dataset.row = tile.row;
      tile_el.dataset.col = tile.col;
      tile.tile_index = tile.row * game.max_cols + tile.col;
      tile_el.tile = tile;
      tile.$el = tile_el;

      // --- Begin: Updated percent bar logic ---
      const percent_wrapper_wrapper = document.createElement("div");
      percent_wrapper_wrapper.className = "percent_wrapper_wrapper";
      const percent_wrapper = document.createElement("div");
      percent_wrapper.className = "percent_wrapper";

      // Add heat bar if part has base_containment or containment (but not for valves)
      if (tile.part && (tile.part.base_containment > 0 || (tile.part.containment > 0 && tile.part.category !== "valve"))) {
        const heatBar = document.createElement("div");
        heatBar.className = "percent heat";
        percent_wrapper.appendChild(heatBar);
        tile.$heatBar = heatBar;
      }

      // Add durability bar if part has base_ticks
      else if (tile.part && tile.part.base_ticks > 0) {
        const durabilityBar = document.createElement("div");
        durabilityBar.className = "percent durability";
        percent_wrapper.appendChild(durabilityBar);
        tile.$durabilityBar = durabilityBar;
      }

      percent_wrapper_wrapper.appendChild(percent_wrapper);
      tile_el.appendChild(percent_wrapper_wrapper);
      // --- End: Updated percent bar logic ---

      // Add sell indicator element
      const sellIndicator = document.createElement("div");
      sellIndicator.className = "sell-indicator";
      tile_el.appendChild(sellIndicator);
      // Debug log for tile creation
      // console.log(
      //   "[StateManager] Created tile element for tile:",
      //   tile.row,
      //   tile.col,
      //   tile
      // );
    }
    // Add enabled class if needed
    if (tile.enabled) {
      tile.$el.classList.add("enabled");
    } else {
      tile.$el.classList.remove("enabled");
    }
    // Only append if not already in DOM
    if (this.ui.DOMElements.reactor && !tile_el.parentNode) {
      this.ui.DOMElements.reactor.appendChild(tile_el);
      // Debug log for tile appending
      // console.log(
      //   "[StateManager] Appended tile to DOM:",
      //   tile.row,
      //   tile.col,
      //   tile
      // );
    }
  }
  game_reset() {
    this.setVar("current_money", this.game.base_money);
    this.setVar("current_power", 0);
    this.setVar("current_heat", 0);
    this.setVar("max_power", this.game.base_max_power);
    this.setVar("max_heat", this.game.base_max_heat);
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
    // Update the current objective title and reward
    const titleEl = this.ui.DOMElements.objective_current_title;
    const rewardEl = this.ui.DOMElements.objective_reward;
    const oldObjectivesEl = this.ui.DOMElements.objectives_old;
    if (titleEl && objective.title) {
      // Move the previous objective to the old objectives list
      const prevTitle = titleEl.textContent;
      if (prevTitle && prevTitle !== objective.title && oldObjectivesEl) {
        const oldObj = document.createElement("div");
        oldObj.className = "objective-old";
        // Use innerHTML to preserve any existing part icons
        oldObj.innerHTML = titleEl.innerHTML || prevTitle;
        oldObjectivesEl.prepend(oldObj);
      }
      // Set the new objective with objective number prefix and part icons
      // Use the passed index if available, otherwise fall back to the objective manager
      const currentIndex = objectiveIndex !== null ? objectiveIndex : (this.game?.objectives_manager?.current_objective_index ?? 0);
      const objectiveNumber = currentIndex + 1;
      const processedTitle = this.addPartIconsToTitle(objective.title);
      titleEl.innerHTML = `${objectiveNumber}: ${processedTitle}`;

      // Add green border if completed
      const objectivesSection = this.ui.DOMElements.objectives_section;
      if (objective.completed) {
        objectivesSection?.classList.add('completed');
        titleEl.classList.add('completed');
      } else {
        objectivesSection?.classList.remove('completed');
        titleEl.classList.remove('completed');
      }

      // Always add scrolling animation for objective text
      setTimeout(() => {
        const duration = this.getObjectiveScrollDuration();
        titleEl.style.animation = `scroll-objective-title ${duration}s linear infinite`;
      }, 100);
    }
    if (rewardEl && (objective.reward || objective.ep_reward)) {
      const isEpReward = objective.ep_reward !== undefined && objective.ep_reward !== null;
      const rewardValue = isEpReward ? objective.ep_reward : objective.reward;
      const formattedReward = fmt(rewardValue);

      if (objective.completed) {
        // Show claim button when completed
        rewardEl.innerHTML = `<button class="claim-btn" onclick="window.game.objectives_manager.claimObjective()">Claim +${formattedReward} ${isEpReward ? 'EP' : '$'}</button>`;
        rewardEl.classList.add('claimable');
      } else {
        // Show regular reward text when not completed
        const rewardText = isEpReward ? `+${formattedReward} EP` : `+${formattedReward} $`;
        rewardEl.textContent = rewardText;
        rewardEl.classList.remove('claimable');
      }

      // Update the icon based on reward type
      if (isEpReward) {
        rewardEl.style.setProperty('--reward-icon', 'url("../img/ui/icons/icon_power.png")');
      } else {
        rewardEl.style.setProperty('--reward-icon', 'url("../img/ui/icons/icon_cash.png")');
      }
    } else if (rewardEl) {
      rewardEl.textContent = "";
      rewardEl.style.setProperty('--reward-icon', 'none');
      rewardEl.classList.remove('claimable');
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
    return Math.max(4, Math.min(20, duration));
  }

  // Always enable objective text scrolling
  checkObjectiveTextScrolling() {
    const titleEl = this.ui.DOMElements.objective_current_title;
    if (titleEl) {
      const duration = this.getObjectiveScrollDuration();
      titleEl.style.animation = `scroll-objective-title ${duration}s linear infinite`;
    }
  }
}

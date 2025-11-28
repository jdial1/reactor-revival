import { Reactor } from "./reactor.js";
import { PartSet } from "./partset.js";
import { UpgradeSet } from "./upgradeset.js";
import { Tileset } from "./tileset.js";
import { Engine } from "./engine.js";
import { ObjectiveManager } from "./objective.js";
import { executeUpgradeAction } from "./upgradeActions.js";
import { Performance } from "./performance.js";
import { DebugHistory } from "../utils/debugHistory.js";

export class Game {
  constructor(ui_instance) {
    this.ui = ui_instance;
    this.router = null;
    this.version = "1.4.0";
    this.base_cols = 12;
    this.base_rows = 12;
    this.max_cols = 35;
    this.max_rows = 32;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
    this.offline_tick = true;
    this.base_loop_wait = 1000;
    this.base_manual_heat_reduce = 1;
    this.upgrade_max_level = 32;
    this.base_money = 10;
    this._current_money = 0;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;

    this.total_played_time = 0;
    this.session_start_time = null;
    this.last_save_time = null;

    this.tileset = new Tileset(this);
    this.partset = new PartSet(this);
    this.upgradeset = new UpgradeSet(this);
    this.reactor = new Reactor(this);
    this.engine = null;
    this.performance = new Performance(this);
    this.performance.enable();
    this.loop_wait = this.base_loop_wait;
    this.paused = false;
    this.auto_sell_disabled = false;
    this.auto_buy_disabled = false;
    this.time_flux = true;
    this.sold_power = false;
    this.sold_heat = false;
    this.objectives_manager = new ObjectiveManager(this);
    this.tooltip_manager = null;
    this.placedCounts = {}; // cumulative placements per `${type}:${level}`
    this._suppressPlacementCounting = false;
    this._unlockStates = {}; // track previous unlock state per part to avoid duplicate logs

    // Buffer for per-tick visual events produced by the engine
    this._visualEvents = [];
    this.debugHistory = new DebugHistory();
    this.undoHistory = [];
    this.audio = null;
  }

  // Returns how many parts of a given type and level are currently placed
  countPlacedParts(type, level) {
    if (!this.tileset || !this.tileset.tiles_list) return 0;
    let count = 0;
    for (const tile of this.tileset.tiles_list) {
      const tilePart = tile.part;
      if (tilePart && tilePart.type === type && tilePart.level === level) {
        count++;
      }
    }
    return count;
  }

  // For a part, returns the number of previous-tier parts placed (cumulative)
  getPreviousTierCount(part) {
    const prevSpec = this.getPreviousTierSpec(part);
    if (!prevSpec) return 0;
    return this.getPlacedCount(prevSpec.type, prevSpec.level);
  }

  // Resolve the previous step in the linear chain across types and levels within a category
  getPreviousTierSpec(part) {
    if (!part) return null;
    // Within the same type, previous level
    if (part.level && part.level > 1) {
      return { type: part.type, level: part.level - 1, category: part.category };
    }
    // For level 1, previous is the max level of the previous type within this category
    const orderIdx = this.partset?.typeOrderIndex?.get(`${part.category}:${part.type}`);
    const typeOrder = this.partset?.categoryTypeOrder?.get(part.category) || [];
    if (typeof orderIdx !== 'number' || orderIdx <= 0) return null;
    const prevType = typeOrder[orderIdx - 1];
    const prevMaxLevel = Math.max(
      1,
      ...(this.partset?.getPartsByType(prevType)?.map((p) => p.level) || [1])
    );
    return { type: prevType, level: prevMaxLevel, category: part.category };
  }

  // Returns true if the provided spec is the very first item in the category chain
  isFirstInChainSpec(spec) {
    if (!spec) return false;
    const idx = this.partset?.typeOrderIndex?.get(`${spec.category}:${spec.type}`);
    return (idx === 0) && spec.level === 1;
  }

  // Determine if a spec (type+level within a category) is unlocked by the 10-previous rule
  isSpecUnlocked(spec) {
    if (!spec) return false;
    const prev = this.getPreviousTierSpec({ type: spec.type, level: spec.level, category: spec.category });
    if (!prev) return true; // first in chain
    return this.getPlacedCount(prev.type, prev.level) >= 10;
  }

  // Determines if a part should be visible in the parts panel
  // Rule: level 1 and level 2 are shown. Level 3+ shown only after 10 of previous tier placed
  // Special case: valves are always visible and unlocked from the start
  shouldShowPart(part) {
    if (!part) return false;

    // Valves are always visible and unlocked from the start
    if (part.category === 'valve') return true;

    const prevSpec = this.getPreviousTierSpec(part);
    if (!prevSpec) return true; // first in chain is visible
    // Show the immediate next item after any unlocked item
    if (this.isSpecUnlocked(prevSpec)) return true;
    // Otherwise, hide until previous tier is unlocked
    return false;
  }

  // Determines if a part is unlocked (enabled) based on previous-tier progress
  // Rule: level 1 is unlocked. Level 2+ unlocked after 10 of previous tier
  // Special case: valves are always unlocked from the start
  isPartUnlocked(part) {
    if (!part || part.category === 'valve') {
      this.logger?.debug(`[UNLOCK] Part ${part?.id || 'null'}: Valve or null, unlocked by default.`);
      return true; // Valves are always unlocked
    }
    const prevSpec = this.getPreviousTierSpec(part);
    if (!prevSpec) {
      this.logger?.debug(`[UNLOCK] Part '${part.id}' is a base part (no prerequisite). Unlocked by default.`);
      return true; // It's a base part, so it's unlocked
    }
    const count = this.getPlacedCount(prevSpec.type, prevSpec.level);
    const isUnlocked = count >= 10;
    const partId = part.id;
    const wasUnlocked = this._unlockStates[partId] || false;
    
    if (isUnlocked && !wasUnlocked) {
      console.log(`[UNLOCK] '${partId}': ${count}/10 of '${prevSpec.type}:${prevSpec.level}' -> UNLOCKED`);
    }
    
    this._unlockStates[partId] = isUnlocked;
    this.logger?.debug(`[UNLOCK] Checking part '${part.id}': Requires 10 of '${prevSpec.type}:${prevSpec.level}'. Count: ${count}. Unlocked: ${isUnlocked}`);
    return isUnlocked;
  }

  // Cumulative placement tracking
  getPlacedCount(type, level) {
    const key = `${type}:${level}`;
    return this.placedCounts[key] || 0;
  }

  incrementPlacedCount(type, level) {
    if (this._suppressPlacementCounting) return;
    const key = `${type}:${level}`;
    this.placedCounts[key] = (this.placedCounts[key] || 0) + 1;
  }

  // Visual events API: engine enqueues, UI drains each frame
  enqueueVisualEvent(event) {
    if (!event) return;
    this._visualEvents.push(event);
  }

  enqueueVisualEvents(events) {
    if (!Array.isArray(events) || events.length === 0) return;
    // Avoid accidental huge spikes by soft-capping to a reasonable frame budget
    const maxBatch = 1000;
    if (this._visualEvents.length + events.length > maxBatch) {
      const remaining = Math.max(0, maxBatch - this._visualEvents.length);
      if (remaining > 0) this._visualEvents.push(...events.slice(0, remaining));
    } else {
      this._visualEvents.push(...events);
    }
  }

  drainVisualEvents() {
    if (!this._visualEvents || this._visualEvents.length === 0) {
      return [];
    }
    const out = this._visualEvents;
    this._visualEvents = [];
    return out;
  }
  async set_defaults() {
    const debugSetDefaults = typeof process !== 'undefined' && process.env.DEBUG_REBOOT === 'true';
    if (debugSetDefaults) {
      const epBeforeReset = {
        exotic_particles: this.exotic_particles,
        total_exotic_particles: this.total_exotic_particles,
        current_exotic_particles: this.current_exotic_particles
      };
      console.log(`[SET-DEFAULTS DEBUG] Resetting EP values:`);
      console.log(`[SET-DEFAULTS DEBUG]   Before reset: exotic_particles=${epBeforeReset.exotic_particles}, total_exotic_particles=${epBeforeReset.total_exotic_particles}, current_exotic_particles=${epBeforeReset.current_exotic_particles}`);
    }
    
    this.base_cols = 12;
    this.base_rows = 12;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
    this._current_money = this.base_money;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;
    
    if (debugSetDefaults) {
      console.log(`[SET-DEFAULTS DEBUG]   After reset: exotic_particles=${this.exotic_particles}, total_exotic_particles=${this.total_exotic_particles}, current_exotic_particles=${this.current_exotic_particles}`);
    }
    this.sold_power = false;
    this.sold_heat = false;
    this.reactor.setDefaults();
    this.upgradeset.reset();
    this.partset.reset();
    await this.partset.initialize(); // Await initialization
    await this.upgradeset.initialize(); // Await initialization
    // Recalculate all part stats after upgrades are freshly initialized to ensure no stale upgrade effects linger
    if (this.partset?.partsArray?.length) {
      console.log(`[SET-DEFAULTS DEBUG] Recalculating stats for ${this.partset.partsArray.length} parts`);
      this.partset.partsArray.forEach((part) => {
        try { 
          const epHeatBefore = part.ep_heat;
          part.recalculate_stats();
          if (part.id === 'particle_accelerator1' && epHeatBefore !== undefined && part.ep_heat !== epHeatBefore) {
            console.log(`[SET-DEFAULTS DEBUG] ep_heat changed for ${part.id} during set_defaults: ${epHeatBefore} -> ${part.ep_heat}`);
          }
        } catch (_) { /* no-op */ }
      });
    }
    this.upgradeset.check_affordability(this);
    // Clear cumulative placement counters for a fresh run
    this.placedCounts = {};
    this._suppressPlacementCounting = false;
    this.tileset.clearAllTiles();
    this.reactor.updateStats();

    // Clear all heat-related visual states after clearing tiles
    this.reactor.clearHeatVisualStates();

    // Clear all active animations to prevent visual spam after reset
    if (this.ui && typeof this.ui.clearAllActiveAnimations === 'function') {
      this.ui.clearAllActiveAnimations();
    }
    this.loop_wait = this.base_loop_wait;
    this.paused = false;

    this.session_start_time = null;
    this.total_played_time = 0;
    this.last_save_time = null;

    // Always reset objectives for a clean New Game state
    if (this.objectives_manager) {
      this.objectives_manager.current_objective_index = 0;
      if (this.objectives_manager.objectives_data) {
        this.objectives_manager.objectives_data.forEach(obj => {
          obj.completed = false;
        });
      }
      this.objectives_manager.set_objective(0, true);
    }
    if (this._saved_objective_index !== undefined) {
      this.debugHistory.add('game', 'Validating objective state after default set');
      this._validateObjectiveState();
    }
  }

  get current_money() {
    return this._current_money;
  }

  set current_money(value) {
    this._current_money = value;
  }

  addMoney(amount) {
    this._current_money += amount;
    this.ui.stateManager.setVar("current_money", this._current_money);
  }

  async initialize_new_game_state() {
    this.debugHistory.clear();
    await this.set_defaults();
    // Always clear meltdown state and update UI after new game
    this.reactor.clearMeltdownState();

    // Clear all active animations to prevent visual spam after new game
    if (this.ui && typeof this.ui.clearAllActiveAnimations === 'function') {
      this.ui.clearAllActiveAnimations();
    }

    this._current_money = this.base_money;
    this.ui.stateManager.setVar("current_money", this._current_money);
    this.ui.stateManager.setVar("stats_cash", this._current_money);
    this.ui.stateManager.setVar("current_exotic_particles", 0);
    this.ui.stateManager.setVar("total_exotic_particles", 0);
    this.ui.stateManager.setVar("exotic_particles", 0);
  }

  async startSession() {
    this.session_start_time = Date.now();
    this.last_save_time = Date.now();
    await this.objectives_manager.initialize();

    // Set initial objective after initialization is complete
    if (this._saved_objective_index === undefined) {
      this.objectives_manager.set_objective(0, true);
    }

    this.reactor.updateStats();
    this.upgradeset.check_affordability(this);
  }

  updateSessionTime() {
    if (this.session_start_time) {
      const sessionTime = Date.now() - this.session_start_time;
      this.total_played_time += sessionTime;
      this.session_start_time = Date.now();
    }
  }

  getFormattedTotalPlayedTime() {
    let totalTime = this.total_played_time;
    if (this.session_start_time) {
      totalTime += Date.now() - this.session_start_time;
    }
    return this.formatTime(totalTime);
  }

  formatTime(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000) % 60;
    const m = Math.floor(ms / (1000 * 60)) % 60;
    const h = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const d = Math.floor(ms / (1000 * 60 * 60 * 24));

    if (d > 0)
      return `${d}<span class="time-unit">d</span> ${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;

    if (h > 0)
      return `${h}<span class="time-unit">h</span> ${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;

    if (m > 0)
      return `${m}<span class="time-unit">m</span> ${s}<span class="time-unit">s</span>`;

    return `${s}<span class="time-unit">s</span>`;
  }

  update_cell_power() {
    if (!this.partset || !this.reactor) return;
    this.partset.updateCellPower();
    this.reactor.updateStats();
  }
  epart_onclick(purchased_upgrade) {
    if (
      !purchased_upgrade ||
      !purchased_upgrade.upgrade ||
      purchased_upgrade.level <= 0
    )
      return;
    this.upgradeset.getAllUpgrades().forEach((upg) => {
      if (
        upg.upgrade.type === "experimental_parts" &&
        upg.upgrade.id !== purchased_upgrade.upgrade.id
      ) {
        upg.updateDisplayCost();
      }
    });
    this.upgradeset.check_affordability(this);
  }
  manual_reduce_heat_action() {
    this.debugHistory.add('game', 'Manual heat reduction');
    this.reactor.manualReduceHeat();
  }
  sell_action() {
    if (this._current_money < 10 && this.reactor.current_power == 0) {
      const hasPartsToSell = this.tileset.active_tiles_list.some(
        (tile) => tile.part && !tile.part.isSpecialTile
      );

      if (!hasPartsToSell) {
        this.addMoney(10);
        this.debugHistory.add('game', 'Failsafe: +$10 added');
      }
    } else {
      this.reactor.sellPower();
    }
  }
  async reboot_action(keep_exotic_particles = false) {
    const debugReboot = typeof process !== 'undefined' && process.env.DEBUG_REBOOT === 'true';
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] ========== Reboot Action Starting ==========`);
      console.log(`[REBOOT DEBUG] keep_exotic_particles=${keep_exotic_particles}`);
      console.log(`[REBOOT DEBUG] PRE-REBOOT STATE:`);
      console.log(`[REBOOT DEBUG]   exotic_particles=${this.exotic_particles}`);
      console.log(`[REBOOT DEBUG]   total_exotic_particles=${this.total_exotic_particles}`);
      console.log(`[REBOOT DEBUG]   current_exotic_particles=${this.current_exotic_particles}`);
    }
    
    this.debugHistory.add('game', 'Reboot action initiated', { keep_exotic_particles });
    
    if (this.audio) {
      this.audio.play('reboot');
    }
    
    const savedTotalEp = this.total_exotic_particles;
    const savedCurrentEp = this.current_exotic_particles;
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] Saved EP values for restoration:`);
      console.log(`[REBOOT DEBUG]   savedTotalEp=${savedTotalEp}`);
      console.log(`[REBOOT DEBUG]   savedCurrentEp=${savedCurrentEp}`);
    }

    // If keeping EP, capture currently purchased EP-based upgrades (research) to restore after reset
    const preservedEpUpgrades = keep_exotic_particles
      ? this.upgradeset.getAllUpgrades()
        .filter((upg) => upg.base_ecost && upg.level > 0)
        .map((upg) => ({ id: upg.id, level: upg.level }))
      : [];
    try {
      if (keep_exotic_particles) {
        if (debugReboot) {
          console.log(`[REBOOT DEBUG] Preserving ${preservedEpUpgrades.length} EP-based upgrades:`, preservedEpUpgrades);
        }
        this.logger?.debug("[Reboot] Will preserve EP upgrades:", preservedEpUpgrades);
      }
    } catch (_) { }

    // Fully reset game state, parts, tiles, and upgrades
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] Calling set_defaults() - this will reset all EP values to 0`);
    }
    await this.set_defaults();
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] After set_defaults():`);
      console.log(`[REBOOT DEBUG]   exotic_particles=${this.exotic_particles} (should be 0)`);
      console.log(`[REBOOT DEBUG]   total_exotic_particles=${this.total_exotic_particles} (should be 0)`);
      console.log(`[REBOOT DEBUG]   current_exotic_particles=${this.current_exotic_particles} (should be 0)`);
    }

    // Always clear meltdown state and update UI after reboot
    this.reactor.clearMeltdownState();

    // Clear all active animations to prevent visual spam after reboot
    if (this.ui && typeof this.ui.clearAllActiveAnimations === 'function') {
      this.ui.clearAllActiveAnimations();
    }

    // Re-apply EP amounts per reboot mode
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] Restoring EP values (keep_exotic_particles=${keep_exotic_particles}):`);
    }
    if (keep_exotic_particles) {
      const beforeTotal = this.total_exotic_particles;
      const beforeCurrent = this.current_exotic_particles;
      this.total_exotic_particles = savedTotalEp;
      this.current_exotic_particles = savedCurrentEp;
      if (debugReboot) {
        console.log(`[REBOOT DEBUG]   KEEP mode: Restoring saved values`);
        console.log(`[REBOOT DEBUG]   total_exotic_particles: ${beforeTotal} -> ${this.total_exotic_particles} (from savedTotalEp=${savedTotalEp})`);
        console.log(`[REBOOT DEBUG]   current_exotic_particles: ${beforeCurrent} -> ${this.current_exotic_particles} (from savedCurrentEp=${savedCurrentEp})`);
      }
    } else {
      this.total_exotic_particles = 0;
      this.current_exotic_particles = 0;
      if (debugReboot) {
        console.log(`[REBOOT DEBUG]   REFUND mode: Setting all EP to 0`);
      }
    }

    // If keeping EP, restore previously purchased EP-based upgrades (research)
    if (keep_exotic_particles && preservedEpUpgrades.length > 0) {
      if (debugReboot) {
        console.log(`[REBOOT DEBUG] Restoring ${preservedEpUpgrades.length} EP-based upgrades...`);
      }
      preservedEpUpgrades.forEach(({ id, level }) => {
        const upg = this.upgradeset.getUpgrade(id);
        if (upg) {
          upg.setLevel(level);
          if (debugReboot) {
            console.log(`[REBOOT DEBUG]   Restored ${id} to level ${level}`);
          }
        }
      });
      try {
        this.logger?.debug("[Reboot] Restored EP upgrade levels (e.g., lab):", this.upgradeset.getUpgrade("laboratory")?.level);
      } catch (_) { }
    }

    if (debugReboot) {
      console.log(`[REBOOT DEBUG] Updating StateManager with final EP values:`);
      console.log(`[REBOOT DEBUG]   total_exotic_particles=${this.total_exotic_particles}`);
      console.log(`[REBOOT DEBUG]   current_exotic_particles=${this.current_exotic_particles}`);
      console.log(`[REBOOT DEBUG]   exotic_particles=${this.exotic_particles}`);
    }
    this.ui.stateManager.setVar(
      "total_exotic_particles",
      this.total_exotic_particles
    );
    this.ui.stateManager.setVar(
      "current_exotic_particles",
      this.current_exotic_particles
    );
    this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);
    if (debugReboot) {
      console.log(`[REBOOT DEBUG] ========== Reboot Action Complete ==========`);
    }

    this.reactor.updateStats();
    this.upgradeset.check_affordability(this);
    this.partset.check_affordability(this);

    // Refresh the UI to show updated affordability
    if (this.ui) {
      // Find the currently active tab and refresh it
      if (typeof document !== "undefined" && document.querySelector && typeof window !== "undefined" && window.templateLoader) {
        const activeTab = document.querySelector(".parts_tab.active");
        if (activeTab) {
          const tabId = activeTab.getAttribute("data-tab");
          this.ui.populatePartsForTab(tabId);
        } else {
          // Fallback to power tab if no active tab found
          this.ui.populatePartsForTab("power");
        }
      } else {
        // Skip UI refresh if DOM or templateLoader is not available (e.g., in tests)
        this.logger?.warn("[Game] Skipping UI refresh - DOM or templateLoader not available");
      }
    }

    if (this.objectives_manager) {
      this.objectives_manager.check_current_objective();
    }
  }
  onToggleStateChange(property, newState) {
    if (this.ui.stateManager.getVar(property) !== undefined) {
      this[property] = newState;
    }

    if (property === "pause") {
      this.paused = newState;
      if (this.engine) {
        if (newState) {
          this.engine.stop();
        } else {
          this.engine.start();
        }
      }
    } else if (property === "heat_control") {
      this.reactor.heat_controlled = newState;
    } else if (property === "parts_panel") {
      const partsPanel = document.getElementById("parts_section");
      if (partsPanel) {
        const isMobile = window.innerWidth <= 900;
        if (isMobile) {
          // Mobile: allow toggling
          partsPanel.classList.toggle("collapsed", !newState);
        } else {
          // Desktop: always keep open
          partsPanel.classList.remove("collapsed");
        }
        this.ui.updatePartsPanelBodyClass();
      }
    }
  }
  get rows() {
    return this._rows;
  }
  set rows(value) {
    if (this._rows !== value) {
      this._rows = value;
      this.tileset.updateActiveTiles();
      this.reactor.updateStats();
      if (this.ui) {
        this.ui.resizeReactor();
      }
    }
  }
  get cols() {
    return this._cols;
  }
  set cols(value) {
    if (this._cols !== value) {
      this._cols = value;
      this.tileset.updateActiveTiles();
      this.reactor.updateStats();
      if (this.ui) {
        this.ui.resizeReactor();
      }
    }
  }

  sellPart(tile) {
    if (tile && tile.part) {
      this.addMoney(tile.calculateSellValue());
      this.debugHistory.add('game', 'sellPart', { row: tile.row, col: tile.col, partId: tile.part.id, value: tile.calculateSellValue() });
      if (this.audio) {
        this.audio.play("sell");
      }
      tile.clearPart(true);
    }
  }

  handleComponentDepletion(tile) {
    if (!tile.part) return;
    this.debugHistory.add('game', 'Component depletion', { row: tile.row, col: tile.col, partId: tile.part.id, perpetual: tile.part.perpetual });

    const part = tile.part;
    if (part.perpetual && this.ui.stateManager.getVar("auto_buy")) {
      const cost = part.getAutoReplacementCost();
      this.logger?.debug(`[AUTO-BUY] Attempting to replace '${part.id}'. Cost: ${cost}, Current Money: ${this.current_money}`);
      if (this.current_money >= cost) {
        this.current_money -= cost;
        this.logger?.debug(`[AUTO-BUY] Success. New Money: ${this.current_money}`);
        this.ui.stateManager.setVar("current_money", this.current_money);
        part.recalculate_stats();
        tile.ticks = part.ticks;
        this.reactor.updateStats();
        return;
      } else {
        this.logger?.debug(`[AUTO-BUY] Failed. Insufficient funds.`);
      }
    }

    if (this.tooltip_manager?.current_tile_context === tile) {
      this.tooltip_manager.hide();
    }

    tile.clearPart(false);
  }

  getSaveState() {
    this.debugHistory.add('game', 'Generating save state');
    this.updateSessionTime();

    const saveData = {
      version: this.version,
      current_money: this._current_money,
      protium_particles: this.protium_particles,
      total_exotic_particles: this.total_exotic_particles,
      exotic_particles: this.exotic_particles,
      current_exotic_particles: this.current_exotic_particles,
      rows: this.rows,
      cols: this.cols,
      sold_power: this.sold_power,
      sold_heat: this.sold_heat,

      total_played_time: this.total_played_time,
      last_save_time: Date.now(),

      reactor: {
        current_heat: this.reactor.current_heat,
        current_power: this.reactor.current_power,
        has_melted_down: this.reactor.has_melted_down,
      },
      // Persist cumulative placement progress used for tier gating
      placedCounts: this.placedCounts,
      tiles: this.tileset.tiles_list
        .filter((tile) => tile.part)
        .map((tile) => ({
          row: tile.row,
          col: tile.col,
          partId: tile.part.id,
          ticks: tile.ticks,
          heat_contained: tile.heat_contained,
        })),
      upgrades: this.upgradeset.upgradesArray
        .filter((upg) => upg.level > 0)
        .map((upg) => ({
          id: upg.id,
          level: upg.level,
        })),
      objectives: {
        current_objective_index:
          this.objectives_manager?.current_objective_index || 0,
        completed_objectives: (() => {
          const completed = this.objectives_manager?.objectives_data?.map(obj => obj.completed) || [];
          this.logger?.debug(`Saving ${completed.filter(c => c).length} completed objectives out of ${completed.length} total`);
          return completed;
        })(),
      },
      toggles: {
        auto_sell: this.ui.stateManager.getVar("auto_sell"),
        auto_buy: this.ui.stateManager.getVar("auto_buy"),
        heat_control: this.ui.stateManager.getVar("heat_control"),
        time_flux: this.ui.stateManager.getVar("time_flux"),
        pause: this.ui.stateManager.getVar("pause"),
      },
      ui: {},
    };

    try {
      if (typeof localStorage !== "undefined" && localStorage !== null) {
        const existingData = localStorage.getItem("reactorGameSave");
        if (existingData) {
          const existingSave = JSON.parse(existingData);
          if (existingSave.isCloudSynced) {
            saveData.isCloudSynced = existingSave.isCloudSynced;
            saveData.cloudUploadedAt = existingSave.cloudUploadedAt;
          }
        }
      }
    } catch (error) {
      console.warn("Could not preserve cloud sync flags:", error.message);
    }

    return saveData;
  }

  _hasCoreDataChanged(newData, existingData) {
    const keyFields = [
      "current_money",
      "protium_particles",
      "total_exotic_particles",
      "exotic_particles",
      "current_exotic_particles",
      "rows",
      "cols",
      "sold_power",
      "sold_heat",
    ];

    for (const field of keyFields) {
      if (newData[field] !== existingData[field]) {
        return true;
      }
    }

    if (
      newData.reactor?.has_melted_down !== existingData.reactor?.has_melted_down
    ) {
      return true;
    }

    if (newData.tiles?.length !== existingData.tiles?.length) {
      return true;
    }

    if (newData.upgrades?.length !== existingData.upgrades?.length) {
      return true;
    }

    // Compare objectives
    if (
      newData.objectives?.current_objective_index !==
      existingData.objectives?.current_objective_index
    ) {
      return true;
    }

    return false;
  }

  saveGame(slot = null, isAutoSave = false) {
    if (this.logger) {
      this.logger.debug(`Attempting to save game. Meltdown state: ${this.reactor.has_melted_down}`);
    }
    try {
      this.debugHistory.add('game', 'saveGame called', { slot, isAutoSave, meltdown: this.reactor.has_melted_down });
      if (this.reactor.has_melted_down) {
        return;
      }
      const saveData = this.getSaveState();

      if (typeof localStorage !== "undefined" && localStorage !== null) {
        // If no specific slot is requested, cycle through slots
        if (slot === null) {
          slot = this.getNextSaveSlot();
        }

        const saveKey = `reactorGameSave_${slot}`;

        // Check if this is an auto-save and if we should prompt the user
        if (isAutoSave && this.shouldPromptForSaveOverwrite(slot, saveData)) {
          this.promptForSaveOverwrite(slot, saveData);
          return; // Don't save yet, wait for user decision
        }

        localStorage.setItem(saveKey, JSON.stringify(saveData));
        this.logger?.debug(`Game state saved to slot ${slot}. Size: ${JSON.stringify(saveData).length} bytes.`);
        this.debugHistory.add('game', 'Game saved', { slot, size: JSON.stringify(saveData).length });

        // Update the current slot tracking
        localStorage.setItem("reactorCurrentSaveSlot", slot.toString());
      } else if (
        typeof process !== "undefined" &&
        process.env?.NODE_ENV === "test"
      ) {
        return;
      }

      // Only attempt Google Drive save if running in browser and googleDriveSave is defined
      if (typeof window !== "undefined" && window.googleDriveSave && window.googleDriveSave.isSignedIn) {
        window.googleDriveSave.save(JSON.stringify(saveData)).catch((error) => {
          console.error("Failed to auto-save to Google Drive:", error);
        });
      }
    } catch (error) {
      if (
        typeof process === "undefined" ||
        process.env?.NODE_ENV !== "test" ||
        !error.message.includes("localStorage")
      ) {
        console.error("Error saving game:", error);
      }
    }
  }

  getNextSaveSlot() {
    // Get the current slot or default to 1
    const currentSlot = parseInt(localStorage.getItem("reactorCurrentSaveSlot") || "1");
    // Cycle through slots 1, 2, 3
    return ((currentSlot % 3) + 1);
  }

  shouldPromptForSaveOverwrite(slot, newSaveData) {
    try {
      const saveKey = `reactorGameSave_${slot}`;
      const existingSaveJSON = localStorage.getItem(saveKey);

      if (!existingSaveJSON) {
        return false; // No existing save, no need to prompt
      }

      const existingSave = JSON.parse(existingSaveJSON);
      const existingPlayTime = existingSave.total_played_time || 0;
      const newPlayTime = newSaveData.total_played_time || 0;

      // Only prompt if existing save has significantly more play time (more than 5 minutes)
      return existingPlayTime > newPlayTime + 300000; // 300000ms = 5 minutes
    } catch (error) {
      console.error("Error checking save overwrite condition:", error);
      return false; // If there's an error, allow overwrite
    }
  }

  promptForSaveOverwrite(slot, newSaveData) {
    try {
      const saveKey = `reactorGameSave_${slot}`;
      const existingSaveJSON = localStorage.getItem(saveKey);
      const existingSave = JSON.parse(existingSaveJSON);

      const existingPlayTime = existingSave.total_played_time || 0;
      const newPlayTime = newSaveData.total_played_time || 0;

      const existingTimeStr = this.formatTimeSimple(existingPlayTime);
      const newTimeStr = this.formatTimeSimple(newPlayTime);

      const existingMoney = this.formatNumber(existingSave.current_money || 0);
      const newMoney = this.formatNumber(newSaveData.current_money || 0);

      // Use the PWA service to show a styled modal instead of basic confirm
      if (window.splashManager && typeof window.splashManager.showSaveOverwriteModal === 'function') {
        window.splashManager.showSaveOverwriteModal(slot, {
          existing: {
            playTime: existingTimeStr,
            money: existingMoney
          },
          current: {
            playTime: newTimeStr,
            money: newMoney
          }
        }, (choice) => {
          if (choice === 'overwrite') {
            localStorage.setItem(saveKey, JSON.stringify(newSaveData));
            localStorage.setItem("reactorCurrentSaveSlot", slot.toString());
            console.log(`[AUTO-SAVE] User chose to overwrite slot ${slot}`);
          } else if (choice === 'load') {
            console.log(`[AUTO-SAVE] User chose to load existing save from slot ${slot}`);
            this.loadGame(slot);
          }
        });
      } else {
        // Fallback to basic confirm dialog
        const message = `Auto-save wants to overwrite Slot ${slot}:\n\n` +
          `Existing Save:\n` +
          `  Play Time: ${existingTimeStr}\n` +
          `  Money: $${existingMoney}\n\n` +
          `Current Game:\n` +
          `  Play Time: ${newTimeStr}\n` +
          `  Money: $${newMoney}\n\n` +
          `The existing save has more play time. What would you like to do?`;

        const choice = confirm(message + "\n\nOK = Overwrite existing save\nCancel = Load existing save instead");

        if (choice) {
          localStorage.setItem(saveKey, JSON.stringify(newSaveData));
          localStorage.setItem("reactorCurrentSaveSlot", slot.toString());
          console.log(`[AUTO-SAVE] User chose to overwrite slot ${slot}`);
        } else {
          console.log(`[AUTO-SAVE] User chose to load existing save from slot ${slot}`);
          this.loadGame(slot);
        }
      }
    } catch (error) {
      console.error("Error in save overwrite prompt:", error);
      // Fallback: just save normally
      const saveKey = `reactorGameSave_${slot}`;
      localStorage.setItem(saveKey, JSON.stringify(newSaveData));
      localStorage.setItem("reactorCurrentSaveSlot", slot.toString());
    }
  }

  formatTimeSimple(milliseconds) {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  getSaveSlotInfo(slot) {
    try {
      const saveKey = `reactorGameSave_${slot}`;
      const savedDataJSON = localStorage.getItem(saveKey);
      if (savedDataJSON) {
        const savedData = JSON.parse(savedDataJSON);
        return {
          exists: true,
          lastSaveTime: savedData.last_save_time || null,
          totalPlayedTime: savedData.total_played_time || 0,
          currentMoney: savedData.current_money || 0,
          exoticParticles: savedData.exotic_particles || 0,
          data: savedData
        };
      }
    } catch (error) {
      console.error(`Error reading save slot ${slot}:`, error);
    }
    return { exists: false };
  }

  getAllSaveSlots() {
    const slots = [];
    for (let i = 1; i <= 3; i++) {
      const slotInfo = this.getSaveSlotInfo(i);
      slots.push({
        slot: i,
        ...slotInfo
      });
    }
    return slots;
  }

  async loadGame(slot = null) {
    this.debugHistory.add('game', 'loadGame called', { slot });
    try {
      let savedDataJSON;

      if (slot !== null) {
        // Load from specific slot
        const saveKey = `reactorGameSave_${slot}`;
        savedDataJSON = localStorage.getItem(saveKey);
      } else {
        // Try to load from the most recent save (backward compatibility)
        // First try the old single save format
        savedDataJSON = localStorage.getItem("reactorGameSave");

        if (!savedDataJSON) {
          // If no old save, try to find the most recent slot
          let mostRecentSlot = null;
          let mostRecentTime = 0;

          for (let i = 1; i <= 3; i++) {
            const slotInfo = this.getSaveSlotInfo(i);
            if (slotInfo.exists && slotInfo.lastSaveTime > mostRecentTime) {
              mostRecentTime = slotInfo.lastSaveTime;
              mostRecentSlot = i;
            }
          }

          if (mostRecentSlot) {
            const saveKey = `reactorGameSave_${mostRecentSlot}`;
            savedDataJSON = localStorage.getItem(saveKey);
          }
        }
      }

      if (savedDataJSON) {
        const savedData = JSON.parse(savedDataJSON);
        this.debugHistory.add('game', 'Applying save data from slot', { slot, version: savedData.version });
        await this.applySaveState(savedData);
        return true;
      }
    } catch (error) {
      console.error("Error loading game:", error);
      // Clear potentially corrupted save data
      if (slot !== null) {
        localStorage.removeItem(`reactorGameSave_${slot}`);
      } else {
        localStorage.removeItem("reactorGameSave");
      }
    }
    return false;
  }

  async applySaveState(savedData) {
    this.logger?.debug('Applying save state...', {
      version: savedData.version,
      money: savedData.current_money,
      tiles: savedData.tiles?.length || 0,
      upgrades: savedData.upgrades?.length || 0,
      objectiveIndex: savedData.objectives?.current_objective_index
    });
    this._isRestoringSave = true;
    try {
    this._current_money = savedData.current_money || this.base_money;
    if (!this.partset.initialized) {
      await this.partset.initialize();
    }
    this.protium_particles = savedData.protium_particles || 0;
    this.total_exotic_particles = savedData.total_exotic_particles || 0;

    // Handle both exotic_particles and current_exotic_particles for backward compatibility
    if (savedData.current_exotic_particles !== undefined) {
      this.exotic_particles = savedData.current_exotic_particles;
      this.current_exotic_particles = savedData.current_exotic_particles;
    } else if (savedData.exotic_particles !== undefined) {
      // Fallback for older save data that only has exotic_particles
      this.exotic_particles = savedData.exotic_particles;
      this.current_exotic_particles = savedData.exotic_particles;
    } else {
      this.exotic_particles = 0;
      this.current_exotic_particles = 0;
    }

    // Update UI state manager with EP values so EP display shows immediately
    this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);
    this.ui.stateManager.setVar("total_exotic_particles", this.total_exotic_particles);
    this.ui.stateManager.setVar("current_exotic_particles", this.current_exotic_particles);
    this.rows = savedData.rows || this.base_rows;
    this.cols = savedData.cols || this.base_cols;
    this.sold_power = savedData.sold_power || false;
    this.sold_heat = savedData.sold_heat || false;

    this.total_played_time = savedData.total_played_time || 0;
    this.last_save_time = savedData.last_save_time || null;
    this.session_start_time = null;
    // Restore cumulative placement history if present.
    // If missing (older saves), backfill from current tiles to avoid locking users out.
    if (savedData.placedCounts && typeof savedData.placedCounts === 'object') {
      this.placedCounts = savedData.placedCounts;
    } else {
      this.placedCounts = {};
    }

    if (savedData.reactor) {
      this.reactor.current_heat = savedData.reactor.current_heat || 0;
      this.reactor.current_power = savedData.reactor.current_power || 0;
      this.reactor.has_melted_down = savedData.reactor.has_melted_down || false;

      // Update UI meltdown state properly
      if (this.ui && typeof this.ui.updateMeltdownState === "function") {
        this.ui.updateMeltdownState();
      }
    }

    // Ensure upgradeset is properly initialized before loading upgrades
    this.upgradeset.reset();
    await this.upgradeset.initialize();
    if (savedData.upgrades) {
      savedData.upgrades.forEach((upgData) => {
        const upgrade = this.upgradeset.getUpgrade(upgData.id);
        if (upgrade) {
          upgrade.setLevel(upgData.level);
        }
      });
    }

    // Update reactor stats after upgrades are loaded
    this.reactor.updateStats();

    // Ensure tileset is initialized before loading tiles
    if (!this.tileset.initialized) {
      this.tileset.initialize();
    }
    this.tileset.clearAllTiles();
    if (savedData.tiles) {
      console.log(`[SAVE-LOAD DEBUG] Starting tile restoration. _isRestoringSave=${this._isRestoringSave}, tiles count=${savedData.tiles.length}`);
      const prevSuppress = this._suppressPlacementCounting;
      this._suppressPlacementCounting = true;
      for (const tileData of savedData.tiles) {
        const tile = this.tileset.getTile(tileData.row, tileData.col);
        const part = this.partset.getPartById(tileData.partId);
        console.log(`[SAVE-LOAD DEBUG] Restoring tile (${tileData.row},${tileData.col}): tile=${!!tile}, partId=${tileData.partId}, part=${!!part}, partIdResolved=${part?.id}`);
        if (tile && part) {
          const tilePartBefore = tile.part?.id || null;
          await tile.setPart(part);
          const tilePartAfter = tile.part?.id || null;
          console.log(`[SAVE-LOAD DEBUG] Tile (${tileData.row},${tileData.col}) setPart result: before=${tilePartBefore}, after=${tilePartAfter}, success=${tilePartAfter === part.id}`);
          tile.ticks = tileData.ticks;
          tile.heat_contained = tileData.heat_contained;
          console.log(`[SAVE-LOAD DEBUG] Tile (${tileData.row},${tileData.col}) properties set: ticks=${tile.ticks}, heat=${tile.heat_contained}`);
        } else {
          console.log(`[SAVE-LOAD DEBUG] Tile (${tileData.row},${tileData.col}) restoration failed: tile=${!!tile}, part=${!!part}`);
        }
      }
      this._suppressPlacementCounting = prevSuppress;
      console.log(`[SAVE-LOAD DEBUG] Tile restoration complete. _isRestoringSave=${this._isRestoringSave}`);

      // Backfill placedCounts if it was missing in save data
      if (!savedData.placedCounts) {
        for (const tile of this.tileset.tiles_list) {
          if (tile.part) {
            const key = `${tile.part.type}:${tile.part.level}`;
            this.placedCounts[key] = (this.placedCounts[key] || 0) + 1;
          }
        }
      }
    }

    // Restore objectives state
    if (savedData.objectives) {
      let savedIndex = savedData.objectives.current_objective_index;

      // 1. Sanitize the index to a number, defaulting to 0 for invalid types.
      if (savedIndex === null || savedIndex === undefined) {
        savedIndex = 0;
      } else {
        const parsedIndex = parseInt(savedIndex, 10);
        if (isNaN(parsedIndex)) {
          console.warn(`[Game] Invalid objective index "${savedData.objectives.current_objective_index}" in save data. Defaulting to 0.`);
          savedIndex = 0;
        } else {
          savedIndex = Math.floor(parsedIndex); // Handle decimals
        }
      }

      // 2. Clamp the index to a valid range.
      if (this.objectives_manager && this.objectives_manager.objectives_data && this.objectives_manager.objectives_data.length > 0) {
        const objectivesData = this.objectives_manager.objectives_data;
        const maxValidIndex = objectivesData.length - 2; // Last real objective (not "All objectives completed!")

        if (savedIndex < 0) {
          console.warn(`[Game] Negative objective index ${savedIndex} found in save. Clamping to 0.`);
          savedIndex = 0;
        } else if (savedIndex > maxValidIndex) {
          console.warn(`[Game] Objective index ${savedIndex} is beyond valid range. Clamping to last real objective: ${maxValidIndex}.`);
          savedIndex = maxValidIndex;
        }
      }

      // 3. Restore completion status first
      if (
        savedData.objectives.completed_objectives &&
        Array.isArray(savedData.objectives.completed_objectives)
      ) {
        console.log(`[DEBUG] Restoring ${savedData.objectives.completed_objectives.length} completed objectives`);
        savedData.objectives.completed_objectives.forEach((completed, index) => {
          if (this.objectives_manager.objectives_data[index]) {
            this.objectives_manager.objectives_data[index].completed = completed;
            if (completed) {
              console.log(`[DEBUG] Restored objective ${index} as completed: ${this.objectives_manager.objectives_data[index].title}`);
            }
          }
        });
      } else {
        console.log(`[DEBUG] No completed objectives data found in save`);
      }

      // 4. Apply the final, validated index.
      this.objectives_manager.current_objective_index = savedIndex;
      this._saved_objective_index = savedIndex;

      // 5. Update the objective manager to reflect the new index
      // Only call set_objective if objectives data is loaded
      if (this.objectives_manager && this.objectives_manager.set_objective &&
        this.objectives_manager.objectives_data && this.objectives_manager.objectives_data.length > 0) {
        this.objectives_manager.set_objective(savedIndex, true);

        // Check for chapter completion after loading save data
        if (this.objectives_manager.checkForChapterCompletion) {
          this.objectives_manager.checkForChapterCompletion();
        }
      }
    } else {
      // If no objectives object exists in the save, default to 0.
      this._saved_objective_index = 0;
      if (this.objectives_manager) {
        this.objectives_manager.current_objective_index = 0;
      }
    }

    this._pendingToggleStates = savedData.toggles;
    this.ui.updateAllToggleBtnStates();
    this.reactor.updateStats();
    
    console.log(`[SAVE-LOAD DEBUG] Save state applied. _isRestoringSave=${this._isRestoringSave}, verifying tiles...`);
    for (let r = 0; r < Math.min(this.rows, 5); r++) {
      for (let c = 0; c < Math.min(this.cols, 5); c++) {
        const tile = this.tileset.getTile(r, c);
        if (tile?.part) {
          console.log(`[SAVE-LOAD DEBUG] Tile (${r},${c}) verified after restore: part=${tile.part.id}, heat=${tile.heat_contained}`);
        }
      }
    }
    } finally {
      console.log(`[SAVE-LOAD DEBUG] Setting _isRestoringSave=false`);
      this._isRestoringSave = false;
      console.log(`[SAVE-LOAD DEBUG] _isRestoringSave is now: ${this._isRestoringSave}`);
    }
  }

  /**
   * Validates and restores objective state consistency
   * This helps prevent objective resets when the app regains focus
   */
  _validateObjectiveState() {
    if (!this.objectives_manager || this._saved_objective_index === undefined) {
      return;
    }

    const currentIndex = this.objectives_manager.current_objective_index;
    const savedIndex = this._saved_objective_index;

    if (currentIndex !== savedIndex) {
      console.warn(`[Game] Objective state inconsistency detected: current=${currentIndex}, saved=${savedIndex}. Restoring...`);

      // Restore the saved objective index
      this.objectives_manager.current_objective_index = savedIndex;

      // Update the objective display if the method exists
      if (this.objectives_manager.set_objective && this.objectives_manager.objectives_data) {
        this.objectives_manager.set_objective(savedIndex, true);
      }

      // Force a save to persist the corrected state
      setTimeout(() => {
        if (typeof this.saveGame === "function") {
          this.saveGame();
        }
      }, 100);
    }
  }

  compressSaveData(data) {
    try {
      // Simple compression for testing - in real implementation would use proper compression
      return btoa(encodeURIComponent(data));
    } catch (error) {
      console.error("Compression error:", error);
      return data;
    }
  }

  decompressSaveData(compressedData) {
    try {
      // Simple decompression for testing
      return decodeURIComponent(atob(compressedData));
    } catch (error) {
      console.error("Decompression error:", error);
      return compressedData;
    }
  }

  validateSaveData(data) {
    try {
      if (typeof data === 'string') {
        data = JSON.parse(data);
      }

      // Basic validation - check for required fields
      const requiredFields = ['version', 'current_money', 'rows', 'cols'];
      for (const field of requiredFields) {
        if (!(field in data)) {
          return false;
        }
      }

      // Validate data types
      if (typeof data.current_money !== 'number' ||
        typeof data.rows !== 'number' ||
        typeof data.cols !== 'number') {
        return false;
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  // Additional test compatibility methods
  pause() {
    this.paused = true;
    if (this.ui && this.ui.stateManager) {
      this.ui.stateManager.setVar("pause", true);
    }
    if (this.engine && this.engine.running) {
      this.engine.stop();
    }
  }

  resume() {
    this.paused = false;
    if (this.ui && this.ui.stateManager) {
      this.ui.stateManager.setVar("pause", false);
    }
    if (this.engine && !this.engine.running) {
      this.engine.start();
    }
  }

  togglePause() {
    if (this.paused) {
      this.resume();
    } else {
      this.pause();
    }
  }

  async reboot() {
    // Stop the engine
    if (this.engine && this.engine.running) {
      this.engine.stop();
    }

    // Reset basic game state
    this.paused = false;
    this.current_money = 0; // Reset to 0 for testing
    this.exotic_particles = 0;
    this.current_exotic_particles = 0;
    this.protium_particles = 0;
    this.total_exotic_particles = 0;

    // Reset reactor dimensions to base values
    this.rows = this.base_rows;
    this.cols = this.base_cols;

    // For testing, reset to 5x5 grid if that's what was set up
    if (this._test_grid_size) {
      this.rows = this._test_grid_size.rows;
      this.cols = this._test_grid_size.cols;
    }

    // Reset reactor
    if (this.reactor) {
      this.reactor.current_heat = 0;
      this.reactor.current_power = 0;
      this.reactor.has_melted_down = false;
      this.reactor.updateStats();
    }

    // Clear all tiles
    if (this.tileset) {
      this.tileset.clearAllTiles();
    }

    // Reset upgrades (but preserve experimental ones)
    if (this.upgradeset) {
      this.upgradeset.upgradesArray.forEach(upgrade => {
        if (!upgrade.upgrade.type.includes('experimental')) {
          upgrade.level = 0;
        }
      });
    }

    // Update UI state
    if (this.ui && this.ui.stateManager) {
      this.ui.stateManager.setVar("current_money", this.current_money);
      this.ui.stateManager.setVar("exotic_particles", this.exotic_particles);
      this.ui.stateManager.setVar("current_exotic_particles", this.current_exotic_particles);
    }
  }

  onToggleStateChange(toggleName, value) {
    if (this.ui && this.ui.stateManager) {
      this.ui.stateManager.setVar(toggleName, value);
    }

    // Handle specific toggle changes
    switch (toggleName) {
      case "auto_sell":
        if (this.reactor) {
          this.reactor.auto_sell_enabled = value;
        }
        break;
      case "auto_buy":
        if (this.reactor) {
          this.reactor.auto_buy_enabled = value;
        }
        break;
      case "heat_control":
        if (this.reactor) {
          this.reactor.heat_controlled = value;
        }
        break;
      case "time_flux":
        this.time_flux = value;
        break;
      case "pause":
        this.paused = value;
        if (this.engine) {
          if (value) {
            this.engine.stop();
          } else {
            this.engine.start();
          }
        }
        break;
    }
  }

  // Test compatibility methods
  save() {
    return JSON.stringify(this.getSaveState());
  }

  async load(saveData) {
    try {
      const parsed = JSON.parse(saveData);
      await this.applySaveState(parsed);
      return true;
    } catch (error) {
      console.error("Error loading save data:", error);
      return false;
    }
  }

  getConfiguration() {
    return {
      gameSpeed: this.loop_wait,
      autoSave: this._config?.autoSave ?? true, // Use stored config or default
      soundEnabled: this._config?.soundEnabled ?? true, // Use stored config or default
      autoSaveInterval: this._config?.autoSaveInterval ?? 30000 // Use stored config or default
    };
  }

  setConfiguration(config) {
    if (config.gameSpeed !== undefined) {
      this.loop_wait = config.gameSpeed;
    }
    // Store other config values as needed
    this._config = { ...this._config, ...config };
  }
}

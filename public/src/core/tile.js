import { Part } from "./part.js";

export class Tile {
  constructor(row, col, game) {
    this.game = game;
    this.part = null;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this._containmentNeighborTiles = [];
    this._cellNeighborTiles = [];
    this._reflectorNeighborTiles = [];
    this.activated = false;
    this.row = row;
    this.col = col;
    this.enabled = false;
    this.display_chance = 0;
    this.display_chance_percent_of_total = 0;
    this._heatContained = 0;
    this.ticks = 0;
    this.exploded = false;
    this.exploding = false;
    this._neighborCache = null;
  }

  get heat_contained() {
    const ts = this.game?.tileset;
    if (ts?.heatMap) return ts.heatMap[ts.gridIndex(this.row, this.col)];
    return this._heatContained;
  }

  set heat_contained(v) {
    const ts = this.game?.tileset;
    if (ts?.heatMap) {
      ts.heatMap[ts.gridIndex(this.row, this.col)] = v;
      return;
    }
    this._heatContained = v;
  }

  _calculateAndCacheNeighbors() {
    const p = this.part;
    if (!p) {
      this._neighborCache = { containment: [], cell: [], reflector: [] };
      return;
    }
    const neighbors = Array.from(
      this.game.tileset.getTilesInRange(this, p.range || 1)
    );
    const containment = [];
    const cell = [];
    const reflector = [];
    for (const neighbor_tile of neighbors) {
      if (neighbor_tile.part && neighbor_tile.activated) {
        const p = neighbor_tile.part;
        if (p.containment > 0 || ['heat_exchanger', 'heat_outlet', 'heat_inlet'].includes(p.category)) {
          containment.push(neighbor_tile);
        }
        if (neighbor_tile.part.category === "cell" && neighbor_tile.ticks > 0)
          cell.push(neighbor_tile);
        if (neighbor_tile.part.category === "reflector")
          reflector.push(neighbor_tile);
      }
    }

    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test' && this.part && this.part.category === 'heat_outlet') {
      this.game.logger?.debug(`Outlet at (${this.row}, ${this.col}) has ${containment.length} containment neighbors: ${containment.map(t => `(${t.row}, ${t.col}) ${t.part?.id}`).join(', ')}`);
    }

    this._neighborCache = { containment, cell, reflector };
  }
  invalidateNeighborCaches() {
    this._neighborCache = null;
    const maxRange = 2;
    for (const neighbor of this.game.tileset.getTilesInRange(this, maxRange)) {
      if (neighbor) neighbor._neighborCache = null;
    }
  }
  get containmentNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.containment;
  }
  get cellNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.cell;
  }
  get reflectorNeighborTiles() {
    if (this._neighborCache === null) {
      this._calculateAndCacheNeighbors();
    }
    return this._neighborCache.reflector;
  }
  getEffectiveVentValue() {
    if (!this.part || !this.part.vent) return 0;
    let ventValue = this.part.vent; // This value is already calculated with permanent upgrades.

    // Active Venting is a contextual bonus based on neighbors, so it's calculated here.
    const activeVenting = this.game.upgradeset.getUpgrade("active_venting");
    if (activeVenting && activeVenting.level > 0) {
      let capacitorBonus = 0;
      const neighbors = this.containmentNeighborTiles;
      for (let i = 0; i < neighbors.length; i++) {
        const neighbor = neighbors[i];
        if (neighbor.part && neighbor.part.category === "capacitor") {
          capacitorBonus += neighbor.part.level || 1;
        }
      }
      ventValue *= 1 + (activeVenting.level * capacitorBonus) / 100;
    }
    return ventValue;
  }
  getEffectiveTransferValue() {
    if (!this.part) return 0;

    // Handle different part categories
    if (this.part.category === 'vent' && this.part.vent) {
      // Vents use the vent property
      return this.part.vent;
    } else if (this.part.transfer) {
      // Other parts use the transfer property
      const transferMultiplier =
        this.game?.reactor.transfer_multiplier_eff || 0;
      return this.part.transfer * (1 + transferMultiplier / 100);
    }
    return 0;
  }
  disable() {
    if (this.enabled) this.enabled = false;
  }
  enable() {
    if (!this.enabled) this.enabled = true;
  }
  async setPart(partInstance) {
    if (partInstance === null || partInstance === undefined) {
      throw new Error("Invalid part: part cannot be null or undefined");
    }
    if (this.part) {
      return false;
    }
    const isRestoring = this.game?._isRestoringSave;
    if (!isRestoring && this.game?.partset?.isPartDoctrineLocked(partInstance)) {
      return false;
    }
    if (!isRestoring && this.game.audio && this.game.audio.enabled) {
      this.game.logger?.debug(`Placing part '${partInstance.id}' on tile (${this.row}, ${this.col})`);
      this.game.debugHistory.add('tile', 'setPart', { row: this.row, col: this.col, partId: partInstance.id });
      const subtype =
        partInstance.category === "cell"
          ? "cell"
          : partInstance.category === "reactor_plating" ? "plating" : partInstance.category === "vent" ? "vent" : null;
      const pan = this.game.calculatePan ? this.game.calculatePan(this.col) : 0;
      this.game.audio.play("placement", subtype, pan);
    }
    this.part = partInstance;
    this.invalidateNeighborCaches();
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      this.exploded = false;
      this.exploding = false;
      this.game.ui?.gridCanvasRenderer?.markTileDirty(this.row, this.col);
      this.game.ui?.gridCanvasRenderer?.markStaticDirty();
      // Cumulative placement tracking for gating
      try {
        if (this.game && this.part && typeof this.game.incrementPlacedCount === "function") {
          this.game.incrementPlacedCount(this.part.type, this.part.level);
        }
      } catch (_) { }
      if (this.game.reactor.has_melted_down) {
        this.game.logger?.debug(
          "[Recovery] Clearing meltdown state after placing part:",
          this.part.id
        );
        this.game.logger?.debug(
          "[Recovery] Reactor heat before reset:",
          this.game.reactor.current_heat,
          "max:",
          this.game.reactor.max_heat
        );
        this.game.reactor.current_heat = 0;
        this.game.reactor.clearMeltdownState();
        this.game.ui.stateManager.setVar(
          "current_heat",
          this.game.reactor.current_heat
        );
        if (this.game.engine && !this.game.engine.running) {
          const currentPauseState = this.game.ui.stateManager.getVar("pause");
          this.game.logger?.debug("[Recovery] Current pause state:", currentPauseState);
          this.game.logger?.debug(
            "[Recovery] Engine running state:",
            this.game.engine.running
          );
          this.game.logger?.debug("[Recovery] Game paused state:", this.game.paused);
          if (currentPauseState) {
            this.game.logger?.info("[Recovery] Unpausing game");
            this.game.ui.stateManager.setVar("pause", false);
          } else {
            // Prevent auto-start in test environment
            const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
                              (typeof global !== 'undefined' && global.__VITEST__) ||
                              (typeof window !== 'undefined' && window.__VITEST__);
            if (!isTestEnv) {
              this.game.logger?.info("[Recovery] Force restarting engine");
              this.game.paused = false;
              this.game.engine.start();
            }
          }
        }
        this.game.logger?.debug(
          "[Recovery] Meltdown state cleared, has_melted_down:",
          this.game.reactor.has_melted_down,
          "heat reset to:",
          this.game.reactor.current_heat
        );
      }
    }

    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    if (!isRestoring) {
      this.game.reactor.updateStats();
      // Refresh parts panel to update tier gating counters/visibility
      try {
        if (this.game && this.game.ui && typeof this.game.ui.refreshPartsPanel === "function") {
          this.game.ui.refreshPartsPanel();
        }
        // Also refresh the upgrades section so gated cell upgrade columns
        // appear as soon as the corresponding cell becomes unlocked
        if (this.game && this.game.upgradeset && typeof this.game.upgradeset.populateUpgrades === "function") {
          this.game.upgradeset.populateUpgrades();
        }
      } catch (_) { }
      if (this.game && typeof this.game.saveGame === "function") {
        this.game.saveGame(null, true); // true = isAutoSave
      }
    }
    return true; // Return true to indicate the part was successfully placed
  }
  clearPart(full_clear = true) {
    if (!this.part) return;
    const part_id = this.part.id;
    if (typeof process !== "undefined" && process.env.NODE_ENV === 'test') {
    }
    this.game.logger?.debug(`Clearing part '${part_id}' from tile (${this.row}, ${this.col}). Full clear: ${full_clear}`);
    this.game.debugHistory.add('tile', 'clearPart', { row: this.row, col: this.col, partId: this.part.id, fullClear: full_clear });
    this.invalidateNeighborCaches();
    if (full_clear) {
      const sell_value = this.calculateSellValue();
      this.game.addMoney(sell_value);
      if (this.game.ui && typeof this.game.ui.showFloatingTextAtTile === 'function') {
        this.game.ui.showFloatingTextAtTile(this, sell_value);
      }
      // Note: do NOT decrement cumulative placedCounts; progress is permanent
    }
    this.activated = false;
    this.part = null;
    this.ticks = 0;
    this.heat_contained = 0;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
    this.exploded = false;
    this.exploding = false;
    this.game.ui?.gridCanvasRenderer?.markTileDirty(this.row, this.col);
    this.game.ui?.gridCanvasRenderer?.markStaticDirty();
    if (this.game.tooltip_manager?.current_tile_context === this) {
      this.game.tooltip_manager.hide();
    }
    this.game.engine?.markPartCacheAsDirty();
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    this.game.reactor.updateStats();
    try {
      if (this.game && this.game.ui && typeof this.game.ui.refreshPartsPanel === "function") {
        this.game.ui.refreshPartsPanel();
      }
    } catch (_) { }
    if (this.game && typeof this.game.saveGame === "function") {
      this.game.saveGame(null, true); // true = isAutoSave
    }
  }
  highlight() {}

  unhighlight() {}


  calculateSellValue() {
    if (!this.part) {
      return 0;
    }
    const part = this.part;
    let sellValue = part.cost;
    if (part.ticks > 0 && typeof this.ticks === "number") {
      const lifeRemainingRatio = Math.max(0, this.ticks / part.ticks);
      sellValue = Math.ceil(part.cost * lifeRemainingRatio);
    } else if (
      part.containment > 0 &&
      typeof this.heat_contained === "number"
    ) {
      const damageRatio = Math.min(1, this.heat_contained / part.containment);
      sellValue = part.cost - Math.ceil(part.cost * damageRatio);
    }
    return Math.max(0, sellValue);
  }
  refreshVisualState() {
    this.game.ui?.gridCanvasRenderer?.markTileDirty(this.row, this.col);
    this.game.ui?.gridCanvasRenderer?.markStaticDirty();
  }
}

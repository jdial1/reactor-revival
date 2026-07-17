import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import {
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "../constants/balance.js";
import { GameDimensionsSchema } from "../schema/index.js";
import { requireActiveBridge } from "../bridge/active.js";
import { safeCall } from "../core/teardown.js";

export function calculateBaseDimensions() {
  const isMobile = typeof window !== "undefined" && window.innerWidth <= MOBILE_BREAKPOINT_PX;
  const raw = {
    base_cols: isMobile ? BASE_COLS_MOBILE : BASE_COLS_DESKTOP,
    base_rows: isMobile ? BASE_ROWS_MOBILE : BASE_ROWS_DESKTOP,
  };
  return GameDimensionsSchema.parse(raw);
}

export class GridManager {
  constructor(game) {
    this.game = game;
    const dimensions = calculateBaseDimensions();
    this.base_cols = dimensions.base_cols;
    this.base_rows = dimensions.base_rows;
    this._rows = this.base_rows;
    this._cols = this.base_cols;
  }

  updateBaseDimensions() {
    const dimensions = calculateBaseDimensions();
    const oldBaseCols = this.base_cols;
    const oldBaseRows = this.base_rows;
    this.base_cols = dimensions.base_cols;
    this.base_rows = dimensions.base_rows;
    if (this.game.rows === oldBaseRows && this.game.cols === oldBaseCols) {
      this.setRows(this.base_rows);
      this.setCols(this.base_cols);
      return;
    }
    const rowDiff = this.base_rows - oldBaseRows;
    const colDiff = this.base_cols - oldBaseCols;
    if (rowDiff !== 0 || colDiff !== 0) {
      this.setRows(Math.max(this.base_rows, this._rows + rowDiff));
      this.setCols(Math.max(this.base_cols, this._cols + colDiff));
    }
  }

  setRows(value) {
    if (this._rows !== value) {
      const oldRows = this._rows;
      this._rows = value;
      if (this.game.tileset && typeof this.game.tileset.resize === "function") {
        this.game.tileset.resize(value, this._cols);
      } else {
        this.game.tileset.updateActiveTiles();
      }
      this.game.reactor.updateStats();
      this.game.ui?.resizeReactor?.();
    }
  }

  setCols(value) {
    if (this._cols !== value) {
      const oldCols = this._cols;
      this._cols = value;
      if (this.game.tileset && typeof this.game.tileset.resize === "function") {
        this.game.tileset.resize(this._rows, value);
      } else {
        this.game.tileset.updateActiveTiles();
      }
      this.game.reactor.updateStats();
      this.game.ui?.resizeReactor?.();
    }
  }

  get rows() {
    return this._rows;
  }

  get cols() {
    return this._cols;
  }
}

import { recordSimEvent } from "./sim-events.js";
import { bumpGridPartsRevision } from "../bridge/bridge-grid-sync.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import {
  getIndex,
  toDecimal,
} from "../simUtils.js";
import { logger } from "../core/logger.js";

function neighborEntriesToTiles(tileset, entries) {
  const out = [];
  if (!tileset || !entries) return out;
  for (let i = 0; i < entries.length; i++) {
    const tile = tileset.getTile(entries[i].row, entries[i].col);
    if (tile) out.push(tile);
  }
  return out;
}

function queryTileNeighborLists(tile) {
  if (!tile.part) return { containment: [], cell: [], reflector: [] };
  const bridge = requireActiveBridge(tile.game, "neighbor query");
  const lists = bridge.queryNeighbors(tile.row, tile.col);
  const tileset = tile.game.tileset;
  return {
    containment: neighborEntriesToTiles(tileset, lists.containment),
    cell: neighborEntriesToTiles(tileset, lists.cell),
    reflector: neighborEntriesToTiles(tileset, lists.reflector),
  };
}

export class Tile {
  constructor(row, col, game) {
    this.game = game;
    this.part = null;
    this.power = 0;
    this.heat = 0;
    this.display_power = 0;
    this.display_heat = 0;
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
    this.cachedEffectiveVent = 0;
    this.cachedEffectiveTransfer = 0;
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

  addHeat(amount) {
    this.heat_contained = (this.heat_contained || 0) + amount;
  }

  setTicks(value) {
    this.ticks = value;
  }

  _neighborLists() {
    return queryTileNeighborLists(this);
  }

  invalidateNeighborCaches() {
    bumpGridPartsRevision(this.game?.tileset);
  }

  get containmentNeighborTiles() {
    return this._neighborLists().containment;
  }
  get cellNeighborTiles() {
    return this._neighborLists().cell;
  }
  get reflectorNeighborTiles() {
    return this._neighborLists().reflector;
  }
  recalculateEffectiveValues() {
    this.cachedEffectiveVent = 0;
    this.cachedEffectiveTransfer = 0;
    if (!this.part) return;
    const bridge = requireActiveBridge(this.game, "recalculateEffectiveValues");
    const rates = bridge.resolveDisplayRatesForTile(this);
    if (!rates) return;
    this.cachedEffectiveVent = rates.vent ?? 0;
    this.cachedEffectiveTransfer = rates.transfer ?? 0;
    if (this.part.category === "vent" && (rates.vent || this.part.vent)) {
      this.cachedEffectiveTransfer = this.cachedEffectiveVent || this.cachedEffectiveTransfer;
    }
  }

  getEffectiveVentValue() {
    return this.cachedEffectiveVent;
  }
  getEffectiveTransferValue() {
    return this.cachedEffectiveTransfer;
  }
  disable() {
    if (this.enabled) this.enabled = false;
  }
  enable() {
    if (!this.enabled) this.enabled = true;
  }

  _clearMeltdownRecovery() {
    const game = this.game;
    logger.log('debug', 'game', '[Recovery] Clearing meltdown state after placing part:', this.part.id);
    logger.log('debug', 'game', '[Recovery] Reactor heat before reset:', game.reactor.current_heat, "max:", game.reactor.max_heat);
    game.reactor.current_heat = 0;
    game.reactor.clearMeltdownState();
    const engineStopped = game.engine && !game.engine.running;
    if (!engineStopped) {
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    const currentPauseState = game.state?.pause ?? game.paused;
    logger.log('debug', 'game', '[Recovery] Current pause state:', currentPauseState);
    logger.log('debug', 'game', '[Recovery] Engine running state:', game.engine.running);
    logger.log('debug', 'game', '[Recovery] Game paused state:', game.paused);
    if (currentPauseState) {
      logger.log('info', 'game', '[Recovery] Unpausing game');
      game.onToggleStateChange?.("pause", false);
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    const isTestEnv = (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test') ||
      (typeof global !== 'undefined' && global.__VITEST__) ||
      (typeof window !== 'undefined' && window.__VITEST__);
    if (isTestEnv) {
      logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
      return;
    }
    logger.log('info', 'game', '[Recovery] Force restarting engine');
    game.paused = false;
    game.engine.start();
    logger.log('debug', 'game', '[Recovery] Meltdown state cleared, has_melted_down:', game.reactor.has_melted_down, "heat reset to:", game.reactor.current_heat);
  }

  applySessionSync(part, inst, tileHeat = 0) {
    this.part = part;
    this.activated = true;
    this.enabled = true;
    this.exploded = false;
    this.exploding = false;
    this.ticks = inst?.ticks != null ? inst.ticks : part.ticks;
    this.heat_contained = tileHeat > 0 ? toDecimal(tileHeat) : toDecimal(0);
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
    if (!isRestoring && this.game?.audio?.enabled) {
      logger.log('debug', 'game', `Placing part '${partInstance.id}' on tile (${this.row}, ${this.col})`);
      logger.log('debug', 'tile', 'setPart', { row: this.row, col: this.col, partId: partInstance.id });
      recordSimEvent(this.game, {
        type: "PART_PLACED",
        row: this.row,
        col: this.col,
        category: partInstance.category,
      });
      drainGameEffects(this.game, () => this.game?.ui);
    }
    this.part = partInstance;
    bumpGridPartsRevision(this.game?.tileset);
    if (this.part) {
      this.activated = true;
      this.ticks = this.part.ticks;
      this.heat_contained = 0;
      this.exploded = false;
      this.exploding = false;
      this.game.bumpGridTileDirty?.(this.row, this.col);
      if (this.game.reactor.has_melted_down) {
        this._clearMeltdownRecovery();
      }
      const bridge = this.game.coreBridge;
      if (!isRestoring) {
        this.recalculateEffectiveValues();
      }
    }
    if (!isRestoring) {
      this.game.reactor.updateStats();
      if (!this.part) this.recalculateEffectiveValues();
      safeCall(() => {
        if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
          this.game.state.parts_panel_version++;
        }
        if (this.game && this.game.upgradeset && typeof this.game.upgradeset.populateUpgrades === "function") {
          this.game.upgradeset.populateUpgrades();
        }
      }, "tile upgrade refresh");
      if (this.game?.saveManager) {
        void this.game.saveManager.autoSave();
      }
    } else {
      this.recalculateEffectiveValues();
    }
    return true;
  }
  _clearPartReset() {
    bumpGridPartsRevision(this.game?.tileset);
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
    this.game.bumpGridTileDirty?.(this.row, this.col);
    this.game.reactor.updateStats();
    safeCall(() => {
      if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
        this.game.state.parts_panel_version++;
      }
    }, "parts panel bump");
    if (this.game?.saveManager) void this.game.saveManager.autoSave();
  }

  clearPart() {
    if (!this.part) return;
    logger.log('debug', 'game', `Clearing part '${this.part.id}' from tile (${this.row}, ${this.col}).`);
    logger.log('debug', 'tile', 'clearPart', { row: this.row, col: this.col, partId: this.part.id });
    this._clearPartReset();
  }

  sellPart() {
    if (!this.part) return;
    const part_id = this.part.id;
    logger.log('debug', 'game', `Selling part '${part_id}' from tile (${this.row}, ${this.col}).`);
    logger.log('debug', 'tile', 'sellPart', { row: this.row, col: this.col, partId: part_id });
    requireActiveBridge(this.game, "sellPart").sellPart(this.row, this.col);
  }

  calculateSellValue() {
    if (!this.part) return 0;
    return requireActiveBridge(this.game, "calculateSellValue").computeSellValueForTile(this);
  }
  refreshVisualState() {
    this.game.bumpGridTileDirty?.(this.row, this.col);
  }
}

export class Tileset {
  constructor(game) {
    this.game = game;
    this.max_rows = game?.gridManager?.rows ?? 12;
    this.max_cols = game?.gridManager?.cols ?? 12;
    this.rows = this.max_rows;
    this.cols = this.max_cols;
    this.tiles = [];
    this.tiles_list = [];
    this.active_tiles = [];
    this.active_tiles_list = [];
    this.heatMap = new Float32Array(this.max_rows * this.max_cols);
  }

  gridIndex(row, col) {
    return getIndex(row, col, this.max_cols);
  }

  resize(newRows, newCols) {
    if (this.max_rows >= newRows && this.max_cols >= newCols) {
      this.updateActiveTiles();
      return;
    }

    const oldRows = this.max_rows;
    const oldCols = this.max_cols;
    const oldHeatMap = this.heatMap;

    this.max_rows = newRows;
    this.max_cols = newCols;
    const newGridSize = this.max_rows * this.max_cols;
    this.heatMap = new Float32Array(newGridSize);

    for (let r = 0; r < oldRows; r++) {
      for (let c = 0; c < oldCols; c++) {
        if (r < this.max_rows && c < this.max_cols) {
           const oldIdx = r * oldCols + c;
           const newIdx = r * this.max_cols + c;
           this.heatMap[newIdx] = oldHeatMap[oldIdx];
        }
      }
    }
    
    for (let r = 0; r < this.max_rows; r++) {
      if (!this.tiles[r]) this.tiles[r] = [];
      for (let c = 0; c < this.max_cols; c++) {
        if (!this.tiles[r][c]) {
          const tile = new Tile(r, c, this.game);
          this.tiles[r][c] = tile;
          this.tiles_list.push(tile);
        }
      }
    }
    
    if (this.game.engine) {
       this.game.engine._orthoAdjacencyKey = null;
    }
    
    this.updateActiveTiles();
  }

  initialize() {
    this.tiles = [];
    this.tiles_list = [];
    for (let r = 0; r < this.max_rows; r++) {
      const row_array = [];
      for (let c = 0; c < this.max_cols; c++) {
        const tile = new Tile(r, c, this.game);
        row_array.push(tile);
        this.tiles_list.push(tile);
      }
      this.tiles.push(row_array);
    }
    this.updateActiveTiles();
    return this.tiles_list;
  }

  updateActiveTiles() {
    for (let r = 0; r < this.max_rows; r++) {
      for (let c = 0; c < this.max_cols; c++) {
        const tile = this.tiles[r] && this.tiles[r][c];
        if (tile) {
          if (r < this.game.rows && c < this.game.cols) {
            tile.enable();
          } else {
            tile.disable();
          }
        }
      }
    }

    this.active_tiles_list = this.tiles_list.filter((t) => t.enabled);
  }

  getTile(row, col) {
    if (row >= 0 && row < this.game.rows && col >= 0 && col < this.game.cols) {
      return this.tiles[row] && this.tiles[row][col];
    }
    return null;
  }

  clearAllTiles() {
    this.tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart();
      }
    });
    this.game.coreBridge?.syncGridFromGame?.();
  }

  getAllTiles() {
    return this.active_tiles_list;
  }

  toSaveState() {
    return this.active_tiles_list
      .filter((tile) => tile.part)
      .map((tile) => ({
        row: tile.row,
        col: tile.col,
        partId: tile.part.id,
        ticks: tile.ticks,
        heat_contained: tile.heat_contained,
      }));
  }
}


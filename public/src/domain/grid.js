import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import {
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "../constants/balance.js";
import { GameDimensionsSchema } from "../schema/index.js";

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

import { topologyNeighborCoords } from "../logic-topology.js";
import { recordSimEvent } from "./sim-events.js";
import { bumpGridPartsRevision, invalidateTickParts } from "./part-classification.js";
import { drainGameEffects } from "../effect-orchestrator.js";
import {
  getIndex,
  toDecimal,
} from "../simUtils.js";
import { logger } from "../core/logger.js";
import {
  COLORS,
  HEAT_MAP,
  HEAT_FLOW,
  HEAT_SHIMMER,
  HEAT_HAZE,
  OVERHEAT_VISUAL,
  BAR,
  SINGULARITY,
} from "../constants/heat-visual.js";
import { vuSegmentRatio01 } from "../core/math-helpers.js";

const GRID_SIZE = 50 * 50;

export function computeTileNeighborLists(tile) {
  const p = tile.part;
  if (!p) {
    return { containment: [], cell: [], reflector: [] };
  }
  const neighbors = Array.from(
    tile.game.tileset.getTilesInRange(tile, p.range || 1)
  );
  const containment = [];
  const cell = [];
  const reflector = [];
  for (const neighbor_tile of neighbors) {
    if (neighbor_tile.part && neighbor_tile.activated) {
      const np = neighbor_tile.part;
      if (np.containment > 0 || ["heat_exchanger", "heat_outlet", "heat_inlet"].includes(np.category)) {
        containment.push(neighbor_tile);
      }
      if (neighbor_tile.part.category === "cell" && neighbor_tile.ticks > 0) {
        cell.push(neighbor_tile);
      }
      if (neighbor_tile.part.category === "reflector") {
        reflector.push(neighbor_tile);
      }
    }
  }
  if (typeof process !== "undefined" && process.env.NODE_ENV === "test" && tile.part && tile.part.category === "heat_outlet") {
    logger.log("debug", "game", `Outlet at (${tile.row}, ${tile.col}) has ${containment.length} containment neighbors: ${containment.map((t) => `(${t.row}, ${t.col}) ${t.part?.id}`).join(", ")}`);
  }
  return { containment, cell, reflector };
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
    const views = this.game?.engine?._tickNeighborViews;
    if (views) {
      const hit = views.get(this);
      if (hit) return hit;
    }
    return computeTileNeighborLists(this);
  }

  invalidateNeighborCaches() {
    invalidateTickParts(this.game?.engine);
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

    if (this.part.vent) {
      let ventValue = this.part.vent;
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
      this.cachedEffectiveVent = ventValue;
    }

    if (this.part.category === 'vent' && this.part.vent) {
      this.cachedEffectiveTransfer = this.part.vent;
    } else if (this.part.transfer) {
      const transferMultiplier = this.game?.reactor.transfer_multiplier_eff || 0;
      this.cachedEffectiveTransfer = this.part.transfer * (1 + transferMultiplier / 100);
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
    invalidateTickParts(this.game?.engine);
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

    this.game.engine?.heatManager?.markSegmentsAsDirty();
    if (!isRestoring) {
      this.game.reactor.updateStats();
      if (!this.part) this.recalculateEffectiveValues();
      const bridge = this.game.coreBridge;
      if (this.part && bridge?.shouldSyncPlacementsToSession?.()) {
        bridge.syncTileFromGame(this.row, this.col);
      }
      try {
        if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
          this.game.state.parts_panel_version++;
        }
        if (this.game && this.game.upgradeset && typeof this.game.upgradeset.populateUpgrades === "function") {
          this.game.upgradeset.populateUpgrades();
        }
      } catch (_) { }
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
    invalidateTickParts(this.game?.engine);
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
    const bridge = this.game?.coreBridge;
    if (bridge?.shouldSyncPlacementsToSession?.()) {
      bridge.syncTileFromGame(this.row, this.col);
    }
    this.game.bumpGridTileDirty?.(this.row, this.col);
    this.game.engine?.heatManager?.markSegmentsAsDirty();
    this.game.reactor.updateStats();
    try {
      if (this.game?.state && typeof this.game.state.parts_panel_version === "number") {
        this.game.state.parts_panel_version++;
      }
    } catch (_) {}
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
    const sell_value = this.calculateSellValue();
    this.game.addMoney(sell_value);
    this._clearPartReset();
  }


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
    this.integrityMap = new Float32Array(this.max_rows * this.max_cols);
    for (let i = 0; i < this.integrityMap.length; i++) this.integrityMap[i] = 100;
  }

  gridIndex(row, col) {
    return getIndex(row, col, this.max_cols);
  }

  syncHeatFromTiles() {
    const rows = this.game?.rows ?? this.max_rows;
    const cols = this.game?.cols ?? this.max_cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile) this.heatMap[this.gridIndex(r, c)] = tile.heat_contained;
      }
    }
  }

  syncHeatToTiles() {
    const rows = this.game?.rows ?? this.max_rows;
    const cols = this.game?.cols ?? this.max_cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const tile = this.tiles[r]?.[c];
        if (tile) tile._heatContained = this.heatMap[this.gridIndex(r, c)];
      }
    }
  }

  resize(newRows, newCols) {
    if (this.max_rows >= newRows && this.max_cols >= newCols) {
      this.updateActiveTiles();
      return;
    }

    const oldRows = this.max_rows;
    const oldCols = this.max_cols;
    const oldHeatMap = this.heatMap;
    const oldIntegrityMap = this.integrityMap;
    
    this.max_rows = newRows;
    this.max_cols = newCols;
    const newGridSize = this.max_rows * this.max_cols;
    this.heatMap = new Float32Array(newGridSize);
    this.integrityMap = new Float32Array(newGridSize);
    
    for (let i = 0; i < newGridSize; i++) this.integrityMap[i] = 100;
    
    for (let r = 0; r < oldRows; r++) {
      for (let c = 0; c < oldCols; c++) {
        if (r < this.max_rows && c < this.max_cols) {
           const oldIdx = r * oldCols + c;
           const newIdx = r * this.max_cols + c;
           this.heatMap[newIdx] = oldHeatMap[oldIdx];
           if (oldIntegrityMap) this.integrityMap[newIdx] = oldIntegrityMap[oldIdx];
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

    this.game.engine?.heatManager?.markSegmentsAsDirty();
  }

  getTile(row, col) {
    if (row >= 0 && row < this.game.rows && col >= 0 && col < this.game.cols) {
      return this.tiles[row] && this.tiles[row][col];
    }
    return null;
  }

  *getTilesInRange(centerTile, range, topologyTypeOverride) {
    if (!centerTile) return;
    const rows = this.game.rows;
    const cols = this.game.cols;
    const p = centerTile.part;
    const topo = topologyTypeOverride ?? p?.topologyType ?? "Manhattan";
    const rng = range != null ? range : p?.range ?? 1;
    const coords = topologyNeighborCoords(topo, centerTile.row, centerTile.col, rng, rows, cols);
    for (let i = 0; i < coords.length; i++) {
      const r = coords[i][0];
      const c = coords[i][1];
      const tile = this.tiles[r]?.[c];
      if (tile) yield tile;
    }
  }

  clearAllTiles() {
    this.tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart();
      }
    });
    this.game.engine?.heatManager?.markSegmentsAsDirty();
  }

  clearAllParts() {
    this.active_tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart();
      }
    });
    this.game.engine?.heatManager?.markSegmentsAsDirty();
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

class StaticGridRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  drawTile(game, r, c) {
    const { ctx, _tileSize: ts } = this._shared;
    const x = c * ts;
    const y = r * ts;
    ctx.fillStyle = COLORS.tileBg;
    ctx.strokeStyle = COLORS.tileStroke;
    ctx.lineWidth = 1;
    ctx.fillRect(x, y, ts, ts);
    ctx.strokeRect(x, y, ts, ts);
    const tile = game.tileset?.getTile(r, c);
    if (tile?.enabled && tile.part) {
      const path = typeof tile.part.getImagePath === "function" ? tile.part.getImagePath() : null;
      if (path) {
        const img = this._shared.loadImage(path);
        if (img.complete && img.naturalWidth) ctx.drawImage(img, x, y, ts, ts);
      }
    }
  }

  render(game, viewport) {
    const { ctx, _width, _height, _rows: rows, _cols: cols, _tileSize: ts, _staticDirty, _staticDirtyTiles } = this._shared;
    if (!ctx || _width <= 0 || _height <= 0) {
      if (!this._shared._staticBailLogged) {
        this._shared._staticBailLogged = true;
        logger.log('warn', 'ui', '[StaticGrid] render bailed', { hasCtx: !!ctx, width: _width, height: _height });
      }
      return;
    }
    this._shared._staticBailLogged = false;
    const cull = viewport != null;

    if (_staticDirty) {
      ctx.clearRect(0, 0, _width, _height);
      Array.from({ length: rows }, (_, r) => r).forEach((r) =>
        Array.from({ length: cols }, (_, c) => c).forEach((c) => {
          if (!cull || this._shared.tileInViewport(r, c, viewport)) this.drawTile(game, r, c);
        })
      );
      this._shared._staticDirty = false;
      this._shared._staticDirtyTiles.clear();
      return;
    }

    if (_staticDirtyTiles.size === 0) return;
    _staticDirtyTiles.forEach((key) => {
      const [r, c] = key.split(",").map(Number);
      if (!cull || this._shared.tileInViewport(r, c, viewport)) {
        ctx.clearRect(c * ts, r * ts, ts, ts);
        this.drawTile(game, r, c);
      }
    });
    this._shared._staticDirtyTiles.clear();
  }
}

class DynamicOverlayRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  _getGlobalBoostCategories() {
    return {
      infused_cells: ["reflector"],
      unleashed_cells: ["heat_exchanger", "heat_inlet", "heat_outlet"],
      quantum_buffering: ["capacitor", "reactor_plating"],
      full_spectrum_reflectors: ["reflector"],
      fluid_hyperdynamics: ["heat_inlet", "heat_outlet", "heat_exchanger", "vent"],
      fractal_piping: ["vent", "heat_exchanger"],
      ultracryonics: ["coolant_cell"],
    };
  }

  _isTileBuffedByGlobalBoost(game, tile) {
    const part = tile?.part;
    if (!part || !game?.upgradeset) return false;
    const mapping = this._getGlobalBoostCategories();
    for (const [upgradeId, categories] of Object.entries(mapping)) {
      if (!categories.includes(part.category)) continue;
      const level = game.upgradeset.getUpgrade(upgradeId)?.level ?? 0;
      if (level > 0) return true;
    }
    return false;
  }

  _drawSingularityOverlay(ctx, x, y, ts, now) {
    const cx = x + ts * 0.5;
    const cy = y + ts * 0.5;
    const rMax = Math.hypot(ts * 0.5, ts * 0.5);
    const ringR = rMax * (0.5 + Math.sin(now * 0.003) * 0.15);
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rMax);
    grad.addColorStop(0, `rgba(0, 0, 0, ${SINGULARITY.blackHoleAlpha})`);
    grad.addColorStop(0.2, SINGULARITY.innerTint);
    grad.addColorStop(0.6, SINGULARITY.midTint);
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(180, 100, 255, ${SINGULARITY.ringBaseAlpha + Math.sin(now * SINGULARITY.ringTimeScale) * SINGULARITY.ringPulseAmplitude})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    const orbitT = (now * SINGULARITY.orbitTimeScale) % (Math.PI * 2);
    ctx.strokeStyle = `rgba(220, 150, 255, ${0.35 + Math.sin(now * 0.01) * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringR * 0.7, ringR * 0.35, orbitT * 0.5, 0, Math.PI * 2);
    ctx.stroke();
  }

  render(game, viewport, ui) {
    const { _dynamicCtx: ctx, _width, _height, _tileSize: ts } = this._shared;
    if (!ctx || !game?.tileset || _width <= 0 || _height <= 0) return;

    const tiles = game.tileset.active_tiles_list;
    if (!tiles) return;
    const cull = viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const pulseAlpha = 0.12 + Math.sin(now * 0.002) * 0.06;

    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile?.enabled || !tile.part) continue;
      const r = tile.row;
      const c = tile.col;
      if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
      const x = c * ts;
      const y = r * ts;

      if (this._isTileBuffedByGlobalBoost(game, tile)) {
        ctx.fillStyle = COLORS.boostPulse(pulseAlpha);
        ctx.fillRect(x, y, ts, ts);
      }

      const maxHeat = tile.part.containment || 1;
      const hasHeatBar = tile.part.base_containment > 0 || (tile.part.containment > 0 && tile.part.category !== "valve");
      if (hasHeatBar && tile.heat_contained != null) {
        const pct = vuSegmentRatio01(Math.max(0, Math.min(1, tile.heat_contained / maxHeat)));
        const barH = Math.max(BAR.minBarHeight, (ts * BAR.barHeightRatio) | 0);
        const by = y + ts - barH;
        ctx.fillStyle = COLORS.heatBarBg;
        ctx.fillRect(x, by, ts, barH);
        ctx.fillStyle = COLORS.heatBarFill;
        ctx.fillRect(x, by, ts * pct, barH);
      }

      const hasDurability = tile.part.base_ticks > 0;
      if (hasDurability && tile.ticks != null && tile.part.ticks > 0) {
        const pct = vuSegmentRatio01(Math.max(0, Math.min(1, tile.ticks / tile.part.ticks)));
        const barH = Math.max(BAR.minBarHeight, (ts * BAR.barHeightRatio) | 0);
        const by = y + ts - barH;
        if (!hasHeatBar) {
          ctx.fillStyle = COLORS.heatBarBg;
          ctx.fillRect(x, by, ts, barH);
        }
        ctx.fillStyle = COLORS.durabilityBarFill;
        ctx.fillRect(x, by, ts * pct, barH);
      }

      if (hasHeatBar && tile.part.containment > 0) {
        const heatRatio = tile.heat_contained / tile.part.containment;
        if (heatRatio >= OVERHEAT_VISUAL.heatRatioThreshold) {
          const wiggle = Math.sin(now * OVERHEAT_VISUAL.wiggleFreq) * OVERHEAT_VISUAL.wiggleAmplitude;
          ctx.strokeStyle = `rgba(255, 80, 60, ${OVERHEAT_VISUAL.strokeBaseAlpha + Math.sin(now * OVERHEAT_VISUAL.strokePulseFreq) * OVERHEAT_VISUAL.strokePulseAmplitude})`;
          ctx.lineWidth = OVERHEAT_VISUAL.lineWidth;
          ctx.strokeRect(x + wiggle, y, ts - wiggle * 2, ts);
          ctx.strokeRect(x, y + wiggle, ts, ts - wiggle * 2);
        }
      }

      if (tile.exploding) {
        const explosionAlpha = 0.35 + Math.sin(now * 0.02) * 0.2;
        ctx.fillStyle = COLORS.explosionGlow(explosionAlpha);
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.explosionStroke(explosionAlpha);
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }

      const sellingTile = ui?.getSellingTile?.();
      if (sellingTile === tile) {
        ctx.fillStyle = COLORS.sellingFill;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.sellingStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ts, ts);
      }

      if (tile.part?.id === "particle_accelerator6") {
        this._drawSingularityOverlay(ctx, x, y, ts, now);
      }
    }

    const highlightedTiles = ui?.getHighlightedTiles?.();
    if (highlightedTiles?.length) {
      ctx.fillStyle = COLORS.highlightFill;
      for (let i = 0; i < highlightedTiles.length; i++) {
        const t = highlightedTiles[i];
        if (!t?.enabled) continue;
        const r = t.row;
        const c = t.col;
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        ctx.fillRect(c * ts, r * ts, ts, ts);
        ctx.strokeStyle = COLORS.highlightStroke;
        ctx.lineWidth = 2;
        ctx.strokeRect(c * ts, r * ts, ts, ts);
      }
    }

    const hoveredTile = ui?.getHoveredTile?.();
    if (hoveredTile?.enabled) {
      const r = hoveredTile.row;
      const c = hoveredTile.col;
      if (!cull || this._shared.tileInViewport(r, c, viewport)) {
        const x = c * ts;
        const y = r * ts;
        ctx.fillStyle = COLORS.hoverFill;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = COLORS.hoverStroke;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, ts, ts);
      }
    }
  }
}

class HeatEffectsRenderer {
  constructor(shared) {
    this._shared = shared;
  }

  _smoothHeatMap(heatMap, rows, cols, gridIndex) {
    const out = new Float64Array(rows * cols);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let sum = 0;
        let n = 0;
        for (let dr = -1; dr <= 1; dr++) {
          for (let dc = -1; dc <= 1; dc++) {
            const nr = r + dr;
            const nc = c + dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
              sum += heatMap[gridIndex(nr, nc)] || 0;
              n++;
            }
          }
        }
        out[gridIndex(r, c)] = n > 0 ? sum / n : 0;
      }
    }
    return out;
  }

  _prepareHeatData(game) {
    const { _dynamicCtx, _width, _height, _rows: rows, _cols: cols } = this._shared;
    if (!_dynamicCtx || !game?.tileset?.heatMap || _width <= 0 || _height <= 0) return null;
    const gridIndex = (r, c) => getIndex(r, c, game.tileset.max_cols);
    const smoothed = this._smoothHeatMap(game.tileset.heatMap, rows, cols, gridIndex);
    let maxHeat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = smoothed[gridIndex(r, c)] || 0;
        if (h > maxHeat) maxHeat = h;
      }
    }
    if (maxHeat <= 0) return null;
    return { smoothed, maxHeat, gridIndex, rows, cols };
  }

  _drawHeatEffectsLayers(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const blobR = ts * HEAT_MAP.blobRadiusRatio;
    const sThresh = HEAT_SHIMMER.threshold;
    const hThresh = HEAT_HAZE.threshold;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = Math.max(0, Math.min(1, heat / maxHeat));
        if (t === 0) continue;
        const cx = c * ts + ts * 0.5;
        const cy = r * ts + ts * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${HEAT_MAP.baseAlpha + HEAT_MAP.alphaRange * t})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, blobR, blobR, 0, 0, Math.PI * 2);
        ctx.fill();
        if (t >= sThresh) {
          const baseA = HEAT_SHIMMER.baseAlphaMultiplier * ((t - sThresh) / (1 - sThresh));
          for (let i = 0; i < HEAT_SHIMMER.layerCount; i++) {
            const phase = (now * HEAT_SHIMMER.timeScale + i * HEAT_SHIMMER.phaseSpacing) % (Math.PI * 2);
            const ox = Math.sin(phase) * (ts * 0.12);
            const oy = Math.cos(phase * 0.7) * (ts * 0.1);
            ctx.fillStyle = COLORS.shimmerTint(baseA * (0.6 + 0.4 * Math.sin(phase * 2)));
            ctx.beginPath();
            ctx.ellipse(
              cx + ox,
              cy + oy,
              ts * (0.35 + Math.sin(phase * 1.3) * 0.08),
              ts * (0.25 + Math.cos(phase * 0.9) * 0.06),
              phase * 0.3,
              0,
              Math.PI * 2
            );
            ctx.fill();
          }
        }
        if (t >= hThresh) {
          const rise = (now * HEAT_HAZE.riseSpeedPx) % (ts * 1.2);
          const hCy = cy - rise + Math.sin(now * HEAT_HAZE.wobbleFreq + r * 0.5 + c * 0.5) * ts * 0.15;
          const hCx = cx + Math.sin(now * 0.002 + c) * ts * 0.12;
          const rMax = ts * HEAT_HAZE.maxRadiusRatio;
          const grad = ctx.createRadialGradient(hCx, hCy, 0, hCx, hCy, rMax);
          const int = (t - hThresh) / (1 - hThresh);
          grad.addColorStop(0, `rgba(255, 220, 180, ${0.12 * int})`);
          grad.addColorStop(0.4, `rgba(255, 200, 150, ${0.06 * int})`);
          grad.addColorStop(1, "rgba(255, 200, 150, 0)");
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawHeatFlowLayer(game, viewport) {
    const engine = game?.engine;
    if (!this._shared._dynamicCtx || !engine || typeof engine.getLastHeatFlowVectors !== "function") return;
    const vectors = engine.getLastHeatFlowVectors();
    if (!vectors.length) return;
    const ts = this._shared._tileSize;
    const cull = viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const headLen = Math.max(4, Math.min(12, (ts * 10) / 48 | 0));
    const strokeWidth = Math.max(1.5, (ts * 2) / 48);
    const maxAmountForSpeed = HEAT_FLOW.maxAmountForSpeed;
    const dashLen = Math.max(6, ts * 0.35 | 0);
    const gapLen = Math.max(4, ts * 0.2 | 0);
    const ctx = this._shared._dynamicCtx;

    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (cull) {
        const fromIn = this._shared.tileInViewport(v.fromRow, v.fromCol, viewport);
        const toIn = this._shared.tileInViewport(v.toRow, v.toCol, viewport);
        if (!fromIn && !toIn) continue;
      }
      const fromX = (v.fromCol + 0.5) * ts;
      const fromY = (v.fromRow + 0.5) * ts;
      const toX = (v.toCol + 0.5) * ts;
      const toY = (v.toRow + 0.5) * ts;
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const endX = toX - ux * headLen;
      const endY = toY - uy * headLen;
      const amount = typeof v.amount === "number" ? v.amount : 0;
      const speed = HEAT_FLOW.baseSpeed + (amount / maxAmountForSpeed) * HEAT_FLOW.speedAmountScale;
      const segLen = len - headLen;

      ctx.strokeStyle = COLORS.heatFlowArrow;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.setLineDash([dashLen, gapLen]);
      const period = dashLen + gapLen;
      ctx.lineDashOffset = -(now * 0.001 * speed * period * 0.5) % period;
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);
      ctx.lineTo(endX, endY);
      ctx.stroke();
      ctx.setLineDash([]);

      const ax = ux * headLen;
      const ay = uy * headLen;
      const perp = Math.max(2, headLen * 0.4);
      const px = -uy * perp;
      const py = ux * perp;
      ctx.fillStyle = COLORS.heatFlowArrowHead;
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - ax + px, toY - ay + py);
      ctx.lineTo(toX - ax - px, toY - ay - py);
      ctx.closePath();
      ctx.fill();

      if (segLen > 4) {
        const pulseLen = HEAT_FLOW.pulseLen;
        const numPulses = HEAT_FLOW.pulseCount;
        for (let k = 0; k < numPulses; k++) {
          const phase = ((now * 0.001 * speed + k / numPulses) % 1);
          const p0 = (phase - pulseLen * 0.5 + 1) % 1;
          const p1 = (phase + pulseLen * 0.5 + 1) % 1;
          const x0 = fromX + ux * segLen * p0;
          const y0 = fromY + uy * segLen * p0;
          const x1 = fromX + ux * segLen * p1;
          const y1 = fromY + uy * segLen * p1;
          const alpha = 0.5 + (amount / maxAmountForSpeed) * 0.45;
          ctx.strokeStyle = HEAT_FLOW.pulseColor(alpha);
          ctx.lineWidth = strokeWidth * 1.4;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }
  }

  render(game, viewport, ui) {
    if (ui?.getHeatMapVisible?.()) {
      this._drawHeatEffectsLayers(game, viewport);
    }
    if (ui?.getHeatFlowVisible?.() || ui?.getDebugOverlayVisible?.()) {
      this._drawHeatFlowLayer(game, viewport);
    }
  }
}

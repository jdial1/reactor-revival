import { MOBILE_BREAKPOINT_PX } from "../constants/ui-constants.js";
import {
  BASE_COLS_MOBILE,
  BASE_COLS_DESKTOP,
  BASE_ROWS_MOBILE,
  BASE_ROWS_DESKTOP,
} from "../constants/balance.js";
import { GameDimensionsSchema } from "../schema/index.js";
import { requireActiveBridge } from "../bridge/active.js";
import { syncGridToGame } from "../bridge/bridge-grid-sync.js";

export function calculateBaseDimensions() {
  const isMobile = typeof globalThis !== "undefined" && globalThis.innerWidth <= MOBILE_BREAKPOINT_PX;
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

import { bumpGridPartsRevision } from "../bridge/bridge-grid-sync.js";
import {
  getIndex,
  toNumber,
} from "../simUtils.js";

function neighborEntriesToTiles(tileset, entries) {
  const out = [];
  if (!tileset || !entries) return out;
  for (let i = 0; i < entries.length; i++) {
    const tile = tileset.getTile(entries[i].row, entries[i].col);
    if (tile) out.push(tile);
  }
  return out;
}

function queryContainmentNeighborTiles(tile) {
  if (!tile.part) return [];
  const bridge = requireActiveBridge(tile.game, "neighbor query");
  const lists = bridge.queryNeighbors(tile.row, tile.col);
  return neighborEntriesToTiles(tile.game.tileset, lists.containment);
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
    this._heatContained = 0;
    this._ticks = 0;
    this.exploded = false;
    this.exploding = false;
  }

  get heat_contained() {
    const ts = this.game?.tileset;
    if (ts?.heatMap) return ts.heatMap[ts.gridIndex(this.row, this.col)];
    return this._heatContained;
  }

  _setProjectedHeat(v) {
    const n = typeof v === "number" ? v : toNumber(v);
    const ts = this.game?.tileset;
    if (ts?.heatMap) {
      ts.heatMap[ts.gridIndex(this.row, this.col)] = n;
      return;
    }
    this._heatContained = n;
  }

  get ticks() {
    const ts = this.game?.tileset;
    if (ts?.ticksMap) return ts.ticksMap[ts.gridIndex(this.row, this.col)];
    return this._ticks;
  }

  _setProjectedTicks(v) {
    const n = typeof v === "number" ? v : toNumber(v);
    const ts = this.game?.tileset;
    if (ts?.ticksMap) {
      ts.ticksMap[ts.gridIndex(this.row, this.col)] = n;
      return;
    }
    this._ticks = n;
  }

  invalidateNeighborCaches() {
    bumpGridPartsRevision(this.game?.tileset);
  }

  get containmentNeighborTiles() {
    return queryContainmentNeighborTiles(this);
  }
  disable() {
    if (this.enabled) this.enabled = false;
  }
  enable() {
    if (!this.enabled) this.enabled = true;
  }

  applySessionSync(part, inst, tileHeat = 0) {
    this.part = part;
    this.activated = true;
    this.enabled = true;
    this.exploded = false;
    this.exploding = false;
    this._setProjectedTicks(inst?.ticks != null ? inst.ticks : part.ticks);
    this._setProjectedHeat(tileHeat > 0 ? tileHeat : 0);
  }

  calculateSellValue() {
    if (!this.part) return 0;
    return requireActiveBridge(this.game, "calculateSellValue").computeSellValueForTile(this);
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
    this.ticksMap = new Uint32Array(this.max_rows * this.max_cols);
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
    const oldTicksMap = this.ticksMap;

    this.max_rows = newRows;
    this.max_cols = newCols;
    const newGridSize = this.max_rows * this.max_cols;
    this.heatMap = new Float32Array(newGridSize);
    this.ticksMap = new Uint32Array(newGridSize);

    for (let r = 0; r < oldRows; r++) {
      for (let c = 0; c < oldCols; c++) {
        if (r < this.max_rows && c < this.max_cols) {
           const oldIdx = r * oldCols + c;
           const newIdx = r * this.max_cols + c;
           this.heatMap[newIdx] = oldHeatMap[oldIdx];
           this.ticksMap[newIdx] = oldTicksMap[oldIdx];
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
    const session = this.game.coreBridge?.session;
    if (session?.grid) {
      session.grid.clearGrid();
      session.grid.recalculateCaps?.();
      syncGridToGame(this.game.coreBridge);
    }
  }

  getAllTiles() {
    return this.active_tiles_list;
  }

  toSaveState() {
    const grid = this.game?.coreBridge?.session?.grid;
    return this.active_tiles_list
      .filter((tile) => tile.part)
      .map((tile) => ({
        row: tile.row,
        col: tile.col,
        partId: tile.part.id,
        ticks: grid?.getComponentAt?.(tile.row, tile.col)?.ticks ?? tile.ticks,
        heat_contained: grid
          ? grid.getTileHeat(tile.row, tile.col)
          : tile.heat_contained,
      }));
  }
}


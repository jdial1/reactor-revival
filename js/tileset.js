import { Tile } from "./tile.js";

export class Tileset {
  constructor(game) {
    this.game = game;
    this.max_rows = 32;
    this.max_cols = 32;
    this.rows = 12;
    this.cols = 12;
    this.tiles = [];
    this.tiles_list = [];
    this.active_tiles = [];
    this.active_tiles_list = [];
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
    if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
      return this.tiles[row][col];
    }
    return null;
  }

  *getTilesInRange(centerTile, range) {
    if (!centerTile) return;
    for (let r_offset = -range; r_offset <= range; r_offset++) {
      for (let c_offset = -range; c_offset <= range; c_offset++) {
        if (r_offset === 0 && c_offset === 0) continue;
        if (Math.abs(r_offset) + Math.abs(c_offset) > range) continue;

        const r = centerTile.row + r_offset;
        const c = centerTile.col + c_offset;

        if (r >= 0 && r < this.game.rows && c >= 0 && c < this.game.cols) {
          const tile = this.tiles[r]?.[c];
          if (tile) yield tile;
        }
      }
    }
  }

  clearAllTiles() {
    this.tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart(false);
      }
    });
  }

  clearAllParts() {
    this.active_tiles_list.forEach((tile) => {
      if (tile.part) {
        tile.clearPart(false);
      }
    });
  }
}

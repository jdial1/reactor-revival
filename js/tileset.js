import { Tile } from './tile.js';

export class Tileset {
    constructor() {
        console.log('Tileset constructor');
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
        console.log("Initializing tileset:", this.max_rows, "rows,", this.max_cols, "cols");
        this.tiles = [];
        this.tiles_list = [];

        for (let r = 0; r < this.max_rows; r++) {
            const row_array = [];
            for (let c = 0; c < this.max_cols; c++) {
                const tile = new Tile(r, c);
                row_array.push(tile);
                this.tiles_list.push(tile);
                if (r < this.rows && c < this.cols) {
                    tile.enable();
                } else {
                    tile.disable();
                }
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
                    if (r < this.rows && c < this.cols) {
                        if (!tile.enabled) tile.enable();
                    } else {
                        if (tile.enabled) tile.disable();
                    }
                }
            }
        }

        this.active_tiles = [];
        this.active_tiles_list = [];

        for (let r = 0; r < this.rows; r++) {
            const row_array = [];
            for (let c = 0; c < this.cols; c++) {
                const tile = this.tiles[r][c];
                row_array.push(tile);
                this.active_tiles_list.push(tile);
            }
            this.active_tiles.push(row_array);
        }
    }

    getTile(row, col) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            return this.tiles[row][col];
        }
        return null;
    }

    getActiveTile(row, col) {
        if (row >= 0 && row < this.rows && col >= 0 && col < this.cols) {
            return this.active_tiles[row][col];
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

                if (r >= 0 && r < this.rows && c >= 0 && c < this.cols) {
                    if (this.tiles[r] && this.tiles[r][c]) {
                        yield this.tiles[r][c];
                    }
                }
            }
        }
    }

    

    *getHeatExchanger6Range(centerTile) {
        if (!centerTile) return;
        if (centerTile.row > 0) yield this.tiles[centerTile.row - 1][centerTile.col];
        if (centerTile.row < this.rows - 1) yield this.tiles[centerTile.row + 1][centerTile.col];
        if (centerTile.col > 0) yield this.tiles[centerTile.row][centerTile.col - 1];
        if (centerTile.col < this.cols - 1) yield this.tiles[centerTile.row][centerTile.col + 1];

        for (let c = 0; c < this.cols; c++) {
            if (c !== centerTile.col && !(Math.abs(c - centerTile.col) === 1 && centerTile.row === centerTile.row)) {
                if (this.tiles[centerTile.row][c]) yield this.tiles[centerTile.row][c];
            }
        }
    }

    clearAllTiles() {
        this.tiles_list.forEach(tile => {
            if (tile.part) {
                tile.part = null;
                tile.setTicks(0);
                tile.setHeat_contained(0);
                tile.activated = false;
                tile.updated = true; 
                if (tile.$el) {
                     tile.$el.className = 'tile'; 
                     if (tile.enabled) tile.$el.classList.add('enabled');
                }
            }
        });
    }

    updateTiles() {
        this.tiles_list.forEach(tile => {
            if (tile.part) {
                const part = this.game.partset.getPartById(tile.part.id);
                if (part) {
                    tile.setPart(part);
                }
            }
        });
    }
}

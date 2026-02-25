import { calculateBaseDimensions } from "./dimensionCalculator.js";

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
      this.game.tileset.updateActiveTiles();
      this.game.reactor.updateStats();
      this.game.emit?.("gridResized");
    }
  }

  setCols(value) {
    if (this._cols !== value) {
      this._cols = value;
      this.game.tileset.updateActiveTiles();
      this.game.reactor.updateStats();
      this.game.emit?.("gridResized");
    }
  }

  get rows() {
    return this._rows;
  }

  get cols() {
    return this._cols;
  }
}

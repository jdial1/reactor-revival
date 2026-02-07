/**
 * Handles hotkey combinations for mass-actions on the reactor grid.
 */
export class Hotkeys {
  constructor(game) {
    this.game = game;
  }

  *getTiles(tile, event) {
    if (!this.game) return;
    const { shiftKey, ctrlKey, altKey } = event;

    if (ctrlKey && altKey) {
      yield* this.checker(tile);
    } else if (ctrlKey) {
      yield* this.row(tile);
    } else if (altKey) {
      yield* this.column(tile);
    } else if (shiftKey && tile.part) {
      yield* this.fillSame(tile.part);
    } else {
      yield tile;
    }
  }

  *row(tile) {
    for (let c = 0; c < this.game.cols; c++) {
      const t = this.game.tileset.getTile(tile.row, c);
      if (t?.enabled) yield t;
    }
  }

  *column(tile) {
    for (let r = 0; r < this.game.rows; r++) {
      const t = this.game.tileset.getTile(r, tile.col);
      if (t?.enabled) yield t;
    }
  }

  *checker(startTile) {
    const startIsOdd = (startTile.row + startTile.col) % 2;
    for (const tile of this.game.tileset.active_tiles_list) {
      if ((tile.row + tile.col) % 2 === startIsOdd) {
        yield tile;
      }
    }
  }

  *fillSame(part) {
    for (const tile of this.game.tileset.active_tiles_list) {
      if (tile.part === part) {
        yield tile;
      }
    }
  }
}

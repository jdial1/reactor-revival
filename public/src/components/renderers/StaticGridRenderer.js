import { COLORS } from "../../core/rendererConstants.js";
import { logger } from "../../utils/logger.js";

export class StaticGridRenderer {
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

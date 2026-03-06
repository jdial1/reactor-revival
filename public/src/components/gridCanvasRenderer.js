import { GRID } from "../core/rendererConstants.js";
import { StaticGridRenderer } from "./renderers/StaticGridRenderer.js";
import { logger } from "../utils/logger.js";
import { DynamicOverlayRenderer } from "./renderers/DynamicOverlayRenderer.js";
import { HeatEffectsRenderer } from "./renderers/HeatEffectsRenderer.js";

export class GridCanvasRenderer {
  constructor(ui) {
    this.ui = ui;
    this.canvas = null;
    this.ctx = null;
    this._dynamicCanvas = null;
    this._dynamicCtx = null;
    this._width = 0;
    this._height = 0;
    this._rows = GRID.defaultRows;
    this._cols = GRID.defaultCols;
    this._tileSize = GRID.defaultTileSize;
    this._imageCache = new Map();
    this._imageCacheOrder = [];
    this._imageCacheMax = GRID.imageCacheMax;
    this._container = null;
    this._staticDirty = true;
    this._staticDirtyTiles = new Set();
    this._lastResizeRequest = 0;

    this._staticRenderer = new StaticGridRenderer(this);
    this._dynamicRenderer = new DynamicOverlayRenderer(this);
    this._heatRenderer = new HeatEffectsRenderer(this);
  }

  loadImage(path) {
    if (this._imageCache.has(path)) return this._imageCache.get(path);
    while (this._imageCache.size >= this._imageCacheMax && this._imageCacheOrder.length) {
      const oldest = this._imageCacheOrder.shift();
      this._imageCache.delete(oldest);
    }
    const img = new Image();
    img.src = path;
    this._imageCache.set(path, img);
    this._imageCacheOrder.push(path);
    while (this._imageCache.size > this._imageCacheMax && this._imageCacheOrder.length) {
      const oldest = this._imageCacheOrder.shift();
      this._imageCache.delete(oldest);
    }
    return img;
  }

  tileInViewport(row, col, viewport) {
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return true;
    const ts = this._tileSize;
    const left = col * ts;
    const top = row * ts;
    return left < viewport.left + viewport.width && left + ts > viewport.left &&
      top < viewport.top + viewport.height && top + ts > viewport.top;
  }

  init(containerElement) {
    if (!containerElement) {
      logger.log('warn', 'ui', '[Grid] init skipped: no container element');
      return;
    }
    const wrapper = document.createElement("div");
    wrapper.style.position = "relative";
    wrapper.style.width = "100%";
    wrapper.style.height = "100%";
    this.canvas = document.createElement("canvas");
    this.canvas.style.display = "block";
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.style.pointerEvents = "auto";
    this._dynamicCanvas = document.createElement("canvas");
    this._dynamicCanvas.style.position = "absolute";
    this._dynamicCanvas.style.left = "0";
    this._dynamicCanvas.style.top = "0";
    this._dynamicCanvas.style.width = "100%";
    this._dynamicCanvas.style.height = "100%";
    this._dynamicCanvas.style.pointerEvents = "none";
    wrapper.appendChild(this.canvas);
    wrapper.appendChild(this._dynamicCanvas);
    containerElement.appendChild(wrapper);
    this.ctx = this.canvas.getContext("2d");
    this._dynamicCtx = this._dynamicCanvas.getContext("2d");
    logger.log('debug', 'ui', '[Grid] init done, canvas attached to container');
    return this.canvas;
  }

  setSize(widthPx, heightPx) {
    const prevW = this._width;
    const prevH = this._height;
    this._width = Math.max(1, widthPx | 0);
    this._height = Math.max(1, heightPx | 0);
    if (prevW !== this._width || prevH !== this._height) {
      logger.log('debug', 'ui', `[Grid] setSize ${this._width}x${this._height}`);
    }
    if (this.canvas) {
      this.canvas.width = this._width;
      this.canvas.height = this._height;
    }
    if (this._dynamicCanvas) {
      this._dynamicCanvas.width = this._width;
      this._dynamicCanvas.height = this._height;
    }
  }

  setGridDimensions(rows, cols) {
    const newRows = Math.max(1, rows | 0);
    const newCols = Math.max(1, cols | 0);
    if (this._rows !== newRows || this._cols !== newCols) {
      this.clearImageCache();
    }
    this._rows = newRows;
    this._cols = newCols;
    this._tileSize = Math.min(
      this._width / this._cols,
      this._height / this._rows
    ) | 0;
  }

  setContainer(containerElement) {
    this._container = containerElement || null;
  }

  markStaticDirty() {
    this._staticDirty = true;
    this._staticDirtyTiles.clear();
  }

  markTileDirty(row, col) {
    if (this._staticDirty) return;
    this._staticDirtyTiles.add(`${row},${col}`);
  }

  clearImageCache() {
    this._imageCache.clear();
    this._imageCacheOrder.length = 0;
  }

  getCanvas() { return this.canvas; }
  getTileSize() { return this._tileSize; }
  getRows() { return this._rows; }
  getCols() { return this._cols; }

  hitTest(clientX, clientY) {
    if (!this.canvas || !this.ui?.game?.tileset) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = (x / this._tileSize) | 0;
    const row = (y / this._tileSize) | 0;
    if (row < 0 || row >= this._rows || col < 0 || col >= this._cols) return null;
    return this.ui.game.tileset.getTile(row, col);
  }

  getTileRectInContainer(row, col, containerRect) {
    if (!this.canvas || !containerRect) return { left: 0, top: 0, width: 0, height: 0 };
    const reactorRect = this.canvas.getBoundingClientRect();
    const left = reactorRect.left - containerRect.left + col * this._tileSize;
    const top = reactorRect.top - containerRect.top + row * this._tileSize;
    return {
      left,
      top,
      width: this._tileSize,
      height: this._tileSize,
      centerX: left + this._tileSize / 2,
      centerY: top + this._tileSize / 2,
    };
  }

  _getViewport() {
    if (!this._container || typeof this._container.getBoundingClientRect !== "function") return null;
    const scrollLeft = this._container.scrollLeft || 0;
    const scrollTop = this._container.scrollTop || 0;
    const w = this._container.clientWidth ?? 0;
    const h = this._container.clientHeight ?? 0;
    return { left: scrollLeft, top: scrollTop, width: w, height: h };
  }

  render(game) {
    if (!game?.tileset) {
      if (!this._renderBailLogged) {
        this._renderBailLogged = true;
        logger.log('warn', 'ui', '[Grid] render bailed: no game.tileset');
      }
      return;
    }
    if (this._width <= 0 || this._height <= 0) {
      const wrapperExists = typeof document !== "undefined" && document.getElementById("reactor_wrapper");
      if (wrapperExists) {
        const now = typeof performance !== "undefined" ? performance.now() : Date.now();
        if (now - this._lastResizeRequest > 100) {
          this._lastResizeRequest = now;
          logger.log('warn', 'ui', `[Grid] render bailed: zero dimensions ${this._width}x${this._height}, requesting resize`);
          this.ui?.gridScaler?.requestResize?.();
        }
      }
      return;
    }
    this._renderBailLogged = false;
    const viewport = this._getViewport();
    const containerRect = this._container && typeof this._container.getBoundingClientRect === "function"
      ? this._container.getBoundingClientRect()
      : null;

    if (this.ctx && (this._staticDirty || this._staticDirtyTiles.size > 0)) {
      this._staticRenderer.render(game, viewport);
    }

    if (this._dynamicCtx) {
      this._dynamicCtx.save();
      this._dynamicCtx.clearRect(0, 0, this._width, this._height);
      this._dynamicRenderer.render(game, viewport, this.ui);
      this._heatRenderer.render(game, viewport, this.ui);
      this._dynamicCtx.restore();
    }
  }
}

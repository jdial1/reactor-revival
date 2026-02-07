export class GridCanvasRenderer {
  constructor(ui) {
    this.ui = ui;
    this.canvas = null;
    this.ctx = null;
    this._dynamicCanvas = null;
    this._dynamicCtx = null;
    this._width = 0;
    this._height = 0;
    this._rows = 12;
    this._cols = 12;
    this._tileSize = 48;
    this._imageCache = new Map();
    this._container = null;
    this._staticDirty = true;
  }

  init(containerElement) {
    if (!containerElement) return;
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
    return this.canvas;
  }

  setSize(widthPx, heightPx) {
    this._width = Math.max(1, widthPx | 0);
    this._height = Math.max(1, heightPx | 0);
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
    this._rows = Math.max(1, rows | 0);
    this._cols = Math.max(1, cols | 0);
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
  }

  getCanvas() {
    return this.canvas;
  }

  getTileSize() {
    return this._tileSize;
  }

  getRows() {
    return this._rows;
  }

  getCols() {
    return this._cols;
  }

  hitTest(clientX, clientY) {
    if (!this.canvas || !this.ui?.game?.tileset) return null;
    const rect = this.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const col = (x / this._tileSize) | 0;
    const row = (y / this._tileSize) | 0;
    if (row < 0 || row >= this._rows || col < 0 || col >= this._cols)
      return null;
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

  _loadImage(path) {
    if (this._imageCache.has(path)) return this._imageCache.get(path);
    const img = new Image();
    img.src = path;
    this._imageCache.set(path, img);
    return img;
  }

  _getViewport() {
    if (!this._container || typeof this._container.getBoundingClientRect !== "function")
      return null;
    const scrollLeft = this._container.scrollLeft || 0;
    const scrollTop = this._container.scrollTop || 0;
    const w = this._container.clientWidth ?? 0;
    const h = this._container.clientHeight ?? 0;
    return { left: scrollLeft, top: scrollTop, width: w, height: h };
  }

  _tileInViewport(row, col, containerRect, viewport) {
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return true;
    if (!containerRect) return true;
    const tr = this.getTileRectInContainer(row, col, containerRect);
    return tr.left < viewport.left + viewport.width && tr.left + tr.width > viewport.left &&
      tr.top < viewport.top + viewport.height && tr.top + tr.height > viewport.top;
  }

  _drawStaticLayer(game, containerRect, viewport) {
    if (!this.ctx || this._width <= 0 || this._height <= 0) return;
    const ts = this._tileSize;
    const rows = this._rows;
    const cols = this._cols;
    this.ctx.clearRect(0, 0, this._width, this._height);
    const cull = containerRect != null && viewport != null;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._tileInViewport(r, c, containerRect, viewport)) continue;
        const x = c * ts;
        const y = r * ts;
        this.ctx.fillStyle = "rgb(20 20 20)";
        this.ctx.strokeStyle = "rgb(30 30 30)";
        this.ctx.lineWidth = 1;
        this.ctx.fillRect(x, y, ts, ts);
        this.ctx.strokeRect(x, y, ts, ts);
      }
    }
    const tiles = game.tileset.active_tiles_list;
    if (!tiles) return;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile?.enabled) continue;
      const r = tile.row;
      const c = tile.col;
      if (cull && !this._tileInViewport(r, c, containerRect, viewport)) continue;
      const x = c * ts;
      const y = r * ts;
      if (tile.part) {
        const path = typeof tile.part.getImagePath === "function" ? tile.part.getImagePath() : null;
        if (path) {
          const img = this._loadImage(path);
          if (img.complete && img.naturalWidth) {
            this.ctx.drawImage(img, x, y, ts, ts);
          }
        }
      }
    }
  }

  _drawDynamicLayer(game, containerRect, viewport) {
    if (!this._dynamicCtx || !game?.tileset || this._width <= 0 || this._height <= 0)
      return;
    const ts = this._tileSize;
    this._dynamicCtx.clearRect(0, 0, this._width, this._height);
    const tiles = game.tileset.active_tiles_list;
    if (!tiles) return;
    const cull = containerRect != null && viewport != null;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile?.enabled || !tile.part) continue;
      const r = tile.row;
      const c = tile.col;
      if (cull && !this._tileInViewport(r, c, containerRect, viewport)) continue;
      const x = c * ts;
      const y = r * ts;
      const maxHeat = tile.part.containment || 1;
      const hasHeatBar = tile.part.base_containment > 0 || (tile.part.containment > 0 && tile.part.category !== "valve");
      if (hasHeatBar && tile.heat_contained != null) {
        const pct = Math.max(0, Math.min(1, tile.heat_contained / maxHeat));
        const barH = Math.max(2, (ts * 5) / 48 | 0);
        const by = y + ts - barH;
        this._dynamicCtx.fillStyle = "rgba(0,0,0,0.85)";
        this._dynamicCtx.fillRect(x, by, ts, barH);
        this._dynamicCtx.fillStyle = "rgb(231 76 60)";
        this._dynamicCtx.fillRect(x, by, ts * pct, barH);
      }
      const hasDurability = tile.part.base_ticks > 0;
      if (hasDurability && tile.ticks != null && tile.part.ticks > 0) {
        const pct = Math.max(0, Math.min(1, tile.ticks / tile.part.ticks));
        const barH = Math.max(2, (ts * 5) / 48 | 0);
        const by = y + ts - barH;
        if (!hasHeatBar) {
          this._dynamicCtx.fillStyle = "rgba(0,0,0,0.85)";
          this._dynamicCtx.fillRect(x, by, ts, barH);
        }
        this._dynamicCtx.fillStyle = "rgb(89 196 53)";
        this._dynamicCtx.fillRect(x, by, ts * pct, barH);
      }
    }
    if (this.ui?.getHeatFlowVisible?.()) {
      this._drawHeatFlowLayer(game, containerRect, viewport);
    }
  }

  _drawHeatFlowLayer(game, containerRect, viewport) {
    const engine = game?.engine;
    if (!this._dynamicCtx || !engine || typeof engine.getLastHeatFlowVectors !== "function") return;
    const vectors = engine.getLastHeatFlowVectors();
    if (!vectors.length) return;
    const ts = this._tileSize;
    const cull = containerRect != null && viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const headLen = Math.max(4, Math.min(12, (ts * 10) / 48 | 0));
    const strokeWidth = Math.max(1.5, (ts * 2) / 48);
    const maxAmountForSpeed = 500;
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (cull) {
        const fromIn = this._tileInViewport(v.fromRow, v.fromCol, containerRect, viewport);
        const toIn = this._tileInViewport(v.toRow, v.toCol, containerRect, viewport);
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
      this._dynamicCtx.strokeStyle = "rgba(255,120,40,0.85)";
      this._dynamicCtx.lineWidth = strokeWidth;
      this._dynamicCtx.lineCap = "round";
      this._dynamicCtx.beginPath();
      this._dynamicCtx.moveTo(fromX, fromY);
      this._dynamicCtx.lineTo(endX, endY);
      this._dynamicCtx.stroke();
      const ax = ux * headLen;
      const ay = uy * headLen;
      const perp = Math.max(2, headLen * 0.4);
      const px = -uy * perp;
      const py = ux * perp;
      this._dynamicCtx.fillStyle = "rgba(255,120,40,0.9)";
      this._dynamicCtx.beginPath();
      this._dynamicCtx.moveTo(toX, toY);
      this._dynamicCtx.lineTo(toX - ax + px, toY - ay + py);
      this._dynamicCtx.lineTo(toX - ax - px, toY - ay - py);
      this._dynamicCtx.closePath();
      this._dynamicCtx.fill();
      const amount = typeof v.amount === "number" ? v.amount : 0;
      const speed = 0.3 + (amount / maxAmountForSpeed) * 1.2;
      const phase = ((now * 0.001 * speed) % 1);
      const pulseLen = 0.25;
      const p0 = (phase - pulseLen * 0.5 + 1) % 1;
      const p1 = (phase + pulseLen * 0.5 + 1) % 1;
      const segLen = len - headLen;
      if (segLen > 4) {
        const x0 = fromX + ux * segLen * p0;
        const y0 = fromY + uy * segLen * p0;
        const x1 = fromX + ux * segLen * p1;
        const y1 = fromY + uy * segLen * p1;
        this._dynamicCtx.strokeStyle = "rgba(255,180,80,0.95)";
        this._dynamicCtx.lineWidth = strokeWidth * 1.4;
        this._dynamicCtx.beginPath();
        this._dynamicCtx.moveTo(x0, y0);
        this._dynamicCtx.lineTo(x1, y1);
        this._dynamicCtx.stroke();
      }
    }
  }

  render(game) {
    if (!game?.tileset || this._width <= 0 || this._height <= 0) return;
    const viewport = this._getViewport();
    const containerRect = this._container && typeof this._container.getBoundingClientRect === "function"
      ? this._container.getBoundingClientRect()
      : null;
    if (this._staticDirty && this.ctx) {
      this._drawStaticLayer(game, containerRect, viewport);
      this._staticDirty = false;
    }
    if (this._dynamicCtx) {
      this._drawDynamicLayer(game, containerRect, viewport);
    }
  }
}

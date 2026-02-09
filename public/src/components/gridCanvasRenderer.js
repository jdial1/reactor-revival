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
    this._imageCacheOrder = [];
    this._imageCacheMax = 128;
    this._container = null;
    this._staticDirty = true;
    this._staticDirtyTiles = new Set();
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

  _getViewport() {
    if (!this._container || typeof this._container.getBoundingClientRect !== "function")
      return null;
    const scrollLeft = this._container.scrollLeft || 0;
    const scrollTop = this._container.scrollTop || 0;
    const w = this._container.clientWidth ?? 0;
    const h = this._container.clientHeight ?? 0;
    return { left: scrollLeft, top: scrollTop, width: w, height: h };
  }

  _tileInViewport(row, col, viewport) {
    if (!viewport || viewport.width <= 0 || viewport.height <= 0) return true;
    const ts = this._tileSize;
    const left = col * ts;
    const top = row * ts;
    return left < viewport.left + viewport.width && left + ts > viewport.left &&
      top < viewport.top + viewport.height && top + ts > viewport.top;
  }

  _drawStaticTile(game, r, c) {
    const ts = this._tileSize;
    const x = c * ts;
    const y = r * ts;
    this.ctx.fillStyle = "rgb(20 20 20)";
    this.ctx.strokeStyle = "rgb(30 30 30)";
    this.ctx.lineWidth = 1;
    this.ctx.fillRect(x, y, ts, ts);
    this.ctx.strokeRect(x, y, ts, ts);
    const tile = game.tileset?.getTile(r, c);
    if (tile?.enabled && tile.part) {
      const path = typeof tile.part.getImagePath === "function" ? tile.part.getImagePath() : null;
      if (path) {
        const img = this._loadImage(path);
        if (img.complete && img.naturalWidth) this.ctx.drawImage(img, x, y, ts, ts);
      }
    }
  }

  _drawStaticLayer(game, containerRect, viewport) {
    if (!this.ctx || this._width <= 0 || this._height <= 0) return;
    const ts = this._tileSize;
    const rows = this._rows;
    const cols = this._cols;
    const cull = viewport != null;
    if (this._staticDirty) {
      this.ctx.clearRect(0, 0, this._width, this._height);
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (cull && !this._tileInViewport(r, c, viewport)) continue;
          this._drawStaticTile(game, r, c);
        }
      }
      this._staticDirty = false;
      this._staticDirtyTiles.clear();
      return;
    }
    if (this._staticDirtyTiles.size === 0) return;
    for (const key of this._staticDirtyTiles) {
      const [r, c] = key.split(",").map(Number);
      if (cull && !this._tileInViewport(r, c, viewport)) continue;
      this.ctx.clearRect(c * ts, r * ts, ts, ts);
      this._drawStaticTile(game, r, c);
    }
    this._staticDirtyTiles.clear();
  }

  _getGlobalBoostCategories() {
    return {
      infused_cells: ["cell"],
      unleashed_cells: ["cell"],
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
    grad.addColorStop(0, "rgba(0, 0, 0, 0.85)");
    grad.addColorStop(0.2, "rgba(40, 20, 80, 0.5)");
    grad.addColorStop(0.6, "rgba(80, 40, 120, 0.2)");
    grad.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(180, 100, 255, ${0.25 + Math.sin(now * 0.008) * 0.15})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
    ctx.stroke();
    const orbitT = (now * 0.002) % (Math.PI * 2);
    const ax = cx + ringR * 0.7 * Math.cos(orbitT);
    const ay = cy + ringR * 0.35 * Math.sin(orbitT);
    ctx.strokeStyle = `rgba(220, 150, 255, ${0.35 + Math.sin(now * 0.01) * 0.2})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(cx, cy, ringR * 0.7, ringR * 0.35, orbitT * 0.5, 0, Math.PI * 2);
    ctx.stroke();
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

  _drawHeatMapLayer(game, viewport) {
    if (!this._dynamicCtx || !game?.tileset?.heatMap || this._width <= 0 || this._height <= 0) return;
    const ts = this._tileSize;
    const rows = this._rows;
    const cols = this._cols;
    const heatMap = game.tileset.heatMap;
    const gridIndex = (r, c) => game.tileset.gridIndex(r, c);
    const smoothed = this._smoothHeatMap(heatMap, rows, cols, gridIndex);
    let maxHeat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = smoothed[gridIndex(r, c)] || 0;
        if (h > maxHeat) maxHeat = h;
      }
    }
    if (maxHeat <= 0) return;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._dynamicCtx;
    const blobRx = ts * 0.42;
    const blobRy = ts * 0.42;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = Math.max(0, Math.min(1, heat / maxHeat));
        const alpha = 0.15 + 0.55 * t;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        ctx.fillStyle = `rgba(0,0,0,${alpha})`;
        ctx.beginPath();
        ctx.ellipse(cx, cy, blobRx, blobRy, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawHeatShimmerLayer(game, viewport) {
    if (!this._dynamicCtx || !game?.tileset?.heatMap || this._width <= 0 || this._height <= 0) return;
    const ts = this._tileSize;
    const rows = this._rows;
    const cols = this._cols;
    const heatMap = game.tileset.heatMap;
    const gridIndex = (r, c) => game.tileset.gridIndex(r, c);
    const smoothed = this._smoothHeatMap(heatMap, rows, cols, gridIndex);
    let maxHeat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = smoothed[gridIndex(r, c)] || 0;
        if (h > maxHeat) maxHeat = h;
      }
    }
    if (maxHeat <= 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._dynamicCtx;
    const threshold = 0.35;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const baseAlpha = 0.06 * intensity;
        for (let i = 0; i < 3; i++) {
          const phase = (now * 0.002 + i * 0.6) % (Math.PI * 2);
          const offsetX = Math.sin(phase) * (ts * 0.12);
          const offsetY = Math.cos(phase * 0.7) * (ts * 0.1);
          const rx = ts * (0.35 + Math.sin(phase * 1.3) * 0.08);
          const ry = ts * (0.25 + Math.cos(phase * 0.9) * 0.06);
          const alpha = baseAlpha * (0.6 + 0.4 * Math.sin(phase * 2));
          ctx.fillStyle = `rgba(255, 200, 120, ${alpha})`;
          ctx.beginPath();
          ctx.ellipse(cx + offsetX, cy + offsetY, rx, ry, phase * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawHeatHazeLayer(game, viewport) {
    if (!this._dynamicCtx || !game?.tileset?.heatMap || this._width <= 0 || this._height <= 0) return;
    const ts = this._tileSize;
    const rows = this._rows;
    const cols = this._cols;
    const heatMap = game.tileset.heatMap;
    const gridIndex = (r, c) => game.tileset.gridIndex(r, c);
    const smoothed = this._smoothHeatMap(heatMap, rows, cols, gridIndex);
    let maxHeat = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const h = smoothed[gridIndex(r, c)] || 0;
        if (h > maxHeat) maxHeat = h;
      }
    }
    if (maxHeat <= 0) return;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._dynamicCtx;
    const threshold = 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const rise = (now * 0.08) % (ts * 1.2);
        const wobble = Math.sin(now * 0.003 + r * 0.5 + c * 0.5) * ts * 0.15;
        const hazeCy = cy - rise + wobble;
        const hazeCx = cx + Math.sin(now * 0.002 + c) * ts * 0.12;
        const rMax = ts * 0.85;
        const grad = ctx.createRadialGradient(hazeCx, hazeCy, 0, hazeCx, hazeCy, rMax);
        grad.addColorStop(0, `rgba(255, 220, 180, ${0.12 * intensity})`);
        grad.addColorStop(0.4, `rgba(255, 200, 150, ${0.06 * intensity})`);
        grad.addColorStop(1, "rgba(255, 200, 150, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rMax, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  _drawDynamicLayer(game, containerRect, viewport) {
    if (!this._dynamicCtx || !game?.tileset || this._width <= 0 || this._height <= 0)
      return;
    const ctx = this._dynamicCtx;
    ctx.save();
    ctx.clearRect(0, 0, this._width, this._height);
    const ts = this._tileSize;
    const tiles = game.tileset.active_tiles_list;
    if (!tiles) return;
    const cull = containerRect != null && viewport != null;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const pulseAlpha = 0.12 + Math.sin(now * 0.002) * 0.06;
    for (let i = 0; i < tiles.length; i++) {
      const tile = tiles[i];
      if (!tile?.enabled || !tile.part) continue;
      const r = tile.row;
      const c = tile.col;
      if (cull && !this._tileInViewport(r, c, viewport)) continue;
      const x = c * ts;
      const y = r * ts;
      if (this._isTileBuffedByGlobalBoost(game, tile)) {
        ctx.fillStyle = `rgba(128, 0, 255, ${pulseAlpha})`;
        ctx.fillRect(x, y, ts, ts);
      }
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
      if (hasHeatBar && tile.part.containment > 0) {
        const heatRatio = tile.heat_contained / tile.part.containment;
        if (heatRatio >= 0.9) {
          const wiggle = Math.sin(now * 0.008) * 2;
          ctx.strokeStyle = `rgba(255, 80, 60, ${0.4 + Math.sin(now * 0.012) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + wiggle, y, ts - wiggle * 2, ts);
          ctx.strokeRect(x, y + wiggle, ts, ts - wiggle * 2);
        }
      }
      if (tile.exploding) {
        const explosionAlpha = 0.35 + Math.sin(now * 0.02) * 0.2;
        ctx.fillStyle = `rgba(255, 90, 40, ${explosionAlpha})`;
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = `rgba(255, 120, 60, ${explosionAlpha})`;
        ctx.lineWidth = 3;
        ctx.strokeRect(x + 1, y + 1, ts - 2, ts - 2);
      }
      const sellingTile = this.ui?.getSellingTile?.();
      if (sellingTile === tile) {
        ctx.fillStyle = "rgba(255, 200, 80, 0.25)";
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = "rgba(255, 180, 60, 0.9)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, ts, ts);
      }
      if (tile.part?.id === "particle_accelerator6") {
        this._drawSingularityOverlay(ctx, x, y, ts, now);
      }
    }
    const highlightedTiles = this.ui?.getHighlightedTiles?.();
    if (highlightedTiles?.length) {
      ctx.fillStyle = "rgba(100, 180, 255, 0.2)";
      for (let i = 0; i < highlightedTiles.length; i++) {
        const t = highlightedTiles[i];
        if (!t?.enabled) continue;
        const r = t.row;
        const c = t.col;
        if (cull && !this._tileInViewport(r, c, viewport)) continue;
        ctx.fillRect(c * ts, r * ts, ts, ts);
        ctx.strokeStyle = "rgba(100, 180, 255, 0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(c * ts, r * ts, ts, ts);
      }
    }
    const hoveredTile = this.ui?.getHoveredTile?.();
    if (hoveredTile?.enabled) {
      const r = hoveredTile.row;
      const c = hoveredTile.col;
      if (!cull || this._tileInViewport(r, c, viewport)) {
        const x = c * ts;
        const y = r * ts;
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(x, y, ts, ts);
        ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(x, y, ts, ts);
      }
    }
    if (this.ui?.getHeatMapVisible?.()) {
      this._drawHeatMapLayer(game, viewport);
      this._drawHeatShimmerLayer(game, viewport);
      this._drawHeatHazeLayer(game, viewport);
    }
    if (this.ui?.getHeatFlowVisible?.() || this.ui?.getDebugOverlayVisible?.()) {
      this._drawHeatFlowLayer(game, containerRect, viewport);
    }
    ctx.restore();
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
    const dashLen = Math.max(6, ts * 0.35 | 0);
    const gapLen = Math.max(4, ts * 0.2 | 0);
    const ctx = this._dynamicCtx;
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      if (cull) {
        const fromIn = this._tileInViewport(v.fromRow, v.fromCol, viewport);
        const toIn = this._tileInViewport(v.toRow, v.toCol, viewport);
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
      const speed = 0.4 + (amount / maxAmountForSpeed) * 2;
      const segLen = len - headLen;
      ctx.strokeStyle = "rgba(255,120,40,0.85)";
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = "round";
      ctx.setLineDash([dashLen, gapLen]);
      const period = dashLen + gapLen;
      ctx.lineDashOffset = -(now * 0.001 * speed * (dashLen + gapLen) * 0.5) % period;
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
      ctx.fillStyle = "rgba(255,120,40,0.9)";
      ctx.beginPath();
      ctx.moveTo(toX, toY);
      ctx.lineTo(toX - ax + px, toY - ay + py);
      ctx.lineTo(toX - ax - px, toY - ay - py);
      ctx.closePath();
      ctx.fill();
      if (segLen > 4) {
        const pulseLen = 0.2;
        const numPulses = 2;
        for (let k = 0; k < numPulses; k++) {
          const phase = ((now * 0.001 * speed + k / numPulses) % 1);
          const p0 = (phase - pulseLen * 0.5 + 1) % 1;
          const p1 = (phase + pulseLen * 0.5 + 1) % 1;
          const x0 = fromX + ux * segLen * p0;
          const y0 = fromY + uy * segLen * p0;
          const x1 = fromX + ux * segLen * p1;
          const y1 = fromY + uy * segLen * p1;
          const alpha = 0.5 + (amount / maxAmountForSpeed) * 0.45;
          ctx.strokeStyle = `rgba(255,180,80,${Math.min(1, alpha)})`;
          ctx.lineWidth = strokeWidth * 1.4;
          ctx.beginPath();
          ctx.moveTo(x0, y0);
          ctx.lineTo(x1, y1);
          ctx.stroke();
        }
      }
    }
  }

  render(game) {
    if (!game?.tileset || this._width <= 0 || this._height <= 0) return;
    const viewport = this._getViewport();
    const containerRect = this._container && typeof this._container.getBoundingClientRect === "function"
      ? this._container.getBoundingClientRect()
      : null;
    if (this.ctx && (this._staticDirty || this._staticDirtyTiles.size > 0)) {
      this._drawStaticLayer(game, containerRect, viewport);
    }
    if (this._dynamicCtx) {
      this._drawDynamicLayer(game, containerRect, viewport);
    }
  }
}

import {
  getIndex,
  GRID,
  COLORS,
  OVERHEAT_VISUAL,
  BAR,
  SINGULARITY,
  HEAT_MAP,
  HEAT_SHIMMER,
  HEAT_HAZE,
  HEAT_FLOW,
  GRID_TARGET_TOTAL_TILES,
  GRID_MIN_DIMENSION,
  GRID_MAX_DISPLAY_DIMENSION,
  ZOOM_DAMPING_FACTOR,
  PINCH_DISTANCE_THRESHOLD_PX,
  MOMENTUM_DECAY_FACTOR,
  SNAP_BACK_THRESHOLD_RATIO,
  SNAP_BACK_SPRING_CONSTANT,
  ZOOM_SCALE_MIN,
  ZOOM_SCALE_MAX,
  logger,
  BaseComponent,
} from "../utils.js";

export { Tileset } from "../logic.js";

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
        logger.log("warn", "ui", "[StaticGrid] render bailed", { hasCtx: !!ctx, width: _width, height: _height });
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
        const pct = Math.max(0, Math.min(1, tile.heat_contained / maxHeat));
        const barH = Math.max(BAR.minBarHeight, (ts * BAR.barHeightRatio) | 0);
        const by = y + ts - barH;
        ctx.fillStyle = COLORS.heatBarBg;
        ctx.fillRect(x, by, ts, barH);
        ctx.fillStyle = COLORS.heatBarFill;
        ctx.fillRect(x, by, ts * pct, barH);
      }

      const hasDurability = tile.part.base_ticks > 0;
      if (hasDurability && tile.ticks != null && tile.part.ticks > 0) {
        const pct = Math.max(0, Math.min(1, tile.ticks / tile.part.ticks));
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

  _drawHeatMapLayer(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const blobRx = ts * HEAT_MAP.blobRadiusRatio;
    const blobRy = ts * HEAT_MAP.blobRadiusRatio;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = Math.max(0, Math.min(1, heat / maxHeat));
        const alpha = HEAT_MAP.baseAlpha + HEAT_MAP.alphaRange * t;
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
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const threshold = HEAT_SHIMMER.threshold;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const baseAlpha = HEAT_SHIMMER.baseAlphaMultiplier * intensity;
        for (let i = 0; i < HEAT_SHIMMER.layerCount; i++) {
          const phase = (now * HEAT_SHIMMER.timeScale + i * HEAT_SHIMMER.phaseSpacing) % (Math.PI * 2);
          const offsetX = Math.sin(phase) * (ts * 0.12);
          const offsetY = Math.cos(phase * 0.7) * (ts * 0.1);
          const rx = ts * (0.35 + Math.sin(phase * 1.3) * 0.08);
          const ry = ts * (0.25 + Math.cos(phase * 0.9) * 0.06);
          const alpha = baseAlpha * (0.6 + 0.4 * Math.sin(phase * 2));
          ctx.fillStyle = COLORS.shimmerTint(alpha);
          ctx.beginPath();
          ctx.ellipse(cx + offsetX, cy + offsetY, rx, ry, phase * 0.3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }

  _drawHeatHazeLayer(game, viewport) {
    const hd = this._prepareHeatData(game);
    if (!hd) return;
    const { smoothed, maxHeat, gridIndex, rows, cols } = hd;
    const ts = this._shared._tileSize;
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const cull = viewport != null && viewport.width > 0 && viewport.height > 0;
    const ctx = this._shared._dynamicCtx;
    const threshold = HEAT_HAZE.threshold;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (cull && !this._shared.tileInViewport(r, c, viewport)) continue;
        const heat = smoothed[gridIndex(r, c)] || 0;
        const t = heat / maxHeat;
        if (t < threshold) continue;
        const x = c * ts;
        const y = r * ts;
        const cx = x + ts * 0.5;
        const cy = y + ts * 0.5;
        const intensity = (t - threshold) / (1 - threshold);
        const rise = (now * HEAT_HAZE.riseSpeedPx) % (ts * 1.2);
        const wobble = Math.sin(now * HEAT_HAZE.wobbleFreq + r * 0.5 + c * 0.5) * ts * 0.15;
        const hazeCy = cy - rise + wobble;
        const hazeCx = cx + Math.sin(now * 0.002 + c) * ts * 0.12;
        const rMax = ts * HEAT_HAZE.maxRadiusRatio;
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
    const dashLen = Math.max(6, (ts * 0.35) | 0);
    const gapLen = Math.max(4, (ts * 0.2) | 0);
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
          const phase = (now * 0.001 * speed + k / numPulses) % 1;
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
      this._drawHeatMapLayer(game, viewport);
      this._drawHeatShimmerLayer(game, viewport);
      this._drawHeatHazeLayer(game, viewport);
    }
    if (ui?.getHeatFlowVisible?.() || ui?.getDebugOverlayVisible?.()) {
      this._drawHeatFlowLayer(game, viewport);
    }
  }
}

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

export class GridScaler extends BaseComponent {

    constructor(ui) {
        super();
        this.ui = ui;
        this.wrapper = null;
        this.reactor = null;
        this.resizeObserver = null;

        this.config = {
            targetTotalTiles: GRID_TARGET_TOTAL_TILES,
            minCols: GRID_MIN_DIMENSION,
            minRows: GRID_MIN_DIMENSION,
            maxCols: GRID_MAX_DISPLAY_DIMENSION,
            maxRows: GRID_MAX_DISPLAY_DIMENSION
        };

        this.gestureState = {
            isPinching: false,
            isPanning: false,
            initialDistance: 0,
            initialScale: 1,
            initialTranslate: { x: 0, y: 0 },
            pinchMidpointInWrapper: { x: 0, y: 0 },
            currentTranslate: { x: 0, y: 0 },
            currentScale: 1,
            targetTranslate: { x: 0, y: 0 },
            targetScale: 1,
            zoomDamping: ZOOM_DAMPING_FACTOR,
            touches: [],
            pinchDistanceThreshold: PINCH_DISTANCE_THRESHOLD_PX,
            lastTranslate: { x: 0, y: 0 },
            lastMoveTime: 0,
            velocity: { x: 0, y: 0 },
            momentumDecay: MOMENTUM_DECAY_FACTOR,
            snapBackThreshold: SNAP_BACK_THRESHOLD_RATIO,
            snapBackSpring: SNAP_BACK_SPRING_CONSTANT,
            _animationId: null
        };

    }



    init() {

        const pageInit = this.ui.pageInitUI;
        this.reactor = pageInit?.getReactor?.() ?? this.ui.DOMElements?.reactor ?? document.getElementById('reactor');
        this.wrapper = pageInit?.getReactorWrapper?.() ?? this.ui.DOMElements?.reactor_wrapper ?? document.getElementById('reactor_wrapper');

        if (!this.wrapper) return;

        this.resizeObserver = new ResizeObserver(() => this.requestResize());
        this.resizeObserver.observe(this.wrapper);

        this.requestResize();

        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        if (isMobile) {
            this.setupGestures();
        }

    }

    teardown() {
        if (this.resizeObserver && this.wrapper) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        }
        if (this._touchHandlers && this.wrapper) {
            this.wrapper.removeEventListener('touchstart', this._touchHandlers.start);
            this.wrapper.removeEventListener('touchmove', this._touchHandlers.move);
            this.wrapper.removeEventListener('touchend', this._touchHandlers.end);
            this.wrapper.removeEventListener('touchcancel', this._touchHandlers.end);
            this._touchHandlers = null;
        }
    }

    setupGestures() {
        if (!this.wrapper) return;

        this._touchHandlers = {
            start: (e) => this.handleTouchStart(e),
            move: (e) => this.handleTouchMove(e),
            end: (e) => this.handleTouchEnd(e),
        };
        this.wrapper.addEventListener('touchstart', this._touchHandlers.start, { passive: false });
        this.wrapper.addEventListener('touchmove', this._touchHandlers.move, { passive: false });
        this.wrapper.addEventListener('touchend', this._touchHandlers.end, { passive: false });
        this.wrapper.addEventListener('touchcancel', this._touchHandlers.end, { passive: false });
    }

    getDistance(touch1, touch2) {
        const dx = touch2.clientX - touch1.clientX;
        const dy = touch2.clientY - touch1.clientY;
        return Math.sqrt(dx * dx + dy * dy);
    }

    getMidpoint(touch1, touch2) {
        return {
            x: (touch1.clientX + touch2.clientX) / 2,
            y: (touch1.clientY + touch2.clientY) / 2
        };
    }

    handleTouchStart(e) {
        if (e.touches.length === 2) {
            this.gestureState.touches = Array.from(e.touches);
            this.gestureState.initialDistance = this.getDistance(e.touches[0], e.touches[1]);
            this.gestureState.initialScale = this.gestureState.currentScale || 1;
            this.gestureState.initialTranslate = { ...this.gestureState.currentTranslate };
            this.gestureState.targetScale = this.gestureState.currentScale;
            this.gestureState.targetTranslate = { ...this.gestureState.currentTranslate };
            const midpoint = this.getMidpoint(e.touches[0], e.touches[1]);
            const wrapperRect = this.wrapper.getBoundingClientRect();
            const wrapperCenterX = wrapperRect.left + wrapperRect.width / 2;
            const wrapperCenterY = wrapperRect.top + wrapperRect.height / 2;
            this.gestureState.pinchMidpointInWrapper = {
                x: midpoint.x - wrapperCenterX,
                y: midpoint.y - wrapperCenterY
            };
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.lastMoveTime = performance.now();
            this.gestureState.lastTranslate = { ...this.gestureState.currentTranslate };
        } else if (e.touches.length === 1) {
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.touches = [];
        }
    }

    handleTouchMove(e) {
        if (e.touches.length !== 2) return;
        const currentDistance = this.getDistance(e.touches[0], e.touches[1]);
        if (!this.gestureState.isPinching && !this.gestureState.isPanning) {
            const threshold = this.gestureState.pinchDistanceThreshold || 10;
            const distanceDelta = Math.abs(currentDistance - this.gestureState.initialDistance);
            if (distanceDelta < threshold) return;
            this.gestureState.isPinching = true;
            this.gestureState.isPanning = true;
        }
        e.preventDefault();
        const g = this.gestureState;
        const now = performance.now();
        const dt = Math.min(100, now - g.lastMoveTime) / 1000;
        if (dt > 0) {
            g.velocity.x = (g.currentTranslate.x - g.lastTranslate.x) / dt;
            g.velocity.y = (g.currentTranslate.y - g.lastTranslate.y) / dt;
        }
        g.lastTranslate = { ...g.currentTranslate };
        g.lastMoveTime = now;

        const d = g.zoomDamping;
        const scale = (currentDistance / g.initialDistance) * g.initialScale;
        const clampedScale = Math.max(ZOOM_SCALE_MIN, Math.min(ZOOM_SCALE_MAX, scale));
        g.targetScale = clampedScale;
        const ratio = g.currentScale > 0 ? clampedScale / g.currentScale : 1;
        const mx = g.pinchMidpointInWrapper.x;
        const my = g.pinchMidpointInWrapper.y;
        g.targetTranslate = {
            x: g.currentTranslate.x * ratio + mx * (1 - ratio),
            y: g.currentTranslate.y * ratio + my * (1 - ratio)
        };
        const currentMidpoint = this.getMidpoint(e.touches[0], e.touches[1]);
        const previousMidpoint = this.getMidpoint(g.touches[0], g.touches[1]);
        g.targetTranslate.x += currentMidpoint.x - previousMidpoint.x;
        g.targetTranslate.y += currentMidpoint.y - previousMidpoint.y;

        g.currentScale += (g.targetScale - g.currentScale) * d;
        g.currentTranslate.x += (g.targetTranslate.x - g.currentTranslate.x) * d;
        g.currentTranslate.y += (g.targetTranslate.y - g.currentTranslate.y) * d;
        g.touches = Array.from(e.touches);
        this.applyTransform();
    }

    handleTouchEnd(e) {
        if (e.touches.length < 2) {
            this.gestureState.isPinching = false;
            this.gestureState.isPanning = false;
            this.gestureState.touches = [];
            this.startInertiaOrSnapBack();
        }
    }

    startInertiaOrSnapBack() {
        if (this.gestureState._animationId) cancelAnimationFrame(this.gestureState._animationId);
        const g = this.gestureState;
        const run = () => {
            const w = this.wrapper;
            if (!w || !this.reactor) return;
            const wW = w.clientWidth || 1;
            const wH = w.clientHeight || 1;
            const limitX = wW * g.snapBackThreshold;
            const limitY = wH * g.snapBackThreshold;
            const needSnap = Math.abs(g.currentTranslate.x) > limitX || Math.abs(g.currentTranslate.y) > limitY;
            const speed = Math.sqrt(g.velocity.x * g.velocity.x + g.velocity.y * g.velocity.y);
            const stillMoving = speed > 5;

            if (stillMoving && !needSnap) {
                g.currentTranslate.x += g.velocity.x * 0.016;
                g.currentTranslate.y += g.velocity.y * 0.016;
                g.velocity.x *= g.momentumDecay;
                g.velocity.y *= g.momentumDecay;
            } else if (needSnap) {
                g.velocity.x = 0;
                g.velocity.y = 0;
                g.currentTranslate.x += (0 - g.currentTranslate.x) * g.snapBackSpring;
                g.currentTranslate.y += (0 - g.currentTranslate.y) * g.snapBackSpring;
            } else {
                g.velocity.x = 0;
                g.velocity.y = 0;
            }

            this.applyTransform();
            const stillSnapping = needSnap && (Math.abs(g.currentTranslate.x) > 1 || Math.abs(g.currentTranslate.y) > 1);
            if (stillMoving || stillSnapping) {
                g._animationId = requestAnimationFrame(run);
            } else {
                g._animationId = null;
            }
        };
        g._animationId = requestAnimationFrame(run);
    }

    applyTransform() {
        if (!this.reactor) return;

        const { currentScale, currentTranslate } = this.gestureState;
        const transform = `translate(${currentTranslate.x}px, ${currentTranslate.y}px) scale(${currentScale})`;
        this.reactor.style.transform = transform;
        this.reactor.style.transformOrigin = 'center center';
    }

    resetTransform() {
        if (!this.reactor) return;

        this.gestureState.currentScale = 1;
        this.gestureState.targetScale = 1;
        this.gestureState.currentTranslate = { x: 0, y: 0 };
        this.gestureState.targetTranslate = { x: 0, y: 0 };
        this.reactor.style.transform = '';
        this.reactor.style.transformOrigin = '';
    }



    requestResize() {
        if (this.ui?.game) {
            requestAnimationFrame(() => this.resize());
        }
    }


    static get MOBILE_BREAKPOINT_PX() { return 900; }
    static get MOBILE_MIN_TILE_PX() { return 40; }
    static get DESKTOP_MIN_TILE_PX() { return 36; }
    static get MAX_TILE_SIZE_PX() { return 64; }
    static get MOBILE_PREF_COLS() { return 8; }
    static get MOBILE_TALL_ROWS() { return 14; }
    static get MOBILE_MED_ROWS() { return 10; }
    static get MAX_DESKTOP_COLS() { return 16; }

    getMobileGridDimensions(availWidth, availHeight) {
        const minTileSize = GridScaler.MOBILE_MIN_TILE_PX;
        const maxTilesX = Math.floor(availWidth / minTileSize);
        const maxTilesY = Math.floor(availHeight / minTileSize);
        let cols = GridScaler.MOBILE_PREF_COLS;
        cols = Math.max(this.config.minCols, Math.min(cols, maxTilesX, this.config.maxCols));
        let rows = maxTilesY >= GridScaler.MOBILE_TALL_ROWS ? GridScaler.MOBILE_TALL_ROWS : maxTilesY >= GridScaler.MOBILE_MED_ROWS ? GridScaler.MOBILE_MED_ROWS : Math.max(this.config.minRows, Math.min(maxTilesY, this.config.maxRows));
        const actualTileSizeY = availHeight / rows;
        if (actualTileSizeY < minTileSize) {
            rows = Math.floor(availHeight / minTileSize);
            rows = Math.max(this.config.minRows, Math.min(rows, this.config.maxRows));
        }
        return { rows, cols };
    }

    getDesktopGridDimensions(availWidth, availHeight) {
        const maxDesktopCols = GridScaler.MAX_DESKTOP_COLS;
        const minTileSize = GridScaler.DESKTOP_MIN_TILE_PX;
        const targetTotalTiles = this.config.targetTotalTiles;
        const maxTilesX = Math.floor(availWidth / minTileSize);
        const maxTilesY = Math.floor(availHeight / minTileSize);
        const idealCols = Math.ceil(Math.sqrt(targetTotalTiles));
        const cols = Math.min(maxTilesX, maxDesktopCols, Math.max(idealCols, this.config.minCols));
        let rows = Math.round(targetTotalTiles / cols);
        rows = Math.max(this.config.minRows, Math.min(rows, maxTilesY, this.config.maxRows));
        return { rows, cols };
    }

    calculateGridDimensions(availWidth, availHeight, maxTileSize) {
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        if (isMobile) return this.getMobileGridDimensions(availWidth, availHeight);
        return this.getDesktopGridDimensions(availWidth, availHeight);
    }



    resize(_layoutRetry) {

        if (!this.reactor || !this.wrapper) {
            const pageInit = this.ui.pageInitUI;
            this.reactor = pageInit?.getReactor?.() ?? this.ui.DOMElements?.reactor ?? document.getElementById('reactor');
            this.wrapper = pageInit?.getReactorWrapper?.() ?? this.ui.DOMElements?.reactor_wrapper ?? document.getElementById('reactor_wrapper');
        }

        if (!this.reactor || !this.wrapper) {
            if (!this._resizeBailLogged && this.ui?.game) {
                this._resizeBailLogged = true;
                logger.log('debug', 'ui', '[GridScaler] resize skipped: reactor/wrapper not in DOM yet');
            }
            return;
        }
        this._resizeBailLogged = false;

        const availWidth = this.wrapper.clientWidth;
        const availHeight = this.wrapper.clientHeight;

        if (availWidth <= 0 || availHeight <= 0) {
            const retry = (_layoutRetry | 0) + 1;
            if (retry <= 4) {
                requestAnimationFrame(() => this.resize(retry));
            } else if (retry === 5 && this.ui?.game) {
                setTimeout(() => this.resize(5), 200);
            } else if (!this._layoutExhaustedLogged) {
                this._layoutExhaustedLogged = true;
                logger.log('debug', 'ui', '[GridScaler] zero dimensions after retries, will retry on next resize trigger');
            }
            return;
        }
        this._layoutExhaustedLogged = false;

        const maxTileSize = GridScaler.MAX_TILE_SIZE_PX;
        const isMobile = typeof window !== 'undefined' && window.innerWidth <= GridScaler.MOBILE_BREAKPOINT_PX;
        const dims = this.calculateGridDimensions(availWidth, availHeight, maxTileSize);

        let cols = dims.cols;
        let rows = dims.rows;

        const sizeXFinal = availWidth / cols;
        const sizeYFinal = availHeight / rows;
        let tileSize = Math.floor(Math.min(sizeXFinal, sizeYFinal, maxTileSize));
        
        const calculatedGridHeight = rows * tileSize;
        if (calculatedGridHeight > availHeight && isMobile) {
            const maxRowsForHeight = Math.floor(availHeight / tileSize);
            if (maxRowsForHeight >= this.config.minRows) {
                rows = maxRowsForHeight;
                tileSize = Math.floor(availHeight / rows);
            }
        }

        if (!this.ui?.game) {
            logger.log('warn', 'ui', '[GridScaler] resize bailed: no game instance');
            return;
        }
        if (this.ui.game.resizeGrid) {
            this.ui.game.resizeGrid(rows, cols);
        } else {
            this.ui.game.rows = rows;
            this.ui.game.cols = cols;
        }

        const finalGridWidth = cols * tileSize;
        const finalGridHeight = rows * tileSize;

        this.reactor.style.setProperty('--tile-size', `${tileSize}px`);
        this.reactor.style.setProperty('--game-cols', cols);
        this.reactor.style.setProperty('--game-rows', rows);

        this.reactor.style.width = `${finalGridWidth}px`;
        this.reactor.style.height = `${finalGridHeight}px`;

        if (this.ui.gridCanvasRenderer) {
          this.ui.gridCanvasRenderer.setSize(finalGridWidth, finalGridHeight);
          this.ui.gridCanvasRenderer.setGridDimensions(rows, cols);
          this.ui.gridCanvasRenderer.markStaticDirty();
          logger.log('debug', 'ui', `[GridScaler] resize complete: ${cols}x${rows} grid, ${finalGridWidth}x${finalGridHeight}px`);
        } else {
          logger.log('warn', 'ui', '[GridScaler] resize complete but gridCanvasRenderer missing');
        }

        this.applyWrapperAndSectionStyles(isMobile);
    }

    applyWrapperAndSectionStyles(isMobile) {
        if (!this.wrapper) return;
        this.wrapper.style.display = 'flex';
        this.wrapper.style.alignItems = 'center';
        this.wrapper.style.justifyContent = 'center';
        const section = document.getElementById('reactor_section') || this.wrapper.parentElement;
        if (section && isMobile) {
            const topBar = document.getElementById('mobile_passive_top_bar');
            const topOffset = topBar ? topBar.offsetHeight : 0;
            const buildRow = document.getElementById('build_above_deck_row');
            const controlDeck = document.getElementById('reactor_control_deck');
            const bottomNav = document.getElementById('bottom_nav');
            const bottomOffset = (buildRow?.offsetHeight || 0) + (controlDeck?.offsetHeight || 0) + (bottomNav?.offsetHeight || 0);
            section.style.paddingTop = `${topOffset}px`;
            section.style.paddingRight = '5px';
            section.style.paddingBottom = `${bottomOffset}px`;
            section.style.paddingLeft = '5px';
        }
        if (section && !isMobile) {
            section.style.paddingTop = '';
            section.style.paddingRight = '';
            section.style.paddingBottom = '';
            section.style.paddingLeft = '';
        }
        this.wrapper.style.paddingTop = '';
        this.wrapper.style.paddingRight = '';
        this.wrapper.style.paddingBottom = '';
        this.wrapper.style.paddingLeft = '';
    }

}

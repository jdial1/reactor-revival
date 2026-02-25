import { COLORS, HEAT_MAP, HEAT_SHIMMER, HEAT_HAZE, HEAT_FLOW } from "../../core/rendererConstants.js";
import { getIndex } from "../../core/logic/gridUtils.js";

export class HeatEffectsRenderer {
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
    const dashLen = Math.max(6, ts * 0.35 | 0);
    const gapLen = Math.max(4, ts * 0.2 | 0);
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
          const phase = ((now * 0.001 * speed + k / numPulses) % 1);
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

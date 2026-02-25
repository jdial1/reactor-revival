import { COLORS, OVERHEAT_VISUAL, BAR, SINGULARITY } from "../../core/rendererConstants.js";

export class DynamicOverlayRenderer {
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

import { subscribeKey, preferences, setDecimal } from "../../store.js";
import { logger } from "../../core/logger.js";
import { html } from "lit-html";
import { render, repeat } from "../../dom/lit.js";
import { syncReactorHeatVisualDom, isHeatNetBalanced } from "../shell/heat-dom-sync.js";
import { safeCall, teardownAll } from "../../core/teardown.js";
import {
  getPageReactorWrapper,
  getPageReactor,
  getPageReactorBackground,
  getUiElement,
} from "../shell/page-dom.js";
import { handleGridInteraction } from "./grid-intent-handler.js";

const heatVisualOverlays = new WeakMap();
const HEAT_FLOW_STROKE = "rgba(255,120,40,0.9)";

function buildHeatFlowArrowSegments(vector, project) {
  const from = project(vector.fromRow, vector.fromCol);
  const to = project(vector.toRow, vector.toCol);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const ux = dx / len;
  const uy = dy / len;
  const headLen = 8;
  const endX = to.x - ux * headLen;
  const endY = to.y - uy * headLen;
  const perp = 4;
  const px = -uy * perp;
  const py = ux * perp;
  return {
    line: { x1: from.x, y1: from.y, x2: endX, y2: endY },
    head: `${to.x},${to.y} ${to.x - ux * headLen + px},${to.y - uy * headLen + py} ${to.x - ux * headLen - px},${to.y - uy * headLen - py}`,
  };
}

function heatFlowOverlayTemplate(vectors, viewW, viewH, project) {
  return html`<svg
    class="heat-flow-overlay"
    viewBox="0 0 ${viewW} ${viewH}"
    width="100%"
    height="100%"
    style="position: absolute;left: 0;top: 0;pointer-events: none;"
  >
    ${repeat(vectors, (v, i) => `${v.fromRow},${v.fromCol},${v.toRow},${v.toCol},${i}`, (v) => {
      const seg = buildHeatFlowArrowSegments(v, project);
      if (!seg) return html``;
      return html`
        <line
          x1=${seg.line.x1}
          y1=${seg.line.y1}
          x2=${seg.line.x2}
          y2=${seg.line.y2}
          stroke=${HEAT_FLOW_STROKE}
          stroke-width="2"
        ></line>
        <polygon points=${seg.head} fill=${HEAT_FLOW_STROKE}></polygon>
      `;
    })}
  </svg>`;
}

export class HeatVisualsUI {
  constructor(ui) {
    this.ui = ui;
    this._overlay = null;
    this._heatFlowOverlay = null;
    this._voltageOverlaySvg = null;
    this._unsubs = [];
    const st = ui.game?.state;
    if (st) {
      this._unsubs.push(subscribeKey(st, "heat_ratio", (r) => this._applyHeatFromRatio(typeof r === "number" && isFinite(r) ? r : 0)));
      this._unsubs.push(subscribeKey(st, "stats_net_heat", () => {
        const r = typeof st.heat_ratio === "number" && isFinite(st.heat_ratio) ? st.heat_ratio : 0;
        this._applyHeatFromRatio(r);
      }));
    }
    if (!ui._unmounts) ui._unmounts = [];
    ui._unmounts.push(() => this.teardown());
  }

  teardown() {
    teardownAll(this._unsubs);
    this._unsubs.length = 0;
    this.resetOverlays();
  }

  _applyHeatFromRatio(heatRatio) {
    const ui = this.ui;
    const st = ui.game?.state;
    const netHeat = st?.stats_net_heat;
    const heatGen = st?.stats_heat_generation;
    const heatBalanced = isHeatNetBalanced(netHeat, heatGen);
    const cd = heatBalanced ? Math.min(0.5, Math.max(0, heatRatio)) : Math.min(1.5, Math.max(0, heatRatio));
    if (ui.uiState) {
      ui.uiState.core_danger = cd;
      ui.uiState.heat_ratio = heatRatio;
    }
    syncReactorHeatVisualDom(ui, heatRatio, netHeat, heatGen);
  }

  resetOverlays() {
    this._overlay = null;
    this._heatFlowOverlay = null;
    this._voltageOverlaySvg = null;
    heatVisualOverlays.delete(this);
  }

  _ensureOverlay() {
    const ui = this.ui;
    const existing = heatVisualOverlays.get(this);
    if (existing instanceof Element && existing.isConnected) return existing;
    const reactorWrapper = getPageReactorWrapper(ui);
    if (!reactorWrapper) {
      return null;
    }
    const overlay = document.createElement('div');
    overlay.className = 'reactor-overlay';
    overlay.style.position = 'absolute';
    overlay.style.left = '0';
    overlay.style.top = '0';
    overlay.style.right = '0';
    overlay.style.bottom = '0';
    overlay.style.pointerEvents = 'none';
    overlay.style.overflow = 'hidden';
    reactorWrapper.style.position = reactorWrapper.style.position || 'relative';
    reactorWrapper.appendChild(overlay);
    heatVisualOverlays.set(this, overlay);
    this._overlay = overlay;
    return overlay;
  }

  _ensureHeatFlowOverlay() {
    const overlay = this._ensureOverlay();
    if (!overlay) return null;
    if (this._heatFlowOverlay?.isConnected) return this._heatFlowOverlay;
    this._heatFlowOverlay = overlay;
    return overlay;
  }

  _ensureVoltageOverlay() {
    const overlay = this._ensureOverlay();
    if (!overlay) return null;
    const cached = this._voltageOverlaySvg;
    if (cached) {
      try {
        if (cached.isConnected) return cached;
      } catch {
        this._voltageOverlaySvg = null;
      }
    }
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "voltage-placement-overlay");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    overlay.appendChild(svg);
    this._voltageOverlaySvg = svg;
    return svg;
  }

  drawVoltagePlacementOverlay() {
    const svg = this._ensureVoltageOverlay();
    if (svg) {
      svg.style.display = "none";
      svg.innerHTML = "";
    }
  }

  _tileCenterToOverlayPosition(row, col) {
    const ui = this.ui;
    const overlay = this._ensureOverlay();
    if (!overlay) return { x: 0, y: 0 };
    const reactorEl = ui.gridCanvasRenderer?.getCanvas() || getPageReactor(ui);
    const tileSize = ui.gridCanvasRenderer?.getTileSize() ?? (parseInt(getComputedStyle(reactorEl || document.body).getPropertyValue('--tile-size'), 10) || 48);
    if (!reactorEl) return { x: 0, y: 0 };
    const reactorRect = reactorEl.getBoundingClientRect();
    const overlayRect = overlay.getBoundingClientRect();
    const x = reactorRect.left - overlayRect.left + (col + 0.5) * tileSize;
    const y = reactorRect.top - overlayRect.top + (row + 0.5) * tileSize;
    return { x, y };
  }

  getHeatFlowVisible() {
    return preferences.heatFlowVisible !== false;
  }

  getHeatMapVisible() {
    return preferences.heatMapVisible === true;
  }

  getDebugOverlayVisible() {
    return preferences.debugOverlay === true;
  }

  drawHeatFlowOverlay() {
    const ui = this.ui;
    if (ui.gridCanvasRenderer) return;
    const enabled = this.getHeatFlowVisible();
    const overlay = this._ensureOverlay();
    if (!overlay) return;
    const host = this._ensureHeatFlowOverlay();
    if (!host) return;
    if (!enabled) {
      render(html``, host);
      return;
    }
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    const vectors = ui.game?.coreBridge?.session?.getHeatFlowVectors?.() ?? [];
    if (!vectors.length) {
      render(html``, host);
      return;
    }
    const project = (row, col) => this._tileCenterToOverlayPosition(row, col);
    render(heatFlowOverlayTemplate(vectors, w, h, project), host);
  }

  clearHeatWarningClasses() {
    const bg = getPageReactorBackground(this.ui);
    if (bg) {
      bg.classList.remove("heat-warning", "heat-critical");
      bg.style.setProperty("--heat-bg-alpha", "0");
      bg.style.setProperty("--heat-ratio", "0");
      bg.style.setProperty("--core-danger", "0");
    }
    const root = typeof document !== "undefined" ? document.documentElement : null;
    if (root) root.style.setProperty("--core-danger", "0");
    const appRoot = getUiElement(this.ui, "app_root");
    if (appRoot) {
      appRoot.style.setProperty("--core-danger", "0");
      appRoot.style.setProperty("--crt-heat", "0");
      appRoot.style.setProperty("--crt-jitter-duration", "20s");
      appRoot.classList.remove("crt-heat-tearing");
    }
    const reactorEl = getPageReactor(this.ui);
    if (reactorEl) reactorEl.setAttribute("data-heat-ratio", "0");
  }

}

function tileFxTemplate(items) {
  return html`${repeat(items, (item) => item.id, (item) => {
    if (item.fxType === "vent") {
      return html`<span
        class="vent-rotor spin"
        style=${`position:absolute;left:${item.left}px;top:${item.top}px;width:${item.width}px;height:${item.height}px;pointer-events:none;${item.bgImage ? `background-image:url('${item.bgImage}');` : ""}background-size:166.66% 166.66%;background-position:center;background-repeat:no-repeat;image-rendering:pixelated;`}
      ></span>`;
    }
    return html`<img
      class="tile-fx fx-${item.kind}${item.fadeOut ? " fx-fade-out" : ""}"
      src=${item.src}
      alt=${item.kind}
      style=${`position:absolute;width:${item.size}px;height:${item.size}px;left:${item.left}px;top:${item.top}px;`}
    />`;
  })}`;
}

export class GridInteractionUI {
  constructor(ui) {
    this.ui = ui;
    this._activeVentRotors = new Set();
    this._activeTileIconKeys = new Set();
    this.highlightedSegment = null;
    this._unsubs = [];
    this._wireVisualFx();
    this._wireTileFx();
    if (!ui._unmounts) ui._unmounts = [];
    ui._unmounts.push(() => this.teardown());
  }

  teardown() {
    teardownAll(this._unsubs);
    this._unsubs.length = 0;
  }

  _wireTileFx() {
    const uiState = this.ui?.uiState;
    if (!uiState) return;
    this._unsubs.push(subscribeKey(uiState, "tile_fx", (items) => {
      if (!items?.length) return;
      const batch = items.splice(0, items.length);
      const host = this._ensureTileFxHost();
      if (!host) return;
      render(tileFxTemplate(batch), host);
      for (let i = 0; i < batch.length; i++) {
        const item = batch[i];
        setTimeout(() => {
          this._activeTileIconKeys.delete(item.id);
          if (item.ventKey) this._activeVentRotors.delete(item.ventKey);
        }, item.durationMs ?? 300);
      }
    }));
  }

  _ensureTileFxHost() {
    const overlay = this._ensureOverlay?.() ?? getPageReactorBackground(this.ui);
    if (!overlay) return null;
    let host = overlay.querySelector(".tile-fx-layer");
    if (!host) {
      host = document.createElement("div");
      host.className = "tile-fx-layer";
      host.style.cssText = "position:absolute;inset:0;pointer-events:none;overflow:hidden;";
      overlay.appendChild(host);
    }
    return host;
  }

  _ensureOverlay() {
    return getPageReactorBackground(this.ui);
  }

  _tileFxRect(row, col) {
    const ui = this.ui;
    const container = getPageReactorBackground(ui);
    if (!container || !ui.gridCanvasRenderer) return null;
    const containerRect = container.getBoundingClientRect();
    return ui.gridCanvasRenderer.getTileRectInContainer(row, col, containerRect);
  }

  _enqueueTileFx(payload) {
    const uiState = this.ui?.uiState;
    if (!uiState) return;
    if (!uiState.tile_fx) uiState.tile_fx = [];
    uiState.tile_fx.push(payload);
  }

  _wireVisualFx() {
    const uiState = this.ui?.uiState;
    if (!uiState) return;
    this._unsubs.push(subscribeKey(uiState, "visual_fx", (fx) => {
      if (!fx?.length) return;
      const batch = fx.splice(0, fx.length);
      this._processVisualFx(batch);
    }));
  }

  _processVisualFx(batch) {
    const ts = this.ui?.game?.tileset;
    if (!ts) return;
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      if (item.kind === "power" || item.kind === "heat") {
        const t = ts.getTile(item.r, item.c);
        if (!t) continue;
        if (item.kind === "power") this.spawnTileIcon("power", t, null);
        else this.blinkVent(t);
      } else if (item.kind === "reflector") {
        const fromTile = ts.getTile(item.fromR, item.fromC);
        const toTile = ts.getTile(item.toR, item.toC);
        if (fromTile && toTile) this.pulseReflector(fromTile, toTile);
      } else if (item.kind === "explosion") {
        this.ui.meltdownUI?.flashExplosionBurst?.();
      }
    }
  }

  clearSegmentHighlight() {
    this.highlightedSegment = null;
  }

  getHighlightedTiles() {
    return this.highlightedSegment?.components ?? [];
  }

  getSellingTile() {
    return this.ui.inputHandler?.getSellingTile() ?? null;
  }

  getHoveredTile() {
    return this.ui.inputHandler?.getHoveredTile() ?? null;
  }

  getInteractionState() {
    return this.ui?.uiState?.interaction ?? null;
  }

  handleGridInteraction(tile, event) {
    return handleGridInteraction(this.ui, tile, event);
  }

  spawnTileIcon(kind, fromTile, toTile = null) {
    const ui = this.ui;
    if (!fromTile || !ui.gridCanvasRenderer) return;
    let animationKey = `${fromTile.row}-${fromTile.col}-${kind}`;
    if (toTile) animationKey += `-to-${toTile.row}-${toTile.col}`;
    if (this._activeTileIconKeys.has(animationKey)) return;
    const iconSrcMap = { power: "img/ui/icons/icon_power.png", heat: "img/ui/icons/icon_heat.png", vent: "img/ui/icons/icon_vent.png" };
    const src = iconSrcMap[kind];
    if (!src) return;
    const fromRect = this._tileFxRect(fromTile.row, fromTile.col);
    if (!fromRect) return;
    const iconSize = Math.max(12, Math.min(18, (ui.gridCanvasRenderer.getTileSize() / 3) | 0));
    const startOffset = kind === "power" ? { x: 6, y: -6 } : kind === "heat" ? { x: -6, y: 6 } : { x: 0, y: 0 };
    let left = fromRect.centerX - iconSize / 2 + startOffset.x;
    let top = fromRect.centerY - iconSize / 2 + startOffset.y;
    let fadeOut = !toTile;
    if (toTile) {
      const endRect = this._tileFxRect(toTile.row, toTile.col);
      if (endRect) {
        left = endRect.centerX - iconSize / 2;
        top = endRect.centerY - iconSize / 2;
        fadeOut = kind === "heat";
      }
    }
    this._activeTileIconKeys.add(animationKey);
    this._enqueueTileFx({
      id: animationKey,
      kind,
      src,
      size: iconSize,
      left,
      top,
      fadeOut,
      durationMs: 300,
    });
  }

  blinkVent(tile) {
    const ui = this.ui;
    if (!tile || !ui.gridCanvasRenderer) return;
    const ventKey = `${tile.row},${tile.col}`;
    if (this._activeVentRotors.has(ventKey)) return;
    const rect = this._tileFxRect(tile.row, tile.col);
    if (!rect) return;
    const inset = 0.2;
    const size = 0.6;
    const rotorW = rect.width * size;
    const rotorH = rect.height * size;
    const bgImage = tile?.part?.getImagePath?.() ?? "";
    this._activeVentRotors.add(ventKey);
    this._enqueueTileFx({
      id: `vent-${ventKey}-${Date.now()}`,
      fxType: "vent",
      ventKey,
      left: rect.left + rect.width * inset,
      top: rect.top + rect.height * inset,
      width: rotorW,
      height: rotorH,
      bgImage,
      durationMs: 300,
    });
  }

  _cleanupVentRotor(tile) {
    safeCall(() => {
      if (tile) this._activeVentRotors.delete(`${tile.row},${tile.col}`);
    }, "vent rotor cleanup");
  }

  clearAllActiveAnimations() {
    this._activeVentRotors.clear();
    this._activeTileIconKeys.clear();
    const host = this._ensureTileFxHost();
    if (host) render(html``, host);
  }

  getAnimationStatus() {
    return {
      activeVentRotors: this._activeVentRotors.size,
      activeTileIcons: this._activeTileIconKeys.size,
      totalActiveAnimations: this._activeVentRotors.size + this._activeTileIconKeys.size,
    };
  }

  clearReactorHeat() {
    const ui = this.ui;
    if (!ui.game || !ui.game.reactor) return;

    try {
      ui.game.reactor.current_heat = 0;

      if (ui.game.tileset && ui.game.tileset.active_tiles_list) {
        ui.game.tileset.active_tiles_list.forEach(tile => {
          if (tile.heat_contained !== undefined) {
            tile.heat_contained = 0;
          }
          if (tile.heat !== undefined) {
            tile.heat = 0;
          }
          if (tile.display_heat !== undefined) {
            tile.display_heat = 0;
          }
        });
      }

      if (ui.game?.state) {
        setDecimal(ui.game.state, "current_heat", 0);
        ui.game.state.stats_heat_generation = 0;
      }

      this.clearAllActiveAnimations();

      logger.log('debug', 'ui', 'Reactor heat cleared!');
    } catch (error) {
      logger.log('error', 'ui', 'Error clearing reactor heat:', error);
    }
  }

  pulseReflector(fromTile, toTile) {
    const ui = this.ui;
    safeCall(() => {
      if (!fromTile || !toTile || !ui.gridCanvasRenderer) return;
      const container = getPageReactorBackground(ui);
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const fromRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const toRect = ui.gridCanvasRenderer.getTileRectInContainer(toTile.row, toTile.col, cRect);
      const x1 = fromRect.centerX;
      const y1 = fromRect.centerY;
      const x2 = toRect.centerX;
      const y2 = toRect.centerY;
      const size = 12;
      const aura = document.createElement('div');
      aura.className = 'reflector-aura';
      const angle = Math.atan2(y2 - y1, x2 - x1) * 180 / Math.PI;
      aura.style.left = `${x1 - size / 2}px`;
      aura.style.top = `${y1 - size / 2}px`;
      aura.style.width = `${size}px`;
      aura.style.height = `${size}px`;
      aura.style.transform = `rotate(${angle}deg)`;
      container.appendChild(aura);
      requestAnimationFrame(() => aura.classList.add('active'));
      setTimeout(() => aura.remove(), 450);
    }, "pulseReflector");
  }

  emitEP(fromTile) {
    const ui = this.ui;
    safeCall(() => {
      if (!fromTile || !ui.gridCanvasRenderer) return;
      const container = getPageReactorBackground(ui);
      if (!container) return;
      const cRect = container.getBoundingClientRect();
      const startRect = ui.gridCanvasRenderer.getTileRectInContainer(fromTile.row, fromTile.col, cRect);
      const src = 'img/ui/icons/icon_power.png';
      const img = document.createElement('img');
      img.src = src;
      img.alt = 'ep';
      img.className = 'tile-fx fx-ep';
      const size = 14;
      img.style.width = `${size}px`;
      img.style.height = `${size}px`;
      const startLeft = startRect.centerX - size / 2;
      const startTop = startRect.centerY - size / 2;
      img.style.left = `${startLeft}px`;
      img.style.top = `${startTop}px`;
      container.appendChild(img);
      const epEl = getUiElement(ui, "info_ep_desktop") || getUiElement(ui, "info_ep");
      const valueEl = getUiElement(ui, "info_ep_value_desktop") || getUiElement(ui, "info_ep_value");
      const targetEl = valueEl || epEl;
      requestAnimationFrame(() => {
        if (targetEl) {
          const tRect = targetEl.getBoundingClientRect();
          const endLeft = tRect.left - cRect.left + tRect.width / 2 - size / 2;
          const endTop = tRect.top - cRect.top + tRect.height / 2 - size / 2;
          img.style.left = `${endLeft}px`;
          img.style.top = `${endTop}px`;
          img.style.opacity = '0.2';
        } else {
          img.classList.add('fx-fade-out');
        }
        setTimeout(() => img.remove(), 550);
      });
    }, "emitEP");
  }
}


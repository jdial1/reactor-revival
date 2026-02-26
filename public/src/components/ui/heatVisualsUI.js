import { preferences } from "../../core/preferencesStore.js";

export class HeatVisualsUI {
  constructor(ui) {
    this.ui = ui;
    this._overlay = null;
    this._heatFlowOverlay = null;
    this._timeFluxSimOverlay = null;
    this._timeFluxSimLabel = null;
    this._timeFluxSimFill = null;
  }

  _ensureOverlay() {
    const ui = this.ui;
    if (this._overlay && this._overlay.parentElement) return this._overlay;
    const reactorWrapper = ui.DOMElements.reactor_wrapper || document.getElementById('reactor_wrapper');
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
    this._overlay = overlay;
    return overlay;
  }

  _ensureHeatFlowOverlay() {
    const overlay = this._ensureOverlay();
    if (!overlay) return null;
    if (this._heatFlowOverlay && this._heatFlowOverlay.parentElement) return this._heatFlowOverlay;
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("class", "heat-flow-overlay");
    svg.setAttribute("width", "100%");
    svg.setAttribute("height", "100%");
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";
    overlay.appendChild(svg);
    this._heatFlowOverlay = svg;
    return svg;
  }

  _ensureTimeFluxSimulationOverlay() {
    const ui = this.ui;
    if (this._timeFluxSimOverlay && this._timeFluxSimOverlay.parentElement) return this._timeFluxSimOverlay;
    if (typeof document === "undefined" || !document.body) return null;
    const overlay = document.createElement("div");
    overlay.className = "time-flux-sim-overlay";
    const panel = document.createElement("div");
    panel.className = "time-flux-sim-panel";
    const label = document.createElement("div");
    label.className = "time-flux-sim-label";
    label.textContent = "Simulating... 0%";
    const bar = document.createElement("div");
    bar.className = "time-flux-sim-bar";
    const fill = document.createElement("div");
    fill.className = "time-flux-sim-fill";
    bar.appendChild(fill);
    panel.appendChild(label);
    panel.appendChild(bar);
    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    this._timeFluxSimOverlay = overlay;
    this._timeFluxSimLabel = label;
    this._timeFluxSimFill = fill;
    return overlay;
  }

  updateTimeFluxSimulation(progressPercent, active) {
    const overlay = this._ensureTimeFluxSimulationOverlay();
    if (!overlay) return;
    if (!active) {
      overlay.style.display = "none";
      return;
    }
    overlay.style.display = "flex";
    const pct = Math.max(0, Math.min(100, Math.round(progressPercent || 0)));
    if (this._timeFluxSimLabel) this._timeFluxSimLabel.textContent = `Simulating... ${pct}%`;
    if (this._timeFluxSimFill) this._timeFluxSimFill.style.width = `${pct}%`;
  }

  _tileCenterToOverlayPosition(row, col) {
    const ui = this.ui;
    const overlay = this._ensureOverlay();
    if (!overlay) return { x: 0, y: 0 };
    const tileSize = ui.gridCanvasRenderer?.getTileSize() ?? (parseInt(getComputedStyle(ui.DOMElements.reactor || document.body).getPropertyValue('--tile-size'), 10) || 48);
    const reactorEl = ui.gridCanvasRenderer?.getCanvas() || ui.DOMElements.reactor;
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
    const svg = this._ensureHeatFlowOverlay();
    if (!svg) return;
    if (!enabled) {
      svg.style.display = "none";
      return;
    }
    svg.style.display = "";
    const rect = overlay.getBoundingClientRect();
    const w = Math.max(1, rect.width);
    const h = Math.max(1, rect.height);
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.innerHTML = "";
    const engine = ui.game?.engine;
    if (!engine || typeof engine.getLastHeatFlowVectors !== "function") return;
    const vectors = engine.getLastHeatFlowVectors();
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i];
      const from = this._tileCenterToOverlayPosition(v.fromRow, v.fromCol);
      const to = this._tileCenterToOverlayPosition(v.toRow, v.toCol);
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const len = Math.hypot(dx, dy);
      if (len < 2) continue;
      const ux = dx / len;
      const uy = dy / len;
      const headLen = 8;
      const endX = to.x - ux * headLen;
      const endY = to.y - uy * headLen;
      const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", from.x);
      line.setAttribute("y1", from.y);
      line.setAttribute("x2", endX);
      line.setAttribute("y2", endY);
      line.setAttribute("stroke", "rgba(255,120,40,0.9)");
      line.setAttribute("stroke-width", "2");
      svg.appendChild(line);
      const ax = ux * headLen;
      const ay = uy * headLen;
      const perp = 4;
      const px = -uy * perp;
      const py = ux * perp;
      const poly = document.createElementNS("http://www.w3.org/2000/svg", "polygon");
      poly.setAttribute("points", `${to.x},${to.y} ${to.x - ax + px},${to.y - ay + py} ${to.x - ax - px},${to.y - ay - py}`);
      poly.setAttribute("fill", "rgba(255,120,40,0.9)");
      svg.appendChild(poly);
    }
  }

  clearHeatWarningClasses() {
    const bg = this.ui.DOMElements.reactor_background || document.getElementById("reactor_background");
    if (bg) bg.classList.remove("heat-warning", "heat-critical");
  }

  updateHeatVisuals() {
    const ui = this.ui;
    const stateHeat = ui.stateManager.getVar("current_heat");
    const current = (stateHeat === null || stateHeat === undefined) ? ui.displayValues.heat.current : stateHeat;
    const max = ui.stateManager.getVar("max_heat") || 1;
    const background = ui.DOMElements.reactor_background;
    if (!background) return;

    const heatRatio = current / max;

    background.classList.remove("heat-warning", "heat-critical");

    if (heatRatio <= 0.5) {
      background.style.backgroundColor = "transparent";
    } else if (heatRatio <= 1.0) {
      const intensity = (heatRatio - 0.5) * 2;
      const alpha = Math.min(intensity * 0.2, 0.2);
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      if (heatRatio >= 0.8) {
        background.classList.add("heat-warning");
      }
    } else if (heatRatio <= 1.5) {
      const intensity = (heatRatio - 1.0) * 2;
      const alpha = 0.2 + (intensity * 0.3);
      background.style.backgroundColor = `rgba(255, 0, 0, ${alpha})`;

      background.classList.add("heat-warning");

      if (heatRatio >= 1.3) {
        background.classList.add("heat-critical");
      }
    } else {
      background.style.backgroundColor = "rgba(255, 0, 0, 0.5)";

      background.classList.add("heat-critical");
    }
  }
}
